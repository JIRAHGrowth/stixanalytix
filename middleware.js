import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Skip middleware entirely for API routes and auth callback
  if (pathname.startsWith('/api') || pathname.startsWith('/auth')) {
    return NextResponse.next();
  }

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

  // Try to refresh the auth token
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  // ── Auth pages (login, signup) ──
  // If user lands here with a stale cookie, do NOT redirect — just let the page load.
  // The login page clears stale sessions on mount (client-side).
  const authPaths = ['/login', '/signup', '/forgot-password'];
  const isAuthRoute = authPaths.some(p => pathname.startsWith(p));

  if (isAuthRoute) {
    // If user is genuinely authenticated (no error, valid user), redirect them out
    if (!authError && user) {
      const url = request.nextUrl.clone();

      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_complete')
        .eq('id', user.id)
        .single();

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

    // Stale cookie or no session — just let the login page load
    return supabaseResponse;
  }

  // ── Protected routes ──
  const protectedPaths = ['/dashboard', '/pitchside', '/onboarding', '/staff'];
  const isProtectedRoute = protectedPaths.some(p => pathname.startsWith(p));

  if (isProtectedRoute && (!user || authError)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

