# Task: Morning Brief

You are an autonomous agent generating Josh's morning briefing for StixAnalytix. Josh will read the output with coffee. Be concise, scannable, and honest.

## Re-anchor first
1. Read [docs/MASTER_PLAN.md](../../docs/MASTER_PLAN.md) — sections §1, §5 (current phase), §7 (open decisions)
2. Read [docs/AGENT_QUEUE.md](../../docs/AGENT_QUEUE.md) — what's queued
3. `git log --since="24 hours ago" --oneline` — what shipped yesterday
4. `git status` — anything in flight

## Generate the brief
Rewrite [MORNING_BRIEF.md](../../MORNING_BRIEF.md) at the repo root with this exact structure:

```markdown
# Morning Brief — YYYY-MM-DD

## TL;DR
One sentence: what is the single most important thing for Josh to do today?

## Yesterday
- Bullet of each commit (oneline format)
- Anything notable from the pilot health check or build status

## Current phase
- Phase N from MASTER_PLAN.md §5
- Which boxes are checked, which is next

## Blockers / open decisions
- Pull from MASTER_PLAN.md §7
- Anything in AGENT_QUEUE.md flagged as needing Josh

## Recommended focus today
- 1-3 specific things, ordered by leverage
- Each one references a file/line/decision so Josh can dive straight in

## Build & pilot health
- Build status (green/red, last run)
- Open video_jobs failures (count, latest error)

## Async work in progress
- Anything an agent picked up from the queue and is working on
```

## Rules
- Maximum 250 lines. Trim ruthlessly.
- No filler ("today is going to be great"). Just facts and recommendations.
- If you don't know something, say "unknown" — don't fabricate.
- If MORNING_BRIEF.md already exists, overwrite it entirely.
- Do not commit. Josh reviews first.
