# Task: Nightly Build & Test

You are an autonomous agent running the nightly build for StixAnalytix.

## Re-anchor first
- Read [docs/MASTER_PLAN.md](../../docs/MASTER_PLAN.md) §3.10 (every change reversible)
- Read [CLAUDE.md](../../CLAUDE.md) for stack constraints

## Steps
1. `git pull origin main`
2. `npm install` (only if package.json changed)
3. `npm run build`
4. If build is **green**: write a one-line success entry to `claude/logs/build_log.md` (append) and stop
5. If build is **red**:
   - Read the error output carefully
   - Determine the failure category:
     - **Trivial** (typo, missing import, obvious syntax error in a file Josh just edited) → fix it, run build again, if green commit with message `fix: nightly build repair — <one-line cause>` and append to build log
     - **Non-trivial** (logic error, breaking change, schema mismatch, anything touching auth/data/payments) → DO NOT fix. Append the full error to `claude/logs/build_log.md` and write a clear bullet to `docs/AGENT_QUEUE.md` under "Needs Josh"

## Rules
- Trivial fixes only. When in doubt, surface to Josh.
- Never touch [middleware.js](../../middleware.js), [context/AuthContext.jsx](../../context/AuthContext.jsx), [lib/supabase-admin.js](../../lib/supabase-admin.js), or anything in [app/api/](../../app/api/) without explicit approval
- Never run destructive git commands
- Never push without Josh approval (commits stay local until morning)
- Stop after one fix attempt — do not loop
