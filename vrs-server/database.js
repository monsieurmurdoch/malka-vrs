/**
 * Database Module
 *
 * PostgreSQL database for storing:
 * - Admin accounts
 * - Interpreter accounts
 * - Client accounts
 * - Call history
 * - Activity logs
 * - Usage statistics
 *
 * Uses `pg` (node-postgres) with connection pooling.
 * All queries use parameterized placeholders ($1, $2, ...).
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

let pool = null;

// ============================================
// DATABASE INITIALIZATION
// ============================================

async function initialize() {
    const connectionString = process.env.DATABASE_URL
        || `postgresql://${process.env.PGUSER || 'malka'}:${process.env.PGPASSWORD || 'malka'}@${process.env.PGHOST || 'postgres'}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || 'malka_vrs'}`;

    pool = new Pool({
        connectionString,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
    });

    // Verify connection
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT NOW()');
        console.log('[Database] Connected to PostgreSQL at', res.rows[0].now);
    } finally {
        client.release();
    }

    await createTables();
    console.log('[Database] Tables initialized');
}

async function createTables() {
    const ddl = `
        -- Admins table
        CREATE TABLE IF NOT EXISTS admins (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            last_login TIMESTAMPTZ
        );

        -- Interpreters table
        CREATE TABLE IF NOT EXISTS interpreters (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT,
            languages JSONB DEFAULT '["ASL"]',
            status TEXT DEFAULT 'offline',
            active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            last_active TIMESTAMPTZ
        );

        -- Clients table
        CREATE TABLE IF NOT EXISTS clients (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT,
            organization TEXT DEFAULT 'Personal',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            last_call TIMESTAMPTZ
        );

        -- Calls table (includes callee_id for P2P calls)
        CREATE TABLE IF NOT EXISTS calls (
            id TEXT PRIMARY KEY,
            client_id TEXT,
            interpreter_id TEXT,
            room_name TEXT NOT NULL,
            started_at TIMESTAMPTZ DEFAULT NOW(),
            ended_at TIMESTAMPTZ,
            duration_minutes INTEGER,
            language TEXT,
            status TEXT DEFAULT 'active',
            callee_id TEXT
        );

        -- Queue requests table (includes target_phone for P2P routing)
        CREATE TABLE IF NOT EXISTS queue_requests (
            id TEXT PRIMARY KEY,
            client_id TEXT,
            client_name TEXT NOT NULL,
            language TEXT NOT NULL,
            target_phone TEXT,
            room_name TEXT NOT NULL,
            status TEXT DEFAULT 'waiting',
            position INTEGER,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            assigned_at TIMESTAMPTZ,
            assigned_to TEXT,
            completed_at TIMESTAMPTZ
        );

        -- Activity log table
        CREATE TABLE IF NOT EXISTS activity_log (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            description TEXT,
            data JSONB,
            created_by TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Daily stats table
        CREATE TABLE IF NOT EXISTS daily_stats (
            id SERIAL PRIMARY KEY,
            date DATE NOT NULL UNIQUE,
            total_calls INTEGER DEFAULT 0,
            total_minutes INTEGER DEFAULT 0,
            unique_clients INTEGER DEFAULT 0,
            unique_interpreters INTEGER DEFAULT 0,
            avg_wait_time_seconds REAL DEFAULT 0
        );

        -- Interpreter performance table
        CREATE TABLE IF NOT EXISTS interpreter_performance (
            id SERIAL PRIMARY KEY,
            interpreter_id TEXT,
            date DATE NOT NULL,
            calls_completed INTEGER DEFAULT 0,
            minutes_logged INTEGER DEFAULT 0,
            avg_call_duration REAL,
            UNIQUE(interpreter_id, date)
        );

        -- Speed dial (client favorites)
        CREATE TABLE IF NOT EXISTS speed_dial (
            id TEXT PRIMARY KEY,
            client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            phone_number TEXT NOT NULL,
            category TEXT DEFAULT 'personal',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            last_used TIMESTAMPTZ,
            use_count INTEGER DEFAULT 0
        );

        -- Client phone numbers (assigned VRS numbers)
        CREATE TABLE IF NOT EXISTS client_phone_numbers (
            id TEXT PRIMARY KEY,
            client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            phone_number TEXT UNIQUE NOT NULL,
            is_primary BOOLEAN DEFAULT false,
            assigned_at TIMESTAMPTZ DEFAULT NOW(),
            active BOOLEAN DEFAULT true
        );

        -- Interpreter shifts/schedule
        CREATE TABLE IF NOT EXISTS interpreter_shifts (
            id TEXT PRIMARY KEY,
            interpreter_id TEXT NOT NULL REFERENCES interpreters(id) ON DELETE CASCADE,
            date DATE NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT,
            total_minutes INTEGER DEFAULT 0,
            status TEXT DEFAULT 'scheduled',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(interpreter_id, date)
        );

        -- Interpreter earnings
        CREATE TABLE IF NOT EXISTS interpreter_earnings (
            id TEXT PRIMARY KEY,
            interpreter_id TEXT NOT NULL REFERENCES interpreters(id) ON DELETE CASCADE,
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,
            total_minutes INTEGER DEFAULT 0,
            total_calls INTEGER DEFAULT 0,
            hourly_rate REAL DEFAULT 0,
            total_earnings REAL DEFAULT 0,
            net_earnings REAL DEFAULT 0,
            status TEXT DEFAULT 'pending',
            UNIQUE(interpreter_id, period_start, period_end)
        );

        -- Missed calls (P2P — stored when target is offline)
        CREATE TABLE IF NOT EXISTS missed_calls (
            id TEXT PRIMARY KEY,
            caller_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            callee_phone TEXT NOT NULL,
            callee_client_id TEXT,
            room_name TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            seen BOOLEAN DEFAULT false
        );

        -- Indexes for performance
        CREATE INDEX IF NOT EXISTS idx_calls_client ON calls(client_id);
        CREATE INDEX IF NOT EXISTS idx_calls_interpreter ON calls(interpreter_id);
        CREATE INDEX IF NOT EXISTS idx_calls_date ON calls(started_at);
        CREATE INDEX IF NOT EXISTS idx_queue_status ON queue_requests(status);
        CREATE INDEX IF NOT EXISTS idx_queue_created ON queue_requests(created_at);
        CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_log(type);
        CREATE INDEX IF NOT EXISTS idx_activity_date ON activity_log(created_at);
        CREATE INDEX IF NOT EXISTS idx_speed_dial_client ON speed_dial(client_id);
        CREATE INDEX IF NOT EXISTS idx_client_phone_client ON client_phone_numbers(client_id);
        CREATE INDEX IF NOT EXISTS idx_shifts_interpreter ON interpreter_shifts(interpreter_id);
        CREATE INDEX IF NOT EXISTS idx_shifts_date ON interpreter_shifts(date);
        CREATE INDEX IF NOT EXISTS idx_earnings_interpreter ON interpreter_earnings(interpreter_id);
        CREATE INDEX IF NOT EXISTS idx_missed_calls_callee ON missed_calls(callee_client_id, seen);
        CREATE INDEX IF NOT EXISTS idx_missed_calls_caller ON missed_calls(caller_id);
    `;

    await pool.query(ddl);
}

// ============================================
// HELPER FUNCTIONS
// ============================================

async function runQuery(sql, params = []) {
    const { rows } = await pool.query(sql, params);
    return rows;
}

async function runInsert(sql, params = []) {
    await pool.query(sql, params);
}

async function runUpdate(sql, params = []) {
    const { rowCount } = await pool.query(sql, params);
    return rowCount;
}

// ============================================
// ADMIN OPERATIONS
// ============================================

async function getAdminByUsername(username) {
    const rows = await runQuery(
        'SELECT * FROM admins WHERE username = $1',
        [username]
    );
    return rows[0];
}

async function createAdmin({ username, password, name }) {
    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);

    await runInsert(
        'INSERT INTO admins (id, username, password_hash, name) VALUES ($1, $2, $3, $4)',
        [id, username, passwordHash, name]
    );

    return { id, username, name };
}

// ============================================
// INTERPRETER OPERATIONS
// ============================================

async function getAllInterpreters() {
    const interpreters = await runQuery(`
        SELECT
            i.*,
            COUNT(DISTINCT c.id) as total_calls,
            SUM(CASE WHEN c.started_at >= CURRENT_DATE THEN 1 ELSE 0 END) as calls_today,
            SUM(c.duration_minutes) as total_minutes,
            SUM(CASE WHEN c.started_at >= CURRENT_DATE - INTERVAL '7 days' THEN c.duration_minutes ELSE 0 END) as minutes_week
        FROM interpreters i
        LEFT JOIN calls c ON c.interpreter_id = i.id
        WHERE i.active = true
        GROUP BY i.id
        ORDER BY i.name
    `);

    return interpreters.map(i => ({
        ...i,
        languages: typeof i.languages === 'string' ? JSON.parse(i.languages) : (i.languages || []),
        total_calls: Number(i.total_calls) || 0,
        calls_today: Number(i.calls_today) || 0,
        total_minutes: Number(i.total_minutes) || 0,
        minutes_week: Number(i.minutes_week) || 0
    }));
}

async function getInterpreter(id) {
    const rows = await runQuery('SELECT * FROM interpreters WHERE id = $1', [id]);
    if (rows.length === 0) return null;

    const i = rows[0];
    return {
        ...i,
        languages: typeof i.languages === 'string' ? JSON.parse(i.languages) : (i.languages || [])
    };
}

async function getInterpreterByEmail(email) {
    const rows = await runQuery('SELECT * FROM interpreters WHERE email = $1', [email]);
    if (rows.length === 0) return null;

    const i = rows[0];
    return {
        ...i,
        languages: typeof i.languages === 'string' ? JSON.parse(i.languages) : (i.languages || [])
    };
}

async function createInterpreter({ name, email, languages, password }) {
    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password || 'changeme', 10);

    await runInsert(
        'INSERT INTO interpreters (id, name, email, password_hash, languages) VALUES ($1, $2, $3, $4, $5)',
        [id, name, email, passwordHash, JSON.stringify(languages || ['ASL'])]
    );

    return { id, name, email };
}

async function updateInterpreter(id, { name, email, languages, active }) {
    const updates = [];
    const params = [];
    let paramIdx = 1;

    if (name !== undefined) {
        updates.push(`name = $${paramIdx++}`);
        params.push(name);
    }
    if (email !== undefined) {
        updates.push(`email = $${paramIdx++}`);
        params.push(email);
    }
    if (languages !== undefined) {
        updates.push(`languages = $${paramIdx++}`);
        params.push(JSON.stringify(languages));
    }
    if (active !== undefined) {
        updates.push(`active = $${paramIdx++}`);
        params.push(!!active);
    }

    if (updates.length > 0) {
        params.push(id);
        await runUpdate(
            `UPDATE interpreters SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
            params
        );
    }
}

async function deleteInterpreter(id) {
    await runUpdate('UPDATE interpreters SET active = false WHERE id = $1', [id]);
}

async function getInterpreterStats(interpreterId) {
    if (interpreterId) {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

        const calls = await runQuery(
            `SELECT
                COUNT(*) as total_calls,
                COALESCE(SUM(duration_minutes), 0) as total_minutes,
                COALESCE(AVG(duration_minutes), 0) as avg_duration
             FROM calls
             WHERE interpreter_id = $1 AND started_at::date >= $2 AND status = 'completed'`,
            [interpreterId, monthStart]
        );

        const earnings = await runQuery(
            `SELECT COALESCE(SUM(net_earnings), 0) as total_earnings
             FROM interpreter_earnings
             WHERE interpreter_id = $1 AND period_start >= $2`,
            [interpreterId, monthStart]
        );

        return {
            totalCalls: Number(calls[0]?.total_calls) || 0,
            totalMinutes: Number(calls[0]?.total_minutes) || 0,
            avgDuration: Math.round(Number(calls[0]?.avg_duration) || 0),
            totalEarnings: Number(earnings[0]?.total_earnings) || 0
        };
    }

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
        LEFT JOIN calls c ON c.interpreter_id = i.id AND c.started_at >= CURRENT_DATE - INTERVAL '30 days'
        WHERE i.active = true
        GROUP BY i.id
        ORDER BY total_calls DESC
    `);
}

// ============================================
// CLIENT OPERATIONS
// ============================================

async function getAllClients() {
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
        total_calls: Number(c.total_calls) || 0
    }));
}

async function getClient(id) {
    const rows = await runQuery('SELECT * FROM clients WHERE id = $1', [id]);
    return rows[0];
}

async function getClientByEmail(email) {
    const rows = await runQuery('SELECT * FROM clients WHERE email = $1', [email]);
    return rows[0];
}

async function createClient({ name, email, organization, password }) {
    const id = uuidv4();
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    await runInsert(
        'INSERT INTO clients (id, name, email, password_hash, organization) VALUES ($1, $2, $3, $4, $5)',
        [id, name, email, passwordHash, organization || 'Personal']
    );

    return { id, name, email, organization };
}

// ============================================
// CALL OPERATIONS
// ============================================

async function createCall({ clientId, interpreterId, roomName, language }) {
    const id = uuidv4();

    await runInsert(
        'INSERT INTO calls (id, client_id, interpreter_id, room_name, language, status) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, clientId, interpreterId, roomName, language, 'active']
    );

    return id;
}

async function endCall(callId, durationMinutes) {
    await runUpdate(
        'UPDATE calls SET ended_at = NOW(), duration_minutes = $1, status = $2 WHERE id = $3',
        [durationMinutes, 'completed', callId]
    );
}

async function getActiveCalls() {
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

async function addToQueue({ clientId, clientName, language, roomName, targetPhone = null }) {
    const id = uuidv4();

    const count = await runQuery(
        "SELECT COUNT(*) as count FROM queue_requests WHERE status = 'waiting'"
    );

    await runInsert(
        'INSERT INTO queue_requests (id, client_id, client_name, language, target_phone, room_name, position) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [id, clientId || null, clientName, language, targetPhone, roomName, Number(count[0].count) + 1]
    );

    return { id, position: Number(count[0].count) + 1 };
}

async function getQueueRequests(status = 'waiting') {
    const requests = await runQuery(
        'SELECT * FROM queue_requests WHERE status = $1 ORDER BY position',
        [status]
    );

    return requests.map(r => {
        const createdAt = new Date(r.created_at);
        const now = new Date();
        const waitSeconds = Math.floor((now - createdAt) / 1000);

        return {
            ...r,
            wait_seconds: waitSeconds,
            wait_time: formatWaitTime(waitSeconds)
        };
    });
}

async function assignInterpreter(requestId, interpreterId) {
    await runUpdate(
        'UPDATE queue_requests SET status = $1, assigned_to = $2, assigned_at = NOW() WHERE id = $3',
        ['assigned', interpreterId, requestId]
    );

    await reorderQueue();
}

async function completeRequest(requestId) {
    await runUpdate(
        'UPDATE queue_requests SET status = $1, completed_at = NOW() WHERE id = $2',
        ['completed', requestId]
    );
}

async function removeFromQueue(requestId) {
    await runUpdate('DELETE FROM queue_requests WHERE id = $1', [requestId]);
    await reorderQueue();
}

async function reorderQueue() {
    const requests = await runQuery(
        "SELECT id FROM queue_requests WHERE status = 'waiting' ORDER BY created_at"
    );

    for (let i = 0; i < requests.length; i++) {
        await runUpdate(
            'UPDATE queue_requests SET position = $1 WHERE id = $2',
            [i + 1, requests[i].id]
        );
    }
}

function formatWaitTime(seconds) {
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

async function logActivity(type, description, data, createdBy) {
    const id = uuidv4();

    await runInsert(
        'INSERT INTO activity_log (id, type, description, data, created_by) VALUES ($1, $2, $3, $4, $5)',
        [id, type, description, JSON.stringify(data), createdBy]
    );
}

async function getActivityLog({ limit = 50, type, offset = 0 }) {
    let sql;
    let params;

    if (type) {
        sql = `SELECT * FROM activity_log WHERE type = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
        params = [type, limit, offset];
    } else {
        sql = `SELECT * FROM activity_log ORDER BY created_at DESC LIMIT $1 OFFSET $2`;
        params = [limit, offset];
    }

    const rows = await runQuery(sql, params);

    return rows.map(row => ({
        ...row,
        data: typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {})
    }));
}

// ============================================
// DASHBOARD STATS
// ============================================

async function getDashboardStats() {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    const interpreterCount = await runQuery(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN last_active >= NOW() - INTERVAL '5 minutes' THEN 1 ELSE 0 END) as online
        FROM interpreters WHERE active = true
    `);

    const clientCount = await runQuery('SELECT COUNT(*) as total FROM clients');

    const queueCount = await runQuery(
        "SELECT COUNT(*) as count FROM queue_requests WHERE status = 'waiting'"
    );

    const activeCalls = await runQuery(
        "SELECT COUNT(*) as count FROM calls WHERE status = 'active'"
    );

    const todayStats = await runQuery(`
        SELECT
            COUNT(*) as total_calls,
            SUM(duration_minutes) as total_minutes,
            COUNT(DISTINCT client_id) as unique_clients,
            COUNT(DISTINCT interpreter_id) as unique_interpreters
        FROM calls WHERE started_at::date = $1
    `, [today]);

    const weekCompare = await runQuery(`
        SELECT
            COUNT(CASE WHEN started_at::date >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as this_week,
            COUNT(CASE WHEN started_at::date >= CURRENT_DATE - INTERVAL '14 days' AND started_at::date < CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as last_week
        FROM calls
    `);

    const avgWait = await runQuery(`
        SELECT AVG(EXTRACT(EPOCH FROM (assigned_at - created_at)) / 60.0) as avg_minutes
        FROM queue_requests
        WHERE assigned_at IS NOT NULL
        AND created_at >= CURRENT_DATE - INTERVAL '7 days'
    `);

    return {
        interpreters: {
            total: Number(interpreterCount[0].total),
            online: Number(interpreterCount[0].online) || 0
        },
        clients: {
            total: Number(clientCount[0].total)
        },
        queue: {
            count: Number(queueCount[0].count),
            avg_wait_minutes: Number(avgWait[0].avg_minutes) || 0
        },
        calls: {
            active: Number(activeCalls[0].count),
            today: Number(todayStats[0].total_calls) || 0,
            today_minutes: Number(todayStats[0].total_minutes) || 0
        },
        growth: {
            this_week: Number(weekCompare[0].this_week) || 0,
            last_week: Number(weekCompare[0].last_week) || 0
        }
    };
}

// ============================================
// USAGE STATS
// ============================================

async function getDailyUsageStats(days = 7) {
    const safeDays = Math.max(1, Math.min(365, Math.floor(Number(days) || 7)));
    return await runQuery(`
        SELECT
            started_at::date as date,
            COUNT(*) as calls,
            SUM(duration_minutes) as minutes,
            COUNT(DISTINCT client_id) as unique_clients,
            COUNT(DISTINCT interpreter_id) as unique_interpreters
        FROM calls
        WHERE started_at::date >= CURRENT_DATE - ($1 || ' days')::INTERVAL
        GROUP BY started_at::date
        ORDER BY date
    `, [safeDays]);
}

// ============================================
// SPEED DIAL OPERATIONS
// ============================================

async function getSpeedDialEntries(clientId) {
    return await runQuery(
        'SELECT * FROM speed_dial WHERE client_id = $1 ORDER BY use_count DESC, name',
        [clientId]
    );
}

async function addSpeedDialEntry({ clientId, name, phoneNumber, category }) {
    const id = uuidv4();
    await runInsert(
        'INSERT INTO speed_dial (id, client_id, name, phone_number, category) VALUES ($1, $2, $3, $4, $5)',
        [id, clientId, name, phoneNumber, category || 'personal']
    );
    return { id, name, phoneNumber };
}

async function updateSpeedDialEntry(id, clientId, { name, phoneNumber, category }) {
    const updates = [];
    const params = [];
    let paramIdx = 1;

    if (name !== undefined) { updates.push(`name = $${paramIdx++}`); params.push(name); }
    if (phoneNumber !== undefined) { updates.push(`phone_number = $${paramIdx++}`); params.push(phoneNumber); }
    if (category !== undefined) { updates.push(`category = $${paramIdx++}`); params.push(category); }

    if (updates.length > 0) {
        params.push(id, clientId);
        const result = await runUpdate(
            `UPDATE speed_dial SET ${updates.join(', ')} WHERE id = $${paramIdx++} AND client_id = $${paramIdx}`,
            params
        );
        return result;
    }
    return 0;
}

async function deleteSpeedDialEntry(id, clientId) {
    return await runUpdate('DELETE FROM speed_dial WHERE id = $1 AND client_id = $2', [id, clientId]);
}

async function incrementSpeedDialUsage(id) {
    await runUpdate(
        'UPDATE speed_dial SET use_count = use_count + 1, last_used = NOW() WHERE id = $1',
        [id]
    );
}

// ============================================
// CLIENT PHONE NUMBER OPERATIONS
// ============================================

async function getClientPhoneNumbers(clientId) {
    return await runQuery(
        'SELECT * FROM client_phone_numbers WHERE client_id = $1 AND active = true',
        [clientId]
    );
}

async function assignClientPhoneNumber({ clientId, phoneNumber, isPrimary }) {
    const id = uuidv4();

    if (isPrimary) {
        await runUpdate(
            'UPDATE client_phone_numbers SET is_primary = false WHERE client_id = $1',
            [clientId]
        );
    }

    await runInsert(
        'INSERT INTO client_phone_numbers (id, client_id, phone_number, is_primary) VALUES ($1, $2, $3, $4)',
        [id, clientId, phoneNumber, !!isPrimary]
    );

    return { id, phoneNumber, isPrimary };
}

// ============================================
// INTERPRETER SHIFT OPERATIONS
// ============================================

async function getInterpreterShifts(interpreterId, startDate, endDate) {
    let sql = 'SELECT * FROM interpreter_shifts WHERE interpreter_id = $1';
    const params = [interpreterId];
    let paramIdx = 2;

    if (startDate) { sql += ` AND date >= $${paramIdx++}`; params.push(startDate); }
    if (endDate) { sql += ` AND date <= $${paramIdx++}`; params.push(endDate); }

    sql += ' ORDER BY date DESC';

    return await runQuery(sql, params);
}

async function createInterpreterShift({ interpreterId, date, startTime }) {
    const id = uuidv4();
    await runInsert(
        `INSERT INTO interpreter_shifts (id, interpreter_id, date, start_time)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (interpreter_id, date)
         DO UPDATE SET start_time = EXCLUDED.start_time, id = EXCLUDED.id`,
        [id, interpreterId, date, startTime]
    );
    return { id, date };
}

async function updateInterpreterShift(id, { endTime, totalMinutes, status }) {
    const updates = [];
    const params = [];
    let paramIdx = 1;

    if (endTime !== undefined) { updates.push(`end_time = $${paramIdx++}`); params.push(endTime); }
    if (totalMinutes !== undefined) { updates.push(`total_minutes = $${paramIdx++}`); params.push(totalMinutes); }
    if (status !== undefined) { updates.push(`status = $${paramIdx++}`); params.push(status); }

    if (updates.length > 0) {
        params.push(id);
        await runUpdate(`UPDATE interpreter_shifts SET ${updates.join(', ')} WHERE id = $${paramIdx}`, params);
    }
}

// ============================================
// INTERPRETER EARNINGS OPERATIONS
// ============================================

async function getInterpreterEarnings(interpreterId, periodStart, periodEnd) {
    return await runQuery(
        `SELECT * FROM interpreter_earnings
         WHERE interpreter_id = $1 AND period_start >= $2 AND period_end <= $3
         ORDER BY period_start DESC`,
        [interpreterId, periodStart, periodEnd]
    );
}

// ============================================
// CALL HISTORY OPERATIONS
// ============================================

async function getClientCallHistory(clientId, limit = 20, offset = 0) {
    return await runQuery(
        `SELECT c.*, i.name as interpreter_name,
                callee.name as callee_name
         FROM calls c
         LEFT JOIN interpreters i ON i.id = c.interpreter_id
         LEFT JOIN clients callee ON callee.id = c.callee_id
         WHERE c.client_id = $1
         ORDER BY c.started_at DESC
         LIMIT $2 OFFSET $3`,
        [clientId, limit, offset]
    );
}

async function getInterpreterCallHistory(interpreterId, limit = 20, offset = 0) {
    return await runQuery(
        `SELECT c.*, cl.name as client_name
         FROM calls c
         LEFT JOIN clients cl ON cl.id = c.client_id
         WHERE c.interpreter_id = $1
         ORDER BY c.started_at DESC
         LIMIT $2 OFFSET $3`,
        [interpreterId, limit, offset]
    );
}

// ============================================
// P2P CLIENT-TO-CLIENT OPERATIONS
// ============================================

async function getClientByPhoneNumber(phoneNumber) {
    const rows = await runQuery(
        `SELECT c.*, cpn.phone_number, cpn.is_primary
         FROM client_phone_numbers cpn
         JOIN clients c ON c.id = cpn.client_id
         WHERE cpn.phone_number = $1 AND cpn.active = true`,
        [phoneNumber]
    );
    return rows[0] || null;
}

async function createP2PCall({ callerId, calleeId, roomName }) {
    const id = uuidv4();
    await runInsert(
        'INSERT INTO calls (id, client_id, interpreter_id, room_name, language, status, callee_id) VALUES ($1, $2, NULL, $3, NULL, $4, $5)',
        [id, callerId, roomName, 'p2p_active', calleeId]
    );
    return id;
}

async function createMissedCall({ callerId, calleePhone, calleeClientId, roomName }) {
    const id = uuidv4();
    await runInsert(
        'INSERT INTO missed_calls (id, caller_id, callee_phone, callee_client_id, room_name) VALUES ($1, $2, $3, $4, $5)',
        [id, callerId, calleePhone, calleeClientId || null, roomName || null]
    );
    return { id };
}

async function getMissedCalls(clientId) {
    return await runQuery(
        `SELECT mc.*, c.name as caller_name, cp.phone_number as caller_phone
         FROM missed_calls mc
         JOIN clients c ON c.id = mc.caller_id
         LEFT JOIN client_phone_numbers cp
            ON cp.client_id = c.id
           AND cp.is_primary = true
           AND cp.active = true
         WHERE mc.callee_client_id = $1
         ORDER BY mc.created_at DESC`,
        [clientId]
    );
}

async function markMissedCallsSeen(clientId) {
    await runUpdate(
        'UPDATE missed_calls SET seen = true WHERE callee_client_id = $1 AND seen = false',
        [clientId]
    );
}

async function getActiveP2PRoomsForClient(clientId) {
    return await runQuery(
        `SELECT c.id as call_id, c.room_name, c.started_at, c.client_id as caller_id,
                caller.name as caller_name,
                callee.name as callee_name,
                callee.id as callee_id
         FROM calls c
         LEFT JOIN clients caller ON caller.id = c.client_id
         LEFT JOIN clients callee ON callee.id = c.callee_id
         WHERE c.status = 'p2p_active'
           AND (c.client_id = $1 OR c.callee_id = $1)
         ORDER BY c.started_at DESC`,
        [clientId]
    );
}

// ============================================
// EXPORT
// ============================================

module.exports = {
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
    getAllClients,
    getClient,
    getClientByEmail,
    createClient,
    createCall,
    endCall,
    getActiveCalls,
    addToQueue,
    getQueueRequests,
    assignInterpreter,
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
    pool: () => pool
};
