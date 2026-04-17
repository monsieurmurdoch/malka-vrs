-- 008: Billing audit log (full chain of custody for FCC audit readiness)

CREATE TABLE billing_audit_log (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action       TEXT NOT NULL,
    entity_type  TEXT NOT NULL,
    entity_id    UUID,
    performed_by TEXT,
    details      JSONB DEFAULT '{}',
    ip_address   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON billing_audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_action ON billing_audit_log(action);
CREATE INDEX idx_audit_date ON billing_audit_log(created_at);
