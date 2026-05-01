import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
type LogFields = Record<string, unknown>;

const LEVELS: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
    fatal: 50
};

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const LOG_LEVEL = (process.env.LOG_LEVEL as LogLevel) || (IS_PRODUCTION ? 'info' : 'debug');
const SERVICE_NAME = process.env.SERVICE_NAME || 'vrs-ops-server';

function normalizeError(err: unknown): unknown {
    if (!(err instanceof Error)) {
        return err;
    }

    return {
        message: err.message,
        name: err.name,
        stack: IS_PRODUCTION ? undefined : err.stack
    };
}

function sanitize(fields: LogFields = {}): LogFields {
    return Object.fromEntries(Object.entries(fields).map(([key, value]) => [
        key,
        key.toLowerCase().includes('password') || key.toLowerCase().includes('token')
            ? '[REDACTED]'
            : normalizeError(value)
    ]));
}

function write(level: LogLevel, fieldsOrMessage: LogFields | string, message?: string): void {
    if (LEVELS[level] < (LEVELS[LOG_LEVEL] ?? LEVELS.info)) {
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

export const logger = {
    debug: (fieldsOrMessage: LogFields | string, message?: string) => write('debug', fieldsOrMessage, message),
    error: (fieldsOrMessage: LogFields | string, message?: string) => write('error', fieldsOrMessage, message),
    fatal: (fieldsOrMessage: LogFields | string, message?: string) => write('fatal', fieldsOrMessage, message),
    info: (fieldsOrMessage: LogFields | string, message?: string) => write('info', fieldsOrMessage, message),
    warn: (fieldsOrMessage: LogFields | string, message?: string) => write('warn', fieldsOrMessage, message)
};

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
    const existing = req.headers['x-request-id'];
    const requestId = Array.isArray(existing) ? existing[0] : existing || randomUUID();

    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
}

export function requestLogMiddleware(req: Request, res: Response, next: NextFunction): void {
    const startedAt = Date.now();

    res.on('finish', () => {
        if (req.path === '/api/health' || req.path === '/api/readiness') {
            return;
        }

        const level: LogLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

        logger[level]({
            durationMs: Date.now() - startedAt,
            method: req.method,
            requestId: res.locals.requestId,
            status: res.statusCode,
            url: req.originalUrl
        }, 'http_request_completed');
    });

    next();
}
