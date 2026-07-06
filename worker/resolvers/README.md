# Video URL Resolvers

Turns whatever URL a coach pastes on the upload form into something the
worker can `requests.get(stream=True)`.

## Public API

```python
from resolvers import resolve, identify_provider

result = resolve("https://app.veo.co/matches/<slug>/?highlight=...")
# result.playable_url        → direct signed MP4 on VEO's CDN
# result.provider            → "veo"
# result.render_type         → "panorama" | "standard"
# result.duration_sec        → 7685
# result.provider_metadata   → {teams, age group, match id, ...}
```

`resolve()` either returns a fully-usable `ResolveResult` or raises a
subclass of `ResolveError` with a coach-facing message and a `should_retry`
flag.

## Why a resolver layer at all

Before this existed, the worker did `requests.get(job["video_url"])` and
assumed the response was video bytes. That works for our own Supabase signed
URLs, and silently fails on every share-link URL (VEO, Hudl, YouTube,
Drive) — the response is an HTML SPA shell that Gemini then chokes on
downstream.

The resolver is the seam: one place where "URL a coach can paste" becomes
"URL the pipeline can download."

## Providers

| Module | Handles | How it works |
|---|---|---|
| `veo.py` | `app.veo.co/matches/<slug>/…` | Hits VEO's public `/api/app/matches/<slug>/videos/` endpoint. Prefers `panorama` render (full-field, keeper always in frame) over `standard` (auto-follow crop that loses the keeper on off-ball moments). |
| `direct.py` | Everything else | Passthrough. Used for Supabase signed URLs, R2 CDN links, and raw `.mp4` URLs. |

Registered in `__init__.py` — order matters (`DirectProvider` is the
terminal fallback, must stay last).

## Adding a provider

One file. No changes to `app.py`.

1. **Write `worker/resolvers/<name>.py`** with a class satisfying the
   `VideoProvider` protocol in `base.py`:

   ```python
   class HudlProvider:
       name = "hudl"
       def matches(self, url: str) -> bool: ...      # cheap, no I/O
       def resolve(self, url: str) -> ResolveResult: ...
   ```

2. **Register** in `__init__.py`:

   ```python
   _PROVIDERS: list[VideoProvider] = [
       VeoProvider(),
       HudlProvider(),   # add here
       DirectProvider(), # ← must stay last
   ]
   ```

3. **Raise typed errors** from `base.py` — don't invent new exception types
   unless you also add them to the taxonomy. The worker maps these to
   `video_jobs.error_message` and retry policy without switching on strings.

4. **Update this table**.

## Error taxonomy

All defined in `base.py`. Each carries a `coach_message` (shown in the UI)
and a `should_retry` flag (drives the worker's retry logic).

- `InvalidUrl` — malformed input; don't retry
- `UnsupportedProvider` — nothing claims this URL; don't retry
- `RequiresAuth` — provider wants login; owner action needed
- `PrivateMatch` — provider has it but it's private; owner action needed
- `ExpiredShare` — link's TTL is up; owner regenerates
- `RestorationNeeded` — video's in cold storage (e.g. VEO archived panorama)
- `ProviderChanged` — extractor is stale; needs a code fix. Loud logs.
- `ProviderUnavailable` — 5xx / timeout; retriable

## Provider metadata is training-data leverage

`ResolveResult.provider_metadata` is persisted verbatim to
`video_jobs.source_metadata` (jsonb). Providers already know the
ground-truth for a lot of what Gemini is guessing: match duration, teams,
age group, home/away, camera model. Slice the accuracy audit by
`source_provider` and you can spot pipeline drift by ingest source.

## Testing a resolver end-to-end without deploying

```bash
cd worker
python -c "from resolvers import resolve; r = resolve('<url>'); print(r)"
```

Needs `requests` in the local env (already in `worker/requirements.txt`).
No Supabase or Modal secrets required — resolvers are pure.
