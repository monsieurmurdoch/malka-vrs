-- 004: Corporate accounts for VRI billing

CREATE TABLE corporate_accounts (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_name    TEXT NOT NULL,
    billing_contact_name TEXT NOT NULL,
    billing_contact_email TEXT NOT NULL,
    billing_contact_phone VARCHAR(20),
    stripe_customer_id   TEXT,
    payment_method       VARCHAR(20) DEFAULT 'invoice',
    contract_type        VARCHAR(20) NOT NULL DEFAULT 'monthly',
    contracted_rate_tier_id UUID REFERENCES billing_rate_tiers(id),
    billing_day          INTEGER DEFAULT 1 CHECK (billing_day BETWEEN 1 AND 28),
    address_line1        TEXT,
    address_line2        TEXT,
    city                 TEXT,
    state                TEXT,
    zip                  TEXT,
    country              TEXT DEFAULT 'US',
    notes                TEXT,
    is_active            BOOLEAN NOT NULL DEFAULT true,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by           TEXT
);

CREATE INDEX idx_corporate_active ON corporate_accounts(is_active);
CREATE INDEX idx_corporate_stripe ON corporate_accounts(stripe_customer_id);
