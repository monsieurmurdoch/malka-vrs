# VRS Server JS/TS Migration Boundary

This document defines the current migration line so new work does not drift between legacy JavaScript, TypeScript source, and checked-in compatibility output.

## Canonical TypeScript Surfaces

New business logic should live in TypeScript when it touches:

- `vrs-server/src/server.ts` for server bootstrap and route mounting.
- `vrs-server/src/database.ts` for typed database helpers.
- `vrs-server/src/lib/queue-service.ts` for authoritative WebSocket queue behavior and call lifecycle events.
- `vrs-server/src/lib/voicemail-service.ts`, `storage-service.ts`, `handoff-service.ts`, and `activity-logger.ts` for shared backend services.
- `react/features/interpreter-queue/InterpreterQueueService.ts` for the typed web/native queue client event contract.

## Legacy JavaScript Compatibility Surfaces

The following files can remain JavaScript until their owning route group is migrated, but they should not receive new business logic beyond small fixes:

- `vrs-server/routes/*.js`
- `vrs-server/lib/validation.js`
- top-level compatibility bridges such as `vrs-server/server.js` and `vrs-server/database.js`

When adding a new route or changing a high-risk payload shape, prefer a TypeScript source module and mount it from the existing server. Only patch legacy JS routes directly when the change is intentionally surgical.

## Validation Boundary

Runtime validation remains shared through the existing validation bridge while route migration is in progress. New POST/PUT/PATCH payloads should add or reuse explicit schemas, then expose typed request/response shapes to web and native callers.

## WebSocket Boundary

Server-side queue state and matching rules belong in `vrs-server/src/lib/queue-service.ts`. Client-side normalization and event typing belong in `react/features/interpreter-queue/InterpreterQueueService.ts`; middleware and screens should consume typed event payloads instead of casting raw WebSocket data.

## Compiled Output Boundary

Checked-in `vrs-server/dist/*` remains part of the deployment compatibility contract for now. If source changes compile into `dist`, commit both together. The next hardening step is a CI check that proves source and generated output are in sync, or a deployment change that removes checked-in `dist` from the contract.

## Remaining Migration Order

1. Move route groups from `vrs-server/routes/*.js` to TypeScript as each route receives feature work.
2. Replace `vrs-server/lib/validation.js` with exported typed schemas once most route payloads are stable.
3. Centralize API/WebSocket contracts so server, web, native, and smoke scripts import the same types.
4. Decide whether checked-in `dist` stays long-term; enforce whichever policy we choose in CI.
