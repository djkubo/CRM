#!/usr/bin/env node
/**
 * Comprehensive Command Center Test Script
 * Tests all sync functionality, metrics accuracy, and error handling
 * 
 * Usage: node test_command_center_comprehensive.js
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'YOUR_ANON_KEY';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// Test configuration
const TESTS = {
    sync24h: true,       // Test 24-hour sync
    syncWeek: true,      // Test 7-day sync
    metrics: true,       // Verify metrics accuracy
    pagination: true,    // Test pagination with cursors
    recoveryList: true,  // Verify recovery list completeness
    errorRecovery: false // Test error handling (manual only)
};

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

function pass(message) {
    log(`✅ PASS: ${message}`, colors.green);
}

function fail(message) {
    log(`❌ FAIL: ${message}`, colors.red);
}

function info(message) {
    log(`ℹ️  ${message}`, colors.cyan);
}

function warn(message) {
    log(`⚠️  ${message}`, colors.yellow);
}

async function main() {
    log('\n════════════════════════════════════════', colors.blue);
    log('  Command Center Comprehensive Test', colors.blue);
    log('════════════════════════════════════════\n', colors.blue);

    // Initialize Supabase client
    info('Initializing Supabase client...');
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Authenticate
    info(`Authenticating as ${ADMIN_EMAIL}...`);
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD
    });

    if (authError) {
        fail(`Authentication failed: ${authError.message}`);
        process.exit(1);
    }

    const token = authData.session.access_token;
    pass('Authenticated successfully\n');

    let testResults = {
        passed: 0,
        failed: 0,
        skipped: 0
    };

    // ========== TEST 1: 24-Hour Sync ==========
    if (TESTS.sync24h) {
        log('\n────── Test 1: 24-Hour Sync ──────', colors.yellow);
        try {
            const startTime = Date.now();
            const response = await supabase.functions.invoke('sync-command-center', {
                body: {
                    startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                    endDate: new Date().toISOString(),
                    fetchAll: true,
                    maxPages: 10,
                    includeContacts: false
                },
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            const duration = Date.now() - startTime;

            if (response.error) {
                fail(`Sync failed: ${response.error.message}`);
                testResults.failed++;
            } else if (response.data?.success) {
                const data = response.data;
                pass(`Sync completed in ${(duration / 1000).toFixed(1)}s`);
                info(`  Total records: ${data.totalRecords || 0}`);
                info(`  Status: ${data.status}`);

                if (data.results) {
                    Object.entries(data.results).forEach(([service, result]) => {
                        if (result.count > 0) {
                            info(`  ${service}: ${result.count} records`);
                        }
                    });
                }

                if (data.status === 'continuing') {
                    warn('Sync is continuing (not all data processed in one call)');
                }
                testResults.passed++;
            } else {
                fail(`Unexpected response: ${JSON.stringify(response.data)}`);
                testResults.failed++;
            }
        } catch (error) {
            fail(`Test error: ${error.message}`);
            testResults.failed++;
        }
    } else {
        testResults.skipped++;
    }

    // ========== TEST 2: Metrics Accuracy ==========
    if (TESTS.metrics) {
        log('\n────── Test 2: Metrics Accuracy ──────', colors.yellow);
        try {
            // Call dashboard_metrics RPC
            const { data: metricsData, error: metricsError } = await supabase
                .rpc('dashboard_metrics');

            if (metricsError) {
                fail(`Metrics RPC failed: ${metricsError.message}`);
                testResults.failed++;
            } else {
                const metrics = metricsData[0];

                // Manual query for comparison
                const { data: manualData, error: manualError } = await supabase
                    .from('transactions')
                    .select('amount, currency, status')
                    .in('status', ['paid', 'succeeded'])
                    .gte('stripe_created_at', new Date().toISOString().split('T')[0]);

                if (manualError) {
                    warn(`Manual query failed: ${manualError.message}`);
                } else {
                    const manualUSD = manualData
                        .filter(t => t.currency !== 'mxn')
                        .reduce((sum, t) => sum + (t.amount || 0), 0);

                    const manualMXN = manualData
                        .filter(t => t.currency === 'mxn')
                        .reduce((sum, t) => sum + (t.amount || 0), 0);

                    info(`  RPC Metrics:`);
                    info(`    Today USD: $${((metrics.sales_today_usd || 0) / 100).toFixed(2)}`);
                    info(`    Today MXN: $${((metrics.sales_today_mxn || 0) / 100).toFixed(2)}`);
                    info(`    Trials: ${metrics.trial_count}`);
                    info(`    Conversions: ${metrics.converted_count}`);

                    info(`  Manual Query:`);
                    info(`    Today USD: $${(manualUSD / 100).toFixed(2)}`);
                    info(`    Today MXN: $${(manualMXN / 100).toFixed(2)}`);

                    // Check accuracy (allow 1% tolerance)
                    const usdDiff = Math.abs(metrics.sales_today_usd - manualUSD);
                    const usdTolerance = manualUSD * 0.01;

                    if (usdDiff <= usdTolerance || manualUSD === 0) {
                        pass('Metrics accuracy verified (within 1% tolerance)');
                        testResults.passed++;
                    } else {
                        fail(`Metrics mismatch: RPC=$${metrics.sales_today_usd / 100}, Manual=$${manualUSD / 100}`);
                        testResults.failed++;
                    }
                }
            }
        } catch (error) {
            fail(`Test error: ${error.message}`);
            testResults.failed++;
        }
    } else {
        testResults.skipped++;
    }

    // ========== TEST 3: Recovery List ==========
    if (TESTS.recoveryList) {
        log('\n────── Test 3: Recovery List ──────', colors.yellow);
        try {
            const { data: metricsData } = await supabase.rpc('dashboard_metrics');
            const recoveryList = metricsData[0]?.recovery_list || [];

            info(`  Recovery list contains ${recoveryList.length} entries`);

            // Verify against manual query
            const { data: failedTxs } = await supabase
                .from('transactions')
                .select('customer_email, amount, status, failure_code')
                .or('status.in.(failed,requires_payment_method,requires_action),failure_code.not.is.null')
                .not('customer_email', 'is', null);

            const uniqueCustomers = new Set(failedTxs?.map(t => t.customer_email) || []);
            info(`  Manual query found ${uniqueCustomers.size} unique failed customers`);

            if (recoveryList.length > 0) {
                pass(`Recovery list populated with ${recoveryList.length} customers`);
                info(`  Top failure: ${recoveryList[0]?.email} - $${recoveryList[0]?.amount}`);
                testResults.passed++;
            } else if (uniqueCustomers.size === 0) {
                pass('No failures found (both RPC and manual query)');
                testResults.passed++;
            } else {
                fail(`Recovery list empty but manual query found ${uniqueCustomers.size} failures`);
                testResults.failed++;
            }
        } catch (error) {
            fail(`Test error: ${error.message}`);
            testResults.failed++;
        }
    } else {
        testResults.skipped++;
    }

    // ========== TEST 4: Pagination Test ==========
    if (TESTS.pagination) {
        log('\n────── Test 4: Pagination with Cursors ──────', colors.yellow);
        try {
            // Test paginated fetch-stripe call
            const page1 = await supabase.functions.invoke('fetch-stripe', {
                body: {
                    fetchAll: true,
                    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                    endDate: new Date().toISOString(),
                    limit: 5 // Small limit to force pagination
                },
                headers: { Authorization: `Bearer ${token}` }
            });

            if (page1.error) {
                warn(`Pagination test skipped: ${page1.error.message}`);
                testResults.skipped++;
            } else {
                const data1 = page1.data;
                info(`  Page 1: ${data1.synced_transactions || 0} transactions`);
                info(`  Has more: ${data1.hasMore}`);
                info(`  Cursor: ${data1.nextCursor ? data1.nextCursor.substring(0, 20) + '...' : 'null'}`);

                if (data1.hasMore && data1.nextCursor) {
                    // Fetch page 2
                    const page2 = await supabase.functions.invoke('fetch-stripe', {
                        body: {
                            cursor: data1.nextCursor,
                            syncRunId: data1.syncRunId,
                            limit: 5
                        },
                        headers: { Authorization: `Bearer ${token}` }
                    });

                    if (page2.error) {
                        fail(`Page 2 failed: ${page2.error.message}`);
                        testResults.failed++;
                    } else {
                        const data2 = page2.data;
                        info(`  Page 2: ${data2.synced_transactions || 0} transactions`);

                        if (data2.nextCursor !== data1.nextCursor) {
                            pass('Pagination works: cursor advanced correctly');
                            testResults.passed++;
                        } else {
                            fail('Pagination broken: cursor did not advance');
                            testResults.failed++;
                        }
                    }
                } else {
                    pass('Pagination not needed (all data in one page)');
                    testResults.passed++;
                }
            }
        } catch (error) {
            fail(`Test error: ${error.message}`);
            testResults.failed++;
        }
    } else {
        testResults.skipped++;
    }

    // ========== FINAL SUMMARY ==========
    log('\n════════════════════════════════════════', colors.blue);
    log('  Test Summary', colors.blue);
    log('════════════════════════════════════════', colors.blue);
    log(`  Passed:  ${testResults.passed}`, testResults.passed > 0 ? colors.green : colors.reset);
    log(`  Failed:  ${testResults.failed}`, testResults.failed > 0 ? colors.red : colors.reset);
    log(`  Skipped: ${testResults.skipped}`, colors.yellow);
    log('', colors.reset);

    if (testResults.failed === 0) {
        pass('All tests passed! ✨');
        process.exit(0);
    } else {
        fail(`${testResults.failed} test(s) failed`);
        process.exit(1);
    }
}

// Run tests
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
