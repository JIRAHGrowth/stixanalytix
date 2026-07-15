-- Constrain every event table's keeper_id to NOT NULL — 2026-07-14
--
-- With the backfill (20260714_multi_keeper_attribution_backfill.sql), publish
-- route fix, pitchside RPC fix, and pitchside client fix all landed, EVERY row
-- in these tables has keeper_id populated. Adding NOT NULL now prevents any
-- future insert (from ANY code path — publish, pitchside, script, direct SQL)
-- from silently dropping keeper attribution. That's the class-of-bugs fix.
--
-- If a future insert fails on this constraint, the error is loud and the fix
-- is obvious (add keeper_id to the payload) — infinitely better than the
-- silent Amalie-shows-4-clean-sheets outcome we lived with.

ALTER TABLE public.goals_conceded ALTER COLUMN keeper_id SET NOT NULL;
ALTER TABLE public.shot_events        ALTER COLUMN keeper_id SET NOT NULL;
ALTER TABLE public.distribution_events ALTER COLUMN keeper_id SET NOT NULL;
ALTER TABLE public.sweeper_events     ALTER COLUMN keeper_id SET NOT NULL;
ALTER TABLE public.one_v_one_events   ALTER COLUMN keeper_id SET NOT NULL;
