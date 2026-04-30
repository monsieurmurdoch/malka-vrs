-- 011: Stripe portal/credit-note support plus payout batch invoice artifacts

ALTER TABLE stripe_webhook_events
    ADD COLUMN IF NOT EXISTS replay_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_replayed_at TIMESTAMPTZ;

CREATE TABLE billing_credit_notes (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id              UUID REFERENCES invoices(id) ON DELETE SET NULL,
    provider                TEXT NOT NULL DEFAULT 'stripe',
    provider_credit_note_id TEXT,
    amount                  NUMERIC(12,2) NOT NULL,
    currency                CHAR(3) NOT NULL DEFAULT 'USD',
    reason                  TEXT NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'issued',
    created_by              TEXT,
    metadata                JSONB NOT NULL DEFAULT '{}',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_billing_credit_notes_invoice ON billing_credit_notes(invoice_id);
CREATE INDEX idx_billing_credit_notes_provider ON billing_credit_notes(provider, provider_credit_note_id);

ALTER TABLE interpreter_payout_batches
    ADD COLUMN IF NOT EXISTS exported_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS exported_by TEXT,
    ADD COLUMN IF NOT EXISTS paid_by TEXT;

ALTER TABLE interpreter_payables
    ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS paid_by TEXT;

CREATE TABLE interpreter_contractor_invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interpreter_id      TEXT NOT NULL,
    tenant_id           TEXT,
    invoice_number      TEXT NOT NULL UNIQUE,
    period_start        DATE NOT NULL,
    period_end          DATE NOT NULL,
    subtotal            NUMERIC(12,2) NOT NULL DEFAULT 0,
    adjustments         NUMERIC(12,2) NOT NULL DEFAULT 0,
    total               NUMERIC(12,2) NOT NULL DEFAULT 0,
    currency            CHAR(3) NOT NULL DEFAULT 'USD',
    status              TEXT NOT NULL DEFAULT 'draft',
    approved_by         TEXT,
    approved_at         TIMESTAMPTZ,
    paid_by             TEXT,
    paid_at             TIMESTAMPTZ,
    created_by          TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_interpreter_contractor_invoices_interpreter
    ON interpreter_contractor_invoices(interpreter_id, period_start, period_end);
CREATE INDEX idx_interpreter_contractor_invoices_status
    ON interpreter_contractor_invoices(status);

CREATE TABLE interpreter_contractor_invoice_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_invoice_id UUID NOT NULL REFERENCES interpreter_contractor_invoices(id) ON DELETE CASCADE,
    payable_id          UUID NOT NULL REFERENCES interpreter_payables(id) ON DELETE RESTRICT,
    description         TEXT NOT NULL,
    amount              NUMERIC(12,2) NOT NULL,
    currency            CHAR(3) NOT NULL DEFAULT 'USD',
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(payable_id)
);

CREATE INDEX idx_interpreter_contractor_invoice_items_invoice
    ON interpreter_contractor_invoice_items(contractor_invoice_id);
