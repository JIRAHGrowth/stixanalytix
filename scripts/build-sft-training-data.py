"""
SFT training-data builder — Roadmap Item #3.

Convert our curated ground-truth files + their source videos in GCS into
JSONL training rows for Vertex AI supervised fine-tuning. Format follows
Google's video-tuning specification:

  {
    "contents": [
      {"role": "user", "parts": [
        {"fileData": {"fileUri": "gs://...mp4", "mimeType": "video/mp4"},
         "videoMetadata": {"startOffset": "0s", "endOffset": "300s"}},
        {"text": "<rendered prompt + chunk-context note>"}
      ]},
      {"role": "model", "parts": [{"text": "<expected_json_response>"}]}
    ],
    "generationConfig": {"mediaResolution": "MEDIA_RESOLUTION_MEDIUM"}
  }

One JSONL row per (chunk × prompt). For a 52-min match at 5-min chunks
with 3 prompts (goals/saves/distribution) that's 33 training rows.

Usage:
    # Validate (don't write output, just report what would be built)
    python scripts/build-sft-training-data.py --validate

    # Build the full corpus
    python scripts/build-sft-training-data.py --out training/sft-corpus.jsonl

    # Filter to specific event type
    python scripts/build-sft-training-data.py --sections goals --out goals-only.jsonl

    # Filter to specific matches
    python scripts/build-sft-training-data.py --truth scripts/ground-truth/judah-2026-04-25.json --out one-match.jsonl

Outputs (when --out provided):
    <out>.jsonl     - training rows
    <out>.stats.json - per-match + per-section counts, skip reasons, etc.

Skip reasons surfaced:
    - missing video_job_id in truth file
    - video_job_id not in DB
    - storage_path missing or empty in DB
    - video not yet copied to GCS (suggest running ensure_video_in_gcs)
"""
from __future__ import annotations
import argparse
import glob
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "worker"))

# Use the production helpers
try:
    from app import _render_prompt
except Exception as e:
    print(f"could not import _render_prompt from worker/app.py: {e}", file=sys.stderr)
    sys.exit(1)


SECTIONS = ("goals", "saves", "distribution")
SECTION_PROMPT_FILES = {
    "goals": "goals.md",
    "saves": "saves.md",
    "distribution": "distribution.md",
}


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--truth", action="append", default=None,
                   help="Specific ground-truth JSON file(s). Can repeat. "
                        "Default: all scripts/ground-truth/*.json")
    p.add_argument("--sections", default="goals,saves,distribution",
                   help="Comma-separated event types to emit. Default: all.")
    p.add_argument("--chunk-duration-sec", type=int, default=300,
                   help="Chunk size in seconds. MUST be ≤ 300 for MEDIUM "
                        "or ≤ 1200 for LOW per Vertex SFT video constraints.")
    p.add_argument("--media-resolution", default="MEDIA_RESOLUTION_MEDIUM",
                   choices=["MEDIA_RESOLUTION_LOW", "MEDIA_RESOLUTION_MEDIUM"],
                   help="Must be consistent across the entire training dataset.")
    p.add_argument("--validate", action="store_true",
                   help="Don't write output; just report what would be built.")
    p.add_argument("--out", default=None,
                   help="Output JSONL path. Required unless --validate.")
    p.add_argument("--gcs-bucket-override", default=None,
                   help="Override GCS bucket from env (for testing).")
    p.add_argument("--include-missing-video", action="store_true",
                   help="Emit training rows even if the video is not yet in GCS "
                        "(useful for dry-runs; final training requires gs:// URIs)")
    return p.parse_args()


# ---------------------------------------------------------------------------
# Supabase lookup of video_jobs (storage_path + match_metadata)
# ---------------------------------------------------------------------------

def fetch_jobs_by_ids(job_ids: list[str]) -> dict:
    """Returns {video_job_id: job_row_dict}."""
    if not job_ids:
        return {}
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env.local")
    import requests
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    # Build OR clause for ids
    in_clause = ",".join(f'"{j}"' for j in job_ids)
    r = requests.get(
        f"{url}/rest/v1/video_jobs?id=in.({in_clause})&select=id,storage_path,match_metadata,status,coach_id",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
        timeout=30,
    )
    r.raise_for_status()
    rows = r.json()
    return {r["id"]: r for r in rows}


# ---------------------------------------------------------------------------
# GCS object existence check
# ---------------------------------------------------------------------------

def check_video_in_gcs(bucket: str, job_id: str) -> tuple[bool, str]:
    """Returns (exists, gs_uri). Uses gcloud CLI for the check; doesn't need
    google-cloud-storage installed locally."""
    import subprocess
    gs_uri = f"gs://{bucket}/match-videos/{job_id}.mp4"
    candidates = [
        os.environ.get("GCLOUD_PATH"),
        "gcloud",
        "C:/Users/joshu/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd",
    ]
    for c in candidates:
        if not c:
            continue
        try:
            r = subprocess.run(
                [c, "storage", "objects", "describe", gs_uri, "--format=value(size)"],
                capture_output=True, text=True, timeout=20,
            )
            if r.returncode == 0 and r.stdout.strip():
                return True, gs_uri
            return False, gs_uri
        except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
            continue
    print(f"  WARN: gcloud not found — cannot verify GCS state. Assuming present.", file=sys.stderr)
    return True, gs_uri


# ---------------------------------------------------------------------------
# Chunk planning
# ---------------------------------------------------------------------------

def plan_chunks(duration_sec: int, chunk_duration_sec: int) -> list[dict]:
    chunks, cursor, idx = [], 0, 0
    while cursor < duration_sec:
        end = min(cursor + chunk_duration_sec, duration_sec)
        chunks.append({"index": idx, "start_sec": cursor, "end_sec": end})
        idx += 1
        cursor = end
    return chunks


# ---------------------------------------------------------------------------
# Filter truth events to a chunk window + offset timestamps to chunk-local
# ---------------------------------------------------------------------------

def events_in_chunk(all_events: list[dict], chunk: dict) -> list[dict]:
    """Return a deep copy of events whose timestamp falls in [start_sec, end_sec),
    with timestamps OFFSET to chunk-local frame (0 = chunk start)."""
    out = []
    for e in all_events or []:
        ts = e.get("timestamp_seconds")
        if not isinstance(ts, (int, float)):
            continue
        if chunk["start_sec"] <= ts < chunk["end_sec"]:
            local = dict(e)
            local["timestamp_seconds"] = int(ts) - chunk["start_sec"]
            out.append(local)
    return out


# ---------------------------------------------------------------------------
# Build the (input, output) text pair for one (chunk, prompt) row
# ---------------------------------------------------------------------------

def render_input_prompt(template_text: str, vars: dict, chunk: dict) -> str:
    """Mirror worker/app_v2.py's chunk-prompt format so the SFT training
    distribution matches inference distribution."""
    base = _render_prompt(template_text, vars)
    chunk_note = (
        f"\n\n---\n\n# CHUNK CONTEXT\n\n"
        f"This video segment covers minutes {chunk['start_sec'] // 60}:{chunk['start_sec'] % 60:02d} "
        f"to {chunk['end_sec'] // 60}:{chunk['end_sec'] % 60:02d} of the full match. "
        f"Return every `timestamp_seconds` value RELATIVE TO THE START OF THIS SEGMENT "
        f"(0 = segment start). The worker will offset back to the global match timeline."
    )
    return base + chunk_note


def build_expected_output(section: str, chunk_local_events: list[dict]) -> str:
    """Build the model's expected text response. Mirrors the response_schema
    shape from worker/app.py (key = list of events)."""
    payload = {section: chunk_local_events}
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False)


def build_training_row(
    gs_uri: str,
    chunk: dict,
    rendered_prompt: str,
    expected_output: str,
    media_resolution: str,
) -> dict:
    return {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "fileData": {"fileUri": gs_uri, "mimeType": "video/mp4"},
                        "videoMetadata": {
                            "startOffset": f"{chunk['start_sec']}s",
                            "endOffset": f"{chunk['end_sec']}s",
                        },
                    },
                    {"text": rendered_prompt},
                ],
            },
            {
                "role": "model",
                "parts": [{"text": expected_output}],
            },
        ],
        "generationConfig": {"mediaResolution": media_resolution},
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    args = parse_args()
    sections = [s.strip() for s in args.sections.split(",") if s.strip()]
    for s in sections:
        if s not in SECTIONS:
            print(f"unknown section: {s}", file=sys.stderr); return 1

    if not args.validate and not args.out:
        print("Either --validate or --out is required.", file=sys.stderr); return 1

    bucket = args.gcs_bucket_override or os.environ.get("GCS_TRAINING_BUCKET")
    if not bucket:
        from dotenv import load_dotenv
        load_dotenv(ROOT / ".env.local")
        bucket = os.environ.get("GCS_TRAINING_BUCKET")
    if not bucket and not args.include_missing_video:
        print("GCS_TRAINING_BUCKET not set in .env.local (required unless --include-missing-video).", file=sys.stderr); return 1

    # Resolve truth files
    if args.truth:
        truth_paths = [Path(t) for t in args.truth]
    else:
        truth_paths = sorted(Path(p) for p in glob.glob(str(ROOT / "scripts" / "ground-truth" / "*.json")))
    truth_paths = [p for p in truth_paths if p.is_file()]
    print(f"Truth files: {len(truth_paths)}")
    for p in truth_paths:
        print(f"  - {p.relative_to(ROOT)}")

    # Load prompt templates
    prompt_texts = {}
    for s in sections:
        ppath = ROOT / "prompts" / SECTION_PROMPT_FILES[s]
        if not ppath.exists():
            print(f"  WARN: prompt {ppath.name} missing; skipping {s}", file=sys.stderr)
            continue
        prompt_texts[s] = ppath.read_text(encoding="utf-8")
    if not prompt_texts:
        print("No prompts available.", file=sys.stderr); return 1

    # Resolve video_job_ids -> Supabase rows
    job_ids = []
    truth_records = []
    for tp in truth_paths:
        try:
            truth = json.loads(tp.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"  skip {tp.name}: {e}", file=sys.stderr); continue
        jid = truth.get("video_job_id")
        truth_records.append({"path": tp, "truth": truth, "video_job_id": jid})
        if jid:
            job_ids.append(jid)

    jobs = fetch_jobs_by_ids(job_ids) if job_ids else {}
    print(f"Supabase jobs resolved: {len(jobs)}/{len(job_ids)}")

    # Build output
    rows = []
    stats = {
        "input_truth_files": len(truth_paths),
        "skip_reasons": [],
        "per_match": [],
        "per_section_rows": {s: 0 for s in sections},
        "total_rows": 0,
        "media_resolution": args.media_resolution,
        "chunk_duration_sec": args.chunk_duration_sec,
        "bucket": bucket,
    }

    for rec in truth_records:
        tp = rec["path"]; truth = rec["truth"]; jid = rec["video_job_id"]
        meta = {"match": tp.name, "video_job_id": jid}
        if not jid:
            stats["skip_reasons"].append({"match": tp.name, "reason": "no video_job_id in truth file"})
            continue
        job = jobs.get(jid)
        if not job:
            stats["skip_reasons"].append({"match": tp.name, "reason": f"job {jid} not in DB"})
            continue
        if not job.get("storage_path"):
            stats["skip_reasons"].append({"match": tp.name, "reason": "job has no storage_path"})
            continue

        # GCS presence check
        if not args.include_missing_video:
            present, gs_uri = check_video_in_gcs(bucket, jid)
            if not present:
                stats["skip_reasons"].append({
                    "match": tp.name,
                    "reason": f"video not in GCS at {gs_uri} — run worker on this job once or upload manually",
                })
                continue
        else:
            gs_uri = f"gs://{bucket}/match-videos/{jid}.mp4"

        # Duration: prefer truth field; fall back to last truth event timestamp + chunk_duration
        duration_sec = truth.get("duration_seconds")
        if not duration_sec:
            all_ts = []
            for s in SECTIONS:
                for e in truth.get("events", {}).get(s, []) or []:
                    ts = e.get("timestamp_seconds")
                    if isinstance(ts, (int, float)):
                        all_ts.append(ts)
            if all_ts:
                duration_sec = int(max(all_ts)) + args.chunk_duration_sec  # pad past last event
            else:
                duration_sec = 60 * 60  # default 1h cap
        chunks = plan_chunks(duration_sec, args.chunk_duration_sec)

        match_meta = job.get("match_metadata") or {}
        vars_dict = {
            "my_team_color": match_meta.get("my_team_color"),
            "my_keeper_color": match_meta.get("my_keeper_color"),
            "opponent_color": match_meta.get("opponent_color"),
        }

        m_added = {s: 0 for s in sections}
        for chunk in chunks:
            for s in sections:
                if s not in prompt_texts:
                    continue
                events = events_in_chunk(truth.get("events", {}).get(s, []) or [], chunk)
                rendered = render_input_prompt(prompt_texts[s], vars_dict, chunk)
                expected = build_expected_output(s, events)
                row = build_training_row(gs_uri, chunk, rendered, expected, args.media_resolution)
                rows.append(row)
                m_added[s] += 1
                stats["per_section_rows"][s] += 1
        meta["chunks"] = len(chunks); meta["rows_added"] = m_added
        stats["per_match"].append(meta)

    stats["total_rows"] = len(rows)
    print()
    print(f"=== Build summary ===")
    print(f"  matches included: {len(stats['per_match'])} / {stats['input_truth_files']}")
    print(f"  total training rows: {stats['total_rows']}")
    print(f"  per section: {stats['per_section_rows']}")
    if stats["skip_reasons"]:
        print(f"  skips:")
        for s in stats["skip_reasons"]:
            print(f"    - {s['match']}: {s['reason']}")
    print()

    if args.validate:
        print("(--validate mode; no output written)")
        return 0

    out_path = Path(args.out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    stats_path = out_path.with_suffix(".stats.json")
    stats_path.write_text(json.dumps(stats, indent=2), encoding="utf-8")
    print(f"  wrote {out_path}  ({out_path.stat().st_size / 1024:.1f} KB)")
    print(f"  stats {stats_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
