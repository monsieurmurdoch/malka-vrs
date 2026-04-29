exports.shorthands = undefined;

exports.up = pgm => {
    pgm.sql(`
        ALTER TABLE clients ADD COLUMN IF NOT EXISTS service_modes JSONB DEFAULT '["vrs"]';
        ALTER TABLE clients ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'malka';
        ALTER TABLE interpreters ADD COLUMN IF NOT EXISTS service_modes JSONB DEFAULT '["vrs"]';
        ALTER TABLE interpreters ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'malka';

        UPDATE clients SET tenant_id = 'malka' WHERE tenant_id IS NULL;
        UPDATE interpreters SET tenant_id = 'malka' WHERE tenant_id IS NULL;

        ALTER TABLE clients ALTER COLUMN tenant_id SET DEFAULT 'malka';
        ALTER TABLE interpreters ALTER COLUMN tenant_id SET DEFAULT 'malka';

        ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_email_key;
        ALTER TABLE interpreters DROP CONSTRAINT IF EXISTS interpreters_email_key;

        CREATE UNIQUE INDEX IF NOT EXISTS clients_tenant_email_idx ON clients (tenant_id, email);
        CREATE UNIQUE INDEX IF NOT EXISTS interpreters_tenant_email_idx ON interpreters (tenant_id, email);
    `);
};

exports.down = pgm => {
    pgm.sql(`
        DROP INDEX IF EXISTS clients_tenant_email_idx;
        DROP INDEX IF EXISTS interpreters_tenant_email_idx;
        ALTER TABLE clients ADD CONSTRAINT clients_email_key UNIQUE (email);
        ALTER TABLE interpreters ADD CONSTRAINT interpreters_email_key UNIQUE (email);
    `);
};
