-- save_pitchside_match: atomic write of an entire pitchside save in a
-- single transaction. Replaces the client-side sequence of upsert+delete+
-- insert across six tables (matches, goals_conceded, shot_events,
-- match_attributes, match_rankings, match_notes), so that partial-failure
-- mid-save can no longer leave orphan rows.
--
-- Caller passes one named arg per table-shape, all jsonb. Function uses
-- SECURITY INVOKER so RLS still enforces coach/delegate scope on each
-- inner write — if any write violates RLS, the whole transaction rolls
-- back. Idempotent: same payload retried produces the same end state.
--
-- Returns the match id on success. Errors propagate as PostgREST RPC
-- errors with code/message intact.

CREATE OR REPLACE FUNCTION public.save_pitchside_match(
  p_match    jsonb,
  p_goals    jsonb DEFAULT '[]'::jsonb,
  p_shots    jsonb DEFAULT '[]'::jsonb,
  p_attrs    jsonb DEFAULT NULL,
  p_ranking  jsonb DEFAULT NULL,
  p_note     jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_match_id uuid := (p_match->>'id')::uuid;
BEGIN
  IF v_match_id IS NULL THEN
    RAISE EXCEPTION 'save_pitchside_match: match.id is required';
  END IF;

  -- 1. Match row — upsert. Client-generated UUID, so ON CONFLICT (id) DO
  --    UPDATE rewrites all mutable columns to the new values. created_at
  --    and updated_at are omitted from the column list so their column
  --    defaults (now()) apply on first INSERT; updated_at is set to now()
  --    in the DO UPDATE clause for later writes.
  INSERT INTO public.matches AS m (
    id, coach_id, keeper_id, club_id, session_type, opponent, venue,
    match_date, goals_for, goals_against, result, shots_on_target, saves,
    goals_conceded, save_percentage, saves_catch, saves_parry, saves_dive,
    saves_block, saves_tip, saves_punch, crosses_claimed, crosses_punched,
    crosses_missed, crosses_total, dist_gk_short_att, dist_gk_short_suc,
    dist_gk_long_att, dist_gk_long_suc, dist_throws_att, dist_throws_suc,
    dist_passes_att, dist_passes_suc, dist_under_pressure_att,
    dist_under_pressure_suc, one_v_one_faced, one_v_one_won,
    errors_leading_to_goal, sweeper_clearances, sweeper_interceptions,
    sweeper_tackles, rebounds_controlled, rebounds_dangerous, half_data,
    notes, was_subbed, sub_reason, sub_minute, logged_by, logged_by_name,
    minutes_played, org_id, source_url, shots_faced
    -- logged_via intentionally omitted: column default 'pitchside' applies on
    -- first INSERT, and existing value is preserved on retry — we never want
    -- to reclassify a pitchside-origin match as a different source mid-save.
  )
  SELECT
    id, coach_id, keeper_id, club_id, session_type, opponent, venue,
    match_date, goals_for, goals_against, result, shots_on_target, saves,
    goals_conceded, save_percentage, saves_catch, saves_parry, saves_dive,
    saves_block, saves_tip, saves_punch, crosses_claimed, crosses_punched,
    crosses_missed, crosses_total, dist_gk_short_att, dist_gk_short_suc,
    dist_gk_long_att, dist_gk_long_suc, dist_throws_att, dist_throws_suc,
    dist_passes_att, dist_passes_suc, dist_under_pressure_att,
    dist_under_pressure_suc, one_v_one_faced, one_v_one_won,
    errors_leading_to_goal, sweeper_clearances, sweeper_interceptions,
    sweeper_tackles, rebounds_controlled, rebounds_dangerous, half_data,
    notes, was_subbed, sub_reason, sub_minute, logged_by, logged_by_name,
    minutes_played, org_id, source_url, shots_faced
  FROM jsonb_populate_record(NULL::public.matches, p_match)
  ON CONFLICT (id) DO UPDATE SET
    coach_id                 = EXCLUDED.coach_id,
    keeper_id                = EXCLUDED.keeper_id,
    club_id                  = EXCLUDED.club_id,
    session_type             = EXCLUDED.session_type,
    opponent                 = EXCLUDED.opponent,
    venue                    = EXCLUDED.venue,
    match_date               = EXCLUDED.match_date,
    goals_for                = EXCLUDED.goals_for,
    goals_against            = EXCLUDED.goals_against,
    result                   = EXCLUDED.result,
    shots_on_target          = EXCLUDED.shots_on_target,
    saves                    = EXCLUDED.saves,
    goals_conceded           = EXCLUDED.goals_conceded,
    save_percentage          = EXCLUDED.save_percentage,
    saves_catch              = EXCLUDED.saves_catch,
    saves_parry              = EXCLUDED.saves_parry,
    saves_dive               = EXCLUDED.saves_dive,
    saves_block              = EXCLUDED.saves_block,
    saves_tip                = EXCLUDED.saves_tip,
    saves_punch              = EXCLUDED.saves_punch,
    crosses_claimed          = EXCLUDED.crosses_claimed,
    crosses_punched          = EXCLUDED.crosses_punched,
    crosses_missed           = EXCLUDED.crosses_missed,
    crosses_total            = EXCLUDED.crosses_total,
    dist_gk_short_att        = EXCLUDED.dist_gk_short_att,
    dist_gk_short_suc        = EXCLUDED.dist_gk_short_suc,
    dist_gk_long_att         = EXCLUDED.dist_gk_long_att,
    dist_gk_long_suc         = EXCLUDED.dist_gk_long_suc,
    dist_throws_att          = EXCLUDED.dist_throws_att,
    dist_throws_suc          = EXCLUDED.dist_throws_suc,
    dist_passes_att          = EXCLUDED.dist_passes_att,
    dist_passes_suc          = EXCLUDED.dist_passes_suc,
    dist_under_pressure_att  = EXCLUDED.dist_under_pressure_att,
    dist_under_pressure_suc  = EXCLUDED.dist_under_pressure_suc,
    one_v_one_faced          = EXCLUDED.one_v_one_faced,
    one_v_one_won            = EXCLUDED.one_v_one_won,
    errors_leading_to_goal   = EXCLUDED.errors_leading_to_goal,
    sweeper_clearances       = EXCLUDED.sweeper_clearances,
    sweeper_interceptions    = EXCLUDED.sweeper_interceptions,
    sweeper_tackles          = EXCLUDED.sweeper_tackles,
    rebounds_controlled      = EXCLUDED.rebounds_controlled,
    rebounds_dangerous       = EXCLUDED.rebounds_dangerous,
    half_data                = EXCLUDED.half_data,
    notes                    = EXCLUDED.notes,
    was_subbed               = EXCLUDED.was_subbed,
    sub_reason               = EXCLUDED.sub_reason,
    sub_minute               = EXCLUDED.sub_minute,
    logged_by                = EXCLUDED.logged_by,
    logged_by_name           = EXCLUDED.logged_by_name,
    minutes_played           = EXCLUDED.minutes_played,
    org_id                   = EXCLUDED.org_id,
    source_url               = EXCLUDED.source_url,
    shots_faced              = EXCLUDED.shots_faced,
    updated_at               = now();

  -- 2. goals_conceded — replace by match_id. Enumerate columns so the row
  --    id defaults (client doesn't send it).
  DELETE FROM public.goals_conceded WHERE match_id = v_match_id;
  IF jsonb_array_length(p_goals) > 0 THEN
    INSERT INTO public.goals_conceded (
      match_id, coach_id, goal_zone, shot_origin, goal_source,
      goal_rank, shot_type, gk_positioning, half
    )
    SELECT
      match_id, coach_id, goal_zone, shot_origin, goal_source,
      goal_rank, shot_type, gk_positioning, half
    FROM jsonb_populate_recordset(NULL::public.goals_conceded, p_goals);
  END IF;

  -- 3. shot_events — replace by match_id.
  DELETE FROM public.shot_events WHERE match_id = v_match_id;
  IF jsonb_array_length(p_shots) > 0 THEN
    INSERT INTO public.shot_events (
      match_id, keeper_id, coach_id, shot_origin, gk_action, goal_zone,
      is_goal, is_off_target, shot_type, event_type, half
    )
    SELECT
      match_id, keeper_id, coach_id, shot_origin, gk_action, goal_zone,
      is_goal, is_off_target, shot_type, event_type, half
    FROM jsonb_populate_recordset(NULL::public.shot_events, p_shots);
  END IF;

  -- 4. match_attributes — replace by match_id (no unique constraint, so
  --    delete-then-insert is the idempotent path).
  DELETE FROM public.match_attributes WHERE match_id = v_match_id;
  IF p_attrs IS NOT NULL THEN
    INSERT INTO public.match_attributes (
      match_id, keeper_id, coach_id, game_rating, shot_stopping, handling,
      positioning, aerial_dominance, distribution, decision_making,
      sweeper_play, set_piece_org, footwork_agility, reaction_speed,
      communication, command_of_box, composure, compete_level
    )
    SELECT
      match_id, keeper_id, coach_id, game_rating, shot_stopping, handling,
      positioning, aerial_dominance, distribution, decision_making,
      sweeper_play, set_piece_org, footwork_agility, reaction_speed,
      communication, command_of_box, composure, compete_level
    FROM jsonb_populate_record(NULL::public.match_attributes, p_attrs);
  END IF;

  -- 5. match_rankings — upsert on (match_id, keeper_id, author_role).
  IF p_ranking IS NOT NULL THEN
    INSERT INTO public.match_rankings (
      match_id, coach_id, keeper_id, author_id, author_role,
      game_rating, shot_stopping, handling, positioning, aerial_dominance,
      distribution, decision_making, sweeper_play, set_piece_org,
      footwork_agility, reaction_speed, communication, command_of_box,
      composure, compete_level, submitted_at, updated_at
    )
    SELECT
      match_id, coach_id, keeper_id, author_id, author_role,
      game_rating, shot_stopping, handling, positioning, aerial_dominance,
      distribution, decision_making, sweeper_play, set_piece_org,
      footwork_agility, reaction_speed, communication, command_of_box,
      composure, compete_level, submitted_at, updated_at
    FROM jsonb_populate_record(NULL::public.match_rankings, p_ranking)
    ON CONFLICT (match_id, keeper_id, author_role) DO UPDATE SET
      game_rating      = EXCLUDED.game_rating,
      shot_stopping    = EXCLUDED.shot_stopping,
      handling         = EXCLUDED.handling,
      positioning      = EXCLUDED.positioning,
      aerial_dominance = EXCLUDED.aerial_dominance,
      distribution     = EXCLUDED.distribution,
      decision_making  = EXCLUDED.decision_making,
      sweeper_play     = EXCLUDED.sweeper_play,
      set_piece_org    = EXCLUDED.set_piece_org,
      footwork_agility = EXCLUDED.footwork_agility,
      reaction_speed   = EXCLUDED.reaction_speed,
      communication    = EXCLUDED.communication,
      command_of_box   = EXCLUDED.command_of_box,
      composure        = EXCLUDED.composure,
      compete_level    = EXCLUDED.compete_level,
      submitted_at     = EXCLUDED.submitted_at,
      updated_at       = EXCLUDED.updated_at;
  END IF;

  -- 6. match_notes — upsert on (match_id, keeper_id, author_role).
  IF p_note IS NOT NULL THEN
    INSERT INTO public.match_notes (
      match_id, coach_id, keeper_id, author_id, author_role,
      note_text, submitted_at, updated_at
    )
    SELECT
      match_id, coach_id, keeper_id, author_id, author_role,
      note_text, submitted_at, updated_at
    FROM jsonb_populate_record(NULL::public.match_notes, p_note)
    ON CONFLICT (match_id, keeper_id, author_role) DO UPDATE SET
      note_text    = EXCLUDED.note_text,
      submitted_at = EXCLUDED.submitted_at,
      updated_at   = EXCLUDED.updated_at;
  END IF;

  RETURN v_match_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_pitchside_match(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.save_pitchside_match(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) IS
  'Atomic pitchside save. SECURITY INVOKER — every inner INSERT/DELETE is '
  'still subject to RLS, so coach + delegate scope checks remain in force. '
  'Idempotent on retry (upsert match, replace child rows by match_id).';
