type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogFields = Record<string, unknown>;

const LEVELS: Record<LogLevel, number> = {
    debug: 20,
    info: 30,
    warn: 40,
    error: 50
};

const SERVICE_NAME = 'vrs-ops-server';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const LOG_LEVEL = normalizeLevel(process.env.LOG_LEVEL || (IS_PRODUCTION ? 'info' : 'debug'));

function normalizeLevel(level: string): LogLevel {
    return level in LEVELS ? level as LogLevel : 'info';
}

function serializeError(error: unknown): LogFields {
    if (error instanceof Error) {
        return {
            err: {
                message: error.message,
                name: error.name,
                stack: IS_PRODUCTION ? undefined : error.stack
            }
        };
    }

    return { err: error };
}

function write(level: LogLevel, message: string, fields: LogFields = {}): void {
    if (LEVELS[level] < LEVELS[LOG_LEVEL]) {
        return;
    }

    const entry = {
        level,
        time: new Date().toISOString(),
        service: SERVICE_NAME,
        msg: message,
        ...fields
    };

    const stream = level === 'warn' || level === 'error' ? process.stderr : process.stdout;

    if (IS_PRODUCTION) {
        stream.write(`${JSON.stringify(entry)}\n`);
        return;
    }

    const { time, service, msg, ...rest } = entry;
    const suffix = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
    stream.write(`[${time}] ${level.toUpperCase()} ${service}: ${msg}${suffix}\n`);
}

function child(bindings: LogFields) {
    return {
        debug(fieldsOrMessage: LogFields | string, maybeMessage?: string) {
            logWithBindings('debug', bindings, fieldsOrMessage, maybeMessage);
        },
        info(fieldsOrMessage: LogFields | string, maybeMessage?: string) {
            logWithBindings('info', bindings, fieldsOrMessage, maybeMessage);
        },
        warn(fieldsOrMessage: LogFields | string, maybeMessage?: string) {
            logWithBindings('warn', bindings, fieldsOrMessage, maybeMessage);
        },
        error(fieldsOrMessage: LogFields | string, maybeMessage?: string) {
            logWithBindings('error', bindings, fieldsOrMessage, maybeMessage);
        }
    };
}

function logWithBindings(
    level: LogLevel,
    bindings: LogFields,
    fieldsOrMessage: LogFields | string,
    maybeMessage?: string
): void {
    if (typeof fieldsOrMessage === 'string') {
        write(level, fieldsOrMessage, bindings);
        return;
    }

    write(level, maybeMessage || 'event', { ...bindings, ...fieldsOrMessage });
}

export const logger = {
    debug(message: string, fields?: LogFields) {
        write('debug', message, fields);
    },
    info(message: string, fields?: LogFields) {
        write('info', message, fields);
    },
    warn(message: string, fields?: LogFields) {
        write('warn', message, fields);
    },
    error(message: string, fields?: LogFields) {
        write('error', message, fields);
    },
    errorWithCause(message: string, error: unknown, fields: LogFields = {}) {
        write('error', message, { ...fields, ...serializeError(error) });
    },
    child
};
