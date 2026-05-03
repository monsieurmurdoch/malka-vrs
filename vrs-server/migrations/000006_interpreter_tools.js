exports.shorthands = undefined;

exports.up = pgm => {
    pgm.sql(`
        CREATE TABLE IF NOT EXISTS interpreter_schedule_windows (
            id TEXT PRIMARY KEY,
            interpreter_id TEXT NOT NULL REFERENCES interpreters(id) ON DELETE CASCADE,
            starts_at TIMESTAMPTZ NOT NULL,
            ends_at TIMESTAMPTZ NOT NULL,
            tenant_id TEXT DEFAULT 'malka',
            service_modes JSONB DEFAULT '["vrs"]',
            languages JSONB DEFAULT '["ASL"]',
            status TEXT DEFAULT 'scheduled',
            manager_note TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS interpreter_availability_sessions (
            id TEXT PRIMARY KEY,
            interpreter_id TEXT NOT NULL REFERENCES interpreters(id) ON DELETE CASCADE,
            status TEXT NOT NULL,
            started_at TIMESTAMPTZ DEFAULT NOW(),
            ended_at TIMESTAMPTZ,
            source TEXT DEFAULT 'interpreter',
            reason TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS interpreter_break_sessions (
            id TEXT PRIMARY KEY,
            interpreter_id TEXT NOT NULL REFERENCES interpreters(id) ON DELETE CASCADE,
            started_at TIMESTAMPTZ DEFAULT NOW(),
            ended_at TIMESTAMPTZ,
            break_type TEXT DEFAULT 'general',
            paid BOOLEAN DEFAULT false,
            reason TEXT,
            source TEXT DEFAULT 'interpreter',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS interpreter_continuity_notes (
            id TEXT PRIMARY KEY,
            interpreter_id TEXT NOT NULL REFERENCES interpreters(id) ON DELETE CASCADE,
            client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
            call_id TEXT REFERENCES calls(id) ON DELETE SET NULL,
            note TEXT NOT NULL,
            visibility TEXT DEFAULT 'self',
            preference_tags JSONB DEFAULT '[]',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS interpreter_team_assignments (
            id TEXT PRIMARY KEY,
            primary_interpreter_id TEXT NOT NULL REFERENCES interpreters(id) ON DELETE CASCADE,
            teammate_interpreter_id TEXT REFERENCES interpreters(id) ON DELETE SET NULL,
            call_id TEXT REFERENCES calls(id) ON DELETE SET NULL,
            room_name TEXT,
            status TEXT DEFAULT 'requested',
            requested_by TEXT,
            requested_at TIMESTAMPTZ DEFAULT NOW(),
            accepted_at TIMESTAMPTZ,
            ended_at TIMESTAMPTZ,
            notes TEXT
        );

        CREATE TABLE IF NOT EXISTS post_call_surveys (
            id TEXT PRIMARY KEY,
            call_id TEXT REFERENCES calls(id) ON DELETE SET NULL,
            respondent_id TEXT NOT NULL,
            respondent_role TEXT NOT NULL,
            rating INTEGER CHECK (rating >= 1 AND rating <= 5),
            tags JSONB DEFAULT '[]',
            comments TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_schedule_windows_interpreter ON interpreter_schedule_windows(interpreter_id, starts_at);
        CREATE INDEX IF NOT EXISTS idx_availability_sessions_interpreter ON interpreter_availability_sessions(interpreter_id, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_break_sessions_interpreter ON interpreter_break_sessions(interpreter_id, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_continuity_notes_interpreter_client ON interpreter_continuity_notes(interpreter_id, client_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_team_assignments_primary ON interpreter_team_assignments(primary_interpreter_id, requested_at DESC);
        CREATE INDEX IF NOT EXISTS idx_team_assignments_teammate ON interpreter_team_assignments(teammate_interpreter_id, requested_at DESC);
        CREATE INDEX IF NOT EXISTS idx_post_call_surveys_call ON post_call_surveys(call_id);
    `);
};

exports.down = pgm => {
    pgm.sql(`
        DROP TABLE IF EXISTS post_call_surveys;
        DROP TABLE IF EXISTS interpreter_team_assignments;
        DROP TABLE IF EXISTS interpreter_continuity_notes;
        DROP TABLE IF EXISTS interpreter_break_sessions;
        DROP TABLE IF EXISTS interpreter_availability_sessions;
        DROP TABLE IF EXISTS interpreter_schedule_windows;
    `);
};
