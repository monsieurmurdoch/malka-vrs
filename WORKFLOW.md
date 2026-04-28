---
tracker:
  kind: linear
  endpoint: https://api.linear.app/graphql
  api_key: $LINEAR_API_KEY
  project_slug: malka-vrs
  active_states:
    - Todo
    - In Progress
    - Rework
  handoff_state: Human Review
  terminal_states:
    - Done
    - Closed
    - Cancelled
    - Canceled
    - Duplicate
polling:
  interval_ms: 5000
workspace:
  root: ~/code/symphony-workspaces/malka-vrs
hooks:
  after_create: git clone --branch main https://github.com/monsieurmurdoch/malka-vrs.git . && scripts/symphony/after-create.sh
  before_run: scripts/symphony/before-run.sh
  after_run: scripts/symphony/after-run.sh
agent:
  max_concurrent_agents: 3
  max_turns: 20
codex:
  command: codex --config shell_environment_policy.inherit=all --model gpt-5.3-codex app-server
  approval_policy: never
  thread_sandbox: workspace-write
  turn_sandbox_policy:
    type: workspaceWrite
  turn_timeout_ms: 3600000
  read_timeout_ms: 5000
  stall_timeout_ms: 300000
---

# Symphony Workflow: MalkaVRS

This repository uses Linear as the work tracker and Symphony to launch isolated Codex app-server runs per ticket.

## Required Environment

- `LINEAR_API_KEY`: Linear API token with read/write access to issues, comments, states, labels, and project metadata.
- GitHub authentication available to the Codex process, either through `gh auth login`, SSH credentials, or a credential helper that can push branches to `https://github.com/monsieurmurdoch/malka-vrs.git`.
- Node.js and npm compatible with the repo (`README.md` currently documents Node.js 18+ for local development).
- Docker only for tickets that require stack or compose validation.

Do not store tokens or secrets in this repository.

## Starting Symphony

From a checkout of the Symphony reference implementation, start it with this workflow file:

```bash
cd /path/to/symphony/elixir
LINEAR_API_KEY=... mise exec -- ./bin/symphony /path/to/malka-vrs/WORKFLOW.md
```

If your local Symphony runner exposes a different CLI entrypoint, pass `/path/to/malka-vrs/WORKFLOW.md` as that runner's workflow path. The workflow file is self-contained: it selects Linear, clones this repo, prepares the workspace, and launches Codex with `codex ... app-server`.

## Linear State Flow

- `Todo`: eligible for pickup. Codex should move it to `In Progress` before active work.
- `In Progress`: active implementation or investigation.
- `Rework`: reviewer feedback is actionable; Codex should address it and revalidate.
- `Human Review`: handoff state. Use only after implementation, validation evidence, and PR link are ready.
- `Done`, `Closed`, `Cancelled`, `Canceled`, `Duplicate`: terminal states. Symphony should not start new implementation runs.

## Evidence Expected After A Completed Run

Codex should leave a Linear workpad/comment with:

- Files changed.
- Commands run and pass/fail results.
- PR link or branch link.
- Reproduction or verification notes.
- Blockers, missing secrets, or residual risk if any.

## Per-ticket Codex Prompt

You are working on Linear issue `{{ issue.identifier }}` for this repository.

{% if attempt %}
Continuation context:
- This is retry attempt #{{ attempt }}.
- Resume from the current workspace state.
- Do not repeat completed investigation unless needed because the code changed.
{% endif %}

Issue:
- Identifier: {{ issue.identifier }}
- Title: {{ issue.title }}
- State: {{ issue.state }}
- URL: {{ issue.url }}
- Labels: {{ issue.labels }}

Description:
{% if issue.description %}
{{ issue.description }}
{% else %}
No description provided.
{% endif %}

Operating rules:
1. Work autonomously inside this workspace only.
2. Read AGENTS.md and follow all project-specific rules before changing code.
3. Reproduce or verify the issue signal before implementing when practical.
4. Keep changes surgical and directly tied to the ticket.
5. Run the project's required validation commands before handoff.
6. Commit logically if the repository workflow expects commits.
7. Push a branch and open or update a PR when implementation is ready.
8. Update the Linear workpad/comment with evidence: files changed, commands run, results, PR link, and blockers.
9. Move the issue to Human Review only when the implementation and validation evidence are ready.
10. If blocked by missing secrets, permissions, unavailable services, or ambiguous requirements, record the blocker clearly in Linear and stop.

Repository-specific guidance:
- Start by reading AGENTS.md, README.md, relevant package scripts, and any issue-relevant docs.
- Start from `origin/main` and work on a per-ticket branch named `codex/{{ issue.identifier }}-short-description`.
- Use the validation matrix in AGENTS.md. Do not invent commands.
- Do not deploy to production unless the Linear issue explicitly asks for deployment.
- Do not commit secrets, `.env`, database dumps, or machine-local paths.
- Prefer small, focused PRs. File follow-up Linear issues for useful work that is outside the ticket scope.

Final response:
- Completed actions.
- Validation run and results.
- PR or branch link if created.
- Blockers only, if any.
