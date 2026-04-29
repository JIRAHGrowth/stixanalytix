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
  return NextResponse.json({ job: r.job });
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

  // Clean up the uploaded file. We don't surface errors here — orphaned files
  // are cheap and the lifecycle policy will eventually catch them.
  if (r.job.storage_path) {
    admin.storage.from('match-videos').remove([r.job.storage_path]).catch(() => {});
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
  await admin.from('video_jobs').update({
    status: 'queued',
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
