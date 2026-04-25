exports.shorthands = undefined;

exports.up = pgm => {
    pgm.sql(`
        CREATE TABLE IF NOT EXISTS admins (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            last_login TIMESTAMPTZ
        );

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

        CREATE TABLE IF NOT EXISTS clients (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT,
            organization TEXT DEFAULT 'Personal',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            last_call TIMESTAMPTZ
        );

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
            callee_id TEXT,
            call_type TEXT,
            call_mode TEXT
        );

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

        CREATE TABLE IF NOT EXISTS activity_log (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            description TEXT,
            data JSONB,
            created_by TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS daily_stats (
            id SERIAL PRIMARY KEY,
            date DATE NOT NULL UNIQUE,
            total_calls INTEGER DEFAULT 0,
            total_minutes INTEGER DEFAULT 0,
            unique_clients INTEGER DEFAULT 0,
            unique_interpreters INTEGER DEFAULT 0,
            avg_wait_time_seconds REAL DEFAULT 0
        );

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

        CREATE TABLE IF NOT EXISTS client_phone_numbers (
            id TEXT PRIMARY KEY,
            client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            phone_number TEXT UNIQUE NOT NULL,
            is_primary BOOLEAN DEFAULT false,
            assigned_at TIMESTAMPTZ DEFAULT NOW(),
            active BOOLEAN DEFAULT true
        );

        CREATE TABLE IF NOT EXISTS missed_calls (
            id TEXT PRIMARY KEY,
            caller_id TEXT,
            callee_client_id TEXT,
            callee_phone TEXT,
            room_name TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            seen BOOLEAN DEFAULT false
        );

        CREATE TABLE IF NOT EXISTS active_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            user_type TEXT NOT NULL,
            device_id TEXT NOT NULL,
            room_name TEXT,
            last_seen TIMESTAMPTZ DEFAULT NOW(),
            data JSONB DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS handoff_tokens (
            token TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            user_type TEXT NOT NULL,
            room_name TEXT,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            data JSONB DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS contacts (
            id TEXT PRIMARY KEY,
            client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            phone_number TEXT,
            email TEXT,
            organization TEXT,
            category TEXT DEFAULT 'personal',
            notes TEXT,
            favorite BOOLEAN DEFAULT false,
            blocked BOOLEAN DEFAULT false,
            source TEXT DEFAULT 'manual',
            external_id TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            last_contacted TIMESTAMPTZ
        );

        CREATE TABLE IF NOT EXISTS contact_notes (
            id TEXT PRIMARY KEY,
            contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
            client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            note TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS contact_sync_log (
            id TEXT PRIMARY KEY,
            client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            contact_id TEXT,
            action TEXT NOT NULL,
            payload JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS google_oauth_tokens (
            client_id TEXT PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
            access_token TEXT,
            refresh_token TEXT,
            scope TEXT,
            token_type TEXT,
            expiry_date TIMESTAMPTZ,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS client_preferences (
            client_id TEXT PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
            preferences JSONB NOT NULL DEFAULT '{}',
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_calls_client ON calls(client_id);
        CREATE INDEX IF NOT EXISTS idx_calls_interpreter ON calls(interpreter_id);
        CREATE INDEX IF NOT EXISTS idx_calls_started_at ON calls(started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_queue_requests_status ON queue_requests(status);
        CREATE INDEX IF NOT EXISTS idx_contacts_client ON contacts(client_id);
        CREATE INDEX IF NOT EXISTS idx_contacts_client_updated ON contacts(client_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_contact_sync_client_created ON contact_sync_log(client_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_handoff_tokens_expires ON handoff_tokens(expires_at);
    `);
};

exports.down = pgm => {
    pgm.sql('SELECT 1');
};
