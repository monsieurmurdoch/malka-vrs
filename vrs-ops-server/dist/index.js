"use strict";
/**
 * VRS Operations Server
 *
 * Backend for:
 * - Call logging and tracking
 * - Interpreter status management
 * - Live dashboard data
 * - Admin API
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.wss = exports.server = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const fs_1 = __importDefault(require("fs"));
const http_1 = require("http");
const path_1 = __importDefault(require("path"));
const ws_1 = require("ws");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const uuid_1 = require("uuid");
const dotenv_1 = __importDefault(require("dotenv"));
const zod_1 = require("zod");
dotenv_1.default.config();
const app = (0, express_1.default)();
exports.app = app;
const server = (0, http_1.createServer)(app);
exports.server = server;
const wss = new ws_1.WebSocketServer({ server, path: '/ws' });
exports.wss = wss;
const PORT = process.env.PORT || 3003;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DEFAULT_SHARED_JWT_SECRET = 'vrs-ops-shared-secret';
const JWT_SECRET = process.env.VRS_SHARED_JWT_SECRET || process.env.JWT_SECRET || '';
if (!JWT_SECRET) {
    console.error('FATAL: VRS_SHARED_JWT_SECRET or JWT_SECRET environment variable is required.');
    console.error('Set it in your .env file before starting the server.');
    process.exit(1);
}
const AUTH_WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const AUTH_MAX_ATTEMPTS = Number(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS || 5);
const DATA_DIR = path_1.default.resolve(__dirname, '..', 'data');
const OPS_STATE_FILE = path_1.default.join(DATA_DIR, 'ops-state.json');
const BOOTSTRAP_SUPERADMIN_ENABLED = process.env.ENABLE_BOOTSTRAP_SUPERADMIN !== 'false';
const BOOTSTRAP_SUPERADMIN_USERNAME = process.env.VRS_BOOTSTRAP_SUPERADMIN_USERNAME || 'superadmin';
const BOOTSTRAP_SUPERADMIN_PASSWORD = process.env.VRS_BOOTSTRAP_SUPERADMIN_PASSWORD || '';
if (!BOOTSTRAP_SUPERADMIN_PASSWORD) {
    console.error('FATAL: VRS_BOOTSTRAP_SUPERADMIN_PASSWORD environment variable is required.');
    console.error('Set it in your .env file before starting the server.');
    process.exit(1);
}
const BOOTSTRAP_SUPERADMIN_NAME = process.env.VRS_BOOTSTRAP_SUPERADMIN_NAME || 'Malka Superadmin';
const MAX_AUDIT_EVENTS = 500;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
// Middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: CORS_ORIGIN
}));
app.use(express_1.default.json());
// Validation helper
function validateRequest(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            const details = {};
            for (const issue of result.error.issues) {
                const key = issue.path.join('.') || '_root';
                if (!details[key])
                    details[key] = issue.message;
            }
            res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details });
            return;
        }
        req.body = result.data;
        next();
    };
}
// Schemas
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().max(254).optional(),
    identifier: zod_1.z.string().max(254).optional(),
    username: zod_1.z.string().max(254).optional(),
    password: zod_1.z.string().min(1),
    role: zod_1.z.enum(['admin', 'interpreter', 'superadmin']).optional()
}).refine(data => data.email || data.identifier || data.username, {
    message: 'Username or email is required',
    path: ['identifier']
});
const createCallSchema = zod_1.z.object({
    clientId: zod_1.z.string().max(100).optional(),
    clientName: zod_1.z.string().max(100).optional(),
    language: zod_1.z.string().max(20).optional(),
    roomId: zod_1.z.string().max(100).optional()
});
const updateCallSchema = zod_1.z.object({
    status: zod_1.z.enum(['waiting', 'active', 'ended', 'abandoned']).optional(),
    interpreterId: zod_1.z.string().max(100).optional(),
    interpreterName: zod_1.z.string().max(100).optional()
}).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided'
});
const updateInterpreterStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['available', 'busy', 'offline', 'break']).optional()
});
const createAccountSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100),
    email: zod_1.z.string().max(254).optional(),
    username: zod_1.z.string().max(100).optional(),
    password: zod_1.z.string().min(8).max(128),
    role: zod_1.z.enum(['admin', 'interpreter', 'superadmin']),
    languages: zod_1.z.array(zod_1.z.string().max(20)).min(1).optional().default(['ASL'])
});
// In-memory storage (replace with database in production)
const interpreters = new Map();
const clients = new Map();
const callSessions = new Map();
const activeCalls = new Map();
const dailyStats = new Map();
// WebSocket clients for live updates
const wsClients = new Set();
const authAttemptStore = new Map();
function ensureDataDir() {
    if (!fs_1.default.existsSync(DATA_DIR)) {
        fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
    }
}
function loadPersistedOpsState() {
    ensureDataDir();
    if (!fs_1.default.existsSync(OPS_STATE_FILE)) {
        return {
            accounts: [],
            audit: []
        };
    }
    try {
        const raw = fs_1.default.readFileSync(OPS_STATE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return {
            accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
            audit: Array.isArray(parsed.audit) ? parsed.audit : []
        };
    }
    catch (error) {
        console.error('Failed to load ops state file:', error);
        return {
            accounts: [],
            audit: []
        };
    }
}
function savePersistedOpsState(state) {
    ensureDataDir();
    fs_1.default.writeFileSync(OPS_STATE_FILE, JSON.stringify(state, null, 2));
}
function normalizeIdentifier(value) {
    return value?.trim().toLowerCase() || '';
}
function normalizeUsername(value) {
    return value?.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-') || '';
}
function normalizeName(value) {
    return value?.trim() || '';
}
function createUsernameFromName(name) {
    const normalized = normalizeUsername(name?.replace(/\s+/g, '.'));
    return normalized || `user-${Date.now()}`;
}
function getAccountLoginEmail(record) {
    if (record.email?.trim()) {
        return record.email.trim();
    }
    const username = record.username || createUsernameFromName(record.name);
    return `${normalizeUsername(username)}@local.vrs`;
}
function getAccountPublicEmail(record) {
    return record.email?.trim() || '';
}
function normalizeAccountRecord(record) {
    const normalizedName = normalizeName(record.name || record.username || record.email || 'VRS User');
    const username = normalizeUsername(record.username)
        || (!record.email ? createUsernameFromName(normalizedName) : undefined);
    return {
        ...record,
        active: record.active !== false,
        createdAt: record.createdAt || new Date().toISOString(),
        email: record.email?.trim(),
        id: record.id || (0, uuid_1.v4)(),
        languages: record.languages || ['ASL'],
        name: normalizedName,
        role: record.role || 'interpreter',
        username
    };
}
function createBootstrapSuperadminRecord() {
    return normalizeAccountRecord({
        email: '',
        name: BOOTSTRAP_SUPERADMIN_NAME,
        passwordHash: bcryptjs_1.default.hashSync(BOOTSTRAP_SUPERADMIN_PASSWORD, 10),
        role: 'superadmin',
        username: BOOTSTRAP_SUPERADMIN_USERNAME
    });
}
function getAccountMatchKey(record) {
    return normalizeIdentifier(record.email) || normalizeUsername(record.username) || record.id || '';
}
function mergeAccountRecords(...collections) {
    const merged = new Map();
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
let auditEvents = Array.isArray(persistedOpsState.audit) ? persistedOpsState.audit : [];
function persistOpsState() {
    savePersistedOpsState({
        accounts: authDirectory,
        audit: auditEvents
    });
}
function sanitizeAccount(record) {
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
function recordOpsAudit(event, details) {
    const auditEntry = {
        details,
        event,
        id: (0, uuid_1.v4)(),
        timestamp: new Date().toISOString()
    };
    auditEvents = [auditEntry, ...auditEvents].slice(0, MAX_AUDIT_EVENTS);
    persistOpsState();
    if (typeof broadcastEvent === 'function') {
        broadcastEvent('ops_audit', auditEntry);
    }
}
function findAuthRecord(identifier, role) {
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
            passwordHash: bcryptjs_1.default.hashSync(BOOTSTRAP_SUPERADMIN_PASSWORD, 10),
            role: 'superadmin',
            username: BOOTSTRAP_SUPERADMIN_USERNAME
        });
        authDirectory = authDirectory.map(record => record.id === existing.id ? updatedBootstrap : record);
        persistOpsState();
        return;
    }
    const bootstrapRecord = createBootstrapSuperadminRecord();
    authDirectory = [bootstrapRecord, ...authDirectory];
    persistOpsState();
    console.warn(`[Security] Bootstrap superadmin enabled for local ops: ${BOOTSTRAP_SUPERADMIN_USERNAME} / ${BOOTSTRAP_SUPERADMIN_PASSWORD}`);
}
function auditAuth(event, details) {
    console.log(`[AuthAudit] ${event}`, JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        ...details
    }));
    recordOpsAudit(event, details);
}
function loadAuthDirectory() {
    const rawDirectory = process.env.VRS_USER_DIRECTORY_JSON;
    if (!rawDirectory) {
        return [];
    }
    try {
        const records = JSON.parse(rawDirectory);
        return Array.isArray(records) ? records.map(normalizeAccountRecord) : [];
    }
    catch (error) {
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
    const warnings = [];
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
    const storageFileExists = fs_1.default.existsSync(OPS_STATE_FILE);
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
function getRateLimitKey(req, role, email) {
    return `${req.ip || 'unknown'}:${role}:${email.trim().toLowerCase()}`;
}
function isRateLimited(key) {
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
function recordAuthAttempt(key, success) {
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
async function getAuthRecord(identifier, password, role) {
    const record = findAuthRecord(identifier, role)
        || (!role ? findAuthRecord(identifier, 'admin') || findAuthRecord(identifier, 'superadmin') : null);
    if (!record?.passwordHash) {
        return null;
    }
    const validPassword = await bcryptjs_1.default.compare(password, record.passwordHash);
    if (!validPassword) {
        return null;
    }
    return {
        email: getAccountLoginEmail(record),
        id: record.id,
        languages: record.languages || ['ASL'],
        name: record.name || record.username || getAccountLoginEmail(record).split('@')[0],
        publicEmail: getAccountPublicEmail(record),
        role: record.role || (role || 'interpreter'),
        username: record.username || ''
    };
}
// ==================== Authentication ====================
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) {
        res.status(401).json({ error: 'No token provided', code: 'AUTH_REQUIRED' });
        return;
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    }
    catch (error) {
        res.status(403).json({ error: 'Invalid or expired token', code: 'AUTH_INVALID' });
    }
}
function requireRole(...roles) {
    return (req, res, next) => {
        const user = req.user;
        if (!user || !roles.includes(user.role)) {
            res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' });
            return;
        }
        next();
    };
}
// ==================== Auth Endpoints ====================
/**
 * Login endpoint for interpreters and admins
 */
app.post('/api/auth/login', validateRequest(loginSchema), async (req, res) => {
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
    const rateLimitKey = getRateLimitKey(req, normalizedRole || 'ops', loginIdentifier);
    if (isRateLimited(rateLimitKey)) {
        auditAuth('login_rate_limited', { identifier: loginIdentifier, role: normalizedRole || 'ops', ip: req.ip });
        res.status(429).json({ error: 'Too many failed login attempts. Please try again later.', code: 'RATE_LIMITED' });
        return;
    }
    const authRecord = await getAuthRecord(loginIdentifier, password, normalizedRole);
    if (!authRecord) {
        recordAuthAttempt(rateLimitKey, false);
        auditAuth('login_failed', { identifier: loginIdentifier, role: normalizedRole || 'ops', ip: req.ip });
        res.status(401).json({ error: 'Invalid credentials', code: 'AUTH_FAILED' });
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
    const token = jsonwebtoken_1.default.sign({
        userId,
        role: authRecord.role,
        email: authRecord.email,
        name: authRecord.name,
        languages: authRecord.languages,
        username: authRecord.username,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000)
            + ((authRecord.role === 'interpreter' || authRecord.role === 'captioner') ? 8 * 60 * 60 : 12 * 60 * 60)
    }, JWT_SECRET);
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
app.get('/api/auth/validate', authenticateToken, (req, res) => {
    const user = req.user;
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
app.get('/api/health', (_req, res) => {
    res.json(getOpsHealthSnapshot());
});
app.get('/api/readiness', (_req, res) => {
    const snapshot = getOpsHealthSnapshot();
    res.status(snapshot.ready ? 200 : 503).json(snapshot);
});
// ==================== Call Endpoints ====================
/**
 * Log a new call request
 */
app.post('/api/calls', authenticateToken, validateRequest(createCallSchema), (req, res) => {
    const { clientId, clientName, language, roomId } = req.body;
    const callId = (0, uuid_1.v4)();
    const call = {
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
app.patch('/api/calls/:callId', authenticateToken, validateRequest(updateCallSchema), (req, res) => {
    const { callId } = req.params;
    const updates = req.body;
    const call = callSessions.get(callId);
    if (!call) {
        res.status(404).json({ error: 'Call not found', code: 'NOT_FOUND' });
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
app.get('/api/calls', authenticateToken, requireRole('admin', 'interpreter'), (req, res) => {
    const { status, date, interpreterId, limit = 100 } = req.query;
    let calls = Array.from(callSessions.values());
    // Filters
    if (status) {
        calls = calls.filter(c => c.status === status);
    }
    if (date) {
        const filterDate = new Date(date).toDateString();
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
app.get('/api/calls/:callId', authenticateToken, (req, res) => {
    const { callId } = req.params;
    const call = callSessions.get(callId);
    if (!call) {
        res.status(404).json({ error: 'Call not found', code: 'NOT_FOUND' });
        return;
    }
    res.json(call);
});
// ==================== Interpreter Endpoints ====================
/**
 * Get all interpreters
 */
app.get('/api/interpreters', authenticateToken, (req, res) => {
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
app.patch('/api/interpreters/:interpreterId/status', authenticateToken, validateRequest(updateInterpreterStatusSchema), (req, res) => {
    const { interpreterId } = req.params;
    const { status } = req.body;
    let interpreter = interpreters.get(interpreterId);
    if (!interpreter) {
        // Create interpreter if doesn't exist
        const user = req.user;
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
    }
    else {
        interpreter.status = status || interpreter.status;
    }
    // Broadcast status change
    broadcastEvent('interpreter_status', interpreter);
    res.json(interpreter);
});
/**
 * Get interpreter stats
 */
app.get('/api/interpreters/:interpreterId/stats', authenticateToken, (req, res) => {
    const { interpreterId } = req.params;
    const interpreter = interpreters.get(interpreterId);
    if (!interpreter) {
        res.status(404).json({ error: 'Interpreter not found', code: 'NOT_FOUND' });
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
app.get('/api/dashboard/queue', authenticateToken, (req, res) => {
    const pendingCalls = Array.from(callSessions.values())
        .filter(c => c.status === 'waiting');
    const availableInterpreters = Array.from(interpreters.values())
        .filter(i => i.status === 'available');
    const waitTimes = pendingCalls
        .map(c => Math.round((Date.now() - c.requestedAt.getTime()) / 1000));
    const stats = {
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
app.get('/api/dashboard/live', authenticateToken, (req, res) => {
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
app.get('/api/dashboard/stats/:date?', authenticateToken, requireRole('admin', 'superadmin'), (req, res) => {
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
function ensureUniqueAccountFields(account, existingId) {
    const normalizedEmail = normalizeIdentifier(account.email);
    const normalizedUsername = normalizeUsername(account.username);
    return !authDirectory.some(candidate => {
        if (candidate.id === existingId) {
            return false;
        }
        return Boolean((normalizedEmail && normalizeIdentifier(candidate.email) === normalizedEmail)
            || (normalizedUsername && normalizeUsername(candidate.username) === normalizedUsername));
    });
}
app.get('/api/admin/accounts', authenticateToken, requireRole('superadmin'), (_req, res) => {
    const accounts = authDirectory
        .slice()
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .map(sanitizeAccount);
    res.json(accounts);
});
app.post('/api/admin/accounts', authenticateToken, requireRole('superadmin'), validateRequest(createAccountSchema), async (req, res) => {
    const actor = req.user;
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
        res.status(400).json({ error: 'Role must be superadmin, admin, captioner, or interpreter', code: 'VALIDATION_ERROR' });
        return;
    }
    if (!password || !normalizedName) {
        res.status(400).json({ error: 'Name and password are required', code: 'VALIDATION_ERROR' });
        return;
    }
    if (!email && !normalizedUsername) {
        res.status(400).json({ error: 'Provide either an email or a username', code: 'VALIDATION_ERROR' });
        return;
    }
    const nextAccount = normalizeAccountRecord({
        createdBy: actor.userId,
        email: String(email || '').trim(),
        languages: Array.isArray(languages) && languages.length ? languages : ['ASL'],
        name: normalizedName,
        passwordHash: await bcryptjs_1.default.hash(password, 10),
        role: normalizedRole,
        username: normalizedUsername
    });
    if (!ensureUniqueAccountFields(nextAccount)) {
        res.status(409).json({ error: 'An account with that email or username already exists', code: 'CONFLICT' });
        return;
    }
    authDirectory = [nextAccount, ...authDirectory];
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
app.get('/api/admin/audit', authenticateToken, requireRole('admin', 'superadmin'), (req, res) => {
    const limit = Number(req.query.limit || 100);
    res.json(auditEvents.slice(0, limit));
});
app.get('/api/admin/monitoring/summary', authenticateToken, requireRole('admin', 'superadmin'), (_req, res) => {
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
wss.on('connection', (ws) => {
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
function sendInitialState(ws) {
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
function broadcastEvent(eventType, data) {
    const message = JSON.stringify({ type: eventType, data, timestamp: new Date() });
    wsClients.forEach(client => {
        if (client.readyState === ws_1.WebSocket.OPEN) {
            client.send(message);
        }
    });
}
// ==================== Helpers ====================
function calculateAverageWait(calls) {
    if (calls.length === 0)
        return 0;
    const waits = calls.map(c => Math.round((Date.now() - c.requestedAt.getTime()) / 1000));
    return Math.round(waits.reduce((a, b) => a + b, 0) / waits.length);
}
function calculateAverage(numbers) {
    if (numbers.length === 0)
        return 0;
    return Math.round(numbers.reduce((a, b) => a + b, 0) / numbers.length);
}
function calculatePeakHour(calls) {
    if (calls.length === 0)
        return 0;
    const hourCounts = new Array(24).fill(0);
    calls.forEach(c => {
        const hour = c.requestedAt.getHours();
        hourCounts[hour]++;
    });
    return hourCounts.indexOf(Math.max(...hourCounts));
}
function updateDailyStats(call) {
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
    if (call.status === 'ended')
        stats.completedCalls++;
    if (call.status === 'abandoned')
        stats.abandonedCalls++;
    if (call.duration)
        stats.interpreterMinutes += call.duration / 60;
    dailyStats.set(date, stats);
}
// ==================== Start Server ====================
app.use((err, _req, res, _next) => {
    console.error('[OpsServer] Error:', err);
    res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        ...(process.env.NODE_ENV === 'development' && { details: { message: err.message } })
    });
});
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
//# sourceMappingURL=index.js.map