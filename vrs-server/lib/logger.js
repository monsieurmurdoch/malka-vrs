/**
 * Structured Logger
 *
 * Pino-based logger with:
 * - LOG_LEVEL env var (default: 'info')
 * - JSON output in production (parseable by log aggregators)
 * - Pretty-printed output in development
 * - Child loggers with context (requestId, service, etc.)
 * - Call lifecycle event helpers
 */

const pino = require('pino');

const isProduction = process.env.NODE_ENV === 'production';
const level = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

const transport = isProduction
    ? undefined  // JSON to stdout in production
    : {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
            messageFormat: '{msg}'
        }
    };

const logger = pino({
    level,
    transport,
    base: { service: 'vrs-server' },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: {
        err: pino.stdSerializers.err,
        req: (req) => ({
            method: req.method,
            url: req.url,
            requestId: req.id
        }),
        res: (res) => ({
            statusCode: res.statusCode
        })
    }
});

// ============================================
// CALL LIFECYCLE LOGGERS
// ============================================

const call = {
    started(data) {
        logger.info({ event: 'call_started', ...data }, `Call started: ${data.roomName || 'unknown'}`);
    },
    interpreterMatched(data) {
        logger.info({ event: 'interpreter_matched', ...data }, `Interpreter matched: ${data.interpreterName || data.interpreterId} → ${data.roomName}`);
    },
    ended(data) {
        logger.info({ event: 'call_ended', ...data }, `Call ended: ${data.roomName} (${data.durationMinutes || data.durationSeconds || 0}${data.durationMinutes ? 'min' : 's'})`);
    },
    p2pStarted(data) {
        logger.info({ event: 'p2p_started', ...data }, `P2P call: ${data.callerName} → ${data.calleePhone || data.calleeId}`);
    },
    p2pAnswered(data) {
        logger.info({ event: 'p2p_answered', ...data }, `P2P answered: ${data.roomName}`);
    },
    p2pEnded(data) {
        logger.info({ event: 'p2p_ended', ...data }, `P2P ended: ${data.roomName} (${data.durationSeconds || 0}s)`);
    },
    missed(data) {
        logger.info({ event: 'call_missed', ...data }, `Missed call: ${data.callerName} → ${data.calleeId}`);
    },
    queueJoined(data) {
        logger.info({ event: 'queue_joined', ...data }, `Queue joined: ${data.clientName} (pos ${data.position}, lang: ${data.language})`);
    },
    queueLeft(data) {
        logger.info({ event: 'queue_left', ...data }, `Queue left: ${data.clientName || data.requestId}`);
    }
};

// ============================================
// WEBSOCKET LOGGERS
// ============================================

const ws = {
    connected(data) {
        logger.debug({ event: 'ws_connected', ...data }, `WS connected: ${data.clientId}`);
    },
    authenticated(data) {
        logger.info({ event: 'ws_authenticated', ...data }, `WS auth: ${data.role} ${data.name || data.userId}`);
    },
    disconnected(data) {
        logger.debug({ event: 'ws_disconnected', ...data }, `WS disconnected: ${data.clientId}`);
    },
    message(data) {
        logger.debug({ event: 'ws_message', type: data.type }, `WS message: ${data.type}`);
    }
};

// ============================================
// AUTH LOGGERS
// ============================================

const auth = {
    login(data) {
        logger.info({ event: 'auth_login', ...data }, `Login: ${data.role} ${data.email}`);
    },
    loginFailed(data) {
        logger.warn({ event: 'auth_login_failed', ...data }, `Login failed: ${data.email} (${data.reason})`);
    },
    registered(data) {
        logger.info({ event: 'auth_registered', ...data }, `Registered: ${data.role} ${data.email}`);
    }
};

module.exports = logger;
module.exports.call = call;
module.exports.ws = ws;
module.exports.auth = auth;
