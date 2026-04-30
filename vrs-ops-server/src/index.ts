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
import { z, ZodError } from 'zod';
import { Pool } from 'pg';

dotenv.config();

import { CallSession, Interpreter, QueueStats, DailyStats, AuthToken, InterpreterStatus, CallStatus } from './types';

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
const TENANT_JWT_SECRETS: Record<string, string | undefined> = {
    malka: process.env.VRS_JWT_SECRET_MALKA,
    maple: process.env.VRS_JWT_SECRET_MAPLE
};
const AUTH_WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const AUTH_MAX_ATTEMPTS = Number(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS || 5);
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const OPS_STATE_FILE = path.join(DATA_DIR, 'ops-state.json');
const OPS_DATABASE_URL = process.env.OPS_DATABASE_URL || process.env.DATABASE_URL || '';
const OPS_PGHOST = process.env.OPS_PGHOST || process.env.PGHOST;
const OPS_PGPORT = Number(process.env.OPS_PGPORT || process.env.PGPORT || 5432);
const OPS_PGDATABASE = process.env.OPS_PGDATABASE || process.env.PGDATABASE || 'malka_vrs';
const OPS_PGUSER = process.env.OPS_PGUSER || process.env.PGUSER || 'malka';
const OPS_PGPASSWORD = process.env.OPS_PGPASSWORD || process.env.PGPASSWORD || 'malka';
const OPS_POSTGRES_ENABLED = Boolean(OPS_DATABASE_URL || OPS_PGHOST);
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
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:8080';

function getJwtSecretForTenant(tenantId?: string): string {
    return (tenantId && TENANT_JWT_SECRETS[tenantId]) || JWT_SECRET;
}

function verifyOpsToken(token: string): AuthToken {
    const decoded = jwt.decode(token) as AuthToken | null;
    const tenantId = typeof decoded?.tenantId === 'string' ? decoded.tenantId : undefined;
    const secrets = [
        getJwtSecretForTenant(tenantId),
        ...Object.values(TENANT_JWT_SECRETS),
        JWT_SECRET
    ].filter((secret, index, list): secret is string => Boolean(secret) && list.indexOf(secret) === index);

    let lastError: unknown;
    for (const secret of secrets) {
        try {
            return jwt.verify(token, secret) as unknown as AuthToken;
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError;
}

function signOpsToken(payload: AuthToken): string {
    return jwt.sign(payload, getJwtSecretForTenant(payload.tenantId));
}

function loadTenantConfigs(): Record<string, any> {
    const configDir = path.resolve(__dirname, '..', '..', 'whitelabel');
    if (!fs.existsSync(configDir)) return {};

    return fs.readdirSync(configDir)
        .filter(file => file.endsWith('.json'))
        .reduce<Record<string, any>>((configs, file) => {
            try {
                const config = JSON.parse(fs.readFileSync(path.join(configDir, file), 'utf8'));
                configs[config.tenantId || file.replace(/\.json$/, '')] = {
                    appName: config.brand?.appName,
                    billing: config.operations?.billing || {},
                    defaultServiceModes: config.operations?.defaultServiceModes || [],
                    domains: config.domains || {},
                    interpreterPools: config.operations?.interpreterPools || {},
                    mobileAssets: config.assets?.mobile || {},
                    providerName: config.brand?.providerName
                };
            } catch (error) {
                console.warn(`[Ops] Failed to read tenant config ${file}:`, error instanceof Error ? error.message : error);
            }
            return configs;
        }, {});
}

const TENANT_CONFIGS = loadTenantConfigs();

// Middleware
app.use(helmet());
app.use(cors({
    origin: CORS_ORIGIN
}));
app.use(express.json());

// Validation helper
function validateRequest(schema: z.ZodSchema) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            const details: Record<string, string> = {};
            for (const issue of result.error.issues) {
                const key = issue.path.join('.') || '_root';
                if (!details[key]) details[key] = issue.message;
            }
            res.status(400).json({ error: 'Validation failed', code: 'VALIDATION_ERROR', details });
            return;
        }
        req.body = result.data;
        next();
    };
}

// Schemas
const loginSchema = z.object({
    email: z.string().max(254).optional(),
    identifier: z.string().max(254).optional(),
    username: z.string().max(254).optional(),
    password: z.string().min(1),
    role: z.enum(['admin', 'interpreter', 'superadmin']).optional()
}).refine(data => data.email || data.identifier || data.username, {
    message: 'Username or email is required',
    path: ['identifier']
});

const createCallSchema = z.object({
    clientId: z.string().max(100).optional(),
    clientName: z.string().max(100).optional(),
    language: z.string().max(20).optional(),
    roomId: z.string().max(100).optional()
});

const updateCallSchema = z.object({
    status: z.enum(['waiting', 'active', 'ended', 'abandoned']).optional(),
    interpreterId: z.string().max(100).optional(),
    interpreterName: z.string().max(100).optional()
}).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided'
});

const updateInterpreterStatusSchema = z.object({
    status: z.enum(['available', 'busy', 'offline', 'break']).optional()
});

const createAccountSchema = z.object({
    name: z.string().min(1).max(100),
    email: z.string().max(254).optional(),
    username: z.string().max(100).optional(),
    password: z.string().min(8).max(128),
    role: z.enum(['admin', 'captioner', 'interpreter', 'superadmin']),
    languages: z.array(z.string().max(20)).min(1).optional().default(['ASL']),
    organization: z.string().max(120).optional(),
    permissions: z.array(z.string().max(80)).optional().default([]),
    profile: z.record(z.unknown()).optional().default({}),
    serviceModes: z.array(z.enum(['vrs', 'vri'])).min(1).optional().default(['vrs']),
    tenantId: z.string().max(80).optional().default('malka')
});

const updateAccountSchema = z.object({
    active: z.boolean().optional(),
    email: z.string().max(254).optional(),
    languages: z.array(z.string().max(20)).min(1).optional(),
    name: z.string().min(1).max(100).optional(),
    organization: z.string().max(120).optional(),
    password: z.string().min(8).max(128).optional(),
    permissions: z.array(z.string().max(80)).optional(),
    profile: z.record(z.unknown()).optional(),
    serviceModes: z.array(z.enum(['vrs', 'vri'])).min(1).optional(),
    tenantId: z.string().max(80).optional(),
    username: z.string().max(100).optional()
}).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided'
});

// Live ops state is PostgreSQL-backed when OPS_DATABASE_URL/OPS_PG* is set.
// The maps are a local cache and development fallback, not the production source of truth.
const interpreters: Map<string, Interpreter> = new Map();
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
    organization?: string;
    passwordHash?: string;
    permissions?: string[];
    profile?: Record<string, unknown>;
    role?: 'admin' | 'captioner' | 'interpreter' | 'superadmin';
    serviceModes?: string[];
    tenantId?: string;
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

let opsPool: Pool | null = null;
let opsStorage: 'postgres' | 'json' = OPS_POSTGRES_ENABLED ? 'postgres' : 'json';
let opsStorageReady = false;

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
        organization: record.organization?.trim() || '',
        profile: record.profile && typeof record.profile === 'object' ? record.profile : {},
        role: record.role || 'interpreter',
        permissions: Array.isArray(record.permissions) ? record.permissions : [],
        serviceModes: Array.isArray(record.serviceModes) && record.serviceModes.length ? record.serviceModes : [ 'vrs' ],
        tenantId: record.tenantId?.trim() || 'malka',
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

function asDate(value: Date | string | null | undefined): Date | undefined {
    if (!value) {
        return undefined;
    }

    return value instanceof Date ? value : new Date(value);
}

function normalizeCallSession(call: CallSession): CallSession {
    return {
        ...call,
        matchedAt: asDate(call.matchedAt),
        requestedAt: asDate(call.requestedAt) || new Date(),
        startedAt: asDate(call.startedAt),
        endedAt: asDate(call.endedAt),
        tags: Array.isArray(call.tags) ? call.tags : []
    };
}

function normalizeInterpreterRecord(interpreter: Interpreter): Interpreter {
    return {
        ...interpreter,
        createdAt: asDate(interpreter.createdAt) || new Date(),
        lastLogin: asDate(interpreter.lastLogin),
        languages: Array.isArray(interpreter.languages) ? interpreter.languages : [ 'ASL' ],
        totalCallsToday: Number(interpreter.totalCallsToday || 0),
        totalMinutesToday: Number(interpreter.totalMinutesToday || 0)
    };
}

function callFromRow(row: any): CallSession {
    return normalizeCallSession({
        clientId: row.client_id,
        clientName: row.client_name,
        duration: row.duration ?? undefined,
        endedAt: row.ended_at,
        hearingPartyPhone: row.hearing_party_phone || undefined,
        id: row.id,
        interpreterId: row.interpreter_id || undefined,
        interpreterName: row.interpreter_name || undefined,
        language: row.language,
        matchedAt: row.matched_at,
        notes: row.notes || undefined,
        qualityMetrics: row.quality_metrics || undefined,
        recordingId: row.recording_id || undefined,
        recordingUrl: row.recording_url || undefined,
        requestedAt: row.requested_at,
        roomId: row.room_id,
        startedAt: row.started_at,
        status: row.status,
        tags: row.tags || [],
        waitTime: row.wait_time ?? undefined
    });
}

function interpreterFromRow(row: any): Interpreter {
    return normalizeInterpreterRecord({
        averageCallDuration: row.average_call_duration ?? undefined,
        createdAt: row.created_at,
        currentCallId: row.current_call_id || undefined,
        email: row.email,
        id: row.id,
        languages: row.languages || [ 'ASL' ],
        lastLogin: row.last_login || undefined,
        name: row.name,
        rating: row.rating ?? undefined,
        role: 'interpreter',
        status: row.status,
        totalCallsToday: Number(row.total_calls_today || 0),
        totalMinutesToday: Number(row.total_minutes_today || 0)
    });
}

async function initializePostgresOpsState(): Promise<PersistedOpsState | null> {
    if (!OPS_POSTGRES_ENABLED) {
        return null;
    }

    opsPool = new Pool(OPS_DATABASE_URL
        ? {
            connectionString: OPS_DATABASE_URL,
            max: Number(process.env.OPS_PG_POOL_MAX || 10),
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000
        }
        : {
            database: OPS_PGDATABASE,
            host: OPS_PGHOST,
            idleTimeoutMillis: 30000,
            max: Number(process.env.OPS_PG_POOL_MAX || 10),
            password: OPS_PGPASSWORD,
            port: OPS_PGPORT,
            user: OPS_PGUSER,
            connectionTimeoutMillis: 5000
        });

    await opsPool.query(`
        CREATE TABLE IF NOT EXISTS ops_accounts (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE,
            email TEXT UNIQUE,
            name TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('admin', 'captioner', 'interpreter', 'superadmin')),
            password_hash TEXT NOT NULL,
            languages JSONB NOT NULL DEFAULT '["ASL"]',
            service_modes JSONB NOT NULL DEFAULT '["vrs"]',
            permissions JSONB NOT NULL DEFAULT '[]',
            profile JSONB NOT NULL DEFAULT '{}',
            tenant_id TEXT NOT NULL DEFAULT 'malka',
            organization TEXT NOT NULL DEFAULT '',
            active BOOLEAN NOT NULL DEFAULT true,
            created_by TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_login_at TIMESTAMPTZ
        );

        ALTER TABLE ops_accounts ADD COLUMN IF NOT EXISTS profile JSONB NOT NULL DEFAULT '{}';

        CREATE TABLE IF NOT EXISTS ops_audit (
            id TEXT PRIMARY KEY,
            event TEXT NOT NULL,
            details JSONB NOT NULL DEFAULT '{}',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS ops_interpreters (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            name TEXT NOT NULL,
            languages JSONB NOT NULL DEFAULT '["ASL"]',
            status TEXT NOT NULL DEFAULT 'offline',
            current_call_id TEXT,
            total_calls_today INTEGER NOT NULL DEFAULT 0,
            total_minutes_today INTEGER NOT NULL DEFAULT 0,
            average_call_duration REAL,
            rating REAL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_login TIMESTAMPTZ,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS ops_call_sessions (
            id TEXT PRIMARY KEY,
            room_id TEXT NOT NULL,
            client_id TEXT NOT NULL,
            client_name TEXT NOT NULL,
            interpreter_id TEXT,
            interpreter_name TEXT,
            hearing_party_phone TEXT,
            requested_at TIMESTAMPTZ NOT NULL,
            matched_at TIMESTAMPTZ,
            started_at TIMESTAMPTZ,
            ended_at TIMESTAMPTZ,
            status TEXT NOT NULL,
            language TEXT NOT NULL,
            wait_time INTEGER,
            duration INTEGER,
            quality_metrics JSONB,
            recording_url TEXT,
            recording_id TEXT,
            notes TEXT,
            tags JSONB NOT NULL DEFAULT '[]',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS ops_daily_stats (
            date DATE PRIMARY KEY,
            total_calls INTEGER NOT NULL DEFAULT 0,
            completed_calls INTEGER NOT NULL DEFAULT 0,
            abandoned_calls INTEGER NOT NULL DEFAULT 0,
            average_wait_time INTEGER NOT NULL DEFAULT 0,
            average_call_duration INTEGER NOT NULL DEFAULT 0,
            peak_hour INTEGER NOT NULL DEFAULT 0,
            interpreter_minutes REAL NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_ops_accounts_role ON ops_accounts(role);
        CREATE INDEX IF NOT EXISTS idx_ops_accounts_tenant ON ops_accounts(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_ops_audit_created_at ON ops_audit(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_ops_interpreters_status ON ops_interpreters(status);
        CREATE INDEX IF NOT EXISTS idx_ops_call_sessions_status ON ops_call_sessions(status);
        CREATE INDEX IF NOT EXISTS idx_ops_call_sessions_interpreter ON ops_call_sessions(interpreter_id);
        CREATE INDEX IF NOT EXISTS idx_ops_call_sessions_requested_at ON ops_call_sessions(requested_at DESC);
    `);

    if (persistedOpsState.accounts.length) {
        const existing = await opsPool.query('SELECT COUNT(*)::int AS count FROM ops_accounts');
        if (!Number(existing.rows[0]?.count || 0)) {
            for (const record of persistedOpsState.accounts.map(normalizeAccountRecord)) {
                await upsertOpsAccount(record);
            }
            for (const event of auditEvents) {
                await insertOpsAudit(event);
            }
        }
    }

    const [accountsResult, auditResult, interpreterResult, callResult, statsResult] = await Promise.all([
        opsPool.query(`
            SELECT
                id, username, email, name, role, password_hash, languages,
                service_modes, permissions, profile, tenant_id, organization, active,
                created_by, created_at, last_login_at
            FROM ops_accounts
            ORDER BY created_at DESC
        `),
        opsPool.query(`
            SELECT id, event, details, created_at
            FROM ops_audit
            ORDER BY created_at DESC
            LIMIT $1
        `, [MAX_AUDIT_EVENTS]),
        opsPool.query(`
            SELECT
                id, email, name, languages, status, current_call_id,
                total_calls_today, total_minutes_today, average_call_duration,
                rating, created_at, last_login
            FROM ops_interpreters
            ORDER BY updated_at DESC
        `),
        opsPool.query(`
            SELECT
                id, room_id, client_id, client_name, interpreter_id, interpreter_name,
                hearing_party_phone, requested_at, matched_at, started_at, ended_at,
                status, language, wait_time, duration, quality_metrics, recording_url,
                recording_id, notes, tags
            FROM ops_call_sessions
            ORDER BY requested_at DESC
        `),
        opsPool.query(`
            SELECT
                date::text AS date, total_calls, completed_calls, abandoned_calls,
                average_wait_time, average_call_duration, peak_hour, interpreter_minutes
            FROM ops_daily_stats
        `)
    ]);

    interpreters.clear();
    interpreterResult.rows.map(interpreterFromRow).forEach(interpreter => {
        interpreters.set(interpreter.id, interpreter);
    });

    callSessions.clear();
    activeCalls.clear();
    callResult.rows.map(callFromRow).forEach(call => {
        callSessions.set(call.id, call);
        if (call.status === 'active') {
            activeCalls.set(call.id, call);
        }
    });

    dailyStats.clear();
    statsResult.rows.forEach(row => {
        dailyStats.set(row.date, {
            abandonedCalls: Number(row.abandoned_calls || 0),
            averageCallDuration: Number(row.average_call_duration || 0),
            averageWaitTime: Number(row.average_wait_time || 0),
            completedCalls: Number(row.completed_calls || 0),
            date: row.date,
            interpreterMinutes: Number(row.interpreter_minutes || 0),
            peakHour: Number(row.peak_hour || 0),
            totalCalls: Number(row.total_calls || 0)
        });
    });

    opsStorageReady = true;

    return {
        accounts: accountsResult.rows.map(row => normalizeAccountRecord({
            active: row.active,
            createdAt: row.created_at?.toISOString?.() || String(row.created_at || ''),
            createdBy: row.created_by || '',
            email: row.email || '',
            id: row.id,
            languages: row.languages || [ 'ASL' ],
            lastLoginAt: row.last_login_at?.toISOString?.() || null,
            name: row.name,
            organization: row.organization || '',
            passwordHash: row.password_hash,
            permissions: row.permissions || [],
            profile: row.profile || {},
            role: row.role,
            serviceModes: row.service_modes || [ 'vrs' ],
            tenantId: row.tenant_id || 'malka',
            username: row.username || ''
        })),
        audit: auditResult.rows.map(row => ({
            details: row.details || {},
            event: row.event,
            id: row.id,
            timestamp: row.created_at?.toISOString?.() || String(row.created_at || '')
        }))
    };
}

async function upsertOpsAccount(record: AuthDirectoryRecord) {
    if (!opsPool) {
        return;
    }

    const normalized = normalizeAccountRecord(record);

    await opsPool.query(`
        INSERT INTO ops_accounts (
            id, username, email, name, role, password_hash, languages,
            service_modes, permissions, profile, tenant_id, organization, active,
            created_by, created_at, last_login_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (id) DO UPDATE SET
            username = EXCLUDED.username,
            email = EXCLUDED.email,
            name = EXCLUDED.name,
            role = EXCLUDED.role,
            password_hash = EXCLUDED.password_hash,
            languages = EXCLUDED.languages,
            service_modes = EXCLUDED.service_modes,
            permissions = EXCLUDED.permissions,
            profile = EXCLUDED.profile,
            tenant_id = EXCLUDED.tenant_id,
            organization = EXCLUDED.organization,
            active = EXCLUDED.active,
            created_by = EXCLUDED.created_by,
            created_at = EXCLUDED.created_at,
            last_login_at = EXCLUDED.last_login_at
    `, [
        normalized.id,
        normalized.username || null,
        normalized.email || null,
        normalized.name,
        normalized.role,
        normalized.passwordHash,
        JSON.stringify(normalized.languages || [ 'ASL' ]),
        JSON.stringify(normalized.serviceModes || [ 'vrs' ]),
        JSON.stringify(normalized.permissions || []),
        JSON.stringify(normalized.profile || {}),
        normalized.tenantId || 'malka',
        normalized.organization || '',
        normalized.active !== false,
        normalized.createdBy || null,
        normalized.createdAt || new Date().toISOString(),
        normalized.lastLoginAt || null
    ]);
}

async function persistOpsState() {
    if (opsPool) {
        await Promise.all(authDirectory.map(record => upsertOpsAccount(record)));
        return;
    }

    savePersistedOpsState({
        accounts: authDirectory,
        audit: auditEvents
    });
    opsStorageReady = true;
}

async function insertOpsAudit(auditEntry: OpsAuditEvent) {
    if (!opsPool) {
        return;
    }

    await opsPool.query(`
        INSERT INTO ops_audit (id, event, details, created_at)
        VALUES ($1, $2, $3::jsonb, $4)
        ON CONFLICT (id) DO NOTHING
    `, [
        auditEntry.id,
        auditEntry.event,
        JSON.stringify(auditEntry.details || {}),
        auditEntry.timestamp
    ]);
}

async function upsertOpsInterpreter(interpreter: Interpreter) {
    const normalized = normalizeInterpreterRecord(interpreter);
    interpreters.set(normalized.id, normalized);

    if (!opsPool) {
        return normalized;
    }

    await opsPool.query(`
        INSERT INTO ops_interpreters (
            id, email, name, languages, status, current_call_id,
            total_calls_today, total_minutes_today, average_call_duration,
            rating, created_at, last_login, updated_at
        )
        VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            name = EXCLUDED.name,
            languages = EXCLUDED.languages,
            status = EXCLUDED.status,
            current_call_id = EXCLUDED.current_call_id,
            total_calls_today = EXCLUDED.total_calls_today,
            total_minutes_today = EXCLUDED.total_minutes_today,
            average_call_duration = EXCLUDED.average_call_duration,
            rating = EXCLUDED.rating,
            created_at = EXCLUDED.created_at,
            last_login = EXCLUDED.last_login,
            updated_at = NOW()
    `, [
        normalized.id,
        normalized.email,
        normalized.name,
        JSON.stringify(normalized.languages || [ 'ASL' ]),
        normalized.status,
        normalized.currentCallId || null,
        normalized.totalCallsToday || 0,
        normalized.totalMinutesToday || 0,
        normalized.averageCallDuration ?? null,
        normalized.rating ?? null,
        normalized.createdAt,
        normalized.lastLogin || null
    ]);

    return normalized;
}

async function upsertOpsCallSession(call: CallSession) {
    const normalized = normalizeCallSession(call);
    callSessions.set(normalized.id, normalized);
    if (normalized.status === 'active') {
        activeCalls.set(normalized.id, normalized);
    } else {
        activeCalls.delete(normalized.id);
    }

    if (!opsPool) {
        return normalized;
    }

    await opsPool.query(`
        INSERT INTO ops_call_sessions (
            id, room_id, client_id, client_name, interpreter_id, interpreter_name,
            hearing_party_phone, requested_at, matched_at, started_at, ended_at,
            status, language, wait_time, duration, quality_metrics, recording_url,
            recording_id, notes, tags, updated_at
        )
        VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16::jsonb, $17, $18, $19, $20::jsonb, NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
            room_id = EXCLUDED.room_id,
            client_id = EXCLUDED.client_id,
            client_name = EXCLUDED.client_name,
            interpreter_id = EXCLUDED.interpreter_id,
            interpreter_name = EXCLUDED.interpreter_name,
            hearing_party_phone = EXCLUDED.hearing_party_phone,
            requested_at = EXCLUDED.requested_at,
            matched_at = EXCLUDED.matched_at,
            started_at = EXCLUDED.started_at,
            ended_at = EXCLUDED.ended_at,
            status = EXCLUDED.status,
            language = EXCLUDED.language,
            wait_time = EXCLUDED.wait_time,
            duration = EXCLUDED.duration,
            quality_metrics = EXCLUDED.quality_metrics,
            recording_url = EXCLUDED.recording_url,
            recording_id = EXCLUDED.recording_id,
            notes = EXCLUDED.notes,
            tags = EXCLUDED.tags,
            updated_at = NOW()
    `, [
        normalized.id,
        normalized.roomId,
        normalized.clientId,
        normalized.clientName,
        normalized.interpreterId || null,
        normalized.interpreterName || null,
        normalized.hearingPartyPhone || null,
        normalized.requestedAt,
        normalized.matchedAt || null,
        normalized.startedAt || null,
        normalized.endedAt || null,
        normalized.status,
        normalized.language,
        normalized.waitTime ?? null,
        normalized.duration ?? null,
        normalized.qualityMetrics ? JSON.stringify(normalized.qualityMetrics) : null,
        normalized.recordingUrl || null,
        normalized.recordingId || null,
        normalized.notes || null,
        JSON.stringify(normalized.tags || [])
    ]);

    return normalized;
}

async function upsertOpsDailyStats(stats: DailyStats) {
    dailyStats.set(stats.date, stats);

    if (!opsPool) {
        return;
    }

    await opsPool.query(`
        INSERT INTO ops_daily_stats (
            date, total_calls, completed_calls, abandoned_calls,
            average_wait_time, average_call_duration, peak_hour,
            interpreter_minutes, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (date) DO UPDATE SET
            total_calls = EXCLUDED.total_calls,
            completed_calls = EXCLUDED.completed_calls,
            abandoned_calls = EXCLUDED.abandoned_calls,
            average_wait_time = EXCLUDED.average_wait_time,
            average_call_duration = EXCLUDED.average_call_duration,
            peak_hour = EXCLUDED.peak_hour,
            interpreter_minutes = EXCLUDED.interpreter_minutes,
            updated_at = NOW()
    `, [
        stats.date,
        stats.totalCalls,
        stats.completedCalls,
        stats.abandonedCalls,
        stats.averageWaitTime,
        stats.averageCallDuration,
        stats.peakHour,
        stats.interpreterMinutes
    ]);
}

async function getOpsInterpreters(status?: string): Promise<Interpreter[]> {
    if (!opsPool) {
        const values = Array.from(interpreters.values());
        return status ? values.filter(interpreter => interpreter.status === status) : values;
    }

    const result = status
        ? await opsPool.query(`
            SELECT
                id, email, name, languages, status, current_call_id,
                total_calls_today, total_minutes_today, average_call_duration,
                rating, created_at, last_login
            FROM ops_interpreters
            WHERE status = $1
            ORDER BY updated_at DESC
        `, [status])
        : await opsPool.query(`
            SELECT
                id, email, name, languages, status, current_call_id,
                total_calls_today, total_minutes_today, average_call_duration,
                rating, created_at, last_login
            FROM ops_interpreters
            ORDER BY updated_at DESC
        `);

    const rows = result.rows.map(interpreterFromRow);
    rows.forEach(interpreter => interpreters.set(interpreter.id, interpreter));
    return rows;
}

async function getOpsInterpreter(interpreterId: string): Promise<Interpreter | undefined> {
    if (!opsPool) {
        return interpreters.get(interpreterId);
    }

    const result = await opsPool.query(`
        SELECT
            id, email, name, languages, status, current_call_id,
            total_calls_today, total_minutes_today, average_call_duration,
            rating, created_at, last_login
        FROM ops_interpreters
        WHERE id = $1
    `, [interpreterId]);

    if (!result.rows[0]) {
        return undefined;
    }

    const interpreter = interpreterFromRow(result.rows[0]);
    interpreters.set(interpreter.id, interpreter);
    return interpreter;
}

async function getOpsCall(callId: string): Promise<CallSession | undefined> {
    if (!opsPool) {
        return callSessions.get(callId);
    }

    const result = await opsPool.query(`
        SELECT
            id, room_id, client_id, client_name, interpreter_id, interpreter_name,
            hearing_party_phone, requested_at, matched_at, started_at, ended_at,
            status, language, wait_time, duration, quality_metrics, recording_url,
            recording_id, notes, tags
        FROM ops_call_sessions
        WHERE id = $1
    `, [callId]);

    if (!result.rows[0]) {
        return undefined;
    }

    const call = callFromRow(result.rows[0]);
    callSessions.set(call.id, call);
    if (call.status === 'active') {
        activeCalls.set(call.id, call);
    }
    return call;
}

async function getOpsCalls(filters: {
    date?: string;
    interpreterId?: string;
    limit?: number;
    status?: string;
} = {}): Promise<CallSession[]> {
    if (!opsPool) {
        let calls = Array.from(callSessions.values());
        if (filters.status) calls = calls.filter(call => call.status === filters.status);
        if (filters.interpreterId) calls = calls.filter(call => call.interpreterId === filters.interpreterId);
        if (filters.date) {
            const filterDate = new Date(filters.date).toDateString();
            calls = calls.filter(call => call.requestedAt.toDateString() === filterDate);
        }
        return calls
            .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())
            .slice(0, filters.limit || 100);
    }

    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filters.status) {
        params.push(filters.status);
        clauses.push(`status = $${params.length}`);
    }

    if (filters.interpreterId) {
        params.push(filters.interpreterId);
        clauses.push(`interpreter_id = $${params.length}`);
    }

    if (filters.date) {
        params.push(filters.date);
        clauses.push(`requested_at::date = $${params.length}::date`);
    }

    params.push(Math.min(Math.max(Number(filters.limit || 100), 1), 500));

    const result = await opsPool.query(`
        SELECT
            id, room_id, client_id, client_name, interpreter_id, interpreter_name,
            hearing_party_phone, requested_at, matched_at, started_at, ended_at,
            status, language, wait_time, duration, quality_metrics, recording_url,
            recording_id, notes, tags
        FROM ops_call_sessions
        ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY requested_at DESC
        LIMIT $${params.length}
    `, params);

    const calls = result.rows.map(callFromRow);
    calls.forEach(call => callSessions.set(call.id, call));
    return calls;
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
        organization: record.organization || '',
        permissions: record.permissions || [],
        profile: record.profile || {},
        role: record.role,
        serviceModes: record.serviceModes || [ 'vrs' ],
        tenantId: record.tenantId || 'malka',
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
    void persistOpsState();
    void insertOpsAudit(auditEntry);

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

async function assertBootstrapSuperadmin() {
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
        await persistOpsState();
        return;
    }

    const bootstrapRecord = createBootstrapSuperadminRecord();
    authDirectory = [ bootstrapRecord, ...authDirectory ];
    await persistOpsState();
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

async function initializeOpsState() {
    const postgresState = await initializePostgresOpsState();
    if (postgresState) {
        authDirectory = mergeAccountRecords(loadAuthDirectory(), postgresState.accounts);
        auditEvents = Array.isArray(postgresState.audit) ? postgresState.audit : [];
        opsStorage = 'postgres';
    } else {
        opsStorage = 'json';
        opsStorageReady = fs.existsSync(OPS_STATE_FILE);
    }

    await assertBootstrapSuperadmin();
    assertSecureConfig();
}

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
    const ready = Boolean(JWT_SECRET) && authDirectoryConfigured && opsStorageReady;

    return {
        checks: {
            authConfigured: Boolean(JWT_SECRET),
            authDirectoryConfigured,
            persistentStateAccessible: opsStorageReady,
            postgresReady: opsStorage === 'postgres' && opsStorageReady,
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
            storage: opsStorage,
            storageFile: OPS_STATE_FILE,
            storageState: opsStorageReady ? 'ready' : storageFileExists ? 'file_only' : 'missing'
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
        permissions: record.permissions || [],
        publicEmail: getAccountPublicEmail(record),
        role: record.role || (role || 'interpreter'),
        tenantId: record.tenantId || 'malka',
        username: record.username || ''
    };
}

// ==================== Authentication ====================

function authenticateToken(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1];

    if (!token) {
        res.status(401).json({ error: 'No token provided', code: 'AUTH_REQUIRED' });
        return;
    }

    try {
        const decoded = verifyOpsToken(token);
        (req as any).user = decoded;
        next();
    } catch (error) {
        res.status(403).json({ error: 'Invalid or expired token', code: 'AUTH_INVALID' });
    }
}

function requireRole(...roles: string[]): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = (req as any).user as AuthToken;
        if (!user || !roles.includes(user.role)) {
            res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' });
            return;
        }
        next();
    };
}

function getActorAccount(actor: AuthToken): AuthDirectoryRecord | undefined {
    return authDirectory.find(record => record.id === actor.userId);
}

function getActorTenantId(actor: AuthToken): string {
    return actor.tenantId || getActorAccount(actor)?.tenantId || 'malka';
}

function getActorPermissions(actor: AuthToken): string[] {
    return actor.permissions || getActorAccount(actor)?.permissions || [];
}

function canManageTenantAccounts(actor: AuthToken): boolean {
    if (actor.role === 'superadmin') {
        return true;
    }

    if (actor.role !== 'admin') {
        return false;
    }

    const permissions = new Set(getActorPermissions(actor));
    return permissions.has('accounts:manage')
        || permissions.has('interpreters:manage')
        || permissions.has('vri:manage')
        || permissions.has('vrs:manage');
}

function visibleAccountsForActor(actor: AuthToken): AuthDirectoryRecord[] {
    if (actor.role === 'superadmin') {
        return authDirectory;
    }

    const tenantId = getActorTenantId(actor);
    return authDirectory.filter(account =>
        account.tenantId === tenantId && account.role !== 'superadmin'
    );
}

function toQueryString(value: unknown): string {
    return String(value || '').trim();
}

function filterAccountsForQuery(accounts: AuthDirectoryRecord[], query: Request['query']): AuthDirectoryRecord[] {
    const role = toQueryString(query.role).toLowerCase();
    const tenantId = toQueryString(query.tenantId).toLowerCase();
    const serviceMode = toQueryString(query.serviceMode).toLowerCase();
    const language = toQueryString(query.language).toLowerCase();

    return accounts
        .filter(account => !role || account.role === role)
        .filter(account => !tenantId || String(account.tenantId || 'malka').toLowerCase() === tenantId)
        .filter(account => !serviceMode || (account.serviceModes || []).map(mode => String(mode).toLowerCase()).includes(serviceMode))
        .filter(account => !language || (account.languages || []).map(item => String(item).toLowerCase()).includes(language));
}

function auditEventMatchesQuery(event: OpsAuditEvent, query: Request['query']): boolean {
    const eventFilter = toQueryString(query.event).toLowerCase();
    const tenantId = toQueryString(query.tenantId).toLowerCase();
    const serviceMode = toQueryString(query.serviceMode).toLowerCase();
    const role = toQueryString(query.role).toLowerCase();
    const details = event.details || {};
    const haystack = JSON.stringify(details).toLowerCase();

    if (eventFilter && event.event !== eventFilter) {
        return false;
    }

    if (tenantId) {
        const detailsTenant = String((details as any).tenantId || (details as any).tenant_id || '').toLowerCase();
        if (detailsTenant !== tenantId && !haystack.includes(`"tenantid":"${tenantId}"`) && !haystack.includes(`"tenant_id":"${tenantId}"`)) {
            return false;
        }
    }

    if (serviceMode) {
        const modes = [
            ...(Array.isArray((details as any).serviceModes) ? (details as any).serviceModes : []),
            ...(Array.isArray((details as any).service_modes) ? (details as any).service_modes : []),
            (details as any).serviceMode,
            (details as any).service_mode
        ].filter(Boolean).map(value => String(value).toLowerCase());
        if (!modes.includes(serviceMode) && !haystack.includes(`"${serviceMode}"`)) {
            return false;
        }
    }

    if (role) {
        const roles = [
            (details as any).role,
            (details as any).createdRole,
            (details as any).updatedRole,
            (details as any).actorRole
        ].filter(Boolean).map(value => String(value).toLowerCase());
        if (!roles.includes(role) && !event.event.toLowerCase().includes(role)) {
            return false;
        }
    }

    return true;
}

function escapeCsv(value: unknown): string {
    const normalized = value === undefined || value === null
        ? ''
        : typeof value === 'string'
            ? value
            : JSON.stringify(value);

    return `"${normalized.replace(/"/g, '""')}"`;
}

function buildAuditCsv(events: OpsAuditEvent[]): string {
    const header = [ 'timestamp', 'event', 'tenantId', 'role', 'accountId', 'actorId', 'details' ];
    const rows = events.map(event => {
        const details = event.details || {};
        return [
            event.timestamp,
            event.event,
            (details as any).tenantId || (details as any).tenant_id || '',
            (details as any).role || (details as any).createdRole || (details as any).updatedRole || '',
            (details as any).accountId || '',
            (details as any).actorId || '',
            details
        ].map(escapeCsv).join(',');
    });

    return [ header.join(','), ...rows ].join('\n');
}

// ==================== Auth Endpoints ====================

/**
 * Login endpoint for interpreters and admins
 */
app.post('/api/auth/login', validateRequest(loginSchema), async (req: Request, res: Response) => {
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
        await persistOpsState();
    }

    const token = signOpsToken(
        {
            userId,
            role: authRecord.role,
            email: authRecord.email,
            name: authRecord.name,
            languages: authRecord.languages,
            permissions: authRecord.permissions,
            tenantId: authRecord.tenantId,
            username: authRecord.username,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000)
                + ((authRecord.role === 'interpreter' || authRecord.role === 'captioner') ? 8 * 60 * 60 : 12 * 60 * 60)
        }
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
            permissions: authRecord.permissions,
            tenantId: authRecord.tenantId,
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
            permissions: getActorPermissions(user),
            tenantId: getActorTenantId(user),
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
app.post('/api/calls', authenticateToken, validateRequest(createCallSchema), async (req: Request, res: Response, next: NextFunction) => {
    const { clientId, clientName, language, roomId } = req.body;

    try {
        const callId = uuidv4();
        const call: CallSession = await upsertOpsCallSession({
            id: callId,
            roomId: roomId || `vrs-${callId}`,
            clientId: clientId || 'anonymous',
            clientName: clientName || 'Guest',
            language: language || 'ASL',
            status: 'waiting',
            requestedAt: new Date()
        });

        broadcastEvent('call_request', call);

        res.status(201).json(call);
    } catch (error) {
        next(error);
    }
});

/**
 * Update call status
 */
app.patch('/api/calls/:callId', authenticateToken, validateRequest(updateCallSchema), async (req: Request, res: Response, next: NextFunction) => {
    const { callId } = req.params;
    const updates = req.body;

    try {
        const call = await getOpsCall(callId);
        if (!call) {
            res.status(404).json({ error: 'Call not found', code: 'NOT_FOUND' });
            return;
        }

        Object.assign(call, updates);

        if (updates.status === 'active' && !call.startedAt) {
            call.startedAt = new Date();
            call.matchedAt = call.matchedAt || new Date();
            call.waitTime = Math.round((call.matchedAt.getTime() - call.requestedAt.getTime()) / 1000);

            if (call.interpreterId) {
                const interpreter = await getOpsInterpreter(call.interpreterId);
                if (interpreter) {
                    interpreter.status = 'busy';
                    interpreter.currentCallId = callId;
                    await upsertOpsInterpreter(interpreter);
                }
            }
        }

        if (updates.status === 'ended' || updates.status === 'abandoned') {
            call.endedAt = new Date();
            if (call.startedAt) {
                call.duration = Math.round((call.endedAt.getTime() - call.startedAt.getTime()) / 1000);
            }

            if (call.interpreterId) {
                const interpreter = await getOpsInterpreter(call.interpreterId);
                if (interpreter) {
                    interpreter.status = 'available';
                    interpreter.currentCallId = undefined;
                    interpreter.totalCallsToday++;
                    interpreter.totalMinutesToday += Math.round((call.duration || 0) / 60);
                    await upsertOpsInterpreter(interpreter);
                }
            }

            await updateDailyStats(call);
        }

        const persistedCall = await upsertOpsCallSession(call);
        broadcastEvent('call_update', persistedCall);

        res.json(persistedCall);
    } catch (error) {
        next(error);
    }
});

/**
 * Get call history
 */
app.get('/api/calls', authenticateToken, requireRole('admin', 'interpreter'), async (req: Request, res: Response, next: NextFunction) => {
    const { status, date, interpreterId, limit = 100 } = req.query;

    try {
        const calls = await getOpsCalls({
            date: date ? String(date) : undefined,
            interpreterId: interpreterId ? String(interpreterId) : undefined,
            limit: Number(limit),
            status: status ? String(status) : undefined
        });
        res.json(calls);
    } catch (error) {
        next(error);
    }
});

/**
 * Get single call details
 */
app.get('/api/calls/:callId', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
    const { callId } = req.params;

    try {
        const call = await getOpsCall(callId);
        if (!call) {
            res.status(404).json({ error: 'Call not found', code: 'NOT_FOUND' });
            return;
        }

        res.json(call);
    } catch (error) {
        next(error);
    }
});

// ==================== Interpreter Endpoints ====================

/**
 * Get all interpreters
 */
app.get('/api/interpreters', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
    const { status } = req.query;

    try {
        const interpreterList = await getOpsInterpreters(status ? String(status) : undefined);
        res.json(interpreterList);
    } catch (error) {
        next(error);
    }
});

/**
 * Update interpreter status
 */
app.patch('/api/interpreters/:interpreterId/status', authenticateToken, validateRequest(updateInterpreterStatusSchema), async (req: Request, res: Response, next: NextFunction) => {
    const { interpreterId } = req.params;
    const { status } = req.body;

    try {
        let interpreter = await getOpsInterpreter(interpreterId);

        if (!interpreter) {
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
        } else {
            interpreter.status = status || interpreter.status;
        }

        const persistedInterpreter = await upsertOpsInterpreter(interpreter);
        broadcastEvent('interpreter_status', persistedInterpreter);

        res.json(persistedInterpreter);
    } catch (error) {
        next(error);
    }
});

/**
 * Get interpreter stats
 */
app.get('/api/interpreters/:interpreterId/stats', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
    const { interpreterId } = req.params;

    try {
        const interpreter = await getOpsInterpreter(interpreterId);
        if (!interpreter) {
            res.status(404).json({ error: 'Interpreter not found', code: 'NOT_FOUND' });
            return;
        }

        const today = new Date().toISOString().slice(0, 10);
        const todayCalls = await getOpsCalls({ date: today, interpreterId, limit: 500 });

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
            currentCall: interpreter.currentCallId ? await getOpsCall(interpreter.currentCallId) : null
        };

        res.json(stats);
    } catch (error) {
        next(error);
    }
});

// ==================== Dashboard Endpoints ====================

/**
 * Get queue stats
 */
app.get('/api/dashboard/queue', authenticateToken, async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const pendingCalls = await getOpsCalls({ status: 'waiting', limit: 500 });
        const allInterpreters = await getOpsInterpreters();
        const availableInterpreters = allInterpreters.filter(i => i.status === 'available');
        const waitTimes = pendingCalls.map(c => Math.round((Date.now() - c.requestedAt.getTime()) / 1000));

        const stats: QueueStats = {
            pendingRequests: pendingCalls.length,
            activeInterpreters: allInterpreters.length,
            availableInterpreters: availableInterpreters.length,
            averageWaitTime: waitTimes.length > 0
                ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length)
                : 0,
            longestWaitTime: waitTimes.length > 0 ? Math.max(...waitTimes) : 0
        };

        res.json(stats);
    } catch (error) {
        next(error);
    }
});

/**
 * Get live dashboard data
 */
app.get('/api/dashboard/live', authenticateToken, async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const allInterpreters = await getOpsInterpreters();
        const activeInterpreters = allInterpreters.filter(i => i.status !== 'offline');
        const pendingCalls = await getOpsCalls({ status: 'waiting', limit: 500 });
        const currentCalls = await getOpsCalls({ status: 'active', limit: 500 });

        res.json({
            timestamp: new Date(),
            interpreters: {
                total: allInterpreters.length,
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
    } catch (error) {
        next(error);
    }
});

/**
 * Get daily stats
 */
app.get('/api/dashboard/stats/:date?', authenticateToken, requireRole('admin', 'superadmin'), async (req: Request, res: Response, next: NextFunction) => {
    const date = req.params.date || new Date().toISOString().split('T')[0];

    try {
        let stats = dailyStats.get(date);

        if (!stats) {
            const dayCalls = await getOpsCalls({ date, limit: 500 });

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

            await upsertOpsDailyStats(stats);
        }

        res.json(stats);
    } catch (error) {
        next(error);
    }
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

app.get('/api/admin/accounts', authenticateToken, requireRole('admin', 'superadmin'), (req: Request, res: Response) => {
    const actor = (req as any).user as AuthToken;
    if (!canManageTenantAccounts(actor)) {
        res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' });
        return;
    }

    const accounts = filterAccountsForQuery(visibleAccountsForActor(actor), req.query)
        .slice()
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .map(sanitizeAccount);

    res.json(accounts);
});

app.get('/api/admin/tenants', authenticateToken, requireRole('superadmin'), (_req: Request, res: Response) => {
    const summaries = new Map<string, {
        activeAccounts: number;
        accounts: number;
        admins: number;
        captioners: number;
        clients: number;
        interpreters: number;
        serviceModes: Set<string>;
        tenantId: string;
    }>();

    authDirectory.forEach(account => {
        const tenantId = account.tenantId || 'malka';
        const summary = summaries.get(tenantId) || {
            activeAccounts: 0,
            accounts: 0,
            admins: 0,
            captioners: 0,
            clients: 0,
            interpreters: 0,
            serviceModes: new Set<string>(),
            tenantId
        };

        summary.accounts += 1;
        if (account.active !== false) {
            summary.activeAccounts += 1;
        }
        if (account.role === 'admin' || account.role === 'superadmin') {
            summary.admins += 1;
        }
        if (account.role === 'captioner') {
            summary.captioners += 1;
        }
        if (account.role === 'interpreter') {
            summary.interpreters += 1;
        }
        (account.serviceModes || [ 'vrs' ]).forEach(mode => summary.serviceModes.add(mode));
        summaries.set(tenantId, summary);
    });

    res.json(Array.from(summaries.values()).map(summary => ({
        ...summary,
        config: TENANT_CONFIGS[summary.tenantId] || {},
        jwtSigningKeyConfigured: Boolean(TENANT_JWT_SECRETS[summary.tenantId]),
        serviceModes: Array.from(summary.serviceModes).sort()
    })).sort((a, b) => a.tenantId.localeCompare(b.tenantId)));
});

app.post('/api/admin/accounts', authenticateToken, requireRole('admin', 'superadmin'), validateRequest(createAccountSchema), async (req: Request, res: Response) => {
    const actor = (req as any).user as AuthToken;
    const { email, languages, name, organization, password, permissions, profile, role, serviceModes, tenantId, username } = req.body;
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

    if (!canManageTenantAccounts(actor)) {
        res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' });
        return;
    }

    if (!normalizedRole) {
        res.status(400).json({ error: 'Role must be superadmin, admin, captioner, or interpreter', code: 'VALIDATION_ERROR' });
        return;
    }

    if (actor.role !== 'superadmin' && normalizedRole === 'superadmin') {
        res.status(403).json({ error: 'Tenant admins cannot create superadmin accounts', code: 'FORBIDDEN' });
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
        languages: Array.isArray(languages) && languages.length ? languages : [ 'ASL' ],
        name: normalizedName,
        organization: String(organization || '').trim(),
        passwordHash: await bcrypt.hash(password, 10),
        permissions: Array.isArray(permissions) ? permissions : [],
        profile: profile && typeof profile === 'object' ? profile : {},
        role: normalizedRole,
        serviceModes: Array.isArray(serviceModes) && serviceModes.length ? serviceModes : [ 'vrs' ],
        tenantId: actor.role === 'superadmin'
            ? (String(tenantId || 'malka').trim() || 'malka')
            : getActorTenantId(actor),
        username: normalizedUsername
    });

    if (!ensureUniqueAccountFields(nextAccount)) {
        res.status(409).json({ error: 'An account with that email or username already exists', code: 'CONFLICT' });
        return;
    }

    authDirectory = [ nextAccount, ...authDirectory ];
    await persistOpsState();
    recordOpsAudit('account_created', {
        accountId: nextAccount.id,
        actorId: actor.userId,
        actorRole: actor.role,
        createdRole: normalizedRole,
        email: getAccountPublicEmail(nextAccount),
        serviceModes: nextAccount.serviceModes || [ 'vrs' ],
        tenantId: nextAccount.tenantId || 'malka',
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

app.put('/api/admin/accounts/:id', authenticateToken, requireRole('admin', 'superadmin'), validateRequest(updateAccountSchema), async (req: Request, res: Response) => {
    const actor = (req as any).user as AuthToken;
    const { id } = req.params;
    const existing = authDirectory.find(account => account.id === id);

    if (!canManageTenantAccounts(actor)) {
        res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' });
        return;
    }

    if (!existing) {
        res.status(404).json({ error: 'Account not found', code: 'NOT_FOUND' });
        return;
    }

    if (actor.role !== 'superadmin') {
        const tenantId = getActorTenantId(actor);
        if (existing.tenantId !== tenantId || existing.role === 'superadmin' || req.body.tenantId) {
            res.status(403).json({ error: 'Tenant admins cannot move tenants or manage superadmins', code: 'FORBIDDEN' });
            return;
        }
    }

    const updated = normalizeAccountRecord({
        ...existing,
        active: req.body.active ?? existing.active,
        email: req.body.email ?? existing.email,
        languages: req.body.languages || existing.languages,
        name: req.body.name ?? existing.name,
        organization: req.body.organization ?? existing.organization,
        passwordHash: req.body.password ? await bcrypt.hash(req.body.password, 10) : existing.passwordHash,
        permissions: req.body.permissions || existing.permissions,
        profile: req.body.profile && typeof req.body.profile === 'object'
            ? { ...(existing.profile || {}), ...req.body.profile }
            : existing.profile,
        serviceModes: req.body.serviceModes || existing.serviceModes,
        tenantId: actor.role === 'superadmin'
            ? (req.body.tenantId || existing.tenantId || 'malka')
            : existing.tenantId,
        username: req.body.username ?? existing.username
    });

    if (!ensureUniqueAccountFields(updated, id)) {
        res.status(409).json({ error: 'An account with that email or username already exists', code: 'CONFLICT' });
        return;
    }

    authDirectory = authDirectory.map(account => account.id === id ? updated : account);
    await persistOpsState();
    recordOpsAudit('account_updated', {
        accountId: id,
        actorId: actor.userId,
        actorRole: actor.role,
        active: updated.active !== false,
        permissions: updated.permissions || [],
        passwordChanged: Boolean(req.body.password),
        profileChanged: Boolean(req.body.profile),
        serviceModes: updated.serviceModes || [ 'vrs' ],
        tenantId: updated.tenantId || 'malka',
        updatedRole: updated.role
    });

    res.json({ account: sanitizeAccount(updated), success: true });
});

app.get('/api/admin/audit', authenticateToken, requireRole('admin', 'superadmin'), (req: Request, res: Response) => {
    const actor = (req as any).user as AuthToken;
    const limit = Number(req.query.limit || 100);
    const scopedQuery = actor.role === 'superadmin'
        ? req.query
        : { ...req.query, tenantId: getActorTenantId(actor) };

    res.json(auditEvents
        .filter(event => auditEventMatchesQuery(event, scopedQuery))
        .slice(0, limit));
});

app.get('/api/admin/audit/export.csv', authenticateToken, requireRole('admin', 'superadmin'), (req: Request, res: Response) => {
    const actor = (req as any).user as AuthToken;
    const limit = Math.min(Number(req.query.limit || 1000), 5000);
    const scopedQuery = actor.role === 'superadmin'
        ? req.query
        : { ...req.query, tenantId: getActorTenantId(actor) };
    const events = auditEvents
        .filter(event => auditEventMatchesQuery(event, scopedQuery))
        .slice(0, limit);

    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', `attachment; filename="admin-audit-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(buildAuditCsv(events));
});

app.get('/api/admin/monitoring/summary', authenticateToken, requireRole('admin', 'superadmin'), async (_req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const authFailures = Array.from(authAttemptStore.values())
        .filter(entry => entry.expiresAt > now)
        .reduce((sum, entry) => sum + entry.attempts, 0);
    const health = getOpsHealthSnapshot();

    try {
        const [activeCallList, pendingCallList] = await Promise.all([
            getOpsCalls({ status: 'active', limit: 500 }),
            getOpsCalls({ status: 'waiting', limit: 500 })
        ]);

        res.json({
            auth: {
                activeAccounts: authDirectory.filter(account => account.active !== false).length,
                bootstrapSuperadminEnabled: BOOTSTRAP_SUPERADMIN_ENABLED,
                lockedOutBuckets: Array.from(authAttemptStore.values()).filter(entry => entry.expiresAt > now).length,
                recentFailedAttempts: authFailures
            },
            queue: {
                activeCalls: activeCallList.length,
                pendingRequests: pendingCallList.length
            },
            ready: health.ready,
            services: health.services,
            status: health.status,
            timestamp: health.timestamp,
            uptime: health.uptime,
            warnings: health.warnings
        });
    } catch (error) {
        next(error);
    }
});

// ==================== WebSocket ====================

wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected');
    wsClients.add(ws);

    void sendInitialState(ws);

    ws.on('close', () => {
        wsClients.delete(ws);
        console.log('WebSocket client disconnected');
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        wsClients.delete(ws);
    });
});

async function sendInitialState(ws: WebSocket): Promise<void> {
    try {
        const [initialInterpreters, pendingCalls, activeCallList] = await Promise.all([
            getOpsInterpreters(),
            getOpsCalls({ status: 'waiting', limit: 500 }),
            getOpsCalls({ status: 'active', limit: 500 })
        ]);
        const state = {
            type: 'initial_state',
            data: {
                interpreters: initialInterpreters,
                pendingCalls,
                activeCalls: activeCallList
            }
        };

        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(state));
        }
    } catch (error) {
        console.error('[OpsServer] Failed to send initial WebSocket state:', error);
    }
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

async function updateDailyStats(call: CallSession): Promise<void> {
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

    await upsertOpsDailyStats(stats);
}

// ==================== Start Server ====================

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[OpsServer] Error:', err);
    res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        ...(process.env.NODE_ENV === 'development' && { details: { message: err.message } })
    });
});

initializeOpsState().then(() => {
    server.listen(PORT, () => {
        console.log(`VRS Ops Server running on port ${PORT}`);
        console.log(`Dashboard API: http://localhost:${PORT}/api/dashboard/live`);
        console.log(`WebSocket: ws://localhost:${PORT}/ws`);
        console.log(`Readiness: http://localhost:${PORT}/api/readiness`);

        const warnings = getOpsWarnings();
        if (warnings.length) {
            console.warn('[Ops] Startup warnings:', warnings.join(', '));
        }
    });
}).catch(error => {
    console.error('[Ops] Failed to initialize persistent state:', error);
    process.exit(1);
});

export { app, server, wss };
