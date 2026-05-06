# Data Retention and Privacy Matrix

This matrix is the default engineering policy until legal/compliance approves a
market-specific retention schedule. Where law, contract, payer policy, or
litigation hold requires a longer period, that requirement overrides this table.

Principles:

- Collect the minimum data needed for service delivery, billing, safety, and
  support.
- Keep call media and conversation content out of long-term storage unless the
  user explicitly records/saves it or the feature legally requires it.
- Keep tenant data separated in access controls and exports.
- Never store secrets, full JWTs, payment card data, or raw access tokens in
  application logs.

| Data class | Purpose | Classification | Storage | Default retention | Access | Deletion/expiry | Notes/status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CDRs and billing CDR status history | Billing, TRS/VRI invoice evidence, dispute handling, audit reconstruction | Restricted billing/accounting data; may contain identifiers and service metadata | PostgreSQL billing tables; append-only CDR model | 7 years proposed, pending legal/accounting approval | Admin billing, finance, superadmin, audited support escalation | No hard delete in normal operations; corrections use status transitions, disputes, credit notes, or write-offs | `call_type` and CDR records are immutable by design. Do not fabricate missing CDRs. |
| Admin/audit logs | Account/permission changes, billing changes, security investigation | Restricted operational/security data | PostgreSQL audit tables and structured service logs | 7 years proposed for admin/billing audit; shorter operational logs may rotate by logging backend | Superadmin, security, compliance, limited engineering on incident | Rotate/export according to logging backend; preserve under incident/legal hold | Audit exports must be tenant scoped where applicable. |
| Voicemail media and thumbnails | User voicemail playback, unread badge, support diagnostics | User-generated media; potentially sensitive conversation content | S3-compatible object storage plus voicemail metadata in PostgreSQL | Tenant-configurable; 30-90 days proposed default unless user/admin retention setting differs | Message owner, authorized tenant admin/support for diagnostics, service account | Expiry job deletes metadata/media according to policy; admin can verify with expiry status/run-now endpoint | Storage-check endpoint writes/reads/deletes only a temporary health object. |
| Captions/transcripts | Live accessibility display and optional future transcript features | Conversation content; highly sensitive | Ephemeral in-room state by default; persistent transcript storage is not approved by default | Ephemeral by default; if persisted later, retention requires explicit consent and legal approval | Live participants while session is active; support only if transcript feature is explicitly enabled | Discard at session end unless a consented transcript feature is enabled | Do not use captions/transcripts for AI training without separate consent, de-identification policy, and approved retention. |
| VRI invite links/tokens | Let client prepare/share guest access tied to a VRI queue/session | Session access token and tenant/session metadata | PostgreSQL/session store for invite token metadata | Until session end or short unmatched timeout | Session host/client, invited guest, authorized admin/support for troubleshooting | Expire automatically after session end/unmatched timeout; old tokens should not be extended | Guests must land in waiting/prejoin until interpreter-connected room is live. |
| Chat, TTS, and VCO messages | Live in-room communication and TTS playback | Conversation content; potentially sensitive | Ephemeral in-room/client state by default | Ephemeral by default; no long-term storage unless a future consented history feature is approved | Live participants while session is active | Discard at room end/session cleanup | Logs must not capture full message bodies except short, consented diagnostic snippets approved for support. |
| Mobile structured logs | App diagnostics, queue/call lifecycle debugging, crash triage | Operational telemetry; must not contain secrets/media/conversation content | Device local buffer and future crash/log backend | Local buffer capped at 500 entries; 14-30 days proposed if uploaded | User device, engineering/support with explicit diagnostic upload or crash-report policy | Local logout clears session data; uploaded logs rotate by backend retention | Redact tokens, invite links, phone numbers where possible. Add request/session IDs instead of content. |
| Call lifecycle logs | Reconstruct request created, queue join, interpreter match, room created, call start/end, errors | Operational metadata with user/call identifiers | Structured service logs and database event/audit tables | 30-90 days for operational logs proposed; CDR/audit records follow their own row | Engineering/support/security by incident need | Logging backend rotation; preserve under incident/legal hold | Required for production support but should avoid media/content payloads. |

## Legal and Product Decisions Still Needed

- Market-specific regulatory/partner retention for VRS data operated through a certified provider or other approved market path.
- Whether any caption/transcript persistence will exist, and what consent screen
  is required.
- Whether AI training data can ever be derived from calls, and under what
  explicit consent, de-identification, opt-out/delete, and non-production data
  boundary.
- Final voicemail retention default per tenant and whether corporate VRI
  accounts can set shorter policies.
- Final mobile log upload path and crash-reporting vendor retention.
