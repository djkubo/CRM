
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import "https://deno.land/std@0.208.0/dotenv/load.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing env vars");
    Deno.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function resetSyncs() {
    console.log("🔥 Force resetting ALL running syncs...");

    const { data, error } = await supabase
        .from('sync_runs')
        .update({
            status: 'failed',
            error_message: 'Manual emergency reset',
            completed_at: new Date().toISOString()
        })
        .in('status', ['running', 'continuing'])
        .select();

    if (error) {
        console.error("❌ Error resetting syncs:", error);
    } else {
        console.log(`✅ Reset ${data.length} stuck sync runs.`);
    }

    // Also clean up any lingering 'test' runs
    const { data: testRuns } = await supabase
        .from('sync_runs')
        .delete()
        .eq('source', 'test_source')
        .select();

    if (testRuns?.length) console.log(`Deleted ${testRuns.length} test runs.`);
}

resetSyncs();
