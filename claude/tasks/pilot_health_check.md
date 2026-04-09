# Task: Pilot Health Check

You are an autonomous agent monitoring the StixAnalytix video processing pipeline.

## Re-anchor first
- Read [docs/MASTER_PLAN.md](../../docs/MASTER_PLAN.md) §5 (current phase) — this task is meaningful only once Phase 0 is complete and the `video_jobs` table exists. If it doesn't exist yet, write "video_jobs table not yet created — health check skipped" to `claude/logs/pilot_health_log.md` and stop.

## Steps (once video_jobs exists)
1. Query Supabase: `SELECT status, count(*) FROM video_jobs WHERE created_at > now() - interval '24 hours' GROUP BY status`
2. Query: `SELECT id, match_id, error_message, retry_count, created_at FROM video_jobs WHERE status = 'failed' AND created_at > now() - interval '7 days' ORDER BY created_at DESC LIMIT 20`
3. For each failed job:
   - Categorize the error (network/timeout/Gemini-error/Claude-error/schema-mismatch/unknown)
   - If retry_count < 3 AND error is transient (network/timeout): mark for auto-retry by setting `status = 'queued'`
   - Otherwise: leave alone, surface to Josh
4. Append a structured summary to `claude/logs/pilot_health_log.md`:
   ```
   ## YYYY-MM-DD HH:MM
   - Total jobs (24h): N
   - Status breakdown: queued=N, running=N, done=N, failed=N
   - Auto-retried: N
   - Needs Josh: N
   - Top error categories: ...
   ```
5. If "Needs Josh" > 0, add a bullet to `docs/AGENT_QUEUE.md` under "Needs Josh"

## Rules
- Read-only on `matches`, `keepers`, `goals_conceded`, `shot_events` — never modify keeper data
- Only modify `video_jobs.status` for retries, never delete rows
- Never bypass RLS (use the service role only via the established admin client pattern)
- If you cannot connect to Supabase, log the error and stop — do not retry in a loop
