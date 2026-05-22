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


def run_one_chunk_prompt(
    client: genai.Client,
    model: str,
    uploaded_file,
    prompt_path: Path,
    schema: dict,
    vars: dict,
    chunk: ChunkWindow,
    media_resolution: gtypes.MediaResolution,
) -> dict:
    """Run one prompt against a single virtual chunk of the uploaded video."""
    template = prompt_path.read_text(encoding="utf-8")
    prompt = render_chunk_prompt(template, vars, chunk)

    video_part = gtypes.Part(
        file_data=gtypes.FileData(
            file_uri=uploaded_file.uri,
            mime_type="video/mp4",
        ),
        video_metadata=gtypes.VideoMetadata(
            start_offset=f"{chunk.start_sec}s",
            end_offset=f"{chunk.end_sec}s",
        ),
    )
    text_part = gtypes.Part(text=prompt)

    config = gtypes.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=schema,
        media_resolution=media_resolution,
    )

    t0 = time.time()
    last_err = None
    resp = None
    for attempt in range(1, 4):
        try:
            resp = client.models.generate_content(
                model=model,
                contents=[video_part, text_part],
                config=config,
            )
            break
        except Exception as e:
            last_err = e
            msg = str(e)
            if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
                print(f"  [chunk {chunk.index} {prompt_path.name}] rate limit/quota; stopping.", file=sys.stderr)
                raise
            transient = any(k in msg for k in ("503", "500", "UNAVAILABLE", "DEADLINE_EXCEEDED"))
            if not transient:
                raise
            wait = attempt * 20
            print(f"  [chunk {chunk.index} {prompt_path.name}] transient ({msg[:80]}); wait {wait}s")
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
    args = parser.parse_args()

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

    # Upload once
    print(f"[{args.model}] uploading video (one-time, {video_path.stat().st_size / 1024 / 1024:.0f} MB)...")
    t_up = time.time()
    uploaded = client.files.upload(
        file=str(video_path),
        config=gtypes.UploadFileConfig(mime_type="video/mp4", display_name=f"bench v2 {bench_key}"),
    )
    print(f"[{args.model}] uploaded in {fmt_min(time.time() - t_up)} -> {uploaded.uri}")

    # Wait for processing
    print(f"[{args.model}] waiting for Gemini file processing...")
    t_proc = time.time()
    while True:
        f = client.files.get(name=uploaded.name)
        state = f.state.name if hasattr(f.state, "name") else str(f.state)
        if state == "ACTIVE":
            uploaded = f
            break
        if state == "FAILED":
            print(f"File processing failed: {state}", file=sys.stderr); return 1
        sys.stdout.write("."); sys.stdout.flush()
        time.sleep(10)
    print(f"\n[{args.model}] file ACTIVE in {fmt_min(time.time() - t_proc)}")

    template_vars = load_template_vars(Path(args.vars_json).resolve() if args.vars_json else None)

    prompt_specs = [
        ("goals", ROOT / "prompts" / "goals.md", GOALS_RESPONSE_SCHEMA),
        ("saves", ROOT / "prompts" / "saves.md", SAVES_RESPONSE_SCHEMA),
        ("distribution", ROOT / "prompts" / "distribution.md", DISTRIBUTION_RESPONSE_SCHEMA),
    ]

    section_results: dict[str, dict] = {}
    chunk_meta = []

    for section, ppath, schema in prompt_specs:
        if not ppath.exists():
            print(f"[{args.model}] skip {section} (prompt missing)")
            continue
        print(f"[{args.model}] === {section}: {len(chunks)} chunks ===")
        per_chunk = []
        for chunk in chunks:
            print(f"[{args.model}] chunk {chunk.index} ({chunk.start_sec}-{chunk.end_sec}s) {section}...")
            cr = run_one_chunk_prompt(
                client, args.model, uploaded, ppath, schema, template_vars, chunk, media_resolution
            )
            n = len((cr.get("parsed") or {}).get(SECTION_TO_LISTKEY[section], []) or [])
            print(f"  -> {n} events in {cr['elapsed_sec']}s")
            per_chunk.append(cr)
        section_results[section] = merge_chunk_results(section, per_chunk, chunks)

    # Per-section chunk index for the manifest
    for chunk in chunks:
        chunk_meta.append({
            "index": chunk.index,
            "start_sec": chunk.start_sec,
            "end_sec": chunk.end_sec,
        })

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

    gemini_output["bench_meta"] = {
        "sdk": "google.genai",
        "sdk_version": getattr(genai, "__version__", "?"),
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

    # Cleanup uploaded file to avoid stale Files quota usage
    try:
        client.files.delete(name=uploaded.name)
        print(f"[{args.model}] deleted Files API entry")
    except Exception:
        pass

    return 0


if __name__ == "__main__":
    sys.exit(main())
