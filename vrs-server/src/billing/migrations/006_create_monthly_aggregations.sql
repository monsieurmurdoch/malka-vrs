-- 006: Monthly billing aggregations (VRS TRS submissions + VRI summaries)

CREATE TABLE monthly_billing_aggregations (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_type            call_type_enum NOT NULL,
    period_year          INTEGER NOT NULL,
    period_month         INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    total_calls          INTEGER NOT NULL DEFAULT 0,
    total_minutes        NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_charge         NUMERIC(14,2) NOT NULL DEFAULT 0,
    avg_duration_seconds NUMERIC(10,2),
    trs_submission_id    TEXT,
    trs_submitted_at     TIMESTAMPTZ,
    generated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generated_by         TEXT,

    UNIQUE(call_type, period_year, period_month)
);
