# MalkaVRS Status

This file is the project-level running status log. The current update stays at the top; previous updates are kept below in the archive.
<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `feat/visual-voicemail`
- HEAD: `0589503`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  .env.example`
  - `A  .githooks/pre-commit`
  - `A  .githooks/pre-push`
  - `M  .github/workflows/ci.yml`
  - `M  Dockerfile.ops-server`
  - `A  Dockerfile.pgbouncer`
  - `A  Dockerfile.postgres`
  - `M  Dockerfile.vrs-server`
  - `M  README.md`
  - `M  ROADMAP.md`
  - `M  client-profile.html`
  - `M  deploy/nginx.conf`
  - `A  deploy/pgbouncer/entrypoint.sh`
  - `A  deploy/postgres/005-create-wal-archive.sh`
  - `A  deploy/postgres/entrypoint.sh`
  - `A  deploy/postgres/init-pgaudit.sql`
  - `A  deploy/postgres/postgresql.conf`
  - `M  docker-compose.prod.yml`

<!-- status:current:end -->
## Archive
### Archived Update - 2026-04-25T00:06:11.656Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `feat/visual-voicemail`
- HEAD: `0589503`
- Note: Production PostgreSQL/PgBouncer deployment completed: custom Postgres with pg_audit/WAL config is running, PgBouncer is healthy, Malka VRS and Maple VRI containers run from compiled TypeScript, nginx routes are refreshed, and smoke checks pass for Malka /api/health, Maple HTTPS /api/health + whitelabel runtime, and ops /ops/api/readiness. Ops readiness remains degraded only for bootstrap_superadmin_enabled.
- Snapshot:
Local changes at sync time:
  - `M .env.example`
  - `M .github/workflows/ci.yml`
  - `M Dockerfile.ops-server`
  - `M Dockerfile.vrs-server`
  - `M README.md`
  - `M ROADMAP.md`
  - `M client-profile.html`
  - `M deploy/nginx.conf`
  - `M docker-compose.prod.yml`
  - `M docker-compose.yml`
  - `M interpreter-profile.html`
  - `M libs/alwaysontop.min.js`
  - `D libs/alwaysontop.min.js.LICENSE.txt`
  - `M libs/app.bundle.min.js`
  - `M libs/external_api.min.js`
  - `D libs/face-landmarks-worker.min.js.LICENSE.txt`
  - `M package.json`
  - `M scripts/seed-vrs-admin-smoke.mjs`

<!-- status:current:end -->

### Archived Update - 2026-04-25T00:05:12.460Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-24
- Branch: `feat/visual-voicemail`
- HEAD: `0589503`
- Note: PostgreSQL runtime alignment and TypeScript migration advanced: local Docker builds now pass for custom Postgres with pg_audit/WAL archiving, PgBouncer, VRS Malka, VRS Maple, and ops; VRS now builds/runs from compiled TypeScript dist/server.js on Node 20; compose config validates for local and prod.
- Snapshot:
Local changes at sync time:
  - `M .env.example`
  - `M .github/workflows/ci.yml`
  - `M Dockerfile.ops-server`
  - `M Dockerfile.vrs-server`
  - `M README.md`
  - `M ROADMAP.md`
  - `M client-profile.html`
  - `M deploy/nginx.conf`
  - `M docker-compose.prod.yml`
  - `M docker-compose.yml`
  - `M interpreter-profile.html`
  - `M libs/alwaysontop.min.js`
  - `D libs/alwaysontop.min.js.LICENSE.txt`
  - `M libs/app.bundle.min.js`
  - `M libs/external_api.min.js`
  - `D libs/face-landmarks-worker.min.js.LICENSE.txt`
  - `M package.json`
  - `M scripts/seed-vrs-admin-smoke.mjs`

<!-- status:current:end -->

### Archived Update - 2026-04-24T23:47:13.286Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-24
- Branch: `feat/visual-voicemail`
- HEAD: `0589503`
- Note: PostgreSQL runtime alignment implementation landed: node-pg-migrate baseline migrations for VRS/Ops, stale SQLite TS bridge retired, ops live dashboard calls/interpreters/daily stats backed by PostgreSQL, PgBouncer wired for runtime traffic, pg_audit Postgres image/config added, and WAL archive volume/config added. Compose config and server builds pass; Docker daemon was not running for local image builds.
- Snapshot:
Local changes at sync time:
  - `M .env.example`
  - `M .github/workflows/ci.yml`
  - `M Dockerfile.vrs-server`
  - `M README.md`
  - `M ROADMAP.md`
  - `M client-profile.html`
  - `M deploy/nginx.conf`
  - `M docker-compose.prod.yml`
  - `M docker-compose.yml`
  - `M interpreter-profile.html`
  - `M libs/alwaysontop.min.js`
  - `D libs/alwaysontop.min.js.LICENSE.txt`
  - `M libs/app.bundle.min.js`
  - `M libs/external_api.min.js`
  - `D libs/face-landmarks-worker.min.js.LICENSE.txt`
  - `M package.json`
  - `M scripts/seed-vrs-admin-smoke.mjs`
  - `M scripts/smoke-vrs-pages.mjs`

<!-- status:current:end -->

### Archived Update - 2026-04-24T23:13:45.053Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-24
- Branch: `feat/visual-voicemail`
- HEAD: `0589503`
- Note: Contact and instant-room quick wins deployed: contact cards/detail/timeline/notes, cross-device contact sync, CSV/Google/phone contact import hooks, speed-dial migration, instant-room skip-waiting/media defaults, and remembered media preference handoff. Maple contacts smoke passed on prod.
- Snapshot:
Local changes at sync time:
  - `M .env.example`
  - `M .github/workflows/ci.yml`
  - `M Dockerfile.vrs-server`
  - `M README.md`
  - `M ROADMAP.md`
  - `M client-profile.html`
  - `M deploy/nginx.conf`
  - `M docker-compose.prod.yml`
  - `M docker-compose.yml`
  - `M interpreter-profile.html`
  - `M libs/alwaysontop.min.js`
  - `D libs/alwaysontop.min.js.LICENSE.txt`
  - `M libs/app.bundle.min.js`
  - `M libs/external_api.min.js`
  - `D libs/face-landmarks-worker.min.js.LICENSE.txt`
  - `M package.json`
  - `M scripts/seed-vrs-admin-smoke.mjs`
  - `M scripts/smoke-vrs-pages.mjs`

<!-- status:current:end -->

### Archived Update - 2026-04-24T22:13:26.615Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-24
- Branch: `feat/visual-voicemail`
- HEAD: `0589503`
- Note: MapleVRI branding deployed: official Maple red/white palette, supplied Maple logo assets, Maple runtime build inside vrs-maple image, and Docker dist database shim fix. Demo client/interpreter/admin logins re-verified after deploy.
- Snapshot:
Local changes at sync time:
  - `M .env.example`
  - `M .github/workflows/ci.yml`
  - `M Dockerfile.vrs-server`
  - `M README.md`
  - `M ROADMAP.md`
  - `M client-profile.html`
  - `M deploy/nginx.conf`
  - `M docker-compose.prod.yml`
  - `M docker-compose.yml`
  - `M interpreter-profile.html`
  - `M libs/alwaysontop.min.js`
  - `D libs/alwaysontop.min.js.LICENSE.txt`
  - `M libs/app.bundle.min.js`
  - `M libs/external_api.min.js`
  - `D libs/face-landmarks-worker.min.js.LICENSE.txt`
  - `M package.json`
  - `M scripts/seed-vrs-admin-smoke.mjs`
  - `M scripts/smoke-vrs-pages.mjs`

<!-- status:current:end -->

### Archived Update - 2026-04-24T18:53:00.964Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-24
- Branch: `feat/visual-voicemail`
- HEAD: `0589503`
- Note: Completed quick wins: production VRS/ops backend smoke on main and Maple domains, Maple VRI demo logins, profile settings pages, dark mode preferences, safe Maple seed, and handoff persistence fix. Remaining immediate risks: Twilio proxy health and live media/queue/admin moderation smoke.
- Snapshot:
Local changes at sync time:
  - `M .env.example`
  - `M .github/workflows/ci.yml`
  - `M README.md`
  - `M ROADMAP.md`
  - `M client-profile.html`
  - `M deploy/nginx.conf`
  - `M docker-compose.prod.yml`
  - `M docker-compose.yml`
  - `M interpreter-profile.html`
  - `M libs/alwaysontop.min.js`
  - `D libs/alwaysontop.min.js.LICENSE.txt`
  - `M libs/app.bundle.min.js`
  - `M libs/external_api.min.js`
  - `D libs/face-landmarks-worker.min.js.LICENSE.txt`
  - `M package.json`
  - `M scripts/seed-vrs-admin-smoke.mjs`
  - `M scripts/smoke-vrs-pages.mjs`
  - `M scripts/validate-vrs-stack.mjs`

<!-- status:current:end -->

### Archived Update - 2026-04-24T18:12:07.891Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-24
- Branch: `feat/visual-voicemail`
- HEAD: `0589503`
- Note: Initial Obsidian project status mirror after PostgreSQL, Maple VRI, ops routing, and CI stabilization work.
- Snapshot:
Local changes at sync time:
  - `M .env.example`
  - `M .github/workflows/ci.yml`
  - `M README.md`
  - `M ROADMAP.md`
  - `M deploy/nginx.conf`
  - `M docker-compose.prod.yml`
  - `M docker-compose.yml`
  - `M libs/alwaysontop.min.js`
  - `D libs/alwaysontop.min.js.LICENSE.txt`
  - `M libs/app.bundle.min.js`
  - `M libs/external_api.min.js`
  - `D libs/face-landmarks-worker.min.js.LICENSE.txt`
  - `M scripts/seed-vrs-admin-smoke.mjs`
  - `M scripts/smoke-vrs-pages.mjs`
  - `M twa/app/src/main/res/xml/shortcuts.xml`
  - `M vrs-ops-server/.env.example`
  - `M vrs-ops-server/dist/index.d.ts.map`
  - `M vrs-ops-server/dist/index.js`

<!-- status:current:end -->

### Archived Update - 2026-04-24T06:42:15.950Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-24
- Focus: PostgreSQL-only runtime, Maple VRI readiness, ops/admin routing, and project visibility.
- Current state: Maple VRI is live at `https://vri.maplecomm.ca` with `tenantId: maple`, `vri: true`, and `vrs: false`.
- Completed recently:
  - VRS local runtime now targets canonical PostgreSQL `server.js`.
  - Local and production compose files point VRS and ops at PostgreSQL.
  - Ops-server now supports PostgreSQL-backed accounts and audit events.
  - Maple VRI seed data includes VRI client, VRI interpreter, and Maple admin metadata.
  - CI now checks VRS runtime syntax/tests, ops build, and compose config.
  - Nginx config now rewrites `/ops/*` explicitly to the ops server.
- Needs verification:
  - Deploy updated nginx config and confirm `/ops/api/health` and `/ops/api/readiness` on `vri.maplecomm.ca`.
  - Run real Maple VRI admin/interpreter/client smoke after seed data is deployed.
  - Continue TypeScript migration for canonical VRS runtime files.

<!-- status:current:end -->
