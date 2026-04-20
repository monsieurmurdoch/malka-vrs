/**
 * MalkaVRS Server — Entry Point
 *
 * Wires up Express, WebSocket, and all route/handler modules.
 * Business logic lives in:
 *   routes/auth.js          — client/interpreter/admin login & registration
 *   routes/client.js        — client profile, speed dial, call history
 *   routes/interpreter.js   — interpreter profile, shifts, earnings, stats
 *   routes/admin.js         — admin dashboard, interpreter CRUD, queue mgmt
 *   routes/handoff.js       — device handoff REST endpoints
 *   ws/handler.js           — all WebSocket message handlers
 *   lib/state.js            — shared connection state & broadcast helpers
 *   lib/auth.js             — JWT helpers
 *   lib/queue-service.js    — interpreter queue matching
 *   lib/handoff-service.js  — device handoff token management
 *   lib/metrics.js          — Prometheus metrics collection
 *   lib/tracing.js          — OpenTelemetry distributed tracing
 */

// Initialize OpenTelemetry BEFORE other imports so auto-instrumentation works
const tracing = require('./lib/tracing');
tracing.initialize();

try {
    require('dotenv').config();
} catch (error) {
    // dotenv not installed — continue with process environment only
}

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Monitoring
const metrics = require('./lib/metrics');
const { httpMetricsMiddleware } = metrics;

// Structured logger & request middleware
const log = require('./lib/logger').module('server');
const { requestId, requestLogger } = require('./lib/middleware');

// Services
const db = require('./database');
const activityLogger = require('./lib/activity-logger');
const queueService = require('./lib/queue-service');
const state = require('./lib/state');
const auth = require('./lib/auth');

// Route modules
const { router: authRouter, setLegacyFlag } = require('./routes/auth');
const clientRouter = require('./routes/client');
const contactsRouter = require('./routes/contacts');
const interpreterRouter = require('./routes/interpreter');
const { router: adminRouter, setVoicemailServiceForAdmin } = require('./routes/admin');
const handoffRouter = require('./routes/handoff');
const { router: voicemailRouter, setVoicemailService } = require('./routes/voicemail');
const ttsRouter = require('./routes/tts');
const googleContactsRouter = require('./routes/google-contacts');
const handoffService = require('./lib/handoff-service');
const voicemailService = require('./dist/lib/voicemail-service');
const { validate, nameSchema, emailSchema, organizationSchema, z: zodLib } = require('./lib/validation');
const { configureStorageService, getStorageService } = require('./dist/lib/storage-service');

// WebSocket handler
const { handleConnection } = require('./ws/handler');

// ============================================
// CONFIGURATION
// ============================================

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.VRS_SHARED_JWT_SECRET || process.env.JWT_SECRET;
const API_RATE_LIMIT_WINDOW_MS = Number(process.env.API_RATE_LIMIT_WINDOW_MS || 60 * 1000);
const API_RATE_LIMIT_MAX = Number(process.env.API_RATE_LIMIT_MAX || 300);

if (!JWT_SECRET) {
    log.fatal('VRS_SHARED_JWT_SECRET or JWT_SECRET environment variable is required. Set it in your .env file before starting the server.');
    process.exit(1);
}

const LEGACY_ADMIN_LOGIN_ENABLED = process.env.ENABLE_LEGACY_ADMIN_LOGIN === 'true';
let isDatabaseReady = false;

// Initialize shared auth module
auth.init(JWT_SECRET);

// The production stack sits behind nginx, so trust the first proxy hop for
// client IPs and secure-header handling.
app.set('trust proxy', 1);

// Propagate legacy admin flag
setLegacyFlag(LEGACY_ADMIN_LOGIN_ENABLED);

// ============================================
// SECURITY MIDDLEWARE
// ============================================

const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:8080,https://localhost:8080,http://localhost:3002,http://localhost:3003')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
const CONNECT_SRC = Array.from(new Set([
    "'self'",
    'http://localhost:*',
    'https://localhost:*',
    'ws://localhost:*',
    'wss://localhost:*',
    'http://127.0.0.1:*',
    'https://127.0.0.1:*',
    'ws://127.0.0.1:*',
    'wss://127.0.0.1:*',
    ...CORS_ORIGINS,
    ...CORS_ORIGINS.map(origin => origin.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:'))
]));

app.use(cors({
    origin(origin, callback) {
        if (!origin || CORS_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('CORS not allowed'));
        }
    },
    credentials: true
}));

// CSP nonce generation (before helmet so nonce is available in directives)
app.use((req, res, next) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    next();
});

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            // 'wasm-unsafe-eval' is required by modern Chrome/Edge/Firefox for
            // WebAssembly.instantiate() calls. Jitsi loads several wasm modules
            // (olm, rnnoise, tflite, tfjs, face-landmarks). Without this directive
            // the browser throws RuntimeError: abort(both async and sync fetching
            // of the wasm failed) and retry loops on virtual-background /
            // face-landmarks features.
            scriptSrc: [
                "'self'",
                "'wasm-unsafe-eval'",
                (req, res) => `'nonce-${res.locals.cspNonce}'`
            ],
            // Workers and wasm need explicit worker-src + allowed blob: for the
            // Jitsi worker bundles (face-landmarks-worker, e2ee-worker, etc).
            workerSrc: ["'self'", 'blob:'],
            childSrc: ["'self'", 'blob:'],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: CONNECT_SRC,
            mediaSrc: ["'self'", 'blob:'],
            fontSrc: ["'self'"],
            upgradeInsecureRequests: null
        }
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// API rate limiter (kept off static assets so the dashboard can bootstrap cleanly)
app.use('/api', rateLimit({
    windowMs: API_RATE_LIMIT_WINDOW_MS,
    max: API_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    skip(req) {
        return req.path === '/readiness' || req.path === '/health';
    },
    message: { error: 'Too many requests, please try again later.' }
}));

// Prometheus HTTP metrics middleware (before body parsing so all routes are tracked)
app.use(httpMetricsMiddleware);

// Request ID (correlation ID) & HTTP request logging
app.use(requestId);
app.use(requestLogger);

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ============================================
// SSI MIDDLEWARE (Jitsi Meet compatibility)
// ============================================

const staticRoot = path.join(__dirname, '..');

app.use((req, res, next) => {
    if (!req.path.endsWith('.html') && req.path !== '/') {
        return next();
    }

    const filePath = req.path === '/'
        ? path.join(staticRoot, 'index.html')
        : path.join(staticRoot, req.path);

    if (!filePath.startsWith(staticRoot)) {
        return next();
    }

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            return next();
        }

        const nonce = res.locals.cspNonce || '';

        const resolved = data.replace(
            /<!--#include virtual="([^"]+)"\s*-->/g,
            (match, includePath) => {
                try {
                    const absPath = path.join(staticRoot, includePath);
                    if (absPath.startsWith(staticRoot)) {
                        return fs.readFileSync(absPath, 'utf8');
                    }
                } catch (e) {
                    // File doesn't exist
                }
                return '';
            }
        )
            // Inject nonce into inline <script> tags (no src attribute)
            .replace(/<script(?![^>]*\bsrc\b)([^>]*)>/gi, (m, attrs) => {
                if (/\bnonce=/.test(attrs)) return m;
                return '<script' + attrs + ' nonce="' + nonce + '">';
            })
            // Inject nonce into inline <style> tags
            .replace(/<style([^>]*)>/gi, (m, attrs) => {
                if (/\bnonce=/.test(attrs)) return m;
                return '<style' + attrs + ' nonce="' + nonce + '">';
            });

        res.type('html').send(resolved);
    });
});

// Static files
app.use(express.static(staticRoot));

// ============================================
// WEBSOCKET SERVER
// ============================================

const wss = new WebSocket.Server({ server, path: '/ws' });
state.setWss(wss);

wss.on('connection', handleConnection);

// Keep-alive
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.send(JSON.stringify({ type: 'ping' }));
    });
}, 30000);

wss.on('close', () => {
    clearInterval(interval);
});

// ============================================
// HEALTH ENDPOINTS
// ============================================

function getHealthWarnings() {
    const warnings = [];
    if (LEGACY_ADMIN_LOGIN_ENABLED) {
        warnings.push(IS_PRODUCTION ? 'legacy_admin_login_enabled_in_production' : 'legacy_admin_login_enabled');
    }
    if (!CORS_ORIGINS.length) {
        warnings.push('cors_origins_empty');
    }
    return warnings;
}

function getServiceHealthSnapshot() {
    const queueStatus = typeof queueService.getStatus === 'function'
        ? queueService.getStatus()
        : { activeInterpreters: [], paused: false, pendingRequests: [], queueSize: 0, totalMatches: 0 };

    const warnings = getHealthWarnings();
    const ready = isDatabaseReady && Boolean(JWT_SECRET);

    return {
        checks: {
            authConfigured: Boolean(JWT_SECRET),
            databaseReady: isDatabaseReady,
            legacyAdminLoginDisabled: !LEGACY_ADMIN_LOGIN_ENABLED,
            websocketReady: Boolean(wss)
        },
        queue: {
            activeInterpreterCount: queueStatus.activeInterpreters.length,
            paused: queueStatus.paused,
            pendingRequestCount: queueStatus.pendingRequests.length,
            queueSize: queueStatus.queueSize,
            totalMatches: queueStatus.totalMatches
        },
        ready,
        service: 'vrs-server',
        status: ready ? (warnings.length ? 'degraded' : 'ok') : 'not_ready',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        warnings,
        websocket: { clientsConnected: wss.clients.size }
    };
}

app.get('/api/health', (req, res) => {
    res.json(getServiceHealthSnapshot());
});

app.get('/api/readiness', (req, res) => {
    const snapshot = getServiceHealthSnapshot();
    res.status(snapshot.ready ? 200 : 503).json(snapshot);
});

// Ops health — lightweight endpoint for infrastructure probes (load balancer, DO monitoring)
app.get('/health', (req, res) => {
    const ready = isDatabaseReady && Boolean(JWT_SECRET);
    res.status(ready ? 200 : 503).json({
        status: ready ? 'ok' : 'not_ready',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ============================================
// PROMETHEUS METRICS ENDPOINT
// ============================================

app.get('/metrics', async (req, res) => {
    try {
        // Update gauge metrics from current application state
        const queueStatus = typeof queueService.getStatus === 'function'
            ? queueService.getStatus()
            : { activeInterpreters: [], paused: false, pendingRequests: [], queueSize: 0, totalMatches: 0 };

        const m = metrics.metrics;

        // Queue gauges
        m.queueDepth.set(queueStatus.queueSize);
        m.queuePaused.set(queueStatus.paused ? 1 : 0);

        // WebSocket gauges by role
        m.wsConnections.set({ role: 'interpreter' }, state.clients.interpreters.size);
        m.wsConnections.set({ role: 'client' }, state.clients.clients.size);
        m.wsConnections.set({ role: 'admin' }, state.clients.admins.size);
        m.wsConnections.set({ role: 'total' }, wss.clients.size);

        // Scrape JVB stats if configured
        const jvbUrl = process.env.JVB_STATS_URL;
        if (jvbUrl) {
            await metrics.scrapeJvbStats(jvbUrl);
        }

        res.set('Content-Type', metrics.register.contentType);
        res.end(await metrics.register.metrics());
    } catch (error) {
        res.status(500).json({ error: 'Failed to collect metrics' });
    }
});

// ============================================
// PUBLIC VRS REGISTRATION (no auth)
// ============================================

const registerSchema = zodLib.object({
    name: nameSchema,
    email: emailSchema.optional(),
    role: zodLib.enum(['client']),
    organization: organizationSchema
});

app.post('/api/vrs/register', validate(registerSchema), async (req, res) => {
    const { name, email } = req.body;

    try {
        const clientId = await db.createClient({
            name, email, organization: req.body.organization || 'Personal'
        });

        res.json({ success: true, id: clientId });
    } catch (error) {
        req.log.error({ err: error }, 'Registration failed');
        res.status(500).json({ error: 'Registration failed', code: 'INTERNAL_ERROR' });
    }
});

// ============================================
// MOUNT ROUTE MODULES
// ============================================

app.use('/api/auth', authRouter);
app.use('/api/client', clientRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/interpreter', interpreterRouter);
app.use('/api/admin', adminRouter);
app.use('/api/handoff', handoffRouter);
app.use('/api/voicemail', voicemailRouter);
app.use('/api/tts', ttsRouter);
app.use('/api/google-contacts', googleContactsRouter);

// ============================================
// ERROR HANDLER
// ============================================

app.use((error, req, res, next) => {
    req.log.error({ err: error }, 'Unhandled server error');
    res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        ...(process.env.NODE_ENV === 'development' && { details: { message: error.message } })
    });
});

// ============================================
// START SERVER
// ============================================

db.initialize().then(async () => {
    isDatabaseReady = true;
    queueService.broadcastToAdmins = (type, data) => state.broadcastToAdmins({ type, data });
    await queueService.initialize();
    await handoffService.initialize();

    // Seed voicemail settings
    await db.seedVoicemailSettings();

    // Initialize MinIO storage service (optional — graceful degradation)
    if (process.env.MINIO_ENDPOINT) {
        try {
            const storage = configureStorageService({
                endpoint: process.env.MINIO_ENDPOINT,
                accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
                secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
                bucket: process.env.MINIO_BUCKET || 'voicemail'
            });
            await storage.initialize();
            log.info('MinIO storage service initialized');
        } catch (err) {
            log.warn({ err }, 'MinIO initialization failed — voicemail storage unavailable');
        }
    }

    // Initialize voicemail service
    const broadcastFn = (userId, message) => {
        const clientWs = state.clients.clients.get(userId);
        if (clientWs && clientWs.readyState === 1) {
            clientWs.send(JSON.stringify(message));
        }
    };
    await voicemailService.initialize(broadcastFn);

    // Wire voicemail service into routes
    setVoicemailService(voicemailService);
    setVoicemailServiceForAdmin(voicemailService);

    server.listen(PORT, () => {
        log.info({ port: PORT, env: process.env.NODE_ENV || 'development' }, 'MalkaVRS server started');
        log.info('  HTTP Server:   http://localhost:%d', PORT);
        log.info('  WebSocket:     ws://localhost:%d/ws', PORT);
        log.info('  API Base:      /api');
        log.info('  Admin Panel:   /vrs-admin-dashboard.html');
        log.info('  Health (Ops):  http://localhost:%d/health', PORT);
        log.info('  Metrics:       http://localhost:%d/metrics', PORT);

        const warnings = getHealthWarnings();
        if (warnings.length) {
            log.warn({ warnings }, 'Startup warnings detected');
        }
    });
}).catch(error => {
    isDatabaseReady = false;
    log.fatal({ err: error }, 'Failed to initialize database');
    process.exit(1);
});

module.exports = { app, server, wss, db, queueService };
