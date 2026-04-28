# AGENTS.md

Repository instructions for unattended Codex and Symphony runs.

## Project Shape

- MalkaVRS is a Jitsi Meet based VRS/VRI platform with custom Node services.
- Main app/frontend assets live at the repo root and under `react/`.
- Main VRS backend lives in `vrs-server/`.
- Ops/admin backend lives in `vrs-ops-server/`.
- Twilio bridge lives in `twilio-voice-server/`.
- Deployment and production Docker config live in `deploy/`, `docker-compose*.yml`, and `Dockerfile.*`.

## Setup

Use documented commands only:

```bash
npm ci
npm --prefix vrs-server ci
npm --prefix vrs-ops-server ci
```

Only install Twilio dependencies when touching the Twilio bridge:

```bash
npm --prefix twilio-voice-server ci
```

For local Docker validation, copy `.env.example` to `.env` and fill required secrets locally. Do not commit `.env` or secret values.

## Validation Before Handoff

Run the narrowest validation that covers the files changed. Record exact commands and results in the Linear workpad and PR.

Minimum for docs/workflow-only changes:

```bash
git diff --check
```

Frontend/Jitsi changes:

```bash
npm run lint:ci
npm run tsc:ci
```

Tenant or bundle-affecting frontend changes:

```bash
npm run build:malka
npm run build:maple
```

VRS backend changes:

```bash
npm --prefix vrs-server run build
npm --prefix vrs-server test -- --runInBand --forceExit
```

Ops backend changes:

```bash
npm --prefix vrs-ops-server run build
npm --prefix vrs-ops-server test
```

Stack/config changes:

```bash
npm run validate:vrs-stack
docker compose config --quiet
docker compose -f docker-compose.prod.yml config --quiet
```

If validation cannot run because of missing services, secrets, Docker, or network access, document the blocker clearly and do not mark the ticket ready for human review.

## Branches, Commits, PRs

- Start from the latest `origin/main`.
- Use a per-ticket branch named `codex/<issue-id>-short-description`.
- Keep changes surgical and directly tied to the Linear issue.
- Commit logical units of work with clear messages.
- Push the branch and open or update a PR against `main` when implementation is ready.
- Do not push directly to `main` from unattended Symphony runs.
- Link the PR in Linear and leave evidence of validation before moving the issue to `Human Review`.

## Paths And Commands To Avoid

- Do not edit `jitsi-development/` unless the issue explicitly targets the vendored upstream snapshots.
- Do not commit `.env`, private keys, tokens, production credentials, database dumps, or generated secrets.
- Do not run production deploy commands (`scp`, `ssh`, Vercel aliasing, droplet deploys) unless the Linear issue explicitly requests deployment and required approval/credentials are available.
- Do not run destructive git commands such as `git reset --hard`, `git clean -fdx`, or branch deletion without explicit human instruction.
- Do not mirror status into a local Obsidian vault from Symphony workspaces; that path is machine-specific.

## Definition Of Done

- The issue behavior is reproduced or verified where practical.
- The implementation is scoped to the ticket and follows existing repo patterns.
- Required validation for the touched area has run and passed, or blockers are documented.
- The branch is pushed, a PR is opened or updated when code changed, and Linear contains files changed, validation evidence, PR link, and any remaining risk.
- The Linear issue is moved to `Human Review` only after the above is complete.
