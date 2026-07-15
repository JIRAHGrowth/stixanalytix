-- cross_events table — 2026-07-14
--
-- Cross-management is a first-class GK skill (aerial dominance, decision to
-- come/stay, communication with defense, technique on catch/punch/tip). Until
-- now the app only stored crosses as four aggregate columns on matches
-- (claimed/punched/missed/total), which meant:
--   - No per-cross detail on the dashboard (side, type, destination, technique)
--   - No per-keeper split when a match has two GKs (crosses always combined)
--   - No clip-to-play on individual cross events
--
-- Schema mirrors sweeper_events + one_v_one_events for consistency. Vocab
-- (side/cross_type/destination/gk_action/gk_position/outcome) matches the
-- ground-truth template so the GT→DB reconciler can import directly.

CREATE TABLE IF NOT EXISTS public.cross_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id           uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  keeper_id          uuid NOT NULL REFERENCES public.keepers(id),
  coach_id           uuid NOT NULL REFERENCES public.profiles(id),
  org_id             uuid,

  timestamp_seconds  integer,
  minute             integer,
  half               text,
  match_clock        text,

  side               text,  -- 'left' | 'right' | 'corner_left' | 'corner_right'
  cross_type         text,  -- 'whipped' | 'floated' | 'driven' | 'cut_back' | 'looped'
  destination        text,  -- 'near_post' | '6yd' | 'penalty_spot' | 'far_post' | 'out_of_box'
  gk_action          text,  -- 'catch' | 'punch' | 'tip_over' | 'stayed_on_line' | 'missed' | 'defender_cleared'
  gk_starting_pos    text,  -- 'on_line' | 'edge_of_6yd' | 'edge_of_18yd' | 'outside_box'
  outcome            text,  -- 'held' | 'punched_away' | 'tipped_over' | 'conceded' | 'cleared_by_defender' | 'shot_from_rebound'

  notes              text,
  gk_observations    text,
  confidence         text,

  clip_storage_path  text,

  -- Standard event-table fields (mirror sweeper_events / shot_events)
  keeper_team        text,   -- 'us' | 'opp' | null — for opp-GK training data
  source             text NOT NULL DEFAULT 'video',  -- 'video' | 'pitchside' | 'ground_truth'
  coach_added        boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cross_events_match ON public.cross_events (match_id);
CREATE INDEX IF NOT EXISTS idx_cross_events_keeper ON public.cross_events (keeper_id);
CREATE INDEX IF NOT EXISTS idx_cross_events_coach ON public.cross_events (coach_id);

ALTER TABLE public.cross_events ENABLE ROW LEVEL SECURITY;

-- Coach owns their coach_id-scoped rows.
CREATE POLICY cross_events_insert_coach   ON public.cross_events FOR INSERT WITH CHECK (auth.uid() = coach_id);
CREATE POLICY cross_events_select_coach   ON public.cross_events FOR SELECT USING (auth.uid() = coach_id);
CREATE POLICY cross_events_update_coach   ON public.cross_events FOR UPDATE USING (auth.uid() = coach_id) WITH CHECK (auth.uid() = coach_id);
-- DELETE policy: past incident (project_rls_delete_policy_gap_2026_06_04) — client .delete()
-- silently no-op'd on tables missing this policy. Explicit + tested here.
CREATE POLICY cross_events_delete_coach   ON public.cross_events FOR DELETE USING (auth.uid() = coach_id);

-- Delegate read access (same shape as sweeper_events_select_delegate)
CREATE POLICY cross_events_select_delegate ON public.cross_events FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.delegates d
    WHERE d.delegate_user_id = auth.uid()
      AND d.coach_id = cross_events.coach_id
      AND d.dashboard_access = true
      AND (d.dashboard_keepers IS NULL OR cross_events.keeper_id = ANY (d.dashboard_keepers))
  )
);
