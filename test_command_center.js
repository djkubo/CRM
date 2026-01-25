/**
 * Command Center Diagnostic Script
 * Tests sync functions and metrics accuracy
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============= TESTS =============

async function testDashboardMetrics() {
  console.log('\n📊 Testing dashboard_metrics RPC...');
  
  const { data, error } = await supabase.rpc('dashboard_metrics');
  
  if (error) {
    console.error('❌ Error:', error);
    return false;
  }
  
  const row = Array.isArray(data) ? data[0] : data;
  console.log('✅ Metrics retrieved:');
  console.log('  - Sales Today USD:', (row?.sales_today_usd || 0) / 100);
  console.log('  - Sales Today MXN:', (row?.sales_today_mxn || 0) / 100);
  console.log('  - Sales Month USD:', (row?.sales_month_usd || 0) / 100);
  console.log('  - Sales Month MXN:', (row?.sales_month_mxn || 0) / 100);
  console.log('  - Trial Count:', row?.trial_count || 0);
  console.log('  - Converted Count:', row?.converted_count || 0);
  console.log('  - Churn Count:', row?.churn_count || 0);
  console.log('  - Lead Count:', row?.lead_count || 0);
  console.log('  - Customer Count:', row?.customer_count || 0);
  console.log('  - Recovery List Items:', (row?.recovery_list || []).length);
  
  return true;
}

async function testTransactionsQuery() {
  console.log('\n💳 Testing transactions query...');
  
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  
  const { data, error, count } = await supabase
    .from('transactions')
    .select('*', { count: 'exact' })
    .in('status', ['paid', 'succeeded'])
    .gte('stripe_created_at', startOfToday.toISOString());
  
  if (error) {
    console.error('❌ Error:', error);
    return false;
  }
  
  console.log(`✅ Found ${count} paid transactions today`);
  
  if (data && data.length > 0) {
    const totalUSD = data
      .filter(t => t.currency !== 'mxn')
      .reduce((sum, t) => sum + t.amount, 0) / 100;
    const totalMXN = data
      .filter(t => t.currency === 'mxn')
      .reduce((sum, t) => sum + t.amount, 0) / 100;
    
    console.log('  - Total USD:', totalUSD);
    console.log('  - Total MXN:', totalMXN);
  }
  
  return true;
}

async function testSyncRuns() {
  console.log('\n🔄 Testing sync_runs table...');
  
  const { data, error } = await supabase
    .from('sync_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(5);
  
  if (error) {
    console.error('❌ Error:', error);
    return false;
  }
  
  console.log(`✅ Found ${data?.length || 0} recent sync runs:`);
  data?.forEach((run, i) => {
    console.log(`  ${i + 1}. ${run.source} - ${run.status} (${run.total_fetched || 0} records)`);
    console.log(`     Started: ${new Date(run.started_at).toLocaleString()}`);
    if (run.completed_at) {
      console.log(`     Completed: ${new Date(run.completed_at).toLocaleString()}`);
    }
  });
  
  return true;
}

async function testClientsLifecycle() {
  console.log('\n👥 Testing clients lifecycle stages...');
  
  const { data, error } = await supabase
    .from('clients')
    .select('lifecycle_stage');
  
  if (error) {
    console.error('❌ Error:', error);
    return false;
  }
  
  const stages = {};
  data?.forEach(client => {
    const stage = client.lifecycle_stage || 'NULL';
    stages[stage] = (stages[stage] || 0) + 1;
  });
  
  console.log('✅ Lifecycle distribution:');
  Object.entries(stages).forEach(([stage, count]) => {
    console.log(`  - ${stage}: ${count}`);
  });
  
  return true;
}

async function testFailedTransactions() {
  console.log('\n⚠️  Testing failed transactions...');
  
  const { data, error } = await supabase
    .from('transactions')
    .select('customer_email, amount, currency, failure_code')
    .eq('status', 'failed')
    .limit(10);
  
  if (error) {
    console.error('❌ Error:', error);
    return false;
  }
  
  console.log(`✅ Found ${data?.length || 0} failed transactions (showing first 10):`);
  data?.forEach((tx, i) => {
    console.log(`  ${i + 1}. ${tx.customer_email} - $${tx.amount / 100} ${tx.currency} - ${tx.failure_code || 'no code'}`);
  });
  
  return true;
}

// ============= MAIN =============

async function runDiagnostics() {
  console.log('🔍 Command Center Diagnostics');
  console.log('================================');
  
  const tests = [
    testDashboardMetrics,
    testTransactionsQuery,
    testSyncRuns,
    testClientsLifecycle,
    testFailedTransactions,
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      const result = await test();
      if (result) passed++;
      else failed++;
    } catch (e) {
      console.error('❌ Test crashed:', e.message);
      failed++;
    }
  }
  
  console.log('\n================================');
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    console.log('\n⚠️  ISSUES DETECTED - Review errors above');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
  }
}

runDiagnostics().catch(console.error);
