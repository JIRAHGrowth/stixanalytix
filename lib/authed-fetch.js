"use client";

import { ensureFreshSession } from "./supabase-token";

/**
 * Same-origin fetch wrapper with automatic session refresh + retry on 401.
 *
 * Why: Supabase access-token cookies live ~1 hour. A coach reviewing 50-100
 * events for hours, or leaving the tab backgrounded between actions, can hit
 * an expired cookie on the very next API call. Without recovery this surfaces
 * as a hard error mid-flow ("Failed to load", publish failure). With this
 * wrapper, a 401 silently triggers refreshSession() (which writes new cookies
 * via @supabase/ssr) and retries once. The user sees nothing.
 *
 * Limitations:
 *  - Only handles same-origin /api/* calls that authenticate via cookies.
 *    For raw Supabase Bearer tokens (e.g. tus uploads), use getFreshToken().
 *  - `init.body` must be reusable across the two attempts. Strings and
 *    Buffers are fine; consumed streams/FormData would not be.
 */
export async function authedFetch(supabase, url, init) {
  let res = await fetch(url, init);
  if (res.status !== 401) return res;
  await ensureFreshSession(supabase);
  res = await fetch(url, init);
  return res;
}
