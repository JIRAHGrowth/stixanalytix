# claude/ — The Integrator Layer

This directory holds task templates that Claude agents (scheduled or on-demand) use to push StixAnalytix work forward while Josh is in meetings, asleep, or away.

## Folder Layout

```
claude/
  README.md                  — this file
  tasks/
    nightly_build.md         — nightly build & test, fix-if-safe
    morning_brief.md         — 07:00 daily status report
    pilot_health_check.md    — check video_jobs table for failures
    competitor_watch.md      — weekly scan of SciSports/InStat/Hudl/Veo/Stopper
    backlog_grooming.md      — weekly review of MASTER_PLAN.md + queue
```

## How an agent runs a task

1. Agent is invoked with the contents of one task template as its prompt
2. Task template tells the agent: re-anchor on [docs/MASTER_PLAN.md](../docs/MASTER_PLAN.md), do the work, write output to a specific file, stop
3. Output is reviewed by Josh in the morning (or whenever)

## Running modes

There are two ways these tasks get scheduled. They are NOT the same thing — pick deliberately.

### Session-local cron (Claude Code REPL)
- Runs only while a Claude Code session is active on Josh's machine
- Set up via `CronCreate` tool inside a Claude Code session
- Good for: bursts of automation while Josh is actively working a session
- Bad for: true overnight/away-from-keyboard work (laptop must be on, Claude Code must be open)
- 7-day auto-expiry

### True 24/7 (one of these)
- **GitHub Actions cron** — free, runs in the cloud, can call Claude API directly via a workflow. Best fit for "nightly build and test", "morning brief", "competitor watch". Requires committing a workflow file + a CLAUDE_API_KEY secret.
- **Anthropic console scheduled agents** — if/when this product matures, plug it in here
- **A small always-on server** (Fly.io machine or similar) — overkill for now

Recommendation: start with **GitHub Actions cron** for the recurring jobs. It's the only option that genuinely runs while Josh sleeps with the laptop off, and it costs nothing at this volume.

## Where outputs go

| Task | Output file |
|---|---|
| nightly_build | `MORNING_BRIEF.md` (build status section) |
| morning_brief | `MORNING_BRIEF.md` (rewrites whole file) |
| pilot_health_check | `MORNING_BRIEF.md` (pilot health section) |
| competitor_watch | `docs/competitor_watch_log.md` (append-only) |
| backlog_grooming | `docs/AGENT_QUEUE.md` (proposed additions section) |

## Guardrails

Every task template enforces these rules:
- **No customer-facing actions.** Never email, message, or contact a customer.
- **No production data writes** without explicit Josh approval in the queue.
- **No spending outside budgets.** Gemini + Claude API caps are documented in [docs/MASTER_PLAN.md](../docs/MASTER_PLAN.md) §6.
- **No destructive git operations.** No force-push, no branch deletion, no rewriting history.
- **Stop and surface, don't guess.** If a task is ambiguous, write the question to `docs/AGENT_QUEUE.md` and stop.
