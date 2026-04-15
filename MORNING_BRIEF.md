# Morning Brief — 2026-04-15

## TL;DR
Fix the broken production builds blocking all deployment and Phase 0 progress.

## Yesterday
- d199fb4 chore(integrator): nightly build artifacts
- 3710abf chore(integrator): pilot health check  
- 1a8691b chore(integrator): morning brief

## Current phase
**Phase 0 — Foundations** (3/7 items completed, gate unmet)

- [x] Pick video worker host — **Modal** (decided 2026-04-09)
- [x] Create `video_jobs` table — **Applied** (migration 20260413_video_jobs_and_org_id.sql)
- [x] Add `org_id` column to tenant tables — **Applied** (same migration)
- [ ] Set up Cloudflare R2 bucket + signed URL helper
- [ ] Get Gemini API key, confirm cost on one real VEO export
- [ ] Set up Sentry (or equivalent) for error tracking
- [ ] Set up staging environment (Vercel preview + separate Supabase project)

**Gate:** One VEO video uploaded → Gemini returns something → row in Supabase, all observed in logs

## Blockers / open decisions

**CRITICAL: Production builds failing**
- Error: "@supabase/ssr: Your project's URL and API key are required to create a Supabase client!"
- All pages with Supabase initialization fail during static generation
- Blocks all deployment, testing, and progress
- Detected: 2026-04-10, recurring daily through 2026-04-15

**Open decisions from MASTER_PLAN §7:**
- D2: Object storage (Cloudflare R2 vs Supabase Storage) — R2 preferred for cost at scale
- D3: Error tracking (Sentry vs Highlight vs Axiom) — Sentry is safe default
- D4: First ground-truth matches (2-3 VEO exports incoming ~2 weeks)

## Recommended focus today

**1. Fix broken CI/CD pipeline**
- Configure Supabase environment variables in GitHub Actions workflow or adjust static generation to handle missing env vars gracefully
- File: `.github/workflows/integrator.yml` or `next.config.js`
- **Blocks:** All Phase 0+ work — can't test video pipeline without working builds

**2. Set up R2 bucket + signed URL helper**
- Create Cloudflare R2 bucket, implement signed URL generation in `lib/`
- **Why:** Gates video storage and Phase 0 completion
- **Next:** Can proceed once builds are green

**3. Get Gemini API access**
- Secure API key, test with one VEO export, document cost per match
- **Why:** Unknown costs could kill economics, need real data
- **Depends:** VEO sample availability (~2 weeks per D4)

## Build & pilot health

**Build status:** **RED** — Static generation fails on missing Supabase env vars
- Last successful build: unknown (failing since 2026-04-10)
- Local build after `npm install`: fails at static page generation

**Video jobs:** No failures (table exists but pipeline not built yet)
- video_jobs table created 2026-04-13
- 0 jobs processed (expected — no upload mechanism exists)

## Async work in progress

**Integrator layer:** Active, generating daily artifacts
- Morning briefs, pilot health checks, nightly build attempts
- Next scheduled run: nightly build 02:00, morning brief 07:00

**Agent queue:** 1 item flagged for Josh (build failure infrastructure issue)