-- 009: Corporate billing account hardening and immutable invoice linkage

ALTER TABLE corporate_accounts
    ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'malka',
    ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    ADD COLUMN IF NOT EXISTS default_rate_per_minute NUMERIC(10,4);

CREATE INDEX IF NOT EXISTS idx_corporate_tenant ON corporate_accounts(tenant_id);

CREATE TABLE IF NOT EXISTS client_billing_accounts (
    client_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL DEFAULT 'malka',
    corporate_account_id UUID NOT NULL REFERENCES corporate_accounts(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT,
    PRIMARY KEY (client_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_client_billing_corporate ON client_billing_accounts(corporate_account_id);

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'USD';

CREATE TABLE IF NOT EXISTS invoice_cdrs (
    invoice_id UUID NOT NULL REFERENCES invoices(id),
    cdr_id UUID NOT NULL REFERENCES billing_cdrs(id),
    amount NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (invoice_id, cdr_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_cdrs_cdr ON invoice_cdrs(cdr_id);

UPDATE billing_rate_tiers
SET label = 'VRI ASL-English USD Standard Rate',
    per_minute_rate = 1.00
WHERE call_type = 'vri'
  AND label = 'VRI Standard Rate'
  AND per_minute_rate = 4.95;
