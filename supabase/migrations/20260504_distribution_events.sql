-- Per-event distribution table — populated by the publish flow when a coach
-- saves their review of Gemini's distribution candidates. Distinct from the
-- per-half aggregates already stored on matches.dist_* columns (which are
-- populated by pitchside manual logging).
--
-- Schema mirrors prompts/distribution.md so a Gemini event can be inserted
-- nearly 1:1 with light coercion (string "true"/"false"/"unclear" → boolean
-- nullable; null = unclear).
--
-- One row per distribution event; coach_id and keeper_id are denormalized for
-- query efficiency at the dashboard layer (avoids joining matches every read).

create table if not exists public.distribution_events (
  id                  uuid primary key default gen_random_uuid(),
  match_id            uuid not null references public.matches(id) on delete cascade,
  keeper_id           uuid references public.keepers(id) on delete set null,
  coach_id            uuid not null references public.profiles(id) on delete cascade,
  org_id              uuid,

  -- When in the match
  timestamp_seconds   integer,
  minute              integer,
  half                text,             -- 'H1' | 'H2' | 'ET' | null
  match_clock         text,             -- "MM:SS" or 'not_visible'

  -- What happened (see prompts/distribution.md for the controlled vocabulary)
  trigger             text,             -- goal_kick / after_save / backpass / loose_ball / throw_in_to_gk / free_kick_to_gk
  type                text,             -- gk_short / gk_long / throw / pass / drop_kick
  successful          boolean,          -- null = "unclear"
  under_pressure      boolean,
  pass_selection      text,             -- short_to_defender / sideways_across_back / long_to_forward / switch_wide / backwards_under_pressure / clearance_under_pressure / drilled_into_channel / null
  direction           text,             -- left / centre / right / backwards
  receiver            text,             -- defender / midfielder / forward / out_of_play / opponent
  first_touch         text,             -- clean / heavy / two_touches / mishit / null
  notes               text,
  confidence          text,             -- high / medium / low — from Gemini, retained for review-quality filtering

  -- Audit
  source              text not null default 'video',  -- 'video' (Gemini) | 'pitchside' (manual, future)
  created_at          timestamptz not null default now(),

  constraint distribution_events_trigger_chk
    check (trigger is null or trigger in
      ('goal_kick','after_save','backpass','loose_ball','throw_in_to_gk','free_kick_to_gk')),
  constraint distribution_events_type_chk
    check (type is null or type in
      ('gk_short','gk_long','throw','pass','drop_kick')),
  constraint distribution_events_half_chk
    check (half is null or half in ('H1','H2','ET')),
  constraint distribution_events_source_chk
    check (source in ('video','pitchside','manual'))
);

create index if not exists distribution_events_match_id_idx       on public.distribution_events(match_id);
create index if not exists distribution_events_keeper_id_idx      on public.distribution_events(keeper_id) where keeper_id is not null;
create index if not exists distribution_events_coach_id_idx       on public.distribution_events(coach_id);
create index if not exists distribution_events_match_ts_idx       on public.distribution_events(match_id, timestamp_seconds);
create index if not exists distribution_events_org_id_idx         on public.distribution_events(org_id) where org_id is not null;

-- ============================================================================
-- RLS — coach owns rows; delegates inherit via dashboard_keepers (consistent
-- with shot_events / goals_conceded patterns).
-- No DELETE policy: history is immutable. Edits go through UPDATE only.
-- ============================================================================

alter table public.distribution_events enable row level security;

create policy distribution_events_select_coach
  on public.distribution_events for select
  using (auth.uid() = coach_id);

create policy distribution_events_select_delegate
  on public.distribution_events for select
  using (
    exists (
      select 1 from public.delegates d
      where d.delegate_user_id = auth.uid()
        and d.coach_id = distribution_events.coach_id
        and d.dashboard_access = true
        and (
          d.dashboard_keepers is null
          or distribution_events.keeper_id = any (d.dashboard_keepers)
        )
    )
  );

create policy distribution_events_insert_coach
  on public.distribution_events for insert
  with check (auth.uid() = coach_id);

create policy distribution_events_update_coach
  on public.distribution_events for update
  using (auth.uid() = coach_id)
  with check (auth.uid() = coach_id);
