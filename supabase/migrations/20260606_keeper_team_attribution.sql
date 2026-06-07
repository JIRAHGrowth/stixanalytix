-- Keeper-team attribution (2026-06-06)
-- Adds a `keeper_team` column to per-event tables so coaches can mark
-- whether each save / distribution event was performed by THEIR keeper
-- or the opposition keeper. Gemini auto-attributes from team kit colors
-- (see prompts/saves.md and prompts/distribution.md); the review UI
-- shows a "Judah / Opposition" toggle that defaults to the auto value
-- and lets the coach correct it.
--
-- Why: a static cam catches both keepers in frame. Opposition keeper
-- saves and distributions are real events, useful as model-training
-- material, but they shouldn't count toward Judah's stats. Today the
-- review screen forces the coach to either accept (and pollute Judah's
-- numbers) or reject (and lose training data). This column lets us
-- keep the row, exclude it from his dashboard rollups, and tag it as
-- opposition data for the fine-tuning corpus.
--
-- Goals are excluded from this change: goals_conceded by definition
-- already means "against Judah." Opposition GA goes into the opponent's
-- scoring side of the result, not into Judah's row.
--
-- Values:
--   'us'      = our keeper (Judah). Counts toward all dashboard stats.
--   'opp'     = opposition keeper. Preserved as training data; excluded
--               from Judah's dashboard rollups.
--   NULL      = pre-feature data, or coach hasn't decided. Dashboards
--               treat NULL as 'us' to preserve historical aggregates.
--
-- All additions are nullable + CHECK-constrained; no existing rows
-- change and no existing reads break.

alter table public.shot_events
  add column if not exists keeper_team text
    check (keeper_team in ('us', 'opp') or keeper_team is null);

alter table public.distribution_events
  add column if not exists keeper_team text
    check (keeper_team in ('us', 'opp') or keeper_team is null);

-- Helpful index for the dashboard filter `keeper_team != 'opp'`.
-- Partial index keeps the on-disk footprint small — we only need to
-- isolate the opposition rows since 'us' + NULL is by far the bulk.
create index if not exists shot_events_keeper_team_opp_idx
  on public.shot_events(keeper_id, match_id)
  where keeper_team = 'opp';

create index if not exists distribution_events_keeper_team_opp_idx
  on public.distribution_events(keeper_id, match_id)
  where keeper_team = 'opp';
