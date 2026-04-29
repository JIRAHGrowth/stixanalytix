# Prompts

Single source of truth for every Gemini / Claude prompt used by the pipeline. These files are loaded **verbatim** at runtime — change the file, the next run uses the new prompt.

Referenced from:
- [scripts/test-gemini-match.js](../scripts/test-gemini-match.js) — local prompt iteration
- [worker/app.py](../worker/app.py) — production Modal worker (once wired in; currently still on PROMPT_PHASE_0 placeholder)

## Files

| File | Purpose | Used by |
|---|---|---|
| [goals.md](goals.md) | Goal detection + rich GK-relevant context (attack type, buildup, shot, GK action) | `test-gemini-match.js`, eventually `worker/app.py` |

## Rules of editing

1. **The prompt files are the contract.** Do not inline-duplicate the prompt text in code. Every consumer reads from the file.
2. **The response schema lives with the consumer code**, not here. If you add a field to the prompt, add it to the consumer's `RESPONSE_SCHEMA` in the same change — the schema is the parser's contract, the prompt is the model's contract, and they must match.
3. **Change carries over to the next run automatically.** No code change needed to iterate.
4. **Log material prompt changes in the changelog below** so future chats can see what we've tried. Keep entries short.

## Template variables

Some prompts use `{{double_brace}}` placeholders. The consumer is responsible for substituting them before sending to Gemini. Currently in use:

- [goals.md](goals.md): `{{my_team_color}}`, `{{my_keeper_color}}`, `{{opponent_color}}` — passed in by the upload pipeline so the model knows which colour belongs to which team. Without these the model has to guess and frequently mis-attributes goals on no-scoreboard youth video.

## Changelog

- **2026-04-28** — goals.md — added `{{my_team_color}}`, `{{my_keeper_color}}`, `{{opponent_color}}` template variables and a "MATCH CONTEXT" preamble. Loosened "TV-broadcast" framing in the opener so the prompt also fits Hudl/Veo/phone uploads (replay rule still applies). Driven by the OFC 2016 run on 2026-04-25 where the model credited every goal to the dominant team and missed the only concession.
- **2026-04-20** — goals.md — rewritten to senior-GK-analyst framing. Added fields: `match_clock`, `attack_type`, `buildup`, `shot_type`, `shot_location`, `goal_placement`, `gk_action`. Added "prefer low confidence over invented timestamps" rule. Match-clock OCR added as a second timestamp signal because pure video-offset timestamps were drifting.
- **earlier** — original prompt was scoreboard-ground-truth + 7-field goal record. Lived inline in `scripts/test-gemini-match.js`.
