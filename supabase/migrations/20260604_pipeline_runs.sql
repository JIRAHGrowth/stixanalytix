-- pipeline_runs: per-stage instrumentation for the video worker.
--
-- Goal: a video job that takes 30+ minutes can fail at chunk 5 of 6, losing
-- the work for chunks 1-4. With this table, the worker writes one row per
-- (chunk, prompt_kind, pass_index) BEFORE running each prompt, then updates
-- it on completion. On retry of the same video_job, the worker skips passes
-- already marked 'completed' and re-uses their result_payload.
--
-- Secondary goal: queryable observability. Today "what's the p95 duration
-- of a chunk_prompt?" and "what's the token cost per coach/match?" require
-- digging through stdout logs. With per-row timings + usage metadata, both
-- are SQL queries.
--
-- Insert one row at stage start; update on finish. `running` rows that
-- never reach `completed` or `failed` are the resume-stall signal.
--
-- Granularity:
--   stage='download'      — fetching the source video. chunk_index=NULL.
--   stage='chunk_prompt'  — one Gemini call. chunk_index 0+, prompt_kind in
--                           {'goals','saves','distribution'}, pass_index 0+.
--   stage='reconcile'     — _reconcile_events run. chunk_index=NULL.
--   stage='clips'         — per-event ffmpeg slicing. chunk_index=NULL.
--
-- Both worker/app.py and worker/app_v2.py write here. Wiring v2 happens
-- alongside the AI-Studio → Vertex AI cutover (see app_v2.py header).

CREATE TABLE IF NOT EXISTS public.pipeline_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_job_id    UUID NOT NULL REFERENCES public.video_jobs(id) ON DELETE CASCADE,

  stage           TEXT NOT NULL,
  chunk_index     INTEGER,
  prompt_kind     TEXT,
  pass_index      INTEGER,

  status          TEXT NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running','completed','failed','skipped')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  duration_ms     INTEGER,

  model_name      TEXT,
  usage_metadata  JSONB,
  result_payload  JSONB,
  error_message   TEXT,

  org_id          UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Resume-lookup index: "what's already done for this job?"
CREATE INDEX IF NOT EXISTS pipeline_runs_resume
  ON public.pipeline_runs (video_job_id, status, chunk_index, prompt_kind, pass_index);

-- Timeline index: "show me this job's stages in order"
CREATE INDEX IF NOT EXISTS pipeline_runs_timeline
  ON public.pipeline_runs (video_job_id, started_at DESC);

ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;

-- The worker uses the service role, which bypasses RLS, but the policy is
-- still required so service_role inserts don't error on RLS-enabled tables.
CREATE POLICY pipeline_runs_service ON public.pipeline_runs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Coaches can read instrumentation for their own jobs. Useful for an admin
-- dashboard that shows "what stage is my job in" and per-job spend.
CREATE POLICY pipeline_runs_coach_read ON public.pipeline_runs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.video_jobs vj
    WHERE vj.id = pipeline_runs.video_job_id
      AND vj.coach_id = auth.uid()
  ));

COMMENT ON TABLE public.pipeline_runs IS
  'Per-stage instrumentation for the video worker. One row per chunk * prompt_kind * pass_index. Enables resume-from-checkpoint and queryable observability.';
