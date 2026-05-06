# Release Go/No-Go Gates

This file defines the minimum gate for each public rollout lane. A release can
move forward only when every **Go** item is true and every **No-Go** item is
absent or explicitly accepted by the release owner.

## Maple VRI Pilot

**Go**
- Maple VRI client, interpreter, and tenant admin seed accounts log in on the staging or production target.
- Client requests interpreter; interpreter accepts; both enter the same room with camera/mic defaults respected.
- Admin can see the live queue item, interpreter availability, active call, call completion, and CDR.
- Maple VRI-only paths do not say "video relay" except in explicitly labelled Maple VRS test accounts.
- VRI invite links are scoped to the queue/session object and expire after unmatched timeout/session end.
- Billing CDR writes `call_type = vri`, tenant `maple`, currency CAD, and the expected minute rate source.
- Smoke evidence is attached to the release note: commands run, account set used, call ID, CDR ID, and known caveats.

**No-Go**
- Client or interpreter lands in different rooms after accept.
- Admin cannot distinguish Maple tenant/service mode from Malka traffic.
- Call end does not produce CDR evidence.
- Any Maple user-facing production path displays Malka branding or production Malka pricing.

## Malka VRI Beta

**Go**
- Malka VRI accounts land on the VRI console, not the VRS phone-number profile.
- Corporate account billing/usage is visible for day/week/month.
- Session invite preparation works before interpreter match, but guests do not enter a live room until interpreter-connected state.
- Stripe is configured in test mode for staging and live mode only after finance sign-off.
- Interpreter pool routing sends VRI work only to interpreters with VRI permission.

**No-Go**
- VRI client can start a live empty room without an interpreter.
- VRI CDRs use VRS call type or VRS rate defaults.
- Invite links can be reused after session end or timeout.

## Malka VRS Beta

**Go**
- VRS clients retain phone-number-oriented flow, contacts, history, voicemail, and interpreter request path.
- Interpreter queue request, accept/decline, match, room join, hangup, and CDR are smoke-tested.
- Linked hangup policy is verified for interpreted calls, and independent hangup behavior is preserved for non-interpreted rooms.
- Phone/SMS auth paths are verified only against staging/test Twilio numbers before production enablement.
- User-facing VRS copy, certified-partner assumptions, and NANP number handling have partner/legal/compliance review status recorded.
- Certified-partner operating boundaries are documented: partner-owned provider-of-record/regulatory duties versus Malka-owned platform/operator duties.

**No-Go**
- Request interpreter auto-rejects solely because no interpreter is currently online.
- Stale queue items can trigger new interpreter alerts after the client has cancelled/left.
- VRS login/identity can bypass the registered routable number requirement without documented compliance approval.

## Mobile Beta

**Go**
- MalkaVRS, MalkaVRI, and MapleVRI install from internal build lanes on real iOS and Android devices.
- Mobile auth uses production-backed endpoints for the selected environment and never demo JWTs.
- Tenant config resolves staging or production domains explicitly; no mobile beta build silently falls back to production from a staging build.
- Camera preview, prejoin/room join, external camera behavior where supported, queue request, and call history are smoke-tested on physical devices.
- Android release AABs pass 16 KB page-size checks; iOS builds are signed with the correct bundle IDs/app groups.

**No-Go**
- Login 404s in any beta app.
- App icon/name/skin mismatches the app being tested.
- Staging mobile build points to production API/queue domains.

## Full Production

**Go**
- Maple VRI pilot, Malka VRI beta, Malka VRS beta, and mobile beta gates have passed or have signed exceptions.
- Production staging rehearsal passes with separate DB, Stripe test mode, Twilio sandbox/test path, seeded accounts, smoke commands, and rollback plan.
- TURN/coturn fallback decision is complete and corporate-network behavior has been tested.
- Certified-partner requirements are captured for VRS launch scope, reporting/export needs, support escalation, number/eligibility status, and emergency-handling hooks.
- Incident/support runbooks exist for restart, stale queue, CDR integrity, voicemail playback, billing disputes, and account lockouts.
- Data retention/privacy matrix is approved for CDRs, audit logs, voicemail media, captions/transcripts, VRI links, chat/TTS, and mobile logs.
- Monitoring/alerting covers service down, queue wait, JVB CPU/media health, DB latency, disk, memory, and error rate.

**No-Go**
- Production shares a database, Stripe account mode, Twilio number, or JWT signing key with staging.
- Call lifecycle evidence cannot be reconstructed from logs/CDRs/audit records.
- Any legal/compliance blocker is unresolved for the market being launched.
