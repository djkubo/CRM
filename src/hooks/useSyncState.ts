import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type SyncSource = "stripe" | "paypal" | "stripe_invoices" | "ghl" | "manychat";
export type SyncStateRow = {
  source: string;
  backfill_start: string | null;
  fresh_until: string | null;
  last_success_at: string | null;
  last_success_run_id: string | null;
  last_success_status: string | null;
  last_success_meta: Json;
  last_error_at: string | null;
  last_error_message: string | null;
  updated_at: string;
};

type SyncRunRow = {
  id: string;
  source: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  metadata: Json | null;
};

const KNOWN_SOURCES: SyncSource[] = ["stripe", "paypal", "stripe_invoices", "ghl", "manychat"];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

const toIso = (v: unknown): string | null => {
  if (v == null) return null;
  if (typeof v === "string") {
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    // Stripe may store unix seconds in metadata; normalize to ms.
    const ms = v > 1e12 ? v : v * 1000;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  return null;
};

const pickMetaDate = (meta: Record<string, unknown> | null, keys: string[]): string | null => {
  if (!meta) return null;
  for (const key of keys) {
    const iso = toIso(meta[key]);
    if (iso) return iso;
  }
  return null;
};

const SYNC_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

const buildSyncStateFromRuns = (runs: SyncRunRow[]): SyncStateRow[] => {
  const latestBySource = new Map<SyncSource, SyncRunRow>();
  const now = Date.now();

  for (const run of runs) {
    const source = run.source as SyncSource;
    if (!KNOWN_SOURCES.includes(source)) continue;

    // Include running status but detect zombies (running > 10 min)
    const isZombie = run.status === 'running' &&
      (now - Date.parse(run.started_at)) > SYNC_TIMEOUT_MS;

    if (isZombie) {
      // Treat zombie runs as failed
      run.status = 'failed';
      run.completed_at = new Date(Date.parse(run.started_at) + SYNC_TIMEOUT_MS).toISOString();
    }

    if (!["completed", "completed_with_errors", "skipped", "failed"].includes(run.status)) continue;

    const current = latestBySource.get(source);
    const runTs = Date.parse(run.completed_at ?? run.started_at);
    const currentTs = current ? Date.parse(current.completed_at ?? current.started_at) : -Infinity;
    if (!current || runTs > currentTs) {
      latestBySource.set(source, run);
    }
  }

  const fallbackRows: SyncStateRow[] = [];
  for (const source of KNOWN_SOURCES) {
    const run = latestBySource.get(source);
    if (!run) continue;

    const meta = isRecord(run.metadata) ? run.metadata : null;
    const completedAt = run.completed_at ?? run.started_at;
    const rangeStart = pickMetaDate(meta, ["rangeStart", "startDate", "originalStartDate", "backfillStart"]);
    const rangeEnd = pickMetaDate(meta, ["rangeEnd", "endDate", "originalEndDate", "freshUntil"]);

    const isFailedRun = run.status === 'failed';

    fallbackRows.push({
      source,
      backfill_start: rangeStart ?? completedAt,
      fresh_until: rangeEnd ?? completedAt,
      last_success_at: isFailedRun ? null : completedAt,
      last_success_run_id: isFailedRun ? null : run.id,
      last_success_status: run.status,
      last_success_meta: (run.metadata ?? {}) as Json,
      last_error_at: isFailedRun ? completedAt : null,
      last_error_message: isFailedRun ? 'Sync timed out (zombie detected)' : null,
      updated_at: completedAt,
    });
  }

  return fallbackRows;
};

async function loadSyncStateFallbackFromRuns(): Promise<SyncStateRow[]> {
  const { data, error } = await supabase
    .from("sync_runs")
    .select("id, source, status, started_at, completed_at, metadata")
    .in("source", KNOWN_SOURCES)
    .in("status", ["completed", "completed_with_errors", "skipped", "running"])
    .order("completed_at", { ascending: false, nullsFirst: false })
    .limit(400);

  if (error) return [];
  return buildSyncStateFromRuns((data ?? []) as SyncRunRow[]);
}

const isMissingSyncStateTable = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code?: unknown }).code) : "";
  const message = "message" in err ? String((err as { message?: unknown }).message) : "";
  const msg = message.toLowerCase();
  // Postgres undefined_table
  if (code === "42P01" || msg.includes('relation "sync_state" does not exist')) return true;
  // PostgREST schema cache miss (happens when migration not applied yet / cache not refreshed).
  if (code.toUpperCase().startsWith("PGRST") && msg.includes("schema cache") && msg.includes("sync_state")) return true;
  if (msg.includes("could not find the table") && msg.includes("sync_state")) return true;
  return false;
};

export function useSyncState() {
  return useQuery({
    queryKey: ["sync_state"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_state")
        .select(
          "source, backfill_start, fresh_until, last_success_at, last_success_run_id, last_success_status, last_success_meta, last_error_at, last_error_message, updated_at",
        );

      if (error) {
        // Allow gradual rollout where frontend might ship before the migration is applied.
        if (isMissingSyncStateTable(error)) return await loadSyncStateFallbackFromRuns();
        throw error;
      }

      const rows = (data ?? []) as SyncStateRow[];
      if (rows.length === 0) {
        return await loadSyncStateFallbackFromRuns();
      }

      // Fill missing sources from sync_runs when partial sync_state exists.
      const present = new Set(rows.map((r) => r.source));
      if (KNOWN_SOURCES.every((s) => present.has(s))) return rows;

      const fallback = await loadSyncStateFallbackFromRuns();
      if (fallback.length === 0) return rows;

      const merged: SyncStateRow[] = [...rows];
      for (const f of fallback) {
        if (!present.has(f.source)) merged.push(f);
      }
      return merged;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function indexSyncState(rows: SyncStateRow[] | undefined | null): Partial<Record<SyncSource, SyncStateRow>> {
  const map: Partial<Record<SyncSource, SyncStateRow>> = {};
  for (const row of rows ?? []) {
    // Narrow known sources only; keep unknowns out of the typed record.
    if (
      row.source === "stripe" ||
      row.source === "paypal" ||
      row.source === "stripe_invoices" ||
      row.source === "ghl" ||
      row.source === "manychat"
    ) {
      map[row.source] = row;
    }
  }
  return map;
}
