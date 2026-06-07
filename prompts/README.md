# Prompts

Single source of truth for every Gemini / Claude prompt used by the pipeline. These files are loaded **verbatim** at runtime — change the file, the next run uses the new prompt.

Referenced from:
- [scripts/test-gemini-match.js](../scripts/test-gemini-match.js) — local prompt iteration
- [worker/app.py](../worker/app.py) — production Modal worker (once wired in; currently still on PROMPT_PHASE_0 placeholder)

## Files

| File | Purpose | Used by |
|---|---|---|
| [goals.md](goals.md) | Goal detection + rich GK-relevant context (attack type, buildup, shot, GK action) | `test-gemini-match.js`, `worker/app.py` |
| [saves.md](saves.md) | Phase 2.1 — every shot the analyzed team's keeper faces, with GK action classification (catch/block/parry/deflect/punch/missed) and Mike Salmon A/B/C body-distance zones | `worker/app.py` |
| [distribution.md](distribution.md) | Phase 2.3 (ready, not yet wired) — every distribution event by the analyzed GK, classified by trigger (goal kick/backpass/after save/etc.) and pass selection (short to defender/long to forward/switch wide/etc.) | `worker/app.py` (when Phase 2.3 lands) |
| [gk_techniques.md](gk_techniques.md) | STIX GK Technique Encyclopedia — canonical vocabulary, imported from .docx (139 KB / ~35K tokens) | `worker/app.py` (cached, included in every analysis) |
| [gk_techniques_extraction.md](gk_techniques_extraction.md) | Extraction prompt for pulling structured technique entries from coaching videos (T1TAN etc.) | `scripts/build-gk-encyclopedia.js` |

## Rules of editing

1. **The prompt files are the contract.** Do not inline-duplicate the prompt text in code. Every consumer reads from the file.
2. **The response schema lives in [`schemas/`](../schemas/), one file per prompt.** [`schemas/goals.json`](../schemas/goals.json), [`schemas/saves.json`](../schemas/saves.json), [`schemas/distribution.json`](../schemas/distribution.json) are imported by the Python worker (`worker/app.py`, `worker/app_v2.py`) AND the JS test harness (`scripts/test-gemini-match.js`) so a field can't be in the prompt while missing from one consumer. If you add a field to a prompt, edit the matching `schemas/*.json` in the same commit.
3. **Change carries over to the next run automatically.** No code change needed to iterate prompt prose.
4. **Log material prompt changes in the changelog below** so future chats can see what we've tried. Keep entries short.

## Template variables

Some prompts use `{{double_brace}}` placeholders. The consumer is responsible for substituting them before sending to Gemini. Currently in use:

- [goals.md](goals.md): `{{my_team_color}}`, `{{my_keeper_color}}`, `{{opponent_color}}` — passed in by the upload pipeline so the model knows which colour belongs to which team. Without these the model has to guess and frequently mis-attributes goals on no-scoreboard youth video.

## Changelog

- **2026-06-06** — Keeper-team attribution (Option B). Added `keeper_team` field to [saves.md](saves.md) + [distribution.md](distribution.md) and the matching `schemas/saves.json` + `schemas/distribution.json`. Values: `us` (the {{my_keeper_color}} GK) / `opp` (the {{opponent_color}} team's GK) / `unclear`. Driven by Joshua's review-session feedback: static GK cam catches both keepers, the opp keeper's saves/distributions are real (and useful as training data) but shouldn't pollute Judah's stats. Previously saves.md was scoped to the analyzed-team GK only (filtered opp out), and distribution.md had an explicit "drop opposition GK distributions" rule + Anti-example C ("Log NOTHING"). Both relaxed: now log opp events with `keeper_team: "opp"` so the review screen can preserve them as training data while excluding from dashboard rollups. Paired with `keeper_team` columns on `shot_events` and `distribution_events` (migration `20260606_keeper_team_attribution.sql`).
- **2026-06-04** — Confidence calibration. Replaced the single line `- confidence: "high", "medium", or "low".` in [goals.md](goals.md), [saves.md](saves.md), and [distribution.md](distribution.md) with explicit tier criteria keyed off fields each prompt already requires (evidence-field count + shooter-color + timestamp tolerance for goals; preceding-attack specificity + gk_visible + on_target + body_distance_zone for saves; release cleanliness + trigger/type/direction/receiver observability for distribution). Each tier description names the known training bias toward "high" and tells the model to override it. Paired with [worker/app.py](../worker/app.py) reconciliation Rule A becoming a per-event-type confidence floor (currently `low` for all three types).
- **2026-06-04** — Unified the response schemas into [`schemas/*.json`](../schemas/) (one file per prompt) and loaded them from both `worker/app.py` and `scripts/test-gemini-match.js`. The JS test harness was previously stale (missing the four `evidence_*` fields added in Phase 2.6) — that drift is now structurally impossible. Also fixed the editing rule above (response schema no longer "lives with the consumer code").
- **2026-05-26** — Prompt v3 (all three) + reconciliation Rules F/G. Driven by the judah-2026-05-23-pfc match (KCITY 15-0 W) where the model produced 14 goals / 55 saves / 50 dist vs ground truth 15 / 4 / 15. Three independent fixes:
  - **goals.md** — added per-chunk kit-anchor preamble (Step 0a/0b/0c), known-model-bias warning, mandatory `evidence_shooter_color` field, team-bias self-audit step. Forces the model to commit to the shooter's observed kit colour rather than infer scoring_team from celebrations or kickoffs. Targets the 6/14 wrong-team flips this match exposed (100% of "analyzed-team conceded" labels were wrong; 50% of "opposition conceded" labels were wrong — directional bias confirmed).
  - **saves.md** — removed the "0 saves in a chunk means you missed something" floor that was forcing hallucinations on dominant-win matches (this match: 51 of 55 saves were inventions). Added match-shape awareness (one-sided matches expect 0-3 saves). Added mandatory `preceding_attack` field — a save requires a describable opposition attack sequence. Added explicit anti-examples (backpass collection, loose-ball pickup, distribution moments are NOT saves).
  - **distribution.md** — tightened release definition (must travel ≥5 yards in a single clean action). Added three anti-examples (receive+touch+release is ONE event; settling touches are not releases; opposition GK is not yours). Added opposition-GK colour-check.
  - **worker/app.py + worker/app_v2.py** — added schema fields `evidence_shooter_color` (goals) and `preceding_attack` (saves). Added reconciliation Rule F (drop invented saves: no antecedent attack OR gk_visible=no+held+no shot language) and Rule G (drop opposition-GK distributions + trigger/type mismatches).
- **2026-04-28** — goals.md — added `{{my_team_color}}`, `{{my_keeper_color}}`, `{{opponent_color}}` template variables and a "MATCH CONTEXT" preamble. Loosened "TV-broadcast" framing in the opener so the prompt also fits Hudl/Veo/phone uploads (replay rule still applies). Driven by the OFC 2016 run on 2026-04-25 where the model credited every goal to the dominant team and missed the only concession.
- **2026-04-20** — goals.md — rewritten to senior-GK-analyst framing. Added fields: `match_clock`, `attack_type`, `buildup`, `shot_type`, `shot_location`, `goal_placement`, `gk_action`. Added "prefer low confidence over invented timestamps" rule. Match-clock OCR added as a second timestamp signal because pure video-offset timestamps were drifting.
- **earlier** — original prompt was scoreboard-ground-truth + 7-field goal record. Lived inline in `scripts/test-gemini-match.js`.
