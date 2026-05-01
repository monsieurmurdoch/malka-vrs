# AGENTS.md — Mobile Parity & Drift Controls

This file defines the rules and requirements for maintaining feature parity between the web and mobile (React Native) surfaces of MalkaVRS.

## General Rules

- Treat `ROADMAP.md` as the canonical tracking document for all feature parity work.
- Before implementing any new web/backend feature, check the Mobile Parity Track section in ROADMAP.md and update it.
- Every web feature merged after April 29, 2026 must update the ROADMAP.md mobile section with one of: **implemented on mobile**, **intentionally web-only**, **mobile follow-up ticket**, or **blocked by native platform capability**.

## PR Checklist

Every PR that touches web UI, backend API contracts, WebSocket message types, or storage keys must answer:

1. **Does this change affect mobile?** — If yes, add the corresponding mobile screen/hook/middleware change or file a follow-up ticket.
2. **Are shared types updated?** — If new API response shapes or WebSocket payloads are introduced, update `react/features/mobile/types.ts`.
3. **Are storage keys documented?** — New `setPersistentItem`/`getPersistentItem` keys must be added to the storage key registry in `react/features/vrs-auth/storage.ts` comments.
4. **Does the whitelabel config need updating?** — New tenant-specific features must be reflected in all three tenant configs (`whitelabel/malka.json`, `whitelabel/malkavri.json`, `whitelabel/maple.json`).

## Architecture Constraints

### Shared Code (web + native)
- `react/features/interpreter-queue/` — Redux actions, reducer, middleware, service. Both platforms use this directly.
- `react/features/vrs-auth/storage.ts` — Cross-platform storage abstraction (localStorage on web, AsyncStorage on native).
- `react/features/base/whitelabel/` — Tenant config functions. On native, config is cached in AsyncStorage under `vrs_tenant_config`.
- `react/features/mobile/types.ts` — Shared TypeScript interfaces for auth, queue, contacts, calls, media.

### Platform-Specific Code
- Mobile screens live in `react/features/mobile/navigation/components/`.
- Native-specific module resolution uses `moduleSuffixes: [".native", ".ios", ".android", ""]`.
- Native actions (e.g., `appNavigate` in `actions.native.ts`) handle platform-specific config overrides.

### Storage Keys
All persistent storage keys used by the app:
- `vrs_auth_token` — JWT token (secure storage on native)
- `vrs_client_auth` — client auth flag
- `vrs_interpreter_auth` — interpreter auth flag
- `vrs_user_role` — `'client'` | `'interpreter'`
- `vrs_user_info` — JSON: UserInfo object
- `vrs_active_call` — JSON: StoredActiveCall (match data)
- `vrs_call_history` — JSON: CallRecord[]
- `vrs_contacts` — JSON: Contact[]
- `vrs_selected_contact` — JSON: Contact (currently selected)
- `vrs_voicemails` — JSON: Voicemail[]
- `vrs_language` — string: selected language code
- `vrs_captions_enabled` — string: `'true'`|`'false'`
- `vri_media_defaults` — JSON: MediaDefaults
- `vrs_tenant_config` — JSON: cached tenant config for native theme/branding

### Tenant Config (Whitelabel)
Three tenants are supported:
- `malka` — MalkaVRS (VRS + VRI, primary tenant)
- `malkavri` — MalkaVRI (VRI-only mode for Malka accounts)
- `maple` — MapleVRI (VRI-primary, red branding, CAD billing)

Each has `theme`, `brand`, `operations`, `features`, and `mobile` sections. On native, the tenant config is cached to `vrs_tenant_config` in AsyncStorage and read via `useTenantTheme()` hook.

## Routes & Navigation

All mobile screens are registered in `react/features/mobile/navigation/components/RootNavigationContainer.tsx` with route names defined in `react/features/mobile/navigation/routes.ts`.

Route groups:
- `auth.*` — Login
- `vrs.*` — Client VRS screens (home, callHistory, contacts, contactDetail, dialPad, voicemail)
- `vri.*` — Client VRI screens (console, settings, usage)
- `interpreter.*` — Interpreter screens (home, settings, earnings)
- `conference.*` — Jitsi conference flow

## Build Verification

Two TypeScript builds must pass with zero errors:
- `npm run tsc:web` — Web build (standard tsconfig)
- `npm run tsc:native` — React Native build (tsconfig.react-native.json with platform suffixes)

Run both before committing mobile parity changes.

## Drift Prevention

- **Contract tests**: Shared API client strategy should be chosen to prevent web/mobile contract drift (still pending).
- **Parity table**: `docs/mobile-parity.md` should maintain a route-by-route API/UI parity table (still pending).
- **Smoke fixtures**: Demo accounts for iOS/Android smoke testing (still pending).
- **Issue tagging**: Mobile blockers should be tagged separately in Linear/GitHub so they don't disappear under web work.
