const crypto = require('crypto');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const LOG_LEVEL = process.env.LOG_LEVEL || (IS_PRODUCTION ? 'info' : 'debug');
const SERVICE_NAME = process.env.SERVICE_NAME || 'twilio-voice-server';

function normalizeError(error) {
    if (!(error instanceof Error)) {
        return error;
    }

    return {
        message: error.message,
        name: error.name,
        stack: IS_PRODUCTION ? undefined : error.stack
    };
}

function sanitize(fields = {}) {
    return Object.fromEntries(Object.entries(fields).map(([key, value]) => [
        key,
        key.toLowerCase().includes('token') || key.toLowerCase().includes('password')
            ? '[REDACTED]'
            : normalizeError(value)
    ]));
}

function write(level, fieldsOrMessage, message) {
    if (LEVELS[level] < (LEVELS[LOG_LEVEL] || LEVELS.info)) {
        return;
    }

    const fields = typeof fieldsOrMessage === 'string' ? {} : sanitize(fieldsOrMessage);
    const msg = typeof fieldsOrMessage === 'string' ? fieldsOrMessage : message;

    if (IS_PRODUCTION) {
        process.stdout.write(`${JSON.stringify({
            level,
            msg,
            service: SERVICE_NAME,
            time: new Date().toISOString(),
            ...fields
        })}\n`);
        return;
    }

    const suffix = Object.keys(fields).length ? ` ${JSON.stringify(fields)}` : '';
    process.stdout.write(`[${new Date().toISOString()}] ${level.toUpperCase()} ${SERVICE_NAME}: ${msg || ''}${suffix}\n`);
}

const logger = {
    debug: (fieldsOrMessage, message) => write('debug', fieldsOrMessage, message),
    error: (fieldsOrMessage, message) => write('error', fieldsOrMessage, message),
    fatal: (fieldsOrMessage, message) => write('fatal', fieldsOrMessage, message),
    info: (fieldsOrMessage, message) => write('info', fieldsOrMessage, message),
    warn: (fieldsOrMessage, message) => write('warn', fieldsOrMessage, message)
};

function requestId(req, res, next) {
    const id = req.headers['x-request-id'] || crypto.randomUUID();
    req.id = id;
    res.setHeader('X-Request-Id', id);
    next();
}

function requestLogger(req, res, next) {
    const startedAt = Date.now();

    res.on('finish', () => {
        if (req.path === '/health' || req.path === '/api/health' || req.path === '/api/readiness') {
            return;
        }

        const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
        logger[level]({
            durationMs: Date.now() - startedAt,
            method: req.method,
            requestId: req.id,
            status: res.statusCode,
            url: req.originalUrl
        }, 'http_request_completed');
    });

    next();
}

module.exports = { logger, requestId, requestLogger };
