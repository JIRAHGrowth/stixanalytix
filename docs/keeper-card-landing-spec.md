# Keeper-Card Landing — Spec v0

**Status:** v0.1 — three of the seven redlines now decided. Path-C foundation work in progress.

## Decisions locked (2026-06-15)

1. **Decision-making → Talk (no video).** A decision is observable but the *decision itself* isn't a technique you film a coaching point at. Joined the Talk cluster with composure, compete level, communication.
2. **Path C — architect for both.** Promote `clip_storage_path` from JSON to a relational column on every event table. Dashboard ships first against this; clip library later is a free side-effect.
3. **Keep rejected clips.** Storage cost is ~$0.17/coach/year; training-data value (labelled false-positives + matching `coach_corrections` row) is significant. Add a `rejected_clips` index later for filtering — deferrable.

Open redlines remaining: detection window (Q2), significance thresholds (Q3), metric inventory (Q4), unsaveable-goal coaching gate (Q5), broadcast-vs-static flag on upload queue (Q7).

The new dashboard hero is the **keeper card**; below it sits the **"shit sandwich" reframed** — Trending Up / Focus Areas. Every highlight on either card answers the same question: *what should the coach do next?* The answer is one of three modalities. That's the contract.

---

## 1. What's actually true in the pipeline today

Numbers from a live audit, not from memory:

- **Video events** today live on `shot_events`, `distribution_events`, `one_v_one_events`, `sweeper_events`, `goals_conceded`, `goals_scored`. All carry `timestamp_seconds`. Only `one_v_one_events` and `sweeper_events` have a relational `clip_storage_path` column; the rest carry the clip pointer only inside `video_jobs.reviewed_output` JSON.
- **Worker clip-cutting code exists** (`worker/app.py:434–552`) with per-type windows: goal 5+3s, save 4+5s, distribution 3+7s, ~1–3 MB target.
- **But zero of Judah's published events have a clip yet.** Three published jobs sampled (KYSA Lions, OUFC 2016, PFC 2016) → 45 events between them, **0 with `clip_storage_path`**. The clip-cutting code was added after these jobs ran, so they shipped without clips.
- **6 jobs are pending `review_needed`** — exactly the 6 videos you mentioned. These will have clips when published *if* the worker now writes them; needs one publish-cycle to confirm before we commit.
- **Source-video seek already works** as a fallback. `VideoClip.jsx` plays a pre-cut clip if one exists, otherwise seeks the source video to `timestamp_seconds` and loops a 5+3s window manually. Functionally identical for the coach; just slower on first load.

**Conclusion:** Video-backed callouts on the new dashboard are achievable today using the source-video fallback. Pre-cut clips become available as the 6 pending jobs publish, plus a one-shot backfill of the 3 already-published jobs (~45 events × ~5 sec ffmpeg ≈ 4 minutes).

---

## 2. The Watch / Reel / Talk contract

Every highlight or focus item on the landing **must declare its follow-up modality**. No callout that doesn't tell the coach what to do with it.

| Modality | When it applies | UI surface | Source of truth |
|---|---|---|---|
| **Watch** | Signal is tied to one moment — save %, errors, 1v1 result, specific distribution outcome | "▶ Watch this clip" — opens the event in player | One `event.timestamp_seconds` |
| **Reel** | Signal is a pattern across many moments — handling, positioning, decision-making, distribution-shape (long-ball accuracy across the half) | "▶ Watch the reel (3 clips)" — autoplay sequence | N event timestamps within the window |
| **Talk** | Signal is psychological / behavioural — composure, compete level, communication, sweeper risk-tolerance | "💬 Discuss with your keeper" — opens a notes prompt + last-session prompt template | No clip; a coaching cue |

**Why three and not two:** Excelsior's analyst is right that video is the language this generation responds to. But forcing a single clip on an attribute signal ("Decision-making down — watch this clip") is dishonest — no single clip *is* the decision-making decline. A 3-clip reel is. And for composure/compete, even a reel is wrong; that's a conversation, and pretending it's a video drill weakens the coaching.

---

## 3. The algorithm

Four stages, all rule-based for v1. No ML until we have labelled "coach found this actionable" data.

### 3.1 Detection
Compare **Last-5 matches** against **prior-5 matches** (window of 10 total).
Fallback when `n < 10`: Last-5 vs **season baseline mean**.

Metrics tracked per period (the ones we have data for today):

| Metric | Source | Modality |
|---|---|---|
| Save % (on-target) | `shot_events` filter `on_target=yes` | **Watch** (one best/worst save) |
| Goals conceded / match | `goals_conceded` count / n_matches | **Watch** (worst concession) |
| Distribution success % overall | `distribution_events.successful` | **Reel** (3 representative) |
| Long-distribution success % | filter `type IN (gk_long, drop_kick)` | **Reel** |
| Distribution under pressure success % | filter `under_pressure=true` | **Reel** |
| 1v1 won % | `one_v_one_events.result` | **Watch** |
| Errors leading to goal | `matches.errors_leading_to_goal` | **Watch** (the error itself) |
| Cross-claim % | `matches.crosses_claimed / crosses_total` | **Reel** |
| Sweeper success % | `sweeper_events.result` filter | **Reel** |
| Handling (attribute) | `match_attributes.handling` avg | **Reel** (3 best/worst touches) |
| Positioning (attribute) | `match_attributes.positioning` avg | **Reel** |
| Decision-making (attribute) | `match_attributes.decision_making` avg | **Reel** |
| Composure (attribute) | `match_attributes.composure` avg | **Talk** |
| Compete level (attribute) | `match_attributes.compete_level` avg | **Talk** |
| Communication (attribute) | `match_attributes.communication` avg | **Talk** |

### 3.2 Significance filter
Drop signals that are noise. Required to be eligible:

- **Sample size:** event-based metrics need `n ≥ 8 attempts` in the period (save % off 2 shots is noise). Attribute metrics need `n ≥ 3 matches rated`.
- **Delta size:** `|Δ| ≥ 8 percentage points` for ratio metrics, `|Δ| ≥ 0.5` (out of 5) for attribute ratings.
- **Direction stability:** the delta is "trending" only if the **median of the most recent 3** is on the same side of baseline as the 5-match average. Prevents a single outlier match from flipping the narrative.

### 3.3 Modality routing
Per the table in §3.1. Hardcoded. **Attribute signals never route to Watch.** Psychological cluster never routes to Watch or Reel.

### 3.4 Selection — what fills the two cards
- **Trending Up card:** top 3 metrics by `|Δ|`, ranked, with **diversity rule** — no more than one Reel and one Talk (so we don't hide all the Watch-eligible wins behind one decision-making spike).
- **Focus Areas card:** same selection from declining metrics. Same diversity rule.
- **Each card item** carries: metric name, value, delta, modality, follow-up CTA, and (for Watch/Reel) the event ids or `(match_id, timestamp_seconds)` tuples that back it.

### 3.5 "Best clip" selection for Watch items
When the metric is, e.g., **"Save % ↑"**, the natural follow-up is "watch the best save." Picking criterion:
- **Save:** highest difficulty * outcome quality. v1 heuristic: `goal_rank=Difficult` AND `outcome IN (held, rebound_safe)` AND `gk_action != Missed` → pick the most recent.
- **Goal conceded (focus):** `goal_rank=Saveable` → pick most recent. (Don't surface unsaveable goals as focus items — that's demoralising and not coachable.)
- **1v1:** most recent win for trending-up; most recent loss for focus.
- **Error leading to goal:** the error itself, always.

For Reel items, pick `n=3` events spanning the period, optionally weighted toward the most recent match so the coaching session connects to what just happened.

---

## 4. Phasing — what ships in what order

### Phase A — ship the landing on source-video seek (this week)
- Build the algorithm against existing relational data.
- VideoClip already supports `sourceUrl + timestamp_seconds` fallback. Use it.
- **Backfill the 3 already-published jobs** by re-running the worker's clip generation (`_generate_clips_for_events` is idempotent — won't re-cut existing). One-off script.
- **Confirm publish-time clip-cutting works** by publishing one of the 6 pending jobs and verifying `clip_storage_path` is set on every event in its `reviewed_output`. If not, fix that first.

### Phase B — once all matches have pre-cut clips (within 2 weeks)
- Promote `clip_storage_path` from JSON to a column on every event table. Right now it lives on `one_v_one_events` and `sweeper_events` but not `shot_events`, `distribution_events`, `goals_conceded`, `goals_scored`. Inconsistent. Fix at publish-time.
- Drop the source-video seek fallback once 95%+ of events have pre-cut clips. (The fallback still stays as graceful degradation for legacy jobs.)

### Phase C — only when v1 has coach-click data
- Replace the hand-tuned rules with a learned model trained on what coaches actually open / discuss / share. Until then, this is over-engineering.

---

## 5. Open redlines — please react to these

1. **The Watch / Reel / Talk taxonomy** — do you accept this as the contract? My strong recommendation is yes. The alternative ("every callout has one clip") is dishonest about attribute signals.

2. **Detection window — Last-5 vs prior-5 (with season-baseline fallback)?** Or do you want season-baseline as the primary comparison? Last-5 vs prior-5 creates a more visceral "you're improving" / "you've slipped" story but is noisier with small N. My pick: Last-5 vs prior-5 with the median-of-3 stability check.

3. **Significance thresholds — `n ≥ 8 events, n ≥ 3 attribute matches, |Δ| ≥ 8pts, |Δ| ≥ 0.5`** — these are my best guesses. You have the coach-experience to say "no, save % needs n ≥ 15 to mean anything." Override anything that's wrong.

4. **Metric inventory in §3.1** — anything missing? Anything not worth tracking? Pitch coverage, set-piece organisation, footwork-agility, reaction-speed, command-of-box, set-piece-org are attributes we have schema for but I didn't add to v1 — should any of them be Talk items?

5. **Goal-rank "Saveable" gate for Focus items** — am I right to exclude unsaveable goals from focus areas, or do you sometimes want to coach the *positioning* on an unsaveable shot (i.e. the focus isn't the save attempt, it's why he was there in the first place)?

6. **Phase A action item ordering** — fine to:
   1. Publish one of the 6 pending jobs and verify clip-cutting fires
   2. Backfill clips on the 3 already-published jobs
   3. Build the algorithm + new landing page against this data
   4. Address nav IA after the new landing is in coaches' hands
   ?

7. **Bonus** — the 3 broadcast vs 3 static split on the pending videos. Memory note says **static-cam has a sweeper blindspot** (when the keeper leaves the crease, he's outside the frame). Do you want me to flag pending jobs by camera type in the upload queue so you know which limitation each carries when reviewing? Small UI change, big trust signal.

---

## 6. Out of scope for this spec
- Multi-keeper hero (horizontal tabs) — adds after v1 is in coaches' hands
- Nav IA (Item 3 from our conversation) — designed after content settles
- "Form Score" composite weighting — proposed in the mockup; I'll tune the formula once §3 thresholds are confirmed
