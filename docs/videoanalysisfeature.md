# Video Analysis Feature — UI/UX Spec

**Status:** Draft v2 — Revised Direction
**Last updated:** 2026-04-08

---

## 1. Problem Statement

Goalkeeper coaches need deep, position-specific analytics to develop their keepers. StixAnalytix already provides 50+ GK-specific data points, trend tracking, and coaching alerts — more depth than any competitor. But the current input method (manual pitchside logging) is a dealbreaker. Coaches are too busy watching the game to enter data, and they won't do post-match data entry either.

Meanwhile, clubs already record matches using automated cameras (VEO, Hudl Focus). The video exists. The analytics engine exists. The missing piece is the bridge: **automatically extracting GK-specific events from match video and feeding them into the STIX analytics engine.**

### Validated by Market Feedback

- **BC Soccer** and **Excelsior Rotterdam** both said they loved the analytics depth but would not use the product with manual data entry.
- They want video integration that uploads the data for them, with data points linked/tagged to events in the recorded video.
- VEO is the most common recording platform at the youth/academy level.

### Why STIX, Not the Existing Platforms?

Every competing platform treats goalkeeping as secondary:

| Platform | GK Data Points | GK-Specific Analysis |
|----------|---------------|---------------------|
| SciSports | 5 (saves, xSaves, conceded, claims, goalkicks) | None — same template as outfield players |
| InStat | ~8 (saves by distance, crosses, passes) | One line in match report: "Goalkeeper saves: 1" |
| Hudl | Basic save count | No GK-specific breakdown |
| **STIX** | **50+** (save types, shot origins, goal zones, savaibility, 1v1s, cross handling, distribution, sweeper, rebounds, 15 attributes, 10 alert categories, season trends) | **Purpose-built for GK coaches** |

The gap isn't marginal — it's a different product category. STIX's competitive wedge is being the only platform that gives GK coaches the depth they need, delivered automatically from video they already have.

---

## 2. User Stories

| # | As a... | I want to... | So that... |
|---|---------|-------------|-----------|
| 1 | GK Coach | Link a VEO match recording to a STIX match | STIX can analyze the video automatically |
| 2 | GK Coach | Have GK events auto-detected from match video | I get full analytics without entering any data |
| 3 | GK Coach | See auto-generated event clips on my dashboard | I can review specific moments (saves, goals, 1v1s) with video evidence |
| 4 | GK Coach | Refine or correct AI-detected events if needed | I can improve accuracy for edge cases without starting from scratch |
| 5 | GK Coach | Share clips and analytics with keepers/parents | I can provide visual evidence alongside coaching points |
| 6 | Parent/Volunteer | Log basic match events using a simplified interface | I can contribute data when video isn't available |
| 7 | Delegate | View auto-generated clips for keepers I have access to | I can review video within my permission scope |

---

## 3. Scope Boundaries

### In Scope — Stage 1 (Parent Logger)
- Simplified pitchside interface for parents/volunteers
- Plain-language event logging (no coaching jargon)
- Guided prompts with visual aids
- Tutorial/onboarding video for first-time parent loggers
- Reduced data point set (capture ~60% of full STIX model)
- Data flows into existing dashboard analytics

### In Scope — Stage 2 (AI Video Pipeline)
- Coach links match video (VEO export, direct upload, or URL)
- AI processes full match and detects GK-specific events
- Auto-generated event clips with timestamps
- Events auto-populate STIX data model (shot events, goals, distributions, etc.)
- Coach can optionally refine AI-tagged events on dashboard
- Clip playback inline on dashboard match detail
- Video library with filtering by event type, GK action, outcome
- Lightweight sharing via time-limited URLs

### Out of Scope (All Stages)
- Live in-match feedback or real-time analysis
- Video editing / trimming / drawing annotation tools
- Multi-camera synchronization
- Live streaming
- Full video hosting (STIX stores clips, not full matches)
- Coach doing primary data entry of any kind

### Future Consideration
- AI accuracy improvement via feedback loop (coach corrections train the model)
- Freeze-frame annotation (draw on key moments)
- Exportable highlight reels (compiled clips per category)
- Direct VEO API integration (requires partnership)
- AI-generated coaching recommendations ("Based on 12 1v1s this season, keeper tends to...")
- xG / PSxG calculation from video analysis

---

## 4. Competitive Positioning

### What Competitors Produce for GKs (from actual BC Soccer reports)

**InStat Player Report (GK):** One page, same as outfield. Shots on target/saved (by distance), crosses into box/interceptions, passes (short/med/long), "super saves" count. No save type breakdown, no zone mapping, no savaibility, no 1v1 analysis, no distribution accuracy, no trend tracking, no coaching alerts.

**InStat Match Report:** Team-level only. GK coverage = one line: "Goalkeeper saves: [number]."

**SciSports Team Report (20 pages):** Possession heatmaps, build-up analysis, zone progression, chance creation, finishing (xG), set pieces, defending. AI-generated summaries. GK mentioned in "Defending" as afterthought. No dedicated GK section.

**SciSports Player Report (GK):** Same one-page template as outfield. Adds 5 GK numbers at bottom: Keeper Saves, Expected Saves, Conceded Goals, Keeper Claims, Goalkicks. That's it.

### What STIX Produces That Nobody Else Does

- **Save type breakdown:** Catch, Block, Smother, Parry, Deflect, Punch, Tip — with trends over time
- **Shot origin → goal zone mapping:** Where shots come from AND where they end up, per match and season
- **Savaibility ranking:** Every goal rated Saveable / Difficult / Unsaveable — critical for fair evaluation
- **1v1 outcomes:** Separate tracking with technique classification (Smother, Block, etc.)
- **Cross handling:** Claimed / Punched / Missed — with cross origin tracking
- **Distribution analysis:** Short passes, long passes, throws, open-play passes — with accuracy per type
- **Sweeper metrics:** Clearances, interceptions, tackles outside the box
- **Rebound control:** Controlled vs dangerous rebounds
- **15 attribute ratings (1-5):** Game rating, shot stopping, handling, positioning, communication, etc.
- **10-category coaching alerts:** Auto-detects declining save %, GAA trends, cross claiming drops, error goals, rebound issues, composure drops, 1v1 win rate changes, zone vulnerabilities
- **Season trend tracking:** Every metric tracked over time with last-5-match rolling analysis

---

## 5. Architecture — AI Video Pipeline

### 5a. High-Level Flow

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────┐
│  Video In   │────▶│  Orchestrator │────▶│  AI Analysis │────▶│  STIX Data  │
│             │     │  (Make.com)   │     │  (Gemini)    │     │  (Supabase) │
│ - VEO export│     │              │     │              │     │             │
│ - Direct    │     │ - Detect new │     │ - Full match │     │ - shot_events│
│   upload    │     │   uploads    │     │   ingestion  │     │ - goals     │
│ - URL link  │     │ - Trigger AI │     │ - GK event   │     │ - matches   │
│             │     │ - Route      │     │   detection  │     │ - clips     │
│             │     │   results    │     │ - Clip gen   │     │ - attrs     │
└─────────────┘     └──────────────┘     └──────────────┘     └─────────────┘
                                                                     │
                                                               ┌─────▼─────┐
                                                               │ Dashboard │
                                                               │ Analytics │
                                                               │ + Clips   │
                                                               └───────────┘
```

### 5b. Video Input Methods (Priority Order)

1. **Direct upload** — Coach uploads match video (from phone, GoPro, or VEO export) to STIX. Most reliable, fully in our control.
2. **VEO export link** — Coach exports from VEO and pastes download/share URL. Requires VEO plan that allows downloads.
3. **VEO API** (future) — Direct integration with VEO. Requires partnership agreement. No public API exists today.

### 5c. AI Processing (Gemini 2.5)

Google Gemini 2.5 can ingest up to 1 hour of video and respond to detailed prompts. The processing step:

1. Full match video submitted with GK-analysis prompt
2. AI returns structured JSON of detected GK events:

```json
{
  "match_events": [
    {
      "timestamp": "12:34",
      "half": 1,
      "event_type": "shot",
      "shot_origin": "channel_right",
      "gk_action": "diving_save",
      "gk_action_type": "parry",
      "is_goal": false,
      "is_on_target": true,
      "shot_method": "foot",
      "gk_positioning": "set",
      "confidence": 0.82,
      "notes": "Low driven shot from edge of box, GK gets down to parry wide"
    },
    {
      "timestamp": "27:15",
      "half": 1,
      "event_type": "cross",
      "gk_action": "claim",
      "gk_action_type": "catch",
      "cross_origin": "left_wing",
      "confidence": 0.88,
      "notes": "Inswinging cross from left, GK comes to claim at near post"
    },
    {
      "timestamp": "31:02",
      "half": 1,
      "event_type": "goal_conceded",
      "shot_origin": "edge_of_box",
      "goal_zone": "top_right",
      "shot_method": "foot",
      "gk_positioning": "set",
      "savaibility": "difficult",
      "confidence": 0.75,
      "notes": "Curling shot into top corner from 20 yards"
    }
  ],
  "distribution_summary": {
    "h1": {
      "short_passes": 8, "short_accurate": 7,
      "long_passes": 3, "long_accurate": 2,
      "throws": 2, "throws_accurate": 2,
      "goalkicks": 4, "goalkicks_accurate": 3
    },
    "h2": { ... }
  },
  "sweeper_actions": {
    "clearances": 2,
    "interceptions": 1,
    "tackles": 0
  }
}
```

### 5d. AI Accuracy — Tiered Approach

Not all data points are equally detectable. The system uses confidence scores and tiers:

**Tier 1 — High confidence (ship in v1):**
- Goal detection (~95%)
- Shot on/off target (~85%)
- Basic save detection (~80%)
- Corners / free kicks (~85%)
- GK distribution events (~75%)

**Tier 2 — Moderate confidence (ship with review option):**
- Save type classification (catch/parry/punch/etc.) (~55-65%)
- Shot origin zone (~65%)
- Cross handling (claim/punch/miss) (~55-60%)
- 1v1 detection (~70%)

**Tier 3 — Low confidence (AI suggests, coach confirms):**
- Savaibility ranking (~40%) — inherently subjective
- Goal zone precision (9-cell grid) (~50-60%)
- GK positioning assessment (~45%)
- Attribute ratings — may always require coach input

**Design principle:** Show Tier 1 data as facts. Show Tier 2 data with subtle "AI-detected" indicator. Show Tier 3 data as suggestions the coach can accept/edit/skip.

### 5e. Processing Time & Cost

| Metric | Estimate |
|--------|----------|
| Processing time per match | 5–15 minutes |
| API cost per match (Gemini) | $0.50–2.00 |
| Clip extraction (server-side) | 1–3 minutes |
| Total turnaround | Under 20 minutes |

---

## 6. Data Model (Proposed)

### New table: `video_clips`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| coach_id | uuid | FK → auth.users, RLS anchor |
| match_id | uuid | FK → matches |
| keeper_id | uuid | FK → keepers |
| shot_event_id | uuid | FK → shot_events (nullable) |
| goal_conceded_id | uuid | FK → goals_conceded (nullable) |
| storage_path | text | Path in Supabase Storage bucket |
| thumbnail_path | text | Auto-generated poster frame |
| timestamp_start | text | Start time in match video (e.g. "12:34") |
| timestamp_end | text | End time in match video |
| duration_seconds | numeric | Clip length |
| file_size_bytes | bigint | For quota tracking |
| note | text | AI-generated or coach annotation |
| ai_confidence | numeric | 0-1 confidence score |
| source | text | 'ai_detected' or 'manual' or 'parent_logged' |
| half | smallint | 1 or 2 |
| created_at | timestamptz | Upload time |

### New table: `video_uploads`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| coach_id | uuid | FK → auth.users |
| match_id | uuid | FK → matches |
| storage_path | text | Full match video in Supabase Storage |
| source_platform | text | 'direct_upload', 'veo_export', 'veo_link' |
| source_url | text | Original VEO/external URL if applicable |
| processing_status | text | 'pending', 'processing', 'completed', 'failed' |
| processing_started_at | timestamptz | When AI began analysis |
| processing_completed_at | timestamptz | When results were stored |
| ai_results_json | jsonb | Raw AI output for debugging/reprocessing |
| file_size_bytes | bigint | |
| duration_minutes | numeric | Match length |
| created_at | timestamptz | |

### Storage Strategy

STIX stores **clips** (10-30 second extracts), not full matches.

- Full match video: uploaded temporarily for AI processing, then optionally deleted or archived
- Clips: extracted from full video at detected event timestamps, stored permanently
- Supabase Storage bucket: `match-videos` (temporary) and `video-clips` (permanent)
- Path convention: `{coach_id}/{match_id}/clips/{clip_id}.mp4`

### RLS Policies
- Coach: full CRUD on own videos and clips (coach_id = auth.uid())
- Delegate: SELECT on clips where keeper_id is in their dashboard_keepers[] and dashboard_access = true

---

## 7. UI/UX Design — Video Upload Flow

### 7a. Match Creation + Video Link

When creating a new match (or editing an existing one), the match form includes a video section:

```
┌──────────────────────────────────────────┐
│  New Match                               │
│  ─────────────────────────────────────── │
│                                          │
│  Keeper:    [Jake ▾]                     │
│  Opponent:  [________________]           │
│  Date:      [2026-03-12]                 │
│  Venue:     [Home ▾]                     │
│                                          │
│  ─── Match Video ───────────────────     │
│                                          │
│  [Upload Video File]                     │
│  Accepts .mp4, .mov — max 5 GB           │
│                                          │
│  ── or ──                                │
│                                          │
│  VEO Export URL: [____________________]  │
│                                          │
│  [Create Match & Analyze Video]          │
└──────────────────────────────────────────┘
```

### 7b. Processing Status

After upload, the match shows processing status on the dashboard:

```
┌──────────────────────────────────────────┐
│  vs Arsenal U14 — 12 Mar 2026            │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  ⏳ Analyzing match video...       │  │
│  │  ████████████░░░░░  65%            │  │
│  │  Detecting GK events               │  │
│  │  Est. 8 minutes remaining          │  │
│  └────────────────────────────────────┘  │
│                                          │
│  We'll notify you when analysis is done. │
└──────────────────────────────────────────┘
```

### 7c. Results Ready

Once processing completes:

```
┌──────────────────────────────────────────┐
│  vs Arsenal U14 — 12 Mar 2026            │
│  ✓ Video analysis complete               │
│                                          │
│  Detected Events:                        │
│  • 4 shots on target (3 saves, 1 goal)   │
│  • 2 crosses handled                     │
│  • 18 distributions                      │
│  • 1 sweeper action                      │
│                                          │
│  [View Full Analysis]  [Review Events]   │
└──────────────────────────────────────────┘
```

---

## 8. UI/UX Design — Dashboard (Review Flow)

### 8a. Match Detail — Event Timeline with Clips

The existing match detail view gets enriched with video:

```
┌──────────────────────────────────────────┐
│  vs Arsenal U14 — 12 Mar 2026            │
│  Overview | Events | Clips | Attributes  │
│  ─────────────────────────────────────── │
│                                          │
│  Event Timeline:                         │
│  ┌────────────────────────────────────┐  │
│  │ 12' Shot — Parry      [▶ Watch]   │  │
│  │     Channel right, diving save     │  │
│  │     AI confidence: 82%             │  │
│  │                                    │  │
│  │ 27' Cross — Claimed   [▶ Watch]   │  │
│  │     Left wing, catch at near post  │  │
│  │     AI confidence: 88%             │  │
│  │                                    │  │
│  │ 31' GOAL — Difficult  [▶ Watch]   │  │
│  │     Edge of box → top right        │  │
│  │     AI confidence: 75%    [Edit]   │  │
│  │                                    │  │
│  │ 56' 1v1 — Smother     [▶ Watch]   │  │
│  │     Breakaway, spread save         │  │
│  │     AI confidence: 70%    [Edit]   │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ── Distribution Summary ──              │
│  H1: 8 short (88%), 3 long (67%)        │
│  H2: 6 short (83%), 4 long (75%)        │
└──────────────────────────────────────────┘
```

**[Edit] button** appears on lower-confidence events. Tapping opens a quick refinement panel where the coach can correct the AI (e.g., change "parry" to "tip", adjust savaibility). This is optional — analytics work without it.

### 8b. Inline Clip Playback

Tapping [Watch] opens the clip inline:

```
┌──────────────────────────────────────────┐
│  ┌────────────────────────────────────┐  │
│  │                                    │  │
│  │         ▶  Video Player            │  │
│  │         12:34 — 12:44              │  │
│  │                                    │  │
│  └────────────────────────────────────┘  │
│                                          │
│  31' — GOAL CONCEDED                     │
│  Shot from: Edge of box                  │
│  Goal zone: Top right                    │
│  Savaibility: Difficult                  │
│  Method: Foot                            │
│  GK Position: Set                        │
│                                          │
│  AI note: "Curling shot into top corner  │
│  from 20 yards"                          │
│                                          │
│  [Share Clip]  [Edit Event]              │
└──────────────────────────────────────────┘
```

### 8c. Keeper Video Library

Same as original spec — filter/browse all clips for a keeper across matches:

```
┌──────────────────────────────────────────┐
│  Jake — Video Library                    │
│                                          │
│  Filter: [All Types ▾] [All Matches ▾]  │
│          [All Actions ▾] [Date Range]    │
│                                          │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐   │
│  │ ▶    │ │ ▶    │ │ ▶    │ │ ▶    │   │
│  │ 1v1  │ │ Cross│ │ GOAL │ │ Save │   │
│  │ 12/3 │ │ 12/3 │ │ 5/3  │ │ 5/3  │   │
│  └──────┘ └──────┘ └──────┘ └──────┘   │
│                                          │
│  Filters:                                │
│  - Event type (1v1, Cross, Shot, etc.)   │
│  - GK action (Catch, Parry, Goal, etc.)  │
│  - Savaibility (Saveable/Difficult/etc.) │
│  - AI confidence (High/Medium/Low)       │
│  - Date range / Match                    │
└──────────────────────────────────────────┘
```

Power use case: "Show me all saveable goals this season" — a coach can pull that up in 2 taps and use it in a feedback session with the keeper.

### 8d. Sharing

From any clip or filtered clip set:
- **Share Clip** generates a time-limited signed URL (7-day expiry)
- Coach copies link → sends via WhatsApp/email
- No account required to view
- Future: "Share analysis report" packages clips + stats into a shareable page

---

## 9. UI/UX Design — Parent Logger (Simplified Pitchside)

### 9a. Design Principles

- **Plain language** — "Shot saved" not "SOT, Catch, Channel Left"
- **Guided flow** — Step-by-step prompts, not an open form
- **Visual aids** — Pitch diagrams for "where did the shot come from?" with tappable zones
- **Fewer data points** — Capture the essentials, skip the nuance
- **Tutorial first** — Onboarding video explaining what to watch for and how to log

### 9b. Simplified Event Flow

```
Step 1: What happened?
┌──────────────────────────────┐
│  [Shot at Goal]              │
│  [Cross into Box]            │
│  [Goal Kick / Pass Out]      │
│  [Goal Scored Against]       │
└──────────────────────────────┘

Step 2 (if Shot): Did the keeper save it?
┌──────────────────────────────┐
│  [Yes — Saved!]              │
│  [No — Goal]                 │
│  [Missed the Goal]           │
└──────────────────────────────┘

Step 3 (if Saved): Where was the shot from?
┌──────────────────────────────┐
│  [Tap on pitch diagram]      │
│         ┌───┐                │
│     ┌───┤   ├───┐            │
│     │   │ G │   │            │
│  ┌──┤   └───┘   ├──┐        │
│  │  └───────────┘  │        │
│  │     Close       │        │
│  │                 │        │
│  │     Far         │        │
│  └─────────────────┘        │
│                              │
│  [Done ✓]                   │
└──────────────────────────────┘
```

### 9c. Parent Data Set (Reduced)

What parents capture vs full STIX model:

| Data Point | Parent Logger | Full STIX |
|-----------|:---:|:---:|
| Shot/goal/miss | Yes | Yes |
| Shot origin (simplified zones) | Yes | Yes (detailed) |
| Save yes/no | Yes | Yes |
| Save type (catch/parry/punch/etc.) | No | Yes |
| Goal zone (9-cell) | No | Yes |
| Savaibility | No | Yes |
| 1v1 detection | Yes (prompted) | Yes |
| Cross handling | Basic (saved/missed) | Detailed |
| Distribution | No | Yes |
| Sweeper actions | No | Yes |
| Half tracking | Yes | Yes |

~60% data capture. Enough for basic dashboard insights. The AI pipeline captures the full model.

### 9d. Invitation Flow

Coach invites parent to log:
1. Coach goes to match setup → "Invite Parent Logger"
2. Generates a shareable link (no account required)
3. Parent opens link on phone → sees tutorial → starts logging
4. Data syncs to coach's STIX dashboard in real-time

---

## 10. Storage & Cost Considerations

### Clip-Only Storage Model

STIX stores extracted clips, not full matches. Full match video is processed and then optionally deleted.

| Metric | Estimate |
|--------|----------|
| Avg clip (10-15s, 720p) | ~5-8 MB |
| Clips per match (AI-detected) | 5-15 |
| Clip storage per match | ~40-120 MB |
| Matches per season | 25-40 |
| Clip storage per keeper per season | ~1-5 GB |

### Full Match Upload (Temporary)

| Metric | Estimate |
|--------|----------|
| Full match video (90 min, 720p) | ~2-4 GB |
| Temporary storage duration | 24-72 hours (then auto-deleted) |
| Peak temporary storage per coach | ~4-8 GB (1-2 pending matches) |

### Cost Per Coach Per Month

| Item | Cost |
|------|------|
| Clip storage (Supabase, ~3 GB) | ~$0.06 |
| Temporary upload storage | ~$0.02 |
| Bandwidth (clip playback) | ~$0.10-0.50 |
| AI processing (~4 matches/month) | ~$2.00-8.00 |
| **Total per active coach** | **~$2.50-9.00/month** |

AI processing is the dominant cost. This informs pricing — a subscription model around $15-25/month would cover costs with margin.

### Who Stores the Full Video?

- **VEO** stores the full match on their platform (coach's VEO subscription)
- **STIX** only needs the video temporarily for AI processing
- After processing, coach can choose to keep or delete the uploaded video
- Clips are extracted and stored permanently (much smaller)

This means STIX does NOT compete with VEO on storage. VEO is the video archive. STIX is the GK intelligence layer.

---

## 11. Integration with Existing Features

| Existing Feature | Video AI Integration |
|-----------------|---------------------|
| Dashboard analytics | AI-generated events feed directly into existing stats engine — same charts, alerts, trends, just auto-populated |
| Match detail view | New "Events" and "Clips" tabs with timeline + inline playback |
| Coaching alerts | Alerts now trigger from AI-detected data, with "Watch clip" links |
| Season trends | Same trend tracking, now with 10x more matches analyzed (no manual bottleneck) |
| Keeper profiles | Video library per keeper, filterable by event type |
| Delegate access | Delegates see clips for permitted keepers, same RLS model |
| Pitchside (current) | Remains as-is for coaches who prefer manual. Data from both sources merges |
| Pitchside (parent) | New simplified mode, separate entry point |
| Match attributes | Tier 3 AI suggestions or coach-entered post-review |
| Match notes | Coach adds notes after reviewing AI analysis + clips |

---

## 12. Open Questions

### Technical
1. **VEO video access** — See Appendix A for full research. Coaches on paid VEO plans (Perform/Analyze) can download full match MP4s. No public API exists. Share links are view-only. The practical path: coach downloads MP4 from VEO → uploads to STIX.
2. **Alternative camera angle** — A phone/GoPro on a tripod behind the goal may actually produce BETTER footage for GK analysis than VEO's midfield panoramic view. Closer to the GK, better view of positioning, shot-stopping technique, and distribution. This could be a VEO-independent workflow and a competitive advantage.
3. **Gemini prompt engineering** — What prompt structure produces the best GK event detection? Need to prototype with real match video.
4. **Clip extraction** — Server-side FFmpeg (Supabase Edge Function? External service?) to cut clips from full match at AI-detected timestamps.
5. **Make.com vs custom pipeline** — Is Make.com reliable enough for the orchestration, or do we need a custom serverless pipeline?
6. **Hudl as alternative partner** — Hudl has a documented API (Hudl OpenAPI). If VEO partnership stalls, Hudl or Pixellot may be more accessible integration partners.

### Product
6. **Pricing model** — AI costs ~$2-9/month per coach. What's the right subscription price? Per-match pricing vs monthly flat rate?
7. **Free tier** — Should there be a free tier? Parent logger only? Limited matches per month?
8. **Coach refinement UX** — How much friction is acceptable for "optional" event correction? Must be zero-pressure — coach should never feel like they have to fix AI mistakes.
9. **Offline / no-video fallback** — Clubs without VEO or video. Parent logger is the fallback, but is that enough to retain them?
10. **Multi-keeper matches** — Training sessions where multiple keepers are in the video. Can AI distinguish?

### Strategic
11. **VEO partnership** — At what point do we approach VEO for a formal integration? Need user numbers first?
12. **Moat** — The labeled GK event dataset (from AI + coach corrections) becomes training data for improved models. This is the long-term moat.
13. **Timing** — How fast can competitors add GK-specific analytics to their platforms? What's our window?

---

## 13. Success Metrics

### Stage 1 — Parent Logger
- Parent logger adoption: % of matches with parent-logged data
- Data quality: how often coaches correct parent-logged events
- Time to log a match event (target: <15 seconds per event)

### Stage 2 — AI Pipeline
- Matches analyzed per month (growth)
- AI event detection accuracy by tier (measured via coach corrections)
- Coach correction rate (lower = better AI; target: <20% of events need edits)
- Time from upload to analysis complete (target: <20 minutes)
- Clip playback rate (are coaches actually watching clips?)
- Dashboard engagement: time spent on dashboard per session (should increase)
- Retention: month-over-month coach activity (the real metric)
- Cost per match (target: <$3)

### North Star
- **Matches analyzed per month without any manual coach input** — this is the number that matters. If this grows, the product is working.

---

## 14. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| VEO blocks video access | Can't process VEO-recorded matches | Support direct upload from phone/GoPro. GK-focused camera angle (phone behind goal) may actually be better for analysis |
| AI accuracy too low for GK detail | Dashboard analytics are wrong/unreliable | Tiered confidence system. Ship Tier 1 first. Improve with coach correction data. Be transparent about AI limitations |
| AI processing costs scale unexpectedly | Margins erode | Per-match cost caps. Optimize prompts. Cache/batch processing. Adjust pricing |
| Competitors add GK analytics | Wedge narrows | Move fast. The labeled dataset + GK domain depth is the moat. Focus on coaching intelligence, not just data |
| Coaches don't correct AI mistakes | Model doesn't improve | Make corrections effortless (2 taps). Gamify it. Or accept that "good enough" AI is good enough |
| Parents don't want to log | No fallback data source | Make parent logger genuinely useful and easy. Social proof ("help your kid's coach"). But primary bet is on AI pipeline |

---

## 15. Next Steps

1. **Finalize this spec** — Resolve remaining open questions through discussion
2. ~~**Research VEO access**~~ — Done. See Appendix A.
3. **Prototype AI pipeline** — Take a real match video, run it through Gemini with a GK-analysis prompt, evaluate output quality
4. **Phased build plan** — Break implementation into shippable increments
5. **Pricing model** — Define tiers based on cost structure

---

## Appendix A: VEO & Video Platform Research (2026-04-08)

### VEO Access — What's Actually Possible

**Camera hardware:** VEO Cam 3 (current) — dual 4K lenses, ~180° FOV, AI auto-tracking done in software post-upload. No moving parts. Records to SD card, uploads to VEO cloud for stitching + tracking.

**Subscription tiers:**
- **VEO Essentials** — Basic recording + playback
- **VEO Perform** — Auto-tracked video, highlights, basic tagging, sharing, MP4 download
- **VEO Analyze** — Advanced stats, event tagging tools, tactical drawing, integrations (e.g., Wyscout export)

**Video export:** Paid plans (Perform/Analyze) allow full match download as MP4 (4K from Cam 3, 1080p from Cam 2). Coaches can download from the VEO web platform.

**Sharing:** Shared VEO links open a web player. Recipients can watch but generally **cannot download** unless they have account permissions. View-only by default. Embed option (iframe) exists.

**API:** **No public API.** No developer documentation, no SDK, no partner integration guides. VEO has private B2B integrations with Wyscout and InStat, but these are negotiated partnerships, not open access.

### Practical Video Input Path for STIX

**Primary (now):** Coach downloads MP4 from VEO → uploads to STIX. Works with any VEO Perform/Analyze subscription. Coach effort: ~2 minutes (download + upload).

**Alternative (VEO-independent):** Phone or GoPro on tripod behind the goal. Modern phones shoot 4K/60fps. Better angle for GK analysis than VEO's midfield view. No subscription required. Coach uploads MP4 directly.

**Future (partnership):** Negotiate direct API access with VEO. Requires demonstrated user base and business case. Long sales cycle.

### Competitor API Landscape

| Platform | API Access | Camera | Notes |
|----------|-----------|--------|-------|
| VEO | No public API | VEO Cam 2/3 | Dominant at youth level |
| Hudl | Documented API (Hudl OpenAPI) | Hudl Focus | Most accessible for integration |
| Pixellot | Partner APIs | Pixellot cameras | Strong in US college sports |
| Spiideo | Partner access | Spiideo cameras | Available to partners, not public |
| Trace/PlaySight | Uncertain | Various | Acquired by Slinger, current status unclear |

### Behind-Goal Camera Advantage

A phone behind the goal gives a GK-focused angle that VEO's midfield panoramic view doesn't:
- Direct view of GK positioning and footwork
- Clear view of shot trajectory into goal
- Better visibility of save technique (catch vs parry vs tip)
- Close-up of 1v1 situations
- Distribution accuracy visible from origin point

This could be marketed as the "STIX Cam Setup" — no expensive hardware needed, just a phone on a $20 tripod. It's both a VEO-independent workflow AND potentially better for GK-specific AI analysis.
