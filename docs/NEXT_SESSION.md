# Next session — where we left off

**Last session:** 2026-04-29. Phase 1 of the video pipeline shipped to production. See [MASTER_PLAN.md](MASTER_PLAN.md) §8 for the full decision log from that session.

## TL;DR — what's live, what's next

**Live in production at https://www.stixanalytix.com:**
- `/upload` flow: file upload (TUS resumable, up to 5 GB) or URL paste, metadata form, Gemini analysis, coach review, publish to dashboard.
- First real production run: Judah's 2026-04-25 game. End-to-end working.

**Highest-leverage next move:** **D11 — per-coach correction feedback loop.** Half a day of work; permanent accuracy improvement per coach over time. Recommended as the first thing we tackle next session.

---

## Recommended first task — D11: per-coach correction feedback loop

**The problem:** every Gemini run today is stateless. Your corrections from past matches don't influence future analyses, even though they encode exactly the kind of judgment Gemini is failing on.

**The fix:** store every coach correction (Gemini's answer vs. coach's published answer) in a table, then prepend the last N corrections to future Gemini prompts as calibration context. Effect: the model gets smarter per-coach over time.

**Effort:** ~half day.

**Sub-tasks:**

1. **Schema migration** — add `coach_corrections` table:
   - `id uuid pk, coach_id uuid, video_job_id uuid, correction_type text` (e.g. `false_positive`, `missed_goal`, `wrong_team`, `wrong_zone`)
   - `gemini_value jsonb, coach_value jsonb`
   - `match_metadata jsonb` (snapshot — colours, opponent kit, session type)
   - `created_at timestamptz`
   - RLS: coach can read their own; service role writes.

2. **Capture step (in publish API)** — when [/api/video-jobs/[id]/publish/route.js](../app/api/video-jobs/[id]/publish/route.js) writes a match, also diff:
   - Gemini's `parsed.goals` array vs the coach's reviewed `concessions` + `team_scored` arrays
   - For each Gemini candidate not in coach's final: row with `correction_type='false_positive'`
   - For each coach-added missed goal: row with `correction_type='missed_goal'`
   - For each candidate where the team flipped: row with `correction_type='wrong_team'`

3. **Injection step (in worker)** — in [worker/app.py](../worker/app.py), before calling Gemini:
   - Query `coach_corrections` for this coach, last 10 entries
   - Bucket by correction_type and summarise (e.g. "this coach has marked 3 false-positive rebounds in the last 5 matches")
   - Prepend to the prompt template as a "CALIBRATION FROM THIS COACH" preamble

4. **Verify** — re-run a match we've already corrected (e.g. OFC 2016) for the same coach; compare Gemini's new output to the previous run.

**Master-plan entry:** D11 is already in [MASTER_PLAN.md §7](MASTER_PLAN.md#7-open-decisions). Confirm it's worth building before the next steps.

---

## Tracked items / open decisions (from MASTER_PLAN.md §7)

| # | Decision | Suggested timing |
|---|---|---|
| **D3** | Error tracking (Sentry/Highlight/Axiom) | ~1 hour to wire up. Worth doing before D9 to catch integration bugs. |
| **D9** | Per-platform integrations (XbotGo, Veo, Hudl) | 1–2 days each. Start with XbotGo since your customer base is XbotGo-heavy. Pre-req: their API access — needs outreach. |
| **D10** | Drag-and-drop on Windows file picker | ~1 hour investigation. Low priority — click-to-browse works. |
| **D11** | Per-coach correction feedback loop | **Recommended next.** Half a day. |

---

## Phase 2 — expand event coverage (per MASTER_PLAN §5)

Goals-only is shipped. Phase 2 adds the rest of the GK event taxonomy. Each sub-phase is its own prompt + schema + reviewer extension.

| Phase | Adds | Effort | Why this order |
|---|---|---|---|
| 2.1 | Saves on target + shot location | ~2 days | Next-easiest observable. Populates `shots_on_target`, `saves`, `save_percentage` on matches. |
| 2.2 | Cross/corner outcomes | ~2 days | Visible enough — claimed/punched/missed. |
| 2.3 | Distribution (GK long/short, throws, passes, success/fail) | ~3 days | Hardest — subjective and high volume. |
| 2.4 | Sweeper, rebounds, 1v1, errors | ~3 days | Judgment-heavy. May permanently need coach confirmation. |

**Pre-req:** D11 should ship first so each new event type benefits from the correction loop.

**Phase 2 gate (per master plan):** ≥80% accuracy on basic events across 5 test matches scored by you.

---

## Production hardening (do anytime, low ceremony)

- **Sentry** (D3) — wire to Next.js + Modal worker. ~1 hour. Critical before paying users.
- **Cost logging per org_id** — Phase 1 has Gemini token usage in `video_jobs.gemini_output.usage`, but it's not aggregated. Add a `monthly_costs` view by org. ~half day.
- **Staging environment** — per Phase 0 still-open box. Vercel preview + a separate Supabase project. ~half day.
- **Storage abstraction (D8 debt)** — currently `from('match-videos')` is hardcoded in 3 files. Ship later when an R2 trigger fires. ~half day at that point.

---

## Strategic / longer-term

- **Phase 5: First paying pilot** — needs cost-per-match dashboard, weekly feedback loop, support process. The right time is after D11 + Phase 2.1 (so save% is also accurate).
- **Phase 6: Federation-ready** — multi-team org structure surfaced in UI, SSO, audit logs. Build only when a federation is in active conversation.

---

## Tiny housekeeping (15 min, do whenever)

- Delete the stale Vercel token at https://vercel.com/account/tokens (the `stixanalytix-claude` one) once you're sure it's not needed for another setup task.
- Decide whether to keep `scripts/load-gemini-match.js` (one-off used to load the OFC 2016 match before the upload UI existed) or delete it.
- The first OFC 2016 placeholder match (id `dc968973-...`) is still on the dashboard. The new auto-tagged one (id `cc00b293-...`) overlaps in spirit. Keep both, delete one, or merge — coach's call.

---

## Suggested cadence for the next session

1. **First 10 min** — re-skim this doc + [MASTER_PLAN.md §1, §3, §5](MASTER_PLAN.md). Decide: D11 first, or jump elsewhere?
2. **First hour** — build the D11 schema + capture step.
3. **Second hour** — wire injection step into worker, re-run a known match, verify accuracy improved.
4. **Wrap** — update master plan §8 with D11 outcome, plan Phase 2.1 (saves) for next session.

If D11 isn't where you want to start, D9 (XbotGo integration) is the second-best move — biggest impact on your immediate user base. But it requires outreach to XbotGo for API access first, which is a calendar-day not a coding-day.
