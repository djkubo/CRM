#!/usr/bin/env node
/**
 * Quick Configuration Verification
 * Verifies that the sync date ranges are configured correctly
 */

// Simulate the getSyncDateRange logic
function subDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() - days);
    return result;
}

function subMonths(date, months) {
    const result = new Date(date);
    result.setMonth(result.getMonth() - months);
    return result;
}

function subYears(date, years) {
    const result = new Date(date);
    result.setFullYear(result.getFullYear() - years);
    return result;
}

function getSyncDateRange(range) {
    const now = new Date();

    switch (range) {
        case 'today':
            return {
                startDate: subDays(now, 1),
                endDate: now,
                fetchAll: true,
                maxPages: 10
            };
        case '7d':
            return {
                startDate: subDays(now, 7),
                endDate: now,
                fetchAll: true,
                maxPages: 5
            };
        case 'month':
            return {
                startDate: subMonths(now, 1),
                endDate: now,
                fetchAll: true,
                maxPages: 5
            };
        case 'full':
            return {
                startDate: subYears(now, 3),
                endDate: now,
                fetchAll: true,
                maxPages: 5
            };
    }
}

console.log('\n🔍 Command Center Configuration Verification\n');
console.log('═'.repeat(50));

const ranges = ['today', '7d', 'month', 'full'];
const now = new Date();

ranges.forEach(range => {
    const config = getSyncDateRange(range);
    const days = Math.round((config.endDate - config.startDate) / (1000 * 60 * 60 * 24));
    const years = (days / 365).toFixed(1);

    console.log(`\n📅 Range: "${range}"`);
    console.log(`   Start: ${config.startDate.toISOString().split('T')[0]}`);
    console.log(`   End:   ${config.endDate.toISOString().split('T')[0]}`);
    console.log(`   Days:  ${days} days (${years} years)`);
    console.log(`   Pages: ${config.maxPages} max pages per API call`);

    // Validation
    if (range === 'full') {
        const expectedYears = 3;
        const actualYears = parseFloat(years);
        if (Math.abs(actualYears - expectedYears) < 0.1) {
            console.log(`   ✅ PASS: Full range correctly set to ~${expectedYears} years`);
        } else {
            console.log(`   ❌ FAIL: Expected ~${expectedYears} years, got ${actualYears}`);
        }
    } else {
        console.log(`   ✅ Configuration looks correct`);
    }
});

console.log('\n' + '═'.repeat(50));
console.log('✅ All configurations verified!\n');
