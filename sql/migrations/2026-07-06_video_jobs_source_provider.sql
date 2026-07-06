-- 2026-07-06 — video_jobs: source_provider + source_metadata
--
-- Adds structured provenance to video_jobs so the accuracy audit can slice
-- Gemini output by ingest source, and so provider-side ground truth (match
-- duration, teams, age group, camera model, chosen render) survives the run.
--
-- Populated by:
--   • app/api/video-jobs/route.js  — provisional label at submission
--   • worker/app.py                — authoritative overwrite after resolver runs
--
-- See worker/resolvers/README.md for the provider protocol.
--
-- Safe to re-run (IF NOT EXISTS on the column adds).
-- Apply via Supabase SQL editor or `psql` — no downtime, no rewrites.

ALTER TABLE public.video_jobs
  ADD COLUMN IF NOT EXISTS source_provider text,
  ADD COLUMN IF NOT EXISTS source_metadata jsonb;

-- Slice-by-provider index for the accuracy audit. Partial index skips the
-- (currently ~all) rows with NULL provider so it stays cheap until backfilled.
CREATE INDEX IF NOT EXISTS video_jobs_source_provider_idx
  ON public.video_jobs (source_provider)
  WHERE source_provider IS NOT NULL;

COMMENT ON COLUMN public.video_jobs.source_provider IS
  'Ingest source classifier: veo | direct | (future: hudl/trace/etc). Populated by worker/resolvers.';
COMMENT ON COLUMN public.video_jobs.source_metadata IS
  'Provider-side ground truth captured at resolve time — teams, duration, age group, chosen render, etc. Schema follows ResolveResult.provider_metadata in worker/resolvers/base.py.';
