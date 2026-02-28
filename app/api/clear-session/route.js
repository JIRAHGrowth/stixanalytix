import { NextResponse } from 'next/server';

// Nuclear option: clears ALL Supabase auth cookies
// Call this when the user is stuck in a loading loop
export async function POST(request) {
  const response = NextResponse.json({ success: true, message: 'Session cleared' });

  // Delete every Supabase cookie
  const cookieNames = request.cookies.getAll()
    .map(c => c.name)
    .filter(name => name.startsWith('sb-'));

  cookieNames.forEach(name => {
    response.cookies.delete(name);
    // Also try with various paths
    response.cookies.set(name, '', { maxAge: 0, path: '/' });
  });

  return response;
}

// Also support GET so it works from a simple link/redirect
export async function GET(request) {
  const url = new URL('/login', request.url);
  const response = NextResponse.redirect(url);

  const cookieNames = request.cookies.getAll()
    .map(c => c.name)
    .filter(name => name.startsWith('sb-'));

  cookieNames.forEach(name => {
    response.cookies.delete(name);
    response.cookies.set(name, '', { maxAge: 0, path: '/' });
  });

  return response;
}

