# NPM Audit Review

Last reviewed: 2026-05-03

Commands run:

- `npm --prefix vrs-server audit --audit-level=moderate`
- `npm --prefix vrs-ops-server audit --audit-level=moderate`
- `npm --prefix twilio-voice-server audit --audit-level=moderate`

The first sandboxed run could not reach `registry.npmjs.org`; the commands were rerun with network access.

## Findings

### `vrs-server`

- `fast-xml-parser <5.7.0`, moderate. Fix available with `npm audit fix`.
- `uuid <14.0.0`, moderate. Fix requires `npm audit fix --force` and upgrades `uuid` to a breaking major.

Upgrade plan:

- Run `npm audit fix` for the non-breaking `fast-xml-parser` path, then rebuild and smoke the VRS server.
- Handle `uuid` separately by auditing all `uuid` imports/usages and upgrading intentionally, because `uuid@14` is a breaking major.

### `vrs-ops-server`

- `uuid <14.0.0`, moderate. Fix requires `npm audit fix --force` and upgrades `uuid` to a breaking major.

Upgrade plan:

- Handle with the same dedicated `uuid` upgrade as `vrs-server`.

### `twilio-voice-server`

- 2026-05-03: Remediated on `codex/release-runbooks-audit` with `npm --prefix twilio-voice-server audit fix`.
- Follow-up `npm --prefix twilio-voice-server audit --audit-level=moderate` reports `found 0 vulnerabilities`.
- Syntax check `node --check twilio-voice-server/server.js` passes.

Upgraded transitive packages include:

- `axios` to `1.16.0`
- `express` to `4.22.1`
- `body-parser` to `1.20.5`
- `jws` to `3.2.3`
- `path-to-regexp` to `0.1.13`
- `qs` to patched `6.14.x/6.15.x` ranges in the lockfile
- `follow-redirects` to `1.16.0`
- `brace-expansion`, `minimatch`, and `picomatch` to patched versions

Remaining follow-up:

- Run a real Twilio webhook/call smoke before production Twilio use. This is a runtime verification step, not an audit blocker.
