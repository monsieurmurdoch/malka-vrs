# Interpreter Mobile MVP Decisions

> Decision date: April 30, 2026
> Applies to: May 2026 mobile release (MalkaVRS + MalkaVRI)

## Scope Decisions

### In MVP (May release)

| Feature | Decision | Rationale |
|---------|----------|-----------|
| Availability toggle | **Included** | Core function. Interpreter goes online/offline. |
| Accept/Decline requests | **Included** | Core function. Interpreter accepts or declines each incoming request. |
| End call | **Included** | Core function. Interpreter ends active call from home screen. |
| Client context before accept | **Included** | Shows service type (VRS/VRI), language, and timestamp. |
| Settings (profile, modes, languages) | **Included** | Interpreter sets display name, service modes (VRS/VRI/captioning), language pairs. |
| Earnings summary | **Included (local)** | Reads from local call history. Shows payable minutes, day/week/month breakdown. Invoice/payout are placeholders. |
| Foreground vibration alert | **Included** | Vibration pattern on incoming request when app is foregrounded. |
| Network status bar | **Included** | Shows WebSocket connection state on interpreter home. |

### Deferred to Post-May

| Feature | Decision | Rationale |
|---------|----------|-----------|
| Schedule/shift management | **Deferred** | Requires backend scheduling system. Interpreter schedule is admin-managed in web for MVP. |
| Break management | **Deferred** | Interpreter sets "unavailable" to take a break. No formal break timer or auto-resume in MVP. |
| Teaming | **Deferred** | Complex feature. Requires team assignment, handoff protocol, and supervisor monitoring. Not needed for pilot. |
| Push notifications (APNs/FCM) | **Deferred** | Requires Apple/Google developer accounts, push cert provisioning, and background processing setup. Interpreter must keep app foregrounded for MVP. |
| CallKit / ConnectionService | **Deferred** | Requires push notification infrastructure. Foreground-only for MVP. |
| Interpreter schedule view | **Deferred** | Depends on backend scheduling system. |
| Interpreter notes/preferences | **Deferred** | Nice-to-have. Interpreter can update profile name and language pairs in settings. |
| Post-call survey | **Deferred** | Not needed for pilot. |
| Real-time analytics | **Deferred** | Web-only for MVP. Mobile shows local earnings summary. |

### Break Handling (MVP)

Interpreter breaks are handled by the availability toggle:
- **Go offline** = break/unavailable. No incoming requests.
- **Go available** = back online. Receives requests.
- No formal break timer, auto-resume, or admin-enforced break schedule in MVP.
- Admin sees interpreter status in web dashboard (available/offline/in-session).

### Scheduling (MVP)

- No interpreter-facing scheduling in the mobile app.
- Admin manages interpreter schedules and shift assignments via the web admin portal.
- Interpreter sees their current status and earnings, not their shift calendar.

### Teaming (MVP)

- No teaming in MVP. Each interpreter works independently.
- Post-May: team lead can monitor team members, assign requests, and handle handoffs.

## Mobile Interpreter App vs Web Interpreter Portal

For the May release:
- **Mobile app**: Availability, accept/decline, end call, settings, earnings summary.
- **Web portal**: Full interpreter profile, schedule, analytics, team management, billing detail.

The mobile app is a companion tool for the interpreter on the go, not a replacement for the web portal.
