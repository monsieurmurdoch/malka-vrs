# MalkaVRS Status

This file is the project-level running status log. The current update stays at the top; previous updates are kept below in the archive.
<!-- status:current:start -->
## Current Update

- Updated: 2026-04-28
- Branch: `codex/main-prod-sync`
- HEAD: `616dfd6`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  css/_welcome_page.scss`
  - `M  css/all.css`
  - `M  libs/app.bundle.min.js`
  - `M  react/features/welcome/components/WelcomePage.web.tsx`
  - `M  status.md`

<!-- status:current:end -->
## Archive
### Archived Update - 2026-04-28T05:21:34.461Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-28
- Branch: `codex/main-prod-sync`
- HEAD: `616dfd6`
- Note: Adjusted Maple auth screen per feedback: all Maple login roles now use the white Maple mark on a red login card with white buttons and consistent client/interpreter/captioner styling.
- Snapshot:
Local changes at sync time:
  - `M css/_welcome_page.scss`
  - `M css/all.css`
  - `M libs/app.bundle.min.js`
  - `M react/features/welcome/components/WelcomePage.web.tsx`
  - `M status.md`

<!-- status:current:end -->

### Archived Update - 2026-04-28T05:18:40.646Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-28
- Branch: `codex/main-prod-sync`
- HEAD: `d43e280`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  README.md`
  - `M  css/_welcome_page.scss`
  - `M  css/all.css`
  - `M  package.json`
  - `M  scripts/seed-maple-vri-demo.mjs`
  - `A  scripts/seed-tenant-demo-accounts.mjs`
  - `M  status.md`
  - `M  whitelabel/maple/assets/logo-white.svg`
  - `M  whitelabel/maple/assets/logo.svg`

<!-- status:current:end -->

### Archived Update - 2026-04-28T05:10:16.410Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-28
- Branch: `codex/main-prod-sync`
- HEAD: `d43e280`
- Note: Reworked Maple login branding to use a clean horizontal Maple Communications mark with a red/white tenant-auth palette, seeded fresh Malka and Maple demo accounts for client/interpreter/captioner/admin, and smoke-tested all eight logins. Maple public host passes; Malka app smoke passes via Droplet host override while public DNS still points app subdomains at Vercel.
- Snapshot:
Local changes at sync time:
  - `M README.md`
  - `M css/_welcome_page.scss`
  - `M css/all.css`
  - `M package.json`
  - `M scripts/seed-maple-vri-demo.mjs`
  - `M whitelabel/maple/assets/logo-white.svg`
  - `M whitelabel/maple/assets/logo.svg`
  - `?? scripts/seed-tenant-demo-accounts.mjs`

<!-- status:current:end -->

### Archived Update - 2026-04-28T05:09:58.109Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-27
- Branch: `codex/main-prod-sync`
- HEAD: `89954b2`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  status.md`
  - `M  vrs-server/src/server.ts`

<!-- status:current:end -->

### Archived Update - 2026-04-27T06:53:18.550Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-27
- Branch: `codex/main-prod-sync`
- HEAD: `89954b2`
- Note: Added forgiving auth aliases (/login, /client-login, /client) to the VRS server so client login renders once traffic reaches the Droplet. Verified the Droplet returns 200 for client-login when host resolution is forced to 138.197.121.127; public malkacomm app subdomains still resolve to Vercel.
- Snapshot:
Local changes at sync time:
  - `M vrs-server/src/server.ts`

<!-- status:current:end -->

### Archived Update - 2026-04-27T06:52:59.748Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-27
- Branch: `codex/main-prod-sync`
- HEAD: `2fd1241`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  deploy/nginx.conf`
  - `M  status.md`

<!-- status:current:end -->

### Archived Update - 2026-04-27T06:49:07.273Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-27
- Branch: `codex/main-prod-sync`
- HEAD: `2fd1241`
- Note: Diagnosed client login 404 on vri.malkacomm.com as DNS/domain routing: the hostname currently resolves to Vercel and returns DEPLOYMENT_NOT_FOUND, not the Droplet app. Prepared Droplet nginx HTTP ACME handling for vri.malkacomm.com so the cert can be issued after DNS is pointed to 138.197.121.127.
- Snapshot:
Local changes at sync time:
  - `M deploy/nginx.conf`

<!-- status:current:end -->

### Archived Update - 2026-04-27T06:48:53.089Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-27
- Branch: `codex/main-prod-sync`
- HEAD: `338fbb5`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  libs/app.bundle.min.js`
  - `M  react/features/welcome/components/WelcomePage.web.tsx`
  - `M  status.md`

<!-- status:current:end -->

### Archived Update - 2026-04-27T00:33:32.026Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-27
- Branch: `codex/main-prod-sync`
- HEAD: `338fbb5`
- Note: Fixed Malka auth logo selection so light login surfaces use the primary navy logo while the dark interpreter surface keeps the white logo. Reviewed the client profile hierarchy and identified the next UX pass: larger self-view, home-level contacts, and settings moved to a drawer/modal.
- Snapshot:
Local changes at sync time:
  - `M libs/app.bundle.min.js`
  - `M react/features/welcome/components/WelcomePage.web.tsx`
  - `M status.md`

<!-- status:current:end -->

### Archived Update - 2026-04-27T00:33:21.361Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-27
- Branch: `codex/main-prod-sync`
- HEAD: `338fbb5`
- Note: Fixed Malka auth logo selection so light login surfaces use the primary navy logo while the dark interpreter surface keeps the white logo. Reviewed the client profile hierarchy and identified the next UX pass: larger self-view, home-level contacts, and settings moved to a drawer/modal.
- Snapshot:
Local changes at sync time:
  - `M libs/app.bundle.min.js`
  - `M react/features/welcome/components/WelcomePage.web.tsx`

<!-- status:current:end -->

### Archived Update - 2026-04-27T00:13:03.628Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-26
- Branch: `codex/main-prod-sync`
- HEAD: `2529858`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  client-profile.html`
  - `M  css/_welcome_page.scss`
  - `M  css/all.css`
  - `M  libs/app.bundle.min.js`
  - `M  react/features/welcome/components/WelcomePage.web.tsx`
  - `M  status.md`

<!-- status:current:end -->

### Archived Update - 2026-04-26T05:23:02.978Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-26
- Branch: `codex/main-prod-sync`
- HEAD: `2529858`
- Note: Applied the Malka website palette to the client profile and login surfaces: light mode is off-white/white with navy accents, dark mode is deep navy with white accents, and role login themes keep the planets while differentiating client/interpreter/captioner.
- Snapshot:
Local changes at sync time:
  - `M client-profile.html`
  - `M css/_welcome_page.scss`
  - `M css/all.css`
  - `M libs/app.bundle.min.js`
  - `M react/features/welcome/components/WelcomePage.web.tsx`

<!-- status:current:end -->

### Archived Update - 2026-04-26T05:22:44.884Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-26
- Branch: `codex/main-prod-sync`
- HEAD: `07e9c35`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  interpreter-profile.html`
  - `M  status.md`
  - `M  vrs-server/routes/interpreter.js`

<!-- status:current:end -->

### Archived Update - 2026-04-26T02:34:42.503Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-26
- Branch: `codex/main-prod-sync`
- HEAD: `07e9c35`
- Note: Redesigned the global interpreter profile into a client-profile-style home with self view, readiness/queue controls, working tabs for assignments/schedule/billing/history/settings, local media defaults, and service-mode API metadata.
- Snapshot:
Local changes at sync time:
  - `M interpreter-profile.html`
  - `M vrs-server/routes/interpreter.js`

<!-- status:current:end -->

### Archived Update - 2026-04-26T02:34:25.761Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-26
- Branch: `codex/main-prod-sync`
- HEAD: `797b9f6`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  interpreter-profile.html`
  - `M  libs/app.bundle.min.js`
  - `M  react/features/welcome/components/WelcomePage.web.tsx`
  - `M  status.md`
  - `M  vrs-admin-dashboard.html`
  - `M  vrs-admin-dashboard.js`
  - `M  whitelabel/maple.json`

<!-- status:current:end -->

### Archived Update - 2026-04-26T01:15:02.642Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-26
- Branch: `codex/main-prod-sync`
- HEAD: `797b9f6`
- Note: Fixed Maple client login tab gating, enabled Maple VRS/VRI entry, and converted interpreter/admin controls to CSP-safe delegated handlers.
- Snapshot:
Local changes at sync time:
  - `M interpreter-profile.html`
  - `M libs/app.bundle.min.js`
  - `M react/features/welcome/components/WelcomePage.web.tsx`
  - `M status.md`
  - `M vrs-admin-dashboard.html`
  - `M vrs-admin-dashboard.js`
  - `M whitelabel/maple.json`

<!-- status:current:end -->

### Archived Update - 2026-04-26T01:14:26.635Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-26
- Branch: `codex/main-prod-sync`
- HEAD: `797b9f6`
- Note: Fixed Maple client login tab gating, enabled Maple VRS/VRI entry, and converted interpreter/admin controls to CSP-safe delegated handlers.
- Snapshot:
Local changes at sync time:
  - `M interpreter-profile.html`
  - `M libs/app.bundle.min.js`
  - `M react/features/welcome/components/WelcomePage.web.tsx`
  - `M vrs-admin-dashboard.html`
  - `M vrs-admin-dashboard.js`
  - `M whitelabel/maple.json`

<!-- status:current:end -->

### Archived Update - 2026-04-26T00:44:50.069Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `581a2b8`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  status.md`
  - `M  vrs-admin-dashboard.js`

<!-- status:current:end -->

### Archived Update - 2026-04-25T09:35:44.166Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `581a2b8`
- Note: Adjusted admin defaults so Malka-created clients/interpreters default VRS while Maple defaults VRI; service modes remain explicitly editable per account.
- Snapshot:
Local changes at sync time:
  - `M status.md`
  - `M vrs-admin-dashboard.js`

<!-- status:current:end -->

### Archived Update - 2026-04-25T09:35:33.918Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `581a2b8`
- Note: Adjusted admin defaults so Malka-created clients/interpreters default VRS while Maple defaults VRI; service modes remain explicitly editable per account.
- Snapshot:
Local changes at sync time:
  - `M vrs-admin-dashboard.js`

<!-- status:current:end -->

### Archived Update - 2026-04-25T09:35:06.511Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `63808b4`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  scripts/seed-maple-vri-demo.mjs`
  - `M  status.md`
  - `M  vrs-server/dist/database.js`
  - `M  vrs-server/src/database.ts`

<!-- status:current:end -->

### Archived Update - 2026-04-25T09:29:47.902Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `63808b4`
- Note: Fixed Maple VRI/VRS phone-number crossover: VRI-only demo clients are kept phone-free and assigned VRS numbers are moved to one client before insert.
- Snapshot:
Local changes at sync time:
  - `M scripts/seed-maple-vri-demo.mjs`
  - `M status.md`
  - `M vrs-server/dist/database.js`
  - `M vrs-server/src/database.ts`

<!-- status:current:end -->

### Archived Update - 2026-04-25T09:29:26.796Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `63808b4`
- Note: Fixed Maple VRI/VRS phone-number crossover: VRI-only demo clients are kept phone-free and assigned VRS numbers are moved to one client before insert.
- Snapshot:
Local changes at sync time:
  - `M scripts/seed-maple-vri-demo.mjs`
  - `M vrs-server/dist/database.js`
  - `M vrs-server/src/database.ts`

<!-- status:current:end -->

### Archived Update - 2026-04-25T09:28:42.421Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `75df655`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  client-profile.html`
  - `M  interpreter-profile.html`
  - `M  status.md`
  - `M  vrs-welcome.html`

<!-- status:current:end -->

### Archived Update - 2026-04-25T09:15:20.995Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `75df655`
- Note: Clarified tenant/service separation: Maple and Malka branding stay isolated while VRS/VRI profile labels derive from account permissions.
- Snapshot:
Local changes at sync time:
  - `M client-profile.html`
  - `M interpreter-profile.html`
  - `M status.md`
  - `M vrs-welcome.html`

<!-- status:current:end -->

### Archived Update - 2026-04-25T09:14:47.878Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `75df655`
- Note: Clarified tenant/service separation: Maple and Malka branding stay isolated while VRS/VRI profile labels derive from account permissions.
- Snapshot:
Local changes at sync time:
  - `M client-profile.html`
  - `M interpreter-profile.html`
  - `M vrs-welcome.html`

<!-- status:current:end -->

### Archived Update - 2026-04-25T09:14:36.916Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `8c3227a`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  client-profile.html`
  - `M  status.md`
  - `M  vrs-server/routes/auth.js`
  - `M  vrs-server/routes/client.js`

<!-- status:current:end -->

### Archived Update - 2026-04-25T09:12:18.085Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `8c3227a`
- Note: Made Malka client profile service-mode aware: VRS remains default, while Malka corporate VRI-only accounts render the VRI profile flow.
- Snapshot:
Local changes at sync time:
  - `M client-profile.html`
  - `M status.md`
  - `M vrs-server/routes/auth.js`
  - `M vrs-server/routes/client.js`

<!-- status:current:end -->

### Archived Update - 2026-04-25T09:11:51.516Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `8c3227a`
- Note: Made Malka client profile service-mode aware: VRS remains default, while Malka corporate VRI-only accounts render the VRI profile flow.
- Snapshot:
Local changes at sync time:
  - `M client-profile.html`
  - `M vrs-server/routes/auth.js`
  - `M vrs-server/routes/client.js`

<!-- status:current:end -->

### Archived Update - 2026-04-25T09:11:44.847Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `9f92528`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  ROADMAP.md`
  - `M  status.md`

<!-- status:current:end -->

### Archived Update - 2026-04-25T09:09:00.938Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `9f92528`
- Note: Updated roadmap with mobile app feature/backend parity workstream and refreshed Maple VRI demo status.
- Snapshot:
Local changes at sync time:
  - `M ROADMAP.md`
  - `M status.md`

<!-- status:current:end -->

### Archived Update - 2026-04-25T09:08:37.907Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `9f92528`
- Note: Updated roadmap with mobile app feature/backend parity workstream and refreshed Maple VRI demo status.
- Snapshot:
Local changes at sync time:
  - `M ROADMAP.md`

<!-- status:current:end -->

### Archived Update - 2026-04-25T09:08:29.929Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `a1ca443`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  status.md`

<!-- status:current:end -->

### Archived Update - 2026-04-25T08:54:43.480Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `a1ca443`
- Note: Committed Maple VRI default profile mode: Maple-created clients are VRI-only without phone numbers unless VRS is explicitly enabled, admin can adjust service modes, and demo seed includes separate VRS test accounts.
- Snapshot:
No local changes at sync time.

<!-- status:current:end -->

### Archived Update - 2026-04-25T08:54:31.973Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `85ac5a1`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  client-profile.html`
  - `M  scripts/seed-maple-vri-demo.mjs`
  - `M  status.md`
  - `M  vrs-admin-dashboard.html`
  - `M  vrs-admin-dashboard.js`
  - `M  vrs-server/dist/database.js`
  - `M  vrs-server/lib/queue-service.js`
  - `M  vrs-server/lib/validation.js`
  - `M  vrs-server/routes/admin.js`
  - `M  vrs-server/routes/auth.js`
  - `M  vrs-server/routes/client.js`
  - `M  vrs-server/src/database.ts`
  - `M  vrs-server/src/lib/queue-service.ts`
  - `M  vrs-server/ws/handler.js`

<!-- status:current:end -->

### Archived Update - 2026-04-25T08:54:04.950Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `85ac5a1`
- Note: Added Maple VRI-first account permissions: clients/interpreters now carry service modes, Maple client profile hides VRS phone affordances for VRI-only accounts, admin dashboard can adjust VRI/VRS permissions, and Maple seed creates VRI defaults plus VRS test accounts.
- Snapshot:
Local changes at sync time:
  - `M client-profile.html`
  - `M scripts/seed-maple-vri-demo.mjs`
  - `M vrs-admin-dashboard.html`
  - `M vrs-admin-dashboard.js`
  - `M vrs-server/dist/database.js`
  - `M vrs-server/lib/queue-service.js`
  - `M vrs-server/lib/validation.js`
  - `M vrs-server/routes/admin.js`
  - `M vrs-server/routes/auth.js`
  - `M vrs-server/routes/client.js`
  - `M vrs-server/src/database.ts`
  - `M vrs-server/src/lib/queue-service.ts`
  - `M vrs-server/ws/handler.js`

<!-- status:current:end -->

### Archived Update - 2026-04-25T08:53:32.204Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `8629240`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  status.md`

<!-- status:current:end -->

### Archived Update - 2026-04-25T08:35:02.421Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `8629240`
- Note: Committed client profile home view refinement: self preview, clear primary call actions, collapsible settings/contacts/history, mobile scrolling, and enforced muted call starts.
- Snapshot:
No local changes at sync time.

<!-- status:current:end -->

### Archived Update - 2026-04-25T08:34:43.524Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `173b50e`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  client-profile.html`
  - `M  status.md`

<!-- status:current:end -->

### Archived Update - 2026-04-25T08:33:28.828Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `173b50e`
- Note: Refined client profile into a cleaner home view: self camera preview, primary call actions, collapsible settings/contacts/history, mobile scrolling, and explicit mic-always-muted defaults.
- Snapshot:
Local changes at sync time:
  - `M client-profile.html`
  - `M status.md`

<!-- status:current:end -->

### Archived Update - 2026-04-25T08:32:47.411Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `173b50e`
- Note: Refined client profile into a cleaner home view: self camera preview, primary call actions, collapsible settings/contacts/history, mobile scrolling, and explicit mic-always-muted defaults.
- Snapshot:
Local changes at sync time:
  - `M client-profile.html`
  - `M status.md`

<!-- status:current:end -->

### Archived Update - 2026-04-25T08:30:22.923Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `173b50e`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M client-profile.html`

<!-- status:current:end -->

### Archived Update - 2026-04-25T08:30:11.523Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `c184323`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  config.js`
  - `M  interface_config.js`
  - `M  status.md`

<!-- status:current:end -->

### Archived Update - 2026-04-25T08:14:00.825Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `c184323`
- Note: Reconciled captions vs language controls: restored the in-room captions/subtitles option while keeping the standalone EN/flag language switcher removed from room surfaces.
- Snapshot:
Local changes at sync time:
  - `M config.js`
  - `M interface_config.js`

<!-- status:current:end -->

### Archived Update - 2026-04-25T08:13:44.873Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `486bb34`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  index.html`
  - `M  react/features/toolbox/components/web/RequestInterpreterButton.tsx`
  - `M  react/features/toolbox/components/web/Toolbox.tsx`
  - `M  status.md`
  - `A  vrs-room-controls.js`

<!-- status:current:end -->

### Archived Update - 2026-04-25T08:10:51.757Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `486bb34`
- Note: Added a dedicated in-room Request Interpreter toolbar action: central labeled button, yellow while pending, green once accepted/matched, wired to the existing /ws interpreter queue request/cancel flow.
- Snapshot:
Local changes at sync time:
  - `M index.html`
  - `M react/features/toolbox/components/web/RequestInterpreterButton.tsx`
  - `M react/features/toolbox/components/web/Toolbox.tsx`
  - `?? vrs-room-controls.js`

<!-- status:current:end -->

### Archived Update - 2026-04-25T08:10:30.738Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `fc864ad`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  client-profile.html`
  - `M  config.js`
  - `M  interface_config.js`
  - `M  libs/app.bundle.min.js`
  - `M  react/features/base/premeeting/components/web/PreMeetingScreen.tsx`
  - `M  react/features/conference/components/web/Conference.tsx`
  - `M  react/features/welcome/components/WelcomePage.web.tsx`
  - `M  status.md`

<!-- status:current:end -->

### Archived Update - 2026-04-25T08:01:48.283Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `fc864ad`
- Note: Moved language selection out of live rooms: removed the EN/flag language switcher from active room/prejoin/welcome surfaces, disabled in-room subtitle language UI, and added language preference to client profile settings.
- Snapshot:
Local changes at sync time:
  - `M client-profile.html`
  - `M config.js`
  - `M interface_config.js`
  - `M libs/app.bundle.min.js`
  - `M react/features/base/premeeting/components/web/PreMeetingScreen.tsx`
  - `M react/features/conference/components/web/Conference.tsx`
  - `M react/features/welcome/components/WelcomePage.web.tsx`

<!-- status:current:end -->

### Archived Update - 2026-04-25T08:01:28.433Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `bd6df68`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  config.js`
  - `M  libs/app.bundle.min.js`
  - `M  react/features/vrs-layout/components/VRSLayout.tsx`
  - `M  status.md`

<!-- status:current:end -->

### Archived Update - 2026-04-25T07:55:12.417Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `bd6df68`
- Note: Removed in-room settings/profile controls from Jitsi rooms: constrained toolbar to call actions only and removed the VRS profile bubble so settings live on the client profile page.
- Snapshot:
Local changes at sync time:
  - `M config.js`
  - `M libs/app.bundle.min.js`
  - `M react/features/vrs-layout/components/VRSLayout.tsx`
  - `M status.md`

<!-- status:current:end -->

### Archived Update - 2026-04-25T07:54:04.617Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `2dec29f`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  client-profile.html`
  - `M  config.js`
  - `M  interface_config.js`
  - `M  vrs-server/src/server.ts`

<!-- status:current:end -->

### Archived Update - 2026-04-25T07:47:58.457Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `3fea418`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  config.js`
  - `M  docker-compose.prod.yml`
  - `M  vrs-server/src/server.ts`

<!-- status:current:end -->

### Archived Update - 2026-04-25T07:27:49.488Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `a516cb0`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  vrs-server/src/server.ts`

<!-- status:current:end -->

### Archived Update - 2026-04-25T07:23:12.337Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `006444f`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  client-profile.html`
  - `M  vrs-server/src/server.ts`

<!-- status:current:end -->

### Archived Update - 2026-04-25T07:00:45.188Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `cee5e63`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  client-profile.html`

<!-- status:current:end -->

### Archived Update - 2026-04-25T06:49:54.003Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `4abd37f`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  vrs-server/src/server.ts`

<!-- status:current:end -->

### Archived Update - 2026-04-25T06:38:55.682Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `codex/main-prod-sync`
- HEAD: `caad47a`
- Note: Pre-push project status sync.
- Snapshot:
Local changes at sync time:
  - `M  README.md`
  - `M  ROADMAP.md`
  - `M  status.md`
  - `M  vrs-server/database.js`
  - `M  vrs-server/dist/database.js`
  - `M  vrs-server/package.json`
  - `M  vrs-server/src/database.ts`

<!-- status:current:end -->

### Archived Update - 2026-04-25T06:27:19.519Z

<!-- status:current:start -->
## Current Update

- Updated: 2026-04-25
- Branch: `feat/visual-voicemail`
- HEAD: `aa6329f`
- Note: TypeScript migration completed: vrs-server now runs from src/server.ts compiled to dist/server.js; src/database.ts is the canonical PostgreSQL data layer with typed query helpers/results and database.js is only a CommonJS bridge; queue-service, handoff-service, and activity-logger are migrated under src/lib; shared strict tsconfig is enabled for vrs-server and ops-server; vrs-server typecheck and build pass.
- Snapshot:
Local changes at sync time:
  - `M README.md`
  - `M ROADMAP.md`
  - `D libs/alwaysontop.min.js.LICENSE.txt`
  - `D libs/face-landmarks-worker.min.js.LICENSE.txt`
  - `M vrs-server/database.js`
  - `M vrs-server/src/database.ts`
  - `?? "libs/alwaysontop.min 2.js"`
  - `?? "libs/analytics-ga.min 2.js"`
  - `?? "libs/emotion 4.bin"`

<!-- status:current:end -->

### Archived Update - 2026-04-25T06:24:36.123Z

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
