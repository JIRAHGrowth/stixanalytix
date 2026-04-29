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
