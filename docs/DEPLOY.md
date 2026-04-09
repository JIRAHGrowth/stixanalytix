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

## Integrator (Claude Agent Layer)

StixAnalytix runs a small "integrator" layer of Claude agents that push work forward outside Josh's working hours. See:

- [../claude/README.md](../claude/README.md) — overview
- [../claude/tasks/](../claude/tasks/) — task templates
- [../MORNING_BRIEF.md](../MORNING_BRIEF.md) — daily output for Josh
- [AGENT_QUEUE.md](AGENT_QUEUE.md) — shared inbox

Recurring jobs are scheduled in one of two ways:

1. **Session-local cron** — set up via `CronCreate` inside a Claude Code session. Only fires while the REPL is active. Good for "while I'm working" automation.
2. **GitHub Actions cron** — runs in the cloud regardless of laptop state. Best fit for nightly build, morning brief, competitor watch. Requires committing a workflow file under `.github/workflows/` and a `CLAUDE_API_KEY` secret in repo settings.

True 24/7 operation requires path #2. See [MASTER_PLAN.md](MASTER_PLAN.md) §6 for guardrails.
