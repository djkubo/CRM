import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type SyncSource = "stripe" | "paypal" | "stripe_invoices" | "ghl" | "manychat";
export type SyncStateRow = Database["public"]["Tables"]["sync_state"]["Row"];

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
          "source, backfill_start, fresh_until, last_success_at, last_success_status, last_success_meta, last_error_at, last_error_message, updated_at",
        );

      if (error) {
        // Allow gradual rollout where frontend might ship before the migration is applied.
        if (isMissingSyncStateTable(error)) return [] as SyncStateRow[];
        throw error;
      }

      return (data ?? []) as SyncStateRow[];
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
