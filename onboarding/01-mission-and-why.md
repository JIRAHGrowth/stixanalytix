# 1 — Mission & Why

**Read time: ~10 minutes. Required reading before any labeling work.**

## What StixAnalytix is

StixAnalytix is a goalkeeper-specific coaching analytics platform. Coaches upload match video; the system turns that video into structured data about every shot the keeper faced, every save, every distribution. The coach then reviews the data on a dashboard built specifically for goalkeeper development — not the generic team analytics that exist everywhere else.

**The gap we fill:** every other football analytics platform treats goalkeeping as secondary. Their reports give you 5-8 GK data points per match. Ours gives you 50+. The keepers we've shown it to call it the first product that actually understands how their position works.

## Why goalkeepers were ignored

Goalkeeping is a rare position. There's one of them on the pitch. Most analytics companies optimized for the other ten — passing networks, expected goals, defensive line height. A GK coach studying their player can't get answers from those tools, so they fall back to spreadsheets or video review. That's the workflow we're replacing.

But here's the catch: when we showed real coaches the depth of analytics we'd built (BC Soccer's head of goalkeeper identification, Excelsior Rotterdam in the Eredivisie), they said the same thing — *"This is impressive. We will not use it if it requires manual data entry."*

That sentence is the entire reason this labeling project exists. So let me explain.

## The pipeline — and where you sit on it

```
   ┌──────────┐       ┌───────────┐       ┌──────────┐       ┌──────────┐
   │  Match   │  -->  │  Gemini   │  -->  │  Ground  │  -->  │   Coach  │
   │  video   │       │ first-pass│       │  truth   │       │  reviews │
   │ uploaded │       │  analysis │       │  (YOU)   │       │ dashboard│
   └──────────┘       └───────────┘       └──────────┘       └──────────┘
                            |                   |
                            └────────┬──────────┘
                                     ↓
                          ┌────────────────────┐
                          │  Disagreement data │
                          │  -> next-gen model │
                          └────────────────────┘
```

**Gemini does the first pass.** A large multimodal model watches the video and produces structured event data — goals, saves, distributions. It's fast and it scales.

**It is also wrong, frequently and in specific ways.** On a recent match (Judah vs. KCITY, 15-0 win for the analyzed team), Gemini reported 14 goals, 55 saves, and 50 distributions. The actual numbers were 15 goals, 4 saves, and 15 distributions. Most of those 55 "saves" were inventions — the model couldn't tell the difference between a keeper picking up a backpass and a keeper making a save. It also flipped which team scored on 6 of 14 goals.

**Your job sits in that gap.** A human labeler watches the video, applies a strict rubric (the one in this package), and produces the *truth*. That truth corrects the coach's dashboard so they see real data instead of model hallucinations.

It does one other thing, and this is the part that makes this work strategically important:

## Your labels become training data

Every match where a human labeler produces ground truth, we now have a paired dataset:

- **Input:** the video Gemini watched
- **Output Gemini gave:** the messy first-pass JSON
- **Correct output:** your labels

That pair is gold. It's exactly what you need to fine-tune the next generation of the model — to teach it not to invent saves, not to flip team colours, not to drift timestamps. Without your work, the model stays stuck at its current accuracy. With your work, the model improves on every match you process.

This is the moat. Anyone can call the Gemini API. Almost no-one has a coaching-quality goalkeeper ground-truth dataset. **You are building that dataset.** 200 matches is enough to materially change how this product works.

## Why "good enough" labels are not good enough

It is tempting, with 200 matches in front of you, to rush. To skim. To pick the closest-looking option when you're not sure. Please don't.

Here is the cost of a sloppy label:

- **The coach gets bad data on their dashboard.** They make coaching decisions on it. Trust dies fast.
- **The training set teaches the next model to make the same mistake you made.** Sloppy labels don't just produce a sloppy dashboard — they produce a sloppy model that ships to every future user.
- **Inter-labeler disagreement compounds.** If labeler A and labeler B classify the same parry two different ways, the model learns the inconsistency, not the rule.

The 95% accuracy target we're aiming for at the model level can't exist if the ground truth we measure against is itself only 80% accurate. The ceiling of the model is the ceiling of your labels.

## What good labeling actually looks like

Three habits define a good labeler:

1. **Default to "unclear" or "I couldn't tell."** The rubric has "unclear" as a valid answer on almost every field. Use it. An honest "unclear" preserves data integrity; a guess corrupts it.

2. **Describe what you saw, not what you think happened.** If you can't describe the opposition's attack sequence in the 3-5 seconds before a "save," it's not a save. If you can't see the shooter's jersey colour at the moment of the strike, you can't confidently attribute a goal. Observable > inferred.

3. **Add edge cases to the log.** Every gray area you encounter is a gift to every future labeler. Don't quietly make a ruling and move on — write it up, get it reviewed, and the rule joins the canon.

## Why this isn't a chore

You are the labelers of the dataset that trains the first coaching-specific goalkeeper model. There will be one of those, eventually. Right now there isn't. Your work is the artifact that decides whether it gets built well or poorly.

Coaches who watch the dashboard will never see your name. The model that trains on your output will never thank you. But the difference between a keeper who develops well in this system and one who doesn't comes down, in part, to whether you took the extra ten seconds to mark a parry "unclear" instead of guessing it was a deflect.

That's the bar. Read the next document.

→ Next: [GK Domain Primer](02-gk-domain-primer.md)
