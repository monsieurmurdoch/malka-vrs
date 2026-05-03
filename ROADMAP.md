# Malka VRS - Product & Engineering Roadmap

> **Last updated**: May 2, 2026
> **Overall status**: Web/backend feature depth is strong and the intended runtime line is now PostgreSQL-only. Maple VRI has passed backend, queue, admin, CDR, and real media/UDP smoke validation. Malka VRS backend/WebSocket smoke now covers in-room-style interpreter request, admin live queue visibility, interpreter match, call end, and CDR creation. Native mobile now has working Android/iOS client-app build lanes for MalkaVRS, MalkaVRI, and MapleVRI, production-backed auth/API/queue wiring, tenant-specific app IDs, iOS simulator install flow, Android 16 KB-compatible debug/release artifacts, and tenant visual polish. The main open risks are remaining real-browser in-room/admin UI verification, TURN/coturn fallback, Redis/state externalization, regulatory/compliance work, live Stripe/accounting configuration, physical-device mobile media/call smoke, TestFlight/Play release lanes, push/background calling, crash reporting, final secure-storage linkage, and contract/type hardening across web, native, and backend boundaries.

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
- Mobile apps now have the main client-side parity foundation in place; physical-device smoke, release lanes, push/background call behavior, crash reporting, and store-readiness work remain before broad launch.

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

### Validation & Error Handling
- [x] Expanded Zod validation to every POST/PUT/PATCH endpoint
- [x] Added WebSocket envelope and payload validation
- [x] Sanitized stored user-generated fields touched by auth, profile, contact, admin, TTS, billing, and queue flows
- [x] Added centralized Express error normalization with no production stack/message leakage for 500s
- [x] Standardized error shape across VRS, ops, and Twilio responses: `{ error, code, details? }`
- [x] Confirmed WebSocket message handling catches unhandled message errors and reports safe `INTERNAL_ERROR` payloads
- [x] Completed npm audit review and upgrade plan in `docs/npm-audit-review.md`

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

### Roadmap Items Moved From Open Tracks

> Moved here on May 1, 2026 so open roadmap sections only show unfinished work.

##### Mobile Current Parity Gap Summary Completed

- [x] Authentication parity: email/password, phone/password, SMS OTP login, role routing, JWT refresh-on-401, expiry clearing, tenant routing, and backend-backed password reset request
- [x] Tenant parity: Maple/Malka tenant config, branding hooks, host/base URL resolution, feature flags, and native queue/API domain resolution
- [x] Profile parity: VRS client profile refresh, focused VRI console, interpreter profile refresh, settings/preferences, and password reset/change paths
- [x] Media parity: Jitsi navigation path, prejoin/waiting-room path, VRI self-view camera preview, media defaults, permission memory, and native audio route infrastructure
- [x] Queue parity: request interpreter, queue status, cancel request, interpreter availability, accept/decline, match transition, and reconnect/backoff infrastructure
- [x] In-room parity: toolbar/Jitsi navigation, request-interpreter state, invite/deep-link support, captions/language controls, TTS/VCO hooks, and hangup lifecycle wiring
- [x] Contacts parity: list, search, API sync, detail, notes, favorites, contact-history linkage, import/block/merge/dedup backend endpoints, and local cache fallback
- [x] Call history parity: active/completed call storage, API-backed history, CDR/usage metadata, missed-call display state, add-to-contacts, and callback metadata logging
- [x] Visual voicemail parity: authenticated launcher, unread badge, inbox, seen/delete APIs, playback URL handling, recording/upload backend path, and notification-ready state
- [x] Billing parity: VRI usage summary, corporate billing-summary hook, and interpreter earnings/stats API-backed tab
- [x] Admin parity: native admin remains intentionally out of MVP; admin moderation is responsive web/tablet scope
- [x] Offline/reconnect parity: WebSocket reconnect/backoff, active-call local persistence, network status states, and app background lifecycle hooks
- [x] Accessibility parity: VoiceOver/TalkBack labels, visible role semantics, Dynamic Type-compatible native text, contrast pass, and focusable controls
- [x] Security parity: demo JWT removal, token expiry clearing, logout/session clearing, optional Keychain/Keystore-backed secure storage when linked, and no secrets in mobile bundles
- [x] Observability parity: structured mobile logs, session IDs, app-state breadcrumbs, call lifecycle breadcrumbs, and backend log flush endpoint

##### Admin Portal Refinement Completed
- [x] Expand interpreter admin profile into a full CRM-style record: password reset, company/alternate email, schedule/billing/payment notes, manager comments, language permissions, and VRI/VRS queues
- [x] Add corporate client account creation/editing from tenant admin and superadmin contexts
- [x] Make interpreter/client/account CSV exports available from roster tables
- [x] Clarify admin dashboard labels: Available Interpreters are staff ready for matching; Waiting Client Requests are clients currently waiting in queue
- [x] Tighten admin live refresh for interpreter availability and queue-state changes so manual refresh is not normally needed
- [x] Replace CRM note fields with dedicated schedule, billing, payout, utilization, and manager-note tables once those subsystems are live


##### UX Polish Completed
- [x] Responsive layout audit for desktop, tablet, and small mobile screens
- [x] Accessibility audit against WCAG 2.1 AA, especially keyboard access and visible focus
- [x] Notification preferences UI wired to backend preferences
- [x] Add-to-contacts from call history when a call exposes a phone number

##### Regulatory & Business Track / VRS Billing Completed
- [x] CDR immutability: append-only after call end

##### Regulatory & Business Track / VRI Billing Completed
- [x] Corporate account management
- [x] Default VRI ASL-to-English rate: **$1.00 USD / $1.25 CAD per interpreter minute** until contract-specific pricing supersedes it
- [x] Per-client VRI rate overrides by corporate account, tenant, currency, language pair, and effective date
- [x] Rate templates for future spoken/signed language pairs and captioning services without hard-coding prices yet
- [x] VRI CDRs tagged at call origination/CDR creation
- [x] Billing architecture decision: use Stripe Billing for corporate VRI usage, invoices, payment collection, and customer portal unless a later accounting constraint forces another provider
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

##### Regulatory & Business Track / Interpreter Payouts & Invoicing Completed
- [x] Interpreter profile billing backend options: supported service modes, language pairs, pay rate, currency, employee/contractor status, vendor/tax details, and payout preferences
- [x] Interpreter payout model backend: hourly, per-minute, minimum blocks, service-mode/language differentials, currency, and effective dates
- [x] Interpreter payable records generated from completed CDRs and approved invoice items
- [x] Interpreter invoice generation for contractor interpreters by billing period, with draft review before payment
- [x] Interpreter payout review workflow backend: draft, approved, paid, with room for failed/disputed/adjusted/reversed follow-up statuses
- [x] Export payout reports for accounting/payroll

##### Regulatory & Business Track / Interpreter Scheduling & Utilization Completed
- [x] Dedicated interpreter schedule tables: availability windows, scheduled shifts, time-off/unavailable blocks, recurring schedule rules, tenant/service-mode/language eligibility, and manager overrides
- [x] Dedicated billing tables: corporate accounts/rate tiers/invoices plus `billing_invoice_items`, `billing_payments`, `billing_adjustments`, and `stripe_webhook_events`
- [x] Dedicated payout tables: `interpreter_pay_rates`, `interpreter_payables`, `interpreter_payout_batches`, `interpreter_payout_items`, `interpreter_payout_adjustments`, `interpreter_vendor_profiles`, `interpreter_contractor_invoices`, and `interpreter_contractor_invoice_items`
- [x] Dedicated schedule/utilization tables: `interpreter_schedule_windows`, `interpreter_availability_sessions`, `interpreter_break_sessions`, `interpreter_shift_targets`, `interpreter_shift_exceptions`, and `interpreter_utilization_summaries`
- [x] Dedicated manager-note tables: structured notes linked to interpreter/client/corporate account, note type, visibility, author, timestamp, audit trail, and follow-up date
- [x] Availability session tracking foundation: when an interpreter goes available, unavailable, on break, busy/in-call, or offline, record start/end timestamps with source and reason
- [x] Break tracking foundation: paid/unpaid break classification, break reason, break duration, break frequency, and compliance/manager review flags
- [x] Utilization metrics backend foundation: scheduled, signed-on, available, in-call, break, idle minutes, and utilization rate
- [x] Utilization/audit foundation: manager notes, schedule changes, payout batch approvals/payments, credit notes, webhook replay counts, and billing audit events


##### Mobile Apps / Mobile Release Gates Completed
- [x] Define mobile MVP scope for end-of-May release: three client apps only — MalkaVRS, MalkaVRI, and MapleVRI
  - 2026-05-01: Current mobile stage is exactly three client apps. MalkaVRI and MapleVRI share the same VRI client codepath and differ by tenant skin/config. No interpreter, captioner, or terp portal app is part of this stage.
- [x] Decide platform strategy for first release: native React Native, not TWA-first
  - 2026-04-30: Existing RN shells/shared Redux path selected for the first release; TWA remains a fallback or later packaging option.
- [x] Mobile email/password auth uses production client endpoint instead of demo tokens
  - 2026-05-01: Mobile login calls `/api/auth/client/login`, stores real JWT metadata, and routes by app type to MalkaVRS, MalkaVRI, or MapleVRI. Interpreter accounts are intentionally rejected in the current client-app builds.
- [x] Native launch routing waits for AsyncStorage hydration before choosing login vs app route
- [x] Native API and queue clients resolve tenant domains instead of falling back to `localhost`
- [x] VRI self-view uses native camera preview and stores permission/default metadata
- [x] Contacts list/detail use production contacts APIs with local cache fallback
- [x] Call history uses `/api/client/call-history` with local cache fallback
- [x] VRI usage summary aggregates `/api/client/call-history` with local cache fallback
- [x] Voicemail inbox uses production inbox/unread/seen/delete/playback URL APIs with local cache fallback
- [x] Mobile VRI pre-match invite flow prepares/shareable session links and attaches invite tokens to the interpreter request
  - 2026-05-01: VRIConsoleScreen can prepare a VRI invite before a room exists, share it via native share sheet, persist pending invite tokens, and send those tokens with the eventual VRI queue request so guests wait until the interpreter-connected room is live.
- [x] Mobile VRI tenant accent colors use whitelabel theme in console/settings/usage controls
- [x] Native app identifiers configured for initial internal-test apps
  - 2026-05-01: Android product flavors and iOS build-setting defaults added for `com.malkacomm.vrs`, `com.malkacomm.vri`, and `com.maplecomm.vri`; store-side Apple/Google records still require developer account access.
- [x] iOS simulator build/install lane for all three client apps
  - 2026-05-02: `scripts/mobile/install-ios-simulator-variants.sh` bundles React Native JS, builds the Jitsi iOS simulator app three times, generates tenant-specific iOS app icons, and installs MalkaVRS, MalkaVRI, and MapleVRI on the booted iPhone simulator.
- [x] Android flavor app targets for all three client apps
  - 2026-05-02: Android product flavors exist for `malkaVrs`, `malkaVri`, and `mapleVri` with tenant-specific app IDs, app names, default URLs, and native BuildConfig tenant/app-type metadata.
- [x] Mobile tenant visual polish for first app-review/testing pass
  - 2026-05-02: VRI mobile console uses tenant mobile background colors, MapleVRI uses a darker burgundy mobile background, the VRI share action uses a standard upward/outward share glyph, and MalkaVRI has tenant-specific iOS and Android launcher artwork from the existing MalkaVRI asset.
- [x] Resolve Android 16 KB native-library alignment before Android 15+/new-device release confidence
  - 2026-05-01: MalkaVRS, MalkaVRI, and MapleVRI debug APKs now build arm64-only under React Native 0.77.3, AGP 8.7.2, NDK r28, updated WebRTC, and updated JSC native artifacts. `zipalign -P 16 -c -v 4` passes for all three, and `npm run mobile:check-android-16kb -- --all <apk>` reports `arm64-v8a: 13/13 compatible`.
  - 2026-05-02: MalkaVRS, MalkaVRI, and MapleVRI release AABs also build successfully and pass `npm run mobile:check-android-16kb -- --all <aab>` with `arm64-v8a: 13/13 compatible`.
- [x] Confirm backend API contract parity for auth, profile, calls, queue, contacts, voicemail, tenant, and billing metadata
  - 2026-05-02: Client auth, phone/SMS, password-reset request, JWT refresh, tenant queue URL selection, native route hydration, profile refresh, contacts/detail, call history, VRI usage, voicemail inbox, billing summary, settings/preferences, mobile log upload, and VRI invite preparation all call production-backed contracts. Physical-device media/call smoke and store-release evidence remain tracked as separate release gates below.
- [x] Add mobile build/test workflow to CI or a documented local release checklist
  - 2026-05-02: `docs/mobile-builds.md` documents local Android and iOS build/install lanes, app IDs, Android 16 KB alignment checks, and store record prerequisites.
- [x] Create mobile release checklist covering app version, tenant branding, backend base URL, privacy copy, permissions, crash reporting, and rollback plan
  - 2026-05-02: Initial checklist lives in `docs/mobile-builds.md`; store execution and crash-reporting vendor setup remain open release work below.

##### Mobile Apps / Mobile Parity Track Completed
- [x] Mobile QA matrix document created
- [x] Audit current React Native/iOS/Android/TWA project health against current web/backend contracts
- [x] Choose shared TypeScript API client strategy to prevent web/mobile contract drift
- [x] Extract shared auth/session/profile/queue/contact types where practical
- [x] Create mobile parity checklist template required for future web feature PRs
- [x] Mobile-safe WebSocket queue client with reconnect/backoff/session restore
- [x] Deep links into active rooms and invite links
- [x] Tenant branding parity for Maple/Malka: logos, colors, app name, favicon/app icon/splash, copy

##### Mobile Apps / Mobile May 2026 Delivery Plan Completed
- [x] Week 1: audit existing mobile shells, pick release strategy, define MVP by app/role, document known gaps
- [x] Week 1: wire mobile auth/session config to production/staging endpoints
- [x] Week 2: implement client VRI console parity and VRS client profile parity
- [x] Week 2: implement client queue request/join path on mobile
- [x] Week 3: implement contacts/call history essentials or explicitly defer with user-facing fallback
- [x] Week 4: implement voicemail/billing summary essentials or explicitly defer with user-facing fallback

##### Mobile Apps / Mobile Drift Controls Completed
- [x] Add `ROADMAP.md` mobile parity update requirement to `AGENTS.md`
- [x] Add PR checklist item: "Does this web/backend change affect mobile?"
- [x] Maintain `docs/mobile-parity.md` with route-by-route API/UI parity table
- [x] Add smoke fixtures for demo accounts on iOS/Android

##### Mobile Apps / Mobile App Targets Completed
- [x] Malka VRS Client: Deaf/HoH users, VRS phone-number flow, interpreter-assisted calls, contacts, call history
- [x] Malka VRI Client: corporate VRI mode for Malka tenant/accounts with VRI permissions
- [x] Maple VRI Client: same VRI client app as MalkaVRI with Maple tenant skin/config
- [x] Keep interpreter/captioner native apps out of current mobile scope; interpreter and captioner workflows remain web/admin operational surfaces for this stage
- [x] Do not expose an interpreter, captioner, or terp portal app in the current mobile stage

## Immediate Open Work

### Release Readiness & Operations
- [ ] Define explicit go/no-go gates for Maple VRI pilot, Malka VRI beta, Malka VRS beta, mobile beta, and full production
- [ ] Stand up a production-like staging environment with separate database, tenant config, Stripe test mode, Twilio test/sandbox path, and seeded Maple/Malka accounts
- [ ] Document environment/base-URL policy for web, native, API, queue, ops, and Twilio so local/staging builds cannot silently fall back to production domains
- [ ] Create incident runbooks: restart VRS/ops/Twilio/Jitsi safely, clear stale queue items, verify media health, verify CDR integrity, and communicate user impact
- [ ] Create support/admin runbooks for stale calls, interpreter no-answer/decline loops, stuck VRI invites, account lockouts, voicemail playback failures, and billing disputes
- [ ] Define data retention/privacy matrix for CDRs, audit logs, voicemail media, captions/transcripts, VRI invite links, chat/TTS messages, and mobile logs
- [ ] Remediate npm audit findings on a dependency-upgrade branch, prioritizing Twilio server high-severity findings before production Twilio use

### Codebase Maintainability & Contract Hardening
- [ ] Decide the remaining JS/TS migration boundary for VRS server routes, WebSocket handlers, queue service, validation, and compiled compatibility bridges
- [ ] Replace high-risk `any`/`@ts-ignore` usage in mobile navigation, queue middleware, and shared tenant/config helpers with typed route params and typed event payloads
- [ ] Create a single typed contract source for API responses and WebSocket events, then consume it from web, native, server tests, and smoke scripts
- [ ] Add runtime contract tests for shared API client methods and queue WebSocket sequences so mobile/web drift is caught before manual QA
- [ ] Decide whether checked-in `dist` files remain part of the deployment contract; if yes, add a CI check that source and generated output are in sync
- [ ] Add a fast local verification target for common app work that runs the smallest useful subset before full CI (`tsc` slice, changed tests, smoke syntax checks)

### Admin Portal Refinement
- [ ] Real-browser verify top-level admin dashboard navigation after replacing static buttons with hash-routing handlers
### Calls, Rooms & Queue Follow-Up
- [ ] Linked hangup for interpreted calls: if the client or interpreter ends an interpreted VRI/VRS session, the other party exits too
- [ ] Preserve independent hangup behavior for non-interpreted rooms: P2P instant rooms and deaf-to-deaf/direct calls should not force-close all participants

### Maple VRI Pilot Readiness & White-Label Hardening (cont.)
- [ ] Add optional SMS/email send to VRI session invites after Resend/Twilio policy is finalized
- [ ] Implement PostgreSQL RLS policies for all tenant-owned tables

### UX Polish (Deferred Until Billing Backend Complete)
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

### Testing
- [ ] Unit tests: queue priority, matching, state transitions
- [ ] Unit tests: JWT generation, validation, expiry
- [ ] Unit tests: billing CDR creation and immutability
- [ ] Integration tests: API endpoint contracts
- [ ] Integration tests: WebSocket event sequences
- [ ] Shared contract tests: validate mobile/web API client expectations against backend response schemas and seed fixtures
- [ ] Shared WebSocket contract tests: auth, request, queued, invite, match, cancel, hangup, reconnect, and error payloads
- [ ] E2E tests: signup/login/dial/match/call/hangup
- [ ] E2E tests: Maple VRI request-interpreter pilot path
- [ ] CI: require tests/build/smokes on every PR before merge
- [ ] Load test 5, 10, and 25 concurrent interpreted calls with admin dashboard open and DB/Jitsi metrics captured
- [ ] Soak test multi-hour queue churn: request, cancel, accept, decline, hangup, reconnect, and stale-session cleanup
- [ ] Failure-mode tests: interpreter disconnect mid-call, client disconnect mid-call, DB transient error, WebSocket reconnect, JVB restart, and Twilio unavailable

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
- [ ] Monthly CDR aggregation pipeline
- [ ] TRS Fund submission formatting
- [ ] Reconciliation against payments/disputes
- [ ] Per-minute rate table management

### VRI Billing
- [ ] Stripe product/price catalog: VRI interpreter-minute meter, tenant/currency-specific prices, and per-client override metadata
- [ ] Strict VRS/VRI separation in call creation, routing, billing, and audit trails

### Interpreter Payouts & Invoicing
- [ ] Interpreter payable records generated from queue lifecycle events, availability sessions, break sessions, scheduled shifts, adjustments, and manager approvals
- [ ] Stripe Connect decision: use Connect for automated contractor payouts only after legal/accounting confirms platform liability, contractor onboarding, tax reporting, and supported countries; keep payroll/accounting export path for employees
- [ ] Optional payment rails investigation: Stripe Connect, Wise, ACH provider, or manual accounting export
- [ ] Interpreter profile billing tab for earnings, invoices, payout method, tax/vendor documents, and payout history

### Interpreter Scheduling & Utilization
- [ ] Interpreter self-scheduling UI: interpreters can view required/target weekly hours, signed-on hours so far, scheduled hours remaining, and add/adjust availability to fill gaps
- [ ] Admin scheduling UI: weekly roster by tenant, service mode, language, interpreter, coverage gaps, overstaffing, and pending interpreter schedule changes
- [ ] Utilization metrics expansion: queue acceptance rate, decline/no-answer rate, after-call/admin time, and SLA impact
- [ ] Weekly utilization dashboard for interpreters: scheduled hours, signed-on hours, hands-up hours, in-call hours, breaks, remaining target hours, and earnings/payables preview
- [ ] Weekly utilization dashboard for admin: coverage by hour, fill-rate, interpreter adherence, break patterns, productivity, queue SLA impact, and exportable payroll/accounting summary
- [ ] Service-mode utilization split: VRS vs VRI vs captioning availability and in-call minutes, with tenant/language filters

### Billing Safeguards
- [ ] Immutable `call_type` at call creation
- [ ] Separate VRS and VRI billing pipelines
- [ ] Automated reconciliation anomaly checks
- [ ] Monthly billing audit report
- [ ] FCC audit export with chain of custody

---

## Mobile Apps

**Target**: mobile parity by **May 31, 2026**, with an internal/TestFlight/Play pilot sooner if the core call flow is stable. The web app is the source of truth until mobile parity is explicitly checked off.

**Current mobile state**: native iOS and Android project shells exist for the current three client apps: MalkaVRS, MalkaVRI, and MapleVRI. MalkaVRI and MapleVRI share the same VRI client experience with tenant-specific branding/config. The mobile parity branch now has production-backed React Native screens for client login, VRS home, VRI console, contacts, call history, voicemail, tenant config, native storage helpers, deep-link scaffolding, QA docs, and CI typecheck wiring. Client email-password auth, client phone-password auth, SMS OTP request/verify, backend password-reset request, JWT refresh-on-401, and native cold-start route hydration are wired. Native API and queue clients resolve tenant domains instead of localhost. VRI self-view uses a native camera preview. Contacts/detail/call-history/VRI-usage/voicemail/profile/settings paths call production APIs with local cache fallback where appropriate. Android flavors and iOS simulator variants are configured for MalkaVRS, MalkaVRI, and MapleVRI; Android debug/release artifacts are 16 KB-compatible for arm64 devices; iOS simulator variants install successfully; and tenant branding now covers app ID/name, core colors, MapleVRI mobile background, share glyph, and MalkaVRI launcher artwork. Remaining release gates are physical iOS/Android media/call smoke, TestFlight/Play release lanes, crash-reporting vendor setup, push/background call-style notifications, final store privacy checks, and native hardware-backed secure-storage dependency linkage if final release requires it.

**Policy**: every web feature merged after April 29, 2026 must update this mobile section with one of: implemented on mobile, intentionally web-only, mobile follow-up ticket, or blocked by native platform capability.

### Mobile Release Gates
- [ ] Run iOS simulator smoke for login, profile load, permissions, call join, and logout
  - 2026-04-30: Blocked locally by missing full Xcode simulator setup.
  - 2026-05-01: Still blocked locally: `xcrun simctl` is unavailable and `xcodebuild` reports Command Line Tools instead of full Xcode.
  - 2026-05-01 setup update: iOS build identifiers are prepared in repo and full Xcode 26.4.1 exists at `/Applications/Xcode.app`; simulator builds are still blocked until the Xcode license is accepted with sudo and Xcode is selected or `DEVELOPER_DIR` is used.
  - 2026-05-01 setup update 2: Full Xcode is now selected, first launch completed, and available iOS 26.1 simulators are visible via `simctl`; actual app simulator smoke remains open.
  - 2026-05-02 update: All three iOS simulator variants build, install, and launch on the iPhone simulator. Visual smoke verified MapleVRI tenant background/share icon and MalkaVRI icon generation. Full login/permissions/call/logout simulator smoke remains open.
- [ ] Run Android emulator smoke for login, profile load, permissions, call join, and logout
  - 2026-04-30: Blocked locally by missing Android SDK/emulator setup.
  - 2026-05-01: Still blocked locally: `adb` is not installed and Android Gradle cannot run because Java is missing.
  - 2026-05-01 setup update: Android Studio, JDK 17, `adb`, command-line tools, Android 34 platform, and build-tools 33.0.2 are installed. Emulator/system-image install is still blocked by sdkmanager's Android Emulator zip-read error; Android Gradle flavor verification now reaches dependency resolution and is blocked by missing `com.github.jiangdongguo.AndroidUSBCamera:libuvc:3.3.3`.
  - 2026-05-01 setup update 2: Android Studio installed the emulator binary under `$HOME/Library/Android/sdk`, but no AVD/system image is present yet. Gradle still reaches dependency resolution and remains blocked by missing `com.github.jiangdongguo.AndroidUSBCamera:libuvc:3.3.3`.
  - 2026-05-01 setup update 3: Pixel 9 AVD boots, `:app:assembleMalkaVrsDebug` succeeds, `app-malkaVrs-debug.apk` installs as `com.malkacomm.vrs`, Metro loads after excluding the duplicate nested SDK checkout, and the native shell reaches the simplified MalkaVRS client login. Keep open for login/call/logout smoke.
  - 2026-05-02 update: Android product flavors/assets now cover MalkaVRS, MalkaVRI, and MapleVRI. VRI console UI changes are shared React Native and apply on Android; MalkaVRI Android launcher icons now use the existing MalkaVRI artwork. Keep open for login/profile/permissions/call/logout emulator smoke.
- [ ] Run one physical iPhone smoke: camera/mic permissions, speaker/Bluetooth, background/lock behavior, reconnect
- [ ] Run one physical Android smoke: camera/mic permissions, speaker/Bluetooth, background/lock behavior, reconnect
- [ ] Establish TestFlight release lane
- [ ] Establish Play Internal Testing release lane

### Mobile App Targets
- [ ] Admin Mobile/Tablet: decide whether admin is responsive web only or gets native moderation surfaces
- [ ] Non-US Malka Client: unified relay/VRI client where local market does not distinguish VRS/VRI

### Current Parity Gap Summary

All current parity-gap summary items have been moved to Completed Work. Remaining mobile work is tracked below as app-target, client flow, device-smoke, release-lane, and store-readiness tasks.

### Client Mobile Parity
All completed client mobile parity items have been moved to Completed Work. Remaining client-app work is now tracked as device smoke, release-lane, store-readiness, and deferred native interpreter/captioner scope below.

### Deferred Interpreter/Captioner Native Scope
- [ ] Revisit interpreter/captioner native apps only after MalkaVRS, MalkaVRI, and MapleVRI client apps are production-stable
- [ ] Keep interpreter/captioner workflow parity on responsive web/admin surfaces for now

### Admin Mobile / Tablet Parity
- [ ] Decide whether admin moderation is responsive web/tablet only for May
- [ ] Admin can view tenant-scoped live queue on tablet/mobile
- [ ] Admin can view active calls and call details
- [ ] Admin can moderate client/interpreter/captioner permissions
- [ ] Admin can view billing dashboard summaries when billing launches
- [ ] Admin can view audit feed and account changes
- [ ] Superadmin tenant management remains desktop-only or gets explicit mobile scope

### Mobile Parity Track
- [ ] Jitsi Meet React Native SDK integration verified against current Droplet/Jitsi config
- [ ] Secure token storage: link and verify hardware-backed Keychain on iOS and Keystore/EncryptedSharedPreferences on Android; document any fallback as a release exception
- [ ] Tenant/domain safety: verify MalkaVRS, MalkaVRI, MapleVRI, staging, and local builds never use the wrong production API or queue domain
- [ ] Push/background calling: APNs, FCM, CallKit, Android ConnectionService
- [ ] Reconnect/handoff behavior after app background, network switch, lock screen, and call interruption
- [ ] Poor-network states and media fallback copy
- [ ] Mobile QA matrix executed: iOS/Android, phone/tablet, permissions, orientation, Bluetooth, screen lock
- [ ] Store readiness: privacy manifests, permission copy, screenshots, TestFlight/Play internal testing, crash reporting
  - 2026-04-30: iOS privacy manifest added; store/testflight/play execution remains open.

### Mobile May 2026 Delivery Plan
- [ ] Week 3: validate mobile client request flows against web interpreter/admin acceptance workflow and decide background notification scope for clients
- [ ] Week 4: run device QA matrix, fix blockers, prepare TestFlight/Play internal release
- [ ] End of May: mobile release candidate with documented unsupported features and production rollback plan

### Mobile Drift Controls
- [ ] Add automated contract tests shared by web and mobile clients
- [ ] Add typed WebSocket event fixtures shared by server tests and React Native queue middleware
- [ ] Add CI/lint guard for new mobile-critical APIs requiring updates to `react/features/mobile/types.ts` and `docs/mobile-parity.md`
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
