# Task: Backlog Grooming (Weekly)

You are an autonomous agent reviewing StixAnalytix's backlog and proposing the next moves.

## Re-anchor first
1. Read [docs/MASTER_PLAN.md](../../docs/MASTER_PLAN.md) end to end
2. Read [docs/AGENT_QUEUE.md](../../docs/AGENT_QUEUE.md)
3. Read [docs/ROADMAP.md](../../docs/ROADMAP.md)
4. `git log --since="7 days ago" --oneline`

## Steps
1. Identify which Phase is currently active in MASTER_PLAN.md §5
2. List which checkboxes in that phase are still unchecked
3. For each unchecked item, ask: is this still the right next move, given last week's progress and any new info from competitor_watch_log.md or pilot_health_log.md?
4. Propose the **next 3 specific tasks** Josh should tackle this week, ordered by leverage. Each must have:
   - Title (5-10 words)
   - Why it matters now (1 sentence)
   - Definition of done (1-2 bullets)
   - Estimated effort (S / M / L — no calendar estimates)
   - Phase/gate it unblocks
5. Append the proposal to `docs/AGENT_QUEUE.md` under a new dated section "## Proposed by backlog grooming — YYYY-MM-DD"
6. Do NOT modify MASTER_PLAN.md directly. Josh decides what gets promoted into the plan.

## Rules
- Honesty over optimism. If a phase is stalled, say so and explain why.
- If the queue has gone unread for 2+ weeks, flag that as the most important problem to solve.
- Maximum 200 lines of output. Be terse.
- Never invent decisions Josh hasn't made — flag uncertainty as questions, not assumptions.
