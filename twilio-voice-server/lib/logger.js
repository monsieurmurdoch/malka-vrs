const LEVELS = {
    debug: 20,
    info: 30,
    warn: 40,
    error: 50
};

const SERVICE_NAME = 'twilio-voice-server';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const LOG_LEVEL = normalizeLevel(process.env.LOG_LEVEL || (IS_PRODUCTION ? 'info' : 'debug'));

function normalizeLevel(level) {
    return Object.prototype.hasOwnProperty.call(LEVELS, level) ? level : 'info';
}

function serializeError(error) {
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

function write(level, message, fields = {}) {
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

function child(bindings) {
    return {
        debug(fieldsOrMessage, maybeMessage) {
            logWithBindings('debug', bindings, fieldsOrMessage, maybeMessage);
        },
        info(fieldsOrMessage, maybeMessage) {
            logWithBindings('info', bindings, fieldsOrMessage, maybeMessage);
        },
        warn(fieldsOrMessage, maybeMessage) {
            logWithBindings('warn', bindings, fieldsOrMessage, maybeMessage);
        },
        error(fieldsOrMessage, maybeMessage) {
            logWithBindings('error', bindings, fieldsOrMessage, maybeMessage);
        }
    };
}

function logWithBindings(level, bindings, fieldsOrMessage, maybeMessage) {
    if (typeof fieldsOrMessage === 'string') {
        write(level, fieldsOrMessage, bindings);
        return;
    }

    write(level, maybeMessage || 'event', { ...bindings, ...fieldsOrMessage });
}

module.exports = {
    debug(message, fields) {
        write('debug', message, fields);
    },
    info(message, fields) {
        write('info', message, fields);
    },
    warn(message, fields) {
        write('warn', message, fields);
    },
    error(message, fields) {
        write('error', message, fields);
    },
    errorWithCause(message, error, fields = {}) {
        write('error', message, { ...fields, ...serializeError(error) });
    },
    child
};
