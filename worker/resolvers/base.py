"""
Video URL resolver — protocol, result type, and error taxonomy.

A "provider" knows how to turn a coach-pasted URL (VEO share link, Hudl page,
raw MP4, etc.) into something the worker can actually download. Each provider
is a self-contained module that implements the small protocol below and
registers itself in worker/resolvers/__init__.py.

Design notes for future contributors:

* The download step in worker/app.py assumes a plain HTTP fetch returns video
  bytes. Providers that need extra work (HLS remux, DRM, OAuth) MUST return a
  URL that satisfies that assumption — either by resolving upstream to a
  direct MP4 (VEO's public API path) or by materialising an intermediate MP4
  and returning its URL. This keeps the hot path simple and makes providers
  independently testable.

* ResolveResult carries structured provider metadata (duration, teams, age
  group, etc.) alongside the playable URL. Persist it on video_jobs so we
  accumulate weak-supervision signal from every provider — that lets the
  accuracy audit slice by provider and cross-check Gemini's guesses against
  what the provider already knows.

* Errors are typed. Coach-facing message + should_retry are part of the
  contract. The worker maps these onto video_jobs.error_message and retry
  policy without having to switch on exception message strings.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Protocol, runtime_checkable


# === Result type ================================================================

@dataclass
class ResolveResult:
    """Everything the worker + audit trail need after resolution."""

    playable_url: str
    """Direct URL the worker can pass to `requests.get(stream=True)`."""

    provider: str
    """Short identifier, e.g. 'veo', 'direct'. Persisted on video_jobs.source_provider."""

    render_type: str | None = None
    """Provider-specific render selection ('standard', 'panorama', ...). None for direct URLs."""

    duration_sec: int | None = None
    """Match duration if the provider reports it — used to cross-check Gemini's timeline."""

    provider_metadata: dict[str, Any] = field(default_factory=dict)
    """Everything else worth keeping: teams, age group, camera model, view count, etc.
    Persisted verbatim on video_jobs.source_metadata as jsonb."""

    resolved_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    """When we resolved. Signed URLs age; useful for debugging download failures."""

    expires_at: datetime | None = None
    """Best-effort estimate of when the playable_url stops working. If the worker
    hits a download failure past this timestamp, it should re-resolve rather than retry."""


# === Provider protocol ==========================================================

@runtime_checkable
class VideoProvider(Protocol):
    """Contract every provider module implements.

    Providers are stateless — no __init__ side effects. `matches` MUST be a
    cheap URL-shape check (regex on host+path); the network call happens in
    `resolve`. This lets the API route validate URLs at submission time
    without spawning the worker.
    """

    name: str

    def matches(self, url: str) -> bool:
        """Fast check: is this URL our responsibility? No I/O."""
        ...

    def resolve(self, url: str) -> ResolveResult:
        """Turn the URL into a ResolveResult. May raise ResolveError subclasses.
        May do HTTP. Should complete in well under 10s for interactive UIs."""
        ...


# === Error taxonomy =============================================================

class ResolveError(Exception):
    """Base class. Every subclass declares whether retrying could plausibly help
    and provides a message safe to show a coach."""

    coach_message: str = "We couldn't process this video link. Try a different one."
    should_retry: bool = False

    def __init__(self, detail: str | None = None):
        # `detail` is for logs. The coach only sees `coach_message`.
        super().__init__(detail or self.coach_message)
        self.detail = detail


class UnsupportedProvider(ResolveError):
    coach_message = (
        "That video link isn't from a supported service. "
        "Supported: VEO share links, or a direct .mp4 URL."
    )
    should_retry = False


class InvalidUrl(ResolveError):
    coach_message = "That doesn't look like a valid URL. Double-check and try again."
    should_retry = False


class RequiresAuth(ResolveError):
    coach_message = (
        "This video is private on the provider's side. "
        "Ask the owner to set share access to 'anyone with the link'."
    )
    should_retry = False


class PrivateMatch(ResolveError):
    coach_message = (
        "This match is set to private on the provider. "
        "Ask the owner to change sharing to public / anyone-with-link, then retry."
    )
    should_retry = False


class ExpiredShare(ResolveError):
    coach_message = (
        "This share link has expired. "
        "Ask the owner to regenerate it and paste the new URL."
    )
    should_retry = False


class RestorationNeeded(ResolveError):
    """Provider has the video but it's in cold storage and needs to be un-archived
    (VEO panorama, some Hudl clips). Not retriable by us — the owner has to act."""

    coach_message = (
        "The best-quality render for this match is archived on the provider's side. "
        "Ask the owner to restore it, then retry."
    )
    should_retry = False


class ProviderChanged(ResolveError):
    """The provider's API/HTML structure moved out from under our extractor.
    Not retriable — needs a code fix. Loud logs so we notice fast."""

    coach_message = (
        "The provider changed how their share links work. "
        "We've been notified and will fix it — try again in a bit."
    )
    should_retry = False


class ProviderUnavailable(ResolveError):
    """Provider returned 5xx or timed out. Worth retrying."""

    coach_message = "The video provider is having a bad moment. We'll try again."
    should_retry = True
