/**
 * Request ID Middleware
 *
 * Assigns a unique request ID to each incoming HTTP request.
 * - Uses X-Request-ID header if present (from upstream proxy)
 * - Otherwise generates a new UUID
 * - Attaches to req.id and sets X-Request-ID response header
 * - Creates a child logger with the requestId bound
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');

function requestIdMiddleware(req, res, next) {
    const requestId = req.headers['x-request-id'] || uuidv4().slice(0, 8);

    req.id = requestId;
    req.log = logger.child({ requestId });

    res.setHeader('X-Request-ID', requestId);

    // Log request start
    req.log.debug({ method: req.method, url: req.url }, `${req.method} ${req.url}`);

    // Log response on finish
    const startTime = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
        req.log[level]({
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            durationMs: duration
        }, `${req.method} ${req.url} ${res.statusCode} ${duration}ms`);
    });

    next();
}

module.exports = requestIdMiddleware;
