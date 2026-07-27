/**
 * Trigger the Modal video worker for a queued video_jobs row.
 *
 * Required env: MODAL_TRIGGER_URL, MODAL_TRIGGER_SECRET. Both are set after
 * `modal deploy worker/app.py` (the URL is printed in deploy output and stays
 * stable across redeploys). The secret is created in the Modal dashboard
 * `stix-env` secret AND mirrored into `.env.local` for Next.js.
 *
 * Returns null on success, or an error string the caller can surface.
 */
export async function triggerWorker(jobId) {
  const url = process.env.MODAL_TRIGGER_URL;
  const secret = process.env.MODAL_TRIGGER_SECRET;
  if (!url || !secret) {
    return 'Worker not configured: set MODAL_TRIGGER_URL and MODAL_TRIGGER_SECRET in .env.local';
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Trigger-Secret': secret,
      },
      body: JSON.stringify({ job_id: jobId }),
    });
    const text = await res.text();
    if (!res.ok) {
      return `Worker trigger failed (${res.status}): ${text.slice(0, 300)}`;
    }
    // Defense in depth: a misbehaving endpoint can return 200 with an error body.
    // If we don't see a modal_call_id, treat it as a failure.
    try {
      const body = JSON.parse(text);
      if (!body.modal_call_id) {
        return `Worker trigger returned 200 but no modal_call_id: ${text.slice(0, 300)}`;
      }
    } catch {
      return `Worker trigger returned non-JSON body: ${text.slice(0, 300)}`;
    }
    return null;
  } catch (err) {
    return `Worker trigger network error: ${err.message || err}`;
  }
}

/**
 * Trigger backfill_clips_from_events for a match that was just published.
 * Reads DB event rows (goals_conceded / shot_events / distribution_events /
 * cross_events / sweeper_events / one_v_one_events), slices a fresh clip
 * at each event's persisted timestamp, and updates clip_storage_path on
 * every row. Uses the event's UUID as a stable clip filename suffix.
 *
 * Called from the publish route as fire-and-forget after the match commits.
 * Guarantees that coach-added events (NULL clip at insert time) AND
 * coach-edited-timestamp events (potentially wrong clip at insert time)
 * end up pointing at the correct video slice for what the DB says happened.
 *
 * `force=true` re-slices every event even if it already has a clip path.
 * Use for backfilling historical matches published before this wiring
 * existed. Default is force=false, which only fills the NULLs — the
 * safe / fast path for new publishes where most clips are already correct.
 *
 * Returns null on success, or an error string the caller can log.
 */
export async function triggerBackfillClipsFromEvents(matchId, { force = false } = {}) {
  const url = process.env.MODAL_BACKFILL_CLIPS_TRIGGER_URL;
  const secret = process.env.MODAL_TRIGGER_SECRET;
  if (!url || !secret) {
    return 'Backfill trigger not configured: set MODAL_BACKFILL_CLIPS_TRIGGER_URL and MODAL_TRIGGER_SECRET in .env.local';
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Trigger-Secret': secret,
      },
      body: JSON.stringify({ match_id: matchId, force }),
    });
    const text = await res.text();
    if (!res.ok) {
      return `Backfill trigger failed (${res.status}): ${text.slice(0, 300)}`;
    }
    try {
      const body = JSON.parse(text);
      if (!body.modal_call_id) {
        return `Backfill trigger returned 200 but no modal_call_id: ${text.slice(0, 300)}`;
      }
    } catch {
      return `Backfill trigger returned non-JSON body: ${text.slice(0, 300)}`;
    }
    return null;
  } catch (err) {
    return `Backfill trigger network error: ${err.message || err}`;
  }
}
