-- 009: Billing operations, interpreter payouts, scheduling, utilization, and manager notes

CREATE TABLE billing_invoice_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    cdr_id          UUID REFERENCES billing_cdrs(id),
    description     TEXT NOT NULL,
    quantity        NUMERIC(12,2) NOT NULL DEFAULT 1,
    unit_amount     NUMERIC(12,2) NOT NULL,
    total           NUMERIC(12,2) NOT NULL,
    currency        CHAR(3) NOT NULL DEFAULT 'USD',
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_billing_invoice_items_invoice ON billing_invoice_items(invoice_id);
CREATE INDEX idx_billing_invoice_items_cdr ON billing_invoice_items(cdr_id);
CREATE UNIQUE INDEX idx_billing_invoice_items_unique_cdr ON billing_invoice_items(cdr_id) WHERE cdr_id IS NOT NULL;

CREATE TABLE billing_payments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id          UUID REFERENCES invoices(id) ON DELETE SET NULL,
    provider            TEXT NOT NULL DEFAULT 'stripe',
    provider_payment_id TEXT,
    amount              NUMERIC(12,2) NOT NULL,
    currency            CHAR(3) NOT NULL DEFAULT 'USD',
    status              TEXT NOT NULL,
    received_at         TIMESTAMPTZ,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_billing_payments_invoice ON billing_payments(invoice_id);
CREATE INDEX idx_billing_payments_provider_payment ON billing_payments(provider, provider_payment_id);
CREATE INDEX idx_billing_payments_status ON billing_payments(status);

CREATE TABLE billing_adjustments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id      UUID REFERENCES invoices(id) ON DELETE SET NULL,
    cdr_id          UUID REFERENCES billing_cdrs(id) ON DELETE SET NULL,
    amount          NUMERIC(12,2) NOT NULL,
    currency        CHAR(3) NOT NULL DEFAULT 'USD',
    reason          TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft',
    created_by      TEXT,
    approved_by     TEXT,
    approved_at     TIMESTAMPTZ,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_billing_adjustments_invoice ON billing_adjustments(invoice_id);
CREATE INDEX idx_billing_adjustments_cdr ON billing_adjustments(cdr_id);
CREATE INDEX idx_billing_adjustments_status ON billing_adjustments(status);

CREATE TABLE stripe_webhook_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_event_id     TEXT NOT NULL UNIQUE,
    event_type          TEXT NOT NULL,
    livemode            BOOLEAN NOT NULL DEFAULT false,
    payload             JSONB NOT NULL,
    processing_status   TEXT NOT NULL DEFAULT 'received',
    processing_error    TEXT,
    received_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at        TIMESTAMPTZ
);

CREATE INDEX idx_stripe_webhook_events_type ON stripe_webhook_events(event_type);
CREATE INDEX idx_stripe_webhook_events_status ON stripe_webhook_events(processing_status);

CREATE TABLE interpreter_vendor_profiles (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interpreter_id          TEXT NOT NULL UNIQUE,
    tenant_id               TEXT,
    employment_type         TEXT NOT NULL DEFAULT 'contractor',
    legal_name              TEXT,
    company_name            TEXT,
    tax_identifier_last4    TEXT,
    payout_method           TEXT NOT NULL DEFAULT 'manual',
    stripe_account_id       TEXT,
    currency                CHAR(3) NOT NULL DEFAULT 'USD',
    metadata                JSONB NOT NULL DEFAULT '{}',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_interpreter_vendor_profiles_tenant ON interpreter_vendor_profiles(tenant_id);
CREATE INDEX idx_interpreter_vendor_profiles_stripe ON interpreter_vendor_profiles(stripe_account_id);

CREATE TABLE interpreter_pay_rates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interpreter_id      TEXT NOT NULL,
    tenant_id           TEXT,
    service_mode        TEXT NOT NULL DEFAULT 'vri',
    language_pair       TEXT NOT NULL DEFAULT 'ASL-EN',
    rate_type           TEXT NOT NULL DEFAULT 'hourly',
    rate_amount         NUMERIC(12,2) NOT NULL,
    currency            CHAR(3) NOT NULL DEFAULT 'USD',
    minimum_minutes     INTEGER NOT NULL DEFAULT 0,
    effective_from      DATE NOT NULL,
    effective_to        DATE,
    created_by          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_interpreter_pay_rates_lookup ON interpreter_pay_rates(interpreter_id, service_mode, language_pair, effective_from);
CREATE INDEX idx_interpreter_pay_rates_tenant ON interpreter_pay_rates(tenant_id);

CREATE TABLE interpreter_payables (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interpreter_id      TEXT NOT NULL,
    tenant_id           TEXT,
    call_id             TEXT,
    cdr_id              UUID REFERENCES billing_cdrs(id) ON DELETE SET NULL,
    source_type         TEXT NOT NULL,
    service_mode        TEXT NOT NULL DEFAULT 'vri',
    language_pair       TEXT,
    payable_minutes     NUMERIC(12,2) NOT NULL DEFAULT 0,
    rate_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
    currency            CHAR(3) NOT NULL DEFAULT 'USD',
    status              TEXT NOT NULL DEFAULT 'draft',
    period_start        DATE,
    period_end          DATE,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at         TIMESTAMPTZ,
    approved_by         TEXT
);

CREATE INDEX idx_interpreter_payables_interpreter ON interpreter_payables(interpreter_id);
CREATE INDEX idx_interpreter_payables_status ON interpreter_payables(status);
CREATE INDEX idx_interpreter_payables_period ON interpreter_payables(period_start, period_end);

CREATE TABLE interpreter_payout_batches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       TEXT,
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft',
    currency        CHAR(3) NOT NULL DEFAULT 'USD',
    total_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_by      TEXT,
    approved_by     TEXT,
    approved_at     TIMESTAMPTZ,
    paid_at         TIMESTAMPTZ,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_interpreter_payout_batches_period ON interpreter_payout_batches(period_start, period_end);
CREATE INDEX idx_interpreter_payout_batches_status ON interpreter_payout_batches(status);

CREATE TABLE interpreter_payout_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_batch_id UUID NOT NULL REFERENCES interpreter_payout_batches(id) ON DELETE CASCADE,
    payable_id      UUID NOT NULL REFERENCES interpreter_payables(id) ON DELETE RESTRICT,
    interpreter_id  TEXT NOT NULL,
    amount          NUMERIC(12,2) NOT NULL,
    currency        CHAR(3) NOT NULL DEFAULT 'USD',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(payable_id)
);

CREATE INDEX idx_interpreter_payout_items_batch ON interpreter_payout_items(payout_batch_id);
CREATE INDEX idx_interpreter_payout_items_interpreter ON interpreter_payout_items(interpreter_id);

CREATE TABLE interpreter_payout_adjustments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_batch_id UUID REFERENCES interpreter_payout_batches(id) ON DELETE SET NULL,
    interpreter_id  TEXT NOT NULL,
    amount          NUMERIC(12,2) NOT NULL,
    currency        CHAR(3) NOT NULL DEFAULT 'USD',
    reason          TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft',
    created_by      TEXT,
    approved_by     TEXT,
    approved_at     TIMESTAMPTZ,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_interpreter_payout_adjustments_interpreter ON interpreter_payout_adjustments(interpreter_id);

CREATE TABLE interpreter_schedule_windows (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interpreter_id  TEXT NOT NULL,
    tenant_id       TEXT,
    service_mode    TEXT NOT NULL DEFAULT 'vri',
    language_pair   TEXT,
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    status          TEXT NOT NULL DEFAULT 'scheduled',
    source          TEXT NOT NULL DEFAULT 'interpreter',
    created_by      TEXT,
    notes           TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT schedule_window_end_after_start CHECK (ends_at > starts_at)
);

CREATE INDEX idx_interpreter_schedule_windows_interpreter ON interpreter_schedule_windows(interpreter_id, starts_at);
CREATE INDEX idx_interpreter_schedule_windows_tenant ON interpreter_schedule_windows(tenant_id, starts_at);

CREATE TABLE interpreter_availability_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interpreter_id  TEXT NOT NULL,
    tenant_id       TEXT,
    service_mode    TEXT,
    language_pair   TEXT,
    status          TEXT NOT NULL,
    source          TEXT NOT NULL DEFAULT 'system',
    reason          TEXT,
    started_at      TIMESTAMPTZ NOT NULL,
    ended_at        TIMESTAMPTZ,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT availability_end_after_start CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX idx_interpreter_availability_sessions_interpreter ON interpreter_availability_sessions(interpreter_id, started_at);
CREATE INDEX idx_interpreter_availability_sessions_tenant ON interpreter_availability_sessions(tenant_id, started_at);
CREATE INDEX idx_interpreter_availability_sessions_status ON interpreter_availability_sessions(status);

CREATE TABLE interpreter_break_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interpreter_id  TEXT NOT NULL,
    tenant_id       TEXT,
    break_type      TEXT NOT NULL DEFAULT 'paid',
    reason          TEXT,
    started_at      TIMESTAMPTZ NOT NULL,
    ended_at        TIMESTAMPTZ,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT break_end_after_start CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX idx_interpreter_break_sessions_interpreter ON interpreter_break_sessions(interpreter_id, started_at);
CREATE INDEX idx_interpreter_break_sessions_tenant ON interpreter_break_sessions(tenant_id, started_at);

CREATE TABLE interpreter_shift_targets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interpreter_id      TEXT NOT NULL,
    tenant_id           TEXT,
    week_start          DATE NOT NULL,
    target_minutes      INTEGER NOT NULL DEFAULT 0,
    minimum_minutes     INTEGER NOT NULL DEFAULT 0,
    created_by          TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(interpreter_id, tenant_id, week_start)
);

CREATE INDEX idx_interpreter_shift_targets_week ON interpreter_shift_targets(week_start);

CREATE TABLE interpreter_shift_exceptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interpreter_id  TEXT NOT NULL,
    tenant_id       TEXT,
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    exception_type  TEXT NOT NULL,
    reason          TEXT,
    status          TEXT NOT NULL DEFAULT 'approved',
    created_by      TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT shift_exception_end_after_start CHECK (ends_at > starts_at)
);

CREATE INDEX idx_interpreter_shift_exceptions_interpreter ON interpreter_shift_exceptions(interpreter_id, starts_at);

CREATE TABLE interpreter_utilization_summaries (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interpreter_id          TEXT NOT NULL,
    tenant_id               TEXT,
    week_start              DATE NOT NULL,
    scheduled_minutes       INTEGER NOT NULL DEFAULT 0,
    signed_on_minutes       INTEGER NOT NULL DEFAULT 0,
    available_minutes       INTEGER NOT NULL DEFAULT 0,
    in_call_minutes         INTEGER NOT NULL DEFAULT 0,
    break_minutes           INTEGER NOT NULL DEFAULT 0,
    idle_minutes            INTEGER NOT NULL DEFAULT 0,
    accepted_requests       INTEGER NOT NULL DEFAULT 0,
    declined_requests       INTEGER NOT NULL DEFAULT 0,
    no_answer_requests      INTEGER NOT NULL DEFAULT 0,
    utilization_rate        NUMERIC(7,4) NOT NULL DEFAULT 0,
    metadata                JSONB NOT NULL DEFAULT '{}',
    generated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(interpreter_id, tenant_id, week_start)
);

CREATE INDEX idx_interpreter_utilization_summaries_week ON interpreter_utilization_summaries(week_start);
CREATE INDEX idx_interpreter_utilization_summaries_tenant ON interpreter_utilization_summaries(tenant_id, week_start);

CREATE TABLE manager_notes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type     TEXT NOT NULL,
    entity_id       TEXT NOT NULL,
    tenant_id       TEXT,
    note_type       TEXT NOT NULL DEFAULT 'general',
    visibility      TEXT NOT NULL DEFAULT 'admin',
    body            TEXT NOT NULL,
    follow_up_at    TIMESTAMPTZ,
    created_by      TEXT,
    updated_by      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata        JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_manager_notes_entity ON manager_notes(entity_type, entity_id);
CREATE INDEX idx_manager_notes_tenant ON manager_notes(tenant_id);
CREATE INDEX idx_manager_notes_follow_up ON manager_notes(follow_up_at);

ALTER TABLE corporate_accounts
    ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'USD',
    ADD COLUMN IF NOT EXISTS tax_id TEXT,
    ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
    ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'USD',
    ADD COLUMN IF NOT EXISTS stripe_hosted_invoice_url TEXT,
    ADD COLUMN IF NOT EXISTS stripe_invoice_pdf_url TEXT;
