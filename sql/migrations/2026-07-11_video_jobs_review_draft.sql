-- 2026-07-11 — video_jobs: server-side review draft persistence
--
-- Coach edits on the /upload/[jobId]/review page used to live only in
-- React state + localStorage. That failed catastrophically on Amalie's
-- BC Soccer review: a JWT background refresh triggered a state re-mount
-- which overwrote the localStorage draft with Gemini's original output,
-- silently erasing 30+ min of coach work.
--
-- Fix: writes now persist to the database. Auto-save debounces ~2s and
-- POSTs to /api/video-jobs/[id]/draft, which upserts review_draft here.
-- Mount reads review_draft as the source of truth. localStorage stays
-- as an offline fallback only.
--
-- Contract: close tab, close browser, walk away 8 hours, come back —
-- every accept/reject/edit exactly where the coach left it.
--
-- Safe to re-run (IF NOT EXISTS on column adds).

ALTER TABLE public.video_jobs
  ADD COLUMN IF NOT EXISTS review_draft jsonb,
  ADD COLUMN IF NOT EXISTS review_draft_updated_at timestamptz;

COMMENT ON COLUMN public.video_jobs.review_draft IS
  'Coach-in-progress edits on the review page: candidates, extraGoals, scoreOverride, saveRows, distRows. Written by POST /api/video-jobs/[id]/draft, restored on review page mount.';
COMMENT ON COLUMN public.video_jobs.review_draft_updated_at IS
  'When the review_draft was last written. Used for save-state UI and stale-detection when reconciling client + server drafts.';
