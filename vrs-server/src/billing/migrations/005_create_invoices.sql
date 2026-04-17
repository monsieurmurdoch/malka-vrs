-- 005: Invoices for VRI corporate billing

CREATE TABLE invoices (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    corporate_account_id     UUID NOT NULL REFERENCES corporate_accounts(id),
    invoice_number           TEXT NOT NULL UNIQUE,
    billing_period_start     DATE NOT NULL,
    billing_period_end       DATE NOT NULL,
    subtotal                 NUMERIC(12,2) NOT NULL,
    tax                      NUMERIC(12,2) NOT NULL DEFAULT 0,
    total                    NUMERIC(12,2) NOT NULL,
    status                   invoice_status_enum NOT NULL DEFAULT 'draft',
    stripe_invoice_id        TEXT,
    stripe_payment_intent_id TEXT,
    issued_at                TIMESTAMPTZ,
    due_date                 DATE,
    paid_at                  TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by               TEXT,

    CONSTRAINT invoice_total_positive CHECK (total > 0)
);

CREATE INDEX idx_invoices_corporate ON invoices(corporate_account_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_period ON invoices(billing_period_start, billing_period_end);
