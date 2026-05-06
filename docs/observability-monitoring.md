# Observability and Monitoring Decisions

Last updated: 2026-05-05

## Baseline

Production services should emit structured JSON logs when `NODE_ENV=production` and readable pretty logs in local/dev. `LOG_LEVEL` is the common control across VRS, ops, and Twilio services.

HTTP and WebSocket entry points should carry a correlation/request ID:

- HTTP: accept `X-Request-Id` or `X-Correlation-Id`, set both response headers, and bind the ID to request logs.
- WebSocket: accept `x-request-id` or `x-correlation-id` during upgrade, propagate `correlationId` in message envelopes, and echo it on outbound queue/call messages.
- Call lifecycle: log `request_created`, `queue_join`, `interpreter_match`, `room_created`, `call_start`, `call_end`, and error variants with call/request/room IDs where available.

## DigitalOcean Monitoring Decision

Use DigitalOcean Monitoring as the infrastructure baseline for Droplet-level CPU, memory, disk, and availability signals. Keep Prometheus/Grafana as the app and media-health source of truth because it already covers queue, WebSocket, DB, JVB, and call-quality metrics.

Operational rule: DigitalOcean alerts are coarse production wakeups; Prometheus alerts are the diagnostic and SLA layer.

## External APM Decision

Use an OpenTelemetry-first, vendor-neutral path. Do not commit to Datadog or New Relic yet.

Near term:

- Keep structured logs and Prometheus metrics stable.
- Add OpenTelemetry SDK/exporter wiring behind env flags when app traces become necessary.
- Pick an OTLP-compatible vendor later if hosted traces/log correlation are needed.

This keeps the platform portable while preserving the option to adopt Datadog, New Relic, Honeycomb, Grafana Cloud, or another OTLP backend.

## Required Alert Coverage

Prometheus rules must cover:

- Service down: `VRSServiceDown`
- Queue wait: `VRSQueueWaitTimeTooHigh`
- Queue depth/capacity: `VRSQueueDepthSpike`, `VRSCallCapacityNearLimit`
- JVB CPU/media health: `VRSJvbCpuHigh`, `VRSJvbMemoryHigh`, `VRSJvbDown`, call-quality alerts
- DB latency/availability: `VRSDatabaseSlowQueries`, `VRSDatabaseDown`
- Host disk/memory: `VRSHostDiskSpaceLow`, `VRSHostMemoryHigh`
- Error rate/WebSocket errors: `VRSHighErrorRate`, `VRSWebSocketErrors`

Before production escalation is considered complete, every alert should have an owner, notification route, and runbook link.
