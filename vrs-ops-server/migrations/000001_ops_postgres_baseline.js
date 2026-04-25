exports.shorthands = undefined;

exports.up = pgm => {
    pgm.sql(`
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
            tenant_id TEXT NOT NULL DEFAULT 'malka',
            organization TEXT NOT NULL DEFAULT '',
            active BOOLEAN NOT NULL DEFAULT true,
            created_by TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_login_at TIMESTAMPTZ
        );

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
};

exports.down = pgm => {
    pgm.sql('SELECT 1');
};
