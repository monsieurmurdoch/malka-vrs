# NPM Audit Review

Last reviewed: 2026-05-01

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

- `axios 1.0.0 - 1.14.0`, high. Fix available with `npm audit fix`.
- `jws <3.2.3`, high. Fix available with `npm audit fix`.
- `express 4.0.0-rc1 - 4.21.2`, high via `body-parser`, `qs`, and `path-to-regexp`. Fix available with `npm audit fix`.
- `minimatch <=3.1.3`, high. Fix available with `npm audit fix`.
- `picomatch <=2.3.1`, high. Fix available with `npm audit fix`.
- `brace-expansion <1.1.13`, moderate. Fix available with `npm audit fix`.
- `follow-redirects <=1.15.11`, moderate. Fix available with `npm audit fix`.
- `qs <=6.14.1`, moderate. Fix available with `npm audit fix`.

Upgrade plan:

- Run `npm --prefix twilio-voice-server audit fix` on its own branch, then run syntax checks and a Twilio webhook/call smoke.
- Prioritize this before production use of the Twilio bridge because several findings are high severity and network-facing.

