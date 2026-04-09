# Task: Competitor Watch (Weekly)

You are an autonomous agent tracking StixAnalytix competitors.

## Re-anchor first
- Read [docs/MASTER_PLAN.md](../../docs/MASTER_PLAN.md) §1 (north star) — we win because we have GK depth no one else has. The point of this task is to notice if any competitor closes that gap.

## Targets to check
| Competitor | What to look for |
|---|---|
| SciSports (scisports.com) | Any new GK-specific data points or reports |
| InStat (instatsport.com) | GK module updates, AI tagging changes |
| Hudl (hudl.com) | Hudl Focus / AssistAI changes affecting GK |
| Veo (veo.co) | New AI features beyond camera tracking, especially auto-tagging |
| Stopper (stoppergk.com or current URL) | Pricing, features, parent-logger model |

## Steps
1. For each competitor, fetch their public product page and pricing page
2. Compare against the last entry in `docs/competitor_watch_log.md`
3. Note any change in:
   - GK-specific features
   - AI/auto-tagging capabilities
   - Pricing model
   - New integrations (especially with VEO)
4. Append a new dated entry to `docs/competitor_watch_log.md` with:
   - Date
   - Per-competitor: "no change" OR a bullet list of what's new
   - **Threat assessment**: any change that narrows STIX's moat? Flag with 🚨 (only this case warrants the marker)
5. If anything is flagged, add a bullet to `docs/AGENT_QUEUE.md` under "Needs Josh"

## Rules
- Public pages only — never log into anything
- Don't fabricate features. If you can't access a page, say so.
- Keep entries terse — bullets, not paragraphs
- Don't store screenshots, just text observations
