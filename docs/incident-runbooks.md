# Incident Runbooks

These runbooks are for production and staging incidents. Use the staging target
first when reproducing or rehearsing. Do not paste secrets, access tokens, phone
numbers, voicemail links, or call media into public status updates.

## Before You Touch Production

1. Identify the affected tenant and service mode: Malka VRS, Malka VRI, Maple
   VRI, Twilio voice bridge, ops/admin, or Jitsi/media.
2. Capture the current symptom and timestamp in the incident notes.
3. Check current health before restarting anything:

```sh
curl -fsS https://vrs.malkacomm.com/api/health
curl -fsS https://vrs.malkacomm.com/api/readiness
curl -fsS https://vri.maplecomm.ca/api/health
curl -fsS https://ops.malkacomm.com/api/readiness
curl -fsS https://vrs.malkacomm.com/twilio/api/readiness
docker compose -f docker-compose.prod.yml ps
```

4. If media is affected, check whether signalling is healthy separately from
   media transport. A healthy login/queue path does not prove UDP media is
   working.

## Restart VRS Safely

Use this when client/interpreter profile, queue HTTP APIs, billing APIs, or
tenant web apps are unhealthy but Postgres, nginx, and Jitsi are healthy.

Impact: active WebSocket connections reconnect; active Jitsi media rooms should
continue if Jitsi is not restarted, but queue state may briefly stop updating.

```sh
docker compose -f docker-compose.prod.yml restart vrs vrs-maple
docker compose -f docker-compose.prod.yml logs --tail=100 vrs vrs-maple
curl -fsS https://vrs.malkacomm.com/api/readiness
curl -fsS https://vri.maplecomm.ca/api/readiness
```

Validation:

- Malka and Maple readiness return `ready: true` or the documented readiness
  shape for the current deploy.
- A client can log in and open the profile screen.
- A queue status request returns without a 5xx.

Rollback:

- If restart worsens the incident, stop and use the deploy rollback procedure
  for the last known good image/commit. Do not repeatedly restart in a loop.

## Restart Ops/Admin Safely

Use this when admin dashboard, ops health, audit export, or moderation controls
are unhealthy while user-facing calls still work.

Impact: admin dashboard sessions may need refresh. Client/interpreter calls are
not expected to drop.

```sh
docker compose -f docker-compose.prod.yml restart ops
docker compose -f docker-compose.prod.yml logs --tail=100 ops
curl -fsS https://ops.malkacomm.com/api/readiness
```

Validation:

- Admin login works.
- Active interpreters/current queue views load.
- Audit export and account moderation endpoints do not return 5xx.

## Restart Twilio Safely

Use this for Twilio webhook/readiness failures, phone/SMS bridge issues, or VRS
voice bridge trouble. Avoid restarting Twilio during an active voice-bridge
test unless the incident owner accepts the drop risk.

```sh
docker compose -f docker-compose.prod.yml restart twilio
docker compose -f docker-compose.prod.yml logs --tail=100 twilio
curl -fsS https://vrs.malkacomm.com/twilio/api/readiness
```

Validation:

- `/twilio/api/readiness` is healthy.
- Twilio webhook URLs still point at the expected production or staging host.
- A sandbox/test Twilio path succeeds before live phone-number testing resumes.

## Restart Jitsi Safely

Use this only when Jitsi signalling/media is unhealthy. Restarting Jitsi can
drop active rooms. Prefer off-hours or announce impact first.

Restart order:

```sh
docker compose -f docker-compose.prod.yml restart prosody
docker compose -f docker-compose.prod.yml restart jicofo
docker compose -f docker-compose.prod.yml restart jvb
docker compose -f docker-compose.prod.yml logs --tail=100 prosody jicofo jvb
```

If the TURN profile is enabled, restart coturn before Prosody so fresh TURN
credentials are advertised after Prosody comes back:

```sh
docker compose -f docker-compose.prod.yml --profile turn restart coturn
docker compose -f docker-compose.prod.yml restart prosody jicofo jvb
docker compose -f docker-compose.prod.yml --profile turn logs --tail=100 coturn
```

Validation:

- Two-browser media smoke: client joins, interpreter joins, both see audio/video.
- UDP 10000 is reachable from outside the Droplet network.
- If testing from a restrictive network, coturn logs show allocations and the
  browser selected a `relay` ICE candidate.
- JVB logs show media endpoints joining without ICE failure loops.

## Clear Stale Queue Items

Use this when interpreters receive alerts for calls that the client already
cancelled/left, or when waiting items are visibly stale in admin.

1. Pause queue dispatch if stale alerts are actively firing:

```sh
curl -fsS -X POST https://vrs.malkacomm.com/api/admin/queue/pause \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{}'
```

2. Inspect queue state:

```sh
curl -fsS https://vrs.malkacomm.com/api/admin/queue \
  -H "Authorization: Bearer $ADMIN_JWT"
```

3. Remove only confirmed stale request IDs:

```sh
curl -fsS -X DELETE https://vrs.malkacomm.com/api/admin/queue/$REQUEST_ID \
  -H "Authorization: Bearer $ADMIN_JWT"
```

4. Resume queue dispatch:

```sh
curl -fsS -X POST https://vrs.malkacomm.com/api/admin/queue/resume \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Validation:

- Waiting count decreases only by the stale items removed.
- Interpreters no longer receive alerts for the removed request IDs.
- New client requests still enter the queue and can be matched.

## Verify Media Health

Use this when users report black/frozen video, no audio, external camera issues,
or ICE/TURN warnings.

Checks:

```sh
curl -fsS https://vrs.malkacomm.com/api/readiness
docker compose -f docker-compose.prod.yml logs --tail=200 jvb
docker compose -f docker-compose.prod.yml logs --tail=200 prosody jicofo
```

External UDP check from a network outside the Droplet:

```sh
nc -zvu vrs.malkacomm.com 10000
```

TURN checks from a network outside the Droplet:

```sh
nc -zvu vrs.malkacomm.com 3478
nc -zv vrs.malkacomm.com 3478
docker compose -f docker-compose.prod.yml --profile turn logs --tail=100 coturn
```

Port checks only prove reachability. A real TURN smoke must verify relay usage
with browser WebRTC internals or equivalent candidate stats:

- Open a call from a network that blocks direct UDP 10000.
- Confirm the call still connects.
- Confirm the selected candidate pair uses `relay`.
- Confirm coturn logs an allocation for the client public IP.

Human smoke:

- Client and interpreter join the same room.
- Each side toggles camera off/on; the remote tile changes to inactive state,
  not a misleading frozen frame.
- Each side toggles mic off/on.
- A browser reload rejoins the same active room when expected.

## Verify CDR Integrity

Use this after call-end bugs, billing disputes, or any queue/match incident.

1. Capture the call ID and tenant from admin active calls or logs.
2. Query CDR detail:

```sh
curl -fsS "https://vrs.malkacomm.com/api/billing/cdrs/$CDR_ID" \
  -H "Authorization: Bearer $ADMIN_JWT"
```

3. Confirm:

- `call_id` matches the app call record.
- `call_type` is `vrs` or `vri` as expected and was not mutated after create.
- Tenant, corporate account, interpreter, client, start time, end time, and
  billable seconds are present.
- Status transitions explain billing state changes.
- For VRI invoices, invoice item linkage points back to immutable CDRs.

If CDR evidence is missing, mark billing as blocked for that call and open an
engineering incident. Do not manually fabricate a CDR.

## Communicate User Impact

Use a short incident note with:

- Tenant and service mode affected.
- User-facing symptom.
- Start time and current status.
- Expected next update time.
- Workaround, if any.
- Whether active calls, queue matching, voicemail, billing, or admin visibility
  are affected.

Do not include PHI/PII, phone numbers, voicemail URLs, call media, full JWTs, or
raw CDR exports in user-facing communications.
