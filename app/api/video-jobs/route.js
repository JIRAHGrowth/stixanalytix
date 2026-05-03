import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { triggerWorker } from '@/lib/modal-trigger';

const REQUIRED_FIELDS = [
  'keeper_id', 'club_id', 'match_date', 'session_type', 'video_url',
  'my_team_color', 'opponent_color', 'my_keeper_color',
];

export async function POST(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await request.json();
    const missing = REQUIRED_FIELDS.filter(k => !body[k]);
    if (missing.length) {
      return NextResponse.json({ error: `Missing fields: ${missing.join(', ')}` }, { status: 400 });
    }
    if (body.session_type !== 'training' && (!body.opponent || !body.venue)) {
      return NextResponse.json({ error: 'Match/Friendly requires opponent and venue' }, { status: 400 });
    }
    try { new URL(body.video_url); }
    catch { return NextResponse.json({ error: 'video_url is not a valid URL' }, { status: 400 }); }

    // Verify keeper belongs to this coach (defense in depth on top of RLS)
    const admin = createAdminClient();
    const { data: keeper, error: keeperErr } = await admin
      .from('keepers')
      .select('id, coach_id, club_id')
      .eq('id', body.keeper_id)
      .single();
    if (keeperErr || !keeper || keeper.coach_id !== user.id) {
      return NextResponse.json({ error: 'Invalid keeper for this coach' }, { status: 403 });
    }

    const matchMetadata = {
      match_date: body.match_date,
      session_type: body.session_type,
      opponent: body.opponent || null,
      venue: body.venue || null,
      age_group: body.age_group || null,
      my_team_color: body.my_team_color,
      opponent_color: body.opponent_color,
      my_keeper_color: body.my_keeper_color,
      was_subbed: !!body.was_subbed,
      sub_minute: body.sub_minute || null,
      sub_reason: body.sub_reason || null,
      // Experimental chunked-analysis path. Set to true on the upload form
      // for matches >30 min where attention decay is hurting accuracy.
      use_chunking: !!body.use_chunking,
      chunk_duration_sec: body.chunk_duration_sec ? parseInt(body.chunk_duration_sec, 10) : null,
    };

    const { data: job, error: insertErr } = await admin
      .from('video_jobs')
      .insert({
        coach_id: user.id,
        keeper_id: body.keeper_id,
        club_id: body.club_id,
        video_url: body.video_url,
        storage_path: body.storage_path || null,
        match_metadata: matchMetadata,
        status: 'queued',
      })
      .select()
      .single();
    if (insertErr) {
      return NextResponse.json({ error: 'Could not create job: ' + insertErr.message }, { status: 500 });
    }

    const triggerError = await triggerWorker(job.id);
    if (triggerError) {
      await admin.from('video_jobs').update({
        status: 'failed',
        error_message: triggerError,
        finished_at: new Date().toISOString(),
      }).eq('id', job.id);
      return NextResponse.json({ error: triggerError, job_id: job.id }, { status: 502 });
    }

    return NextResponse.json({ job_id: job.id, status: 'queued' });
  } catch (err) {
    console.error('video-jobs POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data, error } = await supabase
      .from('video_jobs')
      .select('id, status, video_url, match_metadata, error_message, retry_count, started_at, finished_at, created_at, published_match_id, keeper_id')
      .eq('coach_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ jobs: data });
  } catch (err) {
    console.error('video-jobs GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
