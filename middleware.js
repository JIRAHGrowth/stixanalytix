import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

export async function middleware(request) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the auth token — this is critical for keeping sessions alive
  // If the token is expired, getUser() will attempt to refresh it
  // If refresh fails, user will be null and stale cookies get cleared by Supabase SSR
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  // If there was an auth error (expired/invalid token), clear the cookies
  // This prevents the "stuck loading" state where a stale cookie exists but the session is dead
  if (authError) {
    // Clear all Supabase auth cookies to prevent stale state
    const cookieNames = request.cookies.getAll()
      .map(c => c.name)
      .filter(name => name.startsWith('sb-'));

    if (cookieNames.length > 0) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/login';
      const response = NextResponse.redirect(redirectUrl);

      cookieNames.forEach(name => {
        response.cookies.delete(name);
      });

      return response;
    }
  }

  // Protected routes - redirect to login if not authenticated
  const protectedPaths = ['/dashboard', '/pitchside', '/onboarding', '/staff'];
  const isProtectedRoute = protectedPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (isProtectedRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // If logged in user tries to visit login/signup, redirect appropriately
  const authPaths = ['/login', '/signup'];
  const isAuthRoute = authPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (isAuthRoute && user) {
    const url = request.nextUrl.clone();

    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_complete')
      .eq('id', user.id)
      .single();

    // Check if user is a delegate (might not have completed onboarding)
    const { data: delegateRecords } = await supabase
      .from('delegates')
      .select('id')
      .eq('delegate_user_id', user.id)
      .eq('status', 'active')
      .limit(1);

    const isDelegateOnly = delegateRecords?.length > 0 && !profile?.onboarding_complete;

    if (isDelegateOnly) {
      url.pathname = '/dashboard';
    } else {
      url.pathname = profile?.onboarding_complete ? '/dashboard' : '/onboarding';
    }
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

