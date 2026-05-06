exports.shorthands = undefined;

exports.up = pgm => {
    pgm.sql(`
        CREATE TABLE IF NOT EXISTS client_contact_handles (
            id TEXT PRIMARY KEY,
            client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            phone_number_id TEXT NOT NULL REFERENCES client_phone_numbers(id) ON DELETE CASCADE,
            handle TEXT UNIQUE NOT NULL,
            visibility TEXT DEFAULT 'public',
            is_primary BOOLEAN DEFAULT true,
            active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        ALTER TABLE contacts ADD COLUMN IF NOT EXISTS contact_handle TEXT;

        CREATE INDEX IF NOT EXISTS idx_client_handles_client ON client_contact_handles(client_id);
        CREATE INDEX IF NOT EXISTS idx_client_handles_lookup ON client_contact_handles(handle) WHERE active = true;
    `);
};

exports.down = pgm => {
    pgm.sql(`
        DROP INDEX IF EXISTS idx_client_handles_lookup;
        DROP INDEX IF EXISTS idx_client_handles_client;
        ALTER TABLE contacts DROP COLUMN IF EXISTS contact_handle;
        DROP TABLE IF EXISTS client_contact_handles;
    `);
};
