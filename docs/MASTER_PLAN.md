# StixAnalytix Master Plan

**Status:** Living document. Updated as decisions are made and phases complete.
**Last updated:** 2026-04-30
**Owner:** Josh Marshall

This is the single source of truth for where StixAnalytix is going, how we get there, and the rules we follow along the way. If something contradicts this doc, this doc wins until we update it. If we make a decision in a conversation, it gets written here before the conversation ends.

Related docs:
- [ARCHITECTURE.md](ARCHITECTURE.md) — current system as built
- [DATABASE.md](DATABASE.md) — schema reference
- [DEPLOY.md](DEPLOY.md) — deployment process
- [videoanalysisfeature.md](videoanalysisfeature.md) — UI/UX spec for the video pipeline
- [ROADMAP.md](ROADMAP.md) — known tech debt

---

## 1. North Star

StixAnalytix is the goalkeeper analytics platform that top soccer clubs, academies, and federations use because it is the **only** product that gives GK coaches 50+ position-specific data points per match, generated automatically from video the club is already recording. No coach data entry. Ever.

**The thing we are selling, eventually, to a federation:**
A coach uploads (or auto-syncs) a VEO match → within ~15 minutes they get a fully populated STIX dashboard, auto-clipped video moments tied to every event, a coaching narrative, alerts, and shareable links. Season-level rollups update automatically.

---

## 2. Scale Assumptions (build with this in mind from day one)

We design the system to comfortably handle:

| Dimension | Target |
|---|---|
| Clubs | 5,000 |
| Active goalkeepers | ~150,000 (≈30/club) |
| Parents / read-only viewers | 1,000,000 |
| Matches processed per year | ~4.5M (≈30/keeper/season) |
| Match video processing time | ≤ 15 min from upload to dashboard |
| Dashboard read latency | < 500ms p95 globally |
| Clip storage | 50–80 MB per match → ~300 TB total at full scale |

**These numbers do not mean we build for them on day one.** They mean every architectural decision must answer the question: *"if we 100x this tomorrow, does it survive, or does it require a rewrite?"* If it requires a rewrite, change the decision now.

---

## 3. Architecture Principles (the rules)

These are the non-negotiables. Anything we build from this point forward follows them.

### 3.1 Video processing is asynchronous, queue-based, idempotent
- Never block an HTTP request on video processing
- Every video job has a row in a `video_jobs` table with status (queued/running/done/failed/retrying)
- Jobs are retryable without producing duplicates (idempotency key = match_id + version)
- Worker is a separate service (not Vercel functions — they timeout)

### 3.2 Storage is S3-compatible from day one
- Clips and source video go to Cloudflare R2 (or Supabase Storage if costs work)
- Never store binary in Postgres
- All clip access goes through signed URLs with expiry
- We can swap providers without changing application code

### 3.3 Schema scales without rewriting
- Every table uses UUID primary keys (already true)
- Every foreign key has an index
- Hot-path queries (`matches by coach_id + date range`, `shot_events by match_id`) have composite indexes
- Tables expected to exceed ~10M rows (`shot_events`, `goals_conceded`, eventually `video_events`) get partitioning plans documented before they hit 1M rows
- We add an `org_id` (federation/club group) column to every tenant-scoped table NOW, even if every value is null until we sell to a federation. Backfilling later is painful.

### 3.4 RLS that scales
- Avoid `keeper_id = ANY(big_array)` policies — they get slow at scale
- Use junction tables (`delegate_keeper_access`) with proper indexes for many-to-many access
- Migrate the existing delegate array columns to a junction table before we hit 10k delegates

### 3.5 Reads scale via caching, not bigger DBs
- Dashboard reads use materialized aggregates (`keeper_season_stats`, `keeper_match_summary`) refreshed on write
- Public/parent-facing pages cache at the CDN edge with short TTLs
- Never compute season trends on-the-fly from raw events at request time

### 3.6 Multi-tenancy hierarchy is in the schema from day one
- Hierarchy: **Federation → Organization → Club → Team → Keeper**
- All currently exist or get added as nullable now. UI exposes only what's relevant per customer.
- A "club" today is just an org with one club and one team. A federation later is the same shape with more rows.

### 3.7 Cost is tracked per tenant from day one
- Every Gemini call, Claude call, storage byte, and worker minute is logged with `org_id`
- We always know cost-to-serve per club. This is what makes pricing decisions possible.

### 3.8 Observability from day one
- Structured logging (JSON) with `request_id`, `org_id`, `user_id`, `match_id` on every log line
- Errors go to a single sink (Sentry or equivalent)
- Video pipeline emits a per-stage event so we can see where the 80% accuracy is leaking

### 3.9 What we explicitly do NOT pre-build
- Sharding, read replicas, multi-region — Supabase handles us until well past first 100 paying clubs
- Microservices — one Next.js app + one video worker is enough
- Custom infra / Kubernetes — managed services until they actively block us
- Federation-specific features (SSO, white-label, audit logs) until a federation is in active conversation
- TypeScript migration — would be a months-long detour. Revisit only if bug rate from JS becomes the bottleneck.

### 3.10 Every change is reversible or staged
- Add a staging environment before the first paying customer
- Database migrations are forward-only and tested against a copy of prod
- Feature flags for anything risky touching real customer data

---

## 4. The Team (who does what)

### Humans
- **Josh**: strategy, sales, GK domain judgment, manual ground-truth tagging of training matches, all customer-facing communication
- **Future hires** (when revenue justifies): video annotation contractor, then full-stack engineer, then sales

### Gemini 2.5 (the eyes)
- Watches full match video, emits raw timestamped events
- Player tracking, ball tracking, basic event detection
- This is the only model today that does native long-context video. Non-negotiable for Phase 1+.

### Claude — split across surfaces
- **Claude Code (this thing)**: builds StixAnalytix itself — code, schema, integrations
- **Claude API in production**: takes Gemini's raw events, normalises to STIX schema, writes DB, generates narrative, computes attribute ratings, handles coach corrections
- **Claude.ai chat**: strategic thinking partner for pitches, investor messaging, market research synthesis
- **Claude scheduled agents**: the 24/7 integrator layer (see §6)

### Infrastructure
- Vercel — Next.js app (as today)
- Supabase — Postgres + Auth + RLS (as today)
- **NEW: video worker host** — Modal vs Cloud Run vs Fly.io — *decision pending, see §7*
- **NEW: object storage** — Cloudflare R2 (preferred) or Supabase Storage
- **NEW: error tracking** — Sentry or equivalent

---

## 5. Phases & Gates

Phases are sequential. Each has a clear "done" gate. We do not start phase N+1 until phase N's gate is met. Pace depends on Josh's available hours and is deliberately not on a calendar.

### Phase 0 — Foundations
- [x] Pick video worker host — **Modal** (decided 2026-04-09, see §8)
- [—] Cloudflare R2 bucket + signed URL helper — **deferred per D2.** Supabase Storage in use; R2 swap when D2 cost/scale triggers fire.
- [x] Create `video_jobs` table in Supabase (status, video_url, match_id, gemini_output, errors, org_id) — applied 2026-04-13, migration `20260413_video_jobs_and_org_id.sql`
- [x] Add `org_id` column (nullable) to all tenant-scoped tables — applied 2026-04-13, same migration
- [x] Gemini API key + cost confirmed — OFC 2016 run on 2026-04-28 used ~935K tokens on `gemini-2.5-pro`, costing roughly $2.50 for a 52-min match.
- [ ] Set up Sentry (or equivalent) for error tracking
- [ ] Set up staging environment (Vercel preview + separate Supabase project)
- **Gate met (2026-04-28):** OFC 2016 video → Gemini returned 12-goal candidate JSON → `video_jobs` row written → coach review JSON loaded into `matches`/`goals_conceded`. Observed end-to-end.

### Phase 1 — Vertical slice on ONE event type
- [x] Pick the easiest event: **goals conceded**
- [x] Build the full pipeline end-to-end for goals only:
  - File upload (TUS resumable) or URL paste → Supabase Storage signed URL → `/api/video-jobs` → Modal worker → Gemini against [prompts/goals.md](../prompts/goals.md) with team-colour variables → coach review at `/upload/[id]/review` → writes `matches` + `goals_conceded` → dashboard renders it
- [x] All steps idempotent, all errors caught
- [ ] Cost logging per `org_id` (deferred — Gemini token usage captured in `video_jobs.gemini_output.usage`, but not aggregated to `org_id`-scoped reporting yet)
- **Gate (revised, see D7):** Josh uploads a real match, completes the **coach review step** (a deliberate manual checkpoint), goals are populated correctly, and the match shows on the dashboard.

> **Why the gate change:** the original gate said "walks away, comes back, no manual touch." The OFC 2016 run on 2026-04-28 proved Gemini over-detects goals on no-scoreboard youth video (12 candidates for 5 actual goals; missed the only concession). A coach review step is now mandatory for accuracy. This is intentional, not a bug.

### Phase 2 — Expand event coverage
- [ ] Add shots, saves, distribution, crosses, 1v1s in priority order
- [ ] Each event type follows the same pattern (Gemini prompt → Claude normaliser → DB write → dashboard verification)
- [ ] Build accuracy dashboard so we can see per-event-type detection rate
- **Gate:** ≥80% accuracy on basic events across 5 test matches (Josh scores them)

### Phase 3 — GK-specific depth (the moat)
- [ ] **Define canonical STIX GK event taxonomy + Gemini→STIX nomenclature map.** Gemini's default vocabulary is generic (e.g. "forward dive"); coaches and STIX use specific terms (e.g. "smother"). Claude's normaliser layer does the translation. Surfaced 2026-04-20 during video Test 1.
- [ ] Save type breakdown, savaibility, shot zones, attribute ratings
- [ ] Josh manually tags 5–10 ground-truth matches; corrections feed into Claude prompt iteratively
- [ ] Build the "coach correction" UI — single click to fix an event, correction stored as training signal
- **Gate:** an Excelsior or BC Soccer coach watches a generated report and says "yes, this is right"

### Phase 4 — Clip generation + sharing
- [ ] Auto-cut 8-second clips around each event from source video
- [ ] Store in R2, link from dashboard
- [ ] Time-limited share URLs for keepers/parents
- [ ] Parent-facing read-only view (no auth needed for shared link)
- **Gate:** a coach can share a save clip with a parent in 2 clicks

### Phase 5 — First paying pilot
- [ ] One paying or design-partner club uploads matches across a season
- [ ] Weekly feedback loop, fix what breaks
- [ ] Cost-per-match dashboard shows we're profitable per match at proposed pricing
- **Gate:** they renew or refer another club

### Phase 6 — Federation-ready
- [ ] Multi-team org structure surfaced in UI (federation → org → club → team)
- [ ] SSO (SAML/OIDC)
- [ ] White-label theming
- [ ] Audit logs
- [ ] Data export (CSV + API)
- [ ] SOC 2 readiness assessment
- **Gate:** one federation in active conversation; build only what they ask for

---

## 6. The 24/7 Integrator (COO Layer)

Goal: work moves forward while Josh is in meetings, asleep, or away. Agents do bounded, well-specified tasks; Josh keeps the strategic and customer-facing decisions.

### What runs on a schedule
- **Nightly build & test** (02:00) — pull latest, run build, report failures, commit safe fixes
- **Morning brief** (07:00) — generate `MORNING_BRIEF.md`: what shipped yesterday, what's blocked, what to look at first today
- **Pilot health check** (07:30) — query `video_jobs` for failures, draft fixes, surface in morning brief
- **Weekly competitor watch** (Mondays) — fetch SciSports, InStat, Hudl, Veo, Stopper public pages; flag changes
- **Weekly backlog grooming** (Fridays) — re-read this doc + open issues; propose next 3 things

### What goes in the queue
- `docs/AGENT_QUEUE.md` — Josh drops bounded tasks anytime; agents pick from it on next run
- Each task has: what, why, definition of done, max time budget

### What agents will NOT do without Josh
- Talk to customers
- Make pricing or partnership decisions
- Push changes to production without a green test gate
- Spend money outside pre-approved budgets (Gemini/Claude API caps)
- Touch billing, legal, or anything contractual

### Setup checklist (Phase 0 of integrator)
- [ ] Create `claude/` directory with task templates
- [ ] Set up scheduled triggers for the 5 jobs above
- [ ] Create `MORNING_BRIEF.md` and `docs/AGENT_QUEUE.md`
- [ ] Document trigger management in [DEPLOY.md](DEPLOY.md)

---

## 7. Open Decisions

Decisions waiting on input. Once made, they move to §8.

| # | Decision | Options | Owner | Notes |
|---|---|---|---|---|
| D3 | Error tracking | Sentry / Highlight / Axiom | Josh | Sentry is default safe pick |
| D4 | First ground-truth matches | 2–3 VEO exports incoming (~2 weeks) | Josh | Tracked, not blocking yet |
| D9 | Per-platform integrations (XbotGo, Veo, Hudl OAuth/API fetch) | Build now / phased / never (file upload covers it) | Josh | XbotGo first since user base is XbotGo-heavy. Each ~1–2 days. Could be Phase 1.5. |
| D10 | Drag-and-drop on Windows file picker | Investigate / leave as-is (click-to-browse works) | Josh | Low priority — fallback works. |
| D13 | Self-hosted open-source video analysis | Don't switch / hybrid / fully migrate | Josh | Currently: $3–5/match on Gemini Pro, near-state-of-art quality. Switching today would drop costs ~90% but cost ~10–20pp accuracy on technique classification + add server-ops overhead. **Trigger to revisit:** any of — (a) monthly Gemini bill > $500, (b) a customer requires on-prem deployment for privacy/compliance, (c) we have a clearly mechanical event type (e.g. distribution success/fail) where open-source quality is already sufficient. **Useful today even without main-pipeline switch:** self-hosted Whisper for transcribing reference videos (T1TAN, etc.) — zero quality loss vs API, free. Surfaced 2026-04-30. |
| D14 | Adopt Mike Salmon A/B/C body-distance zones for save difficulty | Encyclopedia-only (Gemini reasons about it) / new structured field on shot_events / both | Josh | A = ball ends near GK body, B = within 2 yards, C = beyond 2 yards (full extension). Camera-observable rubric for difficulty, replaces interpretive `goal_rank`. **Recommendation:** start with encyclopedia-only (no schema change), evaluate after a few real matches whether to promote to a structured column. Keeps existing 9-zone goal-mouth labels intact — different axis. Surfaced 2026-04-30 by user citing BC Soccer / Mike Salmon. |

---

## 8. Decision Log

Decisions made, with date and reasoning. Append-only.

- **2026-04-30** — **D12: STIX GK Technique Encyclopedia wired into worker.** Imported the user's `Goalkeeper_Encyclopedia_of_Save_Technique.docx` (139 KB / ~35K tokens) into [prompts/gk_techniques.md](../prompts/gk_techniques.md) via [scripts/import-gk-encyclopedia-docx.js](../scripts/import-gk-encyclopedia-docx.js). Worker appends it to every Gemini prompt so `gk_observations` use canonical STIX vocabulary (smother, K-barrier, strong parry, starfish, etc.) instead of generic broadcast terms. Cost: ~$0.04/analysis. Phase 3 §"GK-specific depth (the moat)" foundation now in place.
- **2026-04-30** — **D11: Per-coach correction feedback loop shipped.** New `coach_corrections` table (RLS: coach reads own, service writes); publish API diffs Gemini's output vs the coach's review and writes correction rows; worker prepends a per-coach calibration preamble to every Gemini prompt. Backfilled 5 corrections from the OFC 2016 review for the dev coach; preamble preview at [scripts/preview-calibration.js](../scripts/preview-calibration.js). Effect: model gets smarter per-coach with every match. Cost: ~$0.0003/analysis (~200 tokens). Closes the loop on Phase 1; Phase 2 events ride on top of it.
- **2026-04-29** — **D8: Storage provider abstraction (§3.2) flagged as tech debt.** Phase 1 hardcodes `from('match-videos')` in three files (upload page, /api/video-jobs, /api/video-jobs/[id]/publish). Acceptable for now since R2 swap is gated by D2 triggers, but the eventual swap will need ~half a day to introduce a thin storage adapter and update call sites. Tracked in [ROADMAP.md](ROADMAP.md).
- **2026-04-29** — **D7: Coach review step added to Phase 1 pipeline.** Driver: OFC 2016 ground-truth run on 2026-04-28 — Gemini over-detected (12 candidates / 5 actual goals) and missed the only concession. Auto-publish would corrupt the dashboard. Review screen at `/upload/[id]/review` now sits between Gemini output and writes to `matches`/`goals_conceded`. Phase 1 gate updated to reflect the manual checkpoint as intentional.
- **2026-04-29** — **D6: File upload pulled into Phase 1 from Phase 4.** Driver: pasting URLs only worked for direct-MP4 endpoints. XbotGo, Veo, and Hudl all serve viewer-pages, not video bytes — making URL-only flow useless to most coaches. File upload via TUS resumable now in /upload form alongside URL paste. URL paste retained as a secondary option for the rare case someone has a direct link.
- **2026-04-29** — **D2 update: Supabase Storage Pro tier activated.** Driver: Free-tier hard cap of 50 MB per file blocked the first real game upload (1.9 GB). Pro at $25/mo gives up to 50 GB per-file (with the project-level upload-size setting also raised manually to 5 GB). Original D2 swap-to-R2 triggers (a/b/c) still apply, with (a) refined to "Supabase Pro+egress > R2 equivalent by >$50/mo."
- **2026-04-20** — **D2: Supabase Storage selected for Phase 0 object storage.** Reasoning: Supabase project already provisioned, no new vendor this week, and §3.2 (S3-compatible abstraction) means the swap to R2 is a config change, not a rewrite. **Switch trigger to R2:** any of — (a) monthly Supabase egress bill exceeds R2's zero-egress equivalent by >$50, (b) clip storage crosses 1 TB, or (c) we hit Phase 2 (≥1,000 matches/day) — whichever comes first. Owner on the revisit: Josh (cost check monthly once pilot starts).
- **2026-04-09** — **D1: Modal selected as Phase 0 video worker host.** Reasoning: built-in queue, retries, secrets, and one-command deploy remove BYO orchestration burden. Python-only is a non-issue for the workload (`download → Gemini → ffmpeg → upload → supabase insert`). Cost is a rounding error at pilot volume; the win is not having to build Pub/Sub bindings or a Postgres job poller before processing the first video. Revisit at Phase 2 (~1,000 matches/day) if economics shift — Fly.io is the likely fallback for compute+egress at scale.
- **2026-04-09** — **D5: Integrator layer scaffolded and wired to GitHub Actions cron.** Session-local CronCreate rejected because it only fires while Claude Code REPL is open on Josh's laptop — not true 24/7. GitHub Actions cron runs in the cloud, free at this volume, version-controlled in the repo. Workflow at [.github/workflows/integrator.yml](../.github/workflows/integrator.yml).
- **2026-04-09** — Master plan adopted. Scale target: 5,000 clubs / 1M parents. Architecture principles in §3 are now binding.
- **2026-04-09** — Video pipeline split: Gemini does vision, Claude does normalisation/narrative/DB writes. Reasoning: Gemini is the only frontier model with native long-context video; Claude is better at structured output and tool use.
- **2026-04-08** — Coaches will not do manual data entry. AI-from-video is the only viable path. Validated by BC Soccer + Excelsior Rotterdam.

---

## 9. How to use this doc

- **At the start of any session with Claude Code**: skim §1, §3, §5 to re-anchor
- **When making a decision**: write it in §8 the same day
- **When a phase gate is met**: check the boxes, move to next phase, update §1 timestamp
- **When this doc gets out of date**: that is a bug. Fix it before doing anything else.

---

## 10. Known Limitations (as of Phase 1, 2026-04-29)

These are things the current build cannot do that we know about. Each has either a workaround, a planned fix, or both.

- **Share URLs from XbotGo / Veo / Hudl don't work in URL-paste mode.** They serve HTML viewer pages, not video bytes. *Workaround:* download from the platform once, then use the file-upload path. *Planned fix:* per-platform integrations (D9).
- **Gemini accuracy on no-scoreboard, no-clock youth video is materially below pro/college matches.** OFC 2016 baseline: 12 detected vs 5 actual goals; missed the only concession. *Mitigation:* coach review step (D7) is the load-bearing accuracy mechanism; Gemini is treated as a candidate generator, not a source of truth.
- **TUS resumable upload requires Supabase Pro tier** plus a manual project-level upload-size limit raise. Free tier caps at 50 MB which is below any realistic game video. Documented in D2 update (2026-04-29).
- **Drag-and-drop file picker doesn't fire on Windows** in some browser/OS combinations. *Workaround:* click the picker area to open the OS file dialog (works reliably). Tracked as D10.
- **No cost reporting per `org_id` yet.** Gemini token usage is captured per-job in `video_jobs.gemini_output.usage`, but not aggregated. Phase 5 (first paying pilot) will require this; not a blocker for Phase 1 validation.
