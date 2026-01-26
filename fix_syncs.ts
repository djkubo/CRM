
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";

// Try to load from .env, but also use process environment if available
let env = {};
try {
    env = await load({ envPath: "/Users/gustavogarcia/Documents/ANTIGRAVITY/CRM/admin-hub/.env" });
} catch (e) {
    console.log("Could not load .env file, checking environment variables...");
}

const SUPABASE_URL = env["VITE_SUPABASE_URL"] || Deno.env.get("VITE_SUPABASE_URL");
const SUPABASE_KEY = env["VITE_SUPABASE_PUBLISHABLE_KEY"] || Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY");
const SUPABASE_SERVICE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"] || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Use service key if available for admin privileges, otherwise anon key depends on RLS/RPC permissions
const keyToUse = SUPABASE_SERVICE_KEY || SUPABASE_KEY;

if (!SUPABASE_URL || !keyToUse) {
    console.error("❌ Missing Supabase credentials. URL:", SUPABASE_URL, "Key present:", !!keyToUse);
    Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, keyToUse);

console.log("🔄 Resetting stuck syncs...");

// Call the RPC function we saw in the migration
const { data, error } = await supabase.rpc('reset_stuck_syncs', { p_timeout_minutes: 0 }); // 0 to reset ALL currently running stuff regardless of time

if (error) {
    console.error("❌ Error resetting syncs:", error);
} else {
    console.log("✅ Syncs reset successfully.");
    console.log("Result:", data);
}
