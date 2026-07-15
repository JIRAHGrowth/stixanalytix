-- Multi-keeper attribution backfill — 2026-07-14
--
-- Context: the schema supports per-event keeper_id and matches.secondary_keeper_id,
-- but neither the video-publish route nor the pitchside RPC populate them today.
-- The Fusion 2008 match (Amalie H1, GK2 Unknown H2 from 62') was published with
-- no sub declared, no secondary_keeper_id, and NULL keeper_id on all 3 conceded
-- goals — so Amalie's dashboard shows 4 clean sheets instead of 2 and her Goals
-- tab is empty.
--
-- This migration does three things, in order, inside a single transaction:
--   1. Patch Fusion 2008 to declare the sub (sub_minute=62, secondary=GK2 Unknown,
--      was_subbed=true).
--   2. For EVERY match with a declared sub (was_subbed=true + sub_minute set +
--      secondary_keeper_id set), re-attribute per-event keeper_id on
--      goals_conceded / shot_events / distribution_events / sweeper_events /
--      one_v_one_events based on timestamp_seconds vs sub_minute*60. Convention:
--      t < boundary  → primary keeper. t >= boundary → secondary keeper.
--   3. For every event with NULL keeper_id on a single-keeper match (no sub),
--      backfill to matches.keeper_id. This cleans up the Fusion-style publish
--      leak where publish forgot to write keeper_id on goals_conceded.
--
-- Idempotent: safe to re-run. The keeper_id assignments are deterministic given
-- the current sub_minute + timestamp on each row.
--
-- Clip preservation: only UPDATEs `keeper_id`. `clip_storage_path` stays on every
-- row, so click-to-play in the review/dashboard UIs keeps working the moment the
-- re-attribution runs.

BEGIN;

-- ─── Step 1: declare Fusion 2008's sub ─────────────────────────────────────────
-- Amalie played H1, subbed at 62:00 for GK2 Unknown (unknown keeper — not the
-- name of the actual sub, just the placeholder keeper Joshua uses when the
-- second keeper's identity wasn't captured).
UPDATE public.matches
SET sub_minute          = 62,
    was_subbed          = true,
    secondary_keeper_id = 'e3ac6897-9075-4477-8b51-d118b8135110'  -- GK2 Unknown
WHERE id       = 'e4171541-e23f-4837-b5aa-b86097d01e32'
  AND coach_id = 'eb7e8a7a-1e3c-4454-b5f8-2d03bf952e4f';

-- ─── Step 2: re-attribute events on every substituted match ────────────────────
-- One CTE reused across every event table so the split logic lives in exactly
-- one place. Any future sub declared on any match gets the correct attribution
-- next time this migration is re-run — but the write paths will land in a
-- follow-up commit so future publishes tag events correctly at insert time.

-- goals_conceded
WITH sub AS (
  SELECT id AS match_id,
         keeper_id AS primary_kid,
         secondary_keeper_id AS secondary_kid,
         sub_minute * 60 AS boundary_seconds
  FROM public.matches
  WHERE was_subbed = true
    AND sub_minute IS NOT NULL
    AND secondary_keeper_id IS NOT NULL
)
UPDATE public.goals_conceded gc
SET keeper_id = CASE
    WHEN gc.timestamp_seconds < sub.boundary_seconds THEN sub.primary_kid
    ELSE sub.secondary_kid
  END
FROM sub
WHERE gc.match_id = sub.match_id
  AND gc.timestamp_seconds IS NOT NULL;

-- shot_events
WITH sub AS (
  SELECT id AS match_id, keeper_id AS primary_kid, secondary_keeper_id AS secondary_kid,
         sub_minute * 60 AS boundary_seconds
  FROM public.matches
  WHERE was_subbed = true AND sub_minute IS NOT NULL AND secondary_keeper_id IS NOT NULL
)
UPDATE public.shot_events se
SET keeper_id = CASE
    WHEN se.timestamp_seconds < sub.boundary_seconds THEN sub.primary_kid
    ELSE sub.secondary_kid
  END
FROM sub
WHERE se.match_id = sub.match_id
  AND se.timestamp_seconds IS NOT NULL;

-- distribution_events
WITH sub AS (
  SELECT id AS match_id, keeper_id AS primary_kid, secondary_keeper_id AS secondary_kid,
         sub_minute * 60 AS boundary_seconds
  FROM public.matches
  WHERE was_subbed = true AND sub_minute IS NOT NULL AND secondary_keeper_id IS NOT NULL
)
UPDATE public.distribution_events de
SET keeper_id = CASE
    WHEN de.timestamp_seconds < sub.boundary_seconds THEN sub.primary_kid
    ELSE sub.secondary_kid
  END
FROM sub
WHERE de.match_id = sub.match_id
  AND de.timestamp_seconds IS NOT NULL;

-- sweeper_events
WITH sub AS (
  SELECT id AS match_id, keeper_id AS primary_kid, secondary_keeper_id AS secondary_kid,
         sub_minute * 60 AS boundary_seconds
  FROM public.matches
  WHERE was_subbed = true AND sub_minute IS NOT NULL AND secondary_keeper_id IS NOT NULL
)
UPDATE public.sweeper_events sw
SET keeper_id = CASE
    WHEN sw.timestamp_seconds < sub.boundary_seconds THEN sub.primary_kid
    ELSE sub.secondary_kid
  END
FROM sub
WHERE sw.match_id = sub.match_id
  AND sw.timestamp_seconds IS NOT NULL;

-- one_v_one_events
WITH sub AS (
  SELECT id AS match_id, keeper_id AS primary_kid, secondary_keeper_id AS secondary_kid,
         sub_minute * 60 AS boundary_seconds
  FROM public.matches
  WHERE was_subbed = true AND sub_minute IS NOT NULL AND secondary_keeper_id IS NOT NULL
)
UPDATE public.one_v_one_events ovo
SET keeper_id = CASE
    WHEN ovo.timestamp_seconds < sub.boundary_seconds THEN sub.primary_kid
    ELSE sub.secondary_kid
  END
FROM sub
WHERE ovo.match_id = sub.match_id
  AND ovo.timestamp_seconds IS NOT NULL;

-- ─── Step 3: fill NULL keeper_id on single-keeper matches ──────────────────────
-- Publish route + pitchside RPC currently omit keeper_id on goals_conceded.
-- For any match WITHOUT a declared sub, the primary keeper is the only keeper —
-- so fill the primary in unconditionally.
UPDATE public.goals_conceded gc
SET keeper_id = m.keeper_id
FROM public.matches m
WHERE gc.match_id = m.id
  AND gc.keeper_id IS NULL
  AND (m.was_subbed IS NOT TRUE OR m.sub_minute IS NULL OR m.secondary_keeper_id IS NULL);

-- Same for other event tables (defensive — most already have keeper_id set
-- from publish/pitchside, but pre-fix rows may have leaked).
UPDATE public.shot_events se SET keeper_id = m.keeper_id
FROM public.matches m
WHERE se.match_id = m.id AND se.keeper_id IS NULL
  AND (m.was_subbed IS NOT TRUE OR m.sub_minute IS NULL OR m.secondary_keeper_id IS NULL);

UPDATE public.distribution_events de SET keeper_id = m.keeper_id
FROM public.matches m
WHERE de.match_id = m.id AND de.keeper_id IS NULL
  AND (m.was_subbed IS NOT TRUE OR m.sub_minute IS NULL OR m.secondary_keeper_id IS NULL);

UPDATE public.sweeper_events sw SET keeper_id = m.keeper_id
FROM public.matches m
WHERE sw.match_id = m.id AND sw.keeper_id IS NULL
  AND (m.was_subbed IS NOT TRUE OR m.sub_minute IS NULL OR m.secondary_keeper_id IS NULL);

UPDATE public.one_v_one_events ovo SET keeper_id = m.keeper_id
FROM public.matches m
WHERE ovo.match_id = m.id AND ovo.keeper_id IS NULL
  AND (m.was_subbed IS NOT TRUE OR m.sub_minute IS NULL OR m.secondary_keeper_id IS NULL);

-- Do NOT set NOT NULL on goals_conceded.keeper_id yet — the constraint lands
-- in a follow-up migration AFTER the publish/pitchside write paths are fixed,
-- to avoid a window where a new insert can trip the constraint.

COMMIT;
