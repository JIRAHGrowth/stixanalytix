# StixAnalytix Architecture

## Overview

StixAnalytix is a goalkeeper coaching analytics platform. It has two main surfaces:

1. **Pitchside Logger** (`/pitchside`) — a mobile-optimized interface used during matches to track every shot, save, goal, cross, distribution event, and more in real-time
2. **Analytics Dashboard** (`/dashboard`) — a desktop/tablet interface for reviewing keeper performance across matches, generating reports, and managing roster

## User Roles

### Coach (primary user)
- Full access to everything
- Creates account, sets up club, adds keepers
- Logs matches pitchside or reviews on dashboard
- Can invite delegates

### Delegate (secondary user)
- Invited by a coach via the /staff page
- Two access dimensions:
  - **pitchside_keepers[]** — which keepers they can log matches for
  - **dashboard_keepers[]** + **dashboard_access** — which keepers they can view on dashboard
- Roles: gk_parent, goalkeeper, assistant_coach

## Database Schema

### Core Tables

**profiles** — One per auth user
- id (uuid, PK, matches auth.users.id)
- full_name, email, role, tier
- onboarding_complete (boolean)

**clubs** — One per coach (can have multiple)
- id, coach_id → profiles.id
- name, primary_color, secondary_color, logo_url

**keepers** — Goalkeepers managed by a coach
- id, club_id → clubs.id, coach_id → profiles.id
- name, number, catch_hand, role, date_of_birth, active

**delegates** — Access grants from coach to another user
- id, coach_id, delegate_user_id
- pitchside_keepers[] (uuid array), dashboard_keepers[] (uuid array)
- dashboard_access (boolean), status, role

### Match Data Tables

**matches** — One row per match/training session
- Core: id, coach_id, keeper_id, club_id, logged_by
- Match info: session_type, opponent, venue, match_date, result
- Aggregate stats: goals_for, goals_against, shots_on_target, saves, goals_conceded
- Save breakdown: saves_catch, saves_parry, saves_dive, saves_block, saves_tip, saves_punch
- Crosses: crosses_claimed, crosses_punched, crosses_missed, crosses_total
- Distribution: dist_gk_short_att/suc, dist_gk_long_att/suc, dist_throws_att/suc, dist_passes_att/suc, dist_under_pressure_att/suc
- 1v1: one_v_one_faced, one_v_one_won
- Sweeper: sweeper_clearances, sweeper_interceptions, sweeper_tackles
- Rebounds: rebounds_controlled, rebounds_dangerous
- Other: half_data (JSONB), notes, was_subbed, sub_reason, sub_minute, minutes_played

**goals_conceded** — One row per goal conceded
- match_id, coach_id
- goal_zone, shot_origin, goal_source, goal_rank, shot_type, gk_positioning
- half, minute

**shot_events** — One row per shot faced (saves + goals + off target)
- match_id, keeper_id, coach_id
- shot_origin, gk_action, goal_zone, is_goal, is_off_target, shot_type, event_type, half

**match_attributes** — Subjective ratings (1-5 scale, 15 attributes)
- match_id, keeper_id, coach_id
- game_rating, shot_stopping, handling, positioning, aerial_dominance, distribution, decision_making, sweeper_play, set_piece_org, footwork_agility, reaction_speed, communication, command_of_box, composure, compete_level

**match_rankings** — Same 15 attributes, submitted independently by coach and keeper
- Same columns as match_attributes + author_id, author_role
- Unique constraint: match_id + keeper_id + author_role
- "Blind submit" pattern: both submit separately, unlocked when both done (or after 3 days)

**match_notes** — Free-text notes per match
- Same blind-submit pattern as rankings
- match_id, keeper_id, coach_id, author_id, author_role, note_text

## Row Level Security (RLS)

Every table has RLS enabled. The pattern:

- **Coach policies:** `auth.uid() = coach_id` for SELECT/INSERT/UPDATE/DELETE
- **Delegate policies:** JOIN to `delegates` table, check status = 'active', then check keeper arrays
- **Logged-by policy:** On matches table, `logged_by = auth.uid()` allows reading matches you personally logged

Key detail: delegate INSERT on matches checks `pitchside_keepers`, while delegate SELECT checks either `pitchside_keepers` OR `dashboard_keepers` (with dashboard_access for the latter).

## Auth Flow

1. Signup → creates auth user + profile (via Supabase trigger)
2. Login → redirects to /dashboard (or /onboarding if not complete)
3. Password reset → /forgot-password → email → /auth/callback?type=recovery → /reset-password
4. Delegate invite → coach creates delegate record + Supabase auth user → delegate gets email

## Deployment Pipeline

```
Developer pushes to main on GitHub
       ↓
Vercel detects push, runs `next build`
       ↓
Build succeeds (~30s) → deployed to production
Build fails → previous deployment stays live
       ↓
Live at stixanalytix.com
```

No staging environment. No tests. No CI checks beyond the build. This is a known gap.

## Known Technical Debt

1. **Large single-file components** — dashboard (2500+ lines) and pitchside (1400+ lines) should be split into smaller components
2. **No TypeScript** — entire codebase is JavaScript
3. **No tests** — no unit, integration, or e2e tests
4. **No staging environment** — pushes to main go directly to production
5. **Inline styles everywhere** — no CSS modules, Tailwind, or styled-components
6. **Multiple clubs per coach** — the data model allows it but the UI doesn't have a club selector
7. **No error boundaries** — React errors crash the whole page with a generic Next.js error screen
