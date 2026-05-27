# 3a — Labeling Rubric (reference)

**This is the daily reference document. Bookmark it. Once you've read the [GK Domain Primer](02-gk-domain-primer.md), you should be able to use this rubric as a quick lookup while labeling.**

## The labeling tool: Excel

You will fill in one Excel workbook per match, generated from [scripts/ground-truth/_template.xlsx](../scripts/ground-truth/_template.xlsx). The workbook has 7 sheets:

| Sheet | Color | What you log |
|-------|-------|--------------|
| **Metadata** | gray | Match info (date, opponent, colours, score) |
| **Goals** | red | Every goal scored (either team) |
| **Saves** | green | Every shot the analyzed team's keeper faced |
| **Distribution** | blue | Every ball the keeper released back into play |
| **Crosses** | orange | Crosses the keeper had to react to |
| **Sweeper** | purple | Keeper actions outside the box (clearances, interceptions) |
| **1v1s** | gold | 1v1 situations and big moments |

Every sheet has dropdowns and a sample row. The dropdowns are the only valid values — don't free-text into a dropdown column.

When you're done, run `node scripts/excel-to-ground-truth.js scripts/ground-truth/<your-file>.xlsx` to convert it to JSON. The JSON is what the eval scripts compare Gemini against.

## The workflow

For each match, in order:

1. **Get the video and the metadata** from Joshua (or the shared queue).
2. **Generate a fresh template** for your match: copy `_template.xlsx` to `scripts/ground-truth/<match-name>.xlsx`.
3. **Fill in the Metadata sheet first.** Get the colours right — labels downstream depend on this.
4. **Watch the match blind, top to bottom.** Pause to log events. **Do NOT look at the Gemini output before labeling.** (More on this below — it's the #1 mistake.)
5. **After your blind pass, review the Gemini output as a second check.** If it found something you missed and you can verify it on tape, add it. If it found something that fails the rubric, skip it.
6. **Self-check** using the checklist at the end of this doc.
7. **Convert and commit:** run the converter, eyeball the JSON, then ping Joshua / submit.

### Why "blind first" matters

If you read the Gemini output before labeling, you anchor on it. You'll subconsciously confirm what it found and miss what it missed. We are not measuring "how well a human agrees with Gemini" — we are measuring ground truth. Label blind, then compare. The 10-15 extra minutes are worth it.

---

## Timestamps — universal rules

- **All timestamps are video offsets in MM:SS** from the start of the uploaded video file. Not match clock. The video starts at 0:00.
- **Mark the moment the ball is struck**, not the moment the keeper touches it. For goals: the strike that scored. For saves: the strike that initiated the save. For distributions: the release.
- **If you're unsure within ±5 seconds, drop confidence to low** (or note it).
- **Two events within 5 seconds of each other are suspicious.** Either you're double-counting, or it's a rebound (which is two save events but one goal — see [Rebound asymmetry](#rebound-asymmetry) below).
- The `Half` column: 1 or 2. Use it only if you know which half from match context (halftime break, scoreboard, etc.). Otherwise leave blank.

---

## Metadata sheet

| Field | What to enter |
|-------|---------------|
| Match name | Short slug, e.g. `judah-vs-ofc-2026-04-25` (use kebab-case, no spaces) |
| Date | `YYYY-MM-DD` |
| Opponent | Team name (e.g. `OFC 2016`) |
| Venue | Home / Away / Neutral |
| Session type | Match / Friendly / Training |
| My team color | Lowercase, the analyzed team's outfield kit (e.g. `black`) |
| Opponent color | Lowercase (e.g. `light blue`) |
| My GK color | Lowercase (e.g. `orange`) |
| Age group | U6 through U18 or Senior |
| Video duration | `MM:SS` from the video file |
| Final score — us / them | Integers. Confirm against the video, not your assumption. |
| video_job_id | UUID from the pipeline run. Joshua provides this. |

**Critical:** The colour fields are the contract between you and the analyzer. If you write `black` and the analyzer was told `dark`, the comparison breaks. Use exactly the colour names that match the upload metadata. If unsure, ask before labeling.

---

## Goals sheet

One row per goal. **Rebounds collapse to one goal** at the rebound shot's timestamp.

| Column | Allowed values | Notes |
|--------|----------------|-------|
| Time (MM:SS) | text, `MM:SS` | Strike timestamp |
| Half | `1` / `2` | Optional |
| Scoring team | `Us` / `Opponent` | "Us" = the analyzed team |
| Attack type | Open play / Counter attack / Corner / Free kick / Penalty / Throw-in / Set piece other / Other | What kind of attack produced the goal |
| Shot type | Header / Driven / Tap-in / Volley / Half-volley / Curled / Chip / One-v-one finish / Rebound / Deflection / Penalty / Free-kick / Own goal / Other | How the ball was struck |
| Shot location | 6-Yard Box / Left Channel / Central Box / Right Channel / Wide Left / Central Distance / Wide Right / Corner Left / Corner Right | Where the shooter struck from. **Attacker perspective** (their left/right facing the goal). |
| Placement — height | Top / Mid / Low / Unclear | Where the ball crossed the line |
| Placement — side | GK Left / Centre / GK Right / Unclear | **Goalkeeper perspective** (looking out from the goal). NOT attacker perspective. |
| Play description | free text | 1-2 sentences. What did the opposition/we do to create this? "Counter from a turnover, #11 carried, slipped #9 in behind, struck low across the keeper." |
| GK observations | free text | What did the keeper do? Use canonical terms (set-set, dive, beaten near post, etc.). If the keeper was off-camera or not visible, say so. |
| Notes | free text | Anything else. Replay confusion, scoreboard ambiguity, video gap, anything to flag for review. |

### Goal-event hard rules

1. **Two-of-three evidence rule.** Every goal you log must have at least two of: a kickoff within 60s after, a celebration within 10s after, or a scoreboard change. If you have only one (or none), don't log it.
2. **Identify the shooter by jersey colour at the moment of the strike.** Not by celebration colour. Not by who kicked off. The shooter, observed directly, decides `Scoring team`.
3. **Rebounds collapse.** Shot A saved → ball falls to teammate → shot B scores. ONE goal at shot B's timestamp.
4. **Replays don't count.** If you see what looks like a goal but no kickoff and no scoreboard change, it's a replay of one you already logged. Skip.

---

## Saves sheet

One row per **shot faced by the analyzed team's keeper**. On or off target, saved or scored. **Rebounds do NOT collapse** — each shot is its own save event.

| Column | Allowed values | Notes |
|--------|----------------|-------|
| Time (MM:SS) | text | The strike timestamp |
| Half | `1` / `2` | Optional |
| Shot origin | 6-Yard Box / Left Channel / Central Box / Right Channel / Wide Left / Central Distance / Wide Right / Corner Left / Corner Right | Where the opposition struck from. **Attacker perspective.** |
| Shot type | Foot / Header / Deflection | How the ball was struck. "Volley/driven/tap-in" go in Play description. |
| On target | Yes / No / Unclear | "Would the ball have crossed the line absent a save?" |
| GK action | Catch / Block / Parry / Deflect / Punch / Smother / Starfish / K-Barrier / Missed / Goal / Unclear | See the [Save action cheat sheet](#save-action-cheat-sheet) below |
| GK visible? | Yes / Partial / No | Could you actually see the keeper's body at contact? |
| Outcome | Held / Rebound (safe) / Rebound (dangerous) / Corner / Out of play / Goal | What happened to the ball |
| Body zone | A / B / C / Unclear | Mike Salmon zones — see primer Section 3 |
| Placement — height | Top / Mid / Low / Unclear | Where ball crossed (or would have crossed) the line |
| Placement — side | GK Left / Centre / GK Right / Unclear | **GK perspective.** Looking out from the goal. |
| Play description | free text | 1-2 sentences describing the opposition attack in the 3-5s **before** the strike. Required. |
| GK observations | free text | What the keeper actually did at contact. Canonical vocabulary. |
| Notes | free text | Anything to flag |

### The antecedent-attack rule

**If you cannot describe the opposition's attack in the 3-5 seconds before the shot, it is NOT a save.** It's a keeper touch — a backpass collection, a loose-ball pickup, a clearance — and belongs in Distribution (or nowhere). Every save row must have a `Play description` that describes a real opposition attack sequence. No describable attack → drop the row.

### Save action cheat sheet

| If you see... | The label is |
|---------------|--------------|
| Two-handed W behind the ball, keeper holds | **Catch** |
| Ball stops on body or one hand, no clean retention, rebound likely | **Block** |
| Hand intentionally pushes the ball wide / over / to ground | **Parry** |
| Ball glances off a passive hand, mostly continues original direction | **Deflect** |
| Clenched fist(s) strike the ball clear | **Punch** |
| Keeper goes to ground BEFORE the shot, body wraps the ball at attacker's feet | **Smother** |
| Full body spread at the shot moment (1v1, close range) | **Starfish** |
| Tight-angle save against the near post, "K" body shape | **K-Barrier** |
| Keeper should have saved but didn't — poor position, mishandle, slow | **Missed** |
| Ball in the net | **Goal** |
| Can't tell which of the above, or keeper not clearly visible | **Unclear** |

### When to use `GK visible: No`

If the keeper is off-camera at the moment of strike, use `GK visible: No` and `GK action: Unclear`. Don't guess what they did from the ball's trajectory. Coaches can review the clip — they'd rather see "we couldn't see this" than "the labeler made it up."

### Rebound asymmetry

**Saves do not collapse rebounds; goals do.** If shot A is blocked, rebound to attacker, shot B scores:

- Saves sheet: **2 rows** — Block on shot A, Goal on shot B (timestamps 1-3 seconds apart)
- Goals sheet: **1 row** — the goal at shot B's timestamp

This is intentional and is one of the most common labeler mistakes. Read it twice.

### Off-target shots

You DO log them. Off-target shots are save events; the coach wants to see them. Set:
- `On target: No`
- `GK action: Unclear` (no save action happened)
- `Outcome: Out of play`

---

## Distribution sheet

One row per distribution event. **High volume** — expect 20-60 per match. Don't skip routine ones.

Two ways to fill this in:

### Option A — row-by-row (preferred for new labelers)

| Column | Allowed values | Notes |
|--------|----------------|-------|
| Time (MM:SS) | text | The **release** timestamp, not the receive |
| Half | `1` / `2` | Optional |
| Trigger | Goal kick / After save / Backpass / Loose ball in box / Throw-in to GK / Free kick to GK | What brought the ball to the keeper |
| Type | GK Short Kick / GK Long Kick / Throw / Pass / Drop-kick | **Classify by release motion, NOT by distance.** See decision tree below. |
| Successful | Yes / No | Did the ball reach a teammate? |
| Under pressure | Yes / No | Was an opposition player closing the keeper? |
| Pass selection | Short to defender / Sideways across back / Long to forward / Switch wide / Backwards under pressure / Clearance under pressure / Drilled into channel | Intent of the pass |
| Direction | Left / Centre / Right / Backwards | Direction of release (from the keeper's perspective forward into the pitch) |
| Receiver | Defender / Midfielder / Forward / Out of play / Opponent (turnover) | Who got the ball |
| First touch | Clean / Heavy / Two touches / Mishit | The receiver's first touch quality |
| Notes | free text | Anything to flag |

### Option B — quick totals (for cases where row-by-row is impractical)

There's a summary block at the top of the Distribution sheet — `GK Short attempts/successful`, `GK Long attempts/successful`, etc. If you can't tag row-by-row (e.g. video is too low-quality, time-budgeted), fill in those totals **instead** of logging individual rows. The converter computes totals from rows if rows exist, OR reads the summary block if not.

**Default to Option A for the calibration phase and the first 20 matches.** Per-event detail is much more valuable for training than aggregate counts.

### Distribution-type decision tree

Apply IN ORDER:

1. Ball leaves the keeper's **hands** at the moment of release? → **Throw**
2. Ball is **on the ground** when the keeper's foot strikes it? → **Pass**
3. Keeper **drops the ball** from hands, strikes it **before it touches ground**? → **GK Short Kick** (<25 yards) or **GK Long Kick** (>25 yards)
4. Keeper drops the ball, lets it **bounce**, strikes the rising ball? → **Drop-kick**

### Distribution traps

- **Goal kicks are `Pass`.** Ball on ground at strike. NOT GK Long.
- **A "long throw" doesn't exist.** Throws don't go >25 yards. If the ball travelled 40+, it was GK Long or Drop-kick.
- **Backpasses returned by foot are `Pass`.** Ball on ground → pass.
- **Opposition keeper distributions are NOT logged.** Colour-check every keeper release.

---

## Crosses sheet

One row per cross/corner that the keeper had to react to. Note: a cross the keeper let go (because a defender cleared it) is still logged — `GK action: Stayed on line` or `Defender cleared`.

| Column | Allowed values |
|--------|----------------|
| Time (MM:SS) | text |
| Half | `1` / `2` |
| Side | Left / Right / Corner Left / Corner Right |
| Cross type | Whipped / Floated / Driven / Cut-back / Looped |
| Destination | Near post / 6yd / Penalty spot / Far post / Out of box |
| GK action | Catch / Punch / Tip-over / Stayed on line / Missed/Misjudged / Defender cleared |
| GK starting pos | On line / Edge of 6yd / Edge of 18yd / Outside box |
| Outcome | Held / Punched away / Tipped over / Conceded / Cleared by defender / Shot from rebound |
| Notes | free text |

---

## Sweeper sheet

Keeper actions **outside the goal area** — clearances, interceptions, tackles, headers in open play. The "sweeper-keeper" role.

| Column | Allowed values |
|--------|----------------|
| Time (MM:SS) | text |
| Half | `1` / `2` |
| Action | Clearance / Interception / Tackle / Header |
| Distance from goal | In box / Edge of box / 5–15 yards out / 15+ yards out |
| Successful | Yes / No |
| Pressure | None / 1 attacker / 2+ attackers |
| Outcome | Possession retained / Cleared safely / Conceded turnover / Goal conceded |
| Notes | free text |

---

## 1v1s sheet

The "big moments" sheet. Sparse — usually 0-5 rows per match. Use for anything that doesn't fit a regular sheet but matters: 1v1s, recovery saves, errors leading to goals, anything you'd want the coach to look at.

| Column | Allowed values |
|--------|----------------|
| Time (MM:SS) | text |
| Half | `1` / `2` |
| Event type | 1v1 faced / Recovery save / Error leading to goal / Big moment (other) |
| Outcome | Won / Conceded / Saved / Cleared |
| Notes | free text — be descriptive, this is where you tell the story |

---

## Self-check before you submit

Run through this list before converting to JSON:

### Goals
- [ ] Every goal has a kickoff or celebration or scoreboard confirmation (at least 2 of 3)
- [ ] Scoring team matches the shooter's observed jersey colour (not celebration colour)
- [ ] No two goals within 5 seconds of each other (rebounds collapse to one goal)
- [ ] Final score (Metadata sheet) equals sum of `Us` goals vs sum of `Opponent` goals

### Saves
- [ ] Every save row has a `Play description` that describes a real opposition attack
- [ ] Rebound chains are logged as separate rows (Block + Goal, not one row)
- [ ] Off-target shots have `On target: No` and `GK action: Unclear`
- [ ] No `Catch` row where the ball wasn't retained — those are Block or Parry
- [ ] No `Parry` row where the redirect direction isn't visible — those are Deflect or Unclear
- [ ] Goal placement side uses **GK perspective** (GK Left / Centre / GK Right)

### Distribution
- [ ] No goal kicks labeled as `GK Long Kick` (goal kicks are `Pass`)
- [ ] No throws over ~25 yards (those are `GK Long Kick` or `Drop-kick`)
- [ ] No opposition-keeper distributions logged
- [ ] Multi-touch possessions logged as ONE event at the release timestamp

### Coverage
- [ ] Events distributed across the full match duration, not just the first 15 minutes (unless the match was so one-sided one team had no second-half activity)
- [ ] You actually watched the second half (this sounds obvious — set yourself a halftime check)

### Honesty
- [ ] You used `Unclear` freely where appropriate. If your match has zero `Unclear` entries, you may have over-classified — re-check borderline calls.
- [ ] You added any edge cases you ruled on to [03b-edge-case-log.md](03b-edge-case-log.md)

---

→ Next: [Edge-Case Log](03b-edge-case-log.md)
