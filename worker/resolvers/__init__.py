"""
Video URL resolver registry.

Public API is deliberately tiny: ``resolve(url) -> ResolveResult``. The worker
calls this once per job before the download step. Everything else is provider
plumbing.

Adding a provider
-----------------
1. Write ``worker/resolvers/<name>.py`` implementing the ``VideoProvider``
   protocol from ``base.py`` (see ``veo.py`` for a full worked example).
2. Add one line to ``_PROVIDERS`` below — order matters, ``DirectProvider``
   is the terminal fallback and must stay last.
3. Add a case to the API-side validator in ``lib/url-resolver.js`` if you want
   pre-submission validation (recommended for share-link providers).
4. Update ``worker/resolvers/README.md`` with the URL shape you handle.

That's it. No changes to ``app.py``. No changes to the video_jobs schema.
"""

from __future__ import annotations

from .base import (
    InvalidUrl,
    PrivateMatch,
    ProviderChanged,
    ProviderUnavailable,
    RequiresAuth,
    ResolveError,
    ResolveResult,
    RestorationNeeded,
    UnsupportedProvider,
    VideoProvider,
)
from .direct import DirectProvider
from .veo import VeoProvider

__all__ = [
    "resolve",
    "identify_provider",
    "ResolveResult",
    "ResolveError",
    "InvalidUrl",
    "RequiresAuth",
    "PrivateMatch",
    "RestorationNeeded",
    "ProviderChanged",
    "ProviderUnavailable",
    "UnsupportedProvider",
    "VideoProvider",
]


# Registry — ORDER MATTERS. DirectProvider claims everything, so it MUST
# be the last entry. Insert new named providers above it.
_PROVIDERS: list[VideoProvider] = [
    VeoProvider(),
    DirectProvider(),
]


def resolve(url: str) -> ResolveResult:
    """Dispatch to the first provider whose ``matches()`` returns True.

    Raises the relevant ``ResolveError`` subclass on failure. Never returns
    a partially-populated result — either you get a fully-usable
    ``ResolveResult`` or an exception."""
    if not url or not isinstance(url, str):
        raise InvalidUrl(f"resolve() called with non-string URL: {url!r}")

    for provider in _PROVIDERS:
        if provider.matches(url):
            return provider.resolve(url)

    # DirectProvider.matches() returns True unconditionally, so this is
    # unreachable unless someone reorders the registry. Guard anyway.
    raise UnsupportedProvider(f"No provider claimed URL: {url}")


def identify_provider(url: str) -> str | None:
    """Cheap URL-shape check — which provider would handle this? Mirrors
    identifyProvider() in lib/url-resolver.js. Returns None for malformed
    URLs (not http/https, no host) so callers can reject them without
    going through resolve()."""
    from urllib.parse import urlparse
    if not url or not isinstance(url, str):
        return None
    try:
        parsed = urlparse(url)
    except ValueError:
        return None
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return None
    for provider in _PROVIDERS:
        if provider.matches(url):
            return provider.name
    return None
