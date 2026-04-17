-- 001: Create enum types for billing subsystem

CREATE TYPE call_type_enum AS ENUM ('vrs', 'vri');
CREATE TYPE billing_status_enum AS ENUM ('pending', 'submitted', 'paid', 'disputed', 'write_off');
CREATE TYPE invoice_status_enum AS ENUM ('draft', 'issued', 'paid', 'overdue', 'cancelled');
CREATE TYPE reconciliation_status_enum AS ENUM ('matched', 'unmatched', 'disputed');
