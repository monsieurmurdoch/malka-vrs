# Mobile Parity Table

Route-by-route API/UI parity status between web and mobile surfaces.

> Last updated: April 30, 2026

## Legend

- **Done** — Implemented on both web and mobile
- **Partial** — Mobile has UI but API is mocked or uses local storage instead of server
- **Missing** — Not yet implemented on mobile
- **Web-only** — Intentionally not on mobile (e.g., admin, captioner)

---

## Authentication

| Feature | API Endpoint | Web | Mobile | Status |
|---------|-------------|-----|--------|--------|
| Email/password login | `POST /api/auth/login` | Yes | Yes (local mock) | Partial |
| Phone/SMS OTP login | `POST /api/auth/phone` | Yes | Missing | Missing |
| Password reset | `POST /api/auth/reset-password` | Yes | Missing | Missing |
| JWT refresh | `POST /api/auth/refresh` | Yes | Missing | Missing |
| Role-based routing | N/A (client logic) | Yes | Yes | Done |
| Logout/session clear | N/A (client logic) | Yes | Yes | Done |
| Role selector (Client/Interpreter) | N/A | Yes | Yes | Done |

## Client VRS Screens

| Screen | Route Name | Web | Mobile | API Status |
|--------|-----------|-----|--------|------------|
| VRS Home | `vrs.home` | Yes | Yes | Local storage |
| Dial Pad | `vrs.dialPad` | Yes | Yes | Queue WebSocket |
| Contacts | `vrs.contacts` | Yes | Yes | Local storage |
| Contact Detail | `vrs.contactDetail` | Yes | Yes | Local storage |
| Call History | `vrs.callHistory` | Yes | Yes | Local storage |
| Voicemail Inbox | `vrs.voicemail` | Yes | Yes | Local storage |
| Language selector | (inline on home) | Yes | Yes | Local storage |
| Captions toggle | (inline on home) | Yes | Yes | Local storage |
| Request Interpreter | Queue WebSocket | Yes | Yes | WebSocket |
| Cancel Request | Queue WebSocket | Yes | Yes | WebSocket |
| Auto-enter on match | Queue → Jitsi | Yes | Yes | WebSocket + middleware |

## Client VRI Screens

| Screen | Route Name | Web | Mobile | API Status |
|--------|-----------|-----|--------|------------|
| VRI Console | `vri.console` | Yes | Yes | Queue WebSocket |
| VRI Settings | `vri.settings` | Yes | Yes | Local storage |
| VRI Usage | `vri.usage` | Yes | Yes | Local storage |

## Interpreter Screens

| Screen | Route Name | Web | Mobile | API Status |
|--------|-----------|-----|--------|------------|
| Interpreter Home | `interpreter.home` | Yes | Yes | Queue WebSocket |
| Interpreter Settings | `interpreter.settings` | Yes | Yes | Local storage |
| Interpreter Earnings | `interpreter.earnings` | Partial | Yes | Local storage |
| Availability toggle | Queue WebSocket | Yes | Yes | WebSocket |
| Accept/Decline request | Queue WebSocket | Yes | Yes | WebSocket |
| Incoming request vibration | N/A | N/A | Yes | N/A |
| End call | Queue WebSocket | Yes | Yes | WebSocket |

## Queue & Call Lifecycle

| Event | WebSocket Message | Web | Mobile | Notes |
|-------|-------------------|-----|--------|-------|
| Request interpreter | `requestInterpreter` | Yes | Yes | Client-initiated |
| Queue position update | `requestQueued` | Yes | Yes | Server push |
| Interpreter match | `matchFound` | Yes | Yes | Auto-enters room |
| Meeting initiated | `meetingInitiated` | Yes | Yes | Fallback match event |
| Cancel request | `cancelRequest` | Yes | Yes | Client-initiated |
| Interpreter request received | `interpreterRequest` | Yes | Yes | Interpreter-side |
| Accept request | `acceptRequest` | Yes | Yes | Interpreter-initiated |
| Decline request | `declineRequest` | Yes | Yes | Interpreter-initiated |
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
| Cross-platform storage | localStorage | AsyncStorage | Done |
| Secure token storage | Cookie/localStorage | AsyncStorage (Keychain-ready) | Partial |
| Whitelabel config | window.__WHITELABEL__ | AsyncStorage cache | Partial |
| Tenant theme hook | CSS variables | useTenantTheme() | Done |
| Network status bar | N/A | Yes | Done |
| Shared API client | fetch + relative URLs | apiClient module | Done |
| Shared types | N/A | mobile/types.ts | Done |
| Deep linking | Yes | Jitsi default | Partial |
| Push notifications | N/A | Missing | Missing |
| Background/lock reconnect | N/A | Missing | Missing |

## Not on Mobile (Intentional)

| Feature | Reason |
|---------|--------|
| Admin dashboard | Responsive web; no native admin app in MVP |
| Superadmin tenant management | Desktop-only |
| Captioner assignment UI | Web-only for MVP |
| AI/ASL lab portal | Web-only |
| Billing/invoice management | Web admin only |
