exports.up = pgm => {
    pgm.sql(`
        CREATE TABLE IF NOT EXISTS vri_session_invites (
            token TEXT PRIMARY KEY,
            queue_request_id TEXT,
            client_id TEXT,
            guest_name TEXT,
            guest_email TEXT,
            guest_phone TEXT,
            room_name TEXT,
            status TEXT DEFAULT 'prepared',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL,
            activated_at TIMESTAMPTZ,
            ended_at TIMESTAMPTZ
        );

        CREATE INDEX IF NOT EXISTS idx_vri_invites_queue ON vri_session_invites(queue_request_id);
        CREATE INDEX IF NOT EXISTS idx_vri_invites_client ON vri_session_invites(client_id);
        CREATE INDEX IF NOT EXISTS idx_vri_invites_expires ON vri_session_invites(expires_at);

        CREATE OR REPLACE FUNCTION prevent_calls_call_type_change()
        RETURNS trigger AS $$
        BEGIN
            IF OLD.call_type IS NOT NULL AND NEW.call_type IS DISTINCT FROM OLD.call_type THEN
                RAISE EXCEPTION 'calls.call_type is immutable once set';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_calls_call_type_immutable ON calls;
        CREATE TRIGGER trg_calls_call_type_immutable
            BEFORE UPDATE OF call_type ON calls
            FOR EACH ROW
            EXECUTE FUNCTION prevent_calls_call_type_change();
    `);
};

exports.down = pgm => {
    pgm.sql(`
        DROP TRIGGER IF EXISTS trg_calls_call_type_immutable ON calls;
        DROP FUNCTION IF EXISTS prevent_calls_call_type_change();
        DROP TABLE IF EXISTS vri_session_invites;
    `);
};
