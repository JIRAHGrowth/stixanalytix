# Roadmap to 95% — StixAnalytix GK Event Detection

**Owner:** Joshua Marshall (info@jirahgrowth.com)
**Locked-in:** 2026-05-22
**North Star:** 95% precision AND 95% recall on goals, saves, AND distribution events vs coach-tagged ground truth.

This document is the single source of truth for the path to 95%. It is checked into the repo, updated as milestones land, and referenced for verification. Every claim in this doc is measured against the same `scripts/eval-match.js` harness on the same ground-truth set so progress is verifiable, not anecdotal.

---

## Where we are today (Phase 2 canary baseline, 2026-05-22)

| Metric | Goals | Saves | Distribution |
|---|---|---|---|
| Recall | 20% | 27% | 31% |
| Precision | 10% | 12% | 4% |
| Timestamp MAE | 1.0s | 3.7s | 4.4s |

Measured on April-25 OFC match (`f5ad42c7`) via the production Vertex worker (`stixanalytix-worker-vertex`), `gemini-2.5-flash`, chunked MEDIUM, per-chunk cached. Cost: $0.37/match (vs $5.17/match for legacy 2.5-pro production). Wall time: 25 min.

**Distance to 95% (gap to close):** Goals +75pp recall / +85pp precision. Saves +68pp / +83pp. Distribution +64pp / +91pp.

---

## The accuracy ladder

Four stages. Each stage has a quantitative ceiling, a verification protocol, and a "we don't move forward until this is met" floor. No magic, no hand-wave.

### Stage 1 — Tighten what we have (no new model, no new data)
**Window:** 2026-05-23 → 2026-06-06 (Weeks 1-2)
**Levers:** reconciliation rule re-tune, voting pass tuning, prompt v3, confidence-band measurement
**Target floor (originally set):** Goals 40% recall / Saves 35% / Dist 35%, FP rate cut ≥ 30% on each
**Target ceiling (originally set):** Goals 55% / Saves 45% / Dist 45%

**REVISED CEILING (2026-05-22, after Rule E shipped):**
Empirical finding from `scripts/reconciliation-lab.py` across 3 bench matches: **field-level reconciliation rules cannot meaningfully shift goals or saves accuracy on base `gemini-2.5-flash`.** Every FP carries identical fields (conf=high, evidence affirmative, real shot_type, on_target=yes) to every TP. This is the model behavior; rules can't bridge it. Confirmed across canary + a0877aa3 + cf939885.

Distribution is the only event type where rules help — Rule E cuts FPs ~47% with marginal recall loss. That's now in production (both `worker/app.py` and `worker/app_v2.py`, commit `3b5db96`).

**The Stage 1 honest read:** rules ship distribution improvements only. Goals and saves wait for Stage 2 (SFT). This SHARPENS the focus on Stage 2 rather than diluting it — we don't waste another week trying to engineer rules that the data has already proven won't work.

### Stage 2 — First fine-tune pass
**Window:** 2026-06-07 → 2026-06-27 (Weeks 3-5)
**Trigger:** ≥ 50 matches with coach-reviewed labels accumulated in `coach_corrections`
**Levers:** Vertex SFT on `gemini-2.5-flash`, train on existing corrections, deploy tuned endpoint, A/B vs base in production
**Target floor:** Goals 60% recall / Saves 50% / Dist 45%, precision rises in tandem (≥ 30% on each)
**Target ceiling:** Goals 75% / Saves 65% / Dist 55%

### Stage 3 — Data scaling + iterative SFT
**Window:** 2026-06-28 → 2026-08-08 (Weeks 6-12)
**Trigger:** ≥ 150 matches reviewed, second keeper onboarded (diversity bootstrap)
**Levers:** retrain every 50 matches, active learning loop (uncertain events → coach review → new training data), per-event-type rule refinement
**Target floor:** Goals 80% / Saves 70% / Dist 60%
**Target ceiling:** Goals 88% / Saves 80% / Dist 72%

### Stage 4 — Architecture for the last 10 points
**Window:** 2026-08-09 → 2027-04-30 (Months 4-12)
**Trigger:** Stage 3 ceiling hit; ≥ 300 matches, ≥ 3 keepers in corpus
**Levers:** per-event-type specialized SFT models, ensemble voting at inference, temporal coherence checks, GK-cam workflow (Nicolas Proposal #1)
**Target:** Goals ≥ 95% / Saves ≥ 92% / Distribution ≥ 88% by end of window
**Stretch (full 95%):** all three ≥ 95% by 2027-Q2 with GK-cam workflow live

---

## 8-week execution plan (the load-bearing detail)

This is the part you check back against weekly. Each row has: who, what, by-when, success criterion.

### Week 1 — 2026-05-23 → 2026-05-29
| # | Who | What | Success criterion | Status |
|---|---|---|---|---|
| 1 | Claude | Re-tune cross-event reconciliation rules for chunked Flash output | FP rate on the 4 ground-truth matches drops ≥ 30% on at least one event type with no recall loss | ✅ **DONE 2026-05-22 (commit `3b5db96`)** — Rule E shipped: dist FPs cut by **47%** on canary (114→67), -1 TP. Validated across 3 matches: 99 FPs eliminated total. Goal + save FPs proved field-indistinguishable from TPs → SFT required, rules can't help there. |
| 2 | Claude | Run 3-5 more Vertex canary jobs on existing TEST job IDs to characterize per-match variance | Per-match scorecard variance documented; baseline is N=4+ not N=1 | ⏸ Deferred — natural matches will accumulate as Joshua's peer-match flow lands; manual canary runs add little marginal info |
| 3 | Claude | Build SFT training-data JSONL converter (Stage 2 prep) | Converter script in repo; produces Vertex-format JSONL from curated ground-truth files + GCS-resident videos | ✅ **DONE 2026-05-22** — `scripts/build-sft-training-data.py`. Built first corpus (87 rows from 3 matches) — Vertex format verified. 52 of 87 rows have empty event arrays (these directly counter the FP-hallucination ceiling Item #1 found). 4th match blocked on its source video being uploaded to GCS (any worker run on `bc00c75c` auto-fixes). Once Joshua's 200 matches arrive: ~5800 training rows = well above Vertex's 500 minimum. |
| 4 | Joshua | Reach out to peer coaches: line up match-video sources for 200 total matches by week 8 | Verbal commitments from ≥ 3 peer coaches | ☐ |
| 5 | Joshua | Identify 1 review helper (paid, trade, or co-coach) | Helper identified + onboarded to review screen by end of week 2 | ☐ |

### Week 2 — 2026-05-30 → 2026-06-05
| # | Who | What | Success criterion | Status |
|---|---|---|---|---|
| 6 | Claude | Stage 1 wrap: prompt v3 for chunked extraction + confidence-band measurement | Bench score shows Stage 1 floor hit (Goals 40% R / Saves 35% R / Dist 35% R; FP rate down 30%) | ☐ |
| 7 | Claude | Fast-review UI v1: keyboard shortcuts, bulk-accept keys, pre-filled defaults from Gemini | Time-to-review one match: 60 min → 15 min (measured) | ☐ |
| 8 | Joshua | First peer matches start arriving — upload through existing flow | ≥ 5 new matches in `video_jobs` by end of week | ☐ |
| 9 | Joshua + helper | Review the new matches via fast-review UI | ≥ 10 matches in `coach_corrections` by end of week | ☐ |

### Week 3 — 2026-06-06 → 2026-06-12
| # | Who | What | Success criterion | Status |
|---|---|---|---|---|
| 10 | Claude | A/B traffic-split framework: env-var-controlled routing of % uploads to tuned model when ready | Traffic split tested with base-vs-base shadow run | ☐ |
| 11 | Joshua | Onboard second keeper (diversity bootstrap) | Second coach signed up, first 3+ matches uploaded | ☐ |
| 12 | Joshua + helper | Continue review at ~8-12 matches/day pace | ≥ 30 matches in `coach_corrections` by end of week | ☐ |

### Week 4 — 2026-06-13 → 2026-06-19
| # | Who | What | Success criterion | Status |
|---|---|---|---|---|
| 13 | Claude | First Vertex SFT job on accumulated corrections (~50 matches expected) | SFT job completes; tuned endpoint deployed; scorecard run | ☐ |
| 14 | Joshua | Decision: did Stage 2 floor get hit? (Goals 60% R / Saves 50% / Dist 45%) | YES → ship tuned model to A/B at 25%. NO → diagnose + iterate before Stage 3 | ☐ |
| 15 | Joshua + helper | Hit 50 matches review milestone | `coach_corrections` row count ≥ 50 matches' worth | ☐ |

### Week 5 — 2026-06-20 → 2026-06-26
| # | Who | What | Success criterion | Status |
|---|---|---|---|---|
| 16 | Claude | Stage 2 iteration: rule re-tune for tuned model output (failure modes shift) | Bench scorecard for tuned model + new rules | ☐ |
| 17 | Joshua + helper | Continue review | ≥ 100 matches reviewed | ☐ |

### Week 6 — 2026-06-27 → 2026-07-03
| # | Who | What | Success criterion | Status |
|---|---|---|---|---|
| 18 | Claude | Second SFT run on accumulated ~100 matches | Scorecard shows trajectory improvement vs Week 4 SFT | ☐ |
| 19 | Joshua | Active learning loop launches: tuned model flags low-confidence events for prioritized coach review | Active-learning queue visible in review UI | ☐ |

### Week 7 — 2026-07-04 → 2026-07-10
| # | Who | What | Success criterion | Status |
|---|---|---|---|---|
| 20 | Joshua + helper | Review push toward 200 | ≥ 150 matches reviewed | ☐ |
| 21 | Claude | Eval harness parallelization (Modal-based) — needed to run bench across 20+ matches in reasonable time | Bench can score 20 matches in < 2 hours | ☐ |

### Week 8 — 2026-07-11 → 2026-07-17
| # | Who | What | Success criterion | Status |
|---|---|---|---|---|
| 22 | Claude | Third SFT run on 200-match corpus | Stage 3 floor hit (Goals 80% R / Saves 70% / Dist 60%) | ☐ |
| 23 | Both | Public scorecard published to Nicolas: trajectory, costs, ground-truth corpus, model lineage | Scorecard committed to repo + shared with Nicolas | ☐ |
| 24 | Joshua | Decision: continue to Stage 4 architecture work, or hold at Stage 3 baseline while observing in production? | Documented decision in this file | ☐ |

---

## Verification protocol

Every claim in this roadmap is measured the same way:

1. **Ground truth:** the workbooks in `scripts/ground-truth/*.json` (currently 4 matches; expanding to ≥ 20 by week 8 — pulled from coach-reviewed `coach_corrections` via the populator).
2. **Eval harness:** `node scripts/eval-match.js --truth <gt.json> --job <video_job_id> --tolerance 10`
3. **Bench harness for multi-match scoring:** `node scripts/bench-models.js` (extended in Week 7 for parallel runs)
4. **Scorecards committed to:** `scripts/bench-results/scorecards/`
5. **Tag every scorecard with:** model name, commit SHA, config hash, ground-truth set version

**Weekly cadence:** Every Friday, run the bench across the current ground-truth set + the latest model. Commit the scorecard. Compare to the previous week. If a stage floor was missed, the table above shifts and we diagnose root cause before moving on.

**No fudging:** scorecards are committed to git. The same eval against the same ground truth, week over week. Drift becomes visible immediately.

---

## Risks + open questions

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Coach review labor doesn't scale to 200 matches | High without helper | Plan stalls at Week 3 | Find review helper Week 1 (Item #5); ship fast-review UI Week 2 (Item #7) |
| Label inconsistency across 200 matches | Medium | SFT cap below stage ceilings | Per-event-type label-guide in review UI (Week 2 work); random spot-check audit every 50 matches |
| Single-keeper overfit (Judah-only training corpus) | High | Tuned model fails on other coaches | Diversity bootstrap Week 3 (Item #11); ≥ 30% of corpus from non-Judah keepers by Week 8 |
| Distribution 95% requires architecture work beyond SFT | High | Stage 3 falls short on distribution alone | Acknowledged in Stage 4; distribution is the last to hit 95%, not first |
| Gemini API/pricing change disrupts mid-plan | Medium | Schedule shift | Pinning model + config_hash in scorecards = early detection. Vertex deprecation horizon is Oct 2026 for 2.5 family; long enough for plan window |
| Demo readiness vs SFT focus competes for Joshua's attention | Medium | Either could slip | Frame demo with current accuracy + roadmap, not future numbers. Don't promise 95% in demo |

---

## Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-05-22 | Lock in 95% target across all 3 event types as singular north star | Stated by Joshua: "95% is all I'm focused on" |
| 2026-05-22 | Stage 1 work starts immediately (reconciliation rule re-tune first) | Cuts FP volume before more data accumulates; compounds across every future review |
| 2026-05-22 | Joshua finds 200 matches + review helper in 30 days | Stated commitment; unblocks Stage 2 + Stage 3 |
| 2026-05-22 | Diversity bootstrap (second keeper) is Week 3, not later | Without it, SFT overfits to Judah and product doesn't generalize |
| 2026-05-22 | Distribution 95% is Stage 4 work (months 3-12), not Stage 2-3 | Honest acknowledgment of category difficulty; goals first, saves second, distribution last |

---

## What "done" looks like

We can claim 95% accuracy publicly when:
- The bench scorecard shows ≥ 95% precision AND ≥ 95% recall on goals, saves, AND distribution
- Measured on a holdout set of ≥ 20 matches NOT used in training
- Across ≥ 3 different keepers
- Reproduced across ≥ 3 consecutive weekly runs (not a one-off)
- Documented in `scripts/bench-results/scorecards/95-percent-validation.md`

Until all five conditions hold, we report "current accuracy: X% goals / Y% saves / Z% distribution, trajectory toward 95% target."

---

## Update this document

This file is owned by Joshua. Update the Status column in the weekly tables as items land. Add to the Decision log when scope changes. The roadmap evolves as data comes in — but the 95% north star doesn't move.
