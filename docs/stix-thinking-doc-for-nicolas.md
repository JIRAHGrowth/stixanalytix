# StixAnalytix — Where I'm At
**For Nicolas | April 2026 | Joshua Marshall**

## Where it started → where it is
Built originally from a pro hockey goalie coach's spreadsheet. Pivoted to soccer when NHL coaches said it wasn't nuanced enough. Validated in soccer: **BC Soccer** (head of goalkeeper identification) and **Excelsior Rotterdam** (Eredivisie club) both said they love the depth of data and visualizations — neither will use it if manual entry stays in the workflow. That's the real gap between "this is impressive" and "we'd buy this."

## The wedge
Every existing platform treats goalkeeping as secondary. Per the BC Soccer reports I reviewed:

| Platform | GK data points per report |
|---|---|
| InStat | ~8 (saves by distance, crosses, passes) |
| SciSports | **5** (saves, xSaves, conceded, claims, goalkicks) |
| Hudl | Basic save counts |
| **STIX** | **50+** (save type breakdown, shot origin/goal zone mapping, savaibility ranking, 1v1 outcomes, cross handling, distribution accuracy, sweeper, rebounds, 15 attribute ratings, 10 coaching alerts, season trends) |

That's not a better spreadsheet. It's a different product category. Built by a GK coach, for GK coaches.

## The real problem
Coaches won't enter data. Not pitchside, not post-match. The core product challenge isn't data depth — it's **getting data in without coach labor.** Which means STIX either automates from video or dies.

## The video direction (where I've landed)
Three integration paths:

1. **Manual clip linking with VEO** — friction remains, coaches still do work. Not enough.
2. **AI video pipeline** — upload match video → Gemini 2.5 identifies GK events → auto-populates STIX. Technically possible today (tiered accuracy: ~85% for basic events, ~55-65% for GK-specific detail, improves with training data). Estimated ~$2-8/match in API cost, <20min turnaround. **This is the direction.**
3. **Platform partnership (VEO)** — no public API exists. Partnership is eventual-state, not starting point.

Adjacent insight: a phone behind the goal is probably a better angle for GK-specific AI analysis than VEO's panoramic midfield view. Workflow and data advantage, VEO-independent.

## The honest hockey update
You mentioned the Rink Hockey angle. Worth knowing:
- **Ian Clarke** — NHL-calibre goalie coach, WHL relationships — has a working app "pretty close" to STIX, per Travis (who built STIX's original data model with me)
- Travis has cooled on hockey marketability after seeing Ian's app and talking to other coaches
- If hockey is revisited, it can't be the NHL pipeline segment Ian is targeting — would need to be youth/parent-funded (e.g. your Pursuit of Excellence connection)
- I don't want to overreach on hockey. Soccer has validation and clear competitive gap. Hockey needs more intel before it's a direction

## Where I am today
- Production app live (Supabase / Vercel / Next.js)
- Users logging real matches manually — proves the analytics engine works
- Strategic docs worked through: video feature spec, dashboard visual upgrade plan, VEO research, AI pipeline approach
- Solo-building with Claude Code. Self-aware about the limits of that

## Where I know I need help
1. **Architecture / security review** — you offered this in March. Database scaling, RLS hardening, preparing for real-user load. I'd pay for this or trade for it.
2. **Video pipeline engineering** — the ML/orchestration stack for automated GK event detection. Beyond what I can responsibly build alone.
3. **Product positioning decisions I can't make alone** — especially the hockey question, pricing model, and when/how to bring on paying clubs.
4. **Honest sanity checks** — someone who's been through the prototype→production gauntlet telling me when I'm kidding myself.

## Where I don't know what I need
- Capital vs. sweat equity vs. incubation structure — genuinely open
- Pace — "best moat" (video AI) is 12+ month build; "fastest revenue" is a different path
- Whether the Rink Hockey angle is distraction or adjacent-expansion opportunity — your read matters more than mine

## What I'm not asking for
I don't have a deck, valuation, or pitch. Markus told me you rarely partner or incubate — that context isn't lost on me. I'm not here to convince you into something. I'd rather understand what kind of involvement (if any) genuinely interests you, then figure out a structure that makes sense for both of us.
