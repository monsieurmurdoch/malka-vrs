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
 *   lib/metrics.js          — Prometheus metrics collection
 *   lib/tracing.js          — OpenTelemetry distributed tracing
 */

// Initialize OpenTelemetry before other imports so auto-instrumentation works.
const tracing = require('../lib/tracing');
tracing.initialize();

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
import crypto from 'crypto';

type RequestWithLog = Request & { log?: { error: (data: unknown, message?: string) => void } };

const metrics = require('../lib/metrics');
const { httpMetricsMiddleware } = metrics;
const log = require('../lib/logger').module('server');
const { requestId, requestLogger } = require('../lib/middleware');

// Services
import * as db from './database';
import * as activityLogger from './lib/activity-logger';
import * as state from './lib/state';
import * as billingDb from './lib/billing-db';
import * as handoffService from './lib/handoff-service';
import * as voicemailService from './lib/voicemail-service';
import { configureStorageService } from './lib/storage-service';

// Route modules (still JS — migrated separately)
const { router: authRouter, setLegacyFlag } = require('../routes/auth');
const clientRouter = require('../routes/client');
const contactsRouter = require('../routes/contacts');
const interpreterRouter = require('../routes/interpreter');
const { router: adminRouter, setVoicemailServiceForAdmin } = require('../routes/admin');
const queueService = require('../lib/queue-service');
const handoffRouter = require('../routes/handoff');
const { router: voicemailRouter, setVoicemailService } = require('../routes/voicemail');
const ttsRouter = require('../routes/tts');
const googleContactsRouter = require('../routes/google-contacts');
const { validate, nameSchema, emailSchema, organizationSchema, z: zodLib } = require('../lib/validation');
const auth = require('../lib/auth');

// Billing routes (TypeScript — compiled)
const { router: billingAdminRouter } = require('./billing/routes/billing-admin');
const { router: billingDashboardRouter } = require('./billing/routes/billing-dashboard');
const { router: billingWebhookRouter } = require('./billing/routes/stripe-webhooks');

// WebSocket handler
const { handleConnection } = require('../ws/handler');

// ============================================
// CONFIGURATION
// ============================================

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.VRS_SHARED_JWT_SECRET || process.env.JWT_SECRET;
const TENANT_JWT_SECRETS = {
    malka: process.env.VRS_JWT_SECRET_MALKA,
    maple: process.env.VRS_JWT_SECRET_MAPLE
};
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
auth.init({
    defaultSecret: JWT_SECRET,
    tenantSecrets: TENANT_JWT_SECRETS
});

// The production stack sits behind nginx, so trust the first proxy hop for
// client IPs and secure-header handling.
app.set('trust proxy', 1);

// Propagate legacy admin flag
setLegacyFlag(LEGACY_ADMIN_LOGIN_ENABLED);

// ============================================
// SECURITY MIDDLEWARE
// ============================================

const DEFAULT_CORS_ORIGINS = [
    'http://localhost:8080',
    'https://localhost:8080',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://localhost:3001',
    'http://138.197.121.127',
    'https://138.197.121.127',
    'http://vrs.malkacomm.com',
    'https://vrs.malkacomm.com',
    'http://vri.malkacomm.com',
    'https://vri.malkacomm.com',
    'http://app.malkacomm.com',
    'https://app.malkacomm.com',
    'http://www.malkavrs.com',
    'https://www.malkavrs.com',
    'http://vri.maplecomm.ca',
    'https://vri.maplecomm.ca'
].join(',');
const CORS_ORIGINS = (process.env.CORS_ORIGINS || DEFAULT_CORS_ORIGINS)
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
            callback(null, false);
        }
    },
    credentials: true
}));

app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    next();
});

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'wasm-unsafe-eval'", ((_req: unknown, res: any) => `'nonce-${res.locals.cspNonce}'`) as any],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
            connectSrc: CONNECT_SRC,
            mediaSrc: ["'self'", 'blob:'],
            workerSrc: ["'self'", 'blob:'],
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

app.use(httpMetricsMiddleware);
app.use(requestId);
app.use(requestLogger);

// Stripe needs the exact raw body for webhook signature verification.
app.use('/api/billing/webhooks', billingWebhookRouter);

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ============================================
// SSI MIDDLEWARE (Jitsi Meet compatibility)
// ============================================

const staticRoot = path.join(__dirname, '..', '..');

function renderHtmlWithIncludes(filePath: string, res: Response, next: NextFunction): void {
    if (!filePath.startsWith(staticRoot)) {
        return next();
    }

    fs.readFile(filePath, 'utf8', (err: NodeJS.ErrnoException | null, data: string) => {
        if (err) {
            return next();
        }

        const nonce = res.locals.cspNonce || '';
        const resolved = data.replace(
            /<!--#include virtual="([^"]+)"\s*-->/g,
            (_match: string, includePath: string) => {
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
            .replace(/<script(?![^>]*\bsrc\b)([^>]*)>/gi, (match: string, attrs: string) => {
                if (/\bnonce=/.test(attrs)) return match;
                return `<script${attrs} nonce="${nonce}">`;
            })
            .replace(/<style([^>]*)>/gi, (match: string, attrs: string) => {
                if (/\bnonce=/.test(attrs)) return match;
                return `<style${attrs} nonce="${nonce}">`;
            });

        res.type('html').send(resolved);
    });
}

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

    renderHtmlWithIncludes(filePath, res, next);
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
    const tenantSecretStatus = auth.getTenantSecretStatus ? auth.getTenantSecretStatus() : {};
    for (const tenantId of ['malka', 'maple']) {
        if (!tenantSecretStatus[tenantId]) {
            warnings.push(`tenant_jwt_secret_missing:${tenantId}`);
        }
    }
    return warnings;
}

interface HealthSnapshot {
    checks: {
        authConfigured: boolean;
        databaseReady: boolean;
        billingReady: boolean;
        legacyAdminLoginDisabled: boolean;
        tenantJwtSecretsConfigured: boolean;
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
            tenantJwtSecretsConfigured: Object.values(auth.getTenantSecretStatus ? auth.getTenantSecretStatus() : {}).every(Boolean),
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

app.get('/health', (_req: Request, res: Response) => {
    const ready = isDatabaseReady && Boolean(JWT_SECRET);
    res.status(ready ? 200 : 503).json({
        status: ready ? 'ok' : 'not_ready',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.get('/metrics', async (_req: Request, res: Response) => {
    try {
        const queueStatus = typeof queueService.getStatus === 'function'
            ? queueService.getStatus()
            : { activeInterpreters: [], paused: false, pendingRequests: [], queueSize: 0, totalMatches: 0 };

        const m = metrics.metrics;
        m.queueDepth.set(queueStatus.queueSize);
        m.queuePaused.set(queueStatus.paused ? 1 : 0);
        m.wsConnections.set({ role: 'interpreter' }, state.clients.interpreters.size);
        m.wsConnections.set({ role: 'client' }, state.clients.clients.size);
        m.wsConnections.set({ role: 'admin' }, state.clients.admins.size);
        m.wsConnections.set({ role: 'total' }, wss.clients.size);

        const jvbUrl = process.env.JVB_STATS_URL;
        if (jvbUrl) {
            await metrics.scrapeJvbStats(jvbUrl);
        }

        res.set('Content-Type', metrics.register.contentType);
        res.end(await metrics.register.metrics());
    } catch {
        res.status(500).json({ error: 'Failed to collect metrics' });
    }
});

app.get('/api/vri/invites/:token', async (req: Request, res: Response) => {
    const token = String(req.params.token || '').trim();
    if (!token) {
        return res.status(400).json({ error: 'Missing invite token', code: 'VALIDATION_ERROR' });
    }

    try {
        const invite = await db.getVriSessionInvite(token);
        if (!invite) {
            return res.status(404).json({ error: 'Invite not found', code: 'NOT_FOUND' });
        }

        const status = invite.public_status || invite.status;
        res.json({
            token: invite.token,
            status,
            expiresAt: invite.expires_at,
            roomName: status === 'live' ? invite.room_name : null,
            guestName: invite.guest_name || null
        });
    } catch (error) {
        (req as RequestWithLog).log?.error({ err: error }, 'VRI invite lookup failed');
        res.status(500).json({ error: 'Failed to load invite', code: 'INTERNAL_ERROR' });
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

app.post('/api/vrs/register', validate(registerSchema), async (req: Request, res: Response) => {
    const { name, email } = req.body;

    try {
        const clientId = await db.createClient({
            name, email, organization: req.body.organization || 'Personal'
        });

        res.json({ success: true, id: clientId });
    } catch (error) {
        (req as RequestWithLog).log?.error({ err: error }, 'Registration failed');
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
app.use('/api/billing', billingAdminRouter);
app.use('/api/billing', billingDashboardRouter);

app.get([ '/login', '/client-login', '/client' ], (_req: Request, res: Response, next: NextFunction) => {
    renderHtmlWithIncludes(path.join(staticRoot, 'index.html'), res, next);
});

const roomRoutePattern = /^\/(?!(?:api|ops|twilio|images|css|libs|static|sounds|lang|fonts|modules|metadata|resources|react)(?:\/|$)|(?:health|readiness|metrics|favicon\.ico|manifest\.json|pwa-worker\.js)$)(?!.*\.[A-Za-z0-9]+$)[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/i;

app.get([
    /^\/(?:instant|vrs|vri|p2p|voicemail)-[A-Za-z0-9-]+$/i,
    roomRoutePattern
], (_req: Request, res: Response, next: NextFunction) => {
    renderHtmlWithIncludes(path.join(staticRoot, 'index.html'), res, next);
});

// ============================================
// ERROR HANDLER
// ============================================

app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
    (req as RequestWithLog).log?.error({ err: error }, 'Unhandled server error');
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
    queueService.broadcastToAdmins = (type: string, data: unknown) => state.broadcastToAdmins({ type, data });
    await queueService.initialize();
    await handoffService.initialize();
    await db.seedVoicemailSettings();

    // Initialize billing PostgreSQL (opt-in via BILLING_PG_HOST env var)
    try {
        await billingDb.initialize();
    } catch (billingErr) {
        console.warn('[Server] Billing DB initialization failed (non-fatal):', billingErr instanceof Error ? billingErr.message : billingErr);
    }

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

    const broadcastFn = (userId: string, message: object) => {
        const client = state.clients.clients.get(userId);
        if (client?.ws && client.ws.readyState === 1) {
            client.ws.send(JSON.stringify(message));
        }
    };
    await voicemailService.initialize(broadcastFn);
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
}).catch((error: unknown) => {
    isDatabaseReady = false;
    log.fatal({ err: error }, 'Failed to initialize database');
    process.exit(1);
});

export { app, server, wss, db, queueService };
