# Agent Queue

Drop-box for bounded tasks that scheduled agents (see [MASTER_PLAN §6](MASTER_PLAN.md#6-the-247-integrator-coo-layer)) pick up on their next run.

## How to add a task

Append to the **Open** section below. Required fields:

- **What** — one-line description of the work
- **Why** — the reason it matters (so the agent can judge edge cases)
- **Done when** — an observable completion signal
- **Max time** — give up and surface a blocker if exceeded
- **Owner** — `agent` (any scheduled agent can pick it up) or a specific one (`nightly-build`, `pilot-health`)

When an agent picks a task, move it to **In Progress** with the agent name and a timestamp. When done, move to **Done** with a link to the commit/PR/output.

---

## Open

_(empty — add tasks below as they come up)_

---

## In Progress

_(none)_

---

## Done

_(archive completed tasks here; prune monthly)_
