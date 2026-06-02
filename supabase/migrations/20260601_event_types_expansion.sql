-- Event type expansion (2026-06-01)
-- Adds two new GK event types — 1v1 and Sweeper — and extends save +
-- distribution to capture the encyclopedia-aligned fields the v3 focus
-- cards collect.
--
-- Why now: the focus-mode review prototype demonstrated that each event
-- type deserves a purpose-built rubric. Folding 1v1 into save and
-- sweeper into distribution muddies both the data and the coaching
-- vocabulary. See [[project-review-focus-clips-pipeline]] in agent memory.
--
-- All additions are additive (new tables, new nullable columns); no
-- existing rows are modified, no existing reads break.

-- =====================================================================
-- shot_events — save technique additions (encyclopedia ch.4, 9, 10, 13)
-- =====================================================================
alter table public.shot_events
  add column if not exists technique   text,  -- W-catch / Scoop / Chest catch / Collapse catch / Forward parry / Side parry / Tip over / Punch / Block / Smother
  add column if not exists dive_family text;  -- None / Collapse / Low dive / Mid dive / High dive / Diagonal forward

-- =====================================================================
-- distribution_events — target_zone (12-zone landscape grid)
-- =====================================================================
-- target_zone supersedes the legacy free-text `direction` column. Both
-- coexist for backwards compatibility with the bulk-mode entry path.
alter table public.distribution_events
  add column if not exists target_zone text;  -- short_l/short_c/short_r/mid_l/mid_c/mid_r/long_l/long_c/long_r/xlong_l/xlong_c/xlong_r

-- =====================================================================
-- one_v_one_events — new event type
-- =====================================================================
-- A 1v1 is a goal-prevention encounter that's cognitively distinct from
-- a shot-stopping save: assessed against approach timing, body shape,
-- and decision to come-vs-stay rather than the conventional
-- shot/technique/rebound rubric. Body-shape vocabulary follows
-- gk_techniques encyclopedia ch.22 (K-barrier), ch.23 (Long barrier 1v1),
-- ch.24 (Smother), ch.25 (Starfish), ch.26 (Block save).
create table if not exists public.one_v_one_events (
  id                  uuid primary key default gen_random_uuid(),
  match_id            uuid not null references public.matches(id) on delete cascade,
  keeper_id           uuid references public.keepers(id) on delete set null,
  coach_id            uuid not null references public.profiles(id) on delete cascade,
  org_id              uuid,

  -- When in the match
  timestamp_seconds   integer,
  minute              integer,
  half                text,             -- 'H1' | 'H2' | 'ET' | null
  match_clock         text,

  -- THE SETUP — how the 1v1 arrived
  situation_type      text,             -- through_ball / breakaway_run / defensive_error / loose_ball / cross_back
  approach_corridor   text,             -- wide_l / angled_l / central / angled_r / wide_r
  set_position        text,             -- standard_set / low_set / set_set

  -- THE GK — what the keeper did (encyclopedia vocabulary)
  body_shape          text,             -- k_barrier / smother / block_save / long_barrier / starfish / slide / let_through
  engagement_depth    text,             -- inside_6 / edge_of_6 / penalty_spot / edge_of_18 / beyond_18
  decision            text,             -- came / stayed
  timing              text,             -- early / on_time / late

  -- THE OUTCOME
  result              text,             -- save / goal / cleared / forced_wide / foul_won / foul_conceded
  rebound_quality     text,             -- held_dead / safe_rebound / dangerous_rebound

  -- Notes + clip
  notes               text,
  shot_description    text,             -- Gemini observation prose
  gk_observations     text,
  confidence          text,             -- high / medium / low (from Gemini)
  clip_storage_path   text,             -- relative path under match-videos bucket

  -- Audit
  source              text not null default 'video',  -- 'video' (Gemini) | 'pitchside' | 'manual'
  coach_added         boolean not null default false,
  created_at          timestamptz not null default now(),

  constraint one_v_one_events_situation_chk
    check (situation_type is null or situation_type in
      ('through_ball','breakaway_run','defensive_error','loose_ball','cross_back')),
  constraint one_v_one_events_corridor_chk
    check (approach_corridor is null or approach_corridor in
      ('wide_l','angled_l','central','angled_r','wide_r')),
  constraint one_v_one_events_setpos_chk
    check (set_position is null or set_position in
      ('standard_set','low_set','set_set')),
  constraint one_v_one_events_bodyshape_chk
    check (body_shape is null or body_shape in
      ('k_barrier','smother','block_save','long_barrier','starfish','slide','let_through')),
  constraint one_v_one_events_engagement_chk
    check (engagement_depth is null or engagement_depth in
      ('inside_6','edge_of_6','penalty_spot','edge_of_18','beyond_18')),
  constraint one_v_one_events_decision_chk
    check (decision is null or decision in ('came','stayed')),
  constraint one_v_one_events_timing_chk
    check (timing is null or timing in ('early','on_time','late')),
  constraint one_v_one_events_result_chk
    check (result is null or result in
      ('save','goal','cleared','forced_wide','foul_won','foul_conceded')),
  constraint one_v_one_events_rebound_chk
    check (rebound_quality is null or rebound_quality in
      ('held_dead','safe_rebound','dangerous_rebound')),
  constraint one_v_one_events_half_chk
    check (half is null or half in ('H1','H2','ET')),
  constraint one_v_one_events_source_chk
    check (source in ('video','pitchside','manual'))
);

create index if not exists one_v_one_events_match_id_idx       on public.one_v_one_events(match_id);
create index if not exists one_v_one_events_keeper_id_idx      on public.one_v_one_events(keeper_id) where keeper_id is not null;
create index if not exists one_v_one_events_coach_id_idx       on public.one_v_one_events(coach_id);
create index if not exists one_v_one_events_match_ts_idx       on public.one_v_one_events(match_id, timestamp_seconds);
create index if not exists one_v_one_events_org_id_idx         on public.one_v_one_events(org_id) where org_id is not null;

alter table public.one_v_one_events enable row level security;

create policy one_v_one_events_select_coach
  on public.one_v_one_events for select
  using (auth.uid() = coach_id);

create policy one_v_one_events_select_delegate
  on public.one_v_one_events for select
  using (
    exists (
      select 1 from public.delegates d
      where d.delegate_user_id = auth.uid()
        and d.coach_id = one_v_one_events.coach_id
        and d.dashboard_access = true
        and (
          d.dashboard_keepers is null
          or one_v_one_events.keeper_id = any (d.dashboard_keepers)
        )
    )
  );

create policy one_v_one_events_insert_coach
  on public.one_v_one_events for insert
  with check (auth.uid() = coach_id);

create policy one_v_one_events_update_coach
  on public.one_v_one_events for update
  using (auth.uid() = coach_id)
  with check (auth.uid() = coach_id);

-- =====================================================================
-- sweeper_events — new event type
-- =====================================================================
-- A sweeper action is the GK acting as an outfield player in advanced
-- positions — intercepting long balls, first-time clearances, controlled
-- distributions beyond the box. Action vocabulary mirrors how coaches
-- describe sweeper-keeper play (intercept / clearance with header or
-- foot / control + distribute / slide / smother). The "let_through"
-- option records a failure mode where the GK misjudged and the attacker
-- latched on — coachable signal.
--
-- Risk grade is included because sweeper actions are inherently
-- risk-reward calls: a successful sweep prevents a goal; a failed sweep
-- usually concedes one. Coaches need to assess risk-taking rate, not
-- just success rate.
create table if not exists public.sweeper_events (
  id                  uuid primary key default gen_random_uuid(),
  match_id            uuid not null references public.matches(id) on delete cascade,
  keeper_id           uuid references public.keepers(id) on delete set null,
  coach_id            uuid not null references public.profiles(id) on delete cascade,
  org_id              uuid,

  -- When in the match
  timestamp_seconds   integer,
  minute              integer,
  half                text,
  match_clock         text,

  -- THE READ — what triggered the sweep
  trigger             text,             -- through_ball / loose_ball / opp_dribble / clearance_request
  gk_starting_depth   text,             -- on_line / edge_of_6 / edge_of_18 / beyond_18
  timing              text,             -- early / on_time / late
  sweep_zone          text,             -- shared vocab with shot_origin: 6yard/boxL/boxC/boxR/outL/outC/outR/cornerL/cornerR

  -- THE ACTION — outfield-player choice
  action              text,             -- intercept / clearance_header / clearance_foot / control_distribute / slide / smother / let_through
  pressure            text,             -- alone / with_opp / with_teammate
  risk_grade          text,             -- low / medium / high

  -- THE OUTCOME
  result              text,             -- cleared_safely / kept_possession / conceded_corner / lost_possession / goal / yellow_red

  -- Notes + clip
  notes               text,
  action_description  text,             -- Gemini observation prose
  gk_observations     text,
  confidence          text,
  clip_storage_path   text,

  -- Audit
  source              text not null default 'video',
  coach_added         boolean not null default false,
  created_at          timestamptz not null default now(),

  constraint sweeper_events_trigger_chk
    check (trigger is null or trigger in
      ('through_ball','loose_ball','opp_dribble','clearance_request')),
  constraint sweeper_events_starting_chk
    check (gk_starting_depth is null or gk_starting_depth in
      ('on_line','edge_of_6','edge_of_18','beyond_18')),
  constraint sweeper_events_timing_chk
    check (timing is null or timing in ('early','on_time','late')),
  constraint sweeper_events_action_chk
    check (action is null or action in
      ('intercept','clearance_header','clearance_foot','control_distribute','slide','smother','let_through')),
  constraint sweeper_events_pressure_chk
    check (pressure is null or pressure in ('alone','with_opp','with_teammate')),
  constraint sweeper_events_risk_chk
    check (risk_grade is null or risk_grade in ('low','medium','high')),
  constraint sweeper_events_result_chk
    check (result is null or result in
      ('cleared_safely','kept_possession','conceded_corner','lost_possession','goal','yellow_red')),
  constraint sweeper_events_half_chk
    check (half is null or half in ('H1','H2','ET')),
  constraint sweeper_events_source_chk
    check (source in ('video','pitchside','manual'))
);

create index if not exists sweeper_events_match_id_idx       on public.sweeper_events(match_id);
create index if not exists sweeper_events_keeper_id_idx      on public.sweeper_events(keeper_id) where keeper_id is not null;
create index if not exists sweeper_events_coach_id_idx       on public.sweeper_events(coach_id);
create index if not exists sweeper_events_match_ts_idx       on public.sweeper_events(match_id, timestamp_seconds);
create index if not exists sweeper_events_org_id_idx         on public.sweeper_events(org_id) where org_id is not null;

alter table public.sweeper_events enable row level security;

create policy sweeper_events_select_coach
  on public.sweeper_events for select
  using (auth.uid() = coach_id);

create policy sweeper_events_select_delegate
  on public.sweeper_events for select
  using (
    exists (
      select 1 from public.delegates d
      where d.delegate_user_id = auth.uid()
        and d.coach_id = sweeper_events.coach_id
        and d.dashboard_access = true
        and (
          d.dashboard_keepers is null
          or sweeper_events.keeper_id = any (d.dashboard_keepers)
        )
    )
  );

create policy sweeper_events_insert_coach
  on public.sweeper_events for insert
  with check (auth.uid() = coach_id);

create policy sweeper_events_update_coach
  on public.sweeper_events for update
  using (auth.uid() = coach_id)
  with check (auth.uid() = coach_id);
