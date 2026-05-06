# Support and Admin Runbooks

These runbooks are for support/admin workflows that should not require a code
deploy. Escalate to engineering when evidence shows data corruption, missing
CDRs, repeated 5xx responses, or cross-tenant visibility.

## Stale Calls

Symptoms:

- Client or interpreter still appears in an active call after leaving.
- Interpreter receives an old incoming request.
- Admin active calls count does not match the actual room.

Steps:

1. Confirm whether this is an interpreted call or a non-interpreted instant/P2P
   room. Linked hangup policy applies only to interpreted calls.
2. Check active calls:

```sh
curl -fsS https://vrs.malkacomm.com/api/admin/calls/active \
  -H "Authorization: Bearer $ADMIN_JWT"
```

3. Check queue:

```sh
curl -fsS https://vrs.malkacomm.com/api/admin/queue \
  -H "Authorization: Bearer $ADMIN_JWT"
```

4. If the queue item is stale and the client is no longer waiting, delete the
   queue request by ID.
5. If a billing CDR was already written, verify CDR integrity before making any
   billing adjustment.

Escalate when:

- The same call ID reappears after deletion.
- A completed call remains billable without an end timestamp.
- The stale call crosses tenant boundaries.

## Interpreter No-Answer or Decline Loops

Symptoms:

- Client waits while the same interpreter repeatedly receives/declines/no-answers.
- Interpreter says they are unavailable but admin shows them eligible.

Steps:

1. Confirm interpreter state in admin unified operations table.
2. If the interpreter is intentionally away, move them to unavailable/on-break
   from the interpreter profile or admin moderation path.
3. Confirm service-mode and language eligibility. VRI-only interpreters should
   not receive VRS work, and VRS-only interpreters should not receive VRI work.
4. Check queue age and whether other eligible interpreters are available.
5. If the same stale request is being recycled, pause queue dispatch, delete the
   stale request, then resume dispatch.

Escalate when:

- The interpreter's state flips back to available without their action.
- Queue assignment ignores tenant, language, or service-mode permissions.
- No-answer/decline events are not visible in logs or admin evidence.

## Stuck VRI Invites

Symptoms:

- Guest invite link opens but never becomes joinable.
- Guest sees a waiting/prejoin screen after interpreter is already connected.
- Link remains usable after the session ended.

Steps:

1. Confirm the invite belongs to the current queue/session object.
2. Confirm the interpreter match has occurred and the room is live.
3. Ask the guest to reopen the latest invite link; old links may have expired or
   been superseded.
4. If unmatched timeout or session end has passed, create/send a new invite from
   the active VRI session instead of extending an old token.
5. Verify no guest entered a live room before interpreter-connected state.

Escalate when:

- Expired invite links still open a live room.
- A guest can join a different tenant's room.
- The invite token cannot be traced to a queue/session object.

## Account Lockouts

Symptoms:

- Client, interpreter, captioner, or admin cannot log in after valid attempts.
- Password reset does not arrive.
- Account permissions appear wrong after tenant/service-mode change.

Steps:

1. Confirm the user is using the correct tenant host:
   `vrs.malkacomm.com` for Malka VRS, `vri.maplecomm.ca` for Maple VRI.
2. Confirm role and tenant in admin account moderation.
3. Check whether the user is locked by rate limiting or disabled status.
4. For password issues, trigger the password reset flow or set a temporary
   password only through the approved admin path.
5. For interpreter/captioner accounts, verify language and service-mode
   permissions after restoring access.

Escalate when:

- A Maple account can authenticate into Malka-only data or vice versa.
- Admin role changes are missing from audit export.
- Reset links or temporary credentials appear in logs.

## Voicemail Playback Failures

Symptoms:

- Inbox shows voicemail but playback fails.
- Unread badge is wrong.
- Thumbnail is missing or broken.
- Expired message remains playable.

Steps:

1. Check voicemail subsystem settings and message status in admin.
2. Run storage probe:

```sh
curl -fsS -X POST https://vrs.malkacomm.com/api/admin/voicemail/storage-check \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{}'
```

3. Check expiry status:

```sh
curl -fsS https://vrs.malkacomm.com/api/admin/voicemail/expiry-status \
  -H "Authorization: Bearer $ADMIN_JWT"
```

4. If the retention job is overdue, run one manual expiry pass:

```sh
curl -fsS -X POST https://vrs.malkacomm.com/api/admin/voicemail/expire-now \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{}'
```

5. If playback URL fails but storage probe passes, escalate with message ID,
   tenant, object key, content type, and browser/network details.

Escalate when:

- Object storage read/write probe fails.
- Media exists but presigned playback URLs are generated for the wrong tenant.
- Expired media remains readable.

## Billing Disputes

Symptoms:

- Corporate client disputes VRI minutes or rate.
- Interpreter payout preview does not match call history.
- Invoice total differs from CDR totals.

Steps:

1. Identify account, tenant, invoice ID, call ID/CDR ID, and billing period.
2. Query CDR detail and status history:

```sh
curl -fsS "https://vrs.malkacomm.com/api/billing/cdrs/$CDR_ID" \
  -H "Authorization: Bearer $ADMIN_JWT"
```

3. Query billing audit evidence:

```sh
curl -fsS "https://vrs.malkacomm.com/api/billing/audit?entityId=$CDR_ID" \
  -H "Authorization: Bearer $ADMIN_JWT"
```

4. Confirm rate source, currency, billable duration, invoice linkage, credit
   notes, and reconciliation state.
5. If a correction is warranted, use the credit-note/dispute flow. Do not edit
   immutable CDR fields.

Escalate when:

- CDR is missing for a completed interpreted call.
- CDR call type, tenant, or duration conflicts with call lifecycle evidence.
- Stripe or invoice state cannot be reconciled to local billing records.
