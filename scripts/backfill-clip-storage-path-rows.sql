-- ─────────────────────────────────────────────────────────────────────────
-- backfill-clip-storage-path-rows.sql                          2026-06-15
--
-- Path C — one-shot population of the new event-table column
-- `clip_storage_path` from existing `video_jobs.gemini_output` JSON for
-- every PUBLISHED match. Pairs with migration
-- add_clip_storage_path_to_event_tables_2026_06_15 and the publish-route
-- change that writes the column for future publishes.
--
-- Idempotent: each UPDATE is gated by `clip_storage_path IS NULL`, so
-- re-running is a no-op. Pre-clip-pipeline matches (May 2026 and earlier)
-- have no clip_storage_path in their gemini_output → their rows stay
-- NULL until those jobs are also backfilled via worker/backfill_batch.py.
--
-- Run via the Supabase SQL editor or `psql`. Read-friendly: each block
-- prints how many rows it touched.
-- ─────────────────────────────────────────────────────────────────────────

\timing on

-- ── shot_events ← gemini_output.saves.parsed.saves[].clip_storage_path ──
WITH save_clips AS (
  SELECT
    j.published_match_id AS match_id,
    ROUND((evt->>'timestamp_seconds')::numeric)::integer AS ts,
    evt->>'clip_storage_path' AS path
  FROM video_jobs j
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(j.gemini_output->'saves'->'parsed'->'saves', '[]'::jsonb)
  ) AS evt
  WHERE j.published_match_id IS NOT NULL
    AND j.status = 'published'
    AND evt ? 'clip_storage_path'
    AND evt->>'clip_storage_path' IS NOT NULL
    AND evt->>'timestamp_seconds' IS NOT NULL
), updated AS (
  UPDATE shot_events s
  SET clip_storage_path = sc.path
  FROM save_clips sc
  WHERE s.match_id = sc.match_id
    AND s.timestamp_seconds IS NOT NULL
    AND s.timestamp_seconds = sc.ts
    AND s.clip_storage_path IS NULL
  RETURNING s.id
)
SELECT 'shot_events' AS table_name, COUNT(*) AS rows_updated FROM updated;

-- ── distribution_events ← gemini_output.distribution.parsed.distribution[] ──
WITH dist_clips AS (
  SELECT
    j.published_match_id AS match_id,
    ROUND((evt->>'timestamp_seconds')::numeric)::integer AS ts,
    evt->>'clip_storage_path' AS path
  FROM video_jobs j
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(j.gemini_output->'distribution'->'parsed'->'distribution', '[]'::jsonb)
  ) AS evt
  WHERE j.published_match_id IS NOT NULL
    AND j.status = 'published'
    AND evt ? 'clip_storage_path'
    AND evt->>'clip_storage_path' IS NOT NULL
    AND evt->>'timestamp_seconds' IS NOT NULL
), updated AS (
  UPDATE distribution_events d
  SET clip_storage_path = dc.path
  FROM dist_clips dc
  WHERE d.match_id = dc.match_id
    AND d.timestamp_seconds IS NOT NULL
    AND d.timestamp_seconds = dc.ts
    AND d.clip_storage_path IS NULL
  RETURNING d.id
)
SELECT 'distribution_events' AS table_name, COUNT(*) AS rows_updated FROM updated;

-- ── goals_conceded ← gemini_output.parsed.goals[] (filtered to conceded) ──
-- Gemini's goals JSON includes both conceded and our-team goals; we match by
-- (match_id, timestamp_seconds) so the side-tagging is implicit in which
-- relational table the row already landed in.
WITH goal_clips AS (
  SELECT
    j.published_match_id AS match_id,
    ROUND((evt->>'timestamp_seconds')::numeric)::integer AS ts,
    evt->>'clip_storage_path' AS path
  FROM video_jobs j
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(j.gemini_output->'parsed'->'goals', '[]'::jsonb)
  ) AS evt
  WHERE j.published_match_id IS NOT NULL
    AND j.status = 'published'
    AND evt ? 'clip_storage_path'
    AND evt->>'clip_storage_path' IS NOT NULL
    AND evt->>'timestamp_seconds' IS NOT NULL
), gc_updated AS (
  UPDATE goals_conceded gc
  SET clip_storage_path = g.path
  FROM goal_clips g
  WHERE gc.match_id = g.match_id
    AND gc.timestamp_seconds IS NOT NULL
    AND gc.timestamp_seconds = g.ts
    AND gc.clip_storage_path IS NULL
  RETURNING gc.id
)
SELECT 'goals_conceded' AS table_name, COUNT(*) AS rows_updated FROM gc_updated;

-- ── goals_scored ← gemini_output.parsed.goals[] (our-team goals) ──
WITH goal_clips AS (
  SELECT
    j.published_match_id AS match_id,
    ROUND((evt->>'timestamp_seconds')::numeric)::integer AS ts,
    evt->>'clip_storage_path' AS path
  FROM video_jobs j
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(j.gemini_output->'parsed'->'goals', '[]'::jsonb)
  ) AS evt
  WHERE j.published_match_id IS NOT NULL
    AND j.status = 'published'
    AND evt ? 'clip_storage_path'
    AND evt->>'clip_storage_path' IS NOT NULL
    AND evt->>'timestamp_seconds' IS NOT NULL
), gs_updated AS (
  UPDATE goals_scored gs
  SET clip_storage_path = g.path
  FROM goal_clips g
  WHERE gs.match_id = g.match_id
    AND gs.timestamp_seconds IS NOT NULL
    AND gs.timestamp_seconds = g.ts
    AND gs.clip_storage_path IS NULL
  RETURNING gs.id
)
SELECT 'goals_scored' AS table_name, COUNT(*) AS rows_updated FROM gs_updated;

-- ── Verification ────────────────────────────────────────────────────────
-- After running, this should show non-zero `clipped` counts for matches
-- whose source video_job is post-2026-06-01 (the clip-pipeline cutoff).
SELECT
  'shot_events'         AS table_name,
  COUNT(*)              AS total_rows,
  COUNT(*) FILTER (WHERE clip_storage_path IS NOT NULL) AS clipped
FROM shot_events
UNION ALL
SELECT 'distribution_events', COUNT(*), COUNT(*) FILTER (WHERE clip_storage_path IS NOT NULL) FROM distribution_events
UNION ALL
SELECT 'goals_conceded',      COUNT(*), COUNT(*) FILTER (WHERE clip_storage_path IS NOT NULL) FROM goals_conceded
UNION ALL
SELECT 'goals_scored',        COUNT(*), COUNT(*) FILTER (WHERE clip_storage_path IS NOT NULL) FROM goals_scored;
