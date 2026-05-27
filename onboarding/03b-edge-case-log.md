# 3b — Edge-Case Log (living document)

**This document grows. Every gray-area ruling lives here.**

## Purpose

The [Labeling Rubric](03a-labeling-rubric.md) covers the cases that have a clear answer. This document covers the cases where two reasonable labelers could disagree, and records the ruling we've made so the next labeler doesn't have to re-litigate it.

If you encounter a gray area while labeling:

1. **Don't quietly make a ruling.** A silent ruling becomes drift; drift becomes inconsistency in the training set.
2. **Add an entry to this log** describing what you saw, what you ruled, and why.
3. **Flag it to the reviewer** (Joshua, currently). The ruling becomes canon once accepted.
4. **The rubric inherits.** If the edge case is general enough to be a rule, it eventually graduates into [03a-labeling-rubric.md](03a-labeling-rubric.md).

## Entry format

Each entry is a short block. Keep it tight — these are reference, not essays.

```
### YYYY-MM-DD — <short title>
**Match / clip:** <match-name>, <MM:SS>
**What I saw:** <1-2 sentences describing the moment>
**The question:** <what made this a gray area>
**Ruling:** <the call that was made>
**Why:** <one sentence on the reasoning>
**Going forward:** <the general rule, if any>
**Ruled by:** <name>
```

## Why "Going forward" is the most important field

A ruling on a single clip is worth ten minutes saved. A general rule extracted from that ruling is worth a hundred labels stayed consistent. Always try to articulate the rule, even if it ends up being "this one was a coin flip, no general rule."

---

## Seed entries (illustrative format — real entries replace these as the project starts)

### 2026-05-27 — Backpass collected without distribution within 5s
**Match / clip:** Illustrative example
**What I saw:** A defender plays the ball back to the keeper. The keeper picks it up, holds it for 4 seconds while pointing teammates into position, then is whistled for the 6-second rule and gives away an indirect free kick.
**The question:** This isn't a save (no opposition shot). It also isn't a complete distribution event (no release ≥5 yards). Where does it go?
**Ruling:** Don't log it on the Distribution sheet (no release). Don't log it on Saves (no shot). Note in the match's `notes` column on Metadata if it affected the score; otherwise drop it.
**Why:** A keeper holding the ball is a non-event unless it leads to a release (Distribution) or a penalty (note in metadata for now).
**Going forward:** Distribution requires both a possession and a release ≥5 yards. Non-release possessions are non-events.
**Ruled by:** Joshua Marshall (illustrative)

### 2026-05-27 — Shot deflects off a defender en route to goal
**Match / clip:** Illustrative example
**What I saw:** Opposition #9 strikes from the edge of the box; the ball deflects off a defender's knee and changes direction, looping toward the goal. Keeper adjusts late, parries over the bar.
**The question:** Was this a save? Was the deflection by the defender or by the keeper? What `Shot type` applies?
**Ruling:** Yes, it's a save event. The save is on the **deflected** trajectory, which is what the keeper actually had to deal with. `Shot type: Deflection`. `GK action: Parry` (keeper redirected over the bar with intent). `Play description` notes the deflection: "Strike from outside the box deflected off a defender's knee and looped toward the top-right corner."
**Why:** The save is whatever the keeper had to deal with. A deflection that becomes a goal-bound shot becomes the shot of record.
**Going forward:** When a defender deflects a shot and the keeper saves the resulting trajectory, log as one save event with `Shot type: Deflection`. Don't log the original strike as a separate save.
**Ruled by:** Joshua Marshall (illustrative)

### 2026-05-27 — Penalty kick saved
**Match / clip:** Illustrative example
**What I saw:** Penalty awarded; opposition #10 strikes low to the keeper's right; keeper dives and parries the ball wide for a corner.
**The question:** Where does the penalty go? Goals sheet (it didn't score)? Saves sheet? Both?
**Ruling:** **Saves sheet only.** `Shot origin: 6-Yard Box` (penalty spot is 12 yards but the closest origin code), `Shot type: Foot`, `On target: Yes`, `GK action: Parry`, `Outcome: Corner`, `Body zone: C`, `Play description: "Penalty kick following a foul in the box."` The Goals sheet stays empty for this event.
**Why:** A saved penalty is a save, not a goal. If the penalty had scored, it would be one row on Goals (with `Attack type: Penalty`) AND one row on Saves (with `GK action: Goal`).
**Going forward:** Saved penalties → Saves sheet only. Scored penalties → both Goals and Saves. The Goals sheet's `Attack type: Penalty` covers the goal-side classification.
**Ruled by:** Joshua Marshall (illustrative)

### 2026-05-27 — Keeper drop-kick that goes 22 yards
**Match / clip:** Illustrative example
**What I saw:** Keeper releases the ball from their hands, lets it bounce once on the ground, then strikes the rising ball with the laces. Travels ~22 yards to a midfielder.
**The question:** The travel distance is under 25 yards, which would suggest `GK Short Kick`. But the motion was a half-volley off the bounce, not a hand-drop-and-strike.
**Ruling:** `Type: Drop-kick`. The `GK Short Kick` / `GK Long Kick` types apply only to **volleys** (struck before the ball touches the ground). Anything off a bounce is `Drop-kick` regardless of distance.
**Why:** The distribution-type decision tree is `release motion → distance`, not `distance → type`. The motion is the first cut.
**Going forward:** Drop-kicks can be short or long; distance does NOT promote them to `GK Long`. Volleys can be short or long; the motion (drop-from-hand, struck before ground contact) is the test.
**Ruled by:** Joshua Marshall (illustrative)

---

## Real entries start below this line

<!-- Add new entries above this line so the most recent are first. -->
