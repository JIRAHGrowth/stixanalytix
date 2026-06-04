"""
Bench job runner v2 — google.genai SDK + virtual chunking + explicit media_resolution.

This is the Phase 1 destination shape: same SDK we'll use against Vertex AI,
same chunked-inference pattern that aligns with Vertex SFT's training data
format. The chunking is "virtual" — one Files API upload, multiple
generate_content calls each with `video_metadata.start_offset/end_offset`
so the model only sees that slice. No ffmpeg splitting required.

Currently runs against the AI Studio backend (api_key auth). When the
Vertex project is provisioned, the same code switches to Vertex by
constructing the Client with `vertexai=True, project=..., location=...`.

Usage:
    python scripts/run-bench-job-v2.py \
        --video /abs/path/match.mp4 \
        --model gemini-2.5-flash \
        --out scripts/bench-results/<match-key>/<model>.v2.json \
        --media-resolution MEDIUM \
        --chunk-duration-sec 300 \
        [--vars-json scripts/ground-truth/<match-key>.json]

Output JSON shape mirrors run-bench-job.py (gemini_output-shape) so
eval-match.js scores it without changes. Adds:
    gemini_output.bench_meta.chunks = [{ index, start, end, events_per_section }, ...]
    gemini_output.bench_meta.media_resolution = "MEDIUM"
    gemini_output.bench_meta.sdk = "google.genai"
    gemini_output.bench_meta.backend = "ai_studio" | "vertex"
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

try:
    from google import genai
    from google.genai import types as gtypes
    from dotenv import load_dotenv
except ImportError as e:
    print(f"Missing dep ({e}). Run: pip install google-genai python-dotenv", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "worker"))

# Reuse production schemas + reconciliation; never duplicate.
try:
    from app import (
        GOALS_RESPONSE_SCHEMA,
        SAVES_RESPONSE_SCHEMA,
        DISTRIBUTION_RESPONSE_SCHEMA,
        _render_prompt,
        _filter_low_signal_saves,
        _reconcile_events,
    )
except Exception as e:
    print(f"Could not import schemas from worker/app.py: {e}", file=sys.stderr)
    sys.exit(1)


MEDIA_RESOLUTION_MAP = {
    "LOW":     gtypes.MediaResolution.MEDIA_RESOLUTION_LOW,
    "MEDIUM":  gtypes.MediaResolution.MEDIA_RESOLUTION_MEDIUM,
    "HIGH":    gtypes.MediaResolution.MEDIA_RESOLUTION_HIGH,
    "DEFAULT": gtypes.MediaResolution.MEDIA_RESOLUTION_UNSPECIFIED,
}

# Per-section helpers — eval-match.js reads goals.parsed.goals[], saves.parsed.saves[], etc.
SECTION_TO_LISTKEY = {"goals": "goals", "saves": "saves", "distribution": "distribution"}


@dataclass
class ChunkWindow:
    index: int
    start_sec: int
    end_sec: int  # exclusive


def utc_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fmt_min(seconds: float) -> str:
    return f"{seconds / 60:.1f} min"


def get_video_duration_seconds(path: Path) -> int:
    """ffprobe the video duration. Required for chunk planning."""
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=True,
    )
    return int(round(float(r.stdout.strip())))


def _gcloud_cmd_path() -> str:
    """Resolve the gcloud CLI path. Windows winget puts it in user AppData
    where the bash subshell doesn't see it on PATH."""
    candidates = [
        os.environ.get("GCLOUD_PATH"),
        "gcloud",
        "C:/Users/joshu/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd",
    ]
    for c in candidates:
        if not c:
            continue
        try:
            subprocess.run([c, "--version"], capture_output=True, check=True, timeout=10)
            return c
        except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
            continue
    raise RuntimeError("gcloud CLI not found; required for --use-vertex GCS upload")


def ensure_video_in_gcs(local_path: Path, bucket: str) -> str:
    """Idempotent upload of a local video to gs://bucket/bench-videos/<basename>.
    Returns the gs:// URI. Skips upload if the object already exists with the
    same size (cheap stat check, no etag verification).

    Vertex generate_content requires gs:// references for video — the AI Studio
    Files API isn't supported. We reuse the SFT training bucket for inference
    too; the path convention is bench-videos/ for raw match files.
    """
    gcloud = _gcloud_cmd_path()
    blob = f"bench-videos/{local_path.name}"
    gs_uri = f"gs://{bucket}/{blob}"

    # Check if remote object already exists at correct size
    local_size = local_path.stat().st_size
    try:
        r = subprocess.run(
            [gcloud, "storage", "objects", "describe", gs_uri, "--format=value(size)"],
            capture_output=True, text=True, timeout=30,
        )
        if r.returncode == 0 and r.stdout.strip():
            remote_size = int(r.stdout.strip())
            if remote_size == local_size:
                print(f"  [gcs] cache hit: {gs_uri} ({remote_size} bytes)")
                return gs_uri
            print(f"  [gcs] size mismatch (local={local_size}, remote={remote_size}); re-uploading")
    except (subprocess.TimeoutExpired, ValueError):
        pass

    print(f"  [gcs] uploading {local_path.name} ({local_size / 1024 / 1024:.0f} MB) -> {gs_uri}")
    t0 = time.time()
    subprocess.run(
        [gcloud, "storage", "cp", str(local_path), gs_uri],
        check=True,
    )
    print(f"  [gcs] uploaded in {fmt_min(time.time() - t0)}")
    return gs_uri


def plan_chunks(duration_sec: int, chunk_duration_sec: int) -> list[ChunkWindow]:
    chunks = []
    cursor = 0
    idx = 0
    while cursor < duration_sec:
        end = min(cursor + chunk_duration_sec, duration_sec)
        chunks.append(ChunkWindow(index=idx, start_sec=cursor, end_sec=end))
        idx += 1
        cursor = end
    return chunks


def load_template_vars(p: Path | None) -> dict:
    if not p:
        return {"my_team_color": None, "my_keeper_color": None, "opponent_color": None}
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {"my_team_color": None, "my_keeper_color": None, "opponent_color": None}
    return {
        "my_team_color": d.get("my_team_color"),
        "my_keeper_color": d.get("my_keeper_color"),
        "opponent_color": d.get("opponent_color"),
    }


def render_chunk_prompt(template: str, vars: dict, chunk: ChunkWindow) -> str:
    """Render the base prompt + append a small chunk-scope note so the model
    knows it's looking at a slice and returns timestamps within the segment.
    We then offset to global timeline ourselves."""
    base = _render_prompt(template, vars)
    chunk_note = (
        f"\n\n---\n\n# CHUNK CONTEXT\n\n"
        f"This video segment covers minutes {chunk.start_sec // 60}:{chunk.start_sec % 60:02d} "
        f"to {chunk.end_sec // 60}:{chunk.end_sec % 60:02d} of the full match "
        f"(segment duration {chunk.end_sec - chunk.start_sec}s). Return every "
        f"`timestamp_seconds` value RELATIVE TO THE START OF THIS SEGMENT "
        f"(0 = segment start, max = segment duration). The harness will offset "
        f"timestamps back to the global match timeline."
    )
    return base + chunk_note


def _build_generate_config(
    schema: dict,
    media_resolution: gtypes.MediaResolution,
    cached_content_name: str | None,
    model: str,
) -> gtypes.GenerateContentConfig:
    """Build the GenerateContentConfig.

    thinking_budget=0 disables thinking — right for deterministic JSON
    extraction per Google's SFT tuning docs, but only Flash variants support
    setting it to 0. Pro models reject thinking_budget=0 with INVALID_ARGUMENT
    on Vertex, so we omit thinking_config for them and let the default apply.

    cached_content (if set) prepends a Vertex cache containing the video +
    chunk_metadata so video tokens aren't re-billed per call.
    """
    thinking_config = None
    if "flash" in model.lower():
        thinking_config = gtypes.ThinkingConfig(thinking_budget=0)
    return gtypes.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=schema,
        media_resolution=media_resolution,
        thinking_config=thinking_config,
        cached_content=cached_content_name,
    )


def _generate_with_retry(
    client: genai.Client,
    model: str,
    contents: list,
    config: gtypes.GenerateContentConfig,
    label: str,
) -> dict:
    """Shared retry + parse loop for any generate_content call."""
    t0 = time.time()
    last_err = None
    resp = None
    for attempt in range(1, 4):
        try:
            resp = client.models.generate_content(model=model, contents=contents, config=config)
            break
        except Exception as e:
            last_err = e
            msg = str(e)
            if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
                print(f"  [{label}] rate limit/quota; stopping.", file=sys.stderr)
                raise
            transient = any(k in msg for k in ("503", "500", "UNAVAILABLE", "DEADLINE_EXCEEDED"))
            if not transient:
                raise
            wait = attempt * 20
            print(f"  [{label}] transient ({msg[:80]}); wait {wait}s")
            time.sleep(wait)
    if resp is None:
        raise last_err or RuntimeError("All attempts failed")

    elapsed = time.time() - t0
    raw_text = resp.text or ""
    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError:
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
    return {"raw": raw_text, "parsed": parsed, "usage": usage_dict, "elapsed_sec": round(elapsed, 1)}


def run_one_chunk_prompt(
    client: genai.Client,
    model: str,
    file_uri: str,
    prompt_path: Path,
    schema: dict,
    vars: dict,
    chunk: ChunkWindow,
    media_resolution: gtypes.MediaResolution,
    cached_content_name: str | None = None,
) -> dict:
    """Run one prompt against a single virtual chunk of the uploaded video.
    `file_uri` is either an AI-Studio Files API URI or a gs:// URI.
    If `cached_content_name` is set, the chunk's video Part is OMITTED — the
    cache already contains video+chunk_metadata — and only the prompt text
    is sent fresh per call.
    """
    template = prompt_path.read_text(encoding="utf-8")
    prompt = render_chunk_prompt(template, vars, chunk)

    if cached_content_name:
        # Cache already contains video+offset; just send the prompt text.
        contents = [gtypes.Part(text=prompt)]
    else:
        contents = [
            gtypes.Part(
                file_data=gtypes.FileData(file_uri=file_uri, mime_type="video/mp4"),
                video_metadata=gtypes.VideoMetadata(
                    start_offset=f"{chunk.start_sec}s",
                    end_offset=f"{chunk.end_sec}s",
                ),
            ),
            gtypes.Part(text=prompt),
        ]

    config = _build_generate_config(schema, media_resolution, cached_content_name, model)
    return _generate_with_retry(
        client, model, contents, config,
        label=f"chunk {chunk.index} {prompt_path.name}",
    )


def create_chunk_cache(
    client: genai.Client,
    model: str,
    file_uri: str,
    chunk: ChunkWindow,
    media_resolution: gtypes.MediaResolution,
    ttl_seconds: int = 600,
):
    """Create a Vertex CachedContent holding the chunk's video slice. Returns
    the CachedContent object (use .name to reference). The cache holds the
    video file + chunk_metadata so all 3 prompts for that chunk share the same
    pre-processed video tokens.

    Vertex 2.5 Flash minimum cache size is 4,096 tokens. A 5-min chunk at
    MEDIUM is ~76,800 video tokens — well above the floor.
    """
    video_part = gtypes.Part(
        file_data=gtypes.FileData(file_uri=file_uri, mime_type="video/mp4"),
        video_metadata=gtypes.VideoMetadata(
            start_offset=f"{chunk.start_sec}s",
            end_offset=f"{chunk.end_sec}s",
        ),
    )
    cfg = gtypes.CreateCachedContentConfig(
        contents=[gtypes.Content(role="user", parts=[video_part])],
        ttl=f"{ttl_seconds}s",
        display_name=f"bench-chunk-{chunk.index}",
    )
    return client.caches.create(model=model, config=cfg)


def merge_chunk_results(
    section: str,                  # "goals" | "saves" | "distribution"
    chunk_results: list[dict],     # list of run_one_chunk_prompt outputs (in chunk order)
    chunks: list[ChunkWindow],
) -> dict:
    """Aggregate per-chunk results into one production-shape section payload:
    { raw: '...', parsed: { <section_key>: [...global ts events...] }, usage: {...summed} }
    """
    list_key = SECTION_TO_LISTKEY[section]
    all_events: list[dict] = []
    total = {"total_token_count": 0, "prompt_token_count": 0, "candidates_token_count": 0, "cached_content_token_count": 0}
    raws = []

    for chunk, cr in zip(chunks, chunk_results):
        if cr is None:
            continue
        raws.append(f"## chunk {chunk.index} ({chunk.start_sec}-{chunk.end_sec}s)\n{cr.get('raw') or ''}")
        u = cr.get("usage") or {}
        for k in total:
            v = u.get(k)
            if isinstance(v, (int, float)):
                total[k] += v
        parsed = cr.get("parsed") or {}
        events = parsed.get(list_key) or []
        # Offset chunk-local timestamps to global match timeline.
        for ev in events:
            ts = ev.get("timestamp_seconds")
            if isinstance(ts, (int, float)):
                ev["timestamp_seconds"] = int(ts) + chunk.start_sec
            all_events.append(ev)

    return {
        "raw": "\n\n---\n\n".join(raws),
        "parsed": {list_key: all_events},
        "usage": {k: v if v else None for k, v in total.items()},
    }


def build_reconciled_variant(raw_output: dict) -> dict:
    rec = copy.deepcopy(raw_output)
    g = ((rec.get("goals") or {}).get("parsed") or {}).get("goals") or []
    s = ((rec.get("saves") or {}).get("parsed") or {}).get("saves") or []
    d = ((rec.get("distribution") or {}).get("parsed") or {}).get("distribution") or []
    g2, s2, d2 = _reconcile_events(g, s, d)
    if rec.get("goals") and rec["goals"].get("parsed") is not None:
        rec["goals"]["parsed"]["goals"] = g2
    if rec.get("saves") and rec["saves"].get("parsed") is not None:
        rec["saves"]["parsed"]["saves"] = s2
    if rec.get("distribution") and rec["distribution"].get("parsed") is not None:
        rec["distribution"]["parsed"]["distribution"] = d2
    if rec.get("parsed") and rec.get("goals") and rec["goals"].get("parsed") is not None:
        rec["parsed"] = rec["goals"]["parsed"]
    rec["bench_variant"] = "reconciled"
    return rec


def main() -> int:
    load_dotenv(ROOT / ".env.local")
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--vars-json", default=None)
    parser.add_argument("--media-resolution", default="MEDIUM",
                        choices=list(MEDIA_RESOLUTION_MAP.keys()),
                        help="MEDIUM (5min/chunk limit per Vertex SFT) or LOW (20min/chunk).")
    parser.add_argument("--chunk-duration-sec", type=int, default=300,
                        help="Default 300s (5min) to match Vertex SFT MEDIUM constraint.")
    parser.add_argument("--use-vertex", action="store_true",
                        help="Use Vertex AI backend (requires GOOGLE_CLOUD_PROJECT + auth).")
    parser.add_argument("--enable-caching", action="store_true",
                        help="Vertex-only. Create a per-chunk CachedContent so all 3 prompts "
                             "for that chunk share pre-processed video tokens. Cuts input "
                             "cost ~3x; required for production economics.")
    parser.add_argument("--cache-ttl-sec", type=int, default=600,
                        help="TTL for per-chunk caches (default 600s = 10 min). Set tight to "
                             "avoid paying for idle cache storage.")
    args = parser.parse_args()

    if args.enable_caching and not args.use_vertex:
        print("--enable-caching requires --use-vertex (AI Studio caching is implicit).", file=sys.stderr)
        return 1

    video_path = Path(args.video).resolve()
    if not video_path.is_file():
        print(f"Not a file: {video_path}", file=sys.stderr); return 1
    out_path = Path(args.out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    media_resolution = MEDIA_RESOLUTION_MAP[args.media_resolution]
    # Enforce the Vertex SFT chunk-duration constraint so this harness produces
    # data shaped identically to future training inputs.
    if args.media_resolution == "MEDIUM" and args.chunk_duration_sec > 300:
        print("WARN: MEDIUM media_resolution caps training video at 5 min (300s). "
              "Continuing for inference, but training data must respect this limit.", file=sys.stderr)
    if args.media_resolution == "LOW" and args.chunk_duration_sec > 1200:
        print("WARN: LOW media_resolution caps training video at 20 min (1200s).", file=sys.stderr)

    # Client init — AI Studio for now; Vertex once provisioning lands.
    if args.use_vertex:
        client = genai.Client(
            vertexai=True,
            project=os.environ["GOOGLE_CLOUD_PROJECT"],
            location=os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1"),
        )
        backend = "vertex"
    else:
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            print("GEMINI_API_KEY missing in .env.local", file=sys.stderr); return 1
        client = genai.Client(api_key=api_key)
        backend = "ai_studio"

    bench_key = out_path.stem
    print(f"[{args.model}] {bench_key}  media_res={args.media_resolution}  chunk={args.chunk_duration_sec}s  backend={backend}")
    job_started_at = utc_iso()
    job_t0 = time.time()

    # Plan chunks
    duration = get_video_duration_seconds(video_path)
    chunks = plan_chunks(duration, args.chunk_duration_sec)
    print(f"[{args.model}] video duration {duration}s -> {len(chunks)} chunks of <= {args.chunk_duration_sec}s")

    # Get a video URI the model can read. Path differs by backend:
    #   - AI Studio: Files API upload, wait for ACTIVE state, use the file URI
    #   - Vertex AI: GCS upload (Files API not supported), use gs:// URI
    # Both paths return a string URI passed to FileData.file_uri downstream.
    file_uri: str
    uploaded_handle = None  # AI-Studio only; needed for cleanup
    if args.use_vertex:
        bucket = os.environ.get("GCS_TRAINING_BUCKET")
        if not bucket:
            print("GCS_TRAINING_BUCKET missing in .env.local (required for --use-vertex)", file=sys.stderr)
            return 1
        print(f"[{args.model}] resolving video in GCS bucket {bucket}...")
        file_uri = ensure_video_in_gcs(video_path, bucket)
    else:
        print(f"[{args.model}] uploading via Files API (one-time, {video_path.stat().st_size / 1024 / 1024:.0f} MB)...")
        t_up = time.time()
        uploaded_handle = client.files.upload(
            file=str(video_path),
            config=gtypes.UploadFileConfig(mime_type="video/mp4", display_name=f"bench v2 {bench_key}"),
        )
        print(f"[{args.model}] uploaded in {fmt_min(time.time() - t_up)} -> {uploaded_handle.uri}")
        # Wait for ACTIVE state — only required on AI Studio Files API
        print(f"[{args.model}] waiting for Gemini file processing...")
        t_proc = time.time()
        while True:
            f = client.files.get(name=uploaded_handle.name)
            state = f.state.name if hasattr(f.state, "name") else str(f.state)
            if state == "ACTIVE":
                uploaded_handle = f
                break
            if state == "FAILED":
                print(f"File processing failed: {state}", file=sys.stderr); return 1
            sys.stdout.write("."); sys.stdout.flush()
            time.sleep(10)
        print(f"\n[{args.model}] file ACTIVE in {fmt_min(time.time() - t_proc)}")
        file_uri = uploaded_handle.uri

    template_vars = load_template_vars(Path(args.vars_json).resolve() if args.vars_json else None)

    prompt_specs = [
        ("goals", ROOT / "prompts" / "goals.md", GOALS_RESPONSE_SCHEMA),
        ("saves", ROOT / "prompts" / "saves.md", SAVES_RESPONSE_SCHEMA),
        ("distribution", ROOT / "prompts" / "distribution.md", DISTRIBUTION_RESPONSE_SCHEMA),
    ]

    # Chunk-major loop: for each chunk, (optionally) create a cache holding the
    # video slice, then run all 3 prompts against that cache, then delete it.
    # This is the production-faithful shape — caches are short-lived per match.
    available_prompts = [(s, p, sc) for s, p, sc in prompt_specs if p.exists()]
    for s, p, _ in prompt_specs:
        if not p.exists():
            print(f"[{args.model}] skip {s} (prompt {p.name} missing)")

    # Build per-chunk × per-section result matrix
    chunk_section_results: dict[int, dict[str, dict]] = {chunk.index: {} for chunk in chunks}
    chunk_meta = []

    for chunk in chunks:
        cache_obj = None
        cache_label = "no-cache"
        if args.enable_caching:
            print(f"[{args.model}] chunk {chunk.index}: creating cache ({chunk.start_sec}-{chunk.end_sec}s, ttl={args.cache_ttl_sec}s)...")
            t_c = time.time()
            cache_obj = create_chunk_cache(
                client, args.model, file_uri, chunk, media_resolution, ttl_seconds=args.cache_ttl_sec,
            )
            cache_label = f"cache={cache_obj.name.split('/')[-1]}"
            print(f"  -> {cache_label} created in {time.time() - t_c:.1f}s")

        try:
            for section, ppath, schema in available_prompts:
                print(f"[{args.model}] chunk {chunk.index} {section}.md {cache_label}...")
                cr = run_one_chunk_prompt(
                    client, args.model, file_uri, ppath, schema, template_vars, chunk,
                    media_resolution,
                    cached_content_name=(cache_obj.name if cache_obj else None),
                )
                n = len((cr.get("parsed") or {}).get(SECTION_TO_LISTKEY[section], []) or [])
                cached_used = (cr.get("usage") or {}).get("cached_content_token_count") or 0
                print(f"  -> {n} events in {cr['elapsed_sec']}s (cached_tok={cached_used})")
                chunk_section_results[chunk.index][section] = cr
        finally:
            if cache_obj is not None:
                try:
                    client.caches.delete(name=cache_obj.name)
                except Exception as e:
                    print(f"  [warn] cache cleanup failed for {cache_obj.name}: {e}", file=sys.stderr)

        chunk_meta.append({
            "index": chunk.index,
            "start_sec": chunk.start_sec,
            "end_sec": chunk.end_sec,
            "cache_used": cache_obj is not None,
        })

    # Reshape chunk-major -> section-major for merge_chunk_results
    section_results: dict[str, dict] = {}
    for section, _, _ in available_prompts:
        per_chunk = [chunk_section_results[c.index].get(section) for c in chunks]
        section_results[section] = merge_chunk_results(section, per_chunk, chunks)
        # Also preserve per-chunk parsed events on the chunk_meta — directly
        # consumable as Vertex SFT training rows later (no re-derivation needed).
        list_key = SECTION_TO_LISTKEY[section]
        for chunk, cr in zip(chunks, per_chunk):
            if cr is None:
                continue
            chunk_local_events = ((cr.get("parsed") or {}).get(list_key) or [])
            chunk_meta[chunk.index].setdefault("events_per_section", {})[section] = chunk_local_events

    # Apply low-signal saves filter (model-agnostic) just like worker does
    if "saves" in section_results and section_results["saves"].get("parsed"):
        before = len(section_results["saves"]["parsed"].get("saves", []))
        filtered = _filter_low_signal_saves(section_results["saves"]["parsed"].get("saves", []))
        section_results["saves"]["parsed"]["saves"] = filtered
        if before != len(filtered):
            print(f"[{args.model}] saves: {before} -> {len(filtered)} after low-signal filter")

    goals_result = section_results.get("goals", {})
    gemini_output = {
        "model": args.model,
        "bench_key": bench_key,
        "cached": False,
        "bench_variant": "raw",
        "goals": goals_result,
        # Legacy top-level compat
        "raw": goals_result.get("raw"),
        "parsed": goals_result.get("parsed"),
        "usage": goals_result.get("usage"),
    }
    if "saves" in section_results:
        gemini_output["saves"] = section_results["saves"]
    if "distribution" in section_results:
        gemini_output["distribution"] = section_results["distribution"]

    # Reproducibility tags — every scorecard row can be traced back to a
    # specific commit + config. Lets us answer "did precision regress when
    # we changed prompts" with a single diff.
    try:
        commit_sha = subprocess.run(
            ["git", "rev-parse", "HEAD"], capture_output=True, text=True, cwd=ROOT, timeout=5,
        ).stdout.strip()
    except Exception:
        commit_sha = None
    config_payload = {
        "model": args.model,
        "media_resolution": args.media_resolution,
        "chunk_duration_sec": args.chunk_duration_sec,
        "use_vertex": args.use_vertex,
        "enable_caching": args.enable_caching,
        "cache_ttl_sec": args.cache_ttl_sec if args.enable_caching else None,
        "thinking_budget": 0,
        "low_signal_saves_filter": True,
    }
    config_hash = hashlib.sha256(
        json.dumps(config_payload, sort_keys=True).encode("utf-8")
    ).hexdigest()[:12]

    gemini_output["bench_meta"] = {
        "sdk": "google.genai",
        "sdk_version": getattr(genai, "__version__", "?"),
        "commit_sha": commit_sha,
        "config_hash": config_hash,
        "config": config_payload,
        "enable_caching": args.enable_caching,
        "backend": backend,
        "media_resolution": args.media_resolution,
        "chunk_duration_sec": args.chunk_duration_sec,
        "video_path": str(video_path),
        "video_size_bytes": video_path.stat().st_size,
        "video_duration_sec": duration,
        "chunks": chunk_meta,
        "started_at": job_started_at,
        "finished_at": utc_iso(),
        "total_elapsed_sec": round(time.time() - job_t0, 1),
        "template_vars": template_vars,
    }

    out_path.write_text(json.dumps({"gemini_output": gemini_output}, indent=2), encoding="utf-8")
    print(f"[{args.model}] saved -> {out_path.relative_to(ROOT)}  ({fmt_min(time.time() - job_t0)} total)")

    # Reconciled variant (zero extra API cost)
    try:
        rec = build_reconciled_variant(gemini_output)
        rec_path = out_path.with_suffix(".reconciled.json")
        rec_path.write_text(json.dumps({"gemini_output": rec}, indent=2), encoding="utf-8")
        print(f"[{args.model}] reconciled variant -> {rec_path.relative_to(ROOT)}")
    except Exception as e:
        print(f"[{args.model}] reconciliation failed: {e}", file=sys.stderr)

    # Cleanup uploaded Files API entry (AI Studio only). GCS objects we keep
    # so future bench runs hit the cache.
    if uploaded_handle is not None:
        try:
            client.files.delete(name=uploaded_handle.name)
            print(f"[{args.model}] deleted Files API entry")
        except Exception:
            pass

    return 0


if __name__ == "__main__":
    sys.exit(main())
