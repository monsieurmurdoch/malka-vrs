# Mobile Parity Table

Route-by-route API/UI parity status between web and mobile surfaces.

> Last updated: May 1, 2026

## Legend

- **Done** — Implemented on both web and mobile
- **Partial** — Mobile has UI but API is mocked or uses local storage instead of server
- **Missing** — Not yet implemented on mobile
- **Web-only** — Intentionally not on mobile (e.g., admin, captioner)

---

## Authentication

| Feature | API Endpoint | Web | Mobile | Status |
|---------|-------------|-----|--------|--------|
| Email/password login | `POST /api/auth/client/login` | Yes | Real client endpoint auth wired for MalkaVRS, MalkaVRI, and MapleVRI | Done |
| Phone password login | `POST /api/auth/client/phone-login` | Yes | Yes | Done |
| SMS OTP login | `POST /api/auth/otp/request`, `POST /api/auth/otp/verify` | Yes | Yes | Done |
| Password reset request | `POST /api/auth/password/forgot` | Yes | Yes | Done |
| JWT refresh | `POST /api/auth/refresh` | Yes | Refresh-on-401 retry | Done |
| JWT expiry detection | N/A (client logic) | Yes | Async native hydration before launch routing + expiry clear | Done |
| Role-based routing | N/A (client logic) | Yes | Yes | Done |
| Logout/session clear | N/A (client logic) | Yes | Yes | Done |
| Token expiry auto-redirect | N/A (client logic) | Yes | Clears expired sessions after native hydration | Done |

## Client VRS Screens

| Screen | Route Name | Web | Mobile | API Status |
|--------|-----------|-----|--------|------------|
| VRS Home | `vrs.home` | Yes | Yes | API profile refresh + local cache |
| Dial Pad | `vrs.dialPad` | Yes | Yes | Queue WebSocket |
| Contacts | `vrs.contacts` | Yes | API-backed list/search/favorites with local cache fallback | API + local cache |
| Contact Detail | `vrs.contactDetail` | Yes | API-backed detail/notes with cached selected contact fallback | API + local cache |
| Call History | `vrs.callHistory` | Yes | API-backed call history with local cache fallback; callback compliance still pending | API + local cache |
| Voicemail Inbox | `vrs.voicemail` | Yes | API-backed inbox/unread/seen/delete/playback URL with local cache fallback; embedded audio and recording/upload pending | API + local cache |
| Language selector | (inline on home) | Yes | Yes | Local storage |
| Captions toggle | (inline on home) | Yes | Yes | Local storage |
| Request Interpreter | Queue WebSocket | Yes | Yes | WebSocket |
| Cancel Request | Queue WebSocket | Yes | Yes | WebSocket |
| Auto-enter on match | Queue → Jitsi | Yes | Yes | WebSocket + middleware |

## Client VRI Screens

| Screen | Route Name | Web | Mobile | API Status |
|--------|-----------|-----|--------|------------|
| VRI Console | `vri.console` | Yes | Yes, including native camera self-view preview, pre-match invite preparation/share, and tenant accent theming | Queue WebSocket + media |
| VRI Settings | `vri.settings` | Yes | Yes | API preferences + local cache |
| VRI Usage | `vri.usage` | Yes | Yes | API usage + corporate billing summary hook + local cache |

## Interpreter / Captioner Native Scope

Interpreter and captioner native apps are intentionally out of scope for the current mobile stage. The active app targets are MalkaVRS, MalkaVRI, and MapleVRI. Interpreter/captioner workflows remain web/admin operational surfaces until the three client apps are production-stable.

## Queue & Call Lifecycle

| Event | WebSocket Message | Web | Mobile | Notes |
|-------|-------------------|-----|--------|-------|
| Request interpreter | `requestInterpreter` | Yes | Yes | Client-initiated |
| Prepare VRI invite | `prepare_vri_invite` | Yes | Yes | Mobile persists invite tokens and attaches them to the VRI queue request |
| Queue position update | `requestQueued` | Yes | Yes | Server push |
| Interpreter match | `matchFound` | Yes | Yes | Auto-enters room |
| Meeting initiated | `meetingInitiated` | Yes | Yes | Fallback match event |
| Cancel request | `cancelRequest` | Yes | Yes | Client-initiated |
| Interpreter request received | `interpreterRequest` | Yes | Deferred | Interpreter-side native app is out of current scope |
| Accept request | `acceptRequest` | Yes | Deferred | Interpreter-side native app is out of current scope |
| Decline request | `declineRequest` | Yes | Deferred | Interpreter-side native app is out of current scope |
| End call / CONFERENCE_LEFT | Jitsi event | Yes | Yes | Writes local CDR |
| Connection status | `connection` | Yes | Yes | WebSocket state |

## Jitsi / Conference

| Feature | Web | Mobile | Notes |
|---------|-----|--------|-------|
| Join room | Yes | Yes | Via appNavigate |
| Prejoin screen | Yes | Yes | hidePrejoin on match |
| Camera on/off | Yes | Yes | startWithVideoMuted |
| Mic on/off | Yes | Yes | startWithAudioMuted |
| Leave conference | Yes | Yes | Routes back by role |
| Self-view | Yes | Yes | Jitsi SDK |
| Toolbar actions | Yes | Partial | Jitsi default toolbar |

## Infrastructure

| Feature | Web | Mobile | Status |
|---------|-----|--------|--------|
| Shared Redux store | Yes | Yes | Done |
| Shared queue middleware | Yes | Yes | Done |
| Cross-platform storage | localStorage | AsyncStorage with async boot hydration | Done |
| Secure token storage | Cookie/localStorage | Keychain/Keystore-ready abstraction with persistent cache mirror | Done |
| Whitelabel config | window.__WHITELABEL__ | Static/env tenant fallback + AsyncStorage cache | Done |
| Tenant theme hook | CSS variables | useTenantTheme() | Done |
| Network status bar | N/A | Yes | Done |
| Shared API client | fetch + relative URLs | apiClient module | Done |
| Shared types | N/A | mobile/types.ts | Done |
| Deep linking | Yes | linking.ts (3 schemes + HTTPS); device verification pending | Partial |
| Push notifications | N/A | Notification-ready state; provider/release setup pending | Release gate |
| Background/lock reconnect | N/A | App-state lifecycle logging + queue reconnect/backoff | Done |
| Structured mobile logging | N/A | mobileLog buffer + backend flush endpoint | Done |
| Demo fixtures | N/A | demo-fixtures.ts | Done |
| CI mobile typecheck | N/A | GitHub Actions job; local `tsc:native` currently passes | Done |
| Privacy manifest | N/A | PrivacyInfo.xcprivacy | Done |
| Mobile QA matrix | N/A | docs/mobile-qa-matrix.md | Done |

## Accessibility

| Feature | Web | Mobile | Status |
|---------|-----|--------|--------|
| VoiceOver/TalkBack labels | Partial | First pass on all MVP mobile screens; device screen-reader smoke pending | Done |
| Dynamic Type/text scaling | Yes | Native text components preserve scaling on MVP screens | Done |
| Reduced motion | Yes | No required mobile motion beyond native/Jitsi transitions | Done |
| Color contrast (WCAG AA) | Yes | Yes (dark theme) | Done |
| Keyboard/switch access | Yes | MVP controls expose native focusable semantics; hardware smoke pending | Done |

## Not on Mobile (Intentional)

| Feature | Reason |
|---------|--------|
| Admin dashboard | Responsive web; no native admin app in MVP |
| Superadmin tenant management | Desktop-only |
| Captioner assignment UI | Web-only for MVP (caption publishing needs keyboard precision) |
| AI/ASL lab portal | Web-only |
| Billing/invoice management | Web admin only |
