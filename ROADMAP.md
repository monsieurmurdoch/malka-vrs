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
- [x] Verify demo account login flow end-to-end (client + interpreter)
- [ ] Test interpreter queue states: in-queue, out-queue, on-break, teamed

---

## Phase 0.5: Production Deployment (DigitalOcean)
> Goal: Get the app live on a real URL for testing
> Status: **In Progress (live on test domain)**

### Infrastructure
- [x] `docker-compose.prod.yml` — full production stack (nginx + Jitsi + VRS + Ops)
- [x] `Dockerfile.frontend` — multi-stage build (webpack frontend → vrs-server container)
- [x] `deploy/nginx.conf` — reverse proxy with SSL, WebSocket, BOSH routing
- [x] `deploy/setup.sh` — one-command droplet provisioning (Docker, firewall, certbot)
- [x] Provision DigitalOcean Droplet (4GB RAM / 2 vCPU minimum)
- [x] Point domain A record to droplet IP
- [x] Fill `.env` with production secrets (JWT, superadmin password, Jitsi secrets)
- [ ] Run `deploy/setup.sh` — installs Docker, gets SSL cert, launches stack
- [x] Verify: `https://your-domain.com` loads VRS welcome page
- [x] Verify: WebSocket connections work through nginx
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
- [x] Email + password login (already wired)
- [ ] Phone number as alternate login identifier
- [ ] SMS/OTP verification via Twilio (or similar)
- [ ] JWT-based session management across all three servers
- [ ] Password reset flow

### 1B — Interpreter Queue System
- [ ] WebSocket-based queue with real-time state (available / on-break / in-call / teamed)
- [ ] Admin controls: force-break, force-available, team interpreters
- [x] Queue priority logic (longest-waiting caller first)
- [x] Interpreter skills-based routing (language pairs)
- [ ] Queue dashboard for ops team

### 1C — VRS Call Lifecycle
- [x] Client dials 10-digit number → request enters interpreter queue
- [ ] Interpreter matched → 3-way Jitsi room created (caller video, interpreter video, callee audio)
- [ ] In-call controls: mute, hold, transfer, add party
- [ ] Call end → CDR (Call Detail Record) written to database
- [ ] Multi-party conference support (Jitsi-native)
- [x] P2P direct calls between clients (no interpreter, standard Jitsi flow)
- [ ] Summon interpreter from inside an active room (bottom toolbar button with waiting/accepted state)

### 1D — UI Polish
- [ ] Navy/white color scheme with VRS branding
- [x] Celestial animations (earth = client, moon = interpreter) with smooth tab transitions
- [ ] Responsive layout for desktop + tablet
- [ ] Accessibility audit (WCAG 2.1 AA minimum — critical for deaf users)

---

## Phase 1.5: Enhanced Communication & UX
> Goal: Core user-facing features that make MalkaVRS a real phone replacement

### 1E — Visual Voicemail (Video Messaging)
> Deaf users communicate in sign language — voicemail must be video-based, not audio

- [ ] **Video mailbox** — callers can leave a short video message (ASL) when callee is offline
- [ ] **Missed call → video message prompt** — if callee doesn't answer, offer "leave a video message"
- [ ] **Voicemail inbox UI** — thumbnail grid of video messages with sender name, timestamp, duration
- [ ] **Video playback** — click-to-play with standard controls (pause, scrub, replay)
- [ ] **Voicemail notifications** — badge count + push notification when new message arrives
- [ ] **Message expiry** — auto-delete after configurable period (default 30 days) for storage management
- [ ] **Admin voicemail settings** — max message length, retention policy, storage quotas per user
- [ ] Storage backend: object storage (S3-compatible) for video files, metadata in DB

### 1F — Auto-Captioning (Speech-to-Text)
> Live captions alongside the interpreter — for transparency, accessibility, and call documentation

- [ ] **Real-time STT stream** — integrate Whisper API (OpenAI), Google Speech-to-Text, or AWS Transcribe
- [ ] **Caption overlay in call** — live text feed overlaid on the video call (toggle on/off)
- [ ] **Dual-stream captions** — separate caption tracks for hearing party (audio → text) and deaf party (interpreter signs → optional text summary)
- [ ] **Caption language detection** — auto-detect spoken language and transcribe accordingly
- [ ] **Post-call transcript** — save full transcript alongside CDR for call history
- [ ] **Transcript search** — search across past call transcripts (useful for business/legal calls)
- [ ] **Opt-in consent management** — all parties must consent to captioning/recording per FCC rules
- [ ] Fallback for poor audio: indicate "audio unclear" rather than garbled text

### 1G — Contacts & Address Book
> Users need a real address book, not just speed dial

- [ ] **Contact list UI** — searchable, alphabetical list with avatars, phone numbers, last call date
- [ ] **Accessible contacts section in instant rooms** — easy-to-open contacts drawer/panel while joining or inviting
- [ ] **Logged-in-only instant-room invite links** — invite links should require platform auth before joining
- [ ] **Instant-room invite suggestions** — suggest recent/favorite friends to invite right after room creation
- [ ] **Import contacts** — from CSV/VCARD upload, Google Contacts API, or phone address book (mobile)
- [ ] **Contact groups** — personal, work, family, favorites (user-defined categories)
- [ ] **Merge/dedup** — detect and merge duplicate contacts (same phone number or email)
- [ ] **Contact cards** — tap a contact to see full history: calls, messages, notes
- [ ] **Block list** — block unwanted callers; blocked calls go straight to rejected (no voicemail)
- [ ] **Contact sync** — keep contacts synced across devices (web + mobile)
- [ ] Enhance existing speed dial → unified contacts system (speed dial entries become "favorites")

### 1H — Text-to-Speech (TTS) Fallback
> For calls without an interpreter, or when a deaf user prefers typing

- [ ] **In-call text box** — deaf user types a message, TTS reads it aloud to the hearing party
- [ ] **Voice selection** — configurable TTS voice (male/female, speed, pitch)
- [ ] **Quick phrases** — saved phrases for common responses ("Hold please", "Let me transfer you")
- [ ] **STS (Speech-to-Speech) mode** — for users with speech disabilities who want their own voice modified
- [ ] This is a separate call mode from VRS (no interpreter) — routed as VCO (Voice Carry Over)

### 1I — Call Management & UX
> Features users expect from any modern phone system

- [ ] **Call waiting** — visual + vibration alert for incoming call while on another call; accept/reject/hold-and-accept
- [ ] **Call transfer** — deaf user asks interpreter to transfer to another number mid-call
- [ ] **3-way calling** — add a third party to an existing call (conference bridge)
- [ ] **Do Not Disturb mode** — suppress incoming calls; callers go straight to voicemail
- [x] **Recent calls** — full call history with filters (missed, outgoing, incoming, duration)
- [x] **Call back** — one-tap redial from call history or missed calls
- [ ] **In-call text chat** — side panel for text communication during video call (supplement to signing)
- [x] **Wait screen** — show position in queue + estimated wait time while waiting for interpreter
- [ ] **Instant-room fast join** — allow instant rooms to skip the waiting room when appropriate
- [ ] **Instant-room media defaults** — camera + mic off by default when quick-joining an instant room
- [ ] **Remember media permission preference** — avoid repeated prompts where the browser/app allows it
- [ ] **Dark mode** — reduce eye strain during long calls; auto-detect system preference

---

## Phase 2: Engineering Hardening
> Goal: Production-grade code quality, security, and observability

### Security Fixes Applied ✅
- [x] SQL injection in `getDailyUsageStats` — parameterized query with safe integer cast
- [x] Handoff REST endpoints (`/api/handoff/*`) — added `authenticateUser` middleware
- [x] Interpreter login N+1 — `getInterpreterByEmail()` replaces `getAllInterpreters()` + find
- [x] Speed dial authorization bypass — SQL `WHERE client_id = ?` enforced in DB layer
- [x] Phone number collision — retry loop with `getClientByPhoneNumber` check before assignment
- [x] WebSocket client auth — `handleInterpreterRequest` now requires `authenticated: true`
- [x] WebSocket message size limit — 64KB max, rejects oversized payloads before JSON parse
- [x] `uuid.substr()` → `.substring()` (already correct)

### Remaining Architectural Issues
- [x] **Split monolithic server.js** (~2300 lines) → route modules (auth, client, interpreter, admin, p2p, handoff)
- [ ] **Persist in-memory state** — queue, connected clients, handoff tokens in Redis or DB (restart = lost state)
- [ ] **Tighten CSP** — remove `unsafe-inline`/`unsafe-eval` once Jitsi compatibility is resolved
- [ ] **Automated tests** — zero test coverage currently (see 2F below)

### 2A — PostgreSQL Migration
- [ ] Port PostgreSQL migration commit (`1eb7cc1` from `claude/intelligent-edison`) into current modular server cleanly
- [ ] Rework `database.js` for PostgreSQL (`pg` with connection pooling) without regressing queue/P2P/handoff fixes now on `main`
- [ ] Convert all queries: `?` → `$1`, date functions, booleans, JSONB, `ON CONFLICT`
- [ ] Add PostgreSQL 16 to docker-compose (test + prod) with health checks on the current branch topology
- [ ] Replace `sqlite3` dependency with `pg` on `main`
- [ ] End-to-end verify: auth, speed dial, missed calls, queue `targetPhone`, handoff, admin stats, P2P calling
- [ ] Schema migration tooling (`node-pg-migrate`) for future schema changes
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

## Phase 2.5: Scale & High Availability
> Goal: Support thousands of concurrent video calls with redundancy and compression
> Current state: single-server (SQLite, single JVB, in-memory state). Not production-scale.

### 2G — Redis & State Externalization
> All in-memory state must move out of the Node process for horizontal scaling

- [ ] **Add Redis** to Docker Compose stack
- [ ] **Session storage** — move WebSocket client registry (`clients` Map in server.js) to Redis hashes
- [ ] **Queue state** — move queue-service in-memory Map to Redis sorted sets (score = timestamp, for FIFO)
- [ ] **Handoff tokens** — move from in-memory Map to Redis with native TTL (replaces manual cleanup interval)
- [ ] **Interpreter presence** — Redis presence set with heartbeat expiry (replaces WebSocket-only tracking)
- [ ] **Rate limiting backend** — switch from in-memory `express-rate-limit` to Redis store (shared across instances)
- [ ] **Publish/Subscribe** — use Redis Pub/Sub for cross-instance WebSocket broadcasting (queue updates, admin notifications, P2P signaling)
- [ ] This is the prerequisite for running multiple VRS server instances behind a load balancer

### 2H — Horizontal Scaling (VRS Server)
> Multiple VRS server instances behind a load balancer

- [ ] **Stateless VRS server** — after Redis externalization, any instance can handle any request
- [ ] **Load balancer config** — nginx upstream with multiple VRS server backends
- [ ] **WebSocket sticky sessions** — use Redis adapter or JWT-based reconnection so clients survive instance failure
- [ ] **WebSocket clustering** — `ws` adapter backed by Redis Pub/Sub so messages route to the right instance
- [ ] **Graceful shutdown** — drain WebSocket connections before instance termination (SIGTERM handler)
- [ ] **Health checks** — `/api/health` returns Redis connectivity, DB connectivity, active WebSocket count; load balancer uses this for routing
- [ ] **Auto-scaling group** — CPU/memory-based scaling (Docker Swarm or Kubernetes HPA)
- [ ] **Session affinity for media** — ensure a client's Jitsi connection and VRS signaling land on the same region

### 2I — Jitsi Videobridge Scaling
> Single JVB tops out around 200-500 concurrent participants depending on resolution. Need multiple bridges.

- [ ] **Multiple JVB instances** — run N JVB containers, all registered to the same brewery MUC (`jvbbrewery`)
- [ ] **Jicofo bridge selection** — Jicofo already supports selecting least-loaded JVB from brewery; verify config
- [ ] **JVB autoscaling** — scale JVB count based on active participant count (metrics via JMX/REST)
- [ ] **JVB resource limits** — CPU limits per bridge, max participants per bridge, bandwidth caps
- [ ] **Octo mode** — for multi-region: JVB Octo allows bridges in different datacenters to participate in the same conference
- [ ] **Simulcast configuration** — enable Jitsi simulcast (already supported) to reduce per-viewer bandwidth by 60-70%
- [ ] **LastN / Dominant speaker** — configure LastN to limit video streams sent to each participant (critical for large rooms, less so for 1:1 VRS but matters for multi-party)

### 2J — Media Compression & Optimization
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

### 2K — Database Scaling
> SQLite → PostgreSQL is in Phase 2A. This section covers operational scaling of Postgres.

- [ ] **Connection pooling** — PgBouncer in transaction mode (required for many concurrent WebSocket handlers)
- [ ] **Read replicas** — offload dashboard queries and analytics to read replicas
- [ ] **Partitioning** — partition `calls` table by month, `activity_log` by month (large tables grow fast)
- [ ] **Index tuning** — analyze query plans for hot paths (queue matching, call history, dashboard stats)
- [ ] **Prepared statements** — convert frequent queries to prepared statements for parse overhead reduction
- [ ] **Vacuum / autovacuum tuning** — aggressive autovacuum on `calls` and `activity_log` (high churn tables)

### 2L — Redundancy & Disaster Recovery
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

### 2M — Monitoring & Observability for Scale
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

### 7A — Interpreter Tools
- [ ] Real-time interpreter analytics (avg wait time, call duration, utilization)
- [ ] Interpreter scheduling and shift management (enhance existing `interpreter_shifts` table)
- [ ] **Interpreter teaming** — pair junior + senior interpreters on complex calls
- [ ] **Interpreter notes** — leave notes on clients for the next interpreter (preferences, communication style)
- [ ] **Interpreter break management** — enforce mandatory breaks between calls, max consecutive calls
- [ ] **Post-call survey** — optional quality feedback from client (1-5 rating + comment)
- [ ] **Interpreter performance dashboard** — call volume, average handling time, client satisfaction

### 7B — AI & Accessibility
- [ ] **ASL recognition (research/prototype)** — long-term goal: real-time sign language → text translation
- [ ] **AI-powered quality monitoring** — sentiment analysis on audio stream, detect frustrated callers
- [ ] **Smart queue routing** — ML model predicts best interpreter match based on history, accent, speciality
- [ ] **Automated call categorization** — AI tags call type (medical, legal, business, personal) for billing
- [ ] **Voice cloning for TTS** — personalized TTS voice for deaf users who want a consistent "their" voice
- [ ] **Noise suppression** — AI audio cleanup for interpreter's environment (typing, background noise)

### 7C — Call Recording & Compliance
- [ ] **Call recording** (opt-in, with all-party consent, per FCC/state laws)
- [ ] **Video recording** — record full video call for quality assurance and dispute resolution
- [ ] **Recording consent flow** — in-call prompt: "This call may be recorded. Press X to consent."
- [ ] **Encrypted storage** — recordings encrypted at rest, access logged for audit trail
- [ ] **Retention policies** — auto-delete after regulatory retention period (typically 90 days for VRS)
- [ ] **Redaction tools** — blur/clip sensitive portions of recordings before release

### 7D — Infrastructure & Scale
- [ ] Load balancing across multiple Jitsi shards
- [ ] Geographic redundancy (multi-region deployment)
- [ ] DDoS protection, SOC 2 compliance
- [ ] Automated E2E testing suite (call flow tests)
- [ ] **Auto-scaling interpreter pool** — predict demand peaks (business hours, Mondays) and alert standby interpreters
- [ ] **CDN for static assets** — serve video mailbox recordings and profile images via CDN

### 7E — VRI-Specific Features (Corporate)
- [ ] **VRI scheduling portal** — corporate clients book interpreters for specific dates/times
- [ ] **Pre-scheduled calls** — calendar integration (Google Calendar, Outlook) for planned VRI sessions
- [ ] **Industry-specific interpreter matching** — medical, legal, educational interpreters with verified credentials
- [ ] **Corporate reporting** — monthly usage reports, cost center breakdown, department-level tracking
- [ ] **API access** — REST API for corporate clients to integrate VRI into their own scheduling systems
- [ ] **Waiting room** — branded pre-call lobby for VRI clients (company logo, estimated wait time)

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|-------------|
| Phase 0 | 1-2 weeks | None |
| Phase 0.5 | 1-2 days | Phase 0 |
| Phase 1 | 6-8 weeks | Phase 0.5 |
| Phase 1.5 | 4-6 weeks | Phase 1 (overlaps — start contacts & UX early, captioning after call flow works) |
| Phase 2 | 4-6 weeks | Overlaps with Phase 1 (start PostgreSQL + testing early) |
| Phase 2.5 | 6-8 weeks | Phase 2 (requires PostgreSQL + Redis before state externalization) |
| Phase 3 | 6-12 months | FCC filing (start ASAP, runs parallel with all phases) |
| Phase 4 | 4-6 weeks | Phase 2 (requires PostgreSQL) |
| Phase 5 | 3-4 weeks | Phase 4 |
| Phase 6 | 8-12 weeks | Phase 1.5 + Phase 2 |
| Phase 7 | Ongoing | Phase 6 |

**Critical path**: FCC certification (Phase 3A) is the longest lead item. File as early as possible — engineering work proceeds in parallel.

**Scaling bottleneck**: Phase 2.5 (Redis + multi-JVB + redundancy) is the gate to handling real production traffic. Current single-server architecture cannot support more than ~100-200 concurrent calls. Redis externalization (2G) should start as soon as Phase 2A (PostgreSQL) is complete.

**Quick wins**: Deployment (Phase 0.5) is ready now. Structured logging and health checks (Phase 2E) can be done in a day and immediately improve operability.
