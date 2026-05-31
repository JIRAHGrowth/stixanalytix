"use client";

// Margin (ms) before token `exp` at which we proactively refresh.
// Keeps a comfortable buffer so refresh races never matter in practice.
const REFRESH_MARGIN_MS = 60_000;

/**
 * Return a non-expired Supabase access token, refreshing if necessary.
 *
 * Use anywhere code sends `Authorization: Bearer <token>` directly to Supabase
 * (e.g. tus uploads to storage, raw fetches that bypass the API/cookie path).
 *
 * For same-origin /api/* calls, prefer authedFetch — cookies travel with the
 * request and the server client handles refresh on its side.
 */
export async function getFreshToken(supabase) {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const expiresAtMs = (session.expires_at || 0) * 1000;
  if (Date.now() > expiresAtMs - REFRESH_MARGIN_MS) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data?.session) {
      throw new Error("Session refresh failed: " + (error?.message || "no session"));
    }
    session = data.session;
  }
  return session.access_token;
}

/**
 * Best-effort proactive refresh; swallows errors. Use from heartbeats and
 * visibility handlers where a transient refresh failure shouldn't disrupt
 * the user (next real request will retry).
 */
export async function ensureFreshSession(supabase) {
  try { await getFreshToken(supabase); } catch { /* tolerated */ }
}
