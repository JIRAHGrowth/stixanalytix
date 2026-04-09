# StixAnalytix Database

## Supabase Project

- **Project ID:** `lmwbvkyqyhagqegewnyd`
- **Dashboard:** https://supabase.com/dashboard/project/lmwbvkyqyhagqegewnyd
- **Region:** (check Supabase dashboard > Settings > General)

## Tables

### Core Tables

| Table | Purpose | Key columns |
|-------|---------|-------------|
| profiles | One per auth user | id (= auth.users.id), full_name, email, role, tier, onboarding_complete |
| clubs | One per coach | id, coach_id, name, primary_color, secondary_color, logo_url |
| keepers | Goalkeepers managed by a coach | id, club_id, coach_id, name, number, catch_hand, role, date_of_birth, active |
| delegates | Access grants from coach to another user | id, coach_id, delegate_user_id, pitchside_keepers[], dashboard_keepers[], dashboard_access, status, role |

### Match Data Tables

| Table | Purpose | Key columns |
|-------|---------|-------------|
| matches | One row per match/training session | id, coach_id, keeper_id, club_id, logged_by, session_type, opponent, venue, match_date, result, + aggregate stats |
| goals_conceded | One row per goal conceded | match_id, coach_id, goal_zone, shot_origin, goal_source, goal_rank, shot_type, gk_positioning, half, minute |
| shot_events | One row per shot faced | match_id, keeper_id, coach_id, shot_origin, gk_action, goal_zone, is_goal, is_off_target, shot_type, event_type, half |
| match_attributes | Subjective ratings (1-5 scale, 15 attributes) | match_id, keeper_id, coach_id, game_rating + 14 skill attributes |
| match_rankings | Same 15 attributes, blind-submit by coach and keeper | match_id, keeper_id, author_id, author_role + 15 skill attributes |
| match_notes | Free-text notes, blind-submit pattern | match_id, keeper_id, coach_id, author_id, author_role, note_text |

## Row Level Security (RLS)

All tables have RLS enabled.

- **Coach policies:** `auth.uid() = coach_id` for SELECT/INSERT/UPDATE/DELETE
- **Delegate policies:** JOIN to `delegates` table, check `status = 'active'`, then check keeper arrays
- **Logged-by policy:** On `matches` table, `logged_by = auth.uid()` allows reading matches you personally logged

Delegate INSERT on matches checks `pitchside_keepers`, while delegate SELECT checks either `pitchside_keepers` OR `dashboard_keepers` (with `dashboard_access` for the latter).

## Relationships

```
profiles ──< clubs ──< keepers
    │                     │
    │                     ├──< matches ──< goals_conceded
    │                     │            ──< shot_events
    │                     │            ──< match_attributes
    │                     │            ──< match_rankings
    │                     │            ──< match_notes
    │
    └──< delegates
```

## Key Patterns

- Match IDs are generated client-side with `crypto.randomUUID()` before insert
- `profiles.id` always matches `auth.users.id` (set by a Supabase trigger on signup)
- Club queries use `.limit(1)` not `.single()` because a coach may have multiple clubs
- The "blind submit" pattern on rankings/notes: both coach and keeper submit independently, results unlocked when both are done (or after 3 days)
