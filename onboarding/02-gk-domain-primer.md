# 2 — Goalkeeper Domain Primer

**Read time: 30-45 minutes. Required reading before any labeling work.**

This document teaches you to see what a goalkeeper coach sees. It is written from the perspective of someone who has played the position professionally and coached it for four decades. The vocabulary here is exact — the same words, with the same definitions, the Gemini analyzer uses. When you label, you and the model are speaking the same language.

If you have never played football, you can still label well. The position is more readable than it looks once you know what to watch.

## A word on the voice of this document

Goalkeeping has a culture and a language. Coaches don't call it a "save attempt"; they call it a save. They don't say the keeper "blocked the goal"; they say he made it small. We use the coaches' vocabulary throughout because that's what the dashboard speaks back to them. You'll pick it up.

---

## 1. What a goalkeeper actually does

People who watch football casually think a goalkeeper does one thing — stops shots. That's roughly 5% of the job in modern football. The actual job has four parts:

### Shot stopping
The headline. The keeper's reaction to a ball struck toward goal. Subdivided by **where** the shot came from, **how** it arrived (foot, head, deflection), and **what the keeper did** to deal with it (catch, parry, block, punch, deflect, beat, conceded).

### Crossing & aerial
Anything in the air into the box that the keeper claims, punches, or chooses to leave. A keeper's command of the area is judged by how decisively they take or stay on crosses.

### 1v1s and through balls
Situations where an opposition attacker is bearing down on goal in space, often having broken the offside line. Different toolkit — smother, K-barrier, spread save, narrowing the angle. Coaches study these separately because the decision tree is different.

### Distribution & build-up
What the keeper does **after** they have the ball. Goal kicks, kicks from hand, throws, short passes back into the build-up phase. In modern football this is half of the job. A keeper who can't play out of the back has a short ceiling.

You will be labeling all four of these. The vocabulary for each is below.

---

## 2. The pitch — the language coaches use for space

Most labeling errors trace to people not knowing where on the pitch a thing happened. Learn this once.

### Shot origin — where the ball was struck from

Looking down at the goal you're defending, with the goal at the bottom of the frame:

```
  ┌────────────────────────────────────────────────────┐
  │                                                    │
  │                  outL │ outC │ outR                │  ← outside the box
  │                       │      │                     │
  │   ┌──────────────────────────────────────────┐     │
  │   │                                          │     │
  │   │   cornerL          │            cornerR  │     │  ← penalty area corners
  │   │                    │                     │     │
  │   │           boxL │ boxC │ boxR             │     │  ← inside the box
  │   │                    │                     │     │
  │   │           ┌────────┴────────┐            │     │
  │   │           │     6yard       │            │     │  ← inside the 6-yard box
  │   │           │                 │            │     │
  │   │           └─────────────────┘            │     │
  │   └──────────────────────────────────────────┘     │
  │                       GOAL                         │
  └────────────────────────────────────────────────────┘
```

You'll see these labels in the rubric: `6yard`, `boxL`, `boxC`, `boxR`, `outL`, `outC`, `outR`, `cornerL`, `cornerR`. Left/right are from the **attacker's** perspective looking at the goal they're attacking. If you can't tell, use `unclear` — there is no penalty for honesty.

### Goal placement — where the ball crossed (or would have crossed) the line

This one flips. **Left and right of goal are from the GOALKEEPER's perspective, looking out from the goal.** A ball going into the keeper's left-hand post = `left_third`. Imagine standing on the goal-line in the keeper's gloves.

Height: `top` (above the keeper's reach, including over the bar), `mid` (chest to head height), `low` (ground to waist).

```
       ┌────────────────────────────────┐
       │ top-left │  top-mid │ top-right│     ← `top`
       ├──────────┼──────────┼──────────┤
       │ mid-left │  mid     │ mid-right│     ← `mid`
       ├──────────┼──────────┼──────────┤
       │ low-left │  low-mid │ low-right│     ← `low`
       └────────────────────────────────┘
        ↑                              ↑
        GK's left third                GK's right third
```

The mismatch between shot-origin (attacker view) and goal-placement (keeper view) is the single most common error. Read it twice.

---

## 3. Save events — what counts, and what doesn't

A **save event** is logged whenever the opposition takes a shot toward the goal the analyzed team is defending. On target, off target, blocked, deflected wide, scored — they all count as save events. The keeper's action is classified separately.

### The hard test for "is this a save event?"

Before you log anything as a save, you must be able to describe the opposition attack sequence in the 3-5 seconds before the shot. For example: *"Opposition #9 received the ball at the top of the box from a switch pass, took one touch and struck low."*

If you can't describe the attack, it is **not a save**. It's one of these things instead:

- A keeper picking up a backpass from their own defender (this is a distribution event)
- A keeper picking up a loose ball after a teammate's clearance (not a save, not a distribution — non-event)
- A keeper retrieving the ball from their own net after a goal (not anything)
- A clearance the keeper made under no shot pressure (distribution event)

This rule exists because the Gemini model invents saves. It will look at a video where the keeper picks up a backpass and call it a "Block" or "Catch" — because there's a keeper touching a ball. Your job is to apply the antecedent-attack test ruthlessly. Save events require shots. Shots require attacks. Attacks must be describable. No describable attack → not a save.

### Save actions — what the keeper did

When there **was** a save event, classify the keeper's action by what their hands and body did at the moment of contact. Watch the hands. Watch the ball after contact. Don't infer from the trajectory alone.

| Action | What you see | What you DON'T see |
|--------|--------------|---------------------|
| **Catch** | Both hands close around the ball, fingers form a "W" or basket behind the ball. Keeper retains the ball after contact — it stays in their possession. | A drop, a fumble, a rebound. If they didn't keep the ball, it's not a catch. |
| **Block** | The ball stops on the keeper's body or one hand without secure retention. Often produces a rebound. Common on close-range shots where there's no time to set hands. | Open palms, intentional redirection. The keeper got in the way; they didn't catch or parry. |
| **Parry** | Keeper's hand(s) intentionally redirect the ball to a chosen direction — wide, over the bar, down in front. You can see the wrist or palm **push**. | An accidental glance. A parry is a decision; a deflect is luck. |
| **Deflect** | The ball glances off the keeper without intentional redirection. Fingertip on a shot heading just over or wide. Lower-confidence contact than a parry. | Strong contact, clear direction change. If the ball mostly continues its original path with a slight touch, it's a deflect. |
| **Punch** | Clenched fist (or two fists) strikes the ball clear. Most common on crosses; also seen on shots when the keeper can't handle it. | Open palms. A punch is fists. |
| **Missed/Misjudged** | The keeper should have made the save and didn't. Poor positioning, slow reaction, mishandle. Used when the keeper is clearly at fault on a goal or a near miss. | A great strike to the top corner. If the shot is genuinely unstoppable, it's not "missed" — it's a `Goal` with `gk_action: unclear`. |
| **Goal** | The ball ended up in the net. The save analysis just notes this; the goal itself is tagged in the goals analysis. | Use `Goal` only when the ball crossed the line. |
| **unclear** | The keeper's action wasn't clearly visible, OR you genuinely can't distinguish between two action types. **This is a valid and useful answer — use it freely.** | Don't use `unclear` when you actually can tell. |

### A note on distinguishing parry from deflect (the #1 disagreement)

Watch the keeper's wrist. A **parry** has wrist action — the palm pushes the ball in a direction. A **deflect** has no wrist action — the ball glances off a passive hand. A strong parry that lands safely is a coach's dream. A deflect that ends up over the bar was lucky. Coaches care about the difference because it's the difference between a learned skill and an accident.

When you cannot tell, mark it `unclear`. Reviewers prefer 30% `unclear` to 30% wrong.

### Specialist actions — note in observations, keep the main label canonical

You'll see extraordinary saves where the main label is still one of the above but the keeper did something specific. Note these in the `gk_observations` field using the canonical name; the main `gk_action` stays as the closest canonical label (usually Block, Parry, or Catch).

- **Smother** — keeper goes to ground BEFORE the shot leaves, wrapping the body around the ball at the shooter's feet. Common in 1v1s. Main action is usually `Block` or `Catch` depending on retention.
- **K-barrier** — tight-angle save where the keeper makes a "K" shape against the near post, near foot extended along the line. Used in 1v1s from a tight angle.
- **Starfish / spread** — full body extension at the shot moment, limbs spread to maximize blocking surface. Often in 1v1s.
- **Tip-over** — parry over the bar, usually one-handed at full extension. Main action is `Parry`.
- **Set-set** — the keeper has time to take a second set position after their first one. A coaching positive. Note in observations.

### Body-distance zones (Mike Salmon A/B/C)

Coaches think about how far the keeper had to move to make a save. This matters because a Catch at body-distance A is routine; a Catch at body-distance C is exceptional.

- **A** — at or near the body, within arm's reach with no extension needed.
- **B** — within ~2 yards, keeper extends but doesn't dive full-length.
- **C** — beyond 2 yards, full extension or full dive.
- **unclear** — couldn't see the keeper's body position clearly.

---

## 4. Goals — what counts, and what gets you fooled

A goal is when the ball fully crosses the goal line, between the posts, under the bar. Simple in principle. There are three things that fool human reviewers and the model:

### The two-of-three evidence rule

For something to be a goal, you must observe **at least two** of:

(a) A kickoff from the centre circle within 60 seconds AFTER the candidate timestamp.
(b) A clear celebration within 10 seconds AFTER the candidate.
(c) A persistent scoreboard whose number for the scoring team increased by exactly 1.

If you can only confirm one — or none — it's not a confirmed goal. Don't log it. Better to omit a real goal (the coach can add it manually) than to log a phantom one (which the coach has to debunk).

### Rebound goals collapse — but save events don't

If shot A is saved/blocked and the ball rebounds to a teammate who scores on shot B, that is **ONE goal** at the rebound shot's timestamp. NOT two events. Goal-side, rebounds collapse to a single goal.

But on the save side, the **block on shot A is a separate save event** from the goal on shot B. So you'll log:
- 1 goal at shot B's timestamp
- 2 save events: a Block at shot A, a Goal at shot B

This asymmetry exists because saves and goals get analyzed by separate prompts; each does the right thing for its own purpose. Internalize it.

### Replays look like new goals

TV/Hudl/Veo broadcasts show replays of goals from a different angle. Slow-motion, different camera, sometimes split screen. **A replay is not a new goal.** If you see a goal-looking event with no kickoff and no scoreboard change, it's almost certainly a replay of one you already logged. Skip it.

### Team-attribution is the trap

The number-one error on goals is logging the right goal but the wrong team. This happens because:

- The model anchors on celebrations, not on the shooter
- Celebrations cluster supporters and players who weren't on the pitch
- Kickoff identity tells you who conceded (kickoff team = conceded team), which is corroborating but not primary

**Always identify the shooter's jersey colour at the moment of the strike.** That's the primary signal. If the shooter was off-camera, lower confidence to `low` and note that you couldn't see them. The shooter's kit, observed directly, is the only reliable attribution.

---

## 5. Distribution events — the modern half of goalkeeping

Anything the keeper does with the ball AFTER they have it. This is high-volume — a single match typically has 20-60 distribution events. Be thorough; coaches care more about this than people realize.

### What counts as a distribution event

All three must be true:

1. The analyzed-team keeper has the ball in their hands or at their feet
2. The keeper releases it via a clear kicking, throwing, or rolling action
3. The ball travels **at least 5 yards** from the keeper in a single clean release

A 1-yard shuffle, a set-up touch, a stationary hold — none of these are distribution events. **Multiple keeper touches in the same possession = ONE distribution event** at the timestamp of the release. Don't log the receive AND the release as separate events.

### Triggers — what brought the ball to the keeper

This is the key axis. Same release type can mean very different things depending on the trigger.

| Trigger | Description |
|---------|-------------|
| `goal_kick` | Set piece. Ball was out of play behind the goal off an opposition player. Keeper places ball on the goal-area line and kicks. |
| `after_save` | Keeper just made a save and chose to distribute (rather than restart from a corner / dead ball). Open play. |
| `backpass` | A teammate intentionally played the ball back to the keeper in open play. This is the modern build-up phase — watch for it. |
| `loose_ball` | The keeper collected a loose ball in or near the box without it being a save or a backpass. |
| `throw_in_to_gk` | A teammate's throw-in went to the keeper. |
| `free_kick_to_gk` | A teammate's free kick went to the keeper. |

### Distribution types — classify by RELEASE MOTION, not by where the ball ends up

This is the #1 distribution mistake. People classify by distance ("the ball went 40 yards, so it must be a long kick"). That's wrong. Classify by **how the ball left the keeper.**

Apply this decision tree in order:

1. **Did the ball leave the keeper's HANDS?** → `throw`
2. **Was the ball ON THE GROUND when the keeper's foot struck it?** → `pass`
3. **Did the keeper DROP the ball from their hands and strike it BEFORE it touched the ground?** → `gk_short` (under ~25 yards) or `gk_long` (over ~25 yards). The motion is identical; distance decides.
4. **Did the keeper drop the ball, let it BOUNCE, then strike it on the half-volley?** → `drop_kick`

**Common traps:**
- **Goal kicks are `pass`.** The ball is on the ground at the moment of strike. NOT `gk_long`. The `gk_long` type means the keeper held the ball and then volley-kicked it.
- **Backpasses returned by foot are `pass`.** Ball on ground → pass.
- **Throws don't go more than ~25 yards.** A "long throw" doesn't exist for keepers. If the ball travelled 40+ yards, it was `gk_long` or `drop_kick`, not `throw`.

### Pass selection — the coaching signal

Two keepers with identical completion rates can have very different value. Selection captures *intent*. Use these labels exactly:

| Selection | What it means |
|-----------|---------------|
| `short_to_defender` | Simplest progression. Team is calm and recycling. |
| `sideways_across_back` | Across the back line. Patient build-up or no forward option. |
| `long_to_forward` | Bypass midfield, look for a forward. High-risk high-reward. |
| `switch_wide` | Change the angle of attack to the opposite flank. Coaching-positive under pressure. |
| `backwards_under_pressure` | Only option was backwards (often after a press). A fact, not a fault. |
| `clearance_under_pressure` | Forced hoof under high press. Often out of play or to opposition. |
| `drilled_into_channel` | Flat, fast pass into a channel for a forward to chase. Modern progressive play. |

### Opposition keeper filter

If you see a keeper distributing the ball but their kit doesn't match the analyzed team's keeper colour, **that's the opposition keeper — don't log it.** Colour-check every keeper release. The model gets this wrong; you don't have to.

---

## 6. Phases of play — context that matters

Three coarse phases:

- **Open play** — the ball is live; both teams are positioning normally.
- **Set piece** — dead ball restart: free kick, corner, throw-in, goal kick.
- **Transition** — the ball just changed hands; one team is breaking, the other is recovering. Often where keepers face 1v1s.

You won't always need to label phase explicitly, but it should inform your other labels. A keeper claiming a cross on a corner is a different event from a keeper claiming a cross in open play.

---

## 7. What a goalkeeping "error" looks like

You will see goals where the keeper was at fault. The rubric uses `Missed/Misjudged` for the save action. Coaches separate genuine GK errors from "good goal, no chance" goals because the coaching response is completely different.

**Looks like a GK error:**
- Beaten at the near post on a shot they should have covered
- Slow off the line in a 1v1 they should have closed
- Spilling a routine catch into the danger area
- Punching when they should have caught (or vice versa)
- Wrong-footed by their own positioning, not by the shot

**Does NOT look like an error:**
- Top-corner strike beyond reach
- Deflection off a defender that changes the path of the ball
- Penalty kick (assess separately; penalties have their own probability bar)
- 1v1 where the attacker had time to set and finished cleanly into an unreachable corner

When in doubt, don't label it an error. The coach will assess. Your job is to record what was visible, not to play judge.

---

## 8. The thing no rubric can teach you

Goalkeeping has rhythm. A keeper who is "in" the match — engaged, talking, moving on every phase — looks different from one who is "out." You'll notice it. Coaches notice it constantly. You won't label "rhythm" anywhere, but your other labels will be more accurate if you're watching the whole keeper, not just the events. A keeper who has been disengaged for ten minutes is more likely to mishandle the next shot; a keeper who's been making sets and resets is less likely to.

This is the part of the job that fine-tuning will eventually capture. It can't right now. You can — by paying attention.

---

→ Next: [Labeling Rubric](03a-labeling-rubric.md)
