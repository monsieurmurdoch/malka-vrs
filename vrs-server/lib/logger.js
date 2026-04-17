/**
 * Structured Logger
 *
 * Wraps Pino with environment-aware configuration:
 * - JSON output in production (parseable by log aggregators)
 * - Pretty-printed colorized output in development
 * - Log levels: error, warn, info, debug — configurable via LOG_LEVEL env var
 * - Request ID / correlation ID propagation via child loggers
 */

const pino = require('pino');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const LOG_LEVEL = process.env.LOG_LEVEL || (IS_PRODUCTION ? 'info' : 'debug');

const transport = IS_PRODUCTION
    ? undefined // raw JSON in production
    : {
          target: 'pino-pretty',
          options: {
              colorize: true,
              translateTime: 'SYS:HH:MM:ss.l',
              ignore: 'pid,hostname'
          }
      };

const logger = pino({
    level: LOG_LEVEL,
    name: 'malka-vrs',
    ...(transport ? { transport } : {}),
    // Structured serialization for Error objects
    serializers: {
        err: pino.stdSerializers.err,
        error: pino.stdSerializers.err,
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res
    },
    // Redact sensitive fields
    redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.password_hash', '*.token'],
        censor: '[REDACTED]'
    }
});

/**
 * Create a child logger with a request/correlation ID bound.
 *
 * @param {string} requestId - UUID for the request or operation
 * @param {object} [extra] - Additional fields to bind
 * @returns {pino.Logger}
 */
function child(requestId, extra = {}) {
    return logger.child({ requestId, ...extra });
}

/**
 * Create a child logger scoped to a module (e.g. 'queue', 'handoff', 'ws').
 *
 * @param {string} name - Module name
 * @returns {pino.Logger}
 */
function createModuleLogger(name) {
    return logger.child({ module: name });
}

module.exports = {
    logger,
    child,
    module: createModuleLogger
};
