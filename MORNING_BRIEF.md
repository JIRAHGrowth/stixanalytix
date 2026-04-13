# Morning Brief — 2026-04-13

## TL;DR
Fix the broken build pipeline — deployments fail due to missing Supabase environment variables in CI.

## Yesterday
- 5c617f1 chore(integrator): nightly build artifacts

## Current phase
- Phase 0 — Foundations (1/7 complete)
- [x] Pick video worker host — Modal (decided 2026-04-09)
- [ ] Set up Cloudflare R2 bucket + signed URL helper
- [ ] Create `video_jobs` table in Supabase 
- [ ] Add `org_id` column (nullable) to all tenant-scoped tables
- [ ] Get Gemini API key, confirm cost on one real VEO export
- [ ] Set up Sentry (or equivalent) for error tracking
- [ ] Set up staging environment (Vercel preview + separate Supabase project)
- **Gate:** one VEO video → Gemini → Supabase row (blocked)

## Blockers / open decisions
- **CRITICAL:** Build fails — missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in CI
- D2: Object storage (Cloudflare R2 vs Supabase Storage)
- D3: Error tracking (Sentry vs Highlight vs Axiom)  
- D4: First ground-truth matches (2-3 VEO exports incoming ~2 weeks)

## Recommended focus today
1. **Fix CI environment variables** — Add Supabase vars to GitHub Actions or handle missing vars in build gracefully
2. **Create video_jobs table** — Status/video_url/match_id/gemini_output/errors/org_id schema from MASTER_PLAN.md:139
3. **Set up Cloudflare R2** — Bucket + signed URL helper for video storage

## Build & pilot health
- Build status: **RED** — `next build` fails, all deployments blocked
- video_jobs failures: unknown (table doesn't exist yet)

## Async work in progress
- Integrator operational but Phase 0 stalled on infrastructure
- Agent queue has 3 prioritized tasks from 2026-04-10 grooming