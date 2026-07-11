import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';

// Coach review-page auto-save. Every ~2s of editing on
// /upload/[jobId]/review, the client debounces then POSTs the full
// candidate + saves + distribution + extraGoals + scoreOverride state
// here. We upsert it into video_jobs.review_draft (jsonb) with an
// updated_at timestamp so the mount can restore later.
//
// Contract: close tab / close browser / walk away 8 hours / come back —
// mount reads review_draft off the video_jobs row and every edit is
// exactly where you left it. localStorage is now a fallback for the
// offline case only, not the source of truth.
//
// Deliberately soft: we don't reject a draft POST on a published/failed
// job — the write happens, but the mount code decides what to do with
// it. Cheap to store, avoids client-server race arguments over "is this
// job still editable."

const MAX_DRAFT_BYTES = 512 * 1024; // 512 KB is comfortable for a 200-event match

async function authedJob(supabase, id) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated', status: 401 };
  const { data, error } = await supabase
    .from('video_jobs').select('id, coach_id, status').eq('id', id).single();
  if (error || !data) return { error: 'Job not found', status: 404 };
  if (data.coach_id !== user.id) return { error: 'Forbidden', status: 403 };
  return { user, job: data };
}

export async function POST(request, { params }) {
  const supabase = await createClient();
  const { id } = await params;
  const r = await authedJob(supabase, id);
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const draft = body?.draft;
  if (!draft || typeof draft !== 'object') {
    return NextResponse.json({ error: 'body.draft (object) is required' }, { status: 400 });
  }

  // Soft size guard — a 200-event match with all fields serializes to
  // ~50 KB, so 512 KB is 10× headroom. Anything larger is almost
  // certainly a client bug we want to fail loud on instead of writing.
  const size = JSON.stringify(draft).length;
  if (size > MAX_DRAFT_BYTES) {
    return NextResponse.json(
      { error: `Draft too large (${size} bytes; max ${MAX_DRAFT_BYTES})` },
      { status: 413 },
    );
  }

  const now = new Date().toISOString();
  const admin = createAdminClient();
  const { error } = await admin.from('video_jobs').update({
    review_draft: draft,
    review_draft_updated_at: now,
  }).eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ saved_at: now, bytes: size });
}

// DELETE clears the draft. Called by the review page after a successful
// publish so the next review of the same job starts clean (not that we
// re-open published jobs, but if a draft-restore happens on stale local
// state we don't want it clobbering the published output).
export async function DELETE(_req, { params }) {
  const supabase = await createClient();
  const { id } = await params;
  const r = await authedJob(supabase, id);
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status });

  const admin = createAdminClient();
  const { error } = await admin.from('video_jobs').update({
    review_draft: null,
    review_draft_updated_at: null,
  }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
