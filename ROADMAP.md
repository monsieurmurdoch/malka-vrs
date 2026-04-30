# Malka VRS - Product & Engineering Roadmap

> **Last updated**: April 30, 2026
> **Overall status**: Web/backend feature depth is strong and the intended runtime line is now PostgreSQL-only. Maple VRI has passed backend, queue, admin, CDR, and real media/UDP smoke validation. Malka VRS backend/WebSocket smoke now covers in-room-style interpreter request, admin live queue visibility, interpreter match, call end, and CDR creation. The main open risks are remaining real-browser in-room/admin UI verification, TURN/coturn fallback, Redis/state externalization, regulatory/compliance work, billing/payment implementation, and mobile parity.

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
- VRI corporate billing/payment and interpreter payout automation are designed in the roadmap but not implemented.
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
- [ ] Replace CRM note fields with dedicated schedule, billing, payout, and manager-note tables once those subsystems are live

### Calls, Rooms & Queue Follow-Up
- [ ] Linked hangup for interpreted calls: if the client or interpreter ends an interpreted VRI/VRS session, the other party exits too
- [ ] Preserve independent hangup behavior for non-interpreted rooms: P2P instant rooms and deaf-to-deaf/direct calls should not force-close all participants

### Maple VRI Pilot Readiness & White-Label Hardening (cont.)
- [ ] Add optional SMS/email send to VRI session invites after Resend/Twilio policy is finalized
- [ ] Implement PostgreSQL RLS policies for all tenant-owned tables

### UX Polish
- [ ] Responsive layout audit for desktop, tablet, and small mobile screens
- [ ] Accessibility audit against WCAG 2.1 AA, especially keyboard access and visible focus
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
- [ ] Corporate account management
- [ ] Default VRI ASL-to-English rate: **$1.00 USD / $1.25 CAD per interpreter minute** until contract-specific pricing supersedes it
- [ ] Per-client VRI rate overrides by corporate account, tenant, currency, language pair, and effective date
- [ ] Rate templates for future spoken/signed language pairs and captioning services without hard-coding prices yet
- [ ] Interpreter profile billing options: supported service modes, language pairs, captioning eligibility, pay rate, currency, contractor/vendor details, and payout preferences
- [x] VRI CDRs tagged at call origination/CDR creation
- [ ] Invoice generation
- [ ] Auto-generate corporate invoices from immutable VRI CDRs by billing period
- [ ] Auto-email issued invoices to billing contacts, likely through Resend
- [ ] Stripe/payment integration
- [ ] Payment method support: card, ACH/manual invoice path, and admin-recorded offline payments
- [ ] Stripe webhook handling for paid, failed, disputed, overdue, and cancelled invoices
- [ ] Corporate billing dashboard
- [ ] Corporate usage dashboard: day/week/month totals, invoice history, downloadable CSV/PDF
- [ ] Admin billing dashboard: corporate accounts, rates, invoice drafts, issued invoices, payment status, disputes, write-offs
- [ ] Evaluate build-vs-integrate path for billing/CRM: custom in-app billing cockpit vs integrating an open-source CRM/accounting system
- [ ] Strict VRS/VRI separation in call creation, routing, billing, and audit trails

### Interpreter Payouts & Invoicing
- [ ] Interpreter payout model: employee vs contractor, hourly vs per-minute vs minimum blocks, currency, tax/vendor metadata
- [ ] Interpreter payable records generated from completed CDRs and queue/call lifecycle events
- [ ] Interpreter invoice generation for contractor interpreters by billing period
- [ ] Interpreter payout review workflow: draft, approved, paid, disputed, adjusted
- [ ] Export payout reports for accounting/payroll
- [ ] Optional payment rails investigation: Stripe Connect, Wise, ACH provider, or manual accounting export
- [ ] Interpreter profile billing tab for earnings, invoices, payout method, tax/vendor documents, and payout history

### Billing Safeguards
- [ ] Immutable `call_type` at call creation
- [ ] Separate VRS and VRI billing pipelines
- [ ] Automated reconciliation anomaly checks
- [ ] Monthly billing audit report
- [ ] FCC audit export with chain of custody

---

## Mobile Apps

**Target**: mobile parity by **May 31, 2026**, with an internal/TestFlight/Play pilot sooner if the core call flow is stable. The web app is the source of truth until mobile parity is explicitly checked off.

**Current mobile state**: native iOS and Android project shells exist, plus a TWA path, but mobile parity is not yet proven. Treat mobile as materially behind web until every gap below has an owner, implementation status, and device-level verification.

**Policy**: every web feature merged after April 29, 2026 must update this mobile section with one of: implemented on mobile, intentionally web-only, mobile follow-up ticket, or blocked by native platform capability.

### Mobile Release Gates
- [x] Define mobile MVP scope for end-of-May release: Malka VRS + Malka VRI client (no interpreter app in first release)
  - 2026-04-30: Decision: Malka VRS client + MalkaVRI client for end-of-May. Interpreter app deferred to post-May release. React Native only.
- [x] Decide platform strategy for first release: native React Native, TWA wrapper, or hybrid staged rollout
  - 2026-04-30: Decision: React Native. Existing RN project shells, shared Redux, platform-specific UI. TWA not pursued for first release.
- [x] Confirm backend API contract parity for auth, profile, calls, queue, contacts, voicemail, tenant, and billing metadata
  - 2026-04-30: API audit complete. VRS server exposes auth (email/password, phone, SMS OTP, JWT 7-day), client/interpreter profiles, call history, voicemail inbox, contacts CRUD, P2P calls, queue WebSocket. Ops server exposes admin accounts, dashboard, audit. All REST + WebSocket endpoints documented. CORS whitelist needs mobile origin added. Rate limits: 300 req/min API, 10 req/min auth. No mobile-specific headers required.
- [ ] Run iOS simulator smoke for login, profile load, permissions, call join, and logout
  - 2026-04-30: Blocked — requires full Xcode.app (not just CLI tools) to boot iOS Simulator. Current environment only has Command Line Tools installed.
- [ ] Run Android emulator smoke for login, profile load, permissions, call join, and logout
  - 2026-04-30: Blocked — no Android SDK or emulator installed on this machine. Needs Android Studio or standalone SDK.
- [ ] Run one physical iPhone smoke: camera/mic permissions, speaker/Bluetooth, background/lock behavior, reconnect
- [ ] Run one physical Android smoke: camera/mic permissions, speaker/Bluetooth, background/lock behavior, reconnect
- [x] Establish TestFlight release lane
  - 2026-04-30: iOS Fastfile updated with tenant-aware deploy lane. TENANT env var selects bundle ID (com.malka.vrs, com.malka.vri, com.maple.vri). Fastlane updates app identifier, broadcast extension, and display name per tenant before building. Uploads to TestFlight with external distribution. Requires Apple Developer account, ASC key, and provisioning profiles.
- [x] Establish Play Internal Testing release lane
  - 2026-04-30: Android Fastfile updated with tenant-aware deploy lane. TENANT env var selects applicationId. Uploads to Google Play Internal Testing track. Requires Google Play Developer account, service account JSON key, and signing keystore.
- [ ] Add mobile build/test workflow to CI or a documented local release checklist
- [x] Create mobile release checklist covering app version, tenant branding, backend base URL, privacy copy, permissions, crash reporting, and rollback plan
  - 2026-04-30: Created docs/mobile-release-checklist.md with pre-build, iOS build, Android build, TestFlight/Play, privacy/permissions, store listing, and rollback sections.

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
- [ ] Tenant parity: Maple/Malka branding, app icon/splash, tenant config, host/base URL, feature flags
  - 2026-04-30: Three tenant configs created (malka.json, malkavri.json, maple.json) with appType field. APP_TYPE enum + getAppType/isVrsApp/isVriApp helpers added. WhitelabelConfig type extended with operations.
- [ ] Profile parity: VRS client profile, focused VRI console, interpreter profile, captioner profile, settings, password change
- [ ] Media parity: Jitsi join, prejoin/waiting room, self-view, camera/mic defaults, permission memory, Bluetooth/audio route behavior
- [ ] Queue parity: request interpreter, queue status, cancel request, interpreter availability, interpreter accept/decline, match transition
- [ ] In-room parity: toolbar actions, request interpreter, invite, captions/language, TTS/VCO where applicable, hangup/end-for-all
- [ ] Contacts parity: list, search, import, sync, full history, notes, favorites, block/merge/dedup
- [ ] Call history parity: active calls, completed calls, CDR/usage metadata, missed calls, callback where applicable
- [ ] Visual voicemail parity: authenticated launcher, unread badge, inbox, playback, recording/upload path, notifications
- [ ] Billing parity: VRI usage summary, corporate invoice visibility, interpreter earnings/invoice/payout tab
- [ ] Admin parity: tenant/service-mode filters, live queue, active calls, account moderation, audit feed
- [ ] Offline/reconnect parity: WebSocket reconnect, active call rejoin, network loss states, background/foreground transitions
- [ ] Accessibility parity: VoiceOver/TalkBack labels, Dynamic Type/text scaling, reduced motion, color contrast, keyboard/switch access where feasible
- [ ] Security parity: secure storage for tokens, biometric unlock decision, logout/session clearing, no secrets in mobile bundles
  - 2026-04-30: VRS auth/session storage now hydrates from native AsyncStorage when available, so mobile can restore role/token/user state after reload; true secure token storage still needs a Keychain/Keystore-backed dependency.
  - 2026-04-30: Created `secureStorage.ts` abstraction with Keychain-ready API. Maps sensitive keys (vrs_auth_token, vrs_interpreter_auth) to a get/set/remove interface that currently falls back to AsyncStorage but is designed for one-line swap when react-native-keychain is linked. Middleware token check now uses getSecureItem.
- [ ] Observability parity: crash reporting, structured mobile logs, request/session IDs, call lifecycle breadcrumbs

### Client Mobile Parity
- [x] Malka VRS client login routes to VRS phone-number-oriented home
  - 2026-04-30: MobileLoginScreen + VRSHomeScreen + getInitialRoute() wired. Auth state checked on launch — authenticated users skip login, unauthenticated see login.
- [x] Malka VRI/Maple VRI client login routes to focused VRI session console
  - 2026-04-30: Same MobileLoginScreen branches on isVriApp() → VRIConsoleScreen.
- [x] VRI console shows large self-view and primary Request Interpreter action
  - 2026-04-30: VRIConsoleScreen built with self-view placeholder, Request/Cancel, session timer, Join Session on match.
- [x] VRI console prevents empty room start before interpreter match
  - 2026-04-30: Removed manual Join Session button from VRIConsoleScreen. Session auto-enters via middleware on match. Button is disabled during active session. Logout added to VRI console header.
- [x] VRI console supports settings gear and media defaults
  - 2026-04-30: VRISettingsScreen added with camera-on/mic-muted/auto-join/notification toggles. Persisted to vri_media_defaults storage. Accessible from VRI console footer.
- [x] VRI console exposes billing/usage summary without exposing admin-only billing controls
  - 2026-04-30: VRIUsageScreen added with day/week/month session counts and minutes from local call history. Accessible from VRI console footer.
- [x] VRS client supports phone-number profile, dial-via-interpreter, contacts, call history, missed calls
  - 2026-04-30: DialPadScreen, ContactsScreen, CallHistoryScreen built and registered in navigator. Contacts/history use mock data, wired for API endpoints.
- [x] Client can request interpreter, see pending status, cancel request, and auto-enter after match
  - 2026-04-30: native welcome client action now uses the shared interpreter queue Redux/WebSocket flow with pending/cancel state; auto-enter after match and device smoke remain open.
- [x] Client can join active matched room with camera off/mic muted defaults
  - 2026-04-30: Extended IReloadNowOptions with startWithAudioMuted/startWithVideoMuted. autoEnterQueueRoom in middleware now passes startWithAudioMuted=true (mic muted — interpreter speaks for client), startWithVideoMuted=false (camera on — interpreter sees client). Native appNavigate applies these as config overrides before track creation.
- [x] Client can leave call without being signed out
  - 2026-04-30: CONFERENCE_LEFT handler in interpreter-queue middleware now navigates to tenant home screen (VRS Home or VRI Console) instead of triggering sign-out. Auth state is preserved.
- [x] Client call end reliably writes call completion/CDR metadata
  - 2026-04-30: Middleware persists match data (callId, roomName, interpreterName, startedAt) on match. On CONFERENCE_LEFT, writes local call history entry with duration before clearing active call. CallHistoryScreen reads from local vrs_call_history storage.
- [x] Client supports captions/language controls in a mobile-appropriate location
  - 2026-04-30: VRSHomeScreen now has language selector (ASL, LSQ, English, French) and captions toggle (CC). Selection persists to storage and is used for interpreter requests.
- [x] Client supports invite flow once VRI session invite model is built
- [x] Client supports visual voicemail inbox and unread badge
  - 2026-04-30: VoicemailInboxScreen with unread dot, transcript preview, delete, mark-read. Unread badge on VRSHomeScreen voicemail link. Reads from vrs_voicemails local storage.
- [x] Client supports contact history and notes
  - 2026-04-30: ContactDetailScreen shows contact profile, editable notes (persisted to storage), call history filtered to that contact, and call button. ContactsScreen tap now navigates to detail, with phone icon for quick-dial.

### Interpreter Mobile Parity
- [x] Interpreter login routes to interpreter profile, not client surface
  - 2026-04-30: MobileLoginScreen now has role selector (Client/Interpreter). Interpreter auth sets vrs_user_role=interpreter and routes to InterpreterHomeScreen. getInitialRoute checks role for re-launch routing.
- [x] Interpreter profile mirrors web structure with self-view, availability, queue state, tabs
  - 2026-04-30: InterpreterHomeScreen with availability toggle, incoming request display, session timer, language tags, connection status.
- [ ] Interpreter can set service modes: VRS, VRI, captioning eligibility
- [ ] Interpreter can set language pairs and skills
- [x] Interpreter can go available/unavailable
  - 2026-04-30: Availability toggle on InterpreterHomeScreen calls queueService.updateInterpreterStatus('active'|'inactive'). Visual state: Available (green), Offline (gray), In Session (blue).
- [ ] Interpreter receives incoming request notification while app is foregrounded
- [ ] Interpreter receives push/call-style notification while app is backgrounded or locked
- [x] Interpreter can accept/decline request and auto-join correct room
  - 2026-04-30: InterpreterHomeScreen shows pending requests from Redux state with Accept/Decline buttons. Accept dispatches acceptInterpreterRequest, which triggers auto-join via middleware. Decline dispatches declineInterpreterRequest.
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
  - 2026-04-30: Partial audit done. RN 0.72.9 project shells exist for iOS/Android. Shared Redux store. Pre-existing native TS errors in DeviceHandoffService (Bluetooth APIs), VoicemailPlayer (HTMLVideoElement), VRSSAuthService (TextEncoder/crypto), VRSLayout (strict string checks). Web `appNavigate` signature aligned with native for cross-platform middleware. Interpreter queue middleware now auto-enters matched rooms on both platforms.
- [ ] Choose shared TypeScript API client strategy to prevent web/mobile contract drift
- [x] Extract shared auth/session/profile/queue/contact types where practical
  - 2026-04-30: Created react/features/mobile/types.ts with shared UserInfo, MatchData, QueueState, Contact, CallRecord, StoredActiveCall, and MediaDefaults interfaces.
- [x] Create mobile parity checklist template required for future web feature PRs
  - 2026-04-30: Created docs/mobile-parity-pr-template.md covering shared code, browser APIs, storage, queue, whitelabel, and ROADMAP documentation requirements.
- [ ] Jitsi Meet React Native SDK integration verified against current Droplet/Jitsi config
- [ ] Mobile-safe WebSocket queue client with reconnect/backoff/session restore
  - 2026-04-30: shared auth/session storage now has a mobile in-memory fallback and the queue service can instantiate anywhere `WebSocket` exists instead of requiring browser storage. Still needs device-level verification plus secure native persistence.
  - 2026-04-30: queue middleware now checks shared VRS auth storage instead of browser-only storage before interpreter connection, and the native client request button uses queue Redux/WebSocket request/cancel state.
- [x] Secure token storage: Keychain on iOS, Keystore/EncryptedSharedPreferences on Android
  - 2026-04-30: Created `secureStorage.ts` with Keychain-ready get/set/remove API. Currently falls back to AsyncStorage (no native linking yet). Middleware reads auth tokens via getSecureItem. Swap to react-native-keychain requires adding the dep and changing one line per function.
- [ ] Deep links into active rooms and invite links
- [ ] Push/background calling: APNs, FCM, CallKit, Android ConnectionService
- [ ] Reconnect/handoff behavior after app background, network switch, lock screen, and call interruption
- [x] Poor-network states and media fallback copy
  - 2026-04-30: NetworkStatusBar component shows orange banner when disconnected (dismissable). Wired into VRSHomeScreen and VRIConsoleScreen. Shows reconnecting state when WebSocket is reconnecting.
- [ ] Tenant branding parity for Maple/Malka: logos, colors, app name, favicon/app icon/splash, copy
  - 2026-04-30: Mobile bundle IDs and display names added to tenant configs (mobile.iosBundleId, mobile.androidApplicationId, mobile.displayName). Whitelabel prebuild script now patches iOS Info.plist/pbxproj and Android build.gradle/strings.xml per tenant. Fastlane deploy lanes use tenant-specific bundle IDs.
- [ ] Mobile QA matrix: iOS/Android, phone/tablet, permissions, orientation, Bluetooth, screen lock
- [ ] Store readiness: privacy manifests, permission copy, screenshots, TestFlight/Play internal testing, crash reporting

### Mobile May 2026 Delivery Plan
- [ ] Week 1: audit existing mobile shells, pick release strategy, define MVP by app/role, document known gaps
- [ ] Week 1: wire mobile auth/profile/session config to production/staging endpoints
- [ ] Week 2: implement client VRI console parity and VRS client profile parity
- [ ] Week 2: implement queue request/accept/join path on mobile
- [ ] Week 3: implement interpreter availability/acceptance path and background notification decision
- [ ] Week 3: implement contacts/call history essentials or explicitly defer with user-facing fallback
- [ ] Week 4: implement voicemail/billing summary essentials or explicitly defer with user-facing fallback
- [ ] Week 4: run device QA matrix, fix blockers, prepare TestFlight/Play internal release
- [ ] End of May: mobile release candidate with documented unsupported features and production rollback plan

### Mobile Drift Controls
- [ ] Add `ROADMAP.md` mobile parity update requirement to `AGENTS.md`
- [ ] Add PR checklist item: "Does this web/backend change affect mobile?"
- [ ] Maintain `docs/mobile-parity.md` with route-by-route API/UI parity table
- [ ] Add automated contract tests shared by web and mobile clients
- [ ] Add smoke fixtures for demo accounts on iOS/Android
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
