import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { triggerWorker } from '@/lib/modal-trigger';

async function authedJob(supabase, id) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated', status: 401 };
  const { data, error } = await supabase
    .from('video_jobs').select('*').eq('id', id).single();
  if (error || !data) return { error: 'Job not found', status: 404 };
  if (data.coach_id !== user.id) return { error: 'Forbidden', status: 403 };
  return { user, job: data };
}

export async function GET(_req, { params }) {
  const supabase = await createClient();
  const { id } = await params;
  const r = await authedJob(supabase, id);
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status });

  // Signed URLs are minted at 2-hour TTL when the video is first uploaded.
  // Any subsequent visit to the review screen is almost certainly past that
  // window, so re-mint here for in-browser playback. The DB copy is left as
  // the original (audit trail); we only override the response payload.
  let job = r.job;
  const admin = createAdminClient();

  if (job.storage_path) {
    const { data: signed, error: signErr } = await admin.storage
      .from('match-videos').createSignedUrl(job.storage_path, 7200);
    if (!signErr && signed?.signedUrl) {
      job = { ...job, video_url: signed.signedUrl };
    }
  }

  // Per-event clip URLs. The worker stores clip_storage_path on each event
  // in gemini_output; we batch-sign them here so the review UI can play each
  // clip directly instead of seeking inside a multi-GB source file.
  const out = job.gemini_output || null;
  if (out) {
    const goals = out.parsed?.goals || [];
    const saves = out.saves?.parsed?.saves || [];
    const dist = out.distribution?.parsed?.distribution || [];
    const collect = [];
    [goals, saves, dist].forEach(arr => arr.forEach(e => {
      if (e?.clip_storage_path) collect.push(e.clip_storage_path);
    }));
    if (collect.length > 0) {
      const { data: signedList, error: bulkErr } = await admin.storage
        .from('match-videos').createSignedUrls(collect, 7200);
      if (!bulkErr && Array.isArray(signedList)) {
        const urlByPath = {};
        signedList.forEach(s => { if (s?.path && s?.signedUrl) urlByPath[s.path] = s.signedUrl; });
        const attach = (arr) => arr.forEach(e => {
          if (e?.clip_storage_path && urlByPath[e.clip_storage_path]) {
            e.clip_url = urlByPath[e.clip_storage_path];
          }
        });
        attach(goals); attach(saves); attach(dist);
        // gemini_output was mutated in place — already wired through `job`.
      }
    }
  }

  return NextResponse.json({ job });
}

// Soft discard (sets status='failed' with reason). Hard delete is intentionally
// not exposed so we keep an audit trail for cost reporting later.
export async function DELETE(_req, { params }) {
  const supabase = await createClient();
  const { id } = await params;
  const r = await authedJob(supabase, id);
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status });
  if (r.job.status === 'published') {
    return NextResponse.json({ error: 'Cannot discard a published job' }, { status: 400 });
  }
  const admin = createAdminClient();
  const { error } = await admin.from('video_jobs').update({
    status: 'failed',
    error_message: 'Discarded by coach',
    finished_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Refcount-aware storage cleanup: only remove the file if NO other video_jobs
  // row references the same storage_path. Multiple jobs can share an upload
  // session — historically published rows sometimes share a path with TEST
  // attempts that re-used the same uploaded video. Blind deletion here would
  // orphan those other rows (we've already paid the cost of this once — see
  // the May-22 retention recovery in commit history).
  if (r.job.storage_path) {
    const { count, error: cntErr } = await admin
      .from('video_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('storage_path', r.job.storage_path)
      .neq('id', id);
    if (cntErr) {
      // Be conservative on count failure — leave the storage file alone.
      console.warn('refcount check failed, leaving storage in place:', cntErr.message);
    } else if (count === 0) {
      admin.storage.from('match-videos').remove([r.job.storage_path]).catch(() => {});
    }
    // count > 0: other rows still reference this storage_path; do nothing.
  }
  return NextResponse.json({ ok: true });
}

// Retry: only allowed if currently failed. Resets state and re-triggers worker.
export async function POST(_req, { params }) {
  const supabase = await createClient();
  const { id } = await params;
  const r = await authedJob(supabase, id);
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status });
  if (r.job.status !== 'failed') {
    return NextResponse.json({ error: `Cannot retry a job in status '${r.job.status}'` }, { status: 400 });
  }
  const admin = createAdminClient();

  // If the original upload was to Supabase Storage, the signed URL has likely
  // expired (we mint them at 2-hour TTL). Regenerate before retry.
  let videoUrl = r.job.video_url;
  if (r.job.storage_path) {
    const { data: signed, error: signErr } = await admin.storage
      .from('match-videos').createSignedUrl(r.job.storage_path, 7200);
    if (signErr || !signed?.signedUrl) {
      return NextResponse.json({
        error: `Could not regenerate signed URL: ${signErr?.message || 'unknown'}. The uploaded file may have been deleted — re-upload from the form.`,
      }, { status: 400 });
    }
    videoUrl = signed.signedUrl;
  }

  await admin.from('video_jobs').update({
    status: 'queued',
    video_url: videoUrl,
    error_message: null,
    started_at: null,
    finished_at: null,
  }).eq('id', id);

  const triggerError = await triggerWorker(id);
  if (triggerError) {
    await admin.from('video_jobs').update({
      status: 'failed',
      error_message: triggerError,
      finished_at: new Date().toISOString(),
    }).eq('id', id);
    return NextResponse.json({ error: triggerError }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
