// Shared helper for persistent sync coverage + freshness state.
// Edge Functions write here on success/failure so the UI can show "what's already synced"
// even after sync_runs retention cleanup.

// deno-lint-ignore no-explicit-any
type SupabaseLike = { from: (table: string) => any };

export type SyncStateRow = {
  source: string;
  backfill_start: string | null;
  fresh_until: string | null;
  last_success_at: string | null;
  last_success_run_id: string | null;
  last_success_status: string | null;
  // deno-lint-ignore no-explicit-any
  last_success_meta: Record<string, any> | null;
  last_error_at: string | null;
  last_error_message: string | null;
  updated_at: string;
};

function parseTsMs(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function toIso(value: unknown): string | null {
  const ms = parseTsMs(value);
  return ms === null ? null : new Date(ms).toISOString();
}

function minIso(a: unknown, b: unknown): string | null {
  const ams = parseTsMs(a);
  const bms = parseTsMs(b);
  if (ams === null) return toIso(b);
  if (bms === null) return toIso(a);
  return new Date(Math.min(ams, bms)).toISOString();
}

function maxIso(a: unknown, b: unknown): string | null {
  const ams = parseTsMs(a);
  const bms = parseTsMs(b);
  if (ams === null) return toIso(b);
  if (bms === null) return toIso(a);
  return new Date(Math.max(ams, bms)).toISOString();
}

function isMissingRelationError(error: unknown): boolean {
  // Postgres: undefined_table = 42P01
  const msg =
    error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message) : "";
  const code =
    error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : "";
  const lower = msg.toLowerCase();
  if (code === "42P01" || lower.includes('relation "sync_state" does not exist')) return true;
  // PostgREST schema cache miss.
  if (code.toUpperCase().startsWith("PGRST") && lower.includes("schema cache") && lower.includes("sync_state")) return true;
  if (lower.includes("could not find the table") && lower.includes("sync_state")) return true;
  return false;
}

export async function readSyncState(supabase: SupabaseLike, source: string): Promise<SyncStateRow | null> {
  try {
    const { data, error } = await supabase
      .from("sync_state")
      .select(
        "source, backfill_start, fresh_until, last_success_at, last_success_run_id, last_success_status, last_success_meta, last_error_at, last_error_message, updated_at",
      )
      .eq("source", source)
      .maybeSingle();

    if (error) {
      if (isMissingRelationError(error)) return null;
      console.warn("[sync_state] read failed", { source, error: (error as { message?: string })?.message ?? String(error) });
      return null;
    }

    return (data ?? null) as SyncStateRow | null;
  } catch (err) {
    if (isMissingRelationError(err)) return null;
    console.warn("[sync_state] read exception", { source, error: String(err) });
    return null;
  }
}

export async function writeSyncStateSuccess(args: {
  supabase: SupabaseLike;
  source: string;
  runId?: string | null;
  status?: string | null;
  // deno-lint-ignore no-explicit-any
  meta?: Record<string, any>;
  rangeStart?: string | null;
  rangeEnd?: string | null;
}): Promise<SyncStateRow | null> {
  const { supabase, source, runId, status, meta, rangeStart, rangeEnd } = args;

  try {
    const existing = await readSyncState(supabase, source);

    const mergedBackfillStart = rangeStart ? minIso(existing?.backfill_start, rangeStart) : (existing?.backfill_start ?? null);
    const mergedFreshUntil = rangeEnd ? maxIso(existing?.fresh_until, rangeEnd) : (existing?.fresh_until ?? null);

    const payload = {
      source,
      backfill_start: mergedBackfillStart,
      fresh_until: mergedFreshUntil,
      last_success_at: new Date().toISOString(),
      last_success_run_id: runId ?? null,
      last_success_status: status ?? "completed",
      last_success_meta: meta ?? {},
      last_error_at: null,
      last_error_message: null,
    };

    const { data, error } = await supabase
      .from("sync_state")
      .upsert(payload, { onConflict: "source" })
      .select(
        "source, backfill_start, fresh_until, last_success_at, last_success_run_id, last_success_status, last_success_meta, last_error_at, last_error_message, updated_at",
      )
      .single();

    if (error) {
      if (isMissingRelationError(error)) return null;
      console.warn("[sync_state] write success failed", { source, error: (error as { message?: string })?.message ?? String(error) });
      return null;
    }

    return (data ?? null) as SyncStateRow | null;
  } catch (err) {
    if (isMissingRelationError(err)) return null;
    console.warn("[sync_state] write success exception", { source, error: String(err) });
    return null;
  }
}

export async function writeSyncStateError(args: {
  supabase: SupabaseLike;
  source: string;
  errorMessage: string;
}): Promise<SyncStateRow | null> {
  const { supabase, source, errorMessage } = args;

  try {
    const existing = await readSyncState(supabase, source);

    const payload = {
      source,
      backfill_start: existing?.backfill_start ?? null,
      fresh_until: existing?.fresh_until ?? null,
      last_success_at: existing?.last_success_at ?? null,
      last_success_run_id: existing?.last_success_run_id ?? null,
      last_success_status: existing?.last_success_status ?? null,
      last_success_meta: existing?.last_success_meta ?? {},
      last_error_at: new Date().toISOString(),
      last_error_message: errorMessage,
    };

    const { data, error } = await supabase
      .from("sync_state")
      .upsert(payload, { onConflict: "source" })
      .select(
        "source, backfill_start, fresh_until, last_success_at, last_success_run_id, last_success_status, last_success_meta, last_error_at, last_error_message, updated_at",
      )
      .single();

    if (error) {
      if (isMissingRelationError(error)) return null;
      console.warn("[sync_state] write error failed", { source, error: (error as { message?: string })?.message ?? String(error) });
      return null;
    }

    return (data ?? null) as SyncStateRow | null;
  } catch (err) {
    if (isMissingRelationError(err)) return null;
    console.warn("[sync_state] write error exception", { source, error: String(err) });
    return null;
  }
}
