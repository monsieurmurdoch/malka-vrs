# Malka VRS - Product & Engineering Roadmap

> **Last updated**: May 1, 2026
> **Overall status**: Web/backend feature depth is strong and the intended runtime line is now PostgreSQL-only. Maple VRI has passed backend, queue, admin, CDR, and real media/UDP smoke validation. Malka VRS backend/WebSocket smoke now covers in-room-style interpreter request, admin live queue visibility, interpreter match, call end, and CDR creation. The main open risks are remaining real-browser in-room/admin UI verification, TURN/coturn fallback, Redis/state externalization, regulatory/compliance work, live Stripe/accounting configuration, and mobile parity.

---

## Current Snapshot

**Pilot-ready surface**
- Maple and Malka tenant routes are live on the Droplet.
- Maple VRI demo accounts authenticate on `vri.maplecomm.ca`.
- Malka demo accounts authenticate on `vrs.malkacomm.com`.
- VRS, ops, PostgreSQL, PgBouncer, nginx, Jitsi, and Twilio proxy health checks pass through production routes.
- Maple VRI real media smoke passed with client/interpreter join and JVB UDP 10000 media observed from outside the Droplet network.
- Client/interpreter profiles, focused VRI session console, media defaults, contact history, instant-room shortcuts, visual voicemail shell, and caption foundations are in place.

**Not yet production-complete**
- Full real-browser UI verification is still required for the active-room request-interpreter button, VRI invite/guest flow, and admin moderation screens.
- TURN/coturn fallback is still needed for corporate networks where direct UDP 10000 is blocked.
- Admin portal filtering/moderation has been implemented and needs real-browser workflow smoke across Malka and Maple.
- Redis/state externalization is still required before multi-server horizontal scaling.
- FCC/VRS compliance, 911/E911, iTRS, NANP provisioning, billing immutability, and certification remain major parallel tracks.
- VRI corporate billing/payment and interpreter payout foundations are now implemented: immutable CDR-to-invoice item linking, Stripe invoice/customer plumbing, invoice email/send path, credit notes, webhook replay, reconciliation dashboard, payables/payout/schedule/utilization tables, contractor invoices, payout CSV export, and admin APIs. Live Stripe production mode still needs real keys, Stripe portal configuration, and final accounting policy.
- Mobile apps need feature and backend parity with the main web app before broad launch.

---

## Completed Work

### Foundation & Production Infrastructure
- [x] Webpack/dev server serving the VRS welcome page
- [x] Backend services running: VRS, ops, Twilio voice server
- [x] Production Docker Compose stack: nginx, Jitsi, VRS, Maple VRS, ops, PostgreSQL, PgBouncer, Twilio
- [x] Production nginx reverse proxy with SSL, WebSocket, BOSH/XMPP, ops, Twilio, and tenant routing
- [x] DigitalOcean Droplet provisioned
- [x] Domain routing for Maple and Malka app surfaces
- [x] Production `.env` configured for runtime services
- [x] WebSocket connections work through nginx
- [x] Maple and Malka backend smokes pass for queue, ops, and Twilio readiness
- [x] Twilio reverse proxy smoke fixed: `/twilio/health` and `/twilio/api/readiness` return 200 through production routes
- [x] Production ops health/readiness return `ok` after disabling bootstrap superadmin in the prod compose path

### Production Verification & Smoke Tests
- [x] Real media smoke on Droplet: client joins, interpreter joins, video/audio works, room survives normal browser flow
- [x] JVB media over UDP 10000 verified from outside the Droplet network
- [x] In-room-style request-interpreter backend flow verified during an active room context (`roomName` preserved through queue/match)
- [x] Admin live queue visibility and pause/resume moderation verified during a live queue match
- [x] Call end writes the correct CDR/call record
- [x] PgBouncer/pg_audit/WAL settings validated in a fresh deploy smoke
- [x] Disposable base-backup restore drill completed on the Droplet in an isolated temp Postgres container
- [x] SSL auto-renewal path tested
- [x] Bootstrap superadmin credentials rotated/disabled after first permanent admin login
- [x] Maple scripted pilot smoke: client login, interpreter login, request interpreter, admin view, end call/CDR

### Admin Portal
- [x] Queue dashboard for ops team
- [x] Admin live queue/activity filters by tenant, service mode, language, and role
- [x] Unified admin operations table with tenant, service, flow, role, and shared status filters
- [x] Admin account moderation for client/interpreter/captioner permissions
- [x] Admin audit export for account/permission changes
- [x] Superadmin dashboard for managing tenants

### PostgreSQL Runtime Alignment
- [x] VRS server runtime uses PostgreSQL as canonical app database
- [x] Local and production Compose include PostgreSQL 16 for app data
- [x] Smoke seed path creates Malka and Maple demo data against PostgreSQL
- [x] Ops-server account/audit persistence uses PostgreSQL
- [x] Ops live dashboard state moved from process memory to PostgreSQL-backed persistence
- [x] Stale SQLite-era runtime/docs/test paths retired or bridged away from release path
- [x] Schema migration tooling added with `node-pg-migrate`
- [x] `pg_audit` extension foundation added for audit logging
- [x] WAL archiving foundation configured for point-in-time recovery
- [x] PgBouncer connection pooling added for the production DB path

### TypeScript Migration
- [x] Ops-server migrated to TypeScript
- [x] `vrs-server/server.js` migrated to TypeScript runtime source (`src/server.ts`, built to `dist/server.js`)
- [x] `vrs-server/database.js` migrated to TypeScript canonical source (`src/database.ts`); top-level JS remains a compatibility bridge
- [x] `vrs-server/lib/*.js` key services migrated: queue-service, handoff-service, activity-logger
- [x] Shared strict tsconfig base added for VRS and ops
- [x] Strict mode enabled for new TypeScript files

### Authentication & Accounts
- [x] Email/password login with JWT
- [x] JWT session management across VRS and ops
- [x] Role-based access for client, interpreter, captioner, admin, and superadmin paths
- [x] Password hashing with bcrypt
- [x] Auth endpoint rate limiting foundation
- [x] Phone number login and SMS/OTP code paths implemented
- [x] Password reset flow implemented
- [x] Demo accounts seeded for Malka client/interpreter/captioner/admin
- [x] Demo accounts seeded for Maple VRI client/interpreter/captioner/admin
- [x] Maple VRS test-only client/interpreter accounts seeded
- [x] Legacy VRS admin login disabled in favor of ops auth

### Maple & White-Label Runtime
- [x] Maple tenant runtime exists (`TENANT=maple`)
- [x] Tenant config files exist for Maple and Malka with brand, colors, assets, and feature flags
- [x] One codebase can build tenant-specific outputs through the `TENANT` prebuild path
- [x] CSS tenant variable generation and tenant asset copying are wired into the build
- [x] Maple VRI first-screen flow defaults to VRI affordances instead of VRS phone dialing
- [x] Maple auth/login branding moved to red/white visual language
- [x] Original Maple logo wordmark asset renders on Maple auth in production
- [x] Maple and Malka aesthetics separated at runtime
- [x] Tenant metadata carried on client/interpreter/admin records (`tenantId`, `serviceModes`, permissions/organization where applicable)
- [x] Admin can adjust client/interpreter tenant and service-mode permissions
- [x] Maple tenant admin can access same-tenant managed-account endpoints without requiring superadmin
- [x] VRI-only interpreters do not receive VRS queue work
- [x] Malka can support VRS-default and VRI-only client profiles
- [x] Maple can support VRI-default and VRS test profiles

### Client & Interpreter UX
- [x] Client profile page with display name, email, organization, VRS phone number where applicable
- [x] VRI client profile path without phone-number dependency
- [x] VRI-capable clients land on a focused VRI session console centered on self-view, Request Interpreter, settings, and billing/usage
- [x] Profile settings wired to backend preferences for DND, dark mode, media defaults, and permission memory
- [x] Password change flow in settings
- [x] Larger self-view and camera permission feedback in client profile
- [x] VRI console includes lightweight day/week/month usage summary from call history
- [x] Interpreter profile page with name, email, languages, queue status, stats, and backend profile connection
- [x] Interpreter availability toggle
- [x] Interpreter profile structure aligned more closely with client profile, with room for role-specific tabs

### Calls, Rooms & Queue
- [x] WebSocket-based interpreter queue
- [x] Interpreter states: available, in-queue, out-queue, on-break, teamed, in-call
- [x] Queue priority logic: longest-waiting caller first
- [x] Language/skills-based routing foundation
- [x] Client request enters queue and interpreter match creates room
- [x] In-room request-interpreter button added as a central action
- [x] Request-interpreter status color states: pending/confirmed foundation
- [x] Duplicate request-interpreter control suppressed on Jitsi prejoin/waiting-room screens
- [x] Maple VRI queue-created calls persist `call_type = vri`
- [x] Call-end WebSocket path marks calls completed and writes immutable billing CDRs
- [x] Real Maple VRI media smoke passed: client and interpreter joined, audio/video worked, and UDP 10000 media was observed
- [x] Instant-room fast join
- [x] Instant-room default camera and mic off
- [x] Remember media permission preference
- [x] Logged-in-only instant-room invite links
- [x] Instant-room invite suggestions
- [x] In-call captions toggle retained instead of removing language/caption capability

### Contacts & Communication
- [x] Contact list UI with search, avatars, phone numbers, and last-call metadata
- [x] Contact groups/categories
- [x] Merge/dedup duplicate contacts
- [x] Block list
- [x] Import contacts from JSON/CSV
- [x] Google Contacts import hook/API path (requires OAuth env)
- [x] Phone/contact picker hook where browser support exists
- [x] Contacts drawer in instant rooms
- [x] Speed dial migrated toward unified contacts
- [x] Contact cards with full history: calls, messages, notes
- [x] Contact sync across web/mobile web via API sync, WebSocket invalidation, and polling
- [x] Dial/start room from contact detail

### TTS, Captions & Voicemail
- [x] In-call TTS text box
- [x] Voice selection, speed, and pitch controls
- [x] Quick phrases
- [x] VCO mode foundation
- [x] Captioner role and auth path
- [x] Manual caption publishing foundation
- [x] Caption overlay in call with toggle
- [x] Transcription/subtitle plumbing foundation
- [x] Visual voicemail DB/API/Redux/UI shell
- [x] Video mailbox recording lifecycle foundation
- [x] Missed-call to video-message prompt
- [x] Voicemail inbox UI
- [x] Video playback controls
- [x] Auth-gated voicemail launcher
- [x] Voicemail unread badge and live in-app updates
- [x] Configurable message expiry foundation
- [x] S3-compatible object storage path for voicemail media

### Security & Hardening
- [x] SQL injection fix in daily usage stats
- [x] Handoff REST endpoints protected with auth middleware
- [x] Interpreter login N+1 removed
- [x] Speed-dial authorization enforced by client ownership in DB layer
- [x] Phone number assignment collision retry
- [x] WebSocket interpreter request auth enforcement
- [x] WebSocket message size limit
- [x] Helmet/CSP foundation tuned for Jitsi/WebRTC compatibility
- [x] CSP regressions fixed for instant-room UI actions and Jitsi worker/WASM needs

### Logging, Metrics & CI Foundation
- [x] Pino structured logger foundation in VRS server
- [x] Module-scoped child loggers in VRS server
- [x] Request ID middleware in VRS server
- [x] Health/readiness endpoints for VRS, ops, and Twilio
- [x] Prometheus metrics endpoint and checked-in Prometheus/Grafana config foundation
- [x] Jest/ts-jest test framework for VRS server
- [x] Initial coverage for auth, queue, handoff, voicemail, billing modules
- [x] Backend CI foundation: VRS tests, ops build, Compose config validation
- [x] GitHub Actions pins bumped to Node 24-compatible action versions (`checkout@v6`, `setup-node@v6`, `stale@v10`)

### Status & Project Tracking
- [x] `status.md` running update file
- [x] Obsidian mirror to `Documents/Obsidian Vault/Coding/Malka-App`
- [x] Roadmap mirrored to Obsidian
- [x] Dedicated `codex/logging-observability` branch created for observability/logging work

### Maple VRI Pilot Readiness
- [x] Admin moderation filters by tenant and service mode (`malka`/`maple`, `vrs`/`vri`)
- [x] Add DB-level immutability guard for `calls.call_type`
- [x] Maple human pilot script: client login, interpreter login, request interpreter, admin view, end call
- [x] Confirm Maple copy never says "video relay" on VRI-only paths
- [x] VRI session invite model: client can prepare/add participants before interpreter match, but nobody enters a live room until an interpreter confirms
- [x] VRI invite links scoped to the queue/session object, expiring after session end or short unmatched timeout
- [x] VRI guest flow: invited Deaf/hearing participants land in waiting/prejoin and can join once the interpreter-connected room is live
- [x] In-room VRI invite button: obvious secondary toolbar action with copy link, not hidden in settings/extras

### White-Label Hardening
- [x] Tenant isolation decision documented: shared PostgreSQL tables with RLS path, not schema-per-tenant yet
- [x] Separate JWT signing key support per tenant (`VRS_JWT_SECRET_MALKA`, `VRS_JWT_SECRET_MAPLE`) with shared-secret fallback for local/legacy compatibility
- [x] Tenant-specific splash screens, app icons, PWA manifest, and mobile asset slots declared in tenant configs
- [x] Tenant-specific billing/interpreter-pool configuration declared beyond service-mode metadata

### Database Scaling
- [x] PgBouncer transaction pooling
- [x] Schema migration tooling

### Malka/Multi-Mode Product Logic
- [x] Confirm Malka VRS clients retain VRS phone-number-oriented flow
- [x] Confirm Maple VRS test accounts are clearly separated from Maple VRI default experience
- [x] Prevent aesthetic cross-wiring between Malka and Maple at build/runtime boundaries

---

## Immediate Open Work

### Admin Portal Refinement
- [ ] Real-browser verify top-level admin dashboard navigation after replacing static buttons with hash-routing handlers
- [x] Expand interpreter admin profile into a full CRM-style record: password reset, company/alternate email, schedule/billing/payment notes, manager comments, language permissions, and VRI/VRS queues
- [x] Add corporate client account creation/editing from tenant admin and superadmin contexts
- [x] Make interpreter/client/account CSV exports available from roster tables
- [x] Clarify admin dashboard labels: Available Interpreters are staff ready for matching; Waiting Client Requests are clients currently waiting in queue
- [x] Tighten admin live refresh for interpreter availability and queue-state changes so manual refresh is not normally needed
- [x] Replace CRM note fields with dedicated schedule, billing, payout, utilization, and manager-note tables once those subsystems are live

### Calls, Rooms & Queue Follow-Up
- [ ] Linked hangup for interpreted calls: if the client or interpreter ends an interpreted VRI/VRS session, the other party exits too
- [ ] Preserve independent hangup behavior for non-interpreted rooms: P2P instant rooms and deaf-to-deaf/direct calls should not force-close all participants

### Maple VRI Pilot Readiness & White-Label Hardening (cont.)
- [ ] Add optional SMS/email send to VRI session invites after Resend/Twilio policy is finalized
- [ ] Implement PostgreSQL RLS policies for all tenant-owned tables

### UX Polish (Deferred Until Billing Backend Complete)
- [x] Responsive layout audit for desktop, tablet, and small mobile screens
- [x] Accessibility audit against WCAG 2.1 AA, especially keyboard access and visible focus
- [x] Notification preferences UI wired to backend preferences
- [x] Add-to-contacts from call history when a call exposes a phone number
- [ ] VRS contact handles/aliases tied to NANP numbers, pending compliance review
  - Current FCC-facing assumption: a ten-digit NANP number remains the registered/routable identifier for VRS. Optional private handles may be an app-layer discovery shortcut only if they resolve back to the registered number and do not replace TRS numbering/eligibility requirements.
- [ ] Reduce clutter in profile home views and keep secondary panels collapsible
- [ ] Finalize Malka light/dark palette against current public website
- [ ] Finalize caption/language controls location so they are available without crowding the room UI

---

## Near-Term Feature Work

### Observability Branch (`codex/logging-observability`)
- [ ] Replace remaining `console.log`/`console.error` with structured logger across VRS, ops, and Twilio
- [ ] Standardize `LOG_LEVEL` across services
- [ ] Structured JSON output in production for all services
- [ ] Pretty logs in local/dev only
- [ ] Correlation/request ID propagation across VRS, ops, Twilio, WebSocket, and call lifecycle events
- [ ] Log call lifecycle events: request created, queue join, interpreter match, room created, call start, call end, errors
- [ ] DigitalOcean monitoring integration decision
- [ ] External APM decision: Datadog, New Relic, or OpenTelemetry-first vendor-neutral path
- [ ] Alert rules for service down, queue wait, JVB CPU, DB latency, disk, memory, and error rate

### Validation & Error Handling
- [ ] Expand Zod validation to every POST/PUT/PATCH endpoint
- [ ] Validate all WebSocket message payloads
- [ ] Sanitize stored user-generated fields to prevent XSS
- [ ] Centralized Express error handler with no stack traces in production responses
- [ ] Consistent error shape across services: `{ error, code, details? }`
- [ ] WebSocket error boundaries so unhandled message errors cannot crash the process
- [ ] Full npm audit review and dependency upgrade plan

### Testing
- [ ] Unit tests: queue priority, matching, state transitions
- [ ] Unit tests: JWT generation, validation, expiry
- [ ] Unit tests: billing CDR creation and immutability
- [ ] Integration tests: API endpoint contracts
- [ ] Integration tests: WebSocket event sequences
- [ ] E2E tests: signup/login/dial/match/call/hangup
- [ ] E2E tests: Maple VRI request-interpreter pilot path
- [ ] CI: require tests/build/smokes on every PR before merge

### Captions & Accessibility
- [ ] Human captioner workflow with privacy routing
- [ ] Real-time STT stream: Deepgram, Whisper, Google, or AWS
- [ ] Dual-stream captions for hearing/deaf tracks
- [ ] Caption language detection
- [ ] Post-call transcript workflow where legally allowed
- [ ] Consent management and ephemeral-only mode for VRS where required
- [ ] STS mode for speech disabilities

### Visual Voicemail Follow-Through
- [ ] Confirm real object-storage write/read path in production
- [ ] Generate voicemail thumbnails server-side
- [ ] Media transcoding/compression for stored messages
- [ ] Notification delivery beyond in-app badge where needed
- [ ] Retention/expiry job verification in production

---

## Scale Preparation

### Redis & State Externalization
- [ ] Add Redis to Docker Compose stack
- [ ] Move WebSocket client registry out of process memory
- [ ] Move queue state out of in-memory Maps
- [ ] Move handoff tokens to Redis TTL keys
- [ ] Move interpreter presence to Redis heartbeat/expiry
- [ ] Move rate limiting to Redis-backed store
- [ ] Add Redis Pub/Sub for cross-instance WebSocket broadcasting
- [ ] Make VRS server stateless enough for multiple instances behind a load balancer

### Database Scaling
- [ ] Read replicas for dashboard/analytics queries
- [ ] Partition `calls` and `activity_log` by month
- [ ] Query-plan review for queue matching, call history, dashboard stats
- [ ] Prepared statements for hot paths
- [ ] Autovacuum tuning for high-churn tables

### Jitsi & Media Scaling
- [ ] Multiple JVB instances registered to the same brewery MUC
- [ ] Verify Jicofo least-loaded bridge selection
- [ ] JVB autoscaling based on active participants/resources
- [ ] JVB resource limits and participant caps
- [ ] Octo mode for multi-region
- [ ] Simulcast/LastN configuration verification
- [ ] Adaptive bitrate verification
- [ ] Resolution caps by call type: P2P, VRS, VRI
- [ ] Bandwidth estimation and poor-network warnings
- [ ] Audio/caption fallback when video quality collapses
- [ ] TURN/coturn deployment for corporate NAT/firewall scenarios

### Redundancy & Disaster Recovery
- [ ] Multi-region deployment plan
- [ ] PostgreSQL streaming replication or managed failover
- [ ] Redis Sentinel or managed Redis HA
- [ ] JVB redundancy and reconnect behavior
- [ ] Geographic DNS routing
- [ ] Automated failover testing
- [ ] Cross-region object storage replication for voicemail media
- [ ] Provision offsite backup storage and perform true base-backup/WAL restore drill into separate infrastructure
- [ ] Recovery targets: RPO < 1 minute, RTO < 5 minutes for 911-capable system

---

## Regulatory & Business Track

### FCC Provider Certification
- [ ] File application with FCC Consumer & Governmental Affairs Bureau
- [ ] Demonstrate technical capability: 911, 10-digit numbering, interoperability
- [ ] Demonstrate financial/operational capability
- [ ] Pass FCC compliance audit
- [ ] Timeline expectation: 6-12 months from filing

### Phone Number Provisioning
- [ ] Obtain NANP number blocks through RespOrg partnership
- [ ] Integrate with iTRS database
- [ ] Build verified number assignment flow
- [ ] Support number porting
- [ ] 911/E911 integration

### User Eligibility & Verification
- [ ] Self-certification flow for hearing/speech disability
- [ ] Identity verification workflow
- [ ] iTRS database cross-reference
- [ ] Annual recertification
- [ ] Immutable audit trail for eligibility events

### 911 Emergency Services
- [ ] E911 location registration for each VRS user
- [ ] Automatic 911 routing through PSAP
- [ ] 911 priority in interpreter queue
- [ ] Compliance with FCC 911 rules for VRS

### VRS Billing
- [ ] CDR schema finalized for TRS Fund submission
- [x] CDR immutability: append-only after call end
- [ ] Monthly CDR aggregation pipeline
- [ ] TRS Fund submission formatting
- [ ] Reconciliation against payments/disputes
- [ ] Per-minute rate table management

### VRI Billing
- [x] Corporate account management
- [x] Default VRI ASL-to-English rate: **$1.00 USD / $1.25 CAD per interpreter minute** until contract-specific pricing supersedes it
- [x] Per-client VRI rate overrides by corporate account, tenant, currency, language pair, and effective date
- [x] Rate templates for future spoken/signed language pairs and captioning services without hard-coding prices yet
- [x] VRI CDRs tagged at call origination/CDR creation
- [x] Billing architecture decision: use Stripe Billing for corporate VRI usage, invoices, payment collection, and customer portal unless a later accounting constraint forces another provider
- [ ] Stripe product/price catalog: VRI interpreter-minute meter, tenant/currency-specific prices, and per-client override metadata
- [x] Stripe customer mapping: tenant/corporate account -> Stripe customer, with billing contacts, currency, tax metadata, and payment terms
- [x] Stripe usage ingestion from immutable VRI CDRs: one idempotent meter event or invoice line source per completed billable interpreter minute
- [x] Invoice generation: draft invoices from CDRs, review/approve, finalize, and send through Stripe-hosted invoices
- [x] Auto-email issued invoices to billing contacts through Stripe invoice emails; evaluate Resend only for custom supplemental summaries
- [x] Manual invoice path and admin-recorded offline payments
- [x] Payment method support backend: reusable payment-method setup intents and customer payment-method management through Stripe Billing Portal
- [x] Initial Stripe webhook handling for invoice finalized, paid, payment failed, voided, and uncollectible events
- [x] Expand Stripe webhook handling for disputes, refunds, customer/subscription changes, and idempotent event recording
- [x] Stripe credit note handling and webhook replay tooling
- [x] Corporate usage dashboard backend: day/week/month totals, invoice history, downloadable CSV
- [x] Admin billing dashboard backend: corporate accounts, rates, invoice drafts, issued invoices, payment status, disputes, write-offs
- [x] Billing reconciliation dashboard backend: compare internal CDR totals, invoice totals, payments, credits, disputes, webhook health, and write-offs
- [x] Build-vs-integrate decision: keep operational billing cockpit in-app, integrate/export to accounting later rather than adopting a full external CRM as source of truth
- [ ] Strict VRS/VRI separation in call creation, routing, billing, and audit trails

### Interpreter Payouts & Invoicing
- [x] Interpreter profile billing backend options: supported service modes, language pairs, pay rate, currency, employee/contractor status, vendor/tax details, and payout preferences
- [x] Interpreter payout model backend: hourly, per-minute, minimum blocks, service-mode/language differentials, currency, and effective dates
- [x] Interpreter payable records generated from completed CDRs and approved invoice items
- [ ] Interpreter payable records generated from queue lifecycle events, availability sessions, break sessions, scheduled shifts, adjustments, and manager approvals
- [ ] Stripe Connect decision: use Connect for automated contractor payouts only after legal/accounting confirms platform liability, contractor onboarding, tax reporting, and supported countries; keep payroll/accounting export path for employees
- [x] Interpreter invoice generation for contractor interpreters by billing period, with draft review before payment
- [x] Interpreter payout review workflow backend: draft, approved, paid, with room for failed/disputed/adjusted/reversed follow-up statuses
- [x] Export payout reports for accounting/payroll
- [ ] Optional payment rails investigation: Stripe Connect, Wise, ACH provider, or manual accounting export
- [ ] Interpreter profile billing tab for earnings, invoices, payout method, tax/vendor documents, and payout history

### Interpreter Scheduling & Utilization
- [x] Dedicated interpreter schedule tables: availability windows, scheduled shifts, time-off/unavailable blocks, recurring schedule rules, tenant/service-mode/language eligibility, and manager overrides
- [x] Dedicated billing tables: corporate accounts/rate tiers/invoices plus `billing_invoice_items`, `billing_payments`, `billing_adjustments`, and `stripe_webhook_events`
- [x] Dedicated payout tables: `interpreter_pay_rates`, `interpreter_payables`, `interpreter_payout_batches`, `interpreter_payout_items`, `interpreter_payout_adjustments`, `interpreter_vendor_profiles`, `interpreter_contractor_invoices`, and `interpreter_contractor_invoice_items`
- [x] Dedicated schedule/utilization tables: `interpreter_schedule_windows`, `interpreter_availability_sessions`, `interpreter_break_sessions`, `interpreter_shift_targets`, `interpreter_shift_exceptions`, and `interpreter_utilization_summaries`
- [x] Dedicated manager-note tables: structured notes linked to interpreter/client/corporate account, note type, visibility, author, timestamp, audit trail, and follow-up date
- [ ] Interpreter self-scheduling UI: interpreters can view required/target weekly hours, signed-on hours so far, scheduled hours remaining, and add/adjust availability to fill gaps
- [ ] Admin scheduling UI: weekly roster by tenant, service mode, language, interpreter, coverage gaps, overstaffing, and pending interpreter schedule changes
- [x] Availability session tracking foundation: when an interpreter goes available, unavailable, on break, busy/in-call, or offline, record start/end timestamps with source and reason
- [x] Break tracking foundation: paid/unpaid break classification, break reason, break duration, break frequency, and compliance/manager review flags
- [x] Utilization metrics backend foundation: scheduled, signed-on, available, in-call, break, idle minutes, and utilization rate
- [ ] Utilization metrics expansion: queue acceptance rate, decline/no-answer rate, after-call/admin time, and SLA impact
- [ ] Weekly utilization dashboard for interpreters: scheduled hours, signed-on hours, hands-up hours, in-call hours, breaks, remaining target hours, and earnings/payables preview
- [ ] Weekly utilization dashboard for admin: coverage by hour, fill-rate, interpreter adherence, break patterns, productivity, queue SLA impact, and exportable payroll/accounting summary
- [ ] Service-mode utilization split: VRS vs VRI vs captioning availability and in-call minutes, with tenant/language filters
- [x] Utilization/audit foundation: manager notes, schedule changes, payout batch approvals/payments, credit notes, webhook replay counts, and billing audit events

### Billing Safeguards
- [ ] Immutable `call_type` at call creation
- [ ] Separate VRS and VRI billing pipelines
- [ ] Automated reconciliation anomaly checks
- [ ] Monthly billing audit report
- [ ] FCC audit export with chain of custody

---

## Mobile Apps

**Target**: mobile parity by **May 31, 2026**, with an internal/TestFlight/Play pilot sooner if the core call flow is stable. The web app is the source of truth until mobile parity is explicitly checked off.

**Current mobile state**: native iOS and Android project shells exist, plus a TWA path, and the mobile parity branch now has first-pass React Native screens for login, VRS home, VRI console, contacts, call history, voicemail, interpreter home/settings/earnings, tenant config, native storage helpers, deep-link scaffolding, QA docs, and CI typecheck wiring. Client/interpreter email/password auth now calls the real production endpoints, native cold-start routing hydrates AsyncStorage before choosing a route, the queue client uses tenant domains instead of localhost on native, VRI self-view uses a native camera preview, and contacts/detail/call-history/VRI-usage/voicemail inbox now call production APIs with local cache fallback. Remaining release gaps include secure Keychain/Keystore storage, phone/SMS auth, push/background calling, embedded voicemail audio playback, billing invoice depth, and physical device media/call smoke.

**Policy**: every web feature merged after April 29, 2026 must update this mobile section with one of: implemented on mobile, intentionally web-only, mobile follow-up ticket, or blocked by native platform capability.

### Mobile Release Gates
- [x] Define mobile MVP scope for end-of-May release: Malka VRS + Malka VRI client first, interpreter app post-May unless it becomes operationally critical
  - 2026-04-30: Decision recorded on mobile branch: React Native client-first release, with interpreter app deferred from first release candidate.
- [x] Decide platform strategy for first release: native React Native, not TWA-first
  - 2026-04-30: Existing RN shells/shared Redux path selected for the first release; TWA remains a fallback or later packaging option.
- [x] Mobile email/password auth uses production client/interpreter endpoints instead of demo tokens
  - 2026-05-01: Mobile login calls `/api/auth/client/login` or `/api/auth/interpreter/login`, stores real JWT metadata, and routes by backend role/app type.
- [x] Native launch routing waits for AsyncStorage hydration before choosing login vs app route
- [x] Native API and queue clients resolve tenant domains instead of falling back to `localhost`
- [x] VRI self-view uses native camera preview and stores permission/default metadata
- [x] Contacts list/detail use production contacts APIs with local cache fallback
- [x] Call history uses `/api/client/call-history` with local cache fallback
- [x] VRI usage summary aggregates `/api/client/call-history` with local cache fallback
- [x] Voicemail inbox uses production inbox/unread/seen/delete/playback URL APIs with local cache fallback
- [ ] Confirm backend API contract parity for auth, profile, calls, queue, contacts, voicemail, tenant, and billing metadata
  - 2026-05-01 update: Auth, tenant queue URL selection, native route hydration, contacts/detail, call history, VRI usage, and voicemail inbox API calls are now wired. Keep open for profile refresh, billing invoice metadata depth, reset/JWT refresh behavior, and physical-device contract smoke.
- [ ] Run iOS simulator smoke for login, profile load, permissions, call join, and logout
  - 2026-04-30: Blocked locally by missing full Xcode simulator setup.
  - 2026-05-01: Still blocked locally: `xcrun simctl` is unavailable and `xcodebuild` reports Command Line Tools instead of full Xcode.
- [ ] Run Android emulator smoke for login, profile load, permissions, call join, and logout
  - 2026-04-30: Blocked locally by missing Android SDK/emulator setup.
  - 2026-05-01: Still blocked locally: `adb` is not installed and Android Gradle cannot run because Java is missing.
- [ ] Run one physical iPhone smoke: camera/mic permissions, speaker/Bluetooth, background/lock behavior, reconnect
- [ ] Run one physical Android smoke: camera/mic permissions, speaker/Bluetooth, background/lock behavior, reconnect
- [ ] Establish TestFlight release lane
- [ ] Establish Play Internal Testing release lane
- [ ] Add mobile build/test workflow to CI or a documented local release checklist
- [ ] Create mobile release checklist covering app version, tenant branding, backend base URL, privacy copy, permissions, crash reporting, and rollback plan

### Mobile App Targets
- [ ] Malka VRS Client: Deaf/HoH users, VRS phone-number flow, interpreter-assisted calls, contacts, call history
- [ ] Maple VRI Client: corporate shared-device/session console, self-view, Request Interpreter, usage summary, settings
- [ ] Malka VRI Client: corporate VRI mode for Malka tenant/accounts with VRI permissions
- [ ] Interpreter App: queue availability, incoming request acceptance, VRS/VRI service-mode separation, profile, billing/earnings tab
- [ ] Captioner App: caption assignment, caption publishing, session privacy routing
- [ ] Admin Mobile/Tablet: decide whether admin is responsive web only or gets native moderation surfaces
- [ ] Non-US Malka Client: unified relay/VRI client where local market does not distinguish VRS/VRI
- [ ] Non-US Interpreter: interpreter app with market-specific billing backend

### Current Parity Gap Summary
- [ ] Authentication parity: email/password, role routing, JWT refresh/expiry behavior, tenant routing, password reset
  - 2026-05-01 review: Mobile login and reset-password screens exist, but login is demo/local only and writes `demo-jwt-*` instead of calling `/api/auth/...`; cold-start native session restore also needs async storage hydration before route selection.
  - 2026-05-01 update: Mobile client/interpreter login now calls `/api/auth/client/login` or `/api/auth/interpreter/login`, stores real JWT metadata, caches tenant config, and waits for native storage hydration before launch routing. JWT refresh, phone/SMS auth, and real reset-password backend integration remain open.
- [ ] Tenant parity: Maple/Malka branding, app icon/splash, tenant config, host/base URL, feature flags
  - 2026-04-30: Tenant config/app-type scaffolding added for `malka`, `malkavri`, and `maple`; still needs device verification for native icons/splash/base URL behavior.
  - 2026-05-01 update: Native API and queue clients now resolve tenant domains from whitelabel config, `TENANT`/`VRS_TENANT`/`EXPO_PUBLIC_TENANT`, or AsyncStorage fallback instead of localhost. Device verification for icons/splash and runtime tenant selection remains open.
- [ ] Profile parity: VRS client profile, focused VRI console, interpreter profile, captioner profile, settings, password change
- [ ] Media parity: Jitsi join, prejoin/waiting room, self-view, camera/mic defaults, permission memory, Bluetooth/audio route behavior
  - 2026-05-01 update: VRI console now starts a native camera self-view preview and persists camera permission/default metadata. Jitsi in-room camera switching, Bluetooth/audio route behavior, and physical-device smoke remain open.
- [ ] Queue parity: request interpreter, queue status, cancel request, interpreter availability, interpreter accept/decline, match transition
  - 2026-05-01 update: Native queue client no longer points to `localhost`; it resolves `wss://<tenant-domain>/ws` and sends active/inactive interpreter statuses directly. End-to-end request/accept/join smoke remains open.
- [ ] In-room parity: toolbar actions, request interpreter, invite, captions/language, TTS/VCO where applicable, hangup/end-for-all
- [ ] Contacts parity: list, search, import, sync, full history, notes, favorites, block/merge/dedup
  - 2026-05-01 review: Contacts screen has list/search/favorites UI, but it is local/mock-backed, contact detail selection is currently broken, and API sync/import/block/merge/dedup remain open.
  - 2026-05-01 update: Contacts list and detail now call `/api/contacts`, selected-contact navigation stores a contact snapshot, favorites/notes sync back to the API, and local cache remains as fallback. Import, block, merge/dedup, and full contact-history linkage remain open.
- [ ] Call history parity: active calls, completed calls, CDR/usage metadata, missed calls, callback where applicable
  - 2026-05-01 review: Call history screen exists, but it still uses mock/local entries and currently breaks native typecheck due to a missing `mobileLog` import target.
  - 2026-05-01 update: Native typecheck now passes and call history now syncs `/api/client/call-history` with local cache fallback. Missed-call semantics and compliant callback flow remain open.
- [ ] Visual voicemail parity: authenticated launcher, unread badge, inbox, playback, recording/upload path, notifications
  - 2026-04-30: Voicemail inbox UI has unread badge/playback controls, but playback is still demonstration state and not wired to real media/API.
  - 2026-05-01 update: Mobile voicemail now loads inbox/unread count, marks seen, deletes, and opens server playback URLs. Native embedded audio playback, recording/upload path, and push notifications remain open.
- [ ] Billing parity: VRI usage summary, corporate invoice visibility, interpreter earnings/invoice/payout tab
  - 2026-05-01 update: VRI usage summary now aggregates `/api/client/call-history` on mobile. Corporate invoice visibility and interpreter earnings/invoice/payout depth remain open.
- [ ] Admin parity: tenant/service-mode filters, live queue, active calls, account moderation, audit feed
- [ ] Offline/reconnect parity: WebSocket reconnect, active call rejoin, network loss states, background/foreground transitions
- [ ] Accessibility parity: VoiceOver/TalkBack labels, Dynamic Type/text scaling, reduced motion, color contrast, keyboard/switch access where feasible
  - 2026-04-30: First pass added labels to many interactive controls. Keep open until nested-touchable behavior, Dynamic Type, focus order, and device screen-reader smoke are verified.
- [ ] Security parity: secure storage for tokens, biometric unlock decision, logout/session clearing, no secrets in mobile bundles
  - 2026-05-01 review: Native storage abstraction exists, but sensitive tokens still fall back to AsyncStorage and demo JWTs are generated locally. Keychain/Keystore storage remains required.
  - 2026-05-01 update: Demo JWT generation has been removed from mobile login; tokens are real JWT metadata. Secure hardware-backed Keychain/Keystore storage is still required before release.
- [ ] Observability parity: crash reporting, structured mobile logs, request/session IDs, call lifecycle breadcrumbs

### Client Mobile Parity
- [ ] Malka VRS client login routes to VRS phone-number-oriented home
  - 2026-04-30: Screen routing scaffold exists, but it depends on demo auth until real login is wired.
  - 2026-05-01 update: Real email/password login now routes by backend role and tenant app type; phone-number login remains a separate VRS parity item.
- [ ] Malka VRI/Maple VRI client login routes to focused VRI session console
  - 2026-04-30: Screen routing scaffold exists via app-type branching; needs real tenant/auth smoke.
- [ ] VRI console shows large self-view and primary Request Interpreter action
  - 2026-05-01 review: VRI console has a large self-view placeholder and request/cancel action, but no actual camera preview yet.
  - 2026-05-01 update: VRI console now uses native camera preview for self-view with permission/default metadata persisted; device camera smoke remains open.
- [ ] VRI console prevents empty room start before interpreter match
- [ ] VRI console supports settings gear and media defaults
- [ ] VRI console exposes billing/usage summary without exposing admin-only billing controls
- [ ] VRS client supports phone-number profile, dial-via-interpreter, contacts, call history, missed calls
  - 2026-05-01 review: VRS home/dialpad/contacts/history screens exist, but contact/history data is mock/local and dial/callback currently starts generic rooms rather than the verified backend phone-number/interpreter-assisted flow.
  - 2026-05-01 update: Contacts and call history now use API-backed data with local cache fallback. Phone-number login/profile depth, missed-call semantics, and verified dial-via-interpreter flow remain open.
- [ ] Client can request interpreter, see pending status, cancel request, and auto-enter after match
  - 2026-04-30: Queue Redux/WebSocket path is shared with native, but real matched-room device smoke is still open.
- [ ] Client can join active matched room with camera off/mic muted defaults
- [ ] Client can leave call without being signed out
- [ ] Client call end reliably writes call completion/CDR metadata
- [ ] Client supports captions/language controls in a mobile-appropriate location
- [ ] Client supports invite flow once VRI session invite model is built
  - 2026-05-01 review: Native Jitsi invite modal exists through upstream conference navigation, but the custom VRI pre-match invite/session object flow is not implemented on mobile yet.
- [ ] Client supports visual voicemail inbox and unread badge
- [ ] Client supports contact history and notes

### Interpreter Mobile Parity
- [ ] Interpreter login routes to interpreter profile, not client surface
- [ ] Interpreter profile mirrors web structure with self-view, availability, queue state, tabs
- [ ] Interpreter can set service modes: VRS, VRI, captioning eligibility
- [ ] Interpreter can set language pairs and skills
- [ ] Interpreter can go available/unavailable
- [ ] Interpreter receives incoming request notification while app is foregrounded
- [ ] Interpreter receives push/call-style notification while app is backgrounded or locked
- [ ] Interpreter can accept/decline request and auto-join correct room
- [ ] Interpreter sees client/session context before accepting where permitted
- [ ] Interpreter can end call and trigger call lifecycle completion
- [ ] Interpreter billing/earnings tab shows payable minutes, invoice status, payout method placeholders
- [ ] Interpreter schedule/break/teaming decisions documented for MVP vs post-May

### Captioner Mobile Parity
- [ ] Decide whether captioner mobile is required for May or web-only for initial production
- [ ] Captioner login routes to captioner profile
- [ ] Captioner assignment/hidden participant flow works on mobile if included
- [ ] Caption publishing UI is usable on tablet/phone if included
- [ ] Privacy routing for captioners documented and tested

### Admin Mobile / Tablet Parity
- [ ] Decide whether admin moderation is responsive web/tablet only for May
- [ ] Admin can view tenant-scoped live queue on tablet/mobile
- [ ] Admin can view active calls and call details
- [ ] Admin can moderate client/interpreter/captioner permissions
- [ ] Admin can view billing dashboard summaries when billing launches
- [ ] Admin can view audit feed and account changes
- [ ] Superadmin tenant management remains desktop-only or gets explicit mobile scope

### Mobile Parity Track
- [ ] Audit current React Native/iOS/Android/TWA project health against current web/backend contracts
- [ ] Choose shared TypeScript API client strategy to prevent web/mobile contract drift
- [ ] Extract shared auth/session/profile/queue/contact types where practical
- [ ] Create mobile parity checklist template required for future web feature PRs
- [ ] Jitsi Meet React Native SDK integration verified against current Droplet/Jitsi config
- [ ] Mobile-safe WebSocket queue client with reconnect/backoff/session restore
  - 2026-04-30: Queue service can instantiate outside browser globals and has reconnect/backoff. Still needs native URL configuration, real auth token use, cold-start storage hydration, and device smoke.
  - 2026-05-01 update: Native queue URL, real JWT metadata, and cold-start storage hydration are wired. Device smoke and background/lock recovery remain open.
- [ ] Secure token storage: Keychain on iOS, Keystore/EncryptedSharedPreferences on Android
- [ ] Deep links into active rooms and invite links
- [ ] Push/background calling: APNs, FCM, CallKit, Android ConnectionService
- [ ] Reconnect/handoff behavior after app background, network switch, lock screen, and call interruption
- [ ] Poor-network states and media fallback copy
- [ ] Tenant branding parity for Maple/Malka: logos, colors, app name, favicon/app icon/splash, copy
- [x] Mobile QA matrix document created
- [ ] Mobile QA matrix executed: iOS/Android, phone/tablet, permissions, orientation, Bluetooth, screen lock
- [ ] Store readiness: privacy manifests, permission copy, screenshots, TestFlight/Play internal testing, crash reporting
  - 2026-04-30: iOS privacy manifest added; store/testflight/play execution remains open.

### Mobile May 2026 Delivery Plan
- [ ] Week 1: audit existing mobile shells, pick release strategy, define MVP by app/role, document known gaps
- [x] Week 1: wire mobile auth/session config to production/staging endpoints
- [ ] Week 2: implement client VRI console parity and VRS client profile parity
- [ ] Week 2: implement queue request/accept/join path on mobile
- [ ] Week 3: implement interpreter availability/acceptance path and background notification decision
- [x] Week 3: implement contacts/call history essentials or explicitly defer with user-facing fallback
- [x] Week 4: implement voicemail/billing summary essentials or explicitly defer with user-facing fallback
- [ ] Week 4: run device QA matrix, fix blockers, prepare TestFlight/Play internal release
- [ ] End of May: mobile release candidate with documented unsupported features and production rollback plan

### Mobile Drift Controls
- [x] Add `ROADMAP.md` mobile parity update requirement to `AGENTS.md`
- [x] Add PR checklist item: "Does this web/backend change affect mobile?"
- [x] Maintain `docs/mobile-parity.md` with route-by-route API/UI parity table
- [ ] Add automated contract tests shared by web and mobile clients
- [x] Add smoke fixtures for demo accounts on iOS/Android
- [ ] Tag mobile blockers separately in Linear/GitHub so they do not disappear under web work

---

## Future Product Tracks

### Product Surface & Domain Split
- [ ] Split Malka role/product surfaces into distinct domains when traffic and operations justify it
- [ ] `vrs.malkacomm.com`: MalkaVRS client-facing VRS experience
- [ ] `vri.malkacomm.com`: MalkaVRI client-facing VRI/corporate experience
- [ ] `asltoenglish.malkacomm.com` or similar: distinct Malka ASL-to-English AI lab portal, not integrated into production VRS/VRI until validated
- [ ] `terp.malkacomm.com`: interpreter and captioner portal
- [ ] `admin.malkacomm.com`: admin/superadmin portal
- [ ] Define redirect and session rules between domains so auth remains smooth without mixing product identities
- [ ] Keep Maple whitelabel routing aesthetically and operationally isolated from Malka product domains

### Interpreter Tools
- [ ] Real-time interpreter analytics
- [ ] Interpreter scheduling and shift management
- [ ] Interpreter teaming
- [ ] Interpreter notes/preferences for continuity
- [ ] Interpreter break management
- [ ] Post-call survey
- [ ] Interpreter performance dashboard

### AI & Accessibility
- [ ] Create a distinct Malka-side **ASL to English** portal for experimental automated ASL-to-English and English-to-ASL interpretation testing
- [ ] Keep ASL-to-English AI portal visually and operationally distinct from MalkaVRS/MalkaVRI until it is accurate, safe, consented, and legally cleared for integration
- [ ] ASL recognition research/prototype with video dataset strategy, consent model, evaluation set, and human review loop
- [ ] English-to-ASL generation/reconstruction prototype with clear labeling that output is experimental and not certified interpretation
- [ ] AI interpretation evaluation framework: accuracy, latency, hallucination/error taxonomy, signer diversity, lighting/camera robustness, domain vocabulary, and fallback-to-human thresholds
- [ ] Privacy/security plan for AI video experiments: explicit consent, non-production data boundary, retention rules, redaction/de-identification, and opt-out/delete workflows
- [ ] Human-in-the-loop review interface for comparing model output against certified interpreter/reference translations
- [ ] Integration gate: no production VRS/VRI routing, billing, or compliance dependency until AI meets documented quality, safety, and legal thresholds
- [ ] AI-powered quality monitoring
- [ ] Smart queue routing
- [ ] Automated call categorization
- [ ] Personalized TTS voice/voice cloning
- [ ] Noise suppression

### Call Recording & Compliance
- [ ] Opt-in call recording with all-party consent
- [ ] Video recording for QA/dispute resolution
- [ ] Recording consent flow
- [ ] Encrypted storage
- [ ] Retention policies
- [ ] Redaction tools

### VRI-Specific Corporate Features
- [ ] VRI scheduling portal
- [ ] Pre-scheduled calls with calendar integrations
- [ ] Industry-specific interpreter matching
- [ ] Corporate reporting
- [ ] API access for corporate scheduling integrations
- [ ] Branded VRI waiting room

### Infrastructure & Scale
- [ ] Load balancing across multiple Jitsi shards
- [ ] Geographic redundancy
- [ ] DDoS protection
- [ ] SOC 2 readiness
- [ ] Automated call-flow E2E suite
- [ ] Auto-scaling interpreter pool alerts
- [ ] CDN for static assets and voicemail/profile media

---

## Architecture Notes

**Critical path**: Live media smoke and Maple pilot validation are the next practical blockers. FCC certification remains the longest lead item and should run in parallel.

**Scaling bottleneck**: Redis state externalization is the next gate to horizontal VRS scaling. PostgreSQL runtime alignment is complete enough for pilot validation, but disaster recovery is not complete until offsite base backups and restore drills are proven.

**Current risk concentration**: Real call media, tenant-aware admin moderation, immutable VRS/VRI call tagging, Redis/state externalization, and regulatory readiness.

**Scaling dependency chain**: live media verification -> Redis state externalization -> stateless VRS instances -> multi-JVB -> multi-region redundancy.
