"""
VEO resolver.

VEO share URLs look like:

    https://app.veo.co/matches/<slug>/?highlight=<uuid>&scroll=MT

The public JSON endpoint `/api/app/matches/<slug>/videos/` returns an array
of render assets for public matches — no authentication required. Each entry
has an `availability` ('available' or 'archived'), a `render_type`
('standard' — VEO's auto-follow crop, or 'panorama' — the stitched wide
view), and a signed CDN `url` on c.veocdn.com.

Selection policy — coach-view alignment (2026-07-12 update)
-----------------------------------------------------------
Prefer **standard** (VEO's auto-follow crop), fall back to panorama.

Why not panorama, which is a strictly better lens for GK analysis?
Because standard is what the coach sees by default when they open a VEO
share URL in their browser — VEO's web player opens on standard, and the
panorama toggle is a discoverable-but-not-obvious control. If the analyzer
picks panorama and the coach ground-truths from standard, the two views
diverge: coach can't see keeper actions the analyzer captured, or tags
events the analyzer couldn't see. UX alignment wins over marginal data
quality here.

For labeler workflows (Nicolas's SE Asia team, near-future), tagging
happens against the actual downloaded MP4 — labelers will use panorama
directly via the resolved URL, bypassing this preference. Their toolchain
doesn't care what VEO's website defaults to.

Trade-off honestly named: standard's auto-follow WILL miss sweeper actions
and keeper off-ball positioning. That's the [[feedback-static-cam-sweeper-blindspot]]
tax. Coach GT tagged from standard will inherit the same blindspot — a
consistent (if narrower) truth is better than a mismatched pair.

Nothing else lives in this file. Adding another provider means adding
another module and one line to registry.py.
"""

from __future__ import annotations

import re
from typing import Any

import requests

from .base import (
    ProviderChanged,
    ProviderUnavailable,
    PrivateMatch,
    RequiresAuth,
    ResolveResult,
    RestorationNeeded,
)


# Host + slug regex. VEO slugs are lowercase kebab with trailing short hash;
# we do NOT try to over-constrain shape because VEO has quietly changed their
# slug generator before. Just: matches path, non-empty, no slashes.
_VEO_HOST_PATTERN = re.compile(
    r"^https?://(?:www\.)?app\.veo\.co/matches/([^/?#]+)/?",
    re.IGNORECASE,
)

_API_BASE = "https://app.veo.co/api/app"
_REQUEST_TIMEOUT_SEC = 15


class VeoProvider:
    name = "veo"

    def matches(self, url: str) -> bool:
        return bool(_VEO_HOST_PATTERN.match(url or ""))

    def resolve(self, url: str) -> ResolveResult:
        slug = self._extract_slug(url)
        match_meta = self._fetch_match_metadata(slug)
        videos = self._fetch_videos(slug)
        chosen = self._pick_render(videos)

        return ResolveResult(
            playable_url=chosen["url"],
            provider=self.name,
            render_type=chosen.get("render_type"),
            duration_sec=match_meta.get("duration_sec"),
            provider_metadata=self._build_metadata(url, slug, match_meta, chosen, videos),
            expires_at=None,
        )

    # === Steps ==================================================================

    def _extract_slug(self, url: str) -> str:
        m = _VEO_HOST_PATTERN.match(url)
        if not m:
            # matches() must be True before resolve() is called; if we get here
            # someone is calling resolve() directly on the wrong URL.
            raise ProviderChanged(f"URL didn't match VEO shape: {url}")
        return m.group(1)

    def _fetch_match_metadata(self, slug: str) -> dict[str, Any]:
        """Match-level metadata (duration, teams, age group, privacy).

        VEO returns 200 with `privacy` field on public matches. Private matches
        return 200 too but with reduced fields — we treat missing `duration`
        as a private-match signal because privacy detection isn't documented
        and might shift."""
        url = f"{_API_BASE}/matches/{slug}/"
        try:
            resp = requests.get(url, timeout=_REQUEST_TIMEOUT_SEC)
        except requests.RequestException as e:
            raise ProviderUnavailable(f"VEO metadata fetch network error: {e}") from e

        if resp.status_code == 401:
            raise RequiresAuth(f"VEO metadata 401 for slug={slug}")
        if resp.status_code == 403:
            raise PrivateMatch(f"VEO metadata 403 for slug={slug}")
        if resp.status_code == 404:
            raise PrivateMatch(f"VEO slug not found (may be private or deleted): {slug}")
        if resp.status_code >= 500:
            raise ProviderUnavailable(f"VEO metadata {resp.status_code}")
        if resp.status_code != 200:
            raise ProviderChanged(f"VEO metadata unexpected {resp.status_code}: {resp.text[:200]}")

        try:
            data = resp.json()
        except ValueError as e:
            raise ProviderChanged(f"VEO metadata not JSON: {e}") from e

        # `duration` at the recording level is the source of truth. We flatten
        # useful fields but stash the whole payload for the audit trail.
        recording = (data.get("recordings") or [{}])[0]
        return {
            "raw": data,
            "duration_sec": recording.get("duration") or data.get("duration"),
            "match_id": data.get("id") or data.get("identifier"),
            "privacy": data.get("privacy"),
            "age_group": data.get("age_group"),
            "match_type": data.get("match_type"),
            "team_home": ((data.get("team") or {}).get("name")),
            "team_away": ((data.get("opponent") or {}).get("name")),
            "club_name": ((data.get("club") or {}).get("name")),
        }

    def _fetch_videos(self, slug: str) -> list[dict[str, Any]]:
        url = f"{_API_BASE}/matches/{slug}/videos/"
        try:
            resp = requests.get(url, timeout=_REQUEST_TIMEOUT_SEC)
        except requests.RequestException as e:
            raise ProviderUnavailable(f"VEO videos fetch network error: {e}") from e

        if resp.status_code == 401:
            raise RequiresAuth(f"VEO videos 401 for slug={slug}")
        if resp.status_code in (403, 404):
            raise PrivateMatch(f"VEO videos {resp.status_code} for slug={slug}")
        if resp.status_code >= 500:
            raise ProviderUnavailable(f"VEO videos {resp.status_code}")
        if resp.status_code != 200:
            raise ProviderChanged(f"VEO videos unexpected {resp.status_code}: {resp.text[:200]}")

        try:
            videos = resp.json()
        except ValueError as e:
            raise ProviderChanged(f"VEO videos not JSON: {e}") from e

        if not isinstance(videos, list):
            raise ProviderChanged(f"VEO videos expected list, got {type(videos).__name__}")
        return videos

    def _pick_render(self, videos: list[dict[str, Any]]) -> dict[str, Any]:
        """Coach-view-aligned selection: prefer standard, fall back to panorama.

        See module docstring for the UX rationale (coach opens VEO on
        standard by default; picking panorama here would misalign what the
        analyzer saw vs what the coach sees during ground-truth tagging).

        Only 'available' renders count. Only MP4 mime types (skip the .ts HLS
        segments VEO occasionally exposes alongside the MP4 for their web
        player). We validate `url` starts with https to catch schema drift."""

        def is_playable(v: dict[str, Any]) -> bool:
            return (
                v.get("availability") == "available"
                and v.get("mime_type") == "video/mp4"
                and isinstance(v.get("url"), str)
                and v["url"].startswith("https://")
            )

        available = [v for v in videos if is_playable(v)]

        standard = next(
            (v for v in available if v.get("render_type") == "standard"),
            None,
        )
        if standard:
            return standard

        panorama = next(
            (v for v in available if v.get("render_type") == "panorama"),
            None,
        )
        if panorama:
            return panorama

        # Nothing playable. Distinguish "everything is archived" (owner action
        # needed) from "structure changed" (our bug) so the coach gets a
        # useful message.
        if videos and all(v.get("availability") == "archived" for v in videos):
            raise RestorationNeeded(
                "All VEO renders are archived — owner must restore from VEO."
            )
        if not videos:
            raise ProviderChanged("VEO returned empty videos array")
        raise ProviderChanged(
            f"No usable render — videos payload: "
            f"{[{'r': v.get('render_type'), 'a': v.get('availability'), 'm': v.get('mime_type')} for v in videos]}"
        )

    def _build_metadata(
        self,
        source_url: str,
        slug: str,
        match_meta: dict[str, Any],
        chosen: dict[str, Any],
        all_videos: list[dict[str, Any]],
    ) -> dict[str, Any]:
        return {
            "source_url": source_url,
            "veo_slug": slug,
            "veo_match_id": match_meta.get("match_id"),
            "privacy": match_meta.get("privacy"),
            "age_group": match_meta.get("age_group"),
            "match_type": match_meta.get("match_type"),
            "team_home": match_meta.get("team_home"),
            "team_away": match_meta.get("team_away"),
            "club_name": match_meta.get("club_name"),
            "chosen_render_type": chosen.get("render_type"),
            "chosen_width": chosen.get("width"),
            "chosen_height": chosen.get("height"),
            # For debugging future extractor bugs: what other renders did we see?
            "available_renders": [
                {
                    "render_type": v.get("render_type"),
                    "availability": v.get("availability"),
                    "mime_type": v.get("mime_type"),
                    "width": v.get("width"),
                    "height": v.get("height"),
                }
                for v in all_videos
            ],
        }
