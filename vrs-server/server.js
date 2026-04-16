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
 */

try {
    require('dotenv').config();
} catch (error) {
    console.warn('[Server] dotenv not installed, continuing with process environment only.');
}

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

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
const adminRouter = require('./routes/admin');
const handoffRouter = require('./routes/handoff');

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
    console.error('FATAL: VRS_SHARED_JWT_SECRET or JWT_SECRET environment variable is required.');
    console.error('Set it in your .env file before starting the server.');
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

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
            connectSrc: CONNECT_SRC,
            mediaSrc: ["'self'", 'blob:'],
            fontSrc: ["'self'"],
            // Re-enable this once the public endpoints are served over HTTPS
            // with valid certificates. It is disabled temporarily so HTTP
            // smoke-testing against the droplet IP does not auto-upgrade every
            // asset request to an unavailable https:// origin.
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
        );

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

// ============================================
// PUBLIC VRS REGISTRATION (no auth)
// ============================================

function validateRequired(body, fields) {
    for (const field of fields) {
        const value = body[field];
        if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
            return `Missing required field: ${field}`;
        }
    }
    return null;
}

app.post('/api/vrs/register', async (req, res) => {
    const validationError = validateRequired(req.body, ['name', 'role']);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const { name, email, role } = req.body;

    try {
        if (role === 'interpreter') {
            return res.status(400).json({
                error: 'Interpreter registration requires approval. Please contact administrator.'
            });
        }

        const clientId = await db.createClient({
            name, email, organization: req.body.organization || 'Personal'
        });

        res.json({ success: true, id: clientId });
    } catch (error) {
        console.error('[Register] Error:', error);
        res.status(500).json({ error: 'Registration failed' });
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

// ============================================
// ERROR HANDLER
// ============================================

app.use((error, req, res, next) => {
    console.error('[Server] Error:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

// ============================================
// START SERVER
// ============================================

db.initialize().then(async () => {
    isDatabaseReady = true;
    queueService.broadcastToAdmins = (type, data) => state.broadcastToAdmins({ type, data });
    await queueService.initialize();
    server.listen(PORT, () => {
        console.log(`
╔════════════════════════════════════════════════════════════╗
║           MalkaVRS Server Started Successfully!            ║
╠════════════════════════════════════════════════════════════╣
║  HTTP Server:   http://localhost:${PORT}                      ║
║  WebSocket:     ws://localhost:${PORT}/ws                     ║
║  API Base:      /api                                          ║
║  Admin Panel:   /vrs-admin-dashboard.html                     ║
╠════════════════════════════════════════════════════════════╣
║  Environment:   ${process.env.NODE_ENV || 'development'}                       ║
║  Readiness:     http://localhost:${PORT}/api/readiness               ║
╚════════════════════════════════════════════════════════════╝
        `);

        const warnings = getHealthWarnings();
        if (warnings.length) {
            console.warn('[Server] Startup warnings:', warnings.join(', '));
        }
    });
}).catch(error => {
    isDatabaseReady = false;
    console.error('Failed to initialize database:', error);
    process.exit(1);
});

module.exports = { app, server, wss, db, queueService };
