import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const type = searchParams.get('type');
  const redirect = searchParams.get('redirect') || '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Password recovery flow — redirect to reset-password page
      if (type === 'recovery') {
        return NextResponse.redirect(`${origin}/reset-password`);
      }

      // Normal auth flow — check onboarding status
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_complete')
          .eq('id', user.id)
          .single();

        const destination = profile?.onboarding_complete ? redirect : '/onboarding';
        return NextResponse.redirect(`${origin}${destination}`);
      }
    }
  }

  // If something went wrong, redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
