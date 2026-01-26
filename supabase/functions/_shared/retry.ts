// Retry logic with exponential backoff for Edge Functions
export interface RetryConfig {
    maxAttempts: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    retryableErrors: string[];
}

export const RETRY_CONFIGS = {
    FAST: { maxAttempts: 2, initialDelayMs: 500, maxDelayMs: 5000, backoffMultiplier: 2, retryableErrors: [] },
    STANDARD: { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 30000, backoffMultiplier: 2, retryableErrors: [] },
    AGGRESSIVE: { maxAttempts: 5, initialDelayMs: 2000, maxDelayMs: 60000, backoffMultiplier: 2, retryableErrors: [] }
} as const;

export const RETRYABLE_ERRORS = {
    NETWORK: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'],
    HTTP: ['429', '500', '502', '503', '504'],
    GHL: ['rate_limit_exceeded', 'too_many_requests'],
    MANYCHAT: ['rate_limit', 'temporarily_unavailable']
} as const;

function isRetryableError(error: any, retryableErrors: string[]): boolean {
    if (!error) return false;
    const errorString = error.toString().toLowerCase();
    const errorCode = error.code?.toString() || '';
    const errorMessage = error.message?.toLowerCase() || '';
    return retryableErrors.some(retryable =>
        errorString.includes(retryable.toLowerCase()) ||
        errorCode.includes(retryable) ||
        errorMessage.includes(retryable.toLowerCase())
    );
}

export async function retryWithBackoff<T>(fn: () => Promise<T>, config: RetryConfig): Promise<T> {
    let lastError: any;
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt === config.maxAttempts) throw error;
            if (config.retryableErrors.length > 0 && !isRetryableError(error, config.retryableErrors)) throw error;
            const delay = Math.min(config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1), config.maxDelayMs);
            console.warn(`⚠️ Attempt ${attempt}/${config.maxAttempts} failed: ${error}. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastError;
}
