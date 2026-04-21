# StixAnalytix Video Worker

Modal-hosted video processing pipeline. See [docs/MASTER_PLAN.md](../docs/MASTER_PLAN.md) §3.1 for why this lives outside the Next.js app.

## One-time setup

1. `pip install -r worker/requirements.txt`
2. `python -m modal setup` — browser auth, ~1 min.
3. In the Modal dashboard, create a secret named **`stix-env`** with:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL` (optional, defaults to `gemini-2.5-flash`)

## Deploy

```bash
modal deploy worker/app.py
```

## Invoke (Phase 0 manual test)

If your test MP4 is on your laptop, first upload it to Supabase Storage to get a URL the Modal worker can reach:

```bash
python worker/upload_test_video.py path/to/match.mp4
# prints a signed URL — copy it
```

Then enqueue the job:

```bash
python worker/enqueue.py \
  --match-id <uuid of a matches row> \
  --coach-id <uuid of your profiles row> \
  --video-url <signed url from step above>
```

Then watch `video_jobs` in Supabase:

```sql
select id, status, error_message, gemini_output
from video_jobs
order by created_at desc
limit 5;
```

## What happens on invoke

1. `enqueue.py` inserts a `video_jobs` row with `status='queued'`.
2. `modal spawn` kicks off `process(job_id)`.
3. The worker flips status to `running`, downloads the MP4 to `/tmp`, uploads to Gemini Files API, generates JSON, writes to `gemini_output`, flips to `done`.
4. On exception: flips to `failed` with `error_message` and `retry_count++`.

## Phase 0 scope

This skeleton intentionally skips:
- Clip extraction (Phase 4)
- Multi-event taxonomy (Phase 2)
- Claude normalisation layer (Phase 1)
- R2 storage (Phase 0 uses the source `video_url` directly; storage abstraction lives in `lib/supabase-server.js` for Next.js and will move to R2 per MASTER_PLAN D2 trigger)

The goal is the Phase 0 gate: one MP4 → Gemini returns JSON → row in Supabase.
