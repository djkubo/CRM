// Rate limiter with queue for throttling API requests
export class RateLimiter {
    private queue: Array<() => void> = [];
    private processing = false;
    private lastExecutionTime = 0;

    constructor(private requestsPerSecond: number, private burstSize: number = 1) { }

    async execute<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const result = await fn();
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            });
            if (!this.processing) this.processQueue();
        });
    }

    private async processQueue() {
        if (this.queue.length === 0) {
            this.processing = false;
            return;
        }
        this.processing = true;
        const delayMs = 1000 / this.requestsPerSecond;
        const now = Date.now();
        const timeSinceLastExecution = now - this.lastExecutionTime;
        if (timeSinceLastExecution < delayMs) {
            await new Promise(resolve => setTimeout(resolve, delayMs - timeSinceLastExecution));
        }
        const task = this.queue.shift();
        if (task) {
            this.lastExecutionTime = Date.now();
            await task();
        }
        this.processQueue();
    }
}

export const RATE_LIMITERS = {
    STRIPE: new RateLimiter(100, 5),
    PAYPAL: new RateLimiter(10, 2),
    // Keep GHL conservative to avoid 429 bursts in production.
    GHL: new RateLimiter(8, 2),
    MANYCHAT: new RateLimiter(10, 2)
} as const;
