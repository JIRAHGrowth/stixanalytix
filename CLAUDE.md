# StixAnalytix

Goalkeeper coaching analytics platform. Coaches log matches pitchside on mobile, then review performance data on a dashboard.

## Tech Stack
- **Framework:** Next.js 14.2.5 (App Router, all client components)
- **Language:** JavaScript (JSX, no TypeScript)
- **Backend:** Supabase (PostgreSQL + Auth + RLS)
- **Hosting:** Vercel (auto-deploys from `main` branch)
- **Charts:** Recharts
- **Styling:** Inline styles (no CSS framework)

## Key Commands
- `npm run dev` — local dev server at localhost:3000
- `npm run build` — production build (same as what Vercel runs)
- `git push origin main` — triggers Vercel deploy (~30s)

## Project Structure
```
app/
  dashboard/page.jsx    — Main analytics dashboard (~2500 lines)
  pitchside/page.jsx    — Mobile match logging (~1400 lines)
  login/page.jsx        — Email/password auth
  signup/page.jsx       — New account creation
  onboarding/page.jsx   — First-time club setup
  forgot-password/      — Password reset request
  reset-password/       — New password form
  staff/page.jsx        — Delegate management
  auth/callback/        — Supabase auth callback (server route)
  api/create-delegate/  — Delegate creation (server route)
  api/clear-session/    — Session cleanup (server route)
context/
  AuthContext.jsx       — Auth state provider (user, profile, club, delegate)
lib/
  supabase-browser.js   — Browser Supabase client
  supabase-server.js    — Server Supabase client (cookies)
  supabase-admin.js     — Service role client (admin operations)
middleware.js           — Auth guard for protected routes
```

## Environment Variables
Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://lmwbvkyqyhagqegewnyd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from Supabase dashboard>
SUPABASE_SERVICE_ROLE_KEY=<from Supabase dashboard>
```

## Database (Supabase)
Project ID: `lmwbvkyqyhagqegewnyd`
Dashboard: https://supabase.com/dashboard/project/lmwbvkyqyhagqegewnyd

Tables: profiles, clubs, keepers, delegates, matches, goals_conceded, shot_events, match_attributes, match_rankings, match_notes

All tables use RLS. Coach policies use `auth.uid() = coach_id`. Delegate policies check the `delegates` table for permissions.

## Auth Model
- Coaches sign up → create profile → onboarding (club + first keeper)
- Delegates are invited by coaches via /staff → get limited access
- Delegate access controlled by: pitchside_keepers[], dashboard_keepers[], dashboard_access boolean

## Key Patterns
- AuthContext provides: user, profile, club, supabase, isDelegate, delegateOf
- Club queries use `.limit(1)` not `.single()` (coach may have multiple clubs)
- Match IDs generated client-side with `crypto.randomUUID()` before insert
- Pitchside save flow: events → handleEndGame() → attributes screen → saveToDatabase()
- Dashboard computes all stats client-side from raw match/goal/attr data

## Important Constraints
- All pages are "use client" — no server components currently
- dashboard/page.jsx and pitchside/page.jsx are large single-file components
- Inline styles everywhere — no CSS files or Tailwind
- Vercel deploys on every push to main — broken code goes live immediately
- `.env.local` must never be committed (it's in .gitignore)

## Deployment
- GitHub repo: https://github.com/JIRAHGrowth/stixanalytix
- Vercel project: stixanalytix (team: jj-marshs-projects)
- Live URL: https://www.stixanalytix.com
- Builds take ~30 seconds
