-- 003: Rate tiers (FCC-mandated for VRS, contracted for VRI)

CREATE TABLE billing_rate_tiers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_type       call_type_enum NOT NULL,
    label           TEXT NOT NULL,
    per_minute_rate NUMERIC(10,4) NOT NULL,
    effective_from  DATE NOT NULL,
    effective_to    DATE,
    fcc_order_ref   TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      TEXT,

    CONSTRAINT rate_positive CHECK (per_minute_rate > 0),
    CONSTRAINT date_range_valid CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX idx_rate_tiers_type_active ON billing_rate_tiers(call_type, is_active);
CREATE INDEX idx_rate_tiers_dates ON billing_rate_tiers(effective_from, effective_to);

-- Seed default VRS and VRI rate tiers
INSERT INTO billing_rate_tiers (id, call_type, label, per_minute_rate, effective_from, is_active)
VALUES
    (gen_random_uuid(), 'vrs', 'FY2025 VRS Standard Rate', 3.50, '2025-01-01', true),
    (gen_random_uuid(), 'vri', 'VRI Standard Rate', 4.95, '2025-01-01', true);
