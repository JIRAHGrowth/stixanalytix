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

---

## Update — May 2026: After drinks with Nicolas

### The meeting
Met Nicolas for drinks. Talked for 2.5 hours, ~90 minutes on STIX. He's engaged — asked sharp technical questions, not surface-level. Has a gaming studio with senior developers and global teams; their platform is in high demand and not for sale. Built a real moat around his business. Also has a team of global audience marketing experts.

### His three proposals (from follow-up emails)

**1. Dedicated GK camera as the default workflow**
He's right. I'd been treating "phone behind the goal" as an optional optimization. Nicolas reframed it as the product itself — not "upload your match video" but "set up a GK cam." Solves three problems at once: GK always visible, consistent spatial reference, no off-camera gaps. Also creates a coaching habit and a potential affiliate revenue path (phone tripod / mount).

**2. Confidence-based auto-accept to reduce coach review burden**
Smart UX insight. The plumbing already exists — every event from Gemini comes back with a confidence score. Instead of routing every event to the coach for review, only surface uncertain ones. Goals at 90-95% confidence auto-accept. Save type classifications at 55-65% go to review. Cuts review burden roughly in half. The corrections coaches do make are also the most valuable training data (genuinely ambiguous cases).

**3. Fine-tuned model to break the prompt-engineering ceiling**
This is the big one, and where his team's value would be transformative. General-purpose Gemini 2.5 Pro has a ceiling around 75-80% on specialized tasks like GK event detection. A fine-tuned model trained specifically on goalkeeper footage could push to 90%+. The correction data I'm already collecting (coach_corrections table) is exactly what you'd use for training data. His estimate: costs drop from $2-4/match to $0.10-0.30/match with an in-house model. His team has the ML/engineering capability to build this.

### What he's signaling
He's not asking to invest or advise. He's positioning his dev team as the engineering capability STIX needs. The three proposals escalate from "thing Josh can do alone" (GK camera) to "thing that needs Josh + some UX work" (confidence routing) to "thing that needs a real engineering team" (fine-tuning). He's building toward a partnership pitch.

### Where things stand now
- **Invited him to a backend walkthrough** — screen share of the full system: data model, video pipeline, Gemini analysis flow, coach review, dashboard. Not a pitch — just getting him in front of the actual code and architecture so he can assess what's real.
- **Codebase preparation** — Began refactoring for team-readiness. Extracted shared constants, theme, and mapping functions into single-source-of-truth files (`lib/constants.js`, `lib/theme.js`, `lib/mappings.js`). All 8 consumer pages now import from shared sources instead of defining their own copies. Build passes clean.

### Architecture readiness assessment
Did a full architecture review to understand what Nicolas's team would see:

**What's solid:**
- Supabase integration (three-tier client strategy, RLS policies, proper admin key isolation)
- Auth flow (session refresh, delegate detection, onboarding routing)
- API route validation (defense-in-depth, ownership checks)
- Video pipeline (chunking, retries, coach corrections feedback loop, soft deletes)
- Data model (well-structured tables, clear relationships)

**What needed fixing (done):**
- Constants duplicated 3-5x across files with drift between definitions — **extracted to lib/constants.js**
- Theme defined 5+ times with inconsistencies (missing colors) — **extracted to lib/theme.js**
- Gemini-to-pitchside mapping functions duplicated in review page and publish route — **extracted to lib/mappings.js**

**What still needs work (planned):**
- dashboard/page.jsx is 2,500+ lines; pitchside/page.jsx is 1,400+. Both contain 5-7 components fused into single files. Multiple devs can't work on different features without merge conflicts. Needs component extraction.
- No shared component library (buttons, cards, modals rebuilt per page)
- No data fetching abstraction (every page writes its own Supabase queries)
- Two divergent match-logging paths (pitchside and video publish) compute aggregates differently

**Assessment:** The codebase works and the logic is sound. The issues are organizational, not fundamental. A team needs 2-3 sprints of refactoring before they can work in parallel effectively — but it's not a rewrite.

### Next steps
1. Backend walkthrough with Nicolas (scheduling)
2. Continue component extraction from dashboard and pitchside
3. Depending on his reaction to the architecture: discuss team involvement structure
