# Malka VRS — Product & Engineering Roadmap

## Phase 0: Foundation (Current Sprint)
> Status: **In Progress**

- [x] Webpack dev server serving VRS welcome page locally
- [x] Backend services running (VRS :3001, Ops :3003)
- [x] Demo accounts seeded (2 clients, 2 interpreters)
- [x] Earth/Moon celestial visuals (components created, NASA imagery)
- [x] Fix react-native-ble-plx web build error (platform-split BleAdapter)
- [ ] **SCSS build pipeline** — compile `_welcome_page.scss` → `css/all.css` so celestial animations render
- [ ] **Clean up** broken `images/earth-realistic.png` (2KB HTML, not an image)
- [ ] Verify demo account login flow end-to-end (client + interpreter)
- [ ] Test interpreter queue states: in-queue, out-queue, on-break, teamed

---

## Phase 0.5: Production Deployment (DigitalOcean)
> Goal: Get the app live on a real URL for testing
> Status: **Ready to deploy**

### Infrastructure
- [x] `docker-compose.prod.yml` — full production stack (nginx + Jitsi + VRS + Ops)
- [x] `Dockerfile.frontend` — multi-stage build (webpack frontend → vrs-server container)
- [x] `deploy/nginx.conf` — reverse proxy with SSL, WebSocket, BOSH routing
- [x] `deploy/setup.sh` — one-command droplet provisioning (Docker, firewall, certbot)
- [ ] Provision DigitalOcean Droplet (4GB RAM / 2 vCPU minimum)
- [ ] Point domain A record to droplet IP
- [ ] Fill `.env` with production secrets (JWT, superadmin password, Jitsi secrets)
- [ ] Run `deploy/setup.sh` — installs Docker, gets SSL cert, launches stack
- [ ] Verify: `https://your-domain.com` loads VRS welcome page
- [ ] Verify: WebSocket connections work through nginx
- [ ] Verify: JVB media flows (UDP 10000) — test a real video call

### Post-Deploy Checklist
- [ ] Rotate `VRS_BOOTSTRAP_SUPERADMIN_PASSWORD` after first login
- [ ] Set up automated backups for Docker volumes (vrs-data, ops-data)
- [ ] Configure DigitalOcean monitoring alerts (CPU, memory, disk)
- [ ] Test SSL auto-renewal (certbot cron in container)

---

## Phase 1: Core VRS Call Flow
> Goal: Two deaf users can call each other through an interpreter

### 1A — Authentication & Phone Number Sign-In
- [ ] Email + password login (already wired)
- [ ] Phone number as alternate login identifier
- [ ] SMS/OTP verification via Twilio (or similar)
- [ ] JWT-based session management across all three servers
- [ ] Password reset flow

### 1B — Interpreter Queue System
- [ ] WebSocket-based queue with real-time state (available / on-break / in-call / teamed)
- [ ] Admin controls: force-break, force-available, team interpreters
- [ ] Queue priority logic (longest-waiting caller first)
- [ ] Interpreter skills-based routing (language pairs)
- [ ] Queue dashboard for ops team

### 1C — VRS Call Lifecycle
- [ ] Client dials 10-digit number → request enters interpreter queue
- [ ] Interpreter matched → 3-way Jitsi room created (caller video, interpreter video, callee audio)
- [ ] In-call controls: mute, hold, transfer, add party
- [ ] Call end → CDR (Call Detail Record) written to database
- [ ] Multi-party conference support (Jitsi-native)
- [ ] P2P direct calls between clients (no interpreter, standard Jitsi flow)

### 1D — UI Polish
- [ ] Navy/white color scheme with VRS branding
- [ ] Celestial animations (earth = client, moon = interpreter) with smooth tab transitions
- [ ] Responsive layout for desktop + tablet
- [ ] Accessibility audit (WCAG 2.1 AA minimum — critical for deaf users)

---

## Phase 2: Engineering Hardening
> Goal: Production-grade code quality, security, and observability

### 2A — PostgreSQL Migration
- [ ] Abstract current `database.js` (SQLite) behind clean adapter interface
- [ ] Build PostgreSQL adapter implementing same interface
- [ ] Schema migration tooling (`node-pg-migrate`)
- [ ] Run SQLite + PostgreSQL in parallel, verify data parity
- [ ] Cut over to PostgreSQL
- [ ] Add `pg_audit` extension for FCC-compliant audit logging
- [ ] Configure WAL archiving for point-in-time recovery
- [ ] Set up PgBouncer connection pooling (multi-server architecture)
- [ ] Migrate ops-server from JSON file storage to PostgreSQL

### 2B — TypeScript Migration (vrs-server)
- [ ] Migrate `vrs-server/server.js` → TypeScript (largest risk surface)
- [ ] Migrate `vrs-server/database.js` → TypeScript with typed query results
- [ ] Migrate `vrs-server/lib/*.js` (queue-service, handoff-service, activity-logger)
- [ ] Unify build tooling: single `tsconfig` base shared by vrs-server and ops-server
- [ ] Enable strict mode (`strict: true` in tsconfig) for new files

### 2C — Input Validation Layer
- [ ] Add Zod (or Joi) as validation library across all API endpoints
- [ ] Define request schemas for every POST/PUT/PATCH endpoint
- [ ] Validate all WebSocket message payloads
- [ ] Sanitize user inputs (prevent XSS in stored fields like names, orgs)
- [ ] Return consistent error response format: `{ error: string, code: string, details?: object }`

### 2D — Error Handling & Security
- [ ] Centralized Express error handler (no stack traces in production responses)
- [ ] WebSocket error boundaries (unhandled exceptions must not crash the process)
- [ ] Consistent error response shape across all endpoints
- [ ] Ensure `.env` is in `.gitignore` (verify no secrets in repo history)
- [ ] Add `helmet` CSP headers tuned for Jitsi WebRTC requirements
- [ ] Rate limiting on all auth endpoints (already partially done)
- [ ] Audit npm dependencies for known vulnerabilities (`npm audit`)

### 2E — Structured Logging & Monitoring
- [ ] Replace `console.log` with structured logger (Pino or Winston)
- [ ] Log levels: error, warn, info, debug — configurable via `LOG_LEVEL` env var
- [ ] Structured JSON output in production (parseable by log aggregators)
- [ ] Add health check endpoints: `GET /api/health` (VRS), `GET /health` (Ops)
- [ ] Request ID tracking (correlation ID across services)
- [ ] Log call lifecycle events for debugging (call start, interpreter match, call end)
- [ ] DigitalOcean monitoring integration or external APM (Datadog, New Relic)

### 2F — Testing
- [ ] Set up test framework (Jest for both servers)
- [ ] Unit tests: queue logic (priority, matching, state transitions)
- [ ] Unit tests: authentication (JWT generation, validation, expiry)
- [ ] Unit tests: billing CDR creation and immutability
- [ ] Integration tests: API endpoint contracts (request → response)
- [ ] Integration tests: WebSocket event sequences (connect → queue → match → call)
- [ ] E2E tests: full call flow (signup → login → dial → interpreter match → call → hangup)
- [ ] CI pipeline: run tests on every PR (extend existing `.github/workflows/ci.yml`)

---

## Phase 3: FCC Compliance & Provider Certification
> Goal: Become a certified FCC VRS provider, assign real phone numbers

### 3A — FCC Provider Certification (Regulatory — runs in parallel)
- [ ] File application with FCC Consumer & Governmental Affairs Bureau
- [ ] Demonstrate technical capability (911 access, 10-digit numbering, interoperability)
- [ ] Demonstrate financial/operational capability
- [ ] Pass FCC compliance audit
- [ ] **Timeline: 6-12 months from filing**

### 3B — Phone Number Provisioning
- [ ] Obtain NANP number blocks via RespOrg partnership
- [ ] Integrate with **iTRS database** (number registration, user validation, cross-provider routing)
- [ ] Build number assignment flow: user signs up → verified → number assigned → iTRS registered
- [ ] Support number porting (users bringing existing numbers)
- [ ] 911/E911 integration (mandatory for VRS providers)

### 3C — User Eligibility & Verification
- [ ] Self-certification flow: user attests hearing/speech disability (per FCC Order 11-155)
- [ ] Identity verification: government-issued photo ID upload + verification
- [ ] iTRS database cross-reference (one person = one number, prevent fraud)
- [ ] Annual re-certification system with automated reminders
- [ ] **No audiogram required** — FCC explicitly accepts self-certification
- [ ] Audit trail for all verification events (immutable log)

### 3D — 911 Emergency Services
- [ ] E911 location registration for each VRS user
- [ ] Automatic 911 routing through PSAP
- [ ] 911 call priority in interpreter queue (immediate assignment)
- [ ] Compliance with FCC 911 rules for VRS (47 CFR 64.605)

---

## Phase 4: Billing Infrastructure
> Goal: Compliant billing for TRS Fund (VRS) and corporate clients (VRI)

### 4A — VRS Billing (TRS Fund)
- [ ] Call Detail Record (CDR) schema:
  - `call_id`, `call_type` (vrs/vri), `caller_id`, `interpreter_id`
  - `start_time`, `end_time`, `duration_seconds`
  - `caller_number`, `callee_number` (10-digit NANP)
  - `billing_status` (pending → submitted → paid/disputed)
  - `trs_submission_id`
- [ ] CDR immutability (append-only, no updates after call ends)
- [ ] Monthly CDR aggregation pipeline
- [ ] TRS Fund submission formatting (per Fund administrator specs)
- [ ] Reconciliation system (match submissions to payments)
- [ ] Per-minute rate tiers (FCC sets rates annually, currently ~$2.50-$5.00/min)

### 4B — VRI Billing (Corporate Clients)
- [ ] Corporate account management (org, billing contact, payment method)
- [ ] VRI CDRs tagged at call origination (separate from VRS)
- [ ] Invoice generation (monthly/per-call, configurable per contract)
- [ ] Stripe integration for payment processing
- [ ] Corporate billing dashboard (usage, invoices, payments)
- [ ] **Strict VRS/VRI separation**: enforced at call creation, routing, and billing layers
  - Different app origin = different `call_type` tag
  - Two completely independent billing pipelines
  - Audit trail ensuring no cross-contamination

### 4C — Billing Safeguards
- [ ] Call type (`vrs` vs `vri`) set immutably at call creation — cannot be changed
- [ ] Separate billing pipeline processes (VRS → TRS Fund, VRI → corporate invoice)
- [ ] Automated reconciliation checks (flag anomalies)
- [ ] Monthly billing audit report for internal review
- [ ] FCC audit readiness: all records exportable with full chain of custody

---

## Phase 5: White-Label & Multi-Tenant Architecture
> Goal: Deploy branded instances for other providers (e.g., Canadian company)

### 5A — White-Label System
- [ ] `whitelabel.json` configuration (brand name, colors, logos, feature flags)
- [ ] CSS custom properties for theme switching at build time
- [ ] Splash screens, app icons, and marketing assets per tenant
- [ ] Feature flags: enable/disable VRS, VRI, specific languages per tenant
- [ ] Build pipeline: one codebase → multiple branded outputs

### 5B — Multi-Tenant Backend
- [ ] Tenant isolation in database (schema-per-tenant or row-level with tenant_id)
- [ ] Tenant-specific configuration (languages, interpreter pools, billing)
- [ ] Separate JWT signing keys per tenant
- [ ] Admin super-dashboard for managing all tenants

---

## Phase 6: Mobile Apps
> Goal: Native mobile experience for all user types

### US Market (3 Apps)
| App | Users | Key Features |
|-----|-------|-------------|
| **Malka VRS** | Deaf/HoH users | Video calling, 10-digit number, contacts, call history |
| **Malka Interpreter** | ASL interpreters | Queue management, call acceptance, schedule, teaming |
| **Malka VRI** | Corporate/hearing users | On-demand interpreter, billing dashboard, scheduling |

### Non-US Market (2 Apps)
| App | Users | Key Features |
|-----|-------|-------------|
| **Malka Client** | Deaf users + corporate users (unified) | Single app, gov't-funded relay, no VRS/VRI distinction |
| **Malka Interpreter** | Interpreters | Same as US interpreter app, different billing backend |

### Technical Approach
- [ ] React Native (shared codebase with web where possible)
- [ ] Jitsi Meet React Native SDK for video
- [ ] Push notifications for incoming calls (APNs + FCM)
- [ ] Background call handling (CallKit on iOS, ConnectionService on Android)
- [ ] Offline-capable contact list and call history
- [ ] App Store / Play Store submission per brand per market

---

## Phase 7: Advanced Features
> Goal: Production polish, scale, and operational excellence

- [ ] Real-time interpreter analytics (avg wait time, call duration, utilization)
- [ ] Interpreter scheduling and shift management
- [ ] Call recording (opt-in, with consent, for quality assurance)
- [ ] AI-powered quality monitoring (sentiment, sign recognition metrics)
- [ ] Load balancing across multiple Jitsi shards
- [ ] Geographic redundancy (multi-region deployment)
- [ ] DDoS protection, SOC 2 compliance
- [ ] Automated E2E testing suite (call flow tests)

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|-------------|
| Phase 0 | 1-2 weeks | None |
| Phase 0.5 | 1-2 days | Phase 0 |
| Phase 1 | 6-8 weeks | Phase 0.5 |
| Phase 2 | 4-6 weeks | Overlaps with Phase 1 (start PostgreSQL + testing early) |
| Phase 3 | 6-12 months | FCC filing (start ASAP, runs parallel with all phases) |
| Phase 4 | 4-6 weeks | Phase 2 (requires PostgreSQL) |
| Phase 5 | 3-4 weeks | Phase 4 |
| Phase 6 | 8-12 weeks | Phase 1 + Phase 2 |
| Phase 7 | Ongoing | Phase 6 |

**Critical path**: FCC certification (Phase 3A) is the longest lead item. File as early as possible — engineering work proceeds in parallel.

**Quick wins**: Deployment (Phase 0.5) is ready now. Structured logging and health checks (Phase 2E) can be done in a day and immediately improve operability.
