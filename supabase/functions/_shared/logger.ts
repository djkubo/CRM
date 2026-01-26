// Structured logger for Edge Functions
export enum LogLevel { DEBUG = 0, INFO = 1, WARN = 2, ERROR = 3 }

const LOG_EMOJIS = { [LogLevel.DEBUG]: '🔍', [LogLevel.INFO]: '📘', [LogLevel.WARN]: '⚠️', [LogLevel.ERROR]: '❌' };
const LOG_LABELS = { [LogLevel.DEBUG]: 'DEBUG', [LogLevel.INFO]: 'INFO ', [LogLevel.WARN]: 'WARN ', [LogLevel.ERROR]: 'ERROR' };

export class Logger {
    constructor(private context: string, private minLevel: LogLevel = LogLevel.INFO) { }

    private log(level: LogLevel, message: string, error?: Error, metadata?: Record<string, any>) {
        if (level < this.minLevel) return;
        const timestamp = new Date().toISOString();
        const emoji = LOG_EMOJIS[level];
        const label = LOG_LABELS[level];
        const metaStr = metadata ? ' | ' + Object.entries(metadata).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ') : '';
        const errorStr = error ? ` | error=${error.message}` : '';
        console.log(`[${timestamp}] [${label}] [${this.context}] ${emoji} ${message}${metaStr}${errorStr}`);
    }

    debug(message: string, metadata?: Record<string, any>) { this.log(LogLevel.DEBUG, message, undefined, metadata); }
    info(message: string, metadata?: Record<string, any>) { this.log(LogLevel.INFO, message, undefined, metadata); }
    warn(message: string, metadata?: Record<string, any>) { this.log(LogLevel.WARN, message, undefined, metadata); }
    error(message: string, error?: Error, metadata?: Record<string, any>) { this.log(LogLevel.ERROR, message, error, metadata); }
    child(subContext: string): Logger { return new Logger(`${this.context}:${subContext}`, this.minLevel); }
    timer(label: string) {
        const start = Date.now();
        return () => { const duration = Date.now() - start; this.info(`${label} completed`, { durationMs: duration }); };
    }
}

export function createLogger(context: string, minLevel: LogLevel = LogLevel.INFO): Logger {
    return new Logger(context, minLevel);
}
