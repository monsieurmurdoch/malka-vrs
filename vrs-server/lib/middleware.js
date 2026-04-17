/**
 * Request ID & HTTP Request Logging Middleware
 *
 * - Assigns a correlation ID (X-Request-Id) to every request
 * - Forwards existing X-Request-Id from upstream proxies
 * - Logs every HTTP request/response with structured fields
 * - Binds a child logger onto req.log for use in route handlers
 */

const crypto = require('crypto');
const { logger } = require('./logger');

/**
 * Request ID middleware — attaches or generates a correlation ID.
 * Places req.id and req.log (child logger with requestId bound) on the request.
 */
function requestId(req, res, next) {
    const id = req.headers['x-request-id'] || crypto.randomUUID();
    req.id = id;
    res.setHeader('X-Request-Id', id);
    req.log = logger.child({ requestId: id });
    next();
}

/**
 * HTTP request logging middleware — logs method, url, status code, duration.
 * Skips noisy paths like health checks.
 */
function requestLogger(req, res, next) {
    // Skip logging for health/readiness probes to reduce noise
    if (req.path === '/api/health' || req.path === '/api/readiness' || req.path === '/health') {
        return next();
    }

    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

        req.log[level]({
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            duration_ms: duration,
            user_agent: req.headers['user-agent'],
            ip: req.ip
        }, 'request completed');
    });

    next();
}

module.exports = { requestId, requestLogger };
