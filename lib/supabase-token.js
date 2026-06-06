"use client";

// Margin (ms) before token `exp` at which we proactively refresh.
// Keeps a comfortable buffer so refresh races never matter in practice.
const REFRESH_MARGIN_MS = 60_000;

// Cheap structural check — a valid JWT is three non-empty base64url segments
// separated by dots. Supabase storage rejects malformed tokens with
// "Invalid Compact JWS" (403), which is what we'd hit if localStorage handed
// back a truncated/corrupted access_token from a half-finished write or a
// cross-tab race. We don't verify the signature here — that's storage's job —
// we just confirm the value is shaped like a JWT before we trust it.
function looksLikeJwt(token) {
  if (typeof token !== "string" || token.length < 20) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  return parts.every(p => p.length > 0 && /^[A-Za-z0-9_-]+$/.test(p));
}

/**
 * Return a non-expired, structurally valid Supabase access token, refreshing
 * if necessary.
 *
 * Use anywhere code sends `Authorization: Bearer <token>` directly to Supabase
 * (e.g. tus uploads to storage, raw fetches that bypass the API/cookie path).
 *
 * For same-origin /api/* calls, prefer authedFetch — cookies travel with the
 * request and the server client handles refresh on its side.
 *
 * @param {object} supabase
 * @param {object} [opts]
 * @param {boolean} [opts.forceRefresh] - skip the cache and refresh from the
 *   auth server. Use at the start of long-running operations (tus uploads)
 *   where you want to guarantee a server-fresh token, not a localStorage one.
 */
export async function getFreshToken(supabase, opts = {}) {
  let session = null;

  if (opts.forceRefresh) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data?.session) {
      throw new Error("Session refresh failed: " + (error?.message || "no session"));
    }
    session = data.session;
  } else {
    const { data } = await supabase.auth.getSession();
    session = data?.session || null;
    if (!session) throw new Error("Not authenticated");

    const expiresAtMs = (session.expires_at || 0) * 1000;
    const expiresSoon = Date.now() > expiresAtMs - REFRESH_MARGIN_MS;
    if (expiresSoon || !looksLikeJwt(session.access_token)) {
      const { data: r, error } = await supabase.auth.refreshSession();
      if (error || !r?.session) {
        throw new Error("Session refresh failed: " + (error?.message || "no session"));
      }
      session = r.session;
    }
  }

  if (!looksLikeJwt(session.access_token)) {
    throw new Error("Session token is malformed — please sign out and sign back in.");
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
