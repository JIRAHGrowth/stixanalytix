-- =============================================================================
-- StixAnalytix — public schema snapshot
-- Captured: 2026-05-27 (commit 68a075f or later)
-- Project:  lmwbvkyqyhagqegewnyd
--
-- Single-file snapshot of the live public schema. Most tables were created
-- via the Supabase dashboard rather than incremental migrations; this file
-- exists so a fresh environment can be recreated and so the 'is the live
-- DB consistent with code' question has one answer.
--
-- NOT a transactional migration. For forward changes, add a new file under
-- supabase/migrations/. This file is a baseline reference.
--
-- TO REFRESH:
--   The introspection queries below were run against information_schema
--   to produce this snapshot. Re-run them after schema changes and update
--   this file. (Or use `supabase db dump --schema public` if the CLI is
--   linked.)
--
--   The four queries used:
--     1. SELECT table_name, column_name, data_type, is_nullable, column_default
--        FROM information_schema.columns WHERE table_schema='public'
--        ORDER BY table_name, ordinal_position;
--     2. Primary keys: information_schema.table_constraints / key_column_usage
--     3. Foreign keys: information_schema.table_constraints + constraint_column_usage
--     4. CHECK constraints + RLS policies: pg_policies, pg_constraint
-- =============================================================================

-- ----- TABLES -----

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'coach',
  tier TEXT NOT NULL DEFAULT 'grassroots',
  onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  org_id UUID
);

CREATE TABLE IF NOT EXISTS public.clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES public.profiles(id),
  name TEXT NOT NULL,
  primary_color TEXT NOT NULL DEFAULT '#10b981',
  secondary_color TEXT NOT NULL DEFAULT '#ffffff',
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  org_id UUID
);

CREATE TABLE IF NOT EXISTS public.keepers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES public.clubs(id),
  coach_id UUID NOT NULL REFERENCES public.profiles(id),
  name TEXT NOT NULL,
  number INTEGER,
  catch_hand TEXT,
  role TEXT DEFAULT 'Development',
  date_of_birth DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  org_id UUID
);

CREATE TABLE IF NOT EXISTS public.delegates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL,  -- FK to auth.users
  delegate_user_id UUID,    -- FK to auth.users
  email TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'gk_parent',
  pitchside_keepers UUID[] DEFAULT '{}'::uuid[],
  dashboard_keepers UUID[] DEFAULT '{}'::uuid[],
  dashboard_access BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  org_id UUID
);

CREATE TABLE IF NOT EXISTS public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES public.profiles(id),
  keeper_id UUID NOT NULL REFERENCES public.keepers(id),
  club_id UUID NOT NULL REFERENCES public.clubs(id),
  session_type TEXT NOT NULL DEFAULT 'match',
  opponent TEXT,
  venue TEXT DEFAULT 'home',
  match_date DATE NOT NULL DEFAULT CURRENT_DATE,
  goals_for INTEGER DEFAULT 0,
  goals_against INTEGER DEFAULT 0,
  result TEXT,
  -- Aggregate stats (50+ columns) — full set captured per dashboard query.
  -- See information_schema.columns for the authoritative list.
  shots_on_target INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  goals_conceded INTEGER NOT NULL DEFAULT 0,
  save_percentage NUMERIC DEFAULT 0,
  saves_catch INTEGER NOT NULL DEFAULT 0,
  saves_parry INTEGER NOT NULL DEFAULT 0,
  saves_dive INTEGER NOT NULL DEFAULT 0,
  saves_block INTEGER NOT NULL DEFAULT 0,
  saves_tip INTEGER NOT NULL DEFAULT 0,
  saves_punch INTEGER NOT NULL DEFAULT 0,
  crosses_claimed INTEGER NOT NULL DEFAULT 0,
  crosses_punched INTEGER NOT NULL DEFAULT 0,
  crosses_missed INTEGER NOT NULL DEFAULT 0,
  crosses_total INTEGER NOT NULL DEFAULT 0,
  dist_gk_short_att INTEGER NOT NULL DEFAULT 0,
  dist_gk_short_suc INTEGER NOT NULL DEFAULT 0,
  dist_gk_long_att INTEGER NOT NULL DEFAULT 0,
  dist_gk_long_suc INTEGER NOT NULL DEFAULT 0,
  dist_throws_att INTEGER NOT NULL DEFAULT 0,
  dist_throws_suc INTEGER NOT NULL DEFAULT 0,
  dist_passes_att INTEGER NOT NULL DEFAULT 0,
  dist_passes_suc INTEGER NOT NULL DEFAULT 0,
  dist_under_pressure_att INTEGER NOT NULL DEFAULT 0,
  dist_under_pressure_suc INTEGER NOT NULL DEFAULT 0,
  one_v_one_faced INTEGER NOT NULL DEFAULT 0,
  one_v_one_won INTEGER NOT NULL DEFAULT 0,
  errors_leading_to_goal INTEGER NOT NULL DEFAULT 0,
  sweeper_clearances INTEGER NOT NULL DEFAULT 0,
  sweeper_interceptions INTEGER NOT NULL DEFAULT 0,
  sweeper_tackles INTEGER NOT NULL DEFAULT 0,
  rebounds_controlled INTEGER NOT NULL DEFAULT 0,
  rebounds_dangerous INTEGER NOT NULL DEFAULT 0,
  half_data JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  was_subbed BOOLEAN NOT NULL DEFAULT false,
  sub_reason TEXT,
  sub_minute INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  logged_by UUID REFERENCES auth.users(id),
  logged_by_name TEXT,
  minutes_played INTEGER,
  org_id UUID,
  source_url TEXT,
  logged_via TEXT NOT NULL DEFAULT 'pitchside'
    CHECK (logged_via IN ('pitchside', 'video')),
  shots_faced INTEGER
);

CREATE TABLE IF NOT EXISTS public.goals_conceded (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id),
  coach_id UUID NOT NULL REFERENCES public.profiles(id),
  goal_zone TEXT,
  shot_origin TEXT,
  goal_source TEXT,
  goal_rank TEXT,
  shot_type TEXT,
  gk_positioning TEXT,
  half INTEGER,
  minute INTEGER,
  timestamp_seconds INTEGER,
  shot_description TEXT,
  gk_observations TEXT,
  coach_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  org_id UUID
);

CREATE TABLE IF NOT EXISTS public.goals_scored (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id),
  coach_id UUID NOT NULL,  -- FK to auth.users (intentionally inconsistent with profiles)
  keeper_id UUID REFERENCES public.keepers(id),
  timestamp_seconds INTEGER,
  minute INTEGER,
  shot_description TEXT,
  coach_notes TEXT,
  attack_type TEXT,
  half INTEGER,
  org_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shot_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id),
  keeper_id UUID NOT NULL REFERENCES public.keepers(id),
  coach_id UUID NOT NULL,
  shot_origin TEXT,
  gk_action TEXT,
  goal_zone TEXT,
  is_goal BOOLEAN NOT NULL DEFAULT false,
  is_off_target BOOLEAN DEFAULT false,
  shot_type TEXT,
  event_type TEXT,
  half TEXT,
  timestamp_seconds INTEGER,
  shot_description TEXT,
  gk_observations TEXT,
  coach_notes TEXT,
  on_target TEXT,
  outcome TEXT,
  body_distance_zone TEXT,
  goal_placement_height TEXT,
  goal_placement_side TEXT,
  gk_visible TEXT,
  coach_added BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  org_id UUID
);

CREATE TABLE IF NOT EXISTS public.distribution_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id),
  keeper_id UUID REFERENCES public.keepers(id),
  coach_id UUID NOT NULL REFERENCES public.profiles(id),
  timestamp_seconds INTEGER,
  minute INTEGER,
  half TEXT CHECK (half IS NULL OR half IN ('H1','H2','ET')),
  match_clock TEXT,
  trigger TEXT CHECK (trigger IS NULL OR trigger IN (
    'goal_kick','after_save','backpass','loose_ball',
    'throw_in_to_gk','free_kick_to_gk'
  )),
  type TEXT CHECK (type IS NULL OR type IN (
    'gk_short','gk_long','throw','pass','drop_kick'
  )),
  successful BOOLEAN,
  under_pressure BOOLEAN,
  pass_selection TEXT,
  direction TEXT,
  receiver TEXT,
  first_touch TEXT,
  notes TEXT,
  confidence TEXT,
  source TEXT NOT NULL DEFAULT 'video'
    CHECK (source IN ('video','pitchside','manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  org_id UUID
);

CREATE TABLE IF NOT EXISTS public.match_attributes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id),
  keeper_id UUID NOT NULL REFERENCES public.keepers(id),
  coach_id UUID NOT NULL REFERENCES public.profiles(id),
  game_rating NUMERIC,
  shot_stopping NUMERIC,
  handling NUMERIC,
  positioning NUMERIC,
  aerial_dominance NUMERIC,
  distribution NUMERIC,
  decision_making NUMERIC,
  sweeper_play NUMERIC,
  set_piece_org NUMERIC,
  footwork_agility NUMERIC,
  reaction_speed NUMERIC,
  communication NUMERIC,
  command_of_box NUMERIC,
  composure NUMERIC,
  compete_level NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  org_id UUID
);

CREATE TABLE IF NOT EXISTS public.match_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id),
  coach_id UUID NOT NULL,  -- FK to auth.users
  keeper_id UUID NOT NULL REFERENCES public.keepers(id),
  author_id UUID NOT NULL,
  author_role TEXT NOT NULL CHECK (author_role IN ('coach','keeper')),
  game_rating NUMERIC,
  shot_stopping NUMERIC,
  handling NUMERIC,
  positioning NUMERIC,
  aerial_dominance NUMERIC,
  distribution NUMERIC,
  decision_making NUMERIC,
  sweeper_play NUMERIC,
  set_piece_org NUMERIC,
  footwork_agility NUMERIC,
  reaction_speed NUMERIC,
  communication NUMERIC,
  command_of_box NUMERIC,
  composure NUMERIC,
  compete_level NUMERIC,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  org_id UUID
);

CREATE TABLE IF NOT EXISTS public.match_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id),
  coach_id UUID NOT NULL,
  keeper_id UUID NOT NULL REFERENCES public.keepers(id),
  author_id UUID NOT NULL,
  author_role TEXT NOT NULL CHECK (author_role IN ('coach','keeper')),
  note_text TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  org_id UUID
);

CREATE TABLE IF NOT EXISTS public.video_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES public.matches(id),
  coach_id UUID NOT NULL REFERENCES public.profiles(id),
  org_id UUID,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','analyzing','review_needed','published','failed')),
  video_url TEXT,
  gemini_output JSONB,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  keeper_id UUID REFERENCES public.keepers(id),
  club_id UUID REFERENCES public.clubs(id),
  match_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewed_output JSONB,
  published_match_id UUID REFERENCES public.matches(id),
  storage_path TEXT
);

CREATE TABLE IF NOT EXISTS public.coach_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL,  -- FK to auth.users
  video_job_id UUID REFERENCES public.video_jobs(id),
  match_id UUID REFERENCES public.matches(id),
  correction_type TEXT NOT NULL CHECK (correction_type IN (
    'false_positive','missed_goal','wrong_team','wrong_zone',
    'wrong_origin','wrong_shot_type','wrong_attack_type','kept_as_is'
  )),
  gemini_value JSONB,
  coach_value JSONB,
  match_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  org_id UUID
);

-- model_runs is defined in supabase/migrations/20260527_model_runs.sql.
-- Included here for completeness; not duplicated.

-- ----- ROW LEVEL SECURITY -----
--
-- All tables have RLS enabled. Coach policies scope on auth.uid() = coach_id.
-- Delegate policies JOIN to public.delegates, check status='active', then
-- match against pitchside_keepers (INSERT) or pitchside_keepers OR
-- (dashboard_keepers AND dashboard_access) (SELECT).
--
-- Full policy bodies are stored in the database and visible via:
--   SELECT * FROM pg_policies WHERE schemaname = 'public';
--
-- They are NOT included in this snapshot because they evolve frequently and
-- the source of truth is the database itself. To recreate them in a fresh
-- env: copy from pg_policies, or refer to the policy-creation statements in
-- supabase/migrations/ for the tables that were created via migration.

-- ----- INDEXES -----
--
-- model_runs has two indexes (see migration 20260527_model_runs.sql):
--   - model_runs_lookup (model_name, config_hash, created_at DESC)
--   - model_runs_corpus (corpus_version) WHERE corpus_version IS NOT NULL
--
-- Other tables: only primary-key + FK-implicit indexes. No custom indexes.
