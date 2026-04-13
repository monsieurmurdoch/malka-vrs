/**
 * VRS Operations Server
 *
 * Backend for:
 * - Call logging and tracking
 * - Interpreter status management
 * - Live dashboard data
 * - Admin API
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import { createServer } from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

import { CallSession, Interpreter, Client, QueueStats, DailyStats, AuthToken, InterpreterStatus, CallStatus } from './types';

const app: Express = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const PORT = process.env.PORT || 3003;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DEFAULT_SHARED_JWT_SECRET = 'vrs-ops-shared-secret';
const JWT_SECRET: string = process.env.VRS_SHARED_JWT_SECRET || process.env.JWT_SECRET || '';
if (!JWT_SECRET) {
    console.error('FATAL: VRS_SHARED_JWT_SECRET or JWT_SECRET environment variable is required.');
    console.error('Set it in your .env file before starting the server.');
    process.exit(1);
}
const AUTH_WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const AUTH_MAX_ATTEMPTS = Number(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS || 5);
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const OPS_STATE_FILE = path.join(DATA_DIR, 'ops-state.json');
const BOOTSTRAP_SUPERADMIN_ENABLED = process.env.ENABLE_BOOTSTRAP_SUPERADMIN !== 'false';
const BOOTSTRAP_SUPERADMIN_USERNAME = process.env.VRS_BOOTSTRAP_SUPERADMIN_USERNAME || 'superadmin';
const BOOTSTRAP_SUPERADMIN_PASSWORD: string = process.env.VRS_BOOTSTRAP_SUPERADMIN_PASSWORD || '';
if (!BOOTSTRAP_SUPERADMIN_PASSWORD) {
    console.error('FATAL: VRS_BOOTSTRAP_SUPERADMIN_PASSWORD environment variable is required.');
    console.error('Set it in your .env file before starting the server.');
    process.exit(1);
}
const BOOTSTRAP_SUPERADMIN_NAME = process.env.VRS_BOOTSTRAP_SUPERADMIN_NAME || 'Malka Superadmin';
const MAX_AUDIT_EVENTS = 500;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Middleware
app.use(helmet());
app.use(cors({
    origin: CORS_ORIGIN
}));
app.use(express.json());

// In-memory storage (replace with database in production)
const interpreters: Map<string, Interpreter> = new Map();
const clients: Map<string, Client> = new Map();
const callSessions: Map<string, CallSession> = new Map();
const activeCalls: Map<string, CallSession> = new Map();
const dailyStats: Map<string, DailyStats> = new Map();

// WebSocket clients for live updates
const wsClients: Set<WebSocket> = new Set();

type AuthDirectoryRecord = {
    active?: boolean;
    createdAt?: string;
    createdBy?: string;
    email?: string;
    id?: string;
    lastLoginAt?: string;
    languages?: string[];
    name?: string;
    passwordHash?: string;
    role?: 'admin' | 'captioner' | 'interpreter' | 'superadmin';
    username?: string;
};

const authAttemptStore = new Map<string, { attempts: number; expiresAt: number }>();

type OpsAuditEvent = {
    details: Record<string, unknown>;
    event: string;
    id: string;
    timestamp: string;
};

type PersistedOpsState = {
    accounts: AuthDirectoryRecord[];
    audit: OpsAuditEvent[];
};

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function loadPersistedOpsState(): PersistedOpsState {
    ensureDataDir();

    if (!fs.existsSync(OPS_STATE_FILE)) {
        return {
            accounts: [],
            audit: []
        };
    }

    try {
        const raw = fs.readFileSync(OPS_STATE_FILE, 'utf8');
        const parsed = JSON.parse(raw) as PersistedOpsState;

        return {
            accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
            audit: Array.isArray(parsed.audit) ? parsed.audit : []
        };
    } catch (error) {
        console.error('Failed to load ops state file:', error);

        return {
            accounts: [],
            audit: []
        };
    }
}

function savePersistedOpsState(state: PersistedOpsState) {
    ensureDataDir();
    fs.writeFileSync(OPS_STATE_FILE, JSON.stringify(state, null, 2));
}

function normalizeIdentifier(value?: string) {
    return value?.trim().toLowerCase() || '';
}

function normalizeUsername(value?: string) {
    return value?.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-') || '';
}

function normalizeName(value?: string) {
    return value?.trim() || '';
}

function createUsernameFromName(name?: string) {
    const normalized = normalizeUsername(name?.replace(/\s+/g, '.'));

    return normalized || `user-${Date.now()}`;
}

function getAccountLoginEmail(record: AuthDirectoryRecord) {
    if (record.email?.trim()) {
        return record.email.trim();
    }

    const username = record.username || createUsernameFromName(record.name);

    return `${normalizeUsername(username)}@local.vrs`;
}

function getAccountPublicEmail(record: AuthDirectoryRecord) {
    return record.email?.trim() || '';
}

function normalizeAccountRecord(record: AuthDirectoryRecord): AuthDirectoryRecord {
    const normalizedName = normalizeName(record.name || record.username || record.email || 'VRS User');
    const username = normalizeUsername(record.username)
        || (!record.email ? createUsernameFromName(normalizedName) : undefined);

    return {
        ...record,
        active: record.active !== false,
        createdAt: record.createdAt || new Date().toISOString(),
        email: record.email?.trim(),
        id: record.id || uuidv4(),
        languages: record.languages || [ 'ASL' ],
        name: normalizedName,
        role: record.role || 'interpreter',
        username
    };
}

function createBootstrapSuperadminRecord(): AuthDirectoryRecord {
    return normalizeAccountRecord({
        email: '',
        name: BOOTSTRAP_SUPERADMIN_NAME,
        passwordHash: bcrypt.hashSync(BOOTSTRAP_SUPERADMIN_PASSWORD, 10),
        role: 'superadmin',
        username: BOOTSTRAP_SUPERADMIN_USERNAME
    });
}

function getAccountMatchKey(record: AuthDirectoryRecord) {
    return normalizeIdentifier(record.email) || normalizeUsername(record.username) || record.id || '';
}

function mergeAccountRecords(...collections: AuthDirectoryRecord[][]) {
    const merged = new Map<string, AuthDirectoryRecord>();

    collections.flat().forEach(record => {
        const normalized = normalizeAccountRecord(record);
        const key = getAccountMatchKey(normalized);

        if (!key) {
            return;
        }

        merged.set(key, normalized);
    });

    return Array.from(merged.values());
}

const persistedOpsState = loadPersistedOpsState();
let authDirectory = mergeAccountRecords(loadAuthDirectory(), persistedOpsState.accounts);
let auditEvents: OpsAuditEvent[] = Array.isArray(persistedOpsState.audit) ? persistedOpsState.audit : [];

function persistOpsState() {
    savePersistedOpsState({
        accounts: authDirectory,
        audit: auditEvents
    });
}

function sanitizeAccount(record: AuthDirectoryRecord) {
    return {
        active: record.active !== false,
        createdAt: record.createdAt,
        createdBy: record.createdBy || null,
        email: getAccountPublicEmail(record),
        id: record.id,
        languages: record.languages || [],
        lastLoginAt: record.lastLoginAt || null,
        name: record.name,
        role: record.role,
        username: record.username || ''
    };
}

function recordOpsAudit(event: string, details: Record<string, unknown>) {
    const auditEntry: OpsAuditEvent = {
        details,
        event,
        id: uuidv4(),
        timestamp: new Date().toISOString()
    };

    auditEvents = [ auditEntry, ...auditEvents ].slice(0, MAX_AUDIT_EVENTS);
    persistOpsState();

    if (typeof broadcastEvent === 'function') {
        broadcastEvent('ops_audit', auditEntry);
    }
}

function findAuthRecord(identifier: string, role?: 'admin' | 'captioner' | 'interpreter' | 'superadmin' | null) {
    const normalizedIdentifier = normalizeIdentifier(identifier);

    return authDirectory.find(candidate => {
        if (candidate.active === false) {
            return false;
        }

        if (role && candidate.role !== role) {
            return false;
        }

        const candidateEmail = normalizeIdentifier(candidate.email);
        const candidateUsername = normalizeUsername(candidate.username);

        return normalizedIdentifier === candidateEmail
            || normalizedIdentifier === candidateUsername;
    }) || null;
}

function assertBootstrapSuperadmin() {
    if (!BOOTSTRAP_SUPERADMIN_ENABLED) {
        return;
    }

    const existing = findAuthRecord(BOOTSTRAP_SUPERADMIN_USERNAME, 'superadmin');

    if (existing) {
        const updatedBootstrap = normalizeAccountRecord({
            ...existing,
            name: BOOTSTRAP_SUPERADMIN_NAME,
            passwordHash: bcrypt.hashSync(BOOTSTRAP_SUPERADMIN_PASSWORD, 10),
            role: 'superadmin',
            username: BOOTSTRAP_SUPERADMIN_USERNAME
        });

        authDirectory = authDirectory.map(record =>
            record.id === existing.id ? updatedBootstrap : record
        );
        persistOpsState();
        return;
    }

    const bootstrapRecord = createBootstrapSuperadminRecord();
    authDirectory = [ bootstrapRecord, ...authDirectory ];
    persistOpsState();
    console.warn(`[Security] Bootstrap superadmin enabled for local ops: ${BOOTSTRAP_SUPERADMIN_USERNAME} / ${BOOTSTRAP_SUPERADMIN_PASSWORD}`);
}

function auditAuth(event: string, details: Record<string, unknown>) {
    console.log(`[AuthAudit] ${event}`, JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        ...details
    }));
    recordOpsAudit(event, details);
}

function loadAuthDirectory(): AuthDirectoryRecord[] {
    const rawDirectory = process.env.VRS_USER_DIRECTORY_JSON;

    if (!rawDirectory) {
        return [];
    }

    try {
        const records = JSON.parse(rawDirectory) as AuthDirectoryRecord[];

        return Array.isArray(records) ? records.map(normalizeAccountRecord) : [];
    } catch (error) {
        console.error('Invalid VRS_USER_DIRECTORY_JSON:', error);

        return [];
    }
}

function assertSecureConfig() {
    if (JWT_SECRET === DEFAULT_SHARED_JWT_SECRET) {
        const message = 'VRS auth is using the default shared JWT secret. Set VRS_SHARED_JWT_SECRET or JWT_SECRET.';

        if (IS_PRODUCTION) {
            throw new Error(message);
        }

        console.warn(`[Security] ${message}`);
    }

    if (!authDirectory.length && !BOOTSTRAP_SUPERADMIN_ENABLED) {
        const message = 'VRS_USER_DIRECTORY_JSON is empty. Interpreter/admin login is disabled until secure credentials are configured.';

        if (IS_PRODUCTION) {
            throw new Error(message);
        }

        console.warn(`[Security] ${message}`);
    }
}

assertBootstrapSuperadmin();
assertSecureConfig();

function getOpsWarnings() {
    const warnings: string[] = [];

    if (BOOTSTRAP_SUPERADMIN_ENABLED) {
        warnings.push('bootstrap_superadmin_enabled');
    }

    if (CORS_ORIGIN === '*') {
        warnings.push('cors_origin_wildcard');
    }

    if (JWT_SECRET === DEFAULT_SHARED_JWT_SECRET) {
        warnings.push('default_shared_jwt_secret');
    }

    return warnings;
}

function getOpsHealthSnapshot() {
    ensureDataDir();

    const warnings = getOpsWarnings();
    const authDirectoryConfigured = authDirectory.length > 0;
    const storageFileExists = fs.existsSync(OPS_STATE_FILE);
    const ready = Boolean(JWT_SECRET) && authDirectoryConfigured && storageFileExists;

    return {
        checks: {
            authConfigured: Boolean(JWT_SECRET),
            authDirectoryConfigured,
            persistentStateAccessible: storageFileExists,
            websocketReady: Boolean(wss)
        },
        ready,
        service: 'vrs-ops-server',
        status: ready ? (warnings.length ? 'degraded' : 'ok') : 'not_ready',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        warnings,
        services: {
            auth: authDirectoryConfigured ? 'ready' : 'missing_credentials',
            opsWebSocketClients: wsClients.size,
            queueApi: 'external',
            storageFile: OPS_STATE_FILE,
            storageState: storageFileExists ? 'ready' : 'missing'
        }
    };
}

function getRateLimitKey(req: Request, role: string, email: string) {
    return `${req.ip || 'unknown'}:${role}:${email.trim().toLowerCase()}`;
}

function isRateLimited(key: string) {
    const now = Date.now();
    const existing = authAttemptStore.get(key);

    if (!existing) {
        return false;
    }

    if (existing.expiresAt <= now) {
        authAttemptStore.delete(key);

        return false;
    }

    return existing.attempts >= AUTH_MAX_ATTEMPTS;
}

function recordAuthAttempt(key: string, success: boolean) {
    if (success) {
        authAttemptStore.delete(key);
        return;
    }

    const now = Date.now();
    const existing = authAttemptStore.get(key);

    if (!existing || existing.expiresAt <= now) {
        authAttemptStore.set(key, {
            attempts: 1,
            expiresAt: now + AUTH_WINDOW_MS
        });
        return;
    }

    existing.attempts += 1;
    authAttemptStore.set(key, existing);
}

async function getAuthRecord(identifier: string, password: string, role?: 'admin' | 'captioner' | 'interpreter' | 'superadmin' | null) {
    const record = findAuthRecord(identifier, role)
        || (!role ? findAuthRecord(identifier, 'admin') || findAuthRecord(identifier, 'superadmin') : null);

    if (!record?.passwordHash) {
        return null;
    }

    const validPassword = await bcrypt.compare(password, record.passwordHash);

    if (!validPassword) {
        return null;
    }

    return {
        email: getAccountLoginEmail(record),
        id: record.id!,
        languages: record.languages || [ 'ASL' ],
        name: record.name || record.username || getAccountLoginEmail(record).split('@')[0],
        publicEmail: getAccountPublicEmail(record),
        role: record.role || (role || 'interpreter'),
        username: record.username || ''
    };
}

// ==================== Authentication ====================

function authenticateToken(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1];

    if (!token) {
        res.status(401).json({ error: 'No token provided' });
        return;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as unknown as AuthToken;
        (req as any).user = decoded;
        next();
    } catch (error) {
        res.status(403).json({ error: 'Invalid or expired token' });
    }
}

function requireRole(...roles: string[]): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = (req as any).user as AuthToken;
        if (!user || !roles.includes(user.role)) {
            res.status(403).json({ error: 'Insufficient permissions' });
            return;
        }
        next();
    };
}

// ==================== Auth Endpoints ====================

/**
 * Login endpoint for interpreters and admins
 */
app.post('/api/auth/login', async (req: Request, res: Response) => {
    const { email, identifier, password, role, username } = req.body;
    const loginIdentifier = String(identifier || email || username || '').trim();
    const normalizedRole = role === 'superadmin'
        ? 'superadmin'
        : role === 'admin'
            ? 'admin'
            : role === 'captioner'
                ? 'captioner'
            : role === 'interpreter'
                ? 'interpreter'
                : null;

    if (!loginIdentifier || !password) {
        res.status(400).json({ error: 'Username or email and password are required' });
        return;
    }

    const rateLimitKey = getRateLimitKey(req, normalizedRole || 'ops', loginIdentifier);

    if (isRateLimited(rateLimitKey)) {
        auditAuth('login_rate_limited', { identifier: loginIdentifier, role: normalizedRole || 'ops', ip: req.ip });
        res.status(429).json({ error: 'Too many failed login attempts. Please try again later.' });
        return;
    }

    const authRecord = await getAuthRecord(loginIdentifier, password, normalizedRole);

    if (!authRecord) {
        recordAuthAttempt(rateLimitKey, false);
        auditAuth('login_failed', { identifier: loginIdentifier, role: normalizedRole || 'ops', ip: req.ip });
        res.status(401).json({ error: 'Invalid credentials' });
        return;
    }

    recordAuthAttempt(rateLimitKey, true);

    const userId = authRecord.id;
    const accountIndex = authDirectory.findIndex(record => record.id === userId);

    if (accountIndex >= 0) {
        authDirectory[accountIndex] = {
            ...authDirectory[accountIndex],
            lastLoginAt: new Date().toISOString()
        };
        persistOpsState();
    }

    const token = jwt.sign(
        {
            userId,
            role: authRecord.role,
            email: authRecord.email,
            name: authRecord.name,
            languages: authRecord.languages,
            username: authRecord.username,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000)
                + ((authRecord.role === 'interpreter' || authRecord.role === 'captioner') ? 8 * 60 * 60 : 12 * 60 * 60)
        },
        JWT_SECRET
    );

    auditAuth('login_success', {
        identifier: loginIdentifier,
        ip: req.ip,
        role: authRecord.role,
        userId,
        username: authRecord.username
    });

    res.json({
        success: true,
        token,
        user: {
            id: userId,
            email: authRecord.publicEmail,
            name: authRecord.name,
            role: authRecord.role,
            languages: authRecord.languages,
            username: authRecord.username
        }
    });
});

/**
 * Validate existing token
 */
app.get('/api/auth/validate', authenticateToken, (req: Request, res: Response) => {
    const user = (req as any).user as AuthToken;
    res.json({
        valid: true,
        user: {
            id: user.userId,
            email: user.email,
            name: user.name,
            role: user.role,
            languages: user.languages,
            username: user.username || ''
        }
    });
});

app.get('/api/health', (_req: Request, res: Response) => {
    res.json(getOpsHealthSnapshot());
});

app.get('/api/readiness', (_req: Request, res: Response) => {
    const snapshot = getOpsHealthSnapshot();

    res.status(snapshot.ready ? 200 : 503).json(snapshot);
});

// ==================== Call Endpoints ====================

/**
 * Log a new call request
 */
app.post('/api/calls', authenticateToken, (req: Request, res: Response) => {
    const { clientId, clientName, language, roomId } = req.body;

    const callId = uuidv4();
    const call: CallSession = {
        id: callId,
        roomId: roomId || `vrs-${callId}`,
        clientId: clientId || 'anonymous',
        clientName: clientName || 'Guest',
        language: language || 'ASL',
        status: 'waiting',
        requestedAt: new Date()
    };

    callSessions.set(callId, call);

    // Broadcast to WebSocket clients
    broadcastEvent('call_request', call);

    res.status(201).json(call);
});

/**
 * Update call status
 */
app.patch('/api/calls/:callId', authenticateToken, (req: Request, res: Response) => {
    const { callId } = req.params;
    const updates = req.body;

    const call = callSessions.get(callId);
    if (!call) {
        res.status(404).json({ error: 'Call not found' });
        return;
    }

    // Apply updates
    Object.assign(call, updates);

    // Handle status changes
    if (updates.status === 'active' && !call.startedAt) {
        call.startedAt = new Date();
        call.matchedAt = call.matchedAt || new Date();
        call.waitTime = Math.round((call.matchedAt.getTime() - call.requestedAt.getTime()) / 1000);
        activeCalls.set(callId, call);

        // Update interpreter status
        if (call.interpreterId) {
            const interpreter = interpreters.get(call.interpreterId);
            if (interpreter) {
                interpreter.status = 'busy';
                interpreter.currentCallId = callId;
            }
        }
    }

    if (updates.status === 'ended' || updates.status === 'abandoned') {
        call.endedAt = new Date();
        if (call.startedAt) {
            call.duration = Math.round((call.endedAt.getTime() - call.startedAt.getTime()) / 1000);
        }
        activeCalls.delete(callId);

        // Update interpreter status
        if (call.interpreterId) {
            const interpreter = interpreters.get(call.interpreterId);
            if (interpreter) {
                interpreter.status = 'available';
                interpreter.currentCallId = undefined;
                interpreter.totalCallsToday++;
                interpreter.totalMinutesToday += Math.round((call.duration || 0) / 60);
            }
        }

        // Update daily stats
        updateDailyStats(call);
    }

    // Broadcast update
    broadcastEvent('call_update', call);

    res.json(call);
});

/**
 * Get call history
 */
app.get('/api/calls', authenticateToken, requireRole('admin', 'interpreter'), (req: Request, res: Response) => {
    const { status, date, interpreterId, limit = 100 } = req.query;

    let calls = Array.from(callSessions.values());

    // Filters
    if (status) {
        calls = calls.filter(c => c.status === status);
    }
    if (date) {
        const filterDate = new Date(date as string).toDateString();
        calls = calls.filter(c => c.requestedAt.toDateString() === filterDate);
    }
    if (interpreterId) {
        calls = calls.filter(c => c.interpreterId === interpreterId);
    }

    // Sort by most recent first
    calls.sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());

    // Limit
    calls = calls.slice(0, Number(limit));

    res.json(calls);
});

/**
 * Get single call details
 */
app.get('/api/calls/:callId', authenticateToken, (req: Request, res: Response) => {
    const { callId } = req.params;
    const call = callSessions.get(callId);

    if (!call) {
        res.status(404).json({ error: 'Call not found' });
        return;
    }

    res.json(call);
});

// ==================== Interpreter Endpoints ====================

/**
 * Get all interpreters
 */
app.get('/api/interpreters', authenticateToken, (req: Request, res: Response) => {
    const { status } = req.query;

    let interpreterList = Array.from(interpreters.values());

    if (status) {
        interpreterList = interpreterList.filter(i => i.status === status);
    }

    res.json(interpreterList);
});

/**
 * Update interpreter status
 */
app.patch('/api/interpreters/:interpreterId/status', authenticateToken, (req: Request, res: Response) => {
    const { interpreterId } = req.params;
    const { status } = req.body;

    let interpreter = interpreters.get(interpreterId);

    if (!interpreter) {
        // Create interpreter if doesn't exist
        const user = (req as any).user as AuthToken;
        interpreter = {
            id: interpreterId,
            email: user.email,
            name: user.name,
            role: 'interpreter',
            languages: user.languages || ['ASL'],
            status: status || 'available',
            totalCallsToday: 0,
            totalMinutesToday: 0,
            createdAt: new Date()
        };
        interpreters.set(interpreterId, interpreter);
    } else {
        interpreter.status = status || interpreter.status;
    }

    // Broadcast status change
    broadcastEvent('interpreter_status', interpreter);

    res.json(interpreter);
});

/**
 * Get interpreter stats
 */
app.get('/api/interpreters/:interpreterId/stats', authenticateToken, (req: Request, res: Response) => {
    const { interpreterId } = req.params;

    const interpreter = interpreters.get(interpreterId);
    if (!interpreter) {
        res.status(404).json({ error: 'Interpreter not found' });
        return;
    }

    // Get calls for this interpreter today
    const today = new Date().toDateString();
    const todayCalls = Array.from(callSessions.values())
        .filter(c => c.interpreterId === interpreterId && c.requestedAt.toDateString() === today);

    const stats = {
        interpreter: {
            id: interpreter.id,
            name: interpreter.name,
            status: interpreter.status,
            languages: interpreter.languages
        },
        today: {
            totalCalls: todayCalls.length,
            completedCalls: todayCalls.filter(c => c.status === 'ended').length,
            totalMinutes: interpreter.totalMinutesToday,
            averageCallDuration: todayCalls.length > 0
                ? Math.round(todayCalls.reduce((sum, c) => sum + (c.duration || 0), 0) / todayCalls.length)
                : 0
        },
        currentCall: interpreter.currentCallId ? callSessions.get(interpreter.currentCallId) : null
    };

    res.json(stats);
});

// ==================== Dashboard Endpoints ====================

/**
 * Get queue stats
 */
app.get('/api/dashboard/queue', authenticateToken, (req: Request, res: Response) => {
    const pendingCalls = Array.from(callSessions.values())
        .filter(c => c.status === 'waiting');

    const availableInterpreters = Array.from(interpreters.values())
        .filter(i => i.status === 'available');

    const waitTimes = pendingCalls
        .map(c => Math.round((Date.now() - c.requestedAt.getTime()) / 1000));

    const stats: QueueStats = {
        pendingRequests: pendingCalls.length,
        activeInterpreters: interpreters.size,
        availableInterpreters: availableInterpreters.length,
        averageWaitTime: waitTimes.length > 0
            ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length)
            : 0,
        longestWaitTime: waitTimes.length > 0 ? Math.max(...waitTimes) : 0
    };

    res.json(stats);
});

/**
 * Get live dashboard data
 */
app.get('/api/dashboard/live', authenticateToken, (req: Request, res: Response) => {
    const activeInterpreters = Array.from(interpreters.values())
        .filter(i => i.status !== 'offline');

    const pendingCalls = Array.from(callSessions.values())
        .filter(c => c.status === 'waiting');

    const currentCalls = Array.from(activeCalls.values());

    res.json({
        timestamp: new Date(),
        interpreters: {
            total: interpreters.size,
            online: activeInterpreters.length,
            available: activeInterpreters.filter(i => i.status === 'available').length,
            busy: activeInterpreters.filter(i => i.status === 'busy').length,
            onBreak: activeInterpreters.filter(i => i.status === 'break').length
        },
        queue: {
            pending: pendingCalls.length,
            averageWait: calculateAverageWait(pendingCalls)
        },
        calls: {
            active: currentCalls.length,
            list: currentCalls.map(c => ({
                id: c.id,
                clientName: c.clientName,
                interpreterName: c.interpreterName,
                language: c.language,
                duration: c.startedAt ? Math.round((Date.now() - c.startedAt.getTime()) / 1000) : 0
            }))
        }
    });
});

/**
 * Get daily stats
 */
app.get('/api/dashboard/stats/:date?', authenticateToken, requireRole('admin', 'superadmin'), (req: Request, res: Response) => {
    const date = req.params.date || new Date().toISOString().split('T')[0];

    let stats = dailyStats.get(date);

    if (!stats) {
        // Calculate stats for the date
        const targetDate = new Date(date);
        const dayCalls = Array.from(callSessions.values())
            .filter(c => c.requestedAt.toDateString() === targetDate.toDateString());

        stats = {
            date,
            totalCalls: dayCalls.length,
            completedCalls: dayCalls.filter(c => c.status === 'ended').length,
            abandonedCalls: dayCalls.filter(c => c.status === 'abandoned').length,
            averageWaitTime: calculateAverage(dayCalls.map(c => c.waitTime || 0)),
            averageCallDuration: calculateAverage(dayCalls.map(c => c.duration || 0)),
            peakHour: calculatePeakHour(dayCalls),
            interpreterMinutes: dayCalls.reduce((sum, c) => sum + (c.duration || 0), 0) / 60
        };

        dailyStats.set(date, stats);
    }

    res.json(stats);
});

function ensureUniqueAccountFields(account: AuthDirectoryRecord, existingId?: string) {
    const normalizedEmail = normalizeIdentifier(account.email);
    const normalizedUsername = normalizeUsername(account.username);

    return !authDirectory.some(candidate => {
        if (candidate.id === existingId) {
            return false;
        }

        return Boolean(
            (normalizedEmail && normalizeIdentifier(candidate.email) === normalizedEmail)
            || (normalizedUsername && normalizeUsername(candidate.username) === normalizedUsername)
        );
    });
}

app.get('/api/admin/accounts', authenticateToken, requireRole('superadmin'), (_req: Request, res: Response) => {
    const accounts = authDirectory
        .slice()
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .map(sanitizeAccount);

    res.json(accounts);
});

app.post('/api/admin/accounts', authenticateToken, requireRole('superadmin'), async (req: Request, res: Response) => {
    const actor = (req as any).user as AuthToken;
    const { email, languages, name, password, role, username } = req.body;
    const normalizedRole = role === 'superadmin'
        ? 'superadmin'
        : role === 'admin'
            ? 'admin'
            : role === 'captioner'
                ? 'captioner'
            : role === 'interpreter'
                ? 'interpreter'
                : null;
    const normalizedName = normalizeName(name || username || email);
    const normalizedUsername = normalizeUsername(username) || (!email ? createUsernameFromName(normalizedName) : '');

    if (!normalizedRole) {
        res.status(400).json({ error: 'Role must be superadmin, admin, captioner, or interpreter' });
        return;
    }

    if (!password || !normalizedName) {
        res.status(400).json({ error: 'Name and password are required' });
        return;
    }

    if (!email && !normalizedUsername) {
        res.status(400).json({ error: 'Provide either an email or a username' });
        return;
    }

    const nextAccount = normalizeAccountRecord({
        createdBy: actor.userId,
        email: String(email || '').trim(),
        languages: Array.isArray(languages) && languages.length ? languages : [ 'ASL' ],
        name: normalizedName,
        passwordHash: await bcrypt.hash(password, 10),
        role: normalizedRole,
        username: normalizedUsername
    });

    if (!ensureUniqueAccountFields(nextAccount)) {
        res.status(409).json({ error: 'An account with that email or username already exists' });
        return;
    }

    authDirectory = [ nextAccount, ...authDirectory ];
    persistOpsState();
    recordOpsAudit('account_created', {
        accountId: nextAccount.id,
        actorId: actor.userId,
        actorRole: actor.role,
        createdRole: normalizedRole,
        email: getAccountPublicEmail(nextAccount),
        username: nextAccount.username || ''
    });

    res.status(201).json({
        account: sanitizeAccount(nextAccount),
        bootstrapCredentials: normalizedRole === 'superadmin' && nextAccount.username === BOOTSTRAP_SUPERADMIN_USERNAME
            ? {
                password: BOOTSTRAP_SUPERADMIN_PASSWORD,
                username: BOOTSTRAP_SUPERADMIN_USERNAME
            }
            : undefined,
        success: true
    });
});

app.get('/api/admin/audit', authenticateToken, requireRole('admin', 'superadmin'), (req: Request, res: Response) => {
    const limit = Number(req.query.limit || 100);

    res.json(auditEvents.slice(0, limit));
});

app.get('/api/admin/monitoring/summary', authenticateToken, requireRole('admin', 'superadmin'), (_req: Request, res: Response) => {
    const now = Date.now();
    const authFailures = Array.from(authAttemptStore.values())
        .filter(entry => entry.expiresAt > now)
        .reduce((sum, entry) => sum + entry.attempts, 0);
    const health = getOpsHealthSnapshot();

    res.json({
        auth: {
            activeAccounts: authDirectory.filter(account => account.active !== false).length,
            bootstrapSuperadminEnabled: BOOTSTRAP_SUPERADMIN_ENABLED,
            lockedOutBuckets: Array.from(authAttemptStore.values()).filter(entry => entry.expiresAt > now).length,
            recentFailedAttempts: authFailures
        },
        queue: {
            activeCalls: activeCalls.size,
            pendingRequests: Array.from(callSessions.values()).filter(call => call.status === 'waiting').length
        },
        ready: health.ready,
        services: health.services,
        status: health.status,
        timestamp: health.timestamp,
        uptime: health.uptime,
        warnings: health.warnings
    });
});

// ==================== WebSocket ====================

wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected');
    wsClients.add(ws);

    // Send initial state
    sendInitialState(ws);

    ws.on('close', () => {
        wsClients.delete(ws);
        console.log('WebSocket client disconnected');
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        wsClients.delete(ws);
    });
});

function sendInitialState(ws: WebSocket): void {
    const state = {
        type: 'initial_state',
        data: {
            interpreters: Array.from(interpreters.values()),
            pendingCalls: Array.from(callSessions.values()).filter(c => c.status === 'waiting'),
            activeCalls: Array.from(activeCalls.values())
        }
    };
    ws.send(JSON.stringify(state));
}

function broadcastEvent(eventType: string, data: any): void {
    const message = JSON.stringify({ type: eventType, data, timestamp: new Date() });

    wsClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// ==================== Helpers ====================

function calculateAverageWait(calls: CallSession[]): number {
    if (calls.length === 0) return 0;
    const waits = calls.map(c => Math.round((Date.now() - c.requestedAt.getTime()) / 1000));
    return Math.round(waits.reduce((a, b) => a + b, 0) / waits.length);
}

function calculateAverage(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return Math.round(numbers.reduce((a, b) => a + b, 0) / numbers.length);
}

function calculatePeakHour(calls: CallSession[]): number {
    if (calls.length === 0) return 0;
    const hourCounts: number[] = new Array(24).fill(0);
    calls.forEach(c => {
        const hour = c.requestedAt.getHours();
        hourCounts[hour]++;
    });
    return hourCounts.indexOf(Math.max(...hourCounts));
}

function updateDailyStats(call: CallSession): void {
    const date = call.requestedAt.toISOString().split('T')[0];
    let stats = dailyStats.get(date);

    if (!stats) {
        stats = {
            date,
            totalCalls: 0,
            completedCalls: 0,
            abandonedCalls: 0,
            averageWaitTime: 0,
            averageCallDuration: 0,
            peakHour: 0,
            interpreterMinutes: 0
        };
    }

    stats.totalCalls++;
    if (call.status === 'ended') stats.completedCalls++;
    if (call.status === 'abandoned') stats.abandonedCalls++;
    if (call.duration) stats.interpreterMinutes += call.duration / 60;

    dailyStats.set(date, stats);
}

// ==================== Start Server ====================

server.listen(PORT, () => {
    console.log(`🚀 VRS Ops Server running on port ${PORT}`);
    console.log(`📊 Dashboard API: http://localhost:${PORT}/api/dashboard/live`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}/ws`);
    console.log(`🩺 Readiness: http://localhost:${PORT}/api/readiness`);

    const warnings = getOpsWarnings();
    if (warnings.length) {
        console.warn('[Ops] Startup warnings:', warnings.join(', '));
    }
});

export { app, server, wss };
