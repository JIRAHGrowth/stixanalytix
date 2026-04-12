# Morning Brief — 2026-04-12

## TL;DR
Fix the broken build pipeline — every push to main fails due to missing Supabase environment variables in CI.

## Yesterday
- 0381c9f chore(integrator): nightly build artifacts
- 512fadb chore(integrator): pilot health check

## Current phase
- Phase 0 — Foundations
- [x] Pick video worker host — Modal (decided 2026-04-09)
- [ ] Set up Cloudflare R2 bucket + signed URL helper
- [ ] Create `video_jobs` table in Supabase 
- [ ] Add `org_id` column (nullable) to all tenant-scoped tables
- [ ] Get Gemini API key, confirm cost on one real VEO export
- [ ] Set up Sentry (or equivalent) for error tracking
- [ ] Set up staging environment (Vercel preview + separate Supabase project)
- **Gate unmet:** 6/7 items unchecked

## Blockers / open decisions
- **CRITICAL:** Build pipeline broken — all deployments fail due to missing Supabase env vars in CI
- D2: Object storage (Cloudflare R2 vs Supabase Storage)
- D3: Error tracking (Sentry vs Highlight vs Axiom)  
- D4: First ground-truth matches (2-3 VEO exports incoming ~2 weeks)

## Recommended focus today
1. **Fix CI environment variables** — Configure NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in GitHub Actions or adjust build to handle missing vars gracefully
2. **Create video_jobs table** — Schema in docs/MASTER_PLAN.md:139, blocks Phase 0 gate
3. **Set up Cloudflare R2** — Enable video processing pipeline foundation

## Build & pilot health
- Build status: **RED** — next build command fails, deployment blocked
- video_jobs failures: unknown (table doesn't exist yet)

## Async work in progress
- Backlog grooming completed 2026-04-10
- Integrator layer operational but Phase 0 stalled on infrastructure issues