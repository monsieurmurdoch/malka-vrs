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
- [x] Phone number as alternate login identifier
- [x] SMS/OTP verification via Twilio
- [x] Password reset flow

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
- [x] Video mailbox — callers can leave short video message (ASL)
- [x] Missed call → video message prompt
- [x] Voicemail inbox UI (thumbnail grid)
- [x] Video playback with controls
- [x] Voicemail notifications (badge count + live in-app updates)
- [x] Message expiry (auto-delete after configurable period)
- [x] Storage backend: S3-compatible object storage for video files

</details>

<details>
<summary><strong>Engineering Hardening (Phase 2)</strong> — ~30% Complete</summary>

**Security Fixes Applied**
- [x] SQL injection in `getDailyUsageStats` — parameterized query with safe integer cast
- [x] Handoff REST endpoints (`/api/handoff/*`) — added `authenticateUser` middleware
- [x] Interpreter login N+1 — `getInterpreterByEmail()` replaces `getAllInterpreters()` + find
- [x] Speed dial authorization bypass — SQL `WHERE client_id = ?` enforced in DB layer
- [x] Phone number collision — retry loop with `getClientByPhoneNumber` check before assignment
- [x] WebSocket client auth — `handleInterpreterRequest` now requires `authenticated: true`
- [x] WebSocket message size limit — 64KB max, rejects oversized payloads before JSON parse
- [x] `uuid.substr()` → `.substring()` (already correct)

**PostgreSQL Migration**
- [x] Port PostgreSQL migration work into the current modular server on a dedicated hardening branch
- [x] Restore missing DB APIs needed by voicemail, handoff, server state, and queue flows
- [x] Add PostgreSQL 16 to docker-compose test/prod definitions on the hardening branch
- [x] Isolated runtime validation against PostgreSQL: readiness, queue match flow, and core auth/WS paths
- [ ] Merge PostgreSQL hardening branch into `main`
- [ ] Replace SQLite on the production release line after one clean cutover smoke
- [ ] Migrate ops-server from JSON file storage to PostgreSQL
- [ ] Schema migration tooling (`node-pg-migrate`) for future schema changes
- [ ] Add `pg_audit` extension for FCC-compliant audit logging
- [ ] Configure WAL archiving for point-in-time recovery
- [ ] Set up PgBouncer connection pooling (multi-server architecture)

**Server Modularization**
- [x] Split monolithic server.js (~2300 lines) → route modules (auth, client, interpreter, admin, p2p, handoff)

**Structured Logging & Monitoring**
- [x] Structured logger foundation (Pino) with redaction and module-scoped child loggers
- [x] Health/readiness endpoints (`/api/health`, `/api/readiness`, `/health`)
- [x] Prometheus/monitoring foundation (`/metrics` endpoint plus checked-in Prometheus/Grafana config)
- [ ] Replace `console.log` with structured logger (Pino or Winston)
- [ ] Log levels: error, warn, info, debug — configurable via `LOG_LEVEL` env var
- [ ] Structured JSON output in production (parseable by log aggregators)
- [ ] Request ID tracking (correlation ID across services)
- [ ] Log call lifecycle events for debugging (call start, interpreter match, call end)
- [ ] DigitalOcean monitoring integration or external APM (Datadog, New Relic)

**Input Validation Layer**
- [x] Initial Zod validation scaffolding landed on the VRS server
- [ ] Add Zod (or Joi) as validation library across all API endpoints
- [ ] Define request schemas for every POST/PUT/PATCH endpoint
- [ ] Validate all WebSocket message payloads
- [ ] Sanitize user inputs (prevent XSS in stored fields like names, orgs)
- [ ] Return consistent error response format: `{ error: string, code: string, details?: object }`

**Error Handling & Security**
- [ ] Centralized Express error handler (no stack traces in production responses)
- [ ] WebSocket error boundaries (unhandled exceptions must not crash the process)
- [ ] Consistent error response shape across all endpoints
- [ ] Ensure `.env` is in `.gitignore` (verify no secrets in repo history)
- [ ] Add `helmet` CSP headers tuned for Jitsi WebRTC requirements
- [ ] Rate limiting on all auth endpoints (already partially done)
- [ ] Audit npm dependencies for known vulnerabilities (`npm audit`)

**TypeScript Migration**
- [x] ops-server fully migrated to TypeScript
- [ ] Migrate `vrs-server/server.js` → TypeScript (largest risk surface)
- [ ] Migrate `vrs-server/database.js` → TypeScript with typed query results
- [ ] Migrate `vrs-server/lib/*.js` (queue-service, handoff-service, activity-logger)
- [ ] Unify build tooling: single `tsconfig` base shared by vrs-server and ops-server
- [ ] Enable strict mode (`strict: true` in tsconfig) for new files

**Testing**
- [x] Test framework established for `vrs-server` (Jest + ts-jest)
- [x] Initial server coverage for auth, queue, handoff, voicemail, and billing modules
- [ ] Unit tests: queue logic (priority, matching, state transitions)
- [ ] Unit tests: authentication (JWT generation, validation, expiry)
- [ ] Unit tests: billing CDR creation and immutability
- [ ] Integration tests: API endpoint contracts (request → response)
- [ ] Integration tests: WebSocket event sequences (connect → queue → match → call)
- [ ] E2E tests: full call flow (signup → login → dial → interpreter match → call → hangup)
- [ ] CI pipeline: run tests on every PR (extend existing `.github/workflows/ci.yml`)

**Architectural Issues Remaining**
- [ ] Persist in-memory state — queue, connected clients, handoff tokens in Redis or DB (restart = lost state)
- [ ] Tighten CSP — remove `unsafe-inline`/`unsafe-eval` once Jitsi compatibility is resolved

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

## Current Sprint: Release Discipline & UX

> **The product has real feature depth now. The main work is tightening release discipline, validating live flows, and only then widening the surface area.**

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

- [x] Video mailbox — callers leave short video message (ASL) when callee is offline
- [x] Missed call → "leave a video message" prompt
- [x] Voicemail inbox UI — thumbnail grid with sender, timestamp, duration
- [x] Video playback with standard controls
- [x] Voicemail notifications (badge count + live in-app updates)
- [x] Message expiry (auto-delete, default 30 days)
- [x] S3-compatible storage backend for video files

### Auto-Captioning (Speech-to-Text)
> Live captions alongside the interpreter

- [ ] Integrate Deepgram (preferred) or Whisper API for real-time STT
- [ ] Human captioner workflow — hidden transcriber with privacy routing
- [ ] Dual-stream captions (hearing + deaf tracks)
- [ ] Consent management (all parties must consent per FCC rules)
- [ ] Ephemeral-only mode for U.S. VRS (no transcript retention)

### Auth Enhancements
- [x] Phone number as alternate login
- [x] SMS/OTP verification via Twilio
- [x] Password reset flow
- [ ] STS (Speech-to-Speech) mode for speech disabilities

---

## Scale Preparation

### Redis & State Externalization
> All in-memory state must move out of the Node process for horizontal scaling

- [ ] **Add Redis** to Docker Compose stack
- [ ] **Session storage** — move WebSocket client registry (`clients` Map in server.js) to Redis hashes
- [ ] **Queue state** — move queue-service in-memory Map to Redis sorted sets (score = timestamp, for FIFO)
- [ ] **Handoff tokens** — move from in-memory Map to Redis with native TTL (replaces manual cleanup interval)
- [ ] **Interpreter presence** — Redis presence set with heartbeat expiry (replaces WebSocket-only tracking)
- [ ] **Rate limiting backend** — switch from in-memory `express-rate-limit` to Redis store (shared across instances)
- [ ] **Publish/Subscribe** — use Redis Pub/Sub for cross-instance WebSocket broadcasting (queue updates, admin notifications, P2P signaling)
- [ ] This is the prerequisite for running multiple VRS server instances behind a load balancer

### TypeScript Completion
- [ ] Migrate `vrs-server/server.js` → TypeScript
- [ ] Migrate `vrs-server/database.js` → TypeScript with typed query results
- [ ] Migrate `vrs-server/lib/*.js` (queue-service, handoff-service, activity-logger)
- [ ] Unify `tsconfig` base shared by vrs-server and ops-server

### Database Scaling
> PostgreSQL is migrated. This section covers operational scaling.

- [ ] **Connection pooling** — PgBouncer in transaction mode (required for many concurrent WebSocket handlers)
- [ ] **Read replicas** — offload dashboard queries and analytics to read replicas
- [ ] **Partitioning** — partition `calls` table by month, `activity_log` by month (large tables grow fast)
- [ ] **Index tuning** — analyze query plans for hot paths (queue matching, call history, dashboard stats)
- [ ] **Prepared statements** — convert frequent queries to prepared statements for parse overhead reduction
- [ ] **Vacuum / autovacuum tuning** — aggressive autovacuum on `calls` and `activity_log` (high churn tables)
- [ ] Schema migration tooling (`node-pg-migrate`)

### Testing
- [ ] Unit tests: queue logic (priority, matching, state transitions)
- [ ] Unit tests: authentication (JWT generation, validation, expiry)
- [ ] Unit tests: billing CDR creation and immutability
- [ ] Integration tests: API endpoint contracts (request → response)
- [ ] Integration tests: WebSocket event sequences (connect → queue → match → call)
- [ ] E2E tests: full call flow (signup → login → dial → interpreter match → call → hangup)
- [ ] CI pipeline: run tests on every PR (extend existing `.github/workflows/ci.yml`)

### Jitsi Videobridge Scaling
> Single JVB tops out around 200-500 concurrent participants depending on resolution. Need multiple bridges.

- [ ] **Multiple JVB instances** — run N JVB containers, all registered to the same brewery MUC (`jvbbrewery`)
- [ ] **Jicofo bridge selection** — Jicofo already supports selecting least-loaded JVB from brewery; verify config
- [ ] **JVB autoscaling** — scale JVB count based on active participant count (metrics via JMX/REST)
- [ ] **JVB resource limits** — CPU limits per bridge, max participants per bridge, bandwidth caps
- [ ] **Octo mode** — for multi-region: JVB Octo allows bridges in different datacenters to participate in the same conference
- [ ] **Simulcast configuration** — enable Jitsi simulcast (already supported) to reduce per-viewer bandwidth by 60-70%
- [ ] **LastN / Dominant speaker** — configure LastN to limit video streams sent to each participant (critical for large rooms, less so for 1:1 VRS but matters for multi-party)

### Media Compression & Optimization
> Video calls are bandwidth-heavy. Optimize for users on slow connections, mobile, and data caps.

- [ ] **Adaptive bitrate** — ensure Jitsi's built-in adaptive bitrate (VP8/SVC) is configured and working
- [ ] **Resolution caps per call type**:
  - P2P client-to-client: 720p30
  - VRS with interpreter: 720p30 (sign language needs decent resolution)
  - VRI corporate: 1080p30 (premium tier)
- [ ] **Bandwidth estimation** — log client bandwidth on call start; warn if below minimum (~1.5 Mbps for VRS)
- [ ] **Audio-only fallback** — if video bandwidth drops below threshold, degrade gracefully to audio + captions
- [ ] **Video codec tuning** — VP8 default, evaluate VP9/AV1 for bandwidth savings (30-50% less at same quality)
- [ ] **TURN server (coturn)** — deploy for NAT traversal; required for users behind corporate firewalls
- [ ] **Media compression for voicemail** — transcode uploaded video messages to HEVC/H.265 for storage savings (~50% smaller)
- [ ] **Thumbnail generation** — auto-generate video message thumbnails at upload time (ffmpeg)

### Redundancy & Disaster Recovery
> VRS providers handling 911 calls cannot go down. FCC requires high availability.

- [ ] **Multi-region deployment** — active-active or active-passive across two datacenters
- [ ] **Database failover** — PostgreSQL streaming replication with automatic failover (Patroni or managed Postgres)
- [ ] **Redis Sentinel** — automatic failover for Redis (session state must survive Redis node failure)
- [ ] **JVB redundancy** — if one bridge dies, Jicofo routes new calls to remaining bridges; in-progress calls on dead bridge must reconnect
- [ ] **Geographic DNS routing** — route users to nearest datacenter (GeoDNS or anycast)
- [ ] **Automated failover testing** — Chaos Monkey-style: periodically kill a service and verify recovery
- [ ] **Backup strategy**:
  - PostgreSQL: continuous WAL archiving + daily base backups to object storage
  - Redis: RDB snapshots every 5 minutes + AOF for durability
  - Object storage (voicemail): cross-region replication
- [ ] **Recovery targets**: RPO < 1 minute, RTO < 5 minutes for 911-capable system

### Monitoring & Observability for Scale
> You can't scale what you can't measure

- [ ] **Prometheus + Grafana** — metrics collection and dashboards
- [ ] **Key metrics to track**:
  - Active concurrent calls (per JVB, total)
  - Queue depth and average wait time (real-time)
  - WebSocket connections per VRS instance
  - JVB CPU, memory, bandwidth per bridge
  - PostgreSQL query latency (p50, p95, p99)
  - Redis memory usage and hit rate
  - API response time per endpoint
  - Call setup time (dial → interpreter connected)
- [ ] **Alerting rules**:
  - Queue wait time > 5 minutes
  - JVB CPU > 80%
  - Active calls > 80% of capacity
  - Database replication lag > 10 seconds
  - Any service down > 30 seconds
- [ ] **Distributed tracing** — OpenTelemetry for request tracing across VRS → Ops → Twilio services
- [ ] **Call quality metrics** — packet loss, jitter, bitrate per call; flag calls below quality threshold

### Horizontal Scaling (VRS Server)
> Multiple VRS server instances behind a load balancer

- [ ] **Stateless VRS server** — after Redis externalization, any instance can handle any request
- [ ] **Load balancer config** — nginx upstream with multiple VRS server backends
- [ ] **WebSocket sticky sessions** — use Redis adapter or JWT-based reconnection so clients survive instance failure
- [ ] **WebSocket clustering** — `ws` adapter backed by Redis Pub/Sub so messages route to the right instance
- [ ] **Graceful shutdown** — drain WebSocket connections before instance termination (SIGTERM handler)
- [ ] **Health checks** — `/api/health` returns Redis connectivity, DB connectivity, active WebSocket count; load balancer uses this for routing
- [ ] **Auto-scaling group** — CPU/memory-based scaling (Docker Swarm or Kubernetes HPA)
- [ ] **Session affinity for media** — ensure a client's Jitsi connection and VRS signaling land on the same region

---

## Regulatory & Business (Parallel Track)

> Start FCC filing immediately — the 6-12 month timeline is the longest lead item in the entire project.

### FCC Provider Certification (Regulatory — runs in parallel)
- [ ] File application with FCC Consumer & Governmental Affairs Bureau
- [ ] Demonstrate technical capability (911 access, 10-digit numbering, interoperability)
- [ ] Demonstrate financial/operational capability
- [ ] Pass FCC compliance audit
- [ ] **Timeline: 6-12 months from filing**

### Phone Number Provisioning
- [ ] Obtain NANP number blocks via RespOrg partnership
- [ ] Integrate with **iTRS database** (number registration, user validation, cross-provider routing)
- [ ] Build number assignment flow: user signs up → verified → number assigned → iTRS registered
- [ ] Support number porting (users bringing existing numbers)
- [ ] 911/E911 integration (mandatory for VRS providers)

### User Eligibility & Verification
- [ ] Self-certification flow: user attests hearing/speech disability (per FCC Order 11-155)
- [ ] Identity verification: government-issued photo ID upload + verification
- [ ] iTRS database cross-reference (one person = one number, prevent fraud)
- [ ] Annual re-certification system with automated reminders
- [ ] **No audiogram required** — FCC explicitly accepts self-certification
- [ ] Audit trail for all verification events (immutable log)

### 911 Emergency Services
- [ ] E911 location registration for each VRS user
- [ ] Automatic 911 routing through PSAP
- [ ] 911 call priority in interpreter queue (immediate assignment)
- [ ] Compliance with FCC 911 rules for VRS (47 CFR 64.605)

### VRS Billing (TRS Fund)
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

### VRI Billing (Corporate Clients)
- [ ] Corporate account management (org, billing contact, payment method)
- [ ] VRI CDRs tagged at call origination (separate from VRS)
- [ ] Invoice generation (monthly/per-call, configurable per contract)
- [ ] Stripe integration for payment processing
- [ ] Corporate billing dashboard (usage, invoices, payments)
- [ ] **Strict VRS/VRI separation**: enforced at call creation, routing, and billing layers
  - Different app origin = different `call_type` tag
  - Two completely independent billing pipelines
  - Audit trail ensuring no cross-contamination

### Billing Safeguards
- [ ] Call type (`vrs` vs `vri`) set immutably at call creation — cannot be changed
- [ ] Separate billing pipeline processes (VRS → TRS Fund, VRI → corporate invoice)
- [ ] Automated reconciliation checks (flag anomalies)
- [ ] Monthly billing audit report for internal review
- [ ] FCC audit readiness: all records exportable with full chain of custody

### White-Label Runtime
- [ ] `whitelabel.json` configuration (brand name, colors, logos, feature flags)
- [ ] CSS custom properties for runtime theme switching
- [ ] Splash screens, app icons, and marketing assets per tenant
- [ ] Feature flags: enable/disable VRS, VRI, specific languages per tenant
- [ ] Build pipeline: one codebase → multiple branded outputs
- [ ] Tenant isolation in database (schema-per-tenant or row-level with tenant_id)
- [ ] Tenant-specific configuration (languages, interpreter pools, billing)
- [ ] Separate JWT signing keys per tenant
- [ ] Admin super-dashboard for managing all tenants

---

## Future

### Mobile Apps

**US Market (3 Apps)**
| App | Users | Key Features |
|-----|-------|-------------|
| **Malka VRS** | Deaf/HoH users | Video calling, 10-digit number, contacts, call history |
| **Malka Interpreter** | ASL interpreters | Queue management, call acceptance, schedule, teaming |
| **Malka VRI** | Corporate/hearing users | On-demand interpreter, billing dashboard, scheduling |

**Non-US Market (2 Apps)**
| App | Users | Key Features |
|-----|-------|-------------|
| **Malka Client** | Deaf users + corporate users (unified) | Single app, gov't-funded relay, no VRS/VRI distinction |
| **Malka Interpreter** | Interpreters | Same as US interpreter app, different billing backend |

- [ ] React Native (shared codebase with web where possible)
- [ ] Jitsi Meet React Native SDK for video
- [ ] Push notifications for incoming calls (APNs + FCM)
- [ ] Background call handling (CallKit on iOS, ConnectionService on Android)
- [ ] Offline-capable contact list and call history
- [ ] App Store / Play Store submission per brand per market

### Interpreter Tools
- [ ] Real-time interpreter analytics (avg wait time, call duration, utilization)
- [ ] Interpreter scheduling and shift management (enhance existing `interpreter_shifts` table)
- [ ] **Interpreter teaming** — pair junior + senior interpreters on complex calls
- [ ] **Interpreter notes** — leave notes on clients for the next interpreter (preferences, communication style)
- [ ] **Interpreter break management** — enforce mandatory breaks between calls, max consecutive calls
- [ ] **Post-call survey** — optional quality feedback from client (1-5 rating + comment)
- [ ] **Interpreter performance dashboard** — call volume, average handling time, client satisfaction

### AI & Accessibility
- [ ] **ASL recognition (research/prototype)** — long-term goal: real-time sign language → text translation
- [ ] **AI-powered quality monitoring** — sentiment analysis on audio stream, detect frustrated callers
- [ ] **Smart queue routing** — ML model predicts best interpreter match based on history, accent, speciality
- [ ] **Automated call categorization** — AI tags call type (medical, legal, business, personal) for billing
- [ ] **Voice cloning for TTS** — personalized TTS voice for deaf users who want a consistent "their" voice
- [ ] **Noise suppression** — AI audio cleanup for interpreter's environment (typing, background noise)

### Call Recording & Compliance
- [ ] **Call recording** (opt-in, with all-party consent, per FCC/state laws)
- [ ] **Video recording** — record full video call for quality assurance and dispute resolution
- [ ] **Recording consent flow** — in-call prompt: "This call may be recorded. Press X to consent."
- [ ] **Encrypted storage** — recordings encrypted at rest, access logged for audit trail
- [ ] **Retention policies** — auto-delete after regulatory retention period (typically 90 days for VRS)
- [ ] **Redaction tools** — blur/clip sensitive portions of recordings before release

### VRI-Specific Features (Corporate)
- [ ] **VRI scheduling portal** — corporate clients book interpreters for specific dates/times
- [ ] **Pre-scheduled calls** — calendar integration (Google Calendar, Outlook) for planned VRI sessions
- [ ] **Industry-specific interpreter matching** — medical, legal, educational interpreters with verified credentials
- [ ] **Corporate reporting** — monthly usage reports, cost center breakdown, department-level tracking
- [ ] **API access** — REST API for corporate clients to integrate VRI into their own scheduling systems
- [ ] **Waiting room** — branded pre-call lobby for VRI clients (company logo, estimated wait time)

### Infrastructure & Scale
- [ ] Load balancing across multiple Jitsi shards
- [ ] Geographic redundancy (multi-region deployment)
- [ ] DDoS protection, SOC 2 compliance
- [ ] Automated E2E testing suite (call flow tests)
- [ ] **Auto-scaling interpreter pool** — predict demand peaks (business hours, Mondays) and alert standby interpreters
- [ ] **CDN for static assets** — serve video mailbox recordings and profile images via CDN

---

## Architecture Notes

**Critical path**: FCC certification is the longest lead item. File as early as possible — all engineering work proceeds in parallel.

**Scaling bottleneck**: Redis externalization is the gate to handling real production traffic. Current single-server architecture cannot support more than ~100-200 concurrent calls. Redis should be the first scale task after frontend UX is stable.

**Quick wins**: Frontend settings pages, dark mode, and CI pipeline are high-impact, low-risk items that immediately improve the product.

**Current state**: Live production is still the hardened single-server SQLite release line. PostgreSQL is validated on a hardening branch but not cut over to prod yet. The stack is not production-scale yet, but it is strong enough for live smoke testing and internal demos.

**Scaling dependency chain**: PostgreSQL cutover → Redis state externalization → Stateless VRS server → Horizontal scaling → Multi-JVB → Geographic redundancy
