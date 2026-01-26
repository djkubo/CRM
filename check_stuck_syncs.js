
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkSyncRuns() {
    console.log('🔄 Checking sync_runs table...');
    const { data, error } = await supabase
        .from('sync_runs')
        .select('*')
        .in('status', ['running', 'continuing'])
        .order('started_at', { ascending: false });

    if (error) {
        console.error('❌ Error fetching sync_runs:', error);
        return;
    }

    if (data.length === 0) {
        console.log('✅ No active sync runs found.');
    } else {
        console.log(`⚠️  Found ${data.length} stuck/active sync runs:`);
        data.forEach(run => {
            console.log(`- ID: ${run.id}, Source: ${run.source}, Status: ${run.status}, Started: ${run.started_at}`);
        });
    }
}

checkSyncRuns();
