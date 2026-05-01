# Observability Plan

Last updated: May 1, 2026

## Logging

All runtime services use structured logs with a shared contract:

- `LOG_LEVEL` controls verbosity: `error`, `warn`, `info`, or `debug`.
- Production (`NODE_ENV=production`) emits newline-delimited JSON.
- Local/dev emits compact pretty logs.
- Every HTTP service returns and logs `X-Request-Id`.
- WebSocket connections inherit `X-Request-Id` when present or generate one at connection time.
- Sensitive fields such as passwords, auth tokens, cookies, and authorization headers are redacted.

Runtime services covered:

- VRS server: Pino logger in `vrs-server/lib/logger.js` and `vrs-server/src/lib/logger.ts`.
- Ops server: local structured logger in `vrs-ops-server/src/logger.ts`.
- Twilio voice server: local structured logger in `twilio-voice-server/logger.js`.

## Call Lifecycle Events

The following event names are logged with structured fields such as `requestId`, `callId`, `roomName`, `clientId`, `interpreterId`, `language`, `callType`, and duration where available:

- `call_lifecycle.request_created`
- `call_lifecycle.queue_join`
- `call_lifecycle.request_queued`
- `call_lifecycle.interpreter_match`
- `call_lifecycle.interpreter_match_failed`
- `call_lifecycle.room_created`
- `call_lifecycle.call_start`
- `call_lifecycle.call_end`
- `call_lifecycle.call_end_failed`
- `call_lifecycle.twilio_call_start_requested`
- `call_lifecycle.twilio_call_started`
- `call_lifecycle.twilio_webhook_status`

## Metrics And Monitoring

Decision: use DigitalOcean Monitoring for host and Droplet basics, and keep Prometheus-compatible `/metrics` on the VRS server for app/Jitsi metrics.

Required DigitalOcean alert policies:

- Service down: HTTP readiness probe fails for VRS, ops, or Twilio for 2 consecutive checks.
- Droplet CPU: greater than 80% for 5 minutes.
- Droplet memory: greater than 85% for 5 minutes.
- Disk usage: greater than 80% for 10 minutes.
- JVB CPU: `vrs_jvb_cpu_usage_percent > 80` for 5 minutes.
- Queue wait: p95 queue wait greater than 60 seconds for 5 minutes.
- DB latency: p95 DB query duration greater than 250 ms for 5 minutes.
- Error rate: HTTP 5xx rate greater than 1% for 5 minutes.

## APM Decision

Decision: OpenTelemetry-first, vendor-neutral.

The VRS server already initializes OpenTelemetry via `vrs-server/lib/tracing.js`. Keep the code vendor-neutral and send OTLP traces/metrics to a collector through `OTEL_EXPORTER_OTLP_ENDPOINT`. Datadog or New Relic can be attached later by pointing the collector/exporter at that vendor, without changing app code.

Initial environment:

```env
LOG_LEVEL=info
NODE_ENV=production
OTEL_SERVICE_NAME=malka-vrs
OTEL_EXPORTER_OTLP_ENDPOINT=
```
