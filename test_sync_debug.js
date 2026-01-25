// Test script to debug sync issues
console.log('Testing sync functionality...');

// Test date range calculation
const now = new Date();
const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

console.log('Now:', now.toISOString());
console.log('24h ago:', oneDayAgo.toISOString());

// Test the sync range function
function getSyncDateRange(range) {
    const now = new Date();

    switch (range) {
        case 'today':
            return {
                startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
                endDate: now,
                fetchAll: true,
                maxPages: 5
            };
        default:
            return null;
    }
}

const result = getSyncDateRange('today');
console.log('Sync range for today:', result);
console.log('Start:', result.startDate.toISOString());
console.log('End:', result.endDate.toISOString());
