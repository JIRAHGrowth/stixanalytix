# Dashboard Visual Upgrades — Design Reference

**Status:** Research & Ideation
**Last updated:** 2026-04-08
**Source:** Competitor report analysis (InStat + SciSports reports from BC Soccer vs Whitecaps, Feb 2026)

---

## Competitor Visual Inventory

### SciSports — What They Do Well

#### 1. Radar Charts with Benchmark Overlay
- Every category page (Ball Actions, Chance Creation, Finishing, Defending) uses a radar chart
- **Red fill** = team's actual performance
- **Blue outline** = global professional benchmark
- Each axis labeled with actual % vs benchmark
- AI-generated bullet-point summary sits alongside the chart
- Immediately shows where you're above/below average

#### 2. Pitch Diagrams with Event Plotting
Used for:
- Player average positions (blue dots = starters, orange = subs)
- Pass origin/destination arrows (green = successful, red = unsuccessful)
- Hot zone / assist zone highlighting (colored regions on pitch)
- Shot maps with xG sizing
- Box penetration paths
- Set piece delivery zones
- Clean, immediately readable, spatially grounded

#### 3. Zone Progression Heatmap Matrix
- Grid showing ball movement from zone to zone
- Color intensity = frequency
- Sophisticated but very readable

#### 4. AI Summary + Data Pairing
- Every page pairs an **AI narrative** (left) with a **visual chart** (right)
- Text explains what the data means in plain language
- Smartest UX choice: coaches who understand charts read the chart, coaches who don't read the summary

### InStat — Functional but Not Visual

#### 1. Dense Statistical Tables
- Data-heavy, text-first design
- GK page is a wall of numbers: "Shots on target / saved: 1 / 0 (0%)"
- No pitch diagrams for the GK, no spatial context

#### 2. Action Timeline Charts
- "Actions during the match" bar chart across 15-minute intervals
- "InStat Index" line chart showing performance trend through match
- Simple but useful — shows when player was most/least active

#### 3. Pass Distribution Network
- Passing connections between players on pitch diagram
- Matrix table showing from/to player pass counts
- Arrow thickness = frequency

---

## Proposed STIX Visual Upgrades

### Priority 1 — Unique to STIX (No Competitor Has These)

#### Save Type Breakdown Visual
- Donut chart or stacked bar showing save types: Catch / Parry / Punch / Smother / Block / Tip
- Per-match and season aggregate views
- Trend over time (is the keeper relying more on parries vs catches?)
- **Why it matters:** Shows save technique patterns — a coach can see if a keeper is punching too much instead of catching

#### Savaibility Breakdown
- Goals conceded split by Saveable / Difficult / Unsaveable
- Simple stacked bar or donut, per match and season
- **Why it matters:** Instantly answers "were those goals the GK's fault?" — changes entire evaluation
- "This keeper conceded 8 goals this season, but only 2 were saveable" is a story no other report tells

### Priority 2 — Adapted from Competitors (GK-Specific Versions)

#### Pitch Shot Map
- Inspired by: SciSports shot/scoring pages
- Shot origin dots plotted on a pitch diagram
- Dot size = frequency from that zone
- Dot color = outcome (green = save, red = goal, gray = miss)
- **Why it matters:** GK coaches think spatially. "Where are shots coming from?" is more intuitive on a pitch than in a bar chart

#### Goal-Mouth Heatmap
- 9-cell goal grid (matches existing STIX goal zone model)
- Heat intensity = frequency of goals in each cell
- Per-match and season views
- **Why it matters:** Shows where the keeper is vulnerable. "Top corners? Low to the left?" Informs training focus

#### GK Performance Radar with Benchmark
- Inspired by: SciSports category radars
- Axes: Save %, 1v1 win rate, Cross claim %, Distribution accuracy, Sweeper actions, Rebound control
- Overlay: keeper's season average OR a top-performer benchmark
- **Why it matters:** At-a-glance strengths vs weaknesses. Already have the radar for attributes — this adds a performance radar

#### Distribution Destination Map
- Inspired by: SciSports pass delivery zones
- Pitch heatmap showing where GK distribution lands
- Separate layers for: goal kicks, throws, short passes, long passes
- Color = accuracy (green = reached teammate, red = lost possession)
- **Why it matters:** "This keeper consistently hits the right channel with goal kicks but is inaccurate going long left." Actionable coaching insight

### Priority 3 — Enhanced Existing Features

#### GK Activity Timeline
- Inspired by: InStat 15-min action bars
- Match timeline with event type icons/colors
- Saves = green markers, Goals = red markers, Distribution = blue markers, Crosses = orange markers
- **Why it matters:** Shows when pressure spells happened. "All the danger came in a 10-min spell late in the second half"

#### AI Narrative + Chart Pairing
- Inspired by: SciSports summary panels
- Pair each STIX coaching alert with a supporting visualization
- "Save percentage declining" + trend line chart
- "Cross claiming drops" + claim rate bar chart by match
- **Why it matters:** Insight + evidence is more persuasive than either alone. Coaches trust data when they can see the story

#### Trend Sparklines
- Inspired by: InStat index over time
- Small inline trend lines for key metrics across recent matches
- Embedded in stat cards on dashboard overview
- **Why it matters:** At-a-glance season trajectory without opening a full chart

#### GK Distribution Network
- Inspired by: InStat pass distribution diagram
- Show who the keeper passes to most
- Arrow thickness = frequency, color = accuracy
- **Why it matters:** Nobody does this for GKs specifically. Shows if distribution is one-dimensional

---

## Implementation Notes

### Current STIX Chart Library
- Uses **Recharts** (RadarChart, BarChart, LineChart, PieChart already imported)
- Pitch diagrams would need custom SVG or canvas rendering — Recharts can't do this
- Heatmaps could use custom SVG grid with color scaling

### What Requires New Components
- Pitch diagram (SVG) — reusable for shot map, distribution map, activity plotting
- Goal-mouth grid (SVG) — 9-cell heatmap, relatively simple
- Sparkline component — small inline trend lines
- AI summary panel — text + chart side-by-side layout

### What Can Use Existing Recharts
- Save type donut (PieChart)
- Savaibility breakdown (BarChart or PieChart)
- Performance radar with benchmark (RadarChart — add second Radar layer)
- Activity timeline (BarChart with stacked segments)
- Trend sparklines (LineChart, minimal config)

---

## Design Principles (Learned from Competitors)

1. **Spatial > Tabular** — Plot data on pitch/goal diagrams whenever possible. Coaches think in terms of the pitch, not spreadsheets
2. **Insight + Evidence** — Always pair a plain-language insight with the supporting chart
3. **Benchmark context** — Raw numbers mean nothing without comparison. Show vs season average, vs benchmark, vs last 5 matches
4. **Color = meaning** — Green = positive/save, Red = negative/goal, Blue = neutral/benchmark. Be consistent
5. **GK-specific framing** — Every visualization should answer a question a GK coach would actually ask
