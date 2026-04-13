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

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Database file path
const DB_PATH = path.join(__dirname, 'data', 'vrs.db');

let db = null;

// ============================================
// DATABASE INITIALIZATION
// ============================================

function initialize() {
    return new Promise((resolve, reject) => {
        // Ensure data directory exists
        const fs = require('fs');
        const dataDir = path.dirname(DB_PATH);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        db = new sqlite3.Database(DB_PATH, (err) => {
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

function createTables() {
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
                status TEXT DEFAULT 'active'
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
            `CREATE INDEX IF NOT EXISTS idx_missed_calls_caller ON missed_calls(caller_id)`
        ];

        let completed = 0;
        const total = tables.length;

        db.serialize(() => {
            tables.forEach((sql) => {
                db.run(sql, (err) => {
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

function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function runInsert(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
        });
    });
}

function runUpdate(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
}

// ============================================
// ADMIN OPERATIONS
// ============================================

async function getAdminByUsername(username) {
    const rows = await runQuery(
        'SELECT * FROM admins WHERE username = ?',
        [username]
    );
    return rows[0];
}

async function createAdmin({ username, password, name }) {
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

async function getAllInterpreters() {
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
        languages: JSON.parse(i.languages || '[]'),
        total_calls: i.total_calls || 0,
        calls_today: i.calls_today || 0,
        total_minutes: i.total_minutes || 0,
        minutes_week: i.minutes_week || 0
    }));
}

async function getInterpreter(id) {
    const rows = await runQuery('SELECT * FROM interpreters WHERE id = ?', [id]);
    if (rows.length === 0) return null;

    const i = rows[0];
    return {
        ...i,
        languages: JSON.parse(i.languages || '[]')
    };
}

async function getInterpreterByEmail(email) {
    const rows = await runQuery('SELECT * FROM interpreters WHERE email = ?', [email]);
    if (rows.length === 0) return null;

    const i = rows[0];
    return {
        ...i,
        languages: JSON.parse(i.languages || '[]')
    };
}

async function createInterpreter({ name, email, languages, password }) {
    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password || 'changeme', 10);

    await runInsert(
        'INSERT INTO interpreters (id, name, email, password_hash, languages) VALUES (?, ?, ?, ?, ?)',
        [id, name, email, passwordHash, JSON.stringify(languages || ['ASL'])]
    );

    return { id, name, email };
}

async function updateInterpreter(id, { name, email, languages, active }) {
    const updates = [];
    const params = [];

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

async function deleteInterpreter(id) {
    await runUpdate('UPDATE interpreters SET active = 0 WHERE id = ?', [id]);
}

async function getInterpreterStats() {
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

async function getAllCaptioners() {
    const captioners = await runQuery(`
        SELECT *
        FROM captioners
        WHERE active = 1
        ORDER BY name
    `);

    return captioners.map(captioner => ({
        ...captioner,
        languages: JSON.parse(captioner.languages || '[]')
    }));
}

async function getCaptioner(id) {
    const rows = await runQuery('SELECT * FROM captioners WHERE id = ?', [id]);
    if (rows.length === 0) return null;

    const captioner = rows[0];

    return {
        ...captioner,
        languages: JSON.parse(captioner.languages || '[]')
    };
}

async function getCaptionerByEmail(email) {
    const rows = await runQuery('SELECT * FROM captioners WHERE email = ?', [email]);
    if (rows.length === 0) return null;

    const captioner = rows[0];

    return {
        ...captioner,
        languages: JSON.parse(captioner.languages || '[]')
    };
}

async function createCaptioner({ name, email, languages, password }) {
    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password || 'changeme', 10);

    await runInsert(
        'INSERT INTO captioners (id, name, email, password_hash, languages) VALUES (?, ?, ?, ?, ?)',
        [id, name, email, passwordHash, JSON.stringify(languages || ['en'])]
    );

    return { id, name, email };
}

async function updateCaptioner(id, { name, email, languages, active }) {
    const updates = [];
    const params = [];

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

async function deleteCaptioner(id) {
    await runUpdate('UPDATE captioners SET active = 0 WHERE id = ?', [id]);
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
        total_calls: c.total_calls || 0
    }));
}

async function getClient(id) {
    const rows = await runQuery('SELECT * FROM clients WHERE id = ?', [id]);
    return rows[0];
}

async function getClientByEmail(email) {
    const rows = await runQuery('SELECT * FROM clients WHERE email = ?', [email]);
    return rows[0];
}

async function createClient({ name, email, organization, password }) {
    const id = uuidv4();
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    await runInsert(
        'INSERT INTO clients (id, name, email, password_hash, organization) VALUES (?, ?, ?, ?, ?)',
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
        'INSERT INTO calls (id, client_id, interpreter_id, room_name, language, status) VALUES (?, ?, ?, ?, ?, ?)',
        [id, clientId, interpreterId, roomName, language, 'active']
    );

    return id;
}

async function endCall(callId, durationMinutes) {
    await runUpdate(
        'UPDATE calls SET ended_at = CURRENT_TIMESTAMP, duration_minutes = ?, status = ? WHERE id = ?',
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

    // Get current position
    const count = await runQuery(
        'SELECT COUNT(*) as count FROM queue_requests WHERE status = "waiting"'
    );

    await runInsert(
        'INSERT INTO queue_requests (id, client_id, client_name, language, target_phone, room_name, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, clientId || null, clientName, language, targetPhone, roomName, count[0].count + 1]
    );

    return { id, position: count[0].count + 1 };
}

async function getQueueRequests(status = 'waiting') {
    const requests = await runQuery(
        'SELECT * FROM queue_requests WHERE status = ? ORDER BY position',
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
        'UPDATE queue_requests SET status = ?, assigned_to = ?, assigned_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['assigned', interpreterId, requestId]
    );

    // Reorder remaining queue
    await reorderQueue();
}

async function completeRequest(requestId) {
    await runUpdate(
        'UPDATE queue_requests SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['completed', requestId]
    );
}

async function removeFromQueue(requestId) {
    await runUpdate('DELETE FROM queue_requests WHERE id = ?', [requestId]);
    await reorderQueue();
}

async function reorderQueue() {
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
        'INSERT INTO activity_log (id, type, description, data, created_by) VALUES (?, ?, ?, ?, ?)',
        [id, type, description, JSON.stringify(data), createdBy]
    );
}

async function getActivityLog({ limit = 50, type, offset = 0 }) {
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
        data: JSON.parse(row.data || '{}')
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
            total: interpreterCount[0].total,
            online: interpreterCount[0].online
        },
        clients: {
            total: clientCount[0].total
        },
        queue: {
            count: queueCount[0].count,
            avg_wait_minutes: avgWait[0].avg_minutes || 0
        },
        calls: {
            active: activeCalls[0].count,
            today: todayStats[0].total_calls || 0,
            today_minutes: todayStats[0].total_minutes || 0
        },
        growth: {
            this_week: weekCompare[0].this_week || 0,
            last_week: weekCompare[0].last_week || 0
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

async function getSpeedDialEntries(clientId) {
    return await runQuery(
        'SELECT * FROM speed_dial WHERE client_id = ? ORDER BY use_count DESC, name',
        [clientId]
    );
}

async function addSpeedDialEntry({ clientId, name, phoneNumber, category }) {
    const id = uuidv4();
    await runInsert(
        'INSERT INTO speed_dial (id, client_id, name, phone_number, category) VALUES (?, ?, ?, ?, ?)',
        [id, clientId, name, phoneNumber, category || 'personal']
    );
    return { id, name, phoneNumber };
}

async function updateSpeedDialEntry(id, clientId, { name, phoneNumber, category }) {
    const updates = [];
    const params = [];

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

async function deleteSpeedDialEntry(id, clientId) {
    return await runUpdate('DELETE FROM speed_dial WHERE id = ? AND client_id = ?', [id, clientId]);
}

async function incrementSpeedDialUsage(id) {
    await runUpdate(
        'UPDATE speed_dial SET use_count = use_count + 1, last_used = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
    );
}

// ============================================
// CLIENT PHONE NUMBER OPERATIONS
// ============================================

async function getClientPhoneNumbers(clientId) {
    return await runQuery(
        'SELECT * FROM client_phone_numbers WHERE client_id = ? AND active = 1',
        [clientId]
    );
}

async function assignClientPhoneNumber({ clientId, phoneNumber, isPrimary }) {
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

async function getInterpreterShifts(interpreterId, startDate, endDate) {
    let sql = 'SELECT * FROM interpreter_shifts WHERE interpreter_id = ?';
    const params = [interpreterId];

    if (startDate) { sql += ' AND date >= ?'; params.push(startDate); }
    if (endDate) { sql += ' AND date <= ?'; params.push(endDate); }

    sql += ' ORDER BY date DESC';

    return await runQuery(sql, params);
}

async function createInterpreterShift({ interpreterId, date, startTime }) {
    const id = uuidv4();
    await runInsert(
        'INSERT OR REPLACE INTO interpreter_shifts (id, interpreter_id, date, start_time) VALUES (?, ?, ?, ?)',
        [id, interpreterId, date, startTime]
    );
    return { id, date };
}

async function updateInterpreterShift(id, { endTime, totalMinutes, status }) {
    const updates = [];
    const params = [];

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

async function getInterpreterEarnings(interpreterId, periodStart, periodEnd) {
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

async function getClientCallHistory(clientId, limit = 20, offset = 0) {
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

async function getInterpreterCallHistory(interpreterId, limit = 20, offset = 0) {
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

async function getInterpreterStats(interpreterId) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

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
        totalCalls: calls[0]?.total_calls || 0,
        totalMinutes: calls[0]?.total_minutes || 0,
        avgDuration: Math.round(calls[0]?.avg_duration || 0),
        totalEarnings: earnings[0]?.total_earnings || 0
    };
}

// ============================================
// MIGRATIONS
// ============================================

function runMigrations() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(
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
                (captionersErr) => {
                    if (captionersErr) {
                        return reject(captionersErr);
                    }

                    db.run(
                        'CREATE INDEX IF NOT EXISTS idx_captioners_email ON captioners(email)',
                        (captionersIndexErr) => {
                            if (captionersIndexErr) {
                                return reject(captionersIndexErr);
                            }

                            db.all('PRAGMA table_info(calls)', (callsErr, callColumns) => {
                if (callsErr) {
                    return reject(callsErr);
                }

                const hasCalleeId = callColumns.some(col => col.name === 'callee_id');

                const migrateMissedCalls = () => {
                    db.all('PRAGMA table_info(missed_calls)', (missedErr, missedColumns) => {
                        if (missedErr) {
                            return reject(missedErr);
                        }

                        const columnNames = new Set(missedColumns.map(col => col.name));
                        db.all('PRAGMA table_info(queue_requests)', (queueErr, queueColumns) => {
                            if (queueErr) {
                                return reject(queueErr);
                            }

                            const queueColumnNames = new Set(queueColumns.map(col => col.name));
                            const migrationSteps = [];

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

                                db.run(migrationSteps[index], (stepErr) => {
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
                    db.run('ALTER TABLE calls ADD COLUMN callee_id TEXT', (alterErr) => {
                        if (alterErr) {
                            console.warn('[Database] Migration callee_id:', alterErr.message);
                        }
                        migrateMissedCalls();
                    });
                } else {
                    migrateMissedCalls();
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
// P2P CLIENT-TO-CLIENT OPERATIONS
// ============================================

async function getClientByPhoneNumber(phoneNumber) {
    const rows = await runQuery(
        `SELECT c.*, cpn.phone_number, cpn.is_primary
         FROM client_phone_numbers cpn
         JOIN clients c ON c.id = cpn.client_id
         WHERE cpn.phone_number = ? AND cpn.active = 1`,
        [phoneNumber]
    );
    return rows[0] || null;
}

async function createP2PCall({ callerId, calleeId, roomName }) {
    const id = uuidv4();
    await runInsert(
        'INSERT INTO calls (id, client_id, interpreter_id, room_name, language, status, callee_id) VALUES (?, ?, NULL, ?, NULL, ?, ?)',
        [id, callerId, roomName, 'p2p_active', calleeId]
    );
    return id;
}

async function createMissedCall({ callerId, calleePhone, calleeClientId, roomName }) {
    const id = uuidv4();
    await runInsert(
        'INSERT INTO missed_calls (id, caller_id, callee_phone, callee_client_id, room_name) VALUES (?, ?, ?, ?, ?)',
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
           AND cp.is_primary = 1
           AND cp.active = 1
         WHERE mc.callee_client_id = ?
         ORDER BY mc.created_at DESC`,
        [clientId]
    );
}

async function markMissedCallsSeen(clientId) {
    await runUpdate(
        'UPDATE missed_calls SET seen = 1 WHERE callee_client_id = ? AND seen = 0',
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
           AND (c.client_id = ? OR c.callee_id = ?)
         ORDER BY c.started_at DESC`,
        [clientId, clientId]
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
    db: () => db
};
