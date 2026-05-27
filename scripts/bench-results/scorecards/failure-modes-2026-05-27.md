# StixAnalytix failure-mode taxonomy — 2026-05-27

Empirical counts as of this build. Refresh by re-running `python scripts/measure-failure-modes.py`.

Sources:
- coach_corrections: **96 rows** across 7 reviewed video_jobs.
- v3 bench: **5 matches** at tolerance ±10s.

## Coach corrections by type

| Type | Count | % of total |
|---|---|---|
| `false_positive` | 52 | 54.2% |
| `kept_as_is` | 22 | 22.9% |
| `missed_goal` | 11 | 11.5% |
| `wrong_team` | 10 | 10.4% |
| `wrong_zone` | 1 | 1.0% |

## v3 bench false-positive counts

| Section | TP | FP | Precision |
|---|---|---|---|
| goals | 3 | 29 | 9.4% |
| saves | 4 | 102 | 3.8% |
| distribution | 40 | 365 | 9.9% |

---

## The taxonomy

### Team-color attribution flip (`team_color_flip`)

**Definition.** Model correctly identifies a goal event but assigns the wrong scoring/conceding team. The shooter's jersey colour is mis-read.

**Detection.** coach_corrections rows with correction_type='wrong_team'.

**Empirical evidence:**
- wrong_team corrections in DB: **10**

**Status — shipped.** v3 prompt: per-chunk kit-anchor preamble + mandatory `evidence_shooter_color` field + team-bias self-audit. Reconciliation Rule D requires 2-of-3 affirmative evidence.

**Status — open.** Fluent narrative on the shooter's jersey passes the schema check even when invented. Genuine fix is SFT corpus of color-corrected examples — every wrong_team row in coach_corrections is gold training data.

### Goal hallucination from celebration / replay / non-event (`goal_hallucination`)

**Definition.** Model emits a goal event that didn't happen. Most common on no-scoreboard youth video where the model uses celebration-like activity as ground truth.

**Detection.** coach_corrections with correction_type='false_positive' on goals, AND bench-time goal FPs.

**Empirical evidence:**
- false_positive corrections in DB: **52**
- bench goal FPs: **29**

**Status — shipped.** v3 prompt: 'CALIBRATION — plausible counts' section; two-of-three evidence rule (Rule D); known-model-bias warning.

**Status — open.** On chunked Flash, the model still confabulates fluent evidence text for invented events. SFT is required.

### Save hallucination (no opposition shot) (`save_hallucination`)

**Definition.** Model emits a save event for a non-shot — backpass collection, loose-ball pickup, GK touch with no preceding attack.

**Detection.** Bench-time save FPs; particularly catastrophic on dominant-win matches (judah-2026-05-23-pfc: 51 of 55 saves were invented).

**Empirical evidence:**
- bench save FPs: **102**

**Status — shipped.** v3 prompt: removed the 'err on inclusion' floor; added mandatory `preceding_attack` field; explicit anti-examples (backpass, loose ball, distribution are NOT saves). Reconciliation Rule F drops invented saves.

**Status — open.** Rule F fired 0 times across the v3 bench — the model writes plausible attack descriptions for hallucinated saves too. Field-presence heuristics don't catch fluent hallucination. SFT is required.

### Distribution double/triple-tagging of one possession (`distribution_double_tag`)

**Definition.** Model emits N distribution events for one GK possession (receive + touch + release counted separately).

**Detection.** Rule E (dedupe by trigger+direction within 30s) drop counts; ≥10 dropped per match is the signature.

**Empirical evidence:**
- bench distribution FPs (post Rule E): **365**

**Status — shipped.** v3 prompt: ≥5-yard release definition + anti-examples for receive+touch+release. Reconciliation Rule E dedupes within 30s window.

**Status — open.** Underlying over-tagging is structural; Rule E is band-aid. SFT with corrections-derived examples (one event per release, not per touch) addresses root cause.

### Opposition GK action attributed to our GK (`opposition_gk_action`)

**Definition.** Model emits a distribution event for the OTHER team's GK because it didn't verify kit colour at release.

**Detection.** Receiver=opponent + direction=backwards + successful=false signature; Rule G.

**Status — shipped.** v3 prompt: opposition-GK colour-check anti-example. Reconciliation Rule G heuristic.

**Status — open.** Same as team-color flip — text-only sanity checks can't verify visual attribution.

### Asymmetric bias toward 'analyzed team conceded' (`directional_team_bias`)

**Definition.** When the model commits to scoring_team it has a strong prior toward 'opposition scored' (analyzed team's GK conceded). Measured on the PFC match: 100% of 'conceding_team=my_team_color' predictions were wrong.

**Detection.** Bench-time TP rate by conceding_team value.

**Status — shipped.** v3 prompt: known-model-bias warning + team-bias self-audit step in the self-check.

**Status — open.** Self-audit is a prompt-level mitigation only. SFT on balanced-attribution examples is the structural fix.

### Confidence field is degenerate (100% `high`) (`confidence_degeneracy`)

**Definition.** Model labels every event `confidence: high`, regardless of correctness. Measured empirically 2026-05-27: 543/543 events across the v3 bench were `high`. Precision at `high` is 4-10%.

**Detection.** scripts/measure-confidence-bands.py — bucket events by confidence label, measure per-bucket precision.

**Empirical evidence:**
- See [confidence-bands report](confidence-bands-2026-05-27.md).

**Status — shipped.** Measurement script + report; field is documented as misleading.

**Status — open.** Either drop `confidence` from the schema or redefine its semantics. Self-awareness of uncertainty is a training gap that SFT can address.

### Match-shape-induced over-detection (`match_shape_over_detection`)

**Definition.** On lopsided matches where the dominant team's GK is barely tested, the model invents events to satisfy 'normal match' expectations.

**Detection.** Per-match FP rate correlated with score margin.

**Status — shipped.** v3 saves prompt explicitly addresses one-sided matches (0-3 shots is plausible for a dominant GK).

**Status — open.** Prompt instruction fights the training prior. SFT on lopsided-match examples (PFC 15-0 with 4 real saves) is the structural fix.

---

## Strategic read

Six of the eight failure modes share the same root cause: base Gemini's narrative fluency lets it fabricate plausible evidence (color descriptions, attack sequences, GK observations) for invented events. Field-presence heuristics cannot detect this. Schema enforcement forces the field to be filled; it cannot force the contents to correspond to reality.

This is why fine-tuning is the load-bearing fix — not a complement to prompt engineering, but the actual mechanism. The prompts ship the failure mode from 'extreme over-detection' (e.g., 14 phantom goals on a 15-0 match) to 'narrative-fluent over-detection' (model writes detailed but invented descriptions). The latter is less catastrophic but still wrong; it cannot be fixed without teaching the model from examples.

The SFT corpus is the asset. Every coach_correction row tagged in our app is a training example. The taxonomy above gives us the failure modes to weight in that corpus.
