# Agent Queue

A shared inbox between Josh and the Claude integrator agents. Drop tasks here anytime; agents pick them up on next run. Agents append questions and proposals here for Josh.

## How to use

**Josh adds work:** append a task under "## Inbox" using the template below. Agents pick from top of Inbox on next scheduled run.

**Agents add questions/proposals:** append under "## Needs Josh" or under a dated proposal section.

## Task template

```
### <short title>
- **Why:** one sentence on why this matters now
- **Definition of done:** clear, checkable outcome
- **Constraints:** files to touch / not touch, max time, anything risky
- **Owner:** agent / josh / either
```

---

## Inbox

_(empty — drop tasks here)_

---

## Needs Josh

### Nightly build failing - Missing Supabase environment variables
- **Issue:** Build fails during static page generation because Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) are not available in CI environment
- **Impact:** All pages that initialize Supabase clients fail to prerender, causing build to fail
- **Category:** Non-trivial infrastructure issue (touches auth/data layer)
- **Next step:** Configure environment variables in GitHub Actions workflow or adjust build configuration to handle missing env vars gracefully
- **Detected:** 2026-04-10 nightly build

---

## Proposed by backlog grooming — 2026-04-10

**Phase Status:** Phase 0 — Foundations (6/7 items unchecked, gate unmet)

**Critical Issue:** Build pipeline broken — every push to main fails due to missing Supabase env vars in CI. This blocks all deployment and progress.

**Last Week:** Integrator infrastructure built, MASTER_PLAN established, but zero progress on Phase 0 deliverables.

### Next 3 tasks (priority order):

**1. Fix broken production builds**
- **Why:** Every deploy fails, blocking all progress and customer-facing changes
- **Definition of done:** GitHub Actions build passes, Vercel deploys successfully from main
- **Effort:** M (static generation vs runtime env var diagnosis)
- **Blocks:** All Phase 0+ work — can't test video pipeline if we can't deploy

**2. Create video_jobs table and R2 setup**
- **Why:** Gates entire video processing pipeline and Phase 0 completion  
- **Definition of done:** video_jobs table created, R2 bucket + signed URL helper, upload/download test passes
- **Effort:** L (straightforward schema + API work)
- **Blocks:** Phase 0 gate — can't process first video without job tracking

**3. Get Gemini API access and cost validation**
- **Why:** Unknown costs could kill economics; need real data for pricing model
- **Definition of done:** Gemini API key configured, one VEO export processed with cost logged, cost-per-match estimate documented
- **Effort:** M (depends on Gemini availability and VEO timing)
- **Blocks:** Phase 1 — can't build pipeline without proving the model works

**Honesty check:** Phase 0 is stalled. The integrator layer consumed a week but delivered no customer-facing value. We need to complete foundations before any AI video processing is viable.

---

## Done (last 14 days)

_(empty — agents move completed items here with a date)_
