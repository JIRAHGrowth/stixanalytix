-- Phase 0 foundations: video_jobs table + org_id on tenant-scoped tables.
--
-- video_jobs  — async work queue for the video→stats pipeline.
--   One row per processing attempt. Idempotency key = (match_id, version).
--   status transitions: queued → running → done | failed | retrying
--
-- org_id      — nullable uuid on every tenant-scoped table. No FK yet (orgs
--   table doesn't exist). Adding it nullable now avoids a future backfill
--   when we introduce multi-tenant orgs. Safe because all current code
--   scopes on coach_id.

-- ============================================================================
-- 1. video_jobs table
-- ============================================================================

create table if not exists public.video_jobs (
  id              uuid primary key default gen_random_uuid(),
  match_id        uuid not null references public.matches(id) on delete cascade,
  coach_id        uuid not null references public.profiles(id) on delete cascade,
  org_id          uuid,
  version         integer not null default 1,
  status          text   not null default 'queued'
                    check (status in ('queued','running','done','failed','retrying')),
  video_url       text,
  gemini_output   jsonb,
  error_message   text,
  retry_count     integer not null default 0,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (match_id, version)
);

create index if not exists video_jobs_coach_id_idx   on public.video_jobs(coach_id);
create index if not exists video_jobs_match_id_idx   on public.video_jobs(match_id);
create index if not exists video_jobs_status_idx     on public.video_jobs(status);
create index if not exists video_jobs_created_at_idx on public.video_jobs(created_at desc);

alter table public.video_jobs enable row level security;

-- Coach can see/insert/update their own jobs. Never DELETE (per MASTER_PLAN §3).
create policy video_jobs_select_own
  on public.video_jobs for select
  using (auth.uid() = coach_id);

create policy video_jobs_insert_own
  on public.video_jobs for insert
  with check (auth.uid() = coach_id);

create policy video_jobs_update_own
  on public.video_jobs for update
  using (auth.uid() = coach_id)
  with check (auth.uid() = coach_id);

-- Auto-bump updated_at on row change.
create or replace function public.video_jobs_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists video_jobs_updated_at on public.video_jobs;
create trigger video_jobs_updated_at
  before update on public.video_jobs
  for each row execute function public.video_jobs_set_updated_at();

-- ============================================================================
-- 2. org_id columns on tenant-scoped tables
-- ============================================================================

alter table public.profiles         add column if not exists org_id uuid;
alter table public.clubs            add column if not exists org_id uuid;
alter table public.keepers          add column if not exists org_id uuid;
alter table public.delegates        add column if not exists org_id uuid;
alter table public.matches          add column if not exists org_id uuid;
alter table public.goals_conceded   add column if not exists org_id uuid;
alter table public.shot_events      add column if not exists org_id uuid;
alter table public.match_attributes add column if not exists org_id uuid;
alter table public.match_rankings   add column if not exists org_id uuid;
alter table public.match_notes      add column if not exists org_id uuid;

create index if not exists profiles_org_id_idx         on public.profiles(org_id)         where org_id is not null;
create index if not exists clubs_org_id_idx            on public.clubs(org_id)            where org_id is not null;
create index if not exists keepers_org_id_idx          on public.keepers(org_id)          where org_id is not null;
create index if not exists delegates_org_id_idx        on public.delegates(org_id)        where org_id is not null;
create index if not exists matches_org_id_idx          on public.matches(org_id)          where org_id is not null;
create index if not exists goals_conceded_org_id_idx   on public.goals_conceded(org_id)   where org_id is not null;
create index if not exists shot_events_org_id_idx      on public.shot_events(org_id)      where org_id is not null;
create index if not exists match_attributes_org_id_idx on public.match_attributes(org_id) where org_id is not null;
create index if not exists match_rankings_org_id_idx   on public.match_rankings(org_id)   where org_id is not null;
create index if not exists match_notes_org_id_idx      on public.match_notes(org_id)      where org_id is not null;
