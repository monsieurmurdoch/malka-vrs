-- 002: CDR table + status transitions + immutability triggers

CREATE TABLE billing_cdrs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id             TEXT NOT NULL,
    call_type           call_type_enum NOT NULL,
    caller_id           TEXT,
    interpreter_id      TEXT,
    start_time          TIMESTAMPTZ NOT NULL,
    end_time            TIMESTAMPTZ NOT NULL,
    duration_seconds    INTEGER NOT NULL CHECK (duration_seconds >= 0),
    caller_number       VARCHAR(20),
    callee_number       VARCHAR(20),
    language            VARCHAR(20),
    rate_tier_id        UUID,
    per_minute_rate     NUMERIC(10,4) NOT NULL,
    total_charge        NUMERIC(12,2) NOT NULL,
    billing_status      billing_status_enum NOT NULL DEFAULT 'pending',
    trs_submission_id   TEXT,
    corporate_account_id UUID,
    invoice_id          UUID,
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          TEXT,

    CONSTRAINT cdr_end_after_start CHECK (end_time >= start_time)
);

CREATE INDEX idx_cdrs_call_type ON billing_cdrs(call_type);
CREATE INDEX idx_cdrs_billing_status ON billing_cdrs(billing_status);
CREATE INDEX idx_cdrs_start_time ON billing_cdrs(start_time);
CREATE INDEX idx_cdrs_call_id ON billing_cdrs(call_id);
CREATE INDEX idx_cdrs_corporate_account ON billing_cdrs(corporate_account_id);
CREATE INDEX idx_cdrs_invoice ON billing_cdrs(invoice_id);
CREATE INDEX idx_cdrs_trs_submission ON billing_cdrs(trs_submission_id);

-- Immutability triggers: prevent UPDATE and DELETE
CREATE OR REPLACE FUNCTION enforce_cdr_immutability()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'billing_cdrs are append-only: % operations are not permitted', TG_OP;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cdr_no_update
    BEFORE UPDATE ON billing_cdrs
    FOR EACH ROW EXECUTE FUNCTION enforce_cdr_immutability();

CREATE TRIGGER trg_cdr_no_delete
    BEFORE DELETE ON billing_cdrs
    FOR EACH ROW EXECUTE FUNCTION enforce_cdr_immutability();

-- Status transitions table (audit trail for CDR status changes)
CREATE TABLE billing_cdr_status_transitions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cdr_id          UUID NOT NULL REFERENCES billing_cdrs(id),
    from_status     billing_status_enum NOT NULL,
    to_status       billing_status_enum NOT NULL,
    transitioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    transitioned_by TEXT,
    reason          TEXT,
    CONSTRAINT valid_status_transition CHECK (
        (from_status, to_status) IN (
            ('pending', 'submitted'),
            ('submitted', 'paid'),
            ('submitted', 'disputed'),
            ('disputed', 'submitted'),
            ('pending', 'write_off')
        )
    )
);

CREATE INDEX idx_status_trans_cdr ON billing_cdr_status_transitions(cdr_id);
