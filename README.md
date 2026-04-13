# MalkaVRS

Video Relay Service (VRS) platform for deaf and hard-of-hearing users. Connects clients with ASL interpreters via real-time video, with phone bridging to hearing parties through Twilio.

Built on [Jitsi Meet](https://github.com/jitsi/jitsi-meet) with custom backend services for queue management, authentication, and call routing.

## Architecture

```
                     ┌──────────────────┐
                     │   Browser / App   │
                     │  (React + Jitsi)  │
                     └────────┬─────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
     WebSocket /ws     REST /api      WebRTC media
              │               │               │
     ┌────────▼──────┐ ┌─────▼──────┐ ┌──────▼──────┐
     │  VRS Server    │ │ Ops Server  │ │ JVB (Jitsi  │
     │  :3001         │ │ :3003       │ │ Videobridge)│
     │  Queue, Auth,  │ │ Admin,      │ │ :10000/udp  │
     │  P2P, Handoff  │ │ CDR, Stats  │ │             │
     └────────┬──────┘ └─────────────┘ └──────┬──────┘
              │                                │
     ┌────────▼──────┐              ┌──────────▼──┐
     │   SQLite DB   │              │ Prosody XMPP│
     │   (vrs-data)  │              │ + Jicofo    │
     └───────────────┘              └─────────────┘

     ┌───────────────┐
     │ Twilio Server │  (optional, :3002)
     │ Phone bridge  │
     └───────────────┘
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| **VRS Server** | 3001 | Main API, WebSocket queue, auth, P2P calling, device handoff |
| **Ops Server** | 3003 | Admin dashboard, call logging, interpreter management |
| **Twilio Server** | 3002 | Phone-to-video bridge (optional, `--profile twilio`) |
| **Prosody** | 5222/5280 | XMPP signaling for Jitsi WebRTC |
| **Jicofo** | — | Jitsi conference focus |
| **JVB** | 10000/udp | Jitsi videobridge (media relay) |

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)

### Environment Setup

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
VRS_SHARED_JWT_SECRET=<generate a random 64-char string>
VRS_BOOTSTRAP_SUPERADMIN_PASSWORD=<choose a strong password>
JICOFO_COMPONENT_SECRET=<random string>
JICOFO_AUTH_PASSWORD=<random string>
JVB_AUTH_PASSWORD=<random string>
```

### Run with Docker Compose

```bash
# Start all services
docker compose up --build

# Start with Twilio phone integration
docker compose --profile twilio up --build
```

The app will be available at `http://localhost:8080`.

### Run Locally (Development)

```bash
# Install dependencies for VRS server
cd vrs-server && npm install && cd ..

# Install dependencies for Ops server
cd vrs-ops-server && npm install && cd ..

# Start VRS server
cd vrs-server && npm start

# Start Ops server (separate terminal)
cd vrs-ops-server && npm start
```

## Key Features

- **Interpreter Queue** — WebSocket-based real-time queue with language-based matching and priority routing
- **P2P Client Calling** — Direct video calls between clients using phone number resolution
- **Device Handoff** — Seamless call transfer between devices using one-time cryptographic tokens
- **Admin Dashboard** — Real-time interpreter status, queue management, activity logging, usage analytics
- **Phone Integration** — Twilio Voice API for bridging hearing parties into video calls
- **Security** — JWT auth, Helmet CSP, rate limiting, CORS whitelist, bcrypt password hashing

## API Overview

### Authentication
```
POST /api/auth/client/register      — Register a new client
POST /api/auth/client/login         — Client login
POST /api/auth/interpreter/login    — Interpreter login
POST /api/admin/login               — Admin login (legacy, disabled by default)
```

### Client Endpoints (authenticated)
```
GET  /api/client/profile            — Get client profile
GET  /api/client/call-history       — Call history with pagination
GET  /api/client/speed-dial         — Speed dial entries
POST /api/client/speed-dial         — Add speed dial entry
GET  /api/client/missed-calls       — Missed P2P calls
GET  /api/client/lookup-phone       — Look up a client by phone number
```

### Interpreter Endpoints (authenticated)
```
GET  /api/interpreter/profile       — Interpreter profile
GET  /api/interpreter/call-history  — Call history
GET  /api/interpreter/shifts        — Shift schedule
GET  /api/interpreter/earnings      — Earnings for a date range
GET  /api/interpreter/stats         — Monthly stats
```

### Admin Endpoints (authenticated)
```
GET  /api/admin/stats               — Dashboard statistics
GET  /api/admin/interpreters        — List interpreters with status
POST /api/admin/interpreters        — Create interpreter
GET  /api/admin/clients             — List clients
GET  /api/admin/queue               — Current queue state
POST /api/admin/queue/pause         — Pause the queue
POST /api/admin/queue/resume        — Resume the queue
GET  /api/admin/activity            — Activity log
```

### WebSocket Events (`/ws`)
```
auth                    — Authenticate with role + token
interpreter_status      — Update interpreter availability
request_interpreter     — Client requests an interpreter
accept_request          — Interpreter accepts a queue request
p2p_call                — Initiate P2P client-to-client call
session_register        — Register for device handoff
handoff_prepare         — Begin device handoff
```

## Production Deployment

See `deploy/` for DigitalOcean deployment scripts:

```bash
# On a fresh droplet
./deploy/setup.sh
```

This installs Docker, configures firewall (ports 80, 443, 10000/udp), obtains SSL certificates via certbot, and launches the full stack with nginx reverse proxy.

See `ROADMAP.md` for the full development plan, `RELEASES.md` for merge/deploy policy, and `deploy/nginx.conf` for the production proxy configuration.

## Project Structure

```
malka-vrs-app/
├── vrs-server/              # Main backend (Express + WebSocket + SQLite)
│   ├── server.js            # API routes, WebSocket handlers
│   ├── database.js          # SQLite data layer
│   └── lib/
│       ├── queue-service.js # Interpreter queue matching
│       ├── handoff-service.js# Device handoff tokens
│       └── activity-logger.js
├── vrs-ops-server/          # Admin dashboard backend (TypeScript)
├── twilio-voice-server/     # Twilio phone integration
├── react/                   # React components (Jitsi Meet fork)
├── deploy/                  # Production deployment configs
│   ├── nginx.conf
│   ├── setup.sh
│   └── docker-compose.prod.yml
├── docker-compose.yml       # Development stack
├── Dockerfile.vrs-server
├── Dockerfile.ops-server
├── Dockerfile.twilio-server
└── ROADMAP.md               # Development roadmap
```

## Demo Accounts

The server seeds demo accounts on first run:

| Role | Email | Password |
|------|-------|----------|
| Client | (set via `.env`) | (set via `.env`) |
| Interpreter | (set via `.env`) | (set via `.env`) |

## Tech Stack

- **Frontend:** React 18, Jitsi Meet SDK, Material UI
- **Backend:** Node.js, Express, WebSocket (ws), SQLite3
- **Auth:** JWT, bcrypt
- **Video:** Jitsi Meet (Prosody + Jicofo + JVB), WebRTC
- **Phone:** Twilio Voice API
- **Infrastructure:** Docker, Docker Compose, nginx, Let's Encrypt

## License

This project includes code from [Jitsi Meet](https://github.com/jitsi/jitsi-meet), licensed under the Apache License 2.0. MalkaVRS-specific code is proprietary.
