import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CleanupResult {
  sync_runs_deleted: number;
  csv_import_runs_deleted: number;
  csv_imports_raw_deleted: number;
  ghl_contacts_raw_deleted: number;
  manychat_contacts_raw_deleted: number;
  merge_conflicts_deleted: number;
  errors: string[];
}

// ============= SECURITY =============

function decodeJwtPayload(token: string): { sub?: string; exp?: number } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1]));
  } catch {
    return null;
  }
}

async function verifyAdminOrServiceRole(req: Request): Promise<{ valid: boolean; isServiceRole: boolean; error?: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { valid: false, isServiceRole: false, error: "Missing Authorization header" };
  }

  const token = authHeader.replace("Bearer ", "");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  // Allow service_role key for automation.
  if (serviceRoleKey && token === serviceRoleKey) {
    return { valid: true, isServiceRole: true };
  }

  const claims = decodeJwtPayload(token);
  if (!claims?.sub) {
    return { valid: false, isServiceRole: false, error: "Invalid token format" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (claims.exp && now >= claims.exp) {
    return { valid: false, isServiceRole: false, error: "Token expired" };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: isAdmin, error } = await supabase.rpc("is_admin");
  if (error) {
    return { valid: false, isServiceRole: false, error: `Auth check failed: ${error.message}` };
  }
  if (!isAdmin) {
    return { valid: false, isServiceRole: false, error: "Not an admin" };
  }

  return { valid: true, isServiceRole: false };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // This function is destructive (deletes data). Only admins/service_role may run it.
  const auth = await verifyAdminOrServiceRole(req);
  if (!auth.valid) {
    return new Response(
      JSON.stringify({ success: false, error: "Forbidden", message: auth.error }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log("[cleanup-logs] Starting cleanup process...");

  const result: CleanupResult = {
    sync_runs_deleted: 0,
    csv_import_runs_deleted: 0,
    csv_imports_raw_deleted: 0,
    ghl_contacts_raw_deleted: 0,
    manychat_contacts_raw_deleted: 0,
    merge_conflicts_deleted: 0,
    errors: [],
  };

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoffDate = sevenDaysAgo.toISOString();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const rawCutoffDate = thirtyDaysAgo.toISOString();

  try {
    // ============================================
    // 1. CLEANUP sync_runs - Keep last successful per source
    // ============================================
    console.log("[cleanup-logs] Cleaning sync_runs older than 7 days...");

    // First, get the IDs of the last successful run per source (to preserve)
    const { data: lastSuccessful, error: lastSuccessfulError } = await supabase
      .from("sync_runs")
      .select("id, source")
      .eq("status", "completed")
      .order("started_at", { ascending: false });

    if (lastSuccessfulError) {
      console.error("[cleanup-logs] Error fetching last successful runs:", lastSuccessfulError);
      result.errors.push(`sync_runs fetch error: ${lastSuccessfulError.message}`);
    }

    // Get unique last successful ID per source
    const preserveIds = new Set<string>();
    const seenSources = new Set<string>();
    
    if (lastSuccessful) {
      for (const run of lastSuccessful) {
        if (!seenSources.has(run.source)) {
          seenSources.add(run.source);
          preserveIds.add(run.id);
          console.log(`[cleanup-logs] Preserving last successful run for ${run.source}: ${run.id}`);
        }
      }
    }

    // Delete old sync_runs except preserved ones.
    // NOTE: merge_conflicts has an FK to sync_runs (merge_conflicts.sync_run_id). If we try to delete a run
    // that still has conflicts referencing it, Postgres will reject the delete. So we detach conflicts first.
    const preserveIdList = Array.from(preserveIds);
    const preserveFilter = preserveIdList.length > 0 ? `(${preserveIdList.join(",")})` : null;

    let deletedSyncRunsTotal = 0;
    const batchSize = 200;
    for (;;) {
      let q = supabase
        .from("sync_runs")
        .select("id")
        .lt("started_at", cutoffDate)
        .limit(batchSize);

      if (preserveFilter) {
        q = q.not("id", "in", preserveFilter);
      }

      const { data: batch, error: fetchBatchError } = await q;
      if (fetchBatchError) {
        console.error("[cleanup-logs] Error listing sync_runs for deletion:", fetchBatchError);
        result.errors.push(`sync_runs list error: ${fetchBatchError.message}`);
        break;
      }

      const ids = (batch || []).map((r: any) => r.id).filter(Boolean) as string[];
      if (ids.length === 0) break;

      // Detach conflicts referencing these runs so the delete won't violate FK constraints.
      const { error: detachError } = await supabase
        .from("merge_conflicts")
        .update({ sync_run_id: null })
        .in("sync_run_id", ids);
      if (detachError) {
        console.error("[cleanup-logs] Error detaching merge_conflicts from sync_runs:", detachError);
        result.errors.push(`merge_conflicts detach error: ${detachError.message}`);
        break;
      }

      const { data: deletedSyncRuns, error: syncRunsError } = await supabase
        .from("sync_runs")
        .delete()
        .in("id", ids)
        .select("id");

      if (syncRunsError) {
        console.error("[cleanup-logs] Error deleting sync_runs:", syncRunsError);
        result.errors.push(`sync_runs delete error: ${syncRunsError.message}`);
        break;
      }

      deletedSyncRunsTotal += deletedSyncRuns?.length || 0;
      console.log(`[cleanup-logs] Deleted ${deletedSyncRuns?.length || 0} sync_runs (running total: ${deletedSyncRunsTotal})`);
    }

    result.sync_runs_deleted = deletedSyncRunsTotal;
    console.log(`[cleanup-logs] Deleted ${result.sync_runs_deleted} sync_runs`);

    // ============================================
    // 2. CLEANUP csv_import_runs (completed ones older than 30 days)
    // ============================================
    console.log("[cleanup-logs] Cleaning csv_import_runs older than 30 days...");

    // First delete related csv_imports_raw records
    const { data: oldImportRuns } = await supabase
      .from("csv_import_runs")
      .select("id")
      .lt("started_at", rawCutoffDate)
      .in("status", ["completed", "failed"]);

    if (oldImportRuns && oldImportRuns.length > 0) {
      const oldImportIds = oldImportRuns.map(r => r.id);

      // Delete raw import data first (FK constraint)
      const { data: deletedRaw, error: rawError } = await supabase
        .from("csv_imports_raw")
        .delete()
        .in("import_id", oldImportIds)
        .select("id");

      if (rawError) {
        console.error("[cleanup-logs] Error deleting csv_imports_raw:", rawError);
        result.errors.push(`csv_imports_raw delete error: ${rawError.message}`);
      } else {
        result.csv_imports_raw_deleted = deletedRaw?.length || 0;
        console.log(`[cleanup-logs] Deleted ${result.csv_imports_raw_deleted} csv_imports_raw`);
      }

      // Now delete the import runs
      const { data: deletedImportRuns, error: importRunsError } = await supabase
        .from("csv_import_runs")
        .delete()
        .in("id", oldImportIds)
        .select("id");

      if (importRunsError) {
        console.error("[cleanup-logs] Error deleting csv_import_runs:", importRunsError);
        result.errors.push(`csv_import_runs delete error: ${importRunsError.message}`);
      } else {
        result.csv_import_runs_deleted = deletedImportRuns?.length || 0;
        console.log(`[cleanup-logs] Deleted ${result.csv_import_runs_deleted} csv_import_runs`);
      }
    }

    // ============================================
    // 3. CLEANUP ghl_contacts_raw (processed ones older than 30 days)
    // ============================================
    console.log("[cleanup-logs] Cleaning ghl_contacts_raw older than 30 days...");

    const { data: deletedGhl, error: ghlError } = await supabase
      .from("ghl_contacts_raw")
      .delete()
      .lt("fetched_at", rawCutoffDate)
      .not("processed_at", "is", null)
      .select("id");

    if (ghlError) {
      console.error("[cleanup-logs] Error deleting ghl_contacts_raw:", ghlError);
      result.errors.push(`ghl_contacts_raw delete error: ${ghlError.message}`);
    } else {
      result.ghl_contacts_raw_deleted = deletedGhl?.length || 0;
      console.log(`[cleanup-logs] Deleted ${result.ghl_contacts_raw_deleted} ghl_contacts_raw`);
    }

    // ============================================
    // 4. CLEANUP manychat_contacts_raw (processed ones older than 30 days)
    // ============================================
    console.log("[cleanup-logs] Cleaning manychat_contacts_raw older than 30 days...");

    const { data: deletedManychat, error: manychatError } = await supabase
      .from("manychat_contacts_raw")
      .delete()
      .lt("fetched_at", rawCutoffDate)
      .not("processed_at", "is", null)
      .select("id");

    if (manychatError) {
      console.error("[cleanup-logs] Error deleting manychat_contacts_raw:", manychatError);
      result.errors.push(`manychat_contacts_raw delete error: ${manychatError.message}`);
    } else {
      result.manychat_contacts_raw_deleted = deletedManychat?.length || 0;
      console.log(`[cleanup-logs] Deleted ${result.manychat_contacts_raw_deleted} manychat_contacts_raw`);
    }

    // ============================================
    // 5. CLEANUP merge_conflicts (resolved ones older than 30 days)
    // ============================================
    console.log("[cleanup-logs] Cleaning resolved merge_conflicts older than 30 days...");

    const { data: deletedConflicts, error: conflictsError } = await supabase
      .from("merge_conflicts")
      .delete()
      .lt("created_at", rawCutoffDate)
      .eq("status", "resolved")
      .select("id");

    if (conflictsError) {
      console.error("[cleanup-logs] Error deleting merge_conflicts:", conflictsError);
      result.errors.push(`merge_conflicts delete error: ${conflictsError.message}`);
    } else {
      result.merge_conflicts_deleted = deletedConflicts?.length || 0;
      console.log(`[cleanup-logs] Deleted ${result.merge_conflicts_deleted} merge_conflicts`);
    }

    const totalDeleted = 
      result.sync_runs_deleted +
      result.csv_import_runs_deleted +
      result.csv_imports_raw_deleted +
      result.ghl_contacts_raw_deleted +
      result.manychat_contacts_raw_deleted +
      result.merge_conflicts_deleted;

    console.log(`[cleanup-logs] Cleanup complete. Total records deleted: ${totalDeleted}`);

    return new Response(
      JSON.stringify({
        success: result.errors.length === 0,
        message: `Cleanup complete. Deleted ${totalDeleted} records.`,
        details: result,
        preserved_sources: Array.from(seenSources),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[cleanup-logs] Unexpected error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        details: result,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
