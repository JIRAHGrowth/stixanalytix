# Morning Brief — 2026-04-14

## TL;DR
Database migration shipped (video_jobs + org_id), but build pipeline still broken — fix missing Supabase environment variables in CI to unblock all progress.

## Yesterday
- bf48fd0 chore(integrator): nightly build artifacts
- 6c43dd3 feat(db): add video_jobs table + org_id on tenant-scoped tables  
- 128b0ce fix(integrator): make pilot_health_check a true no-op + auto-pull hook
- 5415093 chore(integrator): morning brief

## Current phase
- Phase 0 — Foundations (3/7 complete)
- [x] Pick video worker host — Modal (decided 2026-04-09)
- [ ] Set up Cloudflare R2 bucket + signed URL helper
- [x] Create `video_jobs` table in Supabase — applied 2026-04-13
- [x] Add `org_id` column (nullable) to all tenant-scoped tables — applied 2026-04-13
- [ ] Get Gemini API key, confirm cost on one real VEO export
- [ ] Set up Sentry (or equivalent) for error tracking  
- [ ] Set up staging environment (Vercel preview + separate Supabase project)
- **Gate:** one VEO video → Gemini → Supabase row (blocked on build)

## Blockers / open decisions
- **CRITICAL:** Build fails — missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in CI (recurring since 2026-04-10)
- D2: Object storage (Cloudflare R2 vs Supabase Storage)  
- D3: Error tracking (Sentry vs Highlight vs Axiom)
- D4: First ground-truth matches (2-3 VEO exports incoming ~2 weeks)

## Recommended focus today
1. **Fix CI environment variables** — Configure Supabase secrets in GitHub Actions workflow or adjust static generation to handle missing env vars gracefully
2. **Set up Cloudflare R2** — Create bucket + signed URL helper (now unblocked by completed video_jobs table)
3. **Get Gemini API access** — Request key and test cost on sample VEO export

## Build & pilot health
- Build status: **RED** — `npm run build` fails due to missing env vars, all deployments blocked
- video_jobs failures: 0 (table exists but no jobs queued yet)

## Async work in progress
- Morning brief generation (this task)
- Agent queue has 3 prioritized tasks from 2026-04-10 backlog grooming