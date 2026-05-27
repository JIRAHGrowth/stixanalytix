# StixAnalytix — Onboarding Package

This is the entry point for anyone joining the StixAnalytix ground-truth labeling effort — whether you're a volunteer helping process the 200-match backlog, a member of Nicolas' ML team evaluating the project, or a coach learning the rubric.

**Read order matters.** Each document builds on the one before it. Don't skip to the rubric.

| # | Document | Audience | Read time |
|---|----------|----------|-----------|
| 1 | [Mission & Why](01-mission-and-why.md) | Everyone | 10 min |
| 2 | [GK Domain Primer](02-gk-domain-primer.md) | Anyone labeling | 30-45 min |
| 3a | [Labeling Rubric](03a-labeling-rubric.md) | Active labelers | reference |
| 3b | [Edge-Case Log](03b-edge-case-log.md) | Active labelers (living doc) | reference |
| 4 | [Tool Walkthrough](04-tool-walkthrough.md) | Active labelers | 20 min + 2 Loom videos |
| 5 | [Calibration Process](05-calibration-process.md) | First cohort + reviewers | 15 min |

## Two tracks

### Volunteer labeler track
Read 1 → 2 → 4 → join calibration cohort (5). Once calibrated, work daily from 3a/3b.

### Nicolas' ML team / technical partner track
Read 1 → 2 (skim) → 3a → 5. The rubric and calibration plan are the most relevant — they show how we generate clean training data at scale.

## What good labeling looks like (one-line version)

> Honest "I couldn't tell" beats a confident guess every time. The model will eventually train on what you label — wrong labels teach wrong lessons.

If you remember nothing else, remember that.

## Where to ask questions

- Operational questions ("how do I…") → daily standup / shared channel
- Domain questions ("is this a parry or a deflect?") → add to the [Edge-Case Log](03b-edge-case-log.md) for ruling
- Tool bugs → flag to Joshua directly

## Why this exists in the repo (not Notion)

The rubric is versioned with the analyzer prompts in [prompts/](../prompts/). If you change how labelers classify a parry, the model prompt should update in lockstep. Keeping both in git keeps them aligned. Markdown can be exported to Notion / Google Docs / PDF for distribution; the source of truth is here.
