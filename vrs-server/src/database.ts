/**
 * Database Module
 *
 * SQLite database for storing:
 * - Admin accounts
 * - Interpreter accounts
 * - Client accounts
 * - Call history
 * - Activity logs
 * - Usage statistics
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

const verboseSqlite3 = sqlite3.verbose();

// Database file path
const DB_PATH = path.join(__dirname, '..', 'data', 'vrs.db');

let db: sqlite3.Database | null = null;

// ============================================
// DATABASE INITIALIZATION
// ============================================

function initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
        // Ensure data directory exists
        const dataDir = path.dirname(DB_PATH);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        db = new verboseSqlite3.Database(DB_PATH, (err: Error | null) => {
            if (err) {
                console.error('[Database] Connection failed:', err);
                return reject(err);
            }
            console.log('[Database] Connected to SQLite:', DB_PATH);

            // Create tables
            createTables()
                .then(() => runMigrations())
                .then(() => {
                    console.log('[Database] Tables initialized');
                    resolve();
                })
                .catch(reject);
        });
    });
}

function createTables(): Promise<void> {
    return new Promise((resolve, reject) => {
        const tables = [
            // Admins table
            `CREATE TABLE IF NOT EXISTS admins (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                name TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login DATETIME
            )`,

            // Interpreters table
            `CREATE TABLE IF NOT EXISTS interpreters (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT,
                languages TEXT DEFAULT '["ASL"]',
                status TEXT DEFAULT 'offline',
                active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_active DATETIME
            )`,

            // Captioners table
            `CREATE TABLE IF NOT EXISTS captioners (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT,
                languages TEXT DEFAULT '["en"]',
                status TEXT DEFAULT 'offline',
                active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_active DATETIME
            )`,

            // Clients table
            `CREATE TABLE IF NOT EXISTS clients (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT,
                organization TEXT DEFAULT 'Personal',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_call DATETIME
            )`,

            // Calls table
            `CREATE TABLE IF NOT EXISTS calls (
                id TEXT PRIMARY KEY,
                client_id TEXT,
                interpreter_id TEXT,
                room_name TEXT NOT NULL,
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                ended_at DATETIME,
                duration_minutes INTEGER,
                language TEXT,
                status TEXT DEFAULT 'active',
                call_type TEXT DEFAULT 'vrs' CHECK (call_type IN ('vrs', 'vri'))
            )`,

            // Queue requests table
            `CREATE TABLE IF NOT EXISTS queue_requests (
                id TEXT PRIMARY KEY,
                client_id TEXT,
                client_name TEXT NOT NULL,
                language TEXT NOT NULL,
                target_phone TEXT,
                room_name TEXT NOT NULL,
                status TEXT DEFAULT 'waiting',
                position INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                assigned_at DATETIME,
                assigned_to TEXT,
                completed_at DATETIME
            )`,

            // Activity log table
            `CREATE TABLE IF NOT EXISTS activity_log (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                description TEXT,
                data TEXT,
                created_by TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Daily stats table
            `CREATE TABLE IF NOT EXISTS daily_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date DATE NOT NULL UNIQUE,
                total_calls INTEGER DEFAULT 0,
                total_minutes INTEGER DEFAULT 0,
                unique_clients INTEGER DEFAULT 0,
                unique_interpreters INTEGER DEFAULT 0,
                avg_wait_time_seconds REAL DEFAULT 0
            )`,

            // Interpreter performance table
            `CREATE TABLE IF NOT EXISTS interpreter_performance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                interpreter_id TEXT,
                date DATE NOT NULL,
                calls_completed INTEGER DEFAULT 0,
                minutes_logged INTEGER DEFAULT 0,
                avg_call_duration REAL,
                UNIQUE(interpreter_id, date)
            )`,

            // Indexes for performance
            `CREATE INDEX IF NOT EXISTS idx_calls_client ON calls(client_id)`,
            `CREATE INDEX IF NOT EXISTS idx_calls_interpreter ON calls(interpreter_id)`,
            `CREATE INDEX IF NOT EXISTS idx_calls_date ON calls(started_at)`,
            `CREATE INDEX IF NOT EXISTS idx_queue_status ON queue_requests(status)`,
            `CREATE INDEX IF NOT EXISTS idx_queue_created ON queue_requests(created_at)`,
            `CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_log(type)`,
            `CREATE INDEX IF NOT EXISTS idx_activity_date ON activity_log(created_at)`,
            `CREATE INDEX IF NOT EXISTS idx_captioners_email ON captioners(email)`,

            // Speed dial (client favorites)
            `CREATE TABLE IF NOT EXISTS speed_dial (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                name TEXT NOT NULL,
                phone_number TEXT NOT NULL,
                category TEXT DEFAULT 'personal',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_used DATETIME,
                use_count INTEGER DEFAULT 0,
                FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
            )`,

            // Client phone numbers (assigned VRS numbers)
            `CREATE TABLE IF NOT EXISTS client_phone_numbers (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                phone_number TEXT UNIQUE NOT NULL,
                is_primary INTEGER DEFAULT 0,
                assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                active INTEGER DEFAULT 1,
                FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
            )`,

            // Interpreter shifts/schedule
            `CREATE TABLE IF NOT EXISTS interpreter_shifts (
                id TEXT PRIMARY KEY,
                interpreter_id TEXT NOT NULL,
                date DATE NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT,
                total_minutes INTEGER DEFAULT 0,
                status TEXT DEFAULT 'scheduled',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(interpreter_id, date),
                FOREIGN KEY (interpreter_id) REFERENCES interpreters(id) ON DELETE CASCADE
            )`,

            // Interpreter earnings
            `CREATE TABLE IF NOT EXISTS interpreter_earnings (
                id TEXT PRIMARY KEY,
                interpreter_id TEXT NOT NULL,
                period_start DATE NOT NULL,
                period_end DATE NOT NULL,
                total_minutes INTEGER DEFAULT 0,
                total_calls INTEGER DEFAULT 0,
                hourly_rate REAL DEFAULT 0,
                total_earnings REAL DEFAULT 0,
                net_earnings REAL DEFAULT 0,
                status TEXT DEFAULT 'pending',
                UNIQUE(interpreter_id, period_start, period_end),
                FOREIGN KEY (interpreter_id) REFERENCES interpreters(id) ON DELETE CASCADE
            )`,

            // Additional indexes
            `CREATE INDEX IF NOT EXISTS idx_speed_dial_client ON speed_dial(client_id)`,
            `CREATE INDEX IF NOT EXISTS idx_client_phone_client ON client_phone_numbers(client_id)`,
            `CREATE INDEX IF NOT EXISTS idx_shifts_interpreter ON interpreter_shifts(interpreter_id)`,
            `CREATE INDEX IF NOT EXISTS idx_shifts_date ON interpreter_shifts(date)`,
            `CREATE INDEX IF NOT EXISTS idx_earnings_interpreter ON interpreter_earnings(interpreter_id)`,

            // Missed calls (P2P — stored when target is offline)
            `CREATE TABLE IF NOT EXISTS missed_calls (
                id TEXT PRIMARY KEY,
                caller_id TEXT NOT NULL,
                callee_phone TEXT NOT NULL,
                callee_client_id TEXT,
                room_name TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                seen INTEGER DEFAULT 0,
                FOREIGN KEY (caller_id) REFERENCES clients(id) ON DELETE CASCADE
            )`,
            `CREATE INDEX IF NOT EXISTS idx_missed_calls_callee ON missed_calls(callee_client_id, seen)`,
            `CREATE INDEX IF NOT EXISTS idx_missed_calls_caller ON missed_calls(caller_id)`,

            // ---- Voicemail (Video Messaging) ----
            `CREATE TABLE IF NOT EXISTS voicemail_messages (
                id TEXT PRIMARY KEY,
                caller_id TEXT NOT NULL,
                callee_id TEXT,
                callee_phone TEXT,
                room_name TEXT NOT NULL,
                recording_filename TEXT NOT NULL,
                storage_key TEXT NOT NULL,
                thumbnail_key TEXT,
                file_size_bytes INTEGER,
                duration_seconds INTEGER,
                content_type TEXT DEFAULT 'video/mp4',
                status TEXT DEFAULT 'recording',
                seen INTEGER DEFAULT 0,
                expires_at DATETIME NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (caller_id) REFERENCES clients(id) ON DELETE CASCADE,
                FOREIGN KEY (callee_id) REFERENCES clients(id) ON DELETE CASCADE
            )`,
            `CREATE INDEX IF NOT EXISTS idx_voicemail_callee ON voicemail_messages(callee_id, seen, created_at)`,
            `CREATE INDEX IF NOT EXISTS idx_voicemail_caller ON voicemail_messages(caller_id)`,
            `CREATE INDEX IF NOT EXISTS idx_voicemail_expires ON voicemail_messages(expires_at)`,
            `CREATE INDEX IF NOT EXISTS idx_voicemail_status ON voicemail_messages(status)`,

            `CREATE TABLE IF NOT EXISTS voicemail_settings (
                id TEXT PRIMARY KEY,
                setting_key TEXT UNIQUE NOT NULL,
                setting_value TEXT NOT NULL,
                updated_by TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`
        ];

        let completed = 0;
        const total = tables.length;

        db!.serialize(() => {
            tables.forEach((sql) => {
                db!.run(sql, (err: Error | null) => {
                    if (err) {
                        console.error('[Database] Table creation error:', err);
                        return reject(err);
                    }
                    completed++;
                    if (completed === total) {
                        resolve();
                    }
                });
            });
        });
    });
}

// ============================================
// HELPER FUNCTIONS
// ============================================

interface Row {
    [key: string]: unknown;
}

function runQuery(sql: string, params: unknown[] = []): Promise<Row[]> {
    return new Promise((resolve, reject) => {
        db!.all(sql, params, (err: Error | null, rows: Row[]) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function runInsert(sql: string, params: unknown[] = []): Promise<number | string> {
    return new Promise((resolve, reject) => {
        db!.run(sql, params, function(this: { lastID: number | string }, err: Error | null) {
            if (err) reject(err);
            else resolve(this.lastID);
        });
    });
}

function runUpdate(sql: string, params: unknown[] = []): Promise<number> {
    return new Promise((resolve, reject) => {
        db!.run(sql, params, function(this: { changes: number }, err: Error | null) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
}

// ============================================
// ADMIN OPERATIONS
// ============================================

interface AdminRecord {
    id: string;
    username: string;
    password_hash: string;
    name: string;
    created_at?: string;
    last_login?: string;
}

async function getAdminByUsername(username: string): Promise<AdminRecord | undefined> {
    const rows = await runQuery(
        'SELECT * FROM admins WHERE username = ?',
        [username]
    );
    return rows[0] as unknown as AdminRecord | undefined;
}

interface CreateAdminInput {
    username: string;
    password: string;
    name: string;
}

async function createAdmin({ username, password, name }: CreateAdminInput): Promise<{ id: string; username: string; name: string }> {
    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);

    await runInsert(
        'INSERT INTO admins (id, username, password_hash, name) VALUES (?, ?, ?, ?)',
        [id, username, passwordHash, name]
    );

    return { id, username, name };
}

// ============================================
// INTERPRETER OPERATIONS
// ============================================

interface InterpreterRecord {
    id: string;
    name: string;
    email: string;
    password_hash?: string;
    languages: string;
    status: string;
    active: number;
    created_at?: string;
    last_active?: string;
    total_calls?: number;
    calls_today?: number;
    total_minutes?: number;
    minutes_week?: number;
}

async function getAllInterpreters(): Promise<InterpreterRecord[]> {
    const interpreters = await runQuery(`
        SELECT
            i.*,
            COUNT(DISTINCT c.id) as total_calls,
            SUM(CASE WHEN c.started_at >= date('now') THEN 1 ELSE 0 END) as calls_today,
            SUM(c.duration_minutes) as total_minutes,
            SUM(CASE WHEN c.started_at >= date('now', '-7 days') THEN c.duration_minutes ELSE 0 END) as minutes_week
        FROM interpreters i
        LEFT JOIN calls c ON c.interpreter_id = i.id
        WHERE i.active = 1
        GROUP BY i.id
        ORDER BY i.name
    `);

    // Parse languages JSON
    return interpreters.map(i => ({
        ...i,
        languages: JSON.parse((i.languages as string) || '[]'),
        total_calls: (i.total_calls as number) || 0,
        calls_today: (i.calls_today as number) || 0,
        total_minutes: (i.total_minutes as number) || 0,
        minutes_week: (i.minutes_week as number) || 0
    })) as unknown as InterpreterRecord[];
}

async function getInterpreter(id: string): Promise<InterpreterRecord | null> {
    const rows = await runQuery('SELECT * FROM interpreters WHERE id = ?', [id]);
    if (rows.length === 0) return null;

    const i = rows[0];
    return {
        ...i,
        languages: JSON.parse((i.languages as string) || '[]')
    } as unknown as InterpreterRecord;
}

async function getInterpreterByEmail(email: string): Promise<InterpreterRecord | null> {
    const rows = await runQuery('SELECT * FROM interpreters WHERE email = ?', [email]);
    if (rows.length === 0) return null;

    const i = rows[0];
    return {
        ...i,
        languages: JSON.parse((i.languages as string) || '[]')
    } as unknown as InterpreterRecord;
}

interface CreateInterpreterInput {
    name: string;
    email: string;
    languages?: string[];
    password?: string;
}

async function createInterpreter({ name, email, languages, password }: CreateInterpreterInput): Promise<{ id: string; name: string; email: string }> {
    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password || 'changeme', 10);

    await runInsert(
        'INSERT INTO interpreters (id, name, email, password_hash, languages) VALUES (?, ?, ?, ?, ?)',
        [id, name, email, passwordHash, JSON.stringify(languages || ['ASL'])]
    );

    return { id, name, email };
}

interface UpdateInterpreterInput {
    name?: string;
    email?: string;
    languages?: string[];
    active?: boolean;
}

async function updateInterpreter(id: string, { name, email, languages, active }: UpdateInterpreterInput): Promise<void> {
    const updates: string[] = [];
    const params: unknown[] = [];

    if (name !== undefined) {
        updates.push('name = ?');
        params.push(name);
    }
    if (email !== undefined) {
        updates.push('email = ?');
        params.push(email);
    }
    if (languages !== undefined) {
        updates.push('languages = ?');
        params.push(JSON.stringify(languages));
    }
    if (active !== undefined) {
        updates.push('active = ?');
        params.push(active ? 1 : 0);
    }

    if (updates.length > 0) {
        params.push(id);
        await runUpdate(
            `UPDATE interpreters SET ${updates.join(', ')} WHERE id = ?`,
            params
        );
    }
}

async function deleteInterpreter(id: string): Promise<void> {
    await runUpdate('UPDATE interpreters SET active = 0 WHERE id = ?', [id]);
}

async function getInterpreterStats(): Promise<Row[]> {
    return await runQuery(`
        SELECT
            i.id,
            i.name,
            i.email,
            i.languages,
            COUNT(c.id) as total_calls,
            SUM(c.duration_minutes) as total_minutes,
            MAX(c.started_at) as last_call
        FROM interpreters i
        LEFT JOIN calls c ON c.interpreter_id = i.id AND c.started_at >= date('now', '-30 days')
        WHERE i.active = 1
        GROUP BY i.id
        ORDER BY total_calls DESC
    `);
}

// ============================================
// CAPTIONER OPERATIONS
// ============================================

interface CaptionerRecord {
    id: string;
    name: string;
    email: string;
    password_hash?: string;
    languages: string;
    status: string;
    active: number;
    created_at?: string;
    last_active?: string;
}

async function getAllCaptioners(): Promise<CaptionerRecord[]> {
    const captioners = await runQuery(`
        SELECT *
        FROM captioners
        WHERE active = 1
        ORDER BY name
    `);

    return captioners.map(captioner => ({
        ...captioner,
        languages: JSON.parse((captioner.languages as string) || '[]')
    })) as unknown as CaptionerRecord[];
}

async function getCaptioner(id: string): Promise<CaptionerRecord | null> {
    const rows = await runQuery('SELECT * FROM captioners WHERE id = ?', [id]);
    if (rows.length === 0) return null;

    const captioner = rows[0];

    return {
        ...captioner,
        languages: JSON.parse((captioner.languages as string) || '[]')
    } as unknown as CaptionerRecord;
}

async function getCaptionerByEmail(email: string): Promise<CaptionerRecord | null> {
    const rows = await runQuery('SELECT * FROM captioners WHERE email = ?', [email]);
    if (rows.length === 0) return null;

    const captioner = rows[0];

    return {
        ...captioner,
        languages: JSON.parse((captioner.languages as string) || '[]')
    } as unknown as CaptionerRecord;
}

interface CreateCaptionerInput {
    name: string;
    email: string;
    languages?: string[];
    password?: string;
}

async function createCaptioner({ name, email, languages, password }: CreateCaptionerInput): Promise<{ id: string; name: string; email: string }> {
    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password || 'changeme', 10);

    await runInsert(
        'INSERT INTO captioners (id, name, email, password_hash, languages) VALUES (?, ?, ?, ?, ?)',
        [id, name, email, passwordHash, JSON.stringify(languages || ['en'])]
    );

    return { id, name, email };
}

interface UpdateCaptionerInput {
    name?: string;
    email?: string;
    languages?: string[];
    active?: boolean;
}

async function updateCaptioner(id: string, { name, email, languages, active }: UpdateCaptionerInput): Promise<void> {
    const updates: string[] = [];
    const params: unknown[] = [];

    if (name !== undefined) {
        updates.push('name = ?');
        params.push(name);
    }
    if (email !== undefined) {
        updates.push('email = ?');
        params.push(email);
    }
    if (languages !== undefined) {
        updates.push('languages = ?');
        params.push(JSON.stringify(languages));
    }
    if (active !== undefined) {
        updates.push('active = ?');
        params.push(active ? 1 : 0);
    }

    if (updates.length > 0) {
        params.push(id);
        await runUpdate(
            `UPDATE captioners SET ${updates.join(', ')} WHERE id = ?`,
            params
        );
    }
}

async function deleteCaptioner(id: string): Promise<void> {
    await runUpdate('UPDATE captioners SET active = 0 WHERE id = ?', [id]);
}

// ============================================
// CLIENT OPERATIONS
// ============================================

interface ClientRecord {
    id: string;
    name: string;
    email: string;
    password_hash?: string;
    organization: string;
    created_at?: string;
    last_call?: string;
    total_calls?: number;
}

async function getAllClients(): Promise<ClientRecord[]> {
    const clients = await runQuery(`
        SELECT
            c.*,
            COUNT(cl.id) as total_calls,
            MAX(cl.started_at) as last_call
        FROM clients c
        LEFT JOIN calls cl ON cl.client_id = c.id
        GROUP BY c.id
        ORDER BY c.name
    `);

    return clients.map(c => ({
        ...c,
        total_calls: (c.total_calls as number) || 0
    })) as unknown as ClientRecord[];
}

async function getClient(id: string): Promise<ClientRecord | undefined> {
    const rows = await runQuery('SELECT * FROM clients WHERE id = ?', [id]);
    return rows[0] as unknown as ClientRecord | undefined;
}

async function getClientByEmail(email: string): Promise<ClientRecord | undefined> {
    const rows = await runQuery('SELECT * FROM clients WHERE email = ?', [email]);
    return rows[0] as unknown as ClientRecord | undefined;
}

interface CreateClientInput {
    name: string;
    email?: string;
    organization?: string;
    password?: string;
}

async function createClient({ name, email, organization, password }: CreateClientInput): Promise<{ id: string; name: string; email?: string; organization: string }> {
    const id = uuidv4();
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    await runInsert(
        'INSERT INTO clients (id, name, email, password_hash, organization) VALUES (?, ?, ?, ?, ?)',
        [id, name, email || null, passwordHash, organization || 'Personal']
    );

    return { id, name, email, organization: organization || 'Personal' };
}

// ============================================
// CALL OPERATIONS
// ============================================

interface CreateCallInput {
    clientId: string | null;
    interpreterId: string | null;
    roomName: string;
    language: string | null;
    callType?: 'vrs' | 'vri';
}

async function createCall({ clientId, interpreterId, roomName, language, callType }: CreateCallInput): Promise<string> {
    const id = uuidv4();

    await runInsert(
        'INSERT INTO calls (id, client_id, interpreter_id, room_name, language, status, call_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, clientId, interpreterId, roomName, language, 'active', callType || 'vrs']
    );

    return id;
}

async function endCall(callId: string, durationMinutes: number): Promise<void> {
    await runUpdate(
        'UPDATE calls SET ended_at = CURRENT_TIMESTAMP, duration_minutes = ?, status = ? WHERE id = ?',
        [durationMinutes, 'completed', callId]
    );
}

interface CallRecord {
    id: string;
    client_id: string | null;
    interpreter_id: string | null;
    room_name: string;
    started_at: string;
    ended_at: string | null;
    duration_minutes: number | null;
    language: string | null;
    status: string;
    call_type: string | null;
}

async function getCall(callId: string): Promise<CallRecord | undefined> {
    const rows = await runQuery('SELECT * FROM calls WHERE id = ?', [callId]);
    return rows[0] as unknown as CallRecord | undefined;
}

async function getActiveCalls(): Promise<Row[]> {
    return await runQuery(`
        SELECT c.*, cl.name as client_name, i.name as interpreter_name
        FROM calls c
        LEFT JOIN clients cl ON cl.id = c.client_id
        LEFT JOIN interpreters i ON i.id = c.interpreter_id
        WHERE c.status = 'active'
    `);
}

// ============================================
// QUEUE OPERATIONS
// ============================================

interface AddToQueueInput {
    clientId?: string | null;
    clientName: string;
    language: string;
    roomName: string;
    targetPhone?: string | null;
}

async function addToQueue({ clientId, clientName, language, roomName, targetPhone = null }: AddToQueueInput): Promise<{ id: string; position: number }> {
    const id = uuidv4();

    // Get current position
    const count = await runQuery(
        'SELECT COUNT(*) as count FROM queue_requests WHERE status = "waiting"'
    );

    await runInsert(
        'INSERT INTO queue_requests (id, client_id, client_name, language, target_phone, room_name, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, clientId || null, clientName, language, targetPhone, roomName, (count[0].count as number) + 1]
    );

    return { id, position: (count[0].count as number) + 1 };
}

interface QueueRequest {
    id: string;
    client_id?: string;
    client_name: string;
    language: string;
    target_phone?: string;
    room_name: string;
    status: string;
    position: number;
    created_at?: string;
    assigned_at?: string;
    assigned_to?: string;
    completed_at?: string;
    wait_seconds?: number;
    wait_time?: string;
}

async function getQueueRequests(status: string = 'waiting'): Promise<QueueRequest[]> {
    const requests = await runQuery(
        'SELECT * FROM queue_requests WHERE status = ? ORDER BY position',
        [status]
    );

    // Calculate wait times
    return requests.map(r => {
        const createdAt = new Date(r.created_at as string);
        const now = new Date();
        const waitSeconds = Math.floor((now.getTime() - createdAt.getTime()) / 1000);

        return {
            ...r,
            wait_seconds: waitSeconds,
            wait_time: formatWaitTime(waitSeconds)
        } as QueueRequest;
    });
}

async function assignInterpreter(requestId: string, interpreterId: string): Promise<void> {
    await runUpdate(
        'UPDATE queue_requests SET status = ?, assigned_to = ?, assigned_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['assigned', interpreterId, requestId]
    );

    // Reorder remaining queue
    await reorderQueue();
}

async function completeRequest(requestId: string): Promise<void> {
    await runUpdate(
        'UPDATE queue_requests SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['completed', requestId]
    );
}

async function removeFromQueue(requestId: string): Promise<void> {
    await runUpdate('DELETE FROM queue_requests WHERE id = ?', [requestId]);
    await reorderQueue();
}

async function reorderQueue(): Promise<void> {
    const requests = await runQuery(
        'SELECT id FROM queue_requests WHERE status = "waiting" ORDER BY created_at'
    );

    for (let i = 0; i < requests.length; i++) {
        await runUpdate(
            'UPDATE queue_requests SET position = ? WHERE id = ?',
            [i + 1, requests[i].id]
        );
    }
}

function formatWaitTime(seconds: number): string {
    if (seconds < 60) {
        return `${seconds} sec`;
    }
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes < 60) {
        return `${minutes}m ${secs}s`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
}

// ============================================
// ACTIVITY LOG
// ============================================

async function logActivity(type: string, description: string | undefined, data: unknown, createdBy: string | null): Promise<void> {
    const id = uuidv4();

    await runInsert(
        'INSERT INTO activity_log (id, type, description, data, created_by) VALUES (?, ?, ?, ?, ?)',
        [id, type, description, JSON.stringify(data), createdBy]
    );
}

interface GetActivityLogOptions {
    limit?: number;
    type?: string;
    offset?: number;
}

async function getActivityLog({ limit = 50, type, offset = 0 }: GetActivityLogOptions): Promise<Row[]> {
    let sql = `
        SELECT * FROM activity_log
        ${type ? 'WHERE type = ?' : ''}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    `;
    const params = type ? [type, limit, offset] : [limit, offset];

    const rows = await runQuery(sql, params);

    return rows.map(row => ({
        ...row,
        data: JSON.parse((row.data as string) || '{}')
    }));
}

// ============================================
// DASHBOARD STATS
// ============================================

interface DashboardStats {
    interpreters: { total: number; online: number };
    clients: { total: number };
    queue: { count: number; avg_wait_minutes: number };
    calls: { active: number; today: number; today_minutes: number };
    growth: { this_week: number; last_week: number };
}

async function getDashboardStats(): Promise<DashboardStats> {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Get interpreter count
    const interpreterCount = await runQuery(`
        SELECT
            COUNT(*) as total,
            COALESCE(SUM(CASE WHEN last_active >= datetime('now', '-5 minutes') THEN 1 ELSE 0 END), 0) as online
        FROM interpreters WHERE active = 1
    `);

    // Get client count
    const clientCount = await runQuery('SELECT COUNT(*) as total FROM clients');

    // Get queue count
    const queueCount = await runQuery(
        'SELECT COUNT(*) as count FROM queue_requests WHERE status = "waiting"'
    );

    // Get active calls
    const activeCalls = await runQuery(
        'SELECT COUNT(*) as count FROM calls WHERE status = "active"'
    );

    // Get today's stats
    const todayStats = await runQuery(`
        SELECT
            COUNT(*) as total_calls,
            SUM(duration_minutes) as total_minutes,
            COUNT(DISTINCT client_id) as unique_clients,
            COUNT(DISTINCT interpreter_id) as unique_interpreters
        FROM calls WHERE date(started_at) = ?
    `, [today]);

    // Get week-over-week comparison
    const weekCompare = await runQuery(`
        SELECT
            COUNT(CASE WHEN date(started_at) >= date('now', '-7 days') THEN 1 END) as this_week,
            COUNT(CASE WHEN date(started_at) >= date('now', '-14 days') AND date(started_at) < date('now', '-7 days') THEN 1 END) as last_week
        FROM calls
    `);

    // Average wait time
    const avgWait = await runQuery(`
        SELECT AVG(julianday(created_at) - julianday(assigned_at)) * 24 * 60 as avg_minutes
        FROM queue_requests
        WHERE assigned_at IS NOT NULL
        AND created_at >= date('now', '-7 days')
    `);

    return {
        interpreters: {
            total: interpreterCount[0].total as number,
            online: interpreterCount[0].online as number
        },
        clients: {
            total: clientCount[0].total as number
        },
        queue: {
            count: queueCount[0].count as number,
            avg_wait_minutes: (avgWait[0].avg_minutes as number) || 0
        },
        calls: {
            active: activeCalls[0].count as number,
            today: (todayStats[0].total_calls as number) || 0,
            today_minutes: (todayStats[0].total_minutes as number) || 0
        },
        growth: {
            this_week: (weekCompare[0].this_week as number) || 0,
            last_week: (weekCompare[0].last_week as number) || 0
        }
    };
}

// ============================================
// USAGE STATS
// ============================================

async function getDailyUsageStats(days: number = 7): Promise<Row[]> {
    const safeDays = Math.max(1, Math.min(365, Math.floor(Number(days) || 7)));
    return await runQuery(`
        SELECT
            date(started_at) as date,
            COUNT(*) as calls,
            SUM(duration_minutes) as minutes,
            COUNT(DISTINCT client_id) as unique_clients,
            COUNT(DISTINCT interpreter_id) as unique_interpreters
        FROM calls
        WHERE date(started_at) >= date('now', '-' || ? || ' days')
        GROUP BY date(started_at)
        ORDER BY date
    `, [safeDays]);
}

// ============================================
// SPEED DIAL OPERATIONS
// ============================================

async function getSpeedDialEntries(clientId: string): Promise<Row[]> {
    return await runQuery(
        'SELECT * FROM speed_dial WHERE client_id = ? ORDER BY use_count DESC, name',
        [clientId]
    );
}

interface AddSpeedDialInput {
    clientId: string;
    name: string;
    phoneNumber: string;
    category?: string;
}

async function addSpeedDialEntry({ clientId, name, phoneNumber, category }: AddSpeedDialInput): Promise<{ id: string; name: string; phoneNumber: string }> {
    const id = uuidv4();
    await runInsert(
        'INSERT INTO speed_dial (id, client_id, name, phone_number, category) VALUES (?, ?, ?, ?, ?)',
        [id, clientId, name, phoneNumber, category || 'personal']
    );
    return { id, name, phoneNumber };
}

interface UpdateSpeedDialInput {
    name?: string;
    phoneNumber?: string;
    category?: string;
}

async function updateSpeedDialEntry(id: string, clientId: string, { name, phoneNumber, category }: UpdateSpeedDialInput): Promise<number> {
    const updates: string[] = [];
    const params: unknown[] = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (phoneNumber !== undefined) { updates.push('phone_number = ?'); params.push(phoneNumber); }
    if (category !== undefined) { updates.push('category = ?'); params.push(category); }

    if (updates.length > 0) {
        params.push(id, clientId);
        const changes = await runUpdate(`UPDATE speed_dial SET ${updates.join(', ')} WHERE id = ? AND client_id = ?`, params);
        return changes;
    }
    return 0;
}

async function deleteSpeedDialEntry(id: string, clientId: string): Promise<number> {
    return await runUpdate('DELETE FROM speed_dial WHERE id = ? AND client_id = ?', [id, clientId]);
}

async function incrementSpeedDialUsage(id: string): Promise<void> {
    await runUpdate(
        'UPDATE speed_dial SET use_count = use_count + 1, last_used = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
    );
}

// ============================================
// CLIENT PHONE NUMBER OPERATIONS
// ============================================

async function getClientPhoneNumbers(clientId: string): Promise<Row[]> {
    return await runQuery(
        'SELECT * FROM client_phone_numbers WHERE client_id = ? AND active = 1',
        [clientId]
    );
}

interface AssignPhoneInput {
    clientId: string;
    phoneNumber: string;
    isPrimary: boolean;
}

async function assignClientPhoneNumber({ clientId, phoneNumber, isPrimary }: AssignPhoneInput): Promise<{ id: string; phoneNumber: string; isPrimary: boolean }> {
    const id = uuidv4();

    if (isPrimary) {
        await runUpdate(
            'UPDATE client_phone_numbers SET is_primary = 0 WHERE client_id = ?',
            [clientId]
        );
    }

    await runInsert(
        'INSERT INTO client_phone_numbers (id, client_id, phone_number, is_primary) VALUES (?, ?, ?, ?)',
        [id, clientId, phoneNumber, isPrimary ? 1 : 0]
    );

    return { id, phoneNumber, isPrimary };
}

// ============================================
// INTERPRETER SHIFT OPERATIONS
// ============================================

async function getInterpreterShifts(interpreterId: string, startDate?: string, endDate?: string): Promise<Row[]> {
    let sql = 'SELECT * FROM interpreter_shifts WHERE interpreter_id = ?';
    const params: unknown[] = [interpreterId];

    if (startDate) { sql += ' AND date >= ?'; params.push(startDate); }
    if (endDate) { sql += ' AND date <= ?'; params.push(endDate); }

    sql += ' ORDER BY date DESC';

    return await runQuery(sql, params);
}

interface CreateShiftInput {
    interpreterId: string;
    date: string;
    startTime: string;
}

async function createInterpreterShift({ interpreterId, date, startTime }: CreateShiftInput): Promise<{ id: string; date: string }> {
    const id = uuidv4();
    await runInsert(
        'INSERT OR REPLACE INTO interpreter_shifts (id, interpreter_id, date, start_time) VALUES (?, ?, ?, ?)',
        [id, interpreterId, date, startTime]
    );
    return { id, date };
}

interface UpdateShiftInput {
    endTime?: string;
    totalMinutes?: number;
    status?: string;
}

async function updateInterpreterShift(id: string, { endTime, totalMinutes, status }: UpdateShiftInput): Promise<void> {
    const updates: string[] = [];
    const params: unknown[] = [];

    if (endTime !== undefined) { updates.push('end_time = ?'); params.push(endTime); }
    if (totalMinutes !== undefined) { updates.push('total_minutes = ?'); params.push(totalMinutes); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }

    if (updates.length > 0) {
        params.push(id);
        await runUpdate(`UPDATE interpreter_shifts SET ${updates.join(', ')} WHERE id = ?`, params);
    }
}

// ============================================
// INTERPRETER EARNINGS OPERATIONS
// ============================================

async function getInterpreterEarnings(interpreterId: string, periodStart: string, periodEnd: string): Promise<Row[]> {
    return await runQuery(
        `SELECT * FROM interpreter_earnings
         WHERE interpreter_id = ? AND period_start >= ? AND period_end <= ?
         ORDER BY period_start DESC`,
        [interpreterId, periodStart, periodEnd]
    );
}

// ============================================
// CALL HISTORY OPERATIONS
// ============================================

async function getClientCallHistory(clientId: string, limit: number = 20, offset: number = 0): Promise<Row[]> {
    return await runQuery(
        `SELECT c.*, i.name as interpreter_name,
                callee.name as callee_name
         FROM calls c
         LEFT JOIN interpreters i ON i.id = c.interpreter_id
         LEFT JOIN clients callee ON callee.id = c.callee_id
         WHERE c.client_id = ?
         ORDER BY c.started_at DESC
         LIMIT ? OFFSET ?`,
        [clientId, limit, offset]
    );
}

async function getInterpreterCallHistory(interpreterId: string, limit: number = 20, offset: number = 0): Promise<Row[]> {
    return await runQuery(
        `SELECT c.*, cl.name as client_name
         FROM calls c
         LEFT JOIN clients cl ON cl.id = c.client_id
         WHERE c.interpreter_id = ?
         ORDER BY c.started_at DESC
         LIMIT ? OFFSET ?`,
        [interpreterId, limit, offset]
    );
}

interface InterpreterStatsResult {
    totalCalls: number;
    totalMinutes: number;
    avgDuration: number;
    totalEarnings: number;
}

async function getInterpreterStatsById(interpreterId: string): Promise<InterpreterStatsResult> {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

    const calls = await runQuery(
        `SELECT
            COUNT(*) as total_calls,
            COALESCE(SUM(duration_minutes), 0) as total_minutes,
            COALESCE(AVG(duration_minutes), 0) as avg_duration
         FROM calls
         WHERE interpreter_id = ? AND date(started_at) >= ? AND status = 'completed'`,
        [interpreterId, monthStart]
    );

    const earnings = await runQuery(
        `SELECT COALESCE(SUM(net_earnings), 0) as total_earnings
         FROM interpreter_earnings
         WHERE interpreter_id = ? AND period_start >= ?`,
        [interpreterId, monthStart]
    );

    return {
        totalCalls: (calls[0]?.total_calls as number) || 0,
        totalMinutes: (calls[0]?.total_minutes as number) || 0,
        avgDuration: Math.round((calls[0]?.avg_duration as number) || 0),
        totalEarnings: (earnings[0]?.total_earnings as number) || 0
    };
}

// ============================================
// MIGRATIONS
// ============================================

function runMigrations(): Promise<void> {
    return new Promise((resolve, reject) => {
        db!.serialize(() => {
            db!.run(
                `CREATE TABLE IF NOT EXISTS captioners (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT,
                    languages TEXT DEFAULT '["en"]',
                    status TEXT DEFAULT 'offline',
                    active INTEGER DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_active DATETIME
                )`,
                (captionersErr: Error | null) => {
                    if (captionersErr) {
                        return reject(captionersErr);
                    }

                    db!.run(
                        'CREATE INDEX IF NOT EXISTS idx_captioners_email ON captioners(email)',
                        (captionersIndexErr: Error | null) => {
                            if (captionersIndexErr) {
                                return reject(captionersIndexErr);
                            }

                            db!.all('PRAGMA table_info(calls)', (callsErr: Error | null, callColumns: { name: string }[]) => {
                if (callsErr) {
                    return reject(callsErr);
                }

                const hasCalleeId = callColumns.some(col => col.name === 'callee_id');
                const hasCallType = callColumns.some(col => col.name === 'call_type');

                const migrateCallType = () => {
                    if (!hasCallType) {
                        db!.run("ALTER TABLE calls ADD COLUMN call_type TEXT DEFAULT 'vrs' CHECK (call_type IN ('vrs', 'vri'))", (ctErr: Error | null) => {
                            if (ctErr) {
                                console.warn('[Database] Migration call_type:', ctErr.message);
                            }
                            migrateMissedCalls();
                        });
                    } else {
                        migrateMissedCalls();
                    }
                };

                const migrateMissedCalls = () => {
                    db!.all('PRAGMA table_info(missed_calls)', (missedErr: Error | null, missedColumns: { name: string }[]) => {
                        if (missedErr) {
                            return reject(missedErr);
                        }

                        const columnNames = new Set(missedColumns.map(col => col.name));
                        db!.all('PRAGMA table_info(queue_requests)', (queueErr: Error | null, queueColumns: { name: string }[]) => {
                            if (queueErr) {
                                return reject(queueErr);
                            }

                            const queueColumnNames = new Set(queueColumns.map(col => col.name));
                            const migrationSteps: string[] = [];

                            if (!columnNames.has('callee_phone')) {
                            migrationSteps.push('ALTER TABLE missed_calls ADD COLUMN callee_phone TEXT');
                            }

                            if (!columnNames.has('callee_client_id')) {
                            migrationSteps.push('ALTER TABLE missed_calls ADD COLUMN callee_client_id TEXT');
                            }

                            if (columnNames.has('callee_id')) {
                            migrationSteps.push(
                                `UPDATE missed_calls
                                 SET callee_client_id = COALESCE(callee_client_id, callee_id)
                                 WHERE callee_id IS NOT NULL`
                            );
                            }

                            if (!queueColumnNames.has('target_phone')) {
                                migrationSteps.push('ALTER TABLE queue_requests ADD COLUMN target_phone TEXT');
                            }

                            migrationSteps.push(
                                'CREATE INDEX IF NOT EXISTS idx_missed_calls_callee ON missed_calls(callee_client_id, seen)'
                            );

                            let index = 0;
                            const runNext = () => {
                                if (index >= migrationSteps.length) {
                                    return resolve();
                                }

                                db!.run(migrationSteps[index], (stepErr: Error | null) => {
                                    if (stepErr) {
                                        console.warn('[Database] Migration step failed:', stepErr.message);
                                    }
                                    index += 1;
                                    runNext();
                                });
                            };

                            runNext();
                        });
                    });
                };

                if (!hasCalleeId) {
                    db!.run('ALTER TABLE calls ADD COLUMN callee_id TEXT', (alterErr: Error | null) => {
                        if (alterErr) {
                            console.warn('[Database] Migration callee_id:', alterErr.message);
                        }
                        migrateCallType();
                    });
                } else {
                    migrateCallType();
                }
                            });
                        }
                    );
                }
            );
        });
    });
}

// ============================================
// VOICEMAIL OPERATIONS
// ============================================

interface CreateVoicemailMessageInput {
    id: string;
    callerId: string;
    calleeId: string | null;
    calleePhone: string | null;
    roomName: string;
    recordingFilename: string;
    storageKey: string;
    expiresAt: string;
}

async function createVoicemailMessage({ id, callerId, calleeId, calleePhone, roomName, recordingFilename, storageKey, expiresAt }: CreateVoicemailMessageInput): Promise<void> {
    await runInsert(
        `INSERT INTO voicemail_messages (id, caller_id, callee_id, callee_phone, room_name, recording_filename, storage_key, status, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'recording', ?)`,
        [id, callerId, calleeId || null, calleePhone || null, roomName, recordingFilename, storageKey, expiresAt]
    );
}

async function getVoicemailMessage(id: string): Promise<Row | null> {
    const rows = await runQuery('SELECT * FROM voicemail_messages WHERE id = ?', [id]);
    return rows[0] || null;
}

async function getVoicemailMessageByRoomName(roomName: string): Promise<Row | null> {
    const rows = await runQuery(
        "SELECT * FROM voicemail_messages WHERE room_name = ? AND status = 'recording' ORDER BY created_at DESC LIMIT 1",
        [roomName]
    );
    return rows[0] || null;
}

async function updateVoicemailMessage(id: string, updates: Record<string, unknown>): Promise<void> {
    const fields: string[] = [];
    const params: unknown[] = [];
    for (const [key, value] of Object.entries(updates)) {
        fields.push(`${key} = ?`);
        params.push(value);
    }
    if (fields.length === 0) return;
    params.push(id);
    await runUpdate(`UPDATE voicemail_messages SET ${fields.join(', ')} WHERE id = ?`, params);
}

async function deleteVoicemailMessage(id: string): Promise<void> {
    await runUpdate('DELETE FROM voicemail_messages WHERE id = ?', [id]);
}

async function getVoicemailInbox(calleeId: string, limit: number = 20, offset: number = 0): Promise<Row[]> {
    return await runQuery(
        `SELECT vm.*, c.name as caller_name, cp.phone_number as caller_phone
         FROM voicemail_messages vm
         JOIN clients c ON c.id = vm.caller_id
         LEFT JOIN client_phone_numbers cp ON cp.client_id = c.id AND cp.is_primary = 1 AND cp.active = 1
         WHERE vm.callee_id = ? AND vm.status = 'available'
         ORDER BY vm.created_at DESC
         LIMIT ? OFFSET ?`,
        [calleeId, limit, offset]
    );
}

async function getVoicemailInboxCount(calleeId: string): Promise<number> {
    const rows = await runQuery(
        `SELECT COUNT(*) as total FROM voicemail_messages WHERE callee_id = ? AND status = 'available'`,
        [calleeId]
    );
    return (rows[0].total as number) || 0;
}

async function getVoicemailUnreadCount(calleeId: string): Promise<number> {
    const rows = await runQuery(
        `SELECT COUNT(*) as count FROM voicemail_messages WHERE callee_id = ? AND status = 'available' AND seen = 0`,
        [calleeId]
    );
    return (rows[0].count as number) || 0;
}

async function markVoicemailSeen(id: string, calleeId: string): Promise<void> {
    await runUpdate(
        'UPDATE voicemail_messages SET seen = 1 WHERE id = ? AND callee_id = ?',
        [id, calleeId]
    );
}

async function getVoicemailStorageUsage(calleeId: string): Promise<number> {
    const rows = await runQuery(
        `SELECT COALESCE(SUM(file_size_bytes), 0) as total_bytes FROM voicemail_messages WHERE callee_id = ? AND status = 'available'`,
        [calleeId]
    );
    return (rows[0].total_bytes as number) || 0;
}

async function getVoicemailMessageCount(calleeId: string): Promise<number> {
    const rows = await runQuery(
        `SELECT COUNT(*) as count FROM voicemail_messages WHERE callee_id = ? AND status = 'available'`,
        [calleeId]
    );
    return (rows[0].count as number) || 0;
}

async function getExpiredVoicemailMessages(): Promise<Row[]> {
    return await runQuery(
        `SELECT * FROM voicemail_messages WHERE status = 'available' AND expires_at < datetime('now')`
    );
}

async function getActiveVoicemailRecordings(): Promise<Row[]> {
    return await runQuery(
        `SELECT * FROM voicemail_messages WHERE status = 'recording'`
    );
}

async function getVoicemailSetting(key: string): Promise<string | null> {
    const rows = await runQuery(
        'SELECT setting_value FROM voicemail_settings WHERE setting_key = ?',
        [key]
    );
    return rows[0] ? (rows[0].setting_value as string) : null;
}

async function getAllVoicemailSettings(): Promise<Row[]> {
    return await runQuery('SELECT * FROM voicemail_settings');
}

async function setVoicemailSetting(key: string, value: string, updatedBy: string | null): Promise<void> {
    const id = uuidv4();
    await runInsert(
        `INSERT INTO voicemail_settings (id, setting_key, setting_value, updated_by, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_by = excluded.updated_by, updated_at = datetime('now')`,
        [id, key, value, updatedBy || null]
    );
}

async function seedVoicemailSettings(): Promise<void> {
    const defaults: [string, string][] = [
        ['vm-max-length', '180'],
        ['vm-retention-days', '30'],
        ['vm-max-messages', '100'],
        ['vm-storage-quota-mb', '500'],
        ['vm-enabled', 'true']
    ];
    for (const [key, value] of defaults) {
        const existing = await getVoicemailSetting(key);
        if (existing === null) {
            await setVoicemailSetting(key, value, 'system');
        }
    }
}

interface GetAllVoicemailMessagesOptions {
    status?: string;
    callerId?: string;
    calleeId?: string;
    limit?: number;
    offset?: number;
}

async function getAllVoicemailMessages({ status, callerId, calleeId, limit = 50, offset = 0 }: GetAllVoicemailMessagesOptions): Promise<Row[]> {
    let sql = `SELECT vm.*, c.name as caller_name, callee.name as callee_name
               FROM voicemail_messages vm
               JOIN clients c ON c.id = vm.caller_id
               LEFT JOIN clients callee ON callee.id = vm.callee_id
               WHERE 1=1`;
    const params: unknown[] = [];
    if (status) { sql += ' AND vm.status = ?'; params.push(status); }
    if (callerId) { sql += ' AND vm.caller_id = ?'; params.push(callerId); }
    if (calleeId) { sql += ' AND vm.callee_id = ?'; params.push(calleeId); }
    sql += ' ORDER BY vm.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    return await runQuery(sql, params);
}

async function getVoicemailStorageStats(): Promise<Row> {
    const rows = await runQuery(
        `SELECT COUNT(*) as total_messages,
                COALESCE(SUM(file_size_bytes), 0) as total_size_bytes,
                SUM(CASE WHEN status = 'recording' THEN 1 ELSE 0 END) as active_recordings
         FROM voicemail_messages`
    );
    return rows[0];
}

// ============================================
// P2P CLIENT-TO-CLIENT OPERATIONS
// ============================================

async function getClientByPhoneNumber(phoneNumber: string): Promise<Row | null> {
    const rows = await runQuery(
        `SELECT c.*, cpn.phone_number, cpn.is_primary
         FROM client_phone_numbers cpn
         JOIN clients c ON c.id = cpn.client_id
         WHERE cpn.phone_number = ? AND cpn.active = 1`,
        [phoneNumber]
    );
    return rows[0] || null;
}

interface CreateP2PCallInput {
    callerId: string;
    calleeId: string;
    roomName: string;
}

async function createP2PCall({ callerId, calleeId, roomName }: CreateP2PCallInput): Promise<string> {
    const id = uuidv4();
    await runInsert(
        'INSERT INTO calls (id, client_id, interpreter_id, room_name, language, status, callee_id) VALUES (?, ?, NULL, ?, NULL, ?, ?)',
        [id, callerId, roomName, 'p2p_active', calleeId]
    );
    return id;
}

interface CreateMissedCallInput {
    callerId: string;
    calleePhone: string;
    calleeClientId?: string | null;
    roomName?: string | null;
}

async function createMissedCall({ callerId, calleePhone, calleeClientId, roomName }: CreateMissedCallInput): Promise<{ id: string }> {
    const id = uuidv4();
    await runInsert(
        'INSERT INTO missed_calls (id, caller_id, callee_phone, callee_client_id, room_name) VALUES (?, ?, ?, ?, ?)',
        [id, callerId, calleePhone, calleeClientId || null, roomName || null]
    );
    return { id };
}

async function getMissedCalls(clientId: string): Promise<Row[]> {
    return await runQuery(
        `SELECT mc.*, c.name as caller_name, cp.phone_number as caller_phone
         FROM missed_calls mc
         JOIN clients c ON c.id = mc.caller_id
         LEFT JOIN client_phone_numbers cp
            ON cp.client_id = c.id
           AND cp.is_primary = 1
           AND cp.active = 1
         WHERE mc.callee_client_id = ?
         ORDER BY mc.created_at DESC`,
        [clientId]
    );
}

async function markMissedCallsSeen(clientId: string): Promise<void> {
    await runUpdate(
        'UPDATE missed_calls SET seen = 1 WHERE callee_client_id = ? AND seen = 0',
        [clientId]
    );
}

async function getActiveP2PRoomsForClient(clientId: string): Promise<Row[]> {
    return await runQuery(
        `SELECT c.id as call_id, c.room_name, c.started_at, c.client_id as caller_id,
                caller.name as caller_name,
                callee.name as callee_name,
                callee.id as callee_id
         FROM calls c
         LEFT JOIN clients caller ON caller.id = c.client_id
         LEFT JOIN clients callee ON callee.id = c.callee_id
         WHERE c.status = 'p2p_active'
           AND (c.client_id = ? OR c.callee_id = ?)
         ORDER BY c.started_at DESC`,
        [clientId, clientId]
    );
}

// ============================================
// EXPORT
// ============================================

function getDb(): sqlite3.Database | null {
    return db;
}

export {
    initialize,
    getAdminByUsername,
    createAdmin,
    getAllInterpreters,
    getInterpreter,
    getInterpreterByEmail,
    createInterpreter,
    updateInterpreter,
    deleteInterpreter,
    getInterpreterStats,
    getAllCaptioners,
    getCaptioner,
    getCaptionerByEmail,
    createCaptioner,
    updateCaptioner,
    deleteCaptioner,
    getAllClients,
    getClient,
    getClientByEmail,
    createClient,
    createCall,
    endCall,
    getCall,
    getActiveCalls,
    addToQueue,
    getQueueRequests,
    assignInterpreter as assignInterpreterToRequest,
    completeRequest,
    removeFromQueue,
    reorderQueue,
    logActivity,
    getActivityLog,
    getDashboardStats,
    getDailyUsageStats,
    // Speed dial
    getSpeedDialEntries,
    addSpeedDialEntry,
    updateSpeedDialEntry,
    deleteSpeedDialEntry,
    incrementSpeedDialUsage,
    // Client phone numbers
    getClientPhoneNumbers,
    assignClientPhoneNumber,
    // Interpreter shifts
    getInterpreterShifts,
    createInterpreterShift,
    updateInterpreterShift,
    // Interpreter earnings
    getInterpreterEarnings,
    // Call history
    getClientCallHistory,
    getInterpreterCallHistory,
    // P2P client-to-client
    getClientByPhoneNumber,
    createP2PCall,
    createMissedCall,
    getMissedCalls,
    markMissedCallsSeen,
    getActiveP2PRoomsForClient,
    // Voicemail
    createVoicemailMessage,
    getVoicemailMessage,
    getVoicemailMessageByRoomName,
    updateVoicemailMessage,
    deleteVoicemailMessage,
    getVoicemailInbox,
    getVoicemailInboxCount,
    getVoicemailUnreadCount,
    markVoicemailSeen,
    getVoicemailStorageUsage,
    getVoicemailMessageCount,
    getExpiredVoicemailMessages,
    getActiveVoicemailRecordings,
    getVoicemailSetting,
    getAllVoicemailSettings,
    setVoicemailSetting,
    seedVoicemailSettings,
    getAllVoicemailMessages,
    getVoicemailStorageStats,
    getDb
};

export type {
    AdminRecord,
    InterpreterRecord,
    CaptionerRecord,
    ClientRecord,
    CreateClientInput,
    CreateCallInput,
    CallRecord,
    QueueRequest,
    DashboardStats,
    InterpreterStatsResult,
    Row
};
