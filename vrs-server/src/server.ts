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
 *   lib/state.ts            — shared connection state & broadcast helpers
 *   lib/auth.ts             — JWT helpers
 *   lib/queue-service.ts    — interpreter queue matching
 *   lib/handoff-service.ts  — device handoff token management
 */

try {
    require('dotenv').config();
} catch (error) {
    console.warn('[Server] dotenv not installed, continuing with process environment only.');
}

import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { Server as WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';

// Services
import * as db from './database';
import * as activityLogger from './lib/activity-logger';
import queueService from './lib/queue-service';
import * as state from './lib/state';
import * as auth from './lib/auth';
import * as billingDb from './lib/billing-db';

// Route modules (still JS — migrated separately)
const { router: authRouter, setLegacyFlag } = require('./routes/auth');
const clientRouter = require('./routes/client');
const interpreterRouter = require('./routes/interpreter');
const adminRouter = require('./routes/admin');
const handoffRouter = require('./routes/handoff');

// Billing routes (TypeScript — compiled)
const { router: billingAdminRouter } = require('./billing/routes/billing-admin');
const { router: billingDashboardRouter } = require('./billing/routes/billing-dashboard');

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
    origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
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
    skip(req: Request) {
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

const staticRoot = path.join(__dirname, '..', '..');

app.use((req: Request, res: Response, next: NextFunction) => {
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

const wss = new WebSocketServer({ server, path: '/ws' });
state.setWss(wss);

wss.on('connection', handleConnection);

// Keep-alive
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        const extWs = ws as WebSocket & { isAlive?: boolean };
        if (extWs.isAlive === false) {
            return ws.terminate();
        }
        extWs.isAlive = false;
        ws.send(JSON.stringify({ type: 'ping' }));
    });
}, 30000);

wss.on('close', () => {
    clearInterval(interval);
});

// ============================================
// HEALTH ENDPOINTS
// ============================================

function getHealthWarnings(): string[] {
    const warnings: string[] = [];
    if (LEGACY_ADMIN_LOGIN_ENABLED) {
        warnings.push(IS_PRODUCTION ? 'legacy_admin_login_enabled_in_production' : 'legacy_admin_login_enabled');
    }
    if (!CORS_ORIGINS.length) {
        warnings.push('cors_origins_empty');
    }
    return warnings;
}

interface HealthSnapshot {
    checks: {
        authConfigured: boolean;
        databaseReady: boolean;
        billingReady: boolean;
        legacyAdminLoginDisabled: boolean;
        websocketReady: boolean;
    };
    queue: {
        activeInterpreterCount: number;
        paused: boolean;
        pendingRequestCount: number;
        queueSize: number;
        totalMatches: number;
    };
    ready: boolean;
    service: string;
    status: string;
    timestamp: string;
    uptime: number;
    warnings: string[];
    websocket: { clientsConnected: number };
}

function getServiceHealthSnapshot(): HealthSnapshot {
    const queueStatus = typeof queueService.getStatus === 'function'
        ? queueService.getStatus()
        : { activeInterpreters: [], paused: false, pendingRequests: [], queueSize: 0, totalMatches: 0 };

    const warnings = getHealthWarnings();
    const ready = isDatabaseReady && Boolean(JWT_SECRET);

    return {
        checks: {
            authConfigured: Boolean(JWT_SECRET),
            databaseReady: isDatabaseReady,
            billingReady: billingDb.isBillingDbReady(),
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

app.get('/api/health', (_req: Request, res: Response) => {
    res.json(getServiceHealthSnapshot());
});

app.get('/api/readiness', (_req: Request, res: Response) => {
    const snapshot = getServiceHealthSnapshot();
    res.status(snapshot.ready ? 200 : 503).json(snapshot);
});

// ============================================
// PUBLIC VRS REGISTRATION (no auth)
// ============================================

function validateRequired(body: Record<string, unknown>, fields: string[]): string | null {
    for (const field of fields) {
        const value = body[field];
        if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
            return `Missing required field: ${field}`;
        }
    }
    return null;
}

app.post('/api/vrs/register', async (req: Request, res: Response) => {
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
app.use('/api/interpreter', interpreterRouter);
app.use('/api/admin', adminRouter);
app.use('/api/handoff', handoffRouter);
app.use('/api/billing', billingAdminRouter);
app.use('/api/billing', billingDashboardRouter);

// ============================================
// ERROR HANDLER
// ============================================

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
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
    queueService.broadcastToAdmins = (type: string, data: unknown) => state.broadcastToAdmins({ type, data });
    await queueService.initialize();

    // Initialize billing PostgreSQL (opt-in via BILLING_PG_HOST env var)
    try {
        await billingDb.initialize();
    } catch (billingErr) {
        console.warn('[Server] Billing DB initialization failed (non-fatal):', billingErr instanceof Error ? billingErr.message : billingErr);
    }

    server.listen(PORT, () => {
        console.log(`
\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
\u2551           MalkaVRS Server Started Successfully!            \u2551
\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563
\u2551  HTTP Server:   http://localhost:${PORT}                      \u2551
\u2551  WebSocket:     ws://localhost:${PORT}/ws                     \u2551
\u2551  API Base:      /api                                          \u2551
\u2551  Admin Panel:   /vrs-admin-dashboard.html                     \u2551
\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563
\u2551  Environment:   ${process.env.NODE_ENV || 'development'}                       \u2551
\u2551  Readiness:     http://localhost:${PORT}/api/readiness               \u2551
\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D
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

export { app, server, wss, db, queueService };
