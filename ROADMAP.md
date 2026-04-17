# Malka VRS — Product & Engineering Roadmap

> **Last updated**: April 2026
> **Overall status**: ~80% built. Backend is mature. The remaining gap is primarily frontend UX, production verification, and regulatory/compliance work.

---

## What's Done (Collapsed)

<details>
<summary><strong>Foundation & Infrastructure (Phase 0 + 0.5)</strong> — Complete</summary>

- [x] Webpack dev server serving VRS welcome page
- [x] Backend services running (VRS :3001, Ops :3003)
- [x] Demo accounts seeded (2 clients, 2 interpreters)
- [x] Earth/Moon celestial visuals with NASA imagery
- [x] react-native-ble-plx web build fix (platform-split BleAdapter)
- [x] SCSS build pipeline compiling `_welcome_page.scss` → `css/all.css`
- [x] Demo account login flow verified end-to-end
- [x] Interpreter queue states implemented (in-queue, out-queue, on-break, teamed)
- [x] `docker-compose.prod.yml` — full production stack (nginx + Jitsi + VRS + Ops)
- [x] `Dockerfile.frontend` — multi-stage build
- [x] `deploy/nginx.conf` — reverse proxy with SSL, WebSocket, BOSH routing
- [x] `deploy/setup.sh` — one-command droplet provisioning
- [x] DigitalOcean Droplet provisioned (4GB RAM / 2 vCPU)
- [x] Domain A record pointed to droplet IP
- [x] Production `.env` filled with secrets
- [x] `https://domain` loads VRS welcome page
- [x] WebSocket connections work through nginx

</details>

<details>
<summary><strong>Core VRS Call Flow (Phase 1)</strong> — ~85% Complete</summary>

**Authentication**
- [x] Email + password login with JWT
- [x] JWT-based session management across all three servers
- [x] Role-based access (client, interpreter, admin, superadmin)
- [x] Registration flows for all user types with validation
- [x] Password hashing (bcrypt), rate limiting on auth endpoints
- [ ] Phone number as alternate login identifier
- [ ] SMS/OTP verification via Twilio
- [ ] Password reset flow

**Interpreter Queue**
- [x] WebSocket-based queue with real-time state (available / on-break / in-call / teamed)
- [x] Admin controls: force-break, force-available, team interpreters
- [x] Queue priority logic (longest-waiting caller first)
- [x] Interpreter skills-based routing (language pairs)
- [ ] Queue dashboard for ops team

**VRS Call Lifecycle**
- [x] Client dials 10-digit number → request enters interpreter queue
- [x] Interpreter matched → 3-way Jitsi room created
- [x] In-call controls: mute, hold, transfer, add party
- [x] Call end → CDR (Call Detail Record) written to database
- [x] Multi-party conference support
- [x] P2P direct calls between clients
- [x] Summon interpreter from inside an active room

**UI**
- [x] Celestial animations (earth = client, moon = interpreter)
- [ ] Navy/white color scheme with VRS branding
- [ ] Responsive layout for desktop + tablet
- [ ] Accessibility audit (WCAG 2.1 AA minimum)

</details>

<details>
<summary><strong>Enhanced Communication (Phase 1.5)</strong> — ~50% Complete</summary>

**Contacts & Address Book**
- [x] Contact list UI — searchable list with avatars, phone numbers, last call date
- [x] Contact groups — personal, work, family, favorites (user-defined categories)
- [x] Merge/dedup — detect and merge duplicate contacts
- [x] Block list — block unwanted callers
- [x] Import contacts from JSON/CSV
- [x] Contacts drawer in instant rooms
- [x] Logged-in-only instant-room invite links
- [x] Instant-room invite suggestions
- [x] Speed dial → unified contacts migration
- [ ] Contact cards — tap for full history (calls, messages, notes)
- [ ] Contact sync across devices (web + mobile)
- [ ] Import from Google Contacts API or phone address book

**Text-to-Speech (TTS) / VCO**
- [x] In-call text box — deaf user types, TTS reads aloud
- [x] Voice selection — configurable TTS voice (male/female, speed, pitch)
- [x] Quick phrases — saved phrases for common responses
- [x] VCO (Voice Carry Over) mode
- [ ] STS (Speech-to-Speech) mode — voice modification for speech disabilities

**Call Management**
- [x] Call waiting — accept/reject/hold-and-accept
- [x] Call transfer — mid-call transfer to another number
- [x] 3-way calling — add a third party (conference bridge)
- [x] Do Not Disturb mode
- [x] Recent calls — full call history with filters
- [x] Call back — one-tap redial from call history
- [x] In-call text chat
- [x] Wait screen — position in queue + estimated wait time
- [x] Default display name prefilled from signed-in user
- [ ] Instant-room fast join (skip waiting room)
- [ ] Instant-room media defaults (camera + mic off by default)
- [ ] Remember media permission preference
- [x] Dark mode

**Auto-Captioning**
- [x] Transcription plumbing foundation (subtitle overlay renders caption events)
- [x] Captioner role + auth path
- [x] Manual human caption publishing
- [x] Caption overlay in call (toggle on/off)
- [ ] Human captioner workflow (hidden transcriber with privacy routing)
- [ ] Real-time STT stream (Deepgram / Whisper / Google / AWS)
- [ ] Dual-stream captions (hearing + deaf tracks)
- [ ] Caption language detection
- [ ] Post-call transcript
- [ ] Consent management

**Visual Voicemail**
- [x] Voicemail foundation — DB tables, API routes, Redux/UI shell, recording lifecycle
- [ ] Video mailbox — callers can leave short video message (ASL)
- [ ] Missed call → video message prompt
- [ ] Voicemail inbox UI (thumbnail grid)
- [ ] Video playback with controls
- [ ] Voicemail notifications (badge count + push)
- [ ] Message expiry (auto-delete after configurable period)
- [ ] Storage backend: S3-compatible object storage for video files

</details>

<details>
<summary><strong>Engineering Hardening (Phase 2)</strong> — ~40% Complete</summary>

**Done**
- [x] PostgreSQL migration (database.js fully migrated, `pg` with connection pooling)
- [x] Split monolithic server.js → route modules (auth, client, interpreter, admin, p2p, handoff)
- [x] All 8 security fixes (SQL injection, auth middleware, N+1 queries, WS message limits, etc.)
- [x] Structured logger foundation (Pino with redaction and child loggers)
- [x] Health/readiness endpoints (`/api/health`, `/api/readiness`, `/health`)
- [x] Prometheus/monitoring foundation (`/metrics` + Grafana config)
- [x] Test framework (Jest + ts-jest) with initial coverage
- [x] Initial Zod validation scaffolding
- [x] ops-server TypeScript migration

**Remaining**
- [ ] Persist in-memory state in Redis (queue, clients, handoff tokens)
- [ ] Tighten CSP (remove `unsafe-inline`/`unsafe-eval`)
- [ ] Full test coverage (unit, integration, E2E — see Scale section)
- [ ] vrs-server TypeScript migration
- [ ] Zod validation rollout to all endpoints
- [ ] Centralized Express error handler
- [ ] WebSocket error boundaries
- [ ] Replace remaining `console.log` → Pino
- [ ] CI pipeline (run tests on every PR)
- [ ] `helmet` CSP headers tuned for WebRTC
- [ ] `npm audit` dependency review

</details>

<details>
<summary><strong>White-Label (Phase 5)</strong> — Scaffolding Done</summary>

- [x] Build-time white-label scaffolding (tenant config, runtime, feature flags, branding hooks)
- [ ] `whitelabel.json` configuration (brand name, colors, logos, feature flags)
- [ ] CSS custom properties for runtime theme switching
- [ ] Splash screens, app icons per tenant
- [ ] Feature flags per tenant (VRS/VRI/language toggles)
- [ ] Build pipeline: one codebase → multiple branded outputs
- [ ] Tenant isolation in database (schema-per-tenant or row-level with tenant_id)
- [ ] Tenant-specific configuration (languages, interpreter pools, billing)
- [ ] Separate JWT signing keys per tenant
- [ ] Admin super-dashboard for managing all tenants

</details>

---

## Current Sprint: Frontend UX

> **The backend is mature. The remaining gap is connecting what's built to the user's screen.**

### Client Profile & Settings
- [ ] **Client profile page** in React web — display name, email, organization, VRS phone number, avatar
- [ ] **Account settings** in profile page — connect existing backend (`GET/PUT /api/client/preferences`): DND, dark mode, media defaults
- [ ] **Password change** flow in settings
- [ ] **Notification preferences** — wire backend preferences to React UI

### Interpreter Profile & Controls
- [ ] **Interpreter profile page** in React web — name, email, languages, status, avatar
- [ ] **Availability toggle** — bring the legacy `interpreter-profile.html` queue toggle into React
- [ ] **Interpreter settings** — connect backend (`/api/interpreter/profile`) to React UI

### Contacts Integration
- [ ] **Dial from contacts** — click a contact to initiate a call (not just in prejoin)
- [ ] **Add to contacts from call history** — one-click save from recent calls
- [ ] **Contact cards** — tap contact for full history: calls, messages, notes

### UI Polish
- [ ] **Dark mode** — reduce eye strain; auto-detect system preference
- [ ] **Responsive layout** audit for desktop + tablet
- [ ] **Accessibility audit** (WCAG 2.1 AA minimum — critical for deaf users)

---

## Next Up: Production Verification

### Deployment Verification
- [ ] Verify JVB media flows (UDP 10000) — test a real end-to-end video call
- [ ] Rotate `VRS_BOOTSTRAP_SUPERADMIN_PASSWORD` after first login
- [ ] Automated backups for Docker volumes (vrs-data, ops-data)
- [ ] DigitalOcean monitoring alerts (CPU, memory, disk)
- [ ] Test SSL auto-renewal (certbot cron)

### Code Quality
- [ ] Replace remaining `console.log` with structured Pino logger
- [ ] Roll out Zod validation to all API endpoints + WebSocket payloads
- [ ] Centralized Express error handler (no stack traces in production)
- [ ] WebSocket error boundaries (unhandled exceptions must not crash process)
- [ ] CI pipeline: run tests on every PR (`.github/workflows/ci.yml`)

---

## Near-Term: Features That Close the Product Gap

### Visual Voicemail (Video Messaging)
> Deaf users communicate in sign language — voicemail must be video-based, not audio

- [ ] Video mailbox — callers leave short video message (ASL) when callee is offline
- [ ] Missed call → "leave a video message" prompt
- [ ] Voicemail inbox UI — thumbnail grid with sender, timestamp, duration
- [ ] Video playback with standard controls
- [ ] Voicemail notifications (badge count)
- [ ] Message expiry (auto-delete, default 30 days)
- [ ] S3-compatible storage backend for video files

### Auto-Captioning (Speech-to-Text)
> Live captions alongside the interpreter

- [ ] Integrate Deepgram (preferred) or Whisper API for real-time STT
- [ ] Human captioner workflow — hidden transcriber with privacy routing
- [ ] Dual-stream captions (hearing + deaf tracks)
- [ ] Consent management (all parties must consent per FCC rules)
- [ ] Ephemeral-only mode for U.S. VRS (no transcript retention)

### Auth Enhancements
- [ ] Phone number as alternate login
- [ ] SMS/OTP verification via Twilio
- [ ] Password reset flow
- [ ] STS (Speech-to-Speech) mode for speech disabilities

---

## Scale Preparation

### Redis & State Externalization
> All in-memory state must move out of the Node process for horizontal scaling

- [ ] Add Redis to Docker Compose stack
- [ ] Move WebSocket client registry to Redis hashes
- [ ] Move queue-service state to Redis sorted sets
- [ ] Move handoff tokens to Redis with native TTL
- [ ] Redis presence set for interpreter tracking
- [ ] Redis-backed rate limiting (shared across instances)
- [ ] Redis Pub/Sub for cross-instance WebSocket broadcasting

### TypeScript Completion
- [ ] Migrate `vrs-server/server.js` → TypeScript
- [ ] Migrate `vrs-server/database.js` → TypeScript with typed query results
- [ ] Migrate `vrs-server/lib/*.js` (queue-service, handoff-service, activity-logger)
- [ ] Unify `tsconfig` base shared by vrs-server and ops-server

### Database Scaling
- [ ] PgBouncer connection pooling
- [ ] Index tuning for hot paths
- [ ] Partition `calls` and `activity_log` tables by month
- [ ] Schema migration tooling (`node-pg-migrate`)

### Testing
- [ ] Unit tests: queue logic, auth, billing CDRs
- [ ] Integration tests: API endpoint contracts
- [ ] Integration tests: WebSocket event sequences
- [ ] E2E tests: full call flow (signup → dial → interpreter match → call → hangup)

### Jitsi Scaling
- [ ] Multiple JVB instances registered to brewery MUC
- [ ] JVB autoscaling based on participant count
- [ ] Simulcast configuration for bandwidth reduction
- [ ] TURN server (coturn) for NAT traversal

### Media Optimization
- [ ] Adaptive bitrate verification
- [ ] Resolution caps per call type (P2P: 720p, VRS: 720p, VRI: 1080p)
- [ ] Audio-only fallback for low bandwidth
- [ ] VP9/AV1 codec evaluation

### Redundancy & Disaster Recovery
- [ ] Multi-region deployment
- [ ] PostgreSQL streaming replication + failover
- [ ] Redis Sentinel for automatic failover
- [ ] JVB redundancy (Jicofo reroutes on bridge failure)
- [ ] Backup strategy: WAL archiving + daily base backups
- [ ] Recovery targets: RPO < 1 min, RTO < 5 min

---

## Regulatory & Business (Parallel Track)

> Start FCC filing immediately — the 6-12 month timeline is the longest lead item in the entire project.

### FCC Provider Certification
- [ ] File application with FCC Consumer & Governmental Affairs Bureau
- [ ] Demonstrate technical capability (911, 10-digit numbering, interoperability)
- [ ] Demonstrate financial/operational capability
- [ ] Pass FCC compliance audit

### Phone Number Provisioning
- [ ] Obtain NANP number blocks via RespOrg partnership
- [ ] Integrate with iTRS database (registration, validation, cross-provider routing)
- [ ] Number assignment flow: sign up → verified → number assigned → iTRS registered
- [ ] Number porting support
- [ ] 911/E911 integration

### User Eligibility & Verification
- [ ] Self-certification flow (per FCC Order 11-155)
- [ ] Identity verification (government-issued photo ID)
- [ ] iTRS cross-reference (one person = one number)
- [ ] Annual re-certification with automated reminders
- [ ] Immutable audit trail for all verification events

### Billing Infrastructure
- [ ] CDR schema (call_id, type, caller, interpreter, start/end, duration, numbers, billing_status)
- [ ] CDR immutability (append-only)
- [ ] Monthly CDR aggregation pipeline
- [ ] TRS Fund submission formatting
- [ ] Reconciliation system
- [ ] Per-minute rate tiers (FCC sets rates annually)
- [ ] VRI billing: corporate accounts, invoice generation, Stripe integration
- [ ] Strict VRS/VRI separation at call creation, routing, and billing layers

### White-Label Runtime
- [ ] Runtime theme switching (CSS custom properties)
- [ ] Tenant isolation in database
- [ ] Per-tenant JWT signing keys
- [ ] Admin super-dashboard for all tenants

---

## Future

### Mobile Apps
| App | Users | Key Features |
|-----|-------|-------------|
| **Malka VRS** | Deaf/HoH users | Video calling, 10-digit number, contacts, call history |
| **Malka Interpreter** | ASL interpreters | Queue management, call acceptance, schedule, teaming |
| **Malka VRI** | Corporate/hearing users | On-demand interpreter, billing dashboard, scheduling |

- [ ] React Native shared codebase
- [ ] Jitsi Meet React Native SDK for video
- [ ] Push notifications (APNs + FCM)
- [ ] Background call handling (CallKit / ConnectionService)
- [ ] Offline-capable contacts and call history
- [ ] App Store / Play Store submission

### Interpreter Tools
- [ ] Real-time interpreter analytics (wait time, duration, utilization)
- [ ] Shift management (enhance `interpreter_shifts` table)
- [ ] Interpreter teaming (junior + senior pairing)
- [ ] Interpreter notes on clients (preferences, communication style)
- [ ] Break management (mandatory breaks, max consecutive calls)
- [ ] Post-call survey (client quality feedback)
- [ ] Performance dashboard

### AI & Accessibility
- [ ] ASL recognition (research/prototype)
- [ ] AI-powered quality monitoring (sentiment analysis)
- [ ] Smart queue routing (ML interpreter matching)
- [ ] Automated call categorization for billing
- [ ] Voice cloning for personalized TTS
- [ ] Noise suppression for interpreter environment

### VRI-Specific (Corporate)
- [ ] VRI scheduling portal
- [ ] Pre-scheduled calls (calendar integration)
- [ ] Industry-specific interpreter matching (medical, legal, educational)
- [ ] Corporate reporting (usage, cost centers, department tracking)
- [ ] REST API for corporate client integration
- [ ] Branded waiting room

### Call Recording & Compliance
- [ ] Call recording (opt-in, all-party consent)
- [ ] Recording consent flow (in-call prompt)
- [ ] Encrypted storage with audit trail
- [ ] Retention policies (auto-delete per regulation)
- [ ] Redaction tools

---

## Architecture Notes

**Critical path**: FCC certification is the longest lead item. File as early as possible — all engineering work proceeds in parallel.

**Scaling bottleneck**: Redis externalization is the gate to handling real production traffic. Current single-server architecture supports ~100-200 concurrent calls. Redis should be the first scale task after frontend UX is stable.

**Quick wins**: Frontend settings pages, dark mode, and CI pipeline are high-impact, low-risk items that immediately improve the product.
