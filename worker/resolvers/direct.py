"""
Direct-URL resolver — the fallback.

Anything that isn't claimed by a named provider ends up here: Supabase signed
URLs from our own uploads, R2/S3 CDN links, ad-hoc .mp4 URLs coaches paste.

We do NOT HEAD-check the URL here. Two reasons:

1. The main pipeline in worker/app.py already streams the response through
   `requests.get` and surfaces HTTP errors as job failures with the real
   status code. Duplicating that check burns a round trip.

2. The API route (app/api/video-jobs/route.js) does a cheap URL.parse() check
   before we get anywhere near the worker.

If, later, we want a HEAD probe at resolve time (e.g. to reject known-bad
share pages before Gemini spins up), this is the file to put it in.
"""

from __future__ import annotations

from urllib.parse import urlparse

from .base import InvalidUrl, ResolveResult


class DirectProvider:
    name = "direct"

    def matches(self, url: str) -> bool:
        """Terminal fallback — always claims the URL. Registry orders us last."""
        return True

    def resolve(self, url: str) -> ResolveResult:
        parsed = urlparse(url or "")
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise InvalidUrl(f"Not a valid http(s) URL: {url!r}")

        return ResolveResult(
            playable_url=url,
            provider=self.name,
            render_type=None,
            duration_sec=None,
            provider_metadata={
                "source_url": url,
                "host": parsed.netloc,
            },
        )
