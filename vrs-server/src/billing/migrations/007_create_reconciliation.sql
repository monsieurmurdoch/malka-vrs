-- 007: Reconciliation records (match submissions/invoices to payments)

CREATE TABLE billing_reconciliation (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_date  DATE NOT NULL,
    call_type            call_type_enum NOT NULL,
    expected_total       NUMERIC(14,2) NOT NULL,
    actual_total         NUMERIC(14,2),
    variance             NUMERIC(14,2),
    variance_reason      TEXT,
    status               reconciliation_status_enum NOT NULL DEFAULT 'unmatched',
    resolved_at          TIMESTAMPTZ,
    resolved_by          TEXT,
    notes                TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(reconciliation_date, call_type)
);
