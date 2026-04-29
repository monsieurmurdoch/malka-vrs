# Tenant Isolation Decision

Decision date: 2026-04-29

## Decision

Use shared PostgreSQL tables with tenant-scoped identities, tenant-aware auth,
and a path to PostgreSQL row-level security (RLS). Do not split Maple and Malka
into schema-per-tenant yet.

## Why This Path

- Malka and Maple currently share one operational stack and one queue/media
  runtime.
- Most product separation is by tenant, service mode, interpreter pool, and
  branding rather than by radically different schemas.
- RLS gives a stronger database boundary than application filters alone while
  keeping migrations, billing, queue matching, and admin reporting manageable.
- Schema-per-tenant remains an option later if whitelabel growth creates
  contractual or regulatory isolation requirements that outweigh operational
  complexity.

## Current Boundary

- Tenant identity is carried by `tenant_id` on client, interpreter, and ops
  account records.
- Client and interpreter emails are unique per tenant, not globally unique.
- Auth login resolves users by the request tenant/host.
- JWTs include `tenantId` and can be signed by tenant-specific keys.
- Tenant configs declare service defaults, billing defaults, interpreter pool
  IDs, domains, and web/mobile asset slots.

## Next RLS Implementation Steps

- Add `tenant_id` columns to all tenant-owned data that do not yet have one,
  including captioners, calls, queue requests, contacts, voicemail metadata,
  billing entities, and audit rows.
- Backfill existing rows from related client/interpreter/account records.
- Create database roles for app runtime and migration/admin operations.
- Enable RLS on tenant-owned tables with policies using
  `current_setting('app.tenant_id', true)`.
- Ensure every request transaction sets `app.tenant_id` before data access.
- Keep superadmin/reporting paths on a separate privileged role or explicit
  cross-tenant policy.
- Add integration tests that prove Maple tokens cannot read or mutate Malka
  tenant data and vice versa.

## Do Not Do Yet

- Do not duplicate the full app schema per tenant.
- Do not route Maple and Malka to separate databases until backup, migration,
  billing, and queue/reporting consequences are reviewed.
- Do not treat tenant branding separation as sufficient data isolation.
