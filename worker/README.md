# StixAnalytix Video Worker

Modal-hosted video processing pipeline. Phase 1 of the upload pipeline: takes a `video_jobs` row created by the Next.js `/upload` flow, downloads the source video, runs Gemini against [`prompts/goals.md`](../prompts/goals.md) with team-colour variables substituted in, writes the structured output to `gemini_output`, and parks the job at `status='review_needed'` for the coach to review and publish via the dashboard.

See [docs/MASTER_PLAN.md](../docs/MASTER_PLAN.md) §3.1 for why this lives outside the Next.js app.

## One-time setup

1. `pip install -r worker/requirements.txt`
2. `python -m modal setup` — browser auth, ~1 min.
3. Create a Modal secret named **`stix-env`** in the dashboard with:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL` (optional, defaults to `gemini-2.5-pro`)
   - `MODAL_TRIGGER_SECRET` — generate with `python -c "import secrets;print(secrets.token_urlsafe(32))"`. The Next.js API route presents this in the `X-Trigger-Secret` header; the Modal endpoint rejects unmatched values.

## Deploy

```bash
modal deploy worker/app.py
```

The deploy output prints the public URL of the `trigger` web endpoint — looks like `https://<workspace>--stixanalytix-worker-trigger.modal.run`. Copy it into `.env.local` as:

```
MODAL_TRIGGER_URL=https://<workspace>--stixanalytix-worker-trigger.modal.run
MODAL_TRIGGER_SECRET=<the same value you put in the stix-env Modal secret>
```

Both variables are required for the upload flow to work. Without them, `POST /api/video-jobs` will mark new jobs as failed with a "Worker not configured" message.

## How it runs end-to-end

1. Coach fills in `/upload` form → POST `/api/video-jobs`.
2. The API route inserts a `video_jobs` row (status='queued') and POSTs `{ job_id }` to the Modal trigger URL.
3. Modal `trigger` validates `X-Trigger-Secret`, then `process.spawn(job_id)` and returns immediately.
4. `process` flips status to `analyzing`, downloads the video, uploads it to Gemini Files API (resumable), runs `prompts/goals.md` with `{{my_team_color}}` / `{{my_keeper_color}}` / `{{opponent_color}}` substituted from `match_metadata`, and writes the parsed JSON to `gemini_output` with status='review_needed'.
5. The coach opens `/upload/[jobId]/review`, accepts/edits/rejects candidate goals, hits Save & Publish.
6. POST `/api/video-jobs/[id]/publish` writes `matches` + `goals_conceded` rows and sets `published_match_id`. The match appears in the dashboard.

## Manual invoke (debug only)

```bash
modal run worker/app.py::process --job-id <uuid>
```

Useful for re-processing without recreating the row, or for a job that was created another way (e.g. `worker/enqueue.py`, the legacy CLI path).

## Phase 1 scope (currently in)

- Goal candidates only (uses `prompts/goals.md`)
- URL-only video source (no in-app file upload)
- Coach review required before anything reaches `matches`
- Source URL stored on the published match for deep-link-back

## Out of scope until later phases

- Saves on target / shot location (Phase 2)
- Cross/corner outcomes (Phase 3)
- Distribution success/fail (Phase 4)
- Sweeper / rebound / 1v1 / errors (Phase 5)
- Video file upload + R2 storage (held until coaches need in-app review)
- Auto-clip extraction (rides on R2)
