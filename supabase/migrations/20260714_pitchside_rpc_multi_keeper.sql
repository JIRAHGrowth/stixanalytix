-- Extend save_pitchside_match to accept multi-keeper attribution — 2026-07-14
--
-- Prior version (20260604_save_pitchside_match_rpc.sql):
--   - Did NOT accept matches.secondary_keeper_id → sub metadata was lost
--   - Did NOT write goals_conceded.keeper_id → per-keeper goal filters broke
--     for any pitchside-logged match with a sub
--
-- New version:
--   - Accepts matches.secondary_keeper_id in p_match payload
--   - Writes keeper_id + timestamp_seconds + minute on goals_conceded rows
--
-- The client (app/pitchside/page.jsx) is responsible for computing the correct
-- keeper_id per event via lib/keeper-attribution.js#attributeEventToKeeper
-- before calling this RPC — the RPC trusts the payload. That mirrors the
-- video-publish route, where the same helper computes attribution at write time.

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

  -- 1. Match row — upsert. Now includes secondary_keeper_id so two-keeper
  --    matches carry their sub attribution through pitchside as well.
  INSERT INTO public.matches AS m (
    id, coach_id, keeper_id, secondary_keeper_id, club_id, session_type, opponent, venue,
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
  )
  SELECT
    id, coach_id, keeper_id, secondary_keeper_id, club_id, session_type, opponent, venue,
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
    secondary_keeper_id      = EXCLUDED.secondary_keeper_id,
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

  -- 2. goals_conceded — now writes keeper_id + timestamp_seconds + minute.
  --    Client MUST compute keeper_id per goal via attributeEventToKeeper()
  --    when the match has a sub. RPC trusts the payload.
  DELETE FROM public.goals_conceded WHERE match_id = v_match_id;
  IF jsonb_array_length(p_goals) > 0 THEN
    INSERT INTO public.goals_conceded (
      match_id, coach_id, keeper_id, goal_zone, shot_origin, goal_source,
      goal_rank, shot_type, gk_positioning, half, timestamp_seconds, minute
    )
    SELECT
      match_id, coach_id, keeper_id, goal_zone, shot_origin, goal_source,
      goal_rank, shot_type, gk_positioning, half, timestamp_seconds, minute
    FROM jsonb_populate_recordset(NULL::public.goals_conceded, p_goals);
  END IF;

  -- 3. shot_events — unchanged column list (keeper_id was already in it);
  --    client computes per-event keeper_id when subbed.
  DELETE FROM public.shot_events WHERE match_id = v_match_id;
  IF jsonb_array_length(p_shots) > 0 THEN
    INSERT INTO public.shot_events (
      match_id, keeper_id, coach_id, shot_origin, gk_action, goal_zone,
      is_goal, is_off_target, shot_type, event_type, half, timestamp_seconds
    )
    SELECT
      match_id, keeper_id, coach_id, shot_origin, gk_action, goal_zone,
      is_goal, is_off_target, shot_type, event_type, half, timestamp_seconds
    FROM jsonb_populate_recordset(NULL::public.shot_events, p_shots);
  END IF;

  -- 4-6 unchanged — match_attributes / match_rankings / match_notes.
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

COMMENT ON FUNCTION public.save_pitchside_match(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) IS
  'Atomic pitchside save (2026-07-14 revision). Adds matches.secondary_keeper_id + '
  'goals_conceded.keeper_id support for multi-keeper matches. SECURITY INVOKER — '
  'RLS still applies to every inner write. Idempotent on retry.';
