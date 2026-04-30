-- 010: VRI rate overrides/templates plus first backend automation hooks

ALTER TABLE corporate_accounts
    ADD COLUMN IF NOT EXISTS tenant_id TEXT;

CREATE INDEX IF NOT EXISTS idx_corporate_tenant ON corporate_accounts(tenant_id);

ALTER TABLE billing_cdr_status_transitions
    DROP CONSTRAINT IF EXISTS valid_status_transition;

ALTER TABLE billing_cdr_status_transitions
    ADD CONSTRAINT valid_status_transition CHECK (
        (from_status, to_status) IN (
            ('pending', 'submitted'),
            ('pending', 'paid'),
            ('pending', 'disputed'),
            ('submitted', 'paid'),
            ('submitted', 'disputed'),
            ('disputed', 'submitted'),
            ('disputed', 'paid'),
            ('pending', 'write_off'),
            ('submitted', 'write_off'),
            ('disputed', 'write_off')
        )
    );

CREATE TABLE vri_rate_overrides (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    corporate_account_id UUID REFERENCES corporate_accounts(id) ON DELETE CASCADE,
    tenant_id           TEXT,
    service_mode        TEXT NOT NULL DEFAULT 'vri',
    language_pair       TEXT,
    currency            CHAR(3) NOT NULL DEFAULT 'USD',
    label               TEXT NOT NULL,
    per_minute_rate     NUMERIC(10,4) NOT NULL,
    effective_from      DATE NOT NULL,
    effective_to        DATE,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          TEXT,

    CONSTRAINT vri_rate_override_positive CHECK (per_minute_rate > 0),
    CONSTRAINT vri_rate_override_dates CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX idx_vri_rate_overrides_lookup
    ON vri_rate_overrides(service_mode, currency, is_active, effective_from, effective_to);
CREATE INDEX idx_vri_rate_overrides_corporate ON vri_rate_overrides(corporate_account_id);
CREATE INDEX idx_vri_rate_overrides_tenant ON vri_rate_overrides(tenant_id);

CREATE TABLE billing_rate_templates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_mode        TEXT NOT NULL,
    language_pair       TEXT NOT NULL,
    currency            CHAR(3) NOT NULL DEFAULT 'USD',
    label               TEXT NOT NULL,
    default_rate        NUMERIC(10,4),
    status              TEXT NOT NULL DEFAULT 'template',
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          TEXT,

    UNIQUE(service_mode, language_pair, currency)
);

-- Retire the old generic VRI default and seed the current pilot pricing.
UPDATE billing_rate_tiers
SET is_active = false
WHERE call_type = 'vri'
  AND label = 'VRI Standard Rate'
  AND per_minute_rate = 4.95
  AND is_active = true;

INSERT INTO billing_rate_tiers (call_type, label, per_minute_rate, effective_from, is_active)
SELECT 'vri', 'VRI ASL-English Standard Rate (USD)', 1.00, '2026-04-30', true
WHERE NOT EXISTS (
    SELECT 1 FROM billing_rate_tiers
    WHERE call_type = 'vri'
      AND label = 'VRI ASL-English Standard Rate (USD)'
);

INSERT INTO vri_rate_overrides (
    service_mode, language_pair, currency, label, per_minute_rate, effective_from, metadata
)
SELECT 'vri', 'ASL-EN', 'USD', 'Default ASL to English VRI minute', 1.00, '2026-04-30',
       '{"source":"roadmap","scope":"global"}'::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM vri_rate_overrides
    WHERE service_mode = 'vri' AND language_pair = 'ASL-EN' AND currency = 'USD'
      AND corporate_account_id IS NULL AND tenant_id IS NULL
);

INSERT INTO vri_rate_overrides (
    service_mode, language_pair, currency, label, per_minute_rate, effective_from, metadata
)
SELECT 'vri', 'ASL-EN', 'CAD', 'Default ASL to English VRI minute', 1.25, '2026-04-30',
       '{"source":"roadmap","scope":"global"}'::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM vri_rate_overrides
    WHERE service_mode = 'vri' AND language_pair = 'ASL-EN' AND currency = 'CAD'
      AND corporate_account_id IS NULL AND tenant_id IS NULL
);

INSERT INTO billing_rate_templates (service_mode, language_pair, currency, label, default_rate, status)
VALUES
    ('vri', 'ASL-EN', 'USD', 'ASL to English VRI', 1.00, 'active'),
    ('vri', 'ASL-EN', 'CAD', 'ASL to English VRI', 1.25, 'active'),
    ('captioning', 'EN', 'USD', 'English captioning', NULL, 'template'),
    ('captioning', 'EN', 'CAD', 'English captioning', NULL, 'template')
ON CONFLICT (service_mode, language_pair, currency) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS idx_interpreter_payables_unique_cdr
    ON interpreter_payables(cdr_id, source_type)
    WHERE cdr_id IS NOT NULL;
