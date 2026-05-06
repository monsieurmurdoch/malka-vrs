-- 009: Invoice delivery recipients, sends, and automation state

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_send_status TEXT,
    ADD COLUMN IF NOT EXISTS last_send_error TEXT,
    ADD COLUMN IF NOT EXISTS stripe_hosted_url TEXT;

CREATE TABLE IF NOT EXISTS corporate_account_invoice_recipients (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    corporate_account_id UUID NOT NULL REFERENCES corporate_accounts(id) ON DELETE CASCADE,
    recipient_type       TEXT NOT NULL CHECK (recipient_type IN ('to', 'cc', 'bcc')),
    name                 TEXT,
    email                TEXT NOT NULL,
    is_primary           BOOLEAN NOT NULL DEFAULT false,
    is_active            BOOLEAN NOT NULL DEFAULT true,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by           TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_recipients_unique_active
    ON corporate_account_invoice_recipients(corporate_account_id, lower(email), recipient_type)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_invoice_recipients_account
    ON corporate_account_invoice_recipients(corporate_account_id);

INSERT INTO corporate_account_invoice_recipients (
    corporate_account_id, recipient_type, name, email, is_primary, created_by
)
SELECT id, 'to', billing_contact_name, billing_contact_email, true, 'migration-009'
FROM corporate_accounts
WHERE billing_contact_email IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS invoice_send_events (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id           UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    corporate_account_id UUID NOT NULL REFERENCES corporate_accounts(id),
    delivery_mode        TEXT NOT NULL CHECK (delivery_mode IN ('manual', 'auto', 'bulk')),
    send_status          TEXT NOT NULL CHECK (send_status IN ('sent', 'partial', 'failed', 'skipped')),
    stripe_invoice_id    TEXT,
    stripe_hosted_url    TEXT,
    recipient_to         TEXT[] NOT NULL DEFAULT '{}',
    recipient_cc         TEXT[] NOT NULL DEFAULT '{}',
    recipient_bcc        TEXT[] NOT NULL DEFAULT '{}',
    business_copy_emails TEXT[] NOT NULL DEFAULT '{}',
    provider_result      JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message        TEXT,
    sent_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    performed_by         TEXT
);

CREATE INDEX IF NOT EXISTS idx_invoice_send_events_invoice
    ON invoice_send_events(invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_send_events_account
    ON invoice_send_events(corporate_account_id, sent_at DESC);
