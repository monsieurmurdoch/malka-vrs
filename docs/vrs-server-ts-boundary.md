# VRS Server JS/TS Migration Boundary

This document defines the current migration line so new work does not drift between legacy JavaScript, TypeScript source, and checked-in compatibility output.

## Canonical TypeScript Surfaces

New business logic should live in TypeScript when it touches:

- `vrs-server/src/server.ts` for server bootstrap and route mounting.
- `vrs-server/src/database.ts` for typed database helpers.
- `vrs-server/src/lib/queue-service.ts` for authoritative WebSocket queue behavior and call lifecycle events.
- `vrs-server/src/lib/voicemail-service.ts`, `storage-service.ts`, `handoff-service.ts`, and `activity-logger.ts` for shared backend services.
- `react/features/interpreter-queue/InterpreterQueueService.ts` for the typed web/native queue client event contract.
- `contracts/` for shared API response schemas, queue/WebSocket event schemas, and smoke endpoint manifests consumed by web, native, server tests, and smoke scripts.

## Legacy JavaScript Compatibility Surfaces

The following files can remain JavaScript until their owning route group is migrated, but they should not receive new business logic beyond small fixes:

- `vrs-server/routes/*.js`
- `vrs-server/lib/validation.js`
- top-level compatibility bridges such as `vrs-server/server.js` and `vrs-server/database.js`

When adding a new route or changing a high-risk payload shape, prefer a TypeScript source module and mount it from the existing server. Only patch legacy JS routes directly when the change is intentionally surgical.

## Validation Boundary

Runtime validation remains shared through the existing validation bridge while route migration is in progress. New POST/PUT/PATCH payloads should add or reuse explicit schemas, then expose typed request/response shapes through `contracts/` to web and native callers.

## WebSocket Boundary

Server-side queue state and matching rules belong in `vrs-server/src/lib/queue-service.ts`. Shared queue event names and payload contracts belong in `contracts/queue.ts`. Client-side normalization belongs in `react/features/interpreter-queue/InterpreterQueueService.ts`; middleware and screens should consume typed event payloads instead of casting raw WebSocket data.

## Compiled Output Boundary

Checked-in `vrs-server/dist/*` remains part of the deployment compatibility contract for now. If source changes compile into `dist`, commit both together. CI enforces this with `npm run check:vrs-dist-sync`, which rebuilds `vrs-server` and fails if `vrs-server/dist`, `vrs-server/server.js`, or `vrs-server/database.js` differ from source-controlled output.

## Remaining Migration Order

1. Move route groups from `vrs-server/routes/*.js` to TypeScript as each route receives feature work.
2. Replace `vrs-server/lib/validation.js` with exported typed schemas once most route payloads are stable.
3. Continue moving legacy route response shapes into `contracts/api.ts` as route groups migrate.
4. Revisit checked-in `dist` after deployment can reliably build from source on the target.
