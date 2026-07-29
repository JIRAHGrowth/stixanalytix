import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';

// Returns a one-shot signed URL the browser can PUT a video file directly to,
// bypassing the S3-compatible endpoint. We moved off S3 SigV4 auth after
// Supabase's new API-key format (sb_publishable_ / sb_secret_) stopped being
// accepted as the S3 secret — see the "session token should be a valid JWT"
// error class. The standard upload endpoint accepts the new keys fine.
//
// Bucket RLS is unchanged: the server enforces path = <user_id>/... below,
// so a coach can only ever upload under their own prefix even though we sign
// the URL with the service role.
export async function POST(request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { filename } = await request.json();
    if (typeof filename !== 'string' || !filename.trim()) {
      return NextResponse.json({ error: 'filename is required' }, { status: 400 });
    }

    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
    const folder = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const path = `${user.id}/${folder}/${safeName}`;

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from('match-videos')
      .createSignedUploadUrl(path);
    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { error: 'Could not sign upload URL: ' + (error?.message || 'unknown') },
        { status: 500 },
      );
    }

    return NextResponse.json({
      path,
      token: data.token,
      signedUrl: data.signedUrl,
    });
  } catch (err) {
    console.error('upload-url POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
