
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";

let env = {};
try {
    env = await load({ envPath: "/Users/gustavogarcia/Documents/ANTIGRAVITY/CRM/admin-hub/.env" });
} catch (e) {
    // console.log("Could not load .env file");
}

const SUPABASE_URL = env["VITE_SUPABASE_URL"] || Deno.env.get("VITE_SUPABASE_URL");
const SUPABASE_KEY = env["VITE_SUPABASE_PUBLISHABLE_KEY"] || Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY");
const SUPABASE_SERVICE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"] || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const key = SUPABASE_SERVICE_KEY || SUPABASE_KEY;

if (!SUPABASE_URL || !key) {
    console.error("❌ Missing creds");
    Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, key);

console.log("🔍 Checking Transactions & KPIs...");

// 1. Check raw transactions for "today" (UTC & Mexico comparison)
const now = new Date();
const startOfTodayUTC = new Date(now.toISOString().split('T')[0] + 'T00:00:00Z').toISOString();

console.log(`Checking transactions created >= ${startOfTodayUTC} (UTC day start implied)`);

const { data: rawTx, error: rawError, count } = await supabase
    .from('transactions')
    .select('id, amount, currency, status, stripe_created_at, created_at', { count: 'exact' })
    .gte('stripe_created_at', startOfTodayUTC)
    .limit(5);

if (rawError) {
    console.error("❌ Error raw tx:", rawError);
} else {
    console.log(`✅ Found ${count} raw transactions today (UTC). Sample:`, rawTx);
}

// 2. Call kpi_sales('today') directly
const { data: kpiData, error: kpiError } = await supabase.rpc('kpi_sales', { p_range: 'today' });

if (kpiError) {
    console.error("❌ Error kpi_sales:", kpiError);
} else {
    console.log("✅ kpi_sales('today') result:", kpiData);
}

// 3. Call kpi_failed_payments('today')
const { data: failData, error: failError } = await supabase.rpc('kpi_failed_payments', { p_range: 'today' });
if (failError) {
    console.error("❌ Error kpi_failed_payments:", failError);
} else {
    console.log("✅ kpi_failed_payments('today') result:", failData);
}
