# 5 — Calibration Process

**Read time: 15 minutes. Required reading before the first cohort starts.**

This document describes how we onboard a new labeler. It exists because experienced ML teams know — and learn the hard way if they don't — that throwing a rubric at a new labeler and pointing them at 200 matches produces inconsistent training data. Calibration is the bridge between "read the rubric" and "label at scale."

## Why calibration

A rubric is a contract written in words. Words are ambiguous. Two careful labelers reading the same rubric will diverge on the gray areas — what counts as a parry vs. deflect, when a touch is a save vs. a distribution, whether a deflected shot inherits the original strike's classification. The rubric can't anticipate every edge case; only labeling does.

Calibration measures the divergence, surfaces the gray areas, and updates the rubric **before** the labelers scale to production. Without it, you don't have one consistent dataset — you have N datasets, one per labeler.

## When to run it

- Every time a new labeler joins
- Every time the rubric changes materially (a new event type, a new classification, a changed definition)
- Every quarter, as a drift check on existing labelers

## The cohort

The cohort is the new labeler **plus at least one experienced labeler** (Joshua, currently the only one; eventually anyone who has been through calibration and shipped 20+ matches). Three is better than two — disagreement between two people is hard to break ties on.

For the very first cohort (the one this onboarding package is built for), the experienced labeler is Joshua. New labelers calibrate against his rulings until at least one other labeler has been promoted past calibration; then he steps back from being the sole standard.

## The calibration matches

Pick 5-8 matches that **cover the variety** of what the labelers will see in production. Don't all-pick easy matches. Specifically:

| Match characteristic | Why it matters | Count |
|----------------------|----------------|-------|
| **Standard competitive match** (3-2 ish, both teams attack) | The bread and butter. Many save events, normal distribution rates. | 2 |
| **One-sided win for the analyzed team** (5-0 ish) | Tests whether labelers correctly produce a low save count instead of inventing saves to fill a quota. | 1-2 |
| **One-sided loss for the analyzed team** (0-5 ish) | High save volume, many goals. Tests endurance and the rebound-asymmetry rule. | 1 |
| **Low-quality video** (phone, angled, no scoreboard) | Tests honest use of `Unclear` and `GK visible: No`. | 1 |
| **A match with a goalkeeping error leading to a goal** | Tests `Missed/Misjudged` classification. | 1 |

Use real matches from `scripts/ground-truth/` where possible — that way the calibration data feeds the training set rather than being throwaway.

## The process — round by round

### Round 0 — pre-reading

Before touching a match, the new labeler reads [01-mission-and-why.md](01-mission-and-why.md), [02-gk-domain-primer.md](02-gk-domain-primer.md), and [03a-labeling-rubric.md](03a-labeling-rubric.md) end to end. They should also skim [03b-edge-case-log.md](03b-edge-case-log.md) — they'll add to it during calibration.

### Round 1 — independent labels on match 1

- Both labelers (or all three) label match 1 **independently**. No conferring. No looking at each other's spreadsheets.
- Time-box: each labeler has 24 hours from receiving the match to submit.
- Submit by converting to JSON and naming it `<match-name>__labeler-<initials>.json` so the comparison script can find them.

### Round 2 — agreement measurement

Run the comparison. The metric we care about is **inter-annotator agreement (IAA)** across these dimensions:

| Dimension | What it measures | Production threshold |
|-----------|------------------|----------------------|
| **Event recall** | Did both labelers find the same events? | ≥ 90% match on the event list |
| **Event count by type** | Did both labelers log the same NUMBER of goals / saves / distributions? | within ±2 per match |
| **Classification agreement** | When both found the same event, did they classify it the same way? | ≥ 85% on `GK action`, ≥ 90% on `Scoring team` |
| **Timestamp agreement** | When both found the same event, were timestamps within 5 seconds? | ≥ 95% within ±5s |
| **`Unclear` usage** | Is one labeler over-confident and the other under-confident? | both labelers use Unclear on 10-25% of borderline classifications |

The first calibration match almost never hits these thresholds. That's the whole point — calibration is a learning loop, not a test.

### Round 3 — disagreement walkthrough

Schedule a working session (1-2 hours per calibration match) where both labelers go through every disagreement together:

1. **Open the match video.** Disagreements are settled by re-watching the tape, not by debate.
2. **For each disagreement:**
   - Both labelers explain what they saw and why they ruled the way they did
   - The experienced labeler makes the canonical ruling
   - The ruling goes into [03b-edge-case-log.md](03b-edge-case-log.md) immediately
3. **For each disagreement that exposes a rubric gap:** edit [03a-labeling-rubric.md](03a-labeling-rubric.md) in the same session so the next labeler doesn't trip over it.

This is the highest-value session in the calibration process. Most rubrics live or die in this room. Don't shortcut it.

### Round 4 — re-label match 1

The new labeler re-labels match 1 from scratch using the updated rubric. Goal: at least 90% agreement against the gold-standard version produced in Round 3.

If they hit the threshold, move to the next calibration match. If they don't, identify which dimension they're failing (recall? classification? timestamps?) and target the next match's coaching there.

### Rounds 5 through N — additional calibration matches

Repeat rounds 1-3 on subsequent calibration matches **without re-labeling the same match.** Each new match tests whether the lessons from the previous round transferred.

### Graduation criteria

A labeler is promoted from "calibrating" to "production-ready" when, on a fresh calibration match they have never seen:

- Event recall ≥ 90%
- Classification agreement on GK action ≥ 85%
- Timestamp agreement ≥ 95% within ±5s
- Zero false positives on the antecedent-attack rule (no save events with vague `Play description`)

Most labelers should hit graduation within 3-5 calibration matches if the rubric is mature. If a labeler is still failing after 6+ matches, the problem is usually not the labeler — it's that the rubric has an unresolved ambiguity. Fix the rubric and retest.

## What the experienced labeler does during calibration

Three things, in priority order:

1. **Be the gold standard.** Your rulings are canonical until/unless we explicitly revisit them.
2. **Update the rubric and the edge-case log in real time.** A ruling that doesn't get written down is a ruling that decays. Edit the documents in the working session, not "later."
3. **Resist the urge to over-explain.** If a new labeler asks "why is this a parry?" your answer should be "because the wrist pushed the ball — see the cue in the primer." Point them at the document; the document is the contract.

## What "graduated" doesn't mean

Graduated labelers are not unsupervised. The QA loop continues:

- **5% spot check.** Joshua (or another graduated labeler) re-labels a random 5% of every labeler's matches in shadow mode and compares. Drift gets caught fast.
- **Edge cases always go to the log.** Even graduated labelers add new gray areas they encounter. The log is canonical; private rulings are forbidden.
- **Quarterly recalibration.** Every quarter, every labeler labels one fresh calibration match against the current gold standard. Catches drift from accumulated bad habits.

## A note on pay model (if you're recruiting paid help)

The right model is **base rate per match + accuracy bonus**:

- Base rate is the per-match floor. Calibrated to roughly 1.5x the time a competent labeler takes (so an experienced labeler earns a premium).
- The accuracy bonus is paid against a sampled subset (5-10% of the labeler's matches) re-labeled by a graduated reviewer. Bonus scales with agreement against the gold standard.

Pay per match alone incentivizes speed over accuracy. Pay per hour alone incentivizes slowness. The split model rewards labelers who are both fast AND right.

For volunteer / equity-stake helpers, the same QA loop applies but the bonus is replaced by recognition (your name in the dataset credits, project shoutouts, eventual reference letter if you stick).

## What "ready to scale" looks like

You know calibration is complete when:

- 2+ labelers have graduated under the same rubric
- Their independent re-labels on a fresh match hit IAA thresholds on the first try
- The edge-case log has grown from seed entries to ~20+ real rulings
- The rubric has had 1-3 updates from calibration learnings
- The Loom walkthrough videos are recorded

At that point you can give a calibrated labeler their first 5 production matches with confidence that what comes back is consistent training data, not personal interpretation.

That's the bar. Everything from here scales.
