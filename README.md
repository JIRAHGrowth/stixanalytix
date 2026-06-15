# StixAnalytix

Soccer Goalkeeper Coaching Intelligence Platform

Built with Next.js, Supabase, and Recharts.

## Setup

1. Create a Supabase project at supabase.com
2. Run `supabase-schema.sql` in the Supabase SQL Editor
3. Add environment variables to `.env.local` (see `.env.example`). Then push them to Vercel:

```powershell
$env:VERCEL_TOKEN = "<paste>"
node scripts/setup-vercel-env.js
```

4. Deploy via Vercel

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Database:** Supabase (Postgres)
- **Auth:** Supabase Auth
- **Charts:** Recharts
- **Hosting:** Vercel
