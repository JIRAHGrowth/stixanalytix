/**
 * Cheap URL classifier — mirrors the Python provider registry in
 * worker/resolvers/. Called from the API route so bad URLs reject at
 * submission instead of ~30 seconds into a Modal spawn.
 *
 * Kept intentionally shallow: no HTTP, no I/O, no attempt to actually
 * resolve — just "does this URL shape belong to a known provider?" The
 * worker's Python resolver is the source of truth for actual resolution;
 * this file only exists so the UI can give instant feedback.
 *
 * When adding a provider in Python, add the corresponding shape check
 * here too. Order-agnostic — providers are named, not positional.
 */

const PROVIDERS = [
  {
    name: 'veo',
    // https://app.veo.co/matches/<slug>/... — matches both the raw and www hosts
    matches: (url) => /^https?:\/\/(?:www\.)?app\.veo\.co\/matches\/[^/?#]+/i.test(url),
    label: 'VEO share link',
  },
];

/**
 * Identify which provider handles this URL. Returns:
 *   - 'veo' / provider name — a named share-link provider
 *   - 'direct' — plausible direct HTTP(S) URL (Supabase signed, CDN link, .mp4)
 *   - null — malformed URL (not http/https, no host, etc.)
 */
export function identifyProvider(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname) return null;
  } catch {
    return null;
  }
  for (const p of PROVIDERS) {
    if (p.matches(url)) return p.name;
  }
  return 'direct';
}

/**
 * Human-friendly label for a provider name — used in error messages so the
 * coach sees "VEO share link" rather than "veo".
 */
export function providerLabel(name) {
  const p = PROVIDERS.find((x) => x.name === name);
  return p?.label || name;
}

/**
 * List of provider names the UI can use to render "supported sources" copy.
 * Includes 'direct' as the catch-all.
 */
export function supportedProviders() {
  return [...PROVIDERS.map((p) => p.name), 'direct'];
}
