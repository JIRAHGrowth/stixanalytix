"""
StixAnalytix video worker — Vertex AI port (Phase 2).

Parallel Modal app to `worker/app.py`. New backend (Vertex AI), new SDK
(google.genai), new default analysis pattern (virtual chunked + per-chunk
caching + thinking off). Same input contract (POST {job_id}) and same
output contract (gemini_output JSON shape on video_jobs) so the dashboard /
review screen consume this worker without any changes.

Why a parallel app, not an in-place patch:
  - Canary safety. Production keeps running on `stixanalytix-worker` until
    we point Vercel's MODAL_TRIGGER_URL at this app and confirm a clean
    spell of jobs.
  - Risk isolation. A bug in the new chunked/cached path can't break the
    AI Studio production code path while we validate.
  - Clean cutover. Once stable, this file becomes the new worker/app.py
    and the old file is deleted in a single rename commit. Zero residual
    SDK-mixing tech debt.

Deploy:  modal deploy worker/app_v2.py
Invoke:  modal run worker/app_v2.py::process --job-id <uuid>
HTTP:    POST <trigger-url> with {"job_id": "<uuid>"} and header
         X-Trigger-Secret: $MODAL_TRIGGER_SECRET.

Secret required: `stix-env-vertex` Modal Secret with:
  NEXT_PUBLIC_SUPABASE_URL              (same as production)
  SUPABASE_SERVICE_ROLE_KEY             (same as production)
  GOOGLE_APPLICATION_CREDENTIALS_JSON   (full contents of .gcp-key.json)
  GOOGLE_CLOUD_PROJECT                  (e.g. stixanalytix-prod)
  GOOGLE_CLOUD_LOCATION                 (e.g. us-central1)
  GCS_TRAINING_BUCKET                   (e.g. stix-training-stixanalytix-prod)
  MODAL_TRIGGER_SECRET                  (same as production)
  GEMINI_MODEL_V2                       (optional, defaults to gemini-2.5-flash)
"""
import json
import os
import modal
from fastapi import Header

IMAGE = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "google-genai>=2.5.0",
        "google-cloud-storage>=2.10.0",
        "supabase>=2.9.0",
        "requests>=2.32.0",
        "fastapi[standard]>=0.115.0",
    )
    .add_local_dir("prompts", remote_path="/root/prompts")
)

app = modal.App("stixanalytix-worker-vertex")
secret = modal.Secret.from_name("stix-env-vertex")


# ============================================================================
# Response schemas — duplicated from worker/app.py for canary isolation.
# Consolidation into a shared worker/lib_core.py happens post-cutover.
# ============================================================================

GOALS_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "goals": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "timestamp_seconds": {"type": "INTEGER"},
                    "match_clock": {"type": "STRING"},
                    "scoring_team": {"type": "STRING"},
                    "conceding_team": {"type": "STRING"},
                    "scoreboard_before": {"type": "STRING"},
                    "scoreboard_after": {"type": "STRING"},
                    "attack_type": {"type": "STRING"},
                    "buildup": {"type": "STRING"},
                    "shot_type": {"type": "STRING"},
                    "shot_location": {"type": "STRING"},
                    "goal_placement_height": {"type": "STRING"},
                    "goal_placement_side": {"type": "STRING"},
                    "gk_observations": {"type": "STRING"},
                    "evidence_kickoff_after": {"type": "STRING"},
                    "evidence_celebration": {"type": "STRING"},
                    "evidence_scoreboard": {"type": "STRING"},
                    "confidence": {"type": "STRING"},
                },
                "required": [
                    "timestamp_seconds", "match_clock", "scoring_team",
                    "conceding_team", "scoreboard_before", "scoreboard_after",
                    "attack_type", "buildup", "shot_type", "shot_location",
                    "goal_placement_height", "goal_placement_side",
                    "gk_observations",
                    "evidence_kickoff_after", "evidence_celebration", "evidence_scoreboard",
                    "confidence",
                ],
            },
        }
    },
    "required": ["goals"],
}

SAVES_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "saves": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "timestamp_seconds": {"type": "INTEGER"},
                    "match_clock": {"type": "STRING"},
                    "shot_origin": {"type": "STRING"},
                    "shot_type": {"type": "STRING"},
                    "on_target": {"type": "STRING"},
                    "gk_action": {"type": "STRING"},
                    "gk_visible": {"type": "STRING"},
                    "outcome": {"type": "STRING"},
                    "body_distance_zone": {"type": "STRING"},
                    "goal_placement_height": {"type": "STRING"},
                    "goal_placement_side": {"type": "STRING"},
                    "shot_description": {"type": "STRING"},
                    "gk_observations": {"type": "STRING"},
                    "confidence": {"type": "STRING"},
                },
                "required": [
                    "timestamp_seconds", "match_clock", "shot_origin", "shot_type",
                    "on_target", "gk_action", "gk_visible", "outcome",
                    "body_distance_zone", "goal_placement_height", "goal_placement_side",
                    "shot_description", "gk_observations", "confidence",
                ],
            },
        }
    },
    "required": ["saves"],
}

DISTRIBUTION_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "distribution": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "timestamp_seconds": {"type": "INTEGER"},
                    "match_clock": {"type": "STRING"},
                    "trigger": {"type": "STRING"},
                    "type": {"type": "STRING"},
                    "successful": {"type": "STRING"},
                    "press_state": {"type": "STRING"},
                    "pass_selection": {"type": "STRING"},
                    "direction": {"type": "STRING"},
                    "receiver": {"type": "STRING"},
                    "first_touch": {"type": "STRING"},
                    "notes": {"type": "STRING"},
                    "confidence": {"type": "STRING"},
                },
                "required": [
                    "timestamp_seconds", "match_clock", "trigger", "type",
                    "successful", "press_state", "direction", "receiver",
                    "confidence",
                ],
            },
        }
    },
    "required": ["distribution"],
}


# ============================================================================
# Helpers — duplicated from worker/app.py (filter, reconcile, render).
# ============================================================================

def _filter_low_signal_saves(saves: list) -> list:
    if not saves:
        return saves
    kept, dropped = [], 0
    for s in saves:
        on_target = str(s.get("on_target", "")).strip().lower()
        gk_action = str(s.get("gk_action", "")).strip().lower()
        if on_target == "no" and gk_action == "unclear":
            dropped += 1
            continue
        kept.append(s)
    if dropped:
        print(f"[saves-filter] dropped {dropped} low-signal events", flush=True)
    return kept


def _reconcile_events(goals: list, saves: list, distribution: list) -> tuple:
    """Cross-event reconciliation. Identical to worker/app.py for canary
    behavioural parity — same drops, same diagnostics."""
    def _is_visible_scoreboard(s):
        s_norm = str(s or "").strip().lower()
        return bool(s_norm) and s_norm not in ("not_visible", "unclear", "n/a", "null", "none")

    def _has_ts(e):
        return isinstance(e.get("timestamp_seconds"), (int, float))

    # A: confidence threshold on distribution (low only — preserves medium)
    n0 = len(distribution or [])
    distribution = [
        d for d in (distribution or [])
        if str(d.get("confidence", "")).strip().lower() != "low"
    ]
    a_dropped = n0 - len(distribution)

    # C: goal scoreboard delta check
    n0 = len(goals or [])
    def _scoreboard_unchanged(g):
        b = g.get("scoreboard_before"); a = g.get("scoreboard_after")
        return _is_visible_scoreboard(b) and _is_visible_scoreboard(a) \
            and str(b).strip().lower() == str(a).strip().lower()
    goals = [g for g in (goals or []) if not _scoreboard_unchanged(g)]
    c_dropped = n0 - len(goals)

    # B1: drop saves with gk_action=Goal near a goal candidate (±5s)
    goal_times = sorted([g["timestamp_seconds"] for g in goals if _has_ts(g)])

    def _near_any(t, times, tol):
        return any(abs(t - x) <= tol for x in times)

    n0 = len(saves or [])
    saves = [
        s for s in (saves or [])
        if not (
            _has_ts(s)
            and str(s.get("gk_action", "")).strip().lower() == "goal"
            and _near_any(s["timestamp_seconds"], goal_times, 5)
        )
    ]
    b1_dropped = n0 - len(saves)

    # B2: drop distribution events colliding with any save or goal (±2s)
    save_times = [s["timestamp_seconds"] for s in saves if _has_ts(s)]
    busy_times = goal_times + save_times
    n0 = len(distribution or [])
    distribution = [
        d for d in (distribution or [])
        if not (_has_ts(d) and _near_any(d["timestamp_seconds"], busy_times, 2))
    ]
    b2_dropped = n0 - len(distribution)

    # D: goal evidence rule — ≥2 of {kickoff, celebration, scoreboard} affirmative
    NEGATIVE_EVIDENCE = {
        "", "not_observed", "no_observation", "none", "null", "n/a",
        "scoreboard_not_visible", "no_scoreboard_visible", "scoreboard_unchanged",
        "no_kickoff_observed", "no_celebration_observed",
    }
    def _evidence_count(g):
        count = 0
        for f in ("evidence_kickoff_after", "evidence_celebration", "evidence_scoreboard"):
            v = str(g.get(f) or "").strip().lower()
            if v and v not in NEGATIVE_EVIDENCE:
                count += 1
        return count
    n0d = len(goals or [])
    goals = [g for g in (goals or []) if _evidence_count(g) >= 2]
    d_dropped = n0d - len(goals)

    # E: distribution dedupe by (trigger, direction) within 30s — Phase 2.5
    # Validated 2026-05-22: cuts ~99 dist FPs across 3 bench matches with
    # only -2 TPs. The model annotates the same GK touch sequence as
    # multiple separate events; this collapses by trigger+direction key
    # within a 30s window. Highest-confidence wins.
    CONF_RANK = {"high": 3, "medium": 2, "low": 1}
    n0_dist_e = len(distribution or [])
    keyed = sorted(
        (d for d in (distribution or []) if isinstance(d.get("timestamp_seconds"), (int, float))),
        key=lambda d: d["timestamp_seconds"],
    )
    deduped = []
    for d in keyed:
        trig = str(d.get("trigger") or "").lower()
        dirn = str(d.get("direction") or "").lower()
        ts = d["timestamp_seconds"]
        clash = None
        for k in deduped:
            if str(k.get("trigger") or "").lower() == trig and \
               str(k.get("direction") or "").lower() == dirn and \
               abs(k["timestamp_seconds"] - ts) <= 30:
                clash = k
                break
        if clash is None:
            deduped.append(d)
            continue
        if CONF_RANK.get(str(d.get("confidence") or "").lower(), 0) > \
           CONF_RANK.get(str(clash.get("confidence") or "").lower(), 0):
            deduped.remove(clash)
            deduped.append(d)
    deduped.extend([d for d in (distribution or []) if not isinstance(d.get("timestamp_seconds"), (int, float))])
    distribution = deduped
    e_dropped = n0_dist_e - len(distribution)

    print(
        f"[reconcile] A:{a_dropped} dist (low conf) "
        f"| C:{c_dropped} goals (sb unchanged) "
        f"| D:{d_dropped} goals (evidence<2) "
        f"| B1:{b1_dropped} saves (Goal-action near goal) "
        f"| B2:{b2_dropped} dist (near save/goal) "
        f"| E:{e_dropped} dist (dupe trigger+dir within 30s)",
        flush=True,
    )
    return goals, saves, distribution


def _render_prompt(template: str, vars: dict) -> str:
    out = template
    for k, v in vars.items():
        out = out.replace("{{" + k + "}}", str(v or "(unspecified)"))
    return out


# ============================================================================
# Calibration + spatial — port of worker/app.py logic (Supabase-backed)
# ============================================================================

def _build_calibration_preamble(sb, coach_id: str, limit: int = 30) -> str:
    """Per-coach calibration preamble. Pulls the coach's most-recent N
    correction rows and emits a compact natural-language summary that nudges
    Gemini toward this coach's observed judgment patterns."""
    try:
        res = sb.table("coach_corrections").select(
            "correction_type, gemini_value, coach_value, match_metadata, created_at"
        ).eq("coach_id", coach_id).order("created_at", desc=True).limit(limit).execute()
        rows = res.data or []
    except Exception as e:
        print(f"[calibration] could not fetch corrections: {e}", flush=True)
        return ""

    if not rows:
        return ""

    # Bucket by correction_type, summarise the dominant patterns. Conservative
    # output (a few bullets) — too verbose pushes Gemini toward over-fitting
    # to recent corrections instead of the actual video evidence.
    from collections import Counter
    types = Counter(r.get("correction_type") for r in rows)
    lines = ["# CALIBRATION — your prior corrections", ""]
    for t, n in types.most_common(5):
        if not t:
            continue
        lines.append(f"- `{t}` × {n}")
    return "\n".join(lines) + "\n"


def _build_spatial_calibration(meta: dict) -> str:
    """Field-size calibration based on age group / field size."""
    age = (meta or {}).get("age_group")
    field = (meta or {}).get("field_size")
    if not age and not field:
        return ""
    notes = ["# SPATIAL CALIBRATION", ""]
    if age:
        notes.append(f"- Match age group: {age}.")
    if field:
        notes.append(f"- Field size: {field}.")
    notes.append("- Goal dimensions and box size scale to the age group. Do not assume senior dimensions.")
    return "\n".join(notes) + "\n"


# ============================================================================
# Chunk planning — virtual chunks (no ffmpeg split, just byte offsets)
# ============================================================================

def _video_duration_seconds(local_path: str) -> int:
    import subprocess
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", local_path],
        capture_output=True, text=True, check=True,
    )
    return int(round(float(r.stdout.strip())))


def _plan_chunks(duration_sec: int, chunk_duration_sec: int = 300) -> list:
    chunks, cursor, idx = [], 0, 0
    while cursor < duration_sec:
        end = min(cursor + chunk_duration_sec, duration_sec)
        chunks.append({"index": idx, "start_sec": cursor, "end_sec": end})
        idx += 1
        cursor = end
    return chunks


# ============================================================================
# GCP / GCS bootstrap
# ============================================================================

def _init_gcp_credentials():
    """Parse GOOGLE_APPLICATION_CREDENTIALS_JSON, re-serialize canonically,
    write to a temp file, and point GOOGLE_APPLICATION_CREDENTIALS at it.

    Re-serialization is important: pastes through web UIs (Modal dashboard)
    can introduce stray whitespace, BOM markers, or escape inconsistencies
    that break downstream credential parsers. Round-tripping through json
    normalises all that. If parsing fails, raise with a useful debug
    snippet so we can fix the secret without ssh-ing into a container.
    """
    import tempfile
    if os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") and \
       os.path.exists(os.environ["GOOGLE_APPLICATION_CREDENTIALS"]):
        return
    raw = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    if not raw:
        raise RuntimeError("GOOGLE_APPLICATION_CREDENTIALS_JSON missing in Modal secret")
    # Defensive parse: some web-UI paste paths (including Modal's secret
    # dashboard form, as observed on 2026-05-22) strip the outer `{` and `}`
    # braces from JSON values. If raw parsing fails, try wrapping the
    # content in braces before reporting the user-facing error.
    creds = None
    parse_err = None
    raw_stripped = raw.strip()
    candidates = [raw_stripped]
    if not (raw_stripped.startswith("{") and raw_stripped.endswith("}")):
        candidates.append("{" + raw_stripped + "}")
    for candidate in candidates:
        try:
            creds = json.loads(candidate)
            break
        except json.JSONDecodeError as e:
            parse_err = e
    if creds is None:
        head = raw[:80].replace("\n", "\\n").replace("\r", "\\r")
        tail = raw[-40:].replace("\n", "\\n").replace("\r", "\\r")
        raise RuntimeError(
            f"GOOGLE_APPLICATION_CREDENTIALS_JSON does not parse: {parse_err}. "
            f"length={len(raw)}, head={head!r}, tail={tail!r}. "
            f"Expected a JSON object starting with '{{\"type\": \"service_account\", ...'. "
            f"Re-paste the full contents of .gcp-key.json into the Modal secret value, "
            f"ensuring both opening {{ and closing }} braces are included."
        )
    if not isinstance(creds, dict) or creds.get("type") != "service_account":
        raise RuntimeError(
            f"GOOGLE_APPLICATION_CREDENTIALS_JSON parsed but is not a service-account dict. "
            f"keys={list(creds.keys()) if isinstance(creds, dict) else type(creds).__name__}"
        )
    f = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
    json.dump(creds, f)
    f.close()
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = f.name
    print(f"[gcp] credentials written ({len(raw)} bytes raw, sa={creds.get('client_email')})", flush=True)


def _ensure_video_in_gcs(local_path: str, job_id: str) -> str:
    """Idempotent: returns gs:// URI of the video. If an object of the same
    size exists at the destination, skip the upload."""
    from google.cloud import storage
    bucket_name = os.environ["GCS_TRAINING_BUCKET"]
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob_name = f"match-videos/{job_id}.mp4"
    blob = bucket.blob(blob_name)
    local_size = os.path.getsize(local_path)
    if blob.exists():
        blob.reload()
        if blob.size == local_size:
            print(f"[gcs] cache hit: gs://{bucket_name}/{blob_name}", flush=True)
            return f"gs://{bucket_name}/{blob_name}"
        print(f"[gcs] size mismatch (local={local_size} remote={blob.size}) — re-uploading", flush=True)
    blob.upload_from_filename(local_path, content_type="video/mp4")
    print(f"[gcs] uploaded {local_size / 1024 / 1024:.0f} MB -> gs://{bucket_name}/{blob_name}", flush=True)
    return f"gs://{bucket_name}/{blob_name}"


# ============================================================================
# Gemini chunked + cached call helpers
# ============================================================================

def _generate_with_retry(client, model, contents, config, label):
    """Shared retry loop for generate_content."""
    import time as _t
    last_err = None
    for attempt in range(1, 4):
        try:
            return client.models.generate_content(model=model, contents=contents, config=config)
        except Exception as e:
            last_err = e
            msg = str(e)
            if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
                raise
            if not any(k in msg for k in ("503", "500", "UNAVAILABLE", "DEADLINE_EXCEEDED")):
                raise
            wait = attempt * 20
            print(f"  [{label}] transient ({msg[:80]}); wait {wait}s", flush=True)
            _t.sleep(wait)
    raise last_err or RuntimeError("All retries failed")


def _chunk_call(client, model, file_uri, chunk, prompt_text, schema, cache_name):
    """One chunk × one prompt. Cache holds video+chunk_metadata (+shared
    context if we put it there); per-call payload is just the prompt text."""
    from google.genai import types as gtypes
    contents = [gtypes.Part(text=prompt_text)] if cache_name else [
        gtypes.Part(
            file_data=gtypes.FileData(file_uri=file_uri, mime_type="video/mp4"),
            video_metadata=gtypes.VideoMetadata(
                start_offset=f"{chunk['start_sec']}s",
                end_offset=f"{chunk['end_sec']}s",
            ),
        ),
        gtypes.Part(text=prompt_text),
    ]
    config = gtypes.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=schema,
        media_resolution=gtypes.MediaResolution.MEDIA_RESOLUTION_MEDIUM,
        thinking_config=gtypes.ThinkingConfig(thinking_budget=0),
        cached_content=cache_name,
    )
    resp = _generate_with_retry(
        client, model, contents, config,
        label=f"chunk {chunk['index']}",
    )
    try:
        parsed = json.loads(resp.text or "")
    except Exception:
        parsed = None
    usage = getattr(resp, "usage_metadata", None)
    usage_dict = None
    if usage is not None:
        usage_dict = {
            "total_token_count": getattr(usage, "total_token_count", None),
            "prompt_token_count": getattr(usage, "prompt_token_count", None),
            "candidates_token_count": getattr(usage, "candidates_token_count", None),
            "cached_content_token_count": getattr(usage, "cached_content_token_count", None),
        }
    return {"raw": resp.text or "", "parsed": parsed, "usage": usage_dict}


def _create_chunk_cache(client, model, file_uri, chunk, shared_text, ttl_seconds=600):
    """Create a per-chunk CachedContent containing the video slice + any
    shared context (calibration, spatial, encyclopedia). All 3 prompts for
    this chunk read from this cache; we delete it immediately after."""
    from google.genai import types as gtypes
    parts = [
        gtypes.Part(
            file_data=gtypes.FileData(file_uri=file_uri, mime_type="video/mp4"),
            video_metadata=gtypes.VideoMetadata(
                start_offset=f"{chunk['start_sec']}s",
                end_offset=f"{chunk['end_sec']}s",
            ),
        ),
    ]
    if shared_text:
        parts.append(gtypes.Part(text=shared_text))
    cfg = gtypes.CreateCachedContentConfig(
        contents=[gtypes.Content(role="user", parts=parts)],
        ttl=f"{ttl_seconds}s",
        display_name=f"prod-chunk-{chunk['index']}",
    )
    return client.caches.create(model=model, config=cfg)


def _merge_chunks(section, list_key, chunk_results, chunks):
    """Aggregate per-chunk parsed results into one production-shape section:
       { raw, parsed: {<list_key>: [...global ts events...]}, usage: {sum} }
    Per-chunk events are also returned so the manifest can preserve them
    (Phase 3 SFT consumes per-chunk pairs)."""
    all_events = []
    per_chunk_events = []
    raws = []
    total = {"total_token_count": 0, "prompt_token_count": 0, "candidates_token_count": 0, "cached_content_token_count": 0}
    for chunk, cr in zip(chunks, chunk_results):
        if cr is None:
            per_chunk_events.append([])
            continue
        raws.append(f"## chunk {chunk['index']} ({chunk['start_sec']}-{chunk['end_sec']}s)\n{cr.get('raw') or ''}")
        u = cr.get("usage") or {}
        for k in total:
            v = u.get(k)
            if isinstance(v, (int, float)):
                total[k] += v
        events = ((cr.get("parsed") or {}).get(list_key) or [])
        # Capture chunk-local copy before offsetting (Phase 3 SFT pair source)
        per_chunk_events.append([dict(e) for e in events])
        for ev in events:
            ts = ev.get("timestamp_seconds")
            if isinstance(ts, (int, float)):
                ev["timestamp_seconds"] = int(ts) + chunk["start_sec"]
            all_events.append(ev)
    return (
        {
            "raw": "\n\n---\n\n".join(raws),
            "parsed": {list_key: all_events},
            "usage": {k: (v if v else None) for k, v in total.items()},
        },
        per_chunk_events,
    )


# ============================================================================
# Main process entrypoint
# ============================================================================

@app.function(image=IMAGE, secrets=[secret], timeout=3600)
def process(job_id: str) -> dict:
    from datetime import datetime, timezone
    from pathlib import Path
    import tempfile
    import time as _t
    import requests
    from supabase import create_client
    from google import genai
    from google.genai import types as gtypes

    _init_gcp_credentials()

    sb = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    job = sb.table("video_jobs").select("*").eq("id", job_id).single().execute().data
    if job["status"] in ("published", "review_needed"):
        return {"job_id": job_id, "skipped": f"already {job['status']}"}
    if job["status"] == "analyzing":
        return {"job_id": job_id, "skipped": "already analyzing"}

    now = lambda: datetime.now(timezone.utc).isoformat()

    sb.table("video_jobs").update({
        "status": "analyzing",
        "started_at": now(),
    }).eq("id", job_id).execute()

    try:
        meta = job.get("match_metadata") or {}
        model_name = os.environ.get("GEMINI_MODEL_V2", "gemini-2.5-flash")
        chunk_duration = int(meta.get("chunk_duration_sec") or 300)

        # === Build shared context (goes into cache contents) ===
        calibration = _build_calibration_preamble(sb, job["coach_id"])
        encyclopedia_path = Path("/root/prompts/gk_techniques.md")
        encyclopedia_text = ""
        if encyclopedia_path.exists():
            encyclopedia_text = (
                "\n\n---\n\n# REFERENCE — STIX Goalkeeper Technique Encyclopedia\n\n"
                "Use the technique names from this reference when describing GK actions. "
                "Do not invent vocabulary; if a technique you observe is not in this reference, "
                "describe it in plain observables.\n\n"
                + encyclopedia_path.read_text(encoding="utf-8")
            )
        spatial_calibration = _build_spatial_calibration(meta)
        shared_text = (
            (spatial_calibration + "\n\n---\n\n" if spatial_calibration else "") +
            (calibration + "\n\n---\n\n" if calibration else "") +
            encyclopedia_text
        )

        # === Download video locally then push to GCS (idempotent) ===
        t0 = _t.time()
        print(f"[download] fetching video from storage...", flush=True)
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            r = requests.get(job["video_url"], stream=True, timeout=600)
            r.raise_for_status()
            for c in r.iter_content(chunk_size=1024 * 1024):
                f.write(c)
            local_path = f.name
        size_mb = os.path.getsize(local_path) / 1024 / 1024
        print(f"[download] {size_mb:.0f} MB in {_t.time() - t0:.0f}s", flush=True)

        file_uri = _ensure_video_in_gcs(local_path, job_id)

        duration = _video_duration_seconds(local_path)
        chunks = _plan_chunks(duration, chunk_duration)
        print(f"[chunk] {duration}s video -> {len(chunks)} chunks of <= {chunk_duration}s", flush=True)

        # Local file no longer needed once GCS holds the canonical reference.
        try:
            os.unlink(local_path)
        except OSError:
            pass

        # === Vertex client ===
        client = genai.Client(
            vertexai=True,
            project=os.environ["GOOGLE_CLOUD_PROJECT"],
            location=os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1"),
        )

        # === Per-chunk loop ===
        # For each chunk: create cache, run 3 prompts against it, delete cache.
        # Cache holds video + shared context; per-call payload is just the
        # per-prompt instruction. Bench measured this at ~$0.23/match.
        prompt_specs = [
            ("goals", Path("/root/prompts/goals.md"), GOALS_RESPONSE_SCHEMA),
            ("saves", Path("/root/prompts/saves.md"), SAVES_RESPONSE_SCHEMA),
            ("distribution", Path("/root/prompts/distribution.md"), DISTRIBUTION_RESPONSE_SCHEMA),
        ]
        available_prompts = [(s, p, sc) for s, p, sc in prompt_specs if p.exists()]
        for s, p, _ in prompt_specs:
            if not p.exists():
                print(f"[skip] {s} (prompt {p.name} missing)", flush=True)

        chunk_section_results = {c["index"]: {} for c in chunks}

        chunk_offset_note = lambda chunk: (
            f"\n\n---\n\n# CHUNK CONTEXT\n\n"
            f"This video segment covers minutes {chunk['start_sec'] // 60}:{chunk['start_sec'] % 60:02d} "
            f"to {chunk['end_sec'] // 60}:{chunk['end_sec'] % 60:02d} of the full match. "
            f"Return every `timestamp_seconds` value RELATIVE TO THE START OF THIS SEGMENT "
            f"(0 = segment start). The worker will offset back to the global match timeline."
        )

        vars_dict = {
            "my_team_color": meta.get("my_team_color"),
            "my_keeper_color": meta.get("my_keeper_color"),
            "opponent_color": meta.get("opponent_color"),
        }

        for chunk in chunks:
            print(f"[chunk {chunk['index']}] creating cache ({chunk['start_sec']}-{chunk['end_sec']}s)...", flush=True)
            t_c = _t.time()
            cache_obj = _create_chunk_cache(client, model_name, file_uri, chunk, shared_text, ttl_seconds=600)
            cache_name = cache_obj.name
            print(f"  -> cache {cache_name.split('/')[-1]} in {_t.time() - t_c:.0f}s", flush=True)
            try:
                for section, ppath, schema in available_prompts:
                    template = ppath.read_text(encoding="utf-8")
                    rendered = _render_prompt(template, vars_dict) + chunk_offset_note(chunk)
                    print(f"  {section}.md...", flush=True)
                    t0 = _t.time()
                    cr = _chunk_call(client, model_name, file_uri, chunk, rendered, schema, cache_name)
                    cnt = len(((cr.get("parsed") or {}).get(section, []) or []))
                    cached_tok = (cr.get("usage") or {}).get("cached_content_token_count") or 0
                    print(f"  -> {cnt} events in {_t.time() - t0:.0f}s (cached_tok={cached_tok})", flush=True)
                    chunk_section_results[chunk["index"]][section] = cr
            finally:
                try:
                    client.caches.delete(name=cache_name)
                except Exception as e:
                    print(f"  [warn] cache cleanup failed for {cache_name}: {e}", flush=True)

        # === Merge per-chunk -> per-section, offset to global timeline ===
        section_results = {}
        per_chunk_meta_events = {}
        for section, _, _ in available_prompts:
            list_key = section  # goals/saves/distribution have matching list_key
            per_chunk = [chunk_section_results[c["index"]].get(section) for c in chunks]
            merged, per_chunk_events = _merge_chunks(section, list_key, per_chunk, chunks)
            section_results[section] = merged
            per_chunk_meta_events[section] = per_chunk_events

        # Low-signal saves filter (model-agnostic; identical to legacy worker)
        if "saves" in section_results and section_results["saves"].get("parsed"):
            saves = section_results["saves"]["parsed"].get("saves", [])
            section_results["saves"]["parsed"]["saves"] = _filter_low_signal_saves(saves)

        # Cross-event reconciliation
        sp_goals = (section_results.get("goals", {}).get("parsed") or {}).get("goals", [])
        sp_saves = (section_results.get("saves", {}).get("parsed") or {}).get("saves", [])
        sp_dist  = (section_results.get("distribution", {}).get("parsed") or {}).get("distribution", [])
        sp_goals, sp_saves, sp_dist = _reconcile_events(sp_goals, sp_saves, sp_dist)
        if "goals" in section_results and section_results["goals"].get("parsed") is not None:
            section_results["goals"]["parsed"]["goals"] = sp_goals
        if "saves" in section_results and section_results["saves"].get("parsed") is not None:
            section_results["saves"]["parsed"]["saves"] = sp_saves
        if "distribution" in section_results and section_results["distribution"].get("parsed") is not None:
            section_results["distribution"]["parsed"]["distribution"] = sp_dist

        # === Build gemini_output payload — same shape the review screen expects ===
        goals_result = section_results.get("goals", {})
        gemini_output = {
            "model": model_name,
            "backend": "vertex",
            "chunked": True,
            "cached": True,
            "n_chunks": len(chunks),
            "chunk_duration_sec": chunk_duration,
            "goals": goals_result,
            # Top-level shortcuts for the review screen / dashboard which read
            # gemini_output.parsed.goals + .saves.parsed.saves + .distribution.parsed.distribution
            "raw": goals_result.get("raw"),
            "parsed": goals_result.get("parsed"),
            "usage": goals_result.get("usage"),
        }
        if "saves" in section_results:
            gemini_output["saves"] = section_results["saves"]
        if "distribution" in section_results:
            gemini_output["distribution"] = section_results["distribution"]

        # Phase 3 SFT-ready: per-chunk events (chunk-local timestamps)
        # alongside the global-offset section results.
        gemini_output["chunks"] = [
            {
                "index": c["index"],
                "start_sec": c["start_sec"],
                "end_sec": c["end_sec"],
                "events_per_section": {
                    sec: per_chunk_meta_events.get(sec, [[]] * len(chunks))[c["index"]]
                    for sec, _, _ in available_prompts
                },
            }
            for c in chunks
        ]
        gemini_output["video_uri"] = file_uri

        sb.table("video_jobs").update({
            "status": "review_needed",
            "gemini_output": gemini_output,
            "finished_at": now(),
        }).eq("id", job_id).execute()

        return {
            "job_id": job_id,
            "status": "review_needed",
            "backend": "vertex",
            "model": model_name,
            "n_chunks": len(chunks),
            "goals_detected": len(sp_goals),
            "saves_detected": len(sp_saves) if section_results.get("saves") else None,
            "distribution_detected": len(sp_dist) if section_results.get("distribution") else None,
        }

    except Exception as e:
        sb.table("video_jobs").update({
            "status": "failed",
            "error_message": str(e)[:4000],
            "retry_count": (job.get("retry_count") or 0) + 1,
            "finished_at": now(),
        }).eq("id", job_id).execute()
        raise


# ============================================================================
# Janitor — sweep stuck 'analyzing' jobs older than 65 minutes
# ============================================================================

@app.function(image=IMAGE, secrets=[secret], schedule=modal.Period(minutes=10))
def janitor() -> dict:
    from datetime import datetime, timezone, timedelta
    from supabase import create_client
    sb = create_client(
        os.environ["NEXT_PUBLIC_SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=65)).isoformat()
    res = sb.table("video_jobs").select("id, started_at").eq("status", "analyzing").lt("started_at", cutoff).execute()
    stale = res.data or []
    for j in stale:
        sb.table("video_jobs").update({
            "status": "failed",
            "error_message": f"Worker stuck — janitor swept after >65min in analyzing (started_at={j['started_at']})",
            "finished_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", j["id"]).execute()
    return {"swept": len(stale)}


# ============================================================================
# HTTP trigger
# ============================================================================

@app.function(image=IMAGE, secrets=[secret])
@modal.fastapi_endpoint(method="POST")
def trigger(payload: dict, x_trigger_secret: str = Header(default="")):
    """POST {job_id}, X-Trigger-Secret header. Same shape as the legacy
    worker's /trigger so Vercel's MODAL_TRIGGER_URL can swap to this URL
    once we're ready to cutover."""
    expected = os.environ.get("MODAL_TRIGGER_SECRET", "")
    if not expected or x_trigger_secret != expected:
        return {"error": "Forbidden"}, 403
    job_id = (payload or {}).get("job_id")
    if not job_id:
        return {"error": "job_id required"}, 400
    process.spawn(job_id)
    return {"ok": True, "job_id": job_id, "backend": "vertex"}
