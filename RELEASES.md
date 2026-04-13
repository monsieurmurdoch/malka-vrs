# Releases & Deploys

This repo uses a simple rule:

- `main` is the only deployable branch.
- The droplet should deploy from `main`, not from side branches, except during a true emergency fix.

## Branch Roles

`main`
- Production release line.
- Must stay understandable, reviewable, and safe to deploy.

Feature branches
- Used for focused work with one clear purpose.
- Examples: `infra/live-droplet-hardening`, `ui/welcome-and-client-fixes`, `mobile/store-readiness`.

Spike or rescue branches
- Used to stabilize, recover, or sort mixed work.
- Not merge targets by default.
- Work should usually be split out into focused follow-up branches before reaching `main`.

Large migration branches
- Used for high-risk changes with rollout and rollback implications.
- Example: `data/postgres-migration-review`.
- These need stricter checks than ordinary fixes.

## Merge-To-Main Gates

A branch can reach `main` when all of the following are true:

- The branch has one clear purpose.
- The change has been reviewed against current `main`.
- The relevant checks for that area pass.
- The branch will not quietly break the droplet or block active work.
- A rollback plan can be described in one short sentence.

If a branch is still acting as a mixed catch-all, it is not ready for `main`.

## Deploy-To-Droplet Gates

The droplet should be updated only after code is merged into `main`, then verified.

Normal flow:

1. Build and validate on a focused branch.
2. Review the branch against `main`.
3. Merge to `main`.
4. Deploy `main` to the droplet.
5. Verify the production path.
6. Roll back from `main` history if needed.

This keeps the droplet from becoming its own undocumented branch.

## Category-Specific Expectations

Production hotfixes
- Can move quickly.
- Must still have a narrow scope and a quick verification step.

Infrastructure and deploy changes
- Must include a deploy verification step.
- Should note what production symptom they fix and how to tell if they regressed.

UI and client-flow changes
- Should be checked in the affected user flow, not just by build success.

Mobile work
- Should not block web or server deploys unless intentionally coupled.
- Prefer landing as mobile-scoped changes, not inside unrelated infrastructure work.

Database migrations
- Require the strictest path.
- Must include migration plan, compatibility notes, verification steps, and rollback thinking.
- Do not merge wholesale from old side branches just because the work was extensive.

## Current Repo Policy

For the current cleanup effort:

- [BRANCHING.md](/Users/robertmalka/Desktop/MalkaVRS-Retvrn/malka-vrs-app/BRANCHING.md) defines how we create and use branches.
- [POSTGRESQL_MERGE_PLAN.md](/Users/robertmalka/Desktop/MalkaVRS-Retvrn/malka-vrs-app/POSTGRESQL_MERGE_PLAN.md) defines the deliberate integration plan for PostgreSQL work.
- `spike/apr12-live-fixes-and-mobile` is a snapshot and sorting branch, not a direct deploy branch.
- `data/postgres-migration-review` is the clean integration branch for PostgreSQL review work.

## Short Rule Of Thumb

- Side branch: build it, test it, review it.
- `main`: approve it.
- Droplet: deploy `main`.
