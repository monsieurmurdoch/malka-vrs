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

        -- Captioners table
        CREATE TABLE IF NOT EXISTS captioners (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT,
            languages JSONB DEFAULT '["en"]',
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

        -- Voicemail messages
        CREATE TABLE IF NOT EXISTS voicemail_messages (
            id TEXT PRIMARY KEY,
            caller_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            callee_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
            callee_phone TEXT,
            room_name TEXT NOT NULL,
            recording_filename TEXT NOT NULL,
            storage_key TEXT NOT NULL,
            thumbnail_key TEXT,
            file_size_bytes BIGINT,
            duration_seconds INTEGER,
            content_type TEXT DEFAULT 'video/mp4',
            status TEXT DEFAULT 'recording',
            seen BOOLEAN DEFAULT false,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS voicemail_settings (
            id TEXT PRIMARY KEY,
            setting_key TEXT UNIQUE NOT NULL,
            setting_value TEXT NOT NULL,
            updated_by TEXT,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Device handoff: active sessions (rehydrated after restart)
        CREATE TABLE IF NOT EXISTS active_sessions (
            user_id TEXT PRIMARY KEY,
            room_name TEXT NOT NULL,
            interpreter_id TEXT,
            device_id TEXT,
            registered_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Device handoff: short-lived tokens
        CREATE TABLE IF NOT EXISTS handoff_tokens (
            token TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            room_name TEXT NOT NULL,
            interpreter_id TEXT,
            from_device_id TEXT,
            target_device_id TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL
        );

        -- Server-side key/value state (queue paused flag, totals, etc.)
        CREATE TABLE IF NOT EXISTS server_state (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Lightweight schema upgrades for existing PostgreSQL volumes
        ALTER TABLE calls ADD COLUMN IF NOT EXISTS callee_id TEXT;
        ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_type TEXT;
        ALTER TABLE queue_requests ADD COLUMN IF NOT EXISTS target_phone TEXT;
        ALTER TABLE missed_calls ADD COLUMN IF NOT EXISTS callee_client_id TEXT;
        ALTER TABLE missed_calls ADD COLUMN IF NOT EXISTS room_name TEXT;
        ALTER TABLE missed_calls ADD COLUMN IF NOT EXISTS seen BOOLEAN DEFAULT false;

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
        CREATE INDEX IF NOT EXISTS idx_captioners_email ON captioners(email);

        -- Voicemail indexes
        CREATE INDEX IF NOT EXISTS idx_voicemail_callee ON voicemail_messages(callee_id, seen, created_at);
        CREATE INDEX IF NOT EXISTS idx_voicemail_caller ON voicemail_messages(caller_id);
        CREATE INDEX IF NOT EXISTS idx_voicemail_expires ON voicemail_messages(expires_at);
        CREATE INDEX IF NOT EXISTS idx_voicemail_status ON voicemail_messages(status);
        CREATE INDEX IF NOT EXISTS idx_voicemail_room ON voicemail_messages(room_name);

        -- Handoff / session indexes
        CREATE INDEX IF NOT EXISTS idx_active_sessions_device ON active_sessions(device_id);
        CREATE INDEX IF NOT EXISTS idx_handoff_tokens_user ON handoff_tokens(user_id);
        CREATE INDEX IF NOT EXISTS idx_handoff_tokens_expires ON handoff_tokens(expires_at);

        -- Contacts & Address Book
        CREATE TABLE IF NOT EXISTS contacts (
            id TEXT PRIMARY KEY,
            client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            email TEXT,
            phone_number TEXT,
            organization TEXT,
            notes TEXT,
            avatar_color TEXT,
            is_favorite BOOLEAN DEFAULT false,
            linked_client_id TEXT,
            merged_into TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_contacts_client ON contacts(client_id);
        CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(client_id, phone_number);
        CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(client_id, email);
        CREATE INDEX IF NOT EXISTS idx_contacts_favorite ON contacts(client_id, is_favorite);

        CREATE TABLE IF NOT EXISTS contact_groups (
            id TEXT PRIMARY KEY,
            client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            color TEXT,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(client_id, name)
        );
        CREATE INDEX IF NOT EXISTS idx_contact_groups_client ON contact_groups(client_id);

        CREATE TABLE IF NOT EXISTS contact_group_members (
            id TEXT PRIMARY KEY,
            contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
            group_id TEXT NOT NULL REFERENCES contact_groups(id) ON DELETE CASCADE,
            UNIQUE(contact_id, group_id)
        );
        CREATE INDEX IF NOT EXISTS idx_cgm_contact ON contact_group_members(contact_id);
        CREATE INDEX IF NOT EXISTS idx_cgm_group ON contact_group_members(group_id);

        CREATE TABLE IF NOT EXISTS blocked_contacts (
            id TEXT PRIMARY KEY,
            client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            blocked_phone TEXT,
            blocked_email TEXT,
            blocked_client_id TEXT,
            reason TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_blocked_client ON blocked_contacts(client_id);
        CREATE INDEX IF NOT EXISTS idx_blocked_phone ON blocked_contacts(client_id, blocked_phone);
        CREATE INDEX IF NOT EXISTS idx_blocked_email ON blocked_contacts(client_id, blocked_email);
    `;

    await pool.query(ddl);
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Run a SELECT query. Returns array of row objects.
 * Use $1, $2, ... placeholders in SQL.
 */
async function runQuery(sql, params = []) {
    const { rows } = await pool.query(sql, params);
    return rows;
}

/**
 * Run an INSERT query.
 */
async function runInsert(sql, params = []) {
    await pool.query(sql, params);
}

/**
 * Run an UPDATE/DELETE query. Returns number of affected rows.
 */
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

    // Parse languages (JSONB comes back as object in PG, but handle string fallback)
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
    // Per-interpreter stats (called with an ID)
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

    // All-interpreter stats (dashboard)
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
// CAPTIONER OPERATIONS
// ============================================

async function getAllCaptioners() {
    const captioners = await runQuery(
        `SELECT * FROM captioners WHERE active = true ORDER BY name`
    );
    return captioners.map(c => ({
        ...c,
        languages: typeof c.languages === 'string' ? JSON.parse(c.languages) : (c.languages || [])
    }));
}

async function getCaptioner(id) {
    const rows = await runQuery('SELECT * FROM captioners WHERE id = $1', [id]);
    if (rows.length === 0) return null;
    const c = rows[0];
    return {
        ...c,
        languages: typeof c.languages === 'string' ? JSON.parse(c.languages) : (c.languages || [])
    };
}

async function getCaptionerByEmail(email) {
    const rows = await runQuery('SELECT * FROM captioners WHERE email = $1', [email]);
    if (rows.length === 0) return null;
    const c = rows[0];
    return {
        ...c,
        languages: typeof c.languages === 'string' ? JSON.parse(c.languages) : (c.languages || [])
    };
}

async function createCaptioner({ name, email, languages, password }) {
    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password || 'changeme', 10);

    await runInsert(
        'INSERT INTO captioners (id, name, email, password_hash, languages) VALUES ($1, $2, $3, $4, $5)',
        [id, name, email, passwordHash, JSON.stringify(languages || ['en'])]
    );

    return { id, name, email };
}

async function updateCaptioner(id, { name, email, languages, active }) {
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
            `UPDATE captioners SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
            params
        );
    }
}

async function deleteCaptioner(id) {
    await runUpdate('UPDATE captioners SET active = false WHERE id = $1', [id]);
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

async function getCall(callId) {
    const rows = await runQuery('SELECT * FROM calls WHERE id = $1', [callId]);
    return rows[0] || null;
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

    // Get current position
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

    // Calculate wait times
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

    // Reorder remaining queue
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

    // Get interpreter count
    const interpreterCount = await runQuery(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN last_active >= NOW() - INTERVAL '5 minutes' THEN 1 ELSE 0 END) as online
        FROM interpreters WHERE active = true
    `);

    // Get client count
    const clientCount = await runQuery('SELECT COUNT(*) as total FROM clients');

    // Get queue count
    const queueCount = await runQuery(
        "SELECT COUNT(*) as count FROM queue_requests WHERE status = 'waiting'"
    );

    // Get active calls
    const activeCalls = await runQuery(
        "SELECT COUNT(*) as count FROM calls WHERE status = 'active'"
    );

    // Get today's stats
    const todayStats = await runQuery(`
        SELECT
            COUNT(*) as total_calls,
            SUM(duration_minutes) as total_minutes,
            COUNT(DISTINCT client_id) as unique_clients,
            COUNT(DISTINCT interpreter_id) as unique_interpreters
        FROM calls WHERE started_at::date = $1
    `, [today]);

    // Get week-over-week comparison
    const weekCompare = await runQuery(`
        SELECT
            COUNT(CASE WHEN started_at::date >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as this_week,
            COUNT(CASE WHEN started_at::date >= CURRENT_DATE - INTERVAL '14 days' AND started_at::date < CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as last_week
        FROM calls
    `);

    // Average wait time
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
// CONTACTS & ADDRESS BOOK OPERATIONS
// ============================================

function sanitizePhoneNumberRaw(raw) {
    if (typeof raw !== 'string') return null;
    const cleaned = raw.replace(/[^\d+]/g, '');
    if (cleaned.length < 7 || cleaned.length > 16) return null;
    return cleaned;
}

async function getContacts(clientId, { search, groupId, favoritesOnly } = {}) {
    let sql = `
        SELECT c.*,
            STRING_AGG(cg.id::text, ',') AS group_ids,
            STRING_AGG(cg.name, ',') AS group_names,
            (SELECT MAX(started_at) FROM calls
             WHERE (client_id = $1 AND callee_id = c.linked_client_id)
                OR (client_id = $1 AND room_name IN
                    (SELECT room_name FROM calls cc WHERE cc.client_id = c.linked_client_id)))
                AS last_call_date
        FROM contacts c
        LEFT JOIN contact_group_members cgm ON cgm.contact_id = c.id
        LEFT JOIN contact_groups cg ON cg.id = cgm.group_id
        WHERE c.client_id = $1 AND c.merged_into IS NULL
    `;
    const params = [clientId];
    let idx = 2;

    if (search) {
        sql += ` AND (c.name ILIKE $${idx} OR c.email ILIKE $${idx} OR c.phone_number ILIKE $${idx} OR c.organization ILIKE $${idx})`;
        params.push(`%${search}%`);
        idx++;
    }
    if (favoritesOnly) {
        sql += ' AND c.is_favorite = true';
    }

    sql += ' GROUP BY c.id ORDER BY c.name';

    return await runQuery(sql, params);
}

async function getContact(clientId, contactId) {
    const rows = await runQuery(
        'SELECT c.* FROM contacts c WHERE c.id = $1 AND c.client_id = $2 AND c.merged_into IS NULL',
        [contactId, clientId]
    );
    if (!rows.length) return null;

    const contact = rows[0];
    const groups = await runQuery(
        `SELECT cg.* FROM contact_groups cg
         JOIN contact_group_members cgm ON cgm.group_id = cg.id
         WHERE cgm.contact_id = $1`,
        [contactId]
    );
    contact.groups = groups;

    return contact;
}

async function createContact({ clientId, name, email, phoneNumber, organization, notes, avatarColor, isFavorite, linkedClientId }) {
    const id = uuidv4();
    const sanitized = phoneNumber ? sanitizePhoneNumberRaw(phoneNumber) : null;

    await runInsert(
        `INSERT INTO contacts (id, client_id, name, email, phone_number, organization, notes, avatar_color, is_favorite, linked_client_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [id, clientId, name, email || null, sanitized, organization || null, notes || null, avatarColor || null, !!isFavorite, linkedClientId || null]
    );

    return { id, name };
}

async function updateContact(clientId, contactId, updates) {
    const fields = [];
    const params = [];
    const allowed = ['name', 'email', 'phone_number', 'organization', 'notes', 'avatar_color', 'is_favorite', 'linked_client_id'];
    let idx = 1;

    for (const key of allowed) {
        if (updates[key] !== undefined) {
            if (key === 'phone_number' && updates[key]) {
                const sanitized = sanitizePhoneNumberRaw(updates[key]);
                if (!sanitized) continue;
                fields.push(`${key} = $${idx++}`);
                params.push(sanitized);
            } else if (key === 'is_favorite') {
                fields.push(`${key} = $${idx++}`);
                params.push(!!updates[key]);
            } else {
                fields.push(`${key} = $${idx++}`);
                params.push(updates[key]);
            }
        }
    }

    if (fields.length === 0) return 0;

    fields.push('updated_at = NOW()');
    params.push(contactId, clientId);

    return await runUpdate(
        `UPDATE contacts SET ${fields.join(', ')} WHERE id = $${idx++} AND client_id = $${idx}`,
        params
    );
}

async function deleteContact(clientId, contactId) {
    await runUpdate('DELETE FROM contact_group_members WHERE contact_id = $1', [contactId]);
    return await runUpdate('DELETE FROM contacts WHERE id = $1 AND client_id = $2', [contactId, clientId]);
}

// --- Contact Groups ---

async function getContactGroups(clientId) {
    return await runQuery(
        `SELECT cg.*, COUNT(cgm.contact_id)::int AS member_count
         FROM contact_groups cg
         LEFT JOIN contact_group_members cgm ON cgm.group_id = cg.id
         WHERE cg.client_id = $1
         GROUP BY cg.id
         ORDER BY cg.sort_order, cg.name`,
        [clientId]
    );
}

async function createContactGroup({ clientId, name, color, sortOrder }) {
    const id = uuidv4();
    await runInsert(
        'INSERT INTO contact_groups (id, client_id, name, color, sort_order) VALUES ($1, $2, $3, $4, $5)',
        [id, clientId, name, color || null, sortOrder || 0]
    );
    return { id, name };
}

async function updateContactGroup(clientId, groupId, { name, color, sortOrder }) {
    const fields = [];
    const params = [];
    let idx = 1;
    if (name !== undefined) { fields.push(`name = $${idx++}`); params.push(name); }
    if (color !== undefined) { fields.push(`color = $${idx++}`); params.push(color); }
    if (sortOrder !== undefined) { fields.push(`sort_order = $${idx++}`); params.push(sortOrder); }
    if (!fields.length) return 0;
    params.push(groupId, clientId);
    return await runUpdate(`UPDATE contact_groups SET ${fields.join(', ')} WHERE id = $${idx++} AND client_id = $${idx}`, params);
}

async function deleteContactGroup(clientId, groupId) {
    await runUpdate('DELETE FROM contact_group_members WHERE group_id = $1', [groupId]);
    return await runUpdate('DELETE FROM contact_groups WHERE id = $1 AND client_id = $2', [groupId, clientId]);
}

async function setContactGroups(clientId, contactId, groupIds) {
    await runUpdate('DELETE FROM contact_group_members WHERE contact_id = $1', [contactId]);
    for (const gid of groupIds) {
        const id = uuidv4();
        await runInsert(
            'INSERT INTO contact_group_members (id, contact_id, group_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [id, contactId, gid]
        );
    }
}

// --- Block List ---

async function getBlockedContacts(clientId) {
    return await runQuery(
        'SELECT * FROM blocked_contacts WHERE client_id = $1 ORDER BY created_at DESC',
        [clientId]
    );
}

async function blockContact({ clientId, blockedPhone, blockedEmail, blockedClientId, reason }) {
    const id = uuidv4();
    await runInsert(
        `INSERT INTO blocked_contacts (id, client_id, blocked_phone, blocked_email, blocked_client_id, reason)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, clientId, blockedPhone || null, blockedEmail || null, blockedClientId || null, reason || null]
    );
    return { id };
}

async function unblockContact(clientId, blockId) {
    return await runUpdate('DELETE FROM blocked_contacts WHERE id = $1 AND client_id = $2', [blockId, clientId]);
}

async function isContactBlocked(clientId, phoneNumber, email) {
    const conditions = [];
    const params = [clientId];
    let idx = 2;
    if (phoneNumber) { conditions.push(`blocked_phone = $${idx++}`); params.push(phoneNumber); }
    if (email) { conditions.push(`blocked_email = $${idx++}`); params.push(email); }
    if (!conditions.length) return false;
    const rows = await runQuery(
        `SELECT id FROM blocked_contacts WHERE client_id = $1 AND (${conditions.join(' OR ')}) LIMIT 1`,
        params
    );
    return rows.length > 0;
}

// --- Merge / Dedup ---

async function findDuplicateContacts(clientId) {
    const byPhone = await runQuery(
        `SELECT phone_number, COUNT(*) AS cnt FROM contacts
         WHERE client_id = $1 AND phone_number IS NOT NULL AND merged_into IS NULL
         GROUP BY phone_number HAVING COUNT(*) > 1`,
        [clientId]
    );
    const byEmail = await runQuery(
        `SELECT email, COUNT(*) AS cnt FROM contacts
         WHERE client_id = $1 AND email IS NOT NULL AND merged_into IS NULL
         GROUP BY email HAVING COUNT(*) > 1`,
        [clientId]
    );

    const duplicates = [];
    for (const row of byPhone) {
        const contacts = await runQuery(
            'SELECT * FROM contacts WHERE client_id = $1 AND phone_number = $2 AND merged_into IS NULL',
            [clientId, row.phone_number]
        );
        duplicates.push({ field: 'phone_number', value: row.phone_number, contacts });
    }
    for (const row of byEmail) {
        const contacts = await runQuery(
            'SELECT * FROM contacts WHERE client_id = $1 AND email = $2 AND merged_into IS NULL',
            [clientId, row.email]
        );
        duplicates.push({ field: 'email', value: row.email, contacts });
    }
    return duplicates;
}

async function mergeContacts(clientId, { primaryId, secondaryIds }) {
    if (!Array.isArray(secondaryIds) || !secondaryIds.length) return 0;

    const placeholders = secondaryIds.map((_, i) => `$${i + 2}`).join(',');

    await runUpdate(
        `UPDATE contact_group_members SET contact_id = $1 WHERE contact_id IN (${placeholders}) ON CONFLICT DO NOTHING`,
        [primaryId, ...secondaryIds]
    );

    const mergePlaceholders = secondaryIds.map((_, i) => `$${i + 2}`).join(',');

    await runUpdate(
        `UPDATE contacts SET merged_into = $1, updated_at = NOW() WHERE id IN (${mergePlaceholders}) AND client_id = $${secondaryIds.length + 2}`,
        [primaryId, ...secondaryIds, clientId]
    );

    return secondaryIds.length;
}

// --- Import ---

async function importContacts(clientId, contactsList) {
    const results = { imported: 0, skipped: 0, errors: [] };

    await ensureDefaultGroups(clientId);

    for (const entry of contactsList) {
        try {
            if (!entry.name) { results.skipped++; continue; }

            const sanitized = entry.phone_number ? sanitizePhoneNumberRaw(entry.phone_number) : null;

            if (sanitized) {
                const existing = await runQuery(
                    'SELECT id FROM contacts WHERE client_id = $1 AND phone_number = $2 AND merged_into IS NULL LIMIT 1',
                    [clientId, sanitized]
                );
                if (existing.length) { results.skipped++; continue; }
            }

            const id = uuidv4();
            await runInsert(
                `INSERT INTO contacts (id, client_id, name, email, phone_number, organization, notes, avatar_color, is_favorite)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [id, clientId, entry.name, entry.email || null, sanitized, entry.organization || null,
                 entry.notes || null, entry.avatar_color || null, !!entry.is_favorite]
            );

            if (entry.group_ids?.length) {
                for (const gid of entry.group_ids) {
                    const mid = uuidv4();
                    await runInsert(
                        'INSERT INTO contact_group_members (id, contact_id, group_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
                        [mid, id, gid]
                    );
                }
            }
            results.imported++;
        } catch (err) {
            results.errors.push({ name: entry.name, error: err.message });
        }
    }
    return results;
}

async function migrateSpeedDialToContacts(clientId) {
    const entries = await runQuery('SELECT * FROM speed_dial WHERE client_id = $1', [clientId]);
    let migrated = 0;

    for (const entry of entries) {
        const existing = await runQuery(
            'SELECT id FROM contacts WHERE client_id = $1 AND phone_number = $2 AND merged_into IS NULL LIMIT 1',
            [clientId, entry.phone_number]
        );
        if (existing.length) continue;

        const id = uuidv4();
        await runInsert(
            `INSERT INTO contacts (id, client_id, name, phone_number, organization, is_favorite)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, clientId, entry.name, entry.phone_number, 'Personal', true]
        );
        migrated++;
    }
    return migrated;
}

async function ensureDefaultGroups(clientId) {
    const defaults = ['Personal', 'Work', 'Family', 'Favorites'];
    for (let i = 0; i < defaults.length; i++) {
        try {
            const id = uuidv4();
            await runInsert(
                'INSERT INTO contact_groups (id, client_id, name, sort_order) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
                [id, clientId, defaults[i], i]
            );
        } catch (_) { /* already exists */ }
    }
}

async function getContactCallHistory(clientId, contactId) {
    const contact = await getContact(clientId, contactId);
    if (!contact) return [];

    const conditions = ['c.client_id = $1'];
    const params = [clientId];
    let idx = 2;

    if (contact.linked_client_id) {
        conditions.push(`(c.callee_id = $${idx} OR c.client_id = $${idx})`);
        params.push(contact.linked_client_id);
        idx++;
    }
    if (contact.phone_number) {
        conditions.push(`c.room_name IN (SELECT room_name FROM queue_requests WHERE target_phone = $${idx})`);
        params.push(contact.phone_number);
        idx++;
    }

    if (conditions.length <= 1) return [];

    params.push(50);

    return await runQuery(
        `SELECT c.*, cl.name AS caller_name, callee.name AS callee_name
         FROM calls c
         LEFT JOIN clients cl ON cl.id = c.client_id
         LEFT JOIN clients callee ON callee.id = c.callee_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY c.started_at DESC LIMIT $${idx}`,
        params
    );
}

// ============================================
// VOICEMAIL OPERATIONS
// ============================================

async function createVoicemailMessage({ id, callerId, calleeId, calleePhone, roomName, recordingFilename, storageKey, expiresAt }) {
    await runInsert(
        `INSERT INTO voicemail_messages (id, caller_id, callee_id, callee_phone, room_name, recording_filename, storage_key, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, callerId, calleeId || null, calleePhone || null, roomName, recordingFilename, storageKey, expiresAt]
    );
    return { id };
}

async function getVoicemailMessage(id) {
    const rows = await runQuery('SELECT * FROM voicemail_messages WHERE id = $1', [id]);
    return rows[0] || null;
}

async function getVoicemailMessageByRoomName(roomName) {
    const rows = await runQuery(
        "SELECT * FROM voicemail_messages WHERE room_name = $1 AND status = 'recording' ORDER BY created_at DESC LIMIT 1",
        [roomName]
    );
    return rows[0] || null;
}

async function updateVoicemailMessage(id, updates) {
    const allowed = ['status', 'storage_key', 'thumbnail_key', 'duration_seconds', 'file_size_bytes', 'content_type', 'seen'];
    const fields = [];
    const params = [];
    let idx = 1;

    for (const key of allowed) {
        if (updates[key] !== undefined) {
            fields.push(`${key} = $${idx++}`);
            params.push(key === 'seen' ? !!updates[key] : updates[key]);
        }
    }
    if (!fields.length) {
        return 0;
    }

    params.push(id);
    return await runUpdate(
        `UPDATE voicemail_messages SET ${fields.join(', ')} WHERE id = $${idx}`,
        params
    );
}

async function deleteVoicemailMessage(id) {
    return await runUpdate('DELETE FROM voicemail_messages WHERE id = $1', [id]);
}

async function markVoicemailSeen(messageId, calleeId) {
    return await runUpdate(
        'UPDATE voicemail_messages SET seen = true WHERE id = $1 AND callee_id = $2',
        [messageId, calleeId]
    );
}

async function getVoicemailInbox(calleeId, limit = 20, offset = 0) {
    return await runQuery(
        `SELECT vm.*, c.name AS caller_name
         FROM voicemail_messages vm
         LEFT JOIN clients c ON c.id = vm.caller_id
         WHERE vm.callee_id = $1 AND vm.status = 'available'
         ORDER BY vm.created_at DESC
         LIMIT $2 OFFSET $3`,
        [calleeId, limit, offset]
    );
}

async function getVoicemailInboxCount(calleeId) {
    const rows = await runQuery(
        "SELECT COUNT(*)::int AS count FROM voicemail_messages WHERE callee_id = $1 AND status = 'available'",
        [calleeId]
    );
    return Number(rows[0]?.count) || 0;
}

async function getVoicemailUnreadCount(calleeId) {
    const rows = await runQuery(
        "SELECT COUNT(*)::int AS count FROM voicemail_messages WHERE callee_id = $1 AND status = 'available' AND seen = false",
        [calleeId]
    );
    return Number(rows[0]?.count) || 0;
}

async function getVoicemailMessageCount(calleeId) {
    const rows = await runQuery(
        "SELECT COUNT(*)::int AS count FROM voicemail_messages WHERE callee_id = $1 AND status IN ('available', 'recording')",
        [calleeId]
    );
    return Number(rows[0]?.count) || 0;
}

async function getVoicemailStorageUsage(calleeId) {
    const rows = await runQuery(
        "SELECT COALESCE(SUM(file_size_bytes), 0)::bigint AS bytes FROM voicemail_messages WHERE callee_id = $1 AND status = 'available'",
        [calleeId]
    );
    return Number(rows[0]?.bytes) || 0;
}

async function getActiveVoicemailRecordings() {
    return await runQuery(
        "SELECT * FROM voicemail_messages WHERE status = 'recording' ORDER BY created_at"
    );
}

async function getExpiredVoicemailMessages() {
    return await runQuery(
        "SELECT * FROM voicemail_messages WHERE expires_at < NOW() AND status = 'available'"
    );
}

async function getAllVoicemailMessages({ status, callerId, calleeId, limit = 50, offset = 0 } = {}) {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    if (callerId) { conditions.push(`caller_id = $${idx++}`); params.push(callerId); }
    if (calleeId) { conditions.push(`callee_id = $${idx++}`); params.push(calleeId); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    return await runQuery(
        `SELECT vm.*, c.name AS caller_name, cl.name AS callee_name
         FROM voicemail_messages vm
         LEFT JOIN clients c ON c.id = vm.caller_id
         LEFT JOIN clients cl ON cl.id = vm.callee_id
         ${where}
         ORDER BY vm.created_at DESC
         LIMIT $${idx++} OFFSET $${idx}`,
        params
    );
}

async function getVoicemailStorageStats() {
    const rows = await runQuery(`
        SELECT
            COUNT(*) FILTER (WHERE status = 'available')::int AS total_messages,
            COALESCE(SUM(file_size_bytes) FILTER (WHERE status = 'available'), 0)::bigint AS total_size_bytes,
            COUNT(*) FILTER (WHERE status = 'recording')::int AS active_recordings
        FROM voicemail_messages
    `);
    const row = rows[0] || {};
    return {
        total_messages: Number(row.total_messages) || 0,
        total_size_bytes: Number(row.total_size_bytes) || 0,
        active_recordings: Number(row.active_recordings) || 0
    };
}

async function getVoicemailSetting(key) {
    const rows = await runQuery('SELECT setting_value FROM voicemail_settings WHERE setting_key = $1', [key]);
    return rows[0]?.setting_value ?? null;
}

async function setVoicemailSetting(key, value, updatedBy) {
    const id = uuidv4();
    await runInsert(
        `INSERT INTO voicemail_settings (id, setting_key, setting_value, updated_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (setting_key) DO UPDATE
           SET setting_value = EXCLUDED.setting_value,
               updated_by = EXCLUDED.updated_by,
               updated_at = NOW()`,
        [id, key, String(value), updatedBy || null]
    );
}

async function getAllVoicemailSettings() {
    return await runQuery(
        'SELECT setting_key, setting_value, updated_by, updated_at FROM voicemail_settings ORDER BY setting_key'
    );
}

async function seedVoicemailSettings() {
    const defaults = [
        ['vm-enabled', 'true'],
        ['vm-max-length', '180'],
        ['vm-max-messages', '100'],
        ['vm-retention-days', '30'],
        ['vm-storage-quota-mb', '500']
    ];

    for (const [key, value] of defaults) {
        const id = uuidv4();
        await runInsert(
            `INSERT INTO voicemail_settings (id, setting_key, setting_value)
             VALUES ($1, $2, $3)
             ON CONFLICT (setting_key) DO NOTHING`,
            [id, key, value]
        );
    }
}

// ============================================
// DEVICE HANDOFF: ACTIVE SESSIONS
// ============================================

async function getAllActiveSessions() {
    return await runQuery('SELECT * FROM active_sessions');
}

async function upsertActiveSession({ userId, roomName, interpreterId, deviceId }) {
    await runInsert(
        `INSERT INTO active_sessions (user_id, room_name, interpreter_id, device_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE
           SET room_name = EXCLUDED.room_name,
               interpreter_id = EXCLUDED.interpreter_id,
               device_id = EXCLUDED.device_id,
               updated_at = NOW()`,
        [userId, roomName, interpreterId || null, deviceId || null]
    );
}

async function deleteActiveSession(userId) {
    return await runUpdate('DELETE FROM active_sessions WHERE user_id = $1', [userId]);
}

// ============================================
// DEVICE HANDOFF: TOKENS
// ============================================

async function storeHandoffToken({ token, userId, roomName, interpreterId, fromDeviceId, targetDeviceId, expiresAt }) {
    const expiresAtIso = typeof expiresAt === 'number' ? new Date(expiresAt).toISOString() : expiresAt;
    await runInsert(
        `INSERT INTO handoff_tokens (token, user_id, room_name, interpreter_id, from_device_id, target_device_id, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [token, userId, roomName, interpreterId || null, fromDeviceId || null, targetDeviceId || null, expiresAtIso]
    );
}

async function getAllActiveHandoffTokens() {
    return await runQuery('SELECT * FROM handoff_tokens WHERE expires_at > NOW()');
}

async function deleteHandoffToken(token) {
    return await runUpdate('DELETE FROM handoff_tokens WHERE token = $1', [token]);
}

async function deleteHandoffTokensByUser(userId) {
    return await runUpdate('DELETE FROM handoff_tokens WHERE user_id = $1', [userId]);
}

async function deleteExpiredHandoffTokens() {
    return await runUpdate('DELETE FROM handoff_tokens WHERE expires_at <= NOW()');
}

// ============================================
// SERVER STATE (queue persistence, counters)
// ============================================

async function getServerState(key) {
    const rows = await runQuery('SELECT value FROM server_state WHERE key = $1', [key]);
    return rows[0]?.value ?? null;
}

async function setServerState(key, value) {
    await runInsert(
        `INSERT INTO server_state (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, value === null || value === undefined ? null : String(value)]
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
    // Contacts & Address Book
    getContacts,
    getContact,
    createContact,
    updateContact,
    deleteContact,
    getContactGroups,
    createContactGroup,
    updateContactGroup,
    deleteContactGroup,
    setContactGroups,
    getBlockedContacts,
    blockContact,
    unblockContact,
    isContactBlocked,
    findDuplicateContacts,
    mergeContacts,
    importContacts,
    migrateSpeedDialToContacts,
    ensureDefaultGroups,
    getContactCallHistory,
    // Voicemail
    createVoicemailMessage,
    getVoicemailMessage,
    getVoicemailMessageByRoomName,
    updateVoicemailMessage,
    deleteVoicemailMessage,
    markVoicemailSeen,
    getVoicemailInbox,
    getVoicemailInboxCount,
    getVoicemailUnreadCount,
    getVoicemailMessageCount,
    getVoicemailStorageUsage,
    getActiveVoicemailRecordings,
    getExpiredVoicemailMessages,
    getAllVoicemailMessages,
    getVoicemailStorageStats,
    getVoicemailSetting,
    setVoicemailSetting,
    getAllVoicemailSettings,
    seedVoicemailSettings,
    // Device handoff
    getAllActiveSessions,
    upsertActiveSession,
    deleteActiveSession,
    storeHandoffToken,
    getAllActiveHandoffTokens,
    deleteHandoffToken,
    deleteHandoffTokensByUser,
    deleteExpiredHandoffTokens,
    // Server state
    getServerState,
    setServerState,
    pool: () => pool
};
