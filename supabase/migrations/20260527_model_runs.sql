-- model_runs: lineage table for every bench / production / SFT run.
--
-- Purpose: as we accumulate model variants (base flash, v3-prompts, SFT v1,
-- SFT v2, …), we need a queryable record of "what scorecard did each version
-- produce on which corpus." Without this, comparing tuned vs base devolves
-- into hunting through git history and scorecard markdown files.
--
-- Insert one row per bench run or per production deploy. Update the row
-- (don't insert a new one) when re-scoring an existing artifact against an
-- updated truth set — the scorecard is derived from artifact+truth+commit.

CREATE TABLE IF NOT EXISTS public.model_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What kind of run produced this row.
  run_type TEXT NOT NULL CHECK (run_type IN (
    'bench',          -- scripts/run-bench-job-v2.py output
    'production',     -- Modal worker on a real coach upload
    'sft_training',   -- a Vertex SFT job completing
    'sft_eval'        -- evaluating a tuned model on held-out matches
  )),

  -- The model identifier (gemini-2.5-flash, gemini-2.5-flash-tuned-v1, etc.).
  model_name TEXT NOT NULL,

  -- For tuned models, points at the base model. Null for un-tuned runs.
  base_model TEXT,

  -- Repository state when this run was produced. Pairs with config_hash.
  commit_sha TEXT,

  -- 12-char sha256 of the (model, media_resolution, chunk_duration, …)
  -- config. Same hash = same configuration; lets us group equivalent runs.
  config_hash TEXT,

  -- Full config payload (media_resolution, chunk_duration_sec, use_vertex,
  -- enable_caching, cache_ttl_sec, thinking_budget, etc.). Schema-flexible
  -- so config can evolve without migrations.
  config JSONB DEFAULT '{}'::jsonb,

  -- The SFT corpus this run used (or evaluated against), if applicable.
  -- Format: "v1", "v2", … — corresponds to training/<corpus_version>/
  -- in the orchestrator.
  corpus_version TEXT,

  -- Hashes of each prompt file at run time. Catches the case where someone
  -- compares runs and forgets the prompts diverged between them.
  -- { "goals.md": "<sha>", "saves.md": "<sha>", "distribution.md": "<sha>" }
  prompt_versions JSONB DEFAULT '{}'::jsonb,

  -- The scorecard summary — { goals: { precision, recall, mae }, saves: {…},
  -- distribution: {…} }. Aggregated across whatever matches were in scope.
  scorecard JSONB DEFAULT '{}'::jsonb,

  -- Pointer to the raw artifact (the bench JSON or the model endpoint URI).
  -- Lets us re-eval against a new truth set later without re-running.
  artifact_uri TEXT,

  -- For SFT runs: the matches included (and excluded). Mirrors
  -- training/<version>/manifest.json.
  manifest JSONB DEFAULT '{}'::jsonb,

  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Index on (model_name, config_hash, created_at) so "show me the latest
-- bench for this config" is a fast lookup. Common access pattern.
CREATE INDEX IF NOT EXISTS model_runs_lookup
  ON public.model_runs (model_name, config_hash, created_at DESC);

-- Index on corpus_version for "what models did we train on corpus v3"
CREATE INDEX IF NOT EXISTS model_runs_corpus
  ON public.model_runs (corpus_version) WHERE corpus_version IS NOT NULL;

-- RLS — only the project admins (coach role) can write. Anyone authenticated
-- can read (so dashboards / scorecards can render without elevated privs).
ALTER TABLE public.model_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY model_runs_read ON public.model_runs
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY model_runs_write ON public.model_runs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.model_runs IS
  'Lineage table for model runs (bench, production, SFT). Queryable record '
  'of what scorecard each model version produced on which corpus.';
