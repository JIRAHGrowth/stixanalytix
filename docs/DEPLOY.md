# StixAnalytix Deployment

## Pipeline

```
Push to main on GitHub
       |
Vercel detects push, runs `next build`
       |
Build succeeds (~30s) --> deployed to production
Build fails --> previous deployment stays live
       |
Live at stixanalytix.com
```

## Key Links

| What | URL |
|------|-----|
| Live app | https://www.stixanalytix.com |
| GitHub repo | https://github.com/JIRAHGrowth/stixanalytix |
| Vercel deployments | https://vercel.com/jj-marshs-projects/stixanalytix/deployments |
| Supabase dashboard | https://supabase.com/dashboard/project/lmwbvkyqyhagqegewnyd |

## Vercel Project

- **Project name:** stixanalytix
- **Team:** jj-marshs-projects
- **Framework:** Next.js (auto-detected)
- **Build command:** `next build`
- **Output directory:** `.next`

## Environment Variables (Vercel)

Set via Vercel dashboard > Settings > Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

These must match your local `.env.local` values.

## How to Deploy

Just push to `main`:

```bash
git add .
git commit -m "description of change"
git push origin main
```

Vercel auto-deploys within ~30 seconds.

## Important Notes

- **No staging environment** -- pushes to main go directly to production
- **No CI checks** beyond the Vercel build itself (no tests, no linting)
- **No preview deployments** for PRs (single-branch workflow)
- If a build fails, the previous deployment stays live -- nothing breaks
- If broken code passes the build, it goes live immediately -- test locally with `npm run build` first
