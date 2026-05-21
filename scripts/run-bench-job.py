"""
Single (model, video) bench job runner.

Runs all three production prompts (goals, saves, distribution) against one
video file for one Gemini model. Writes a `gemini_output`-shape JSON file
that `scripts/eval-match.js --gemini-output-file` can score.

Lean by design:
  - One video upload, three prompts (matches production cost shape).
  - No encyclopedia, no per-coach calibration, no chunking, no voting,
    no reconciliation. This bench measures RAW MODEL QUALITY across models
    on identical inputs. Production-faithful comparisons happen on Modal
    in the canary phase, not here.
  - Schemas are imported from worker.app to stay in sync.

Usage:
    python scripts/run-bench-job.py \
        --video /abs/path/match.mp4 \
        --model gemini-2.5-pro \
        --out scripts/bench-results/<match-key>/<model>.json \
        [--vars-json scripts/ground-truth/<match-key>.json]

Vars JSON: any ground-truth file (or any file with the template variables at
the top level / under `events`). Used only to substitute `{{my_team_color}}`,
`{{my_keeper_color}}`, `{{opponent_color}}` in prompt templates.

Output JSON shape (mirrors worker `gemini_output`):
    {
      "model": "<model>",
      "bench_key": "<short label, derived from --out>",
      "match_metadata": { ... },
      "cached": false,
      "goals":        { "raw": "...", "parsed": {...}, "usage": {...}, "elapsed_sec": N },
      "saves":        { ... },
      "distribution": { ... },
      "parsed": { "goals": [...] },   # legacy top-level shortcut (review screen compat)
      "raw":    "<goals raw text>",
      "usage":  { ... },
      "bench_meta": {
        "video_path": "...",
        "video_size_bytes": N,
        "started_at": "...",
        "finished_at": "...",
        "total_elapsed_sec": N
      }
    }
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    import google.generativeai as genai
    from dotenv import load_dotenv
except ImportError:
    print("Run: pip install google-generativeai python-dotenv", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "worker"))

# Import the production schemas + render helper so the bench can never drift
# from what the worker actually sends.
try:
    from app import (
        GOALS_RESPONSE_SCHEMA,
        SAVES_RESPONSE_SCHEMA,
        DISTRIBUTION_RESPONSE_SCHEMA,
        _render_prompt,
        _filter_low_signal_saves,
    )
except Exception as e:
    print(f"Could not import schemas from worker/app.py: {e}", file=sys.stderr)
    print("Worker module must be importable without Modal runtime — check imports.", file=sys.stderr)
    sys.exit(1)


def utc_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fmt_min(seconds: float) -> str:
    return f"{seconds / 60:.1f} min"


def load_template_vars(vars_json_path: Path | None) -> dict:
    if not vars_json_path:
        return {"my_team_color": None, "my_keeper_color": None, "opponent_color": None}
    try:
        data = json.loads(vars_json_path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"Could not read vars JSON {vars_json_path}: {e}", file=sys.stderr)
        return {"my_team_color": None, "my_keeper_color": None, "opponent_color": None}
    return {
        "my_team_color": data.get("my_team_color"),
        "my_keeper_color": data.get("my_keeper_color"),
        "opponent_color": data.get("opponent_color"),
    }


def run_one_prompt(model_name: str, uploaded, prompt_path: Path, schema: dict, vars: dict) -> dict:
    template = prompt_path.read_text(encoding="utf-8")
    prompt = _render_prompt(template, vars)
    generation_config = {
        "response_mime_type": "application/json",
        "response_schema": schema,
    }
    model = genai.GenerativeModel(model_name, generation_config=generation_config)
    t0 = time.time()
    last_err = None
    resp = None
    for attempt in range(1, 4):
        try:
            resp = model.generate_content([uploaded, prompt])
            break
        except Exception as e:
            last_err = e
            msg = str(e)
            if "429" in msg:
                print(f"  [{prompt_path.name}] rate limit / quota — stopping.", file=sys.stderr)
                raise
            if "503" not in msg and "500" not in msg and "UNAVAILABLE" not in msg:
                raise
            wait = attempt * 30
            print(f"  [{prompt_path.name}] transient error ({msg[:120]}) — waiting {wait}s")
            time.sleep(wait)
    if resp is None:
        raise last_err or RuntimeError("All attempts failed")

    elapsed = time.time() - t0
    try:
        parsed = json.loads(resp.text)
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
    return {"raw": resp.text, "parsed": parsed, "usage": usage_dict, "elapsed_sec": round(elapsed, 1)}


def main() -> int:
    load_dotenv(ROOT / ".env.local")
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True, help="Absolute path to match .mp4")
    parser.add_argument("--model", required=True, help="e.g. gemini-2.5-pro / gemini-3-pro / gemini-2.5-flash")
    parser.add_argument("--out", required=True, help="Output JSON path")
    parser.add_argument("--vars-json", default=None, help="Ground-truth JSON to read template variables from")
    parser.add_argument("--match-metadata-json", default=None,
                        help="Optional metadata to embed in the output (e.g. {opponent, match_date})")
    args = parser.parse_args()

    video_path = Path(args.video).resolve()
    if not video_path.is_file():
        print(f"Not a file: {video_path}", file=sys.stderr)
        return 1
    out_path = Path(args.out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("GEMINI_API_KEY missing from .env.local", file=sys.stderr)
        return 1
    genai.configure(api_key=api_key)

    vars_path = Path(args.vars_json).resolve() if args.vars_json else None
    template_vars = load_template_vars(vars_path)
    match_metadata = None
    if args.match_metadata_json:
        try:
            match_metadata = json.loads(Path(args.match_metadata_json).read_text(encoding="utf-8"))
        except Exception as e:
            print(f"  warn: could not load match metadata: {e}", file=sys.stderr)

    bench_key = out_path.stem
    size_gb = video_path.stat().st_size / (1024 ** 3)
    print(f"[{args.model}] {bench_key}  ({size_gb:.2f} GB video)")

    job_started_at = utc_iso()
    job_t0 = time.time()

    print(f"[{args.model}] uploading video...")
    t_up = time.time()
    uploaded = genai.upload_file(
        path=str(video_path), mime_type="video/mp4",
        display_name=f"bench {bench_key} {args.model}",
    )
    print(f"[{args.model}] uploaded in {fmt_min(time.time() - t_up)}")

    print(f"[{args.model}] waiting for Gemini file processing...")
    t_proc = time.time()
    while uploaded.state.name == "PROCESSING":
        sys.stdout.write(".")
        sys.stdout.flush()
        time.sleep(15)
        uploaded = genai.get_file(uploaded.name)
    print(f"\n[{args.model}] file processed in {fmt_min(time.time() - t_proc)}")
    if uploaded.state.name != "ACTIVE":
        print(f"File ended in state {uploaded.state.name}", file=sys.stderr)
        return 1

    prompt_specs = [
        ("goals", ROOT / "prompts" / "goals.md", GOALS_RESPONSE_SCHEMA),
        ("saves", ROOT / "prompts" / "saves.md", SAVES_RESPONSE_SCHEMA),
        ("distribution", ROOT / "prompts" / "distribution.md", DISTRIBUTION_RESPONSE_SCHEMA),
    ]

    results = {}
    for key, ppath, schema in prompt_specs:
        if not ppath.exists():
            print(f"[{args.model}] skip {key} — prompt file missing at {ppath}")
            continue
        print(f"[{args.model}] running {key}.md...")
        results[key] = run_one_prompt(args.model, uploaded, ppath, schema, template_vars)
        count_key = {"goals": "goals", "saves": "saves", "distribution": "distribution"}[key]
        n = len((results[key]["parsed"] or {}).get(count_key, [])) if results[key]["parsed"] else 0
        print(f"[{args.model}] {key}: {n} events  ({results[key]['elapsed_sec']}s)")

    # Apply only the low-signal saves filter — it's model-agnostic noise reduction
    # and matches what production does. Skip reconciliation (cross-event QC):
    # that's a pipeline-tuning decision we want to test SEPARATELY from raw model
    # quality. The scorecard reports both filtered and unfiltered counts where it
    # matters.
    if "saves" in results and results["saves"].get("parsed"):
        before = len(results["saves"]["parsed"].get("saves", []))
        filtered = _filter_low_signal_saves(results["saves"]["parsed"].get("saves", []))
        results["saves"]["parsed"]["saves"] = filtered
        if before != len(filtered):
            print(f"[{args.model}] saves: {before} -> {len(filtered)} after low-signal filter")

    goals_result = results.get("goals", {})
    gemini_output = {
        "model": args.model,
        "bench_key": bench_key,
        "match_metadata": match_metadata,
        "cached": False,
        "goals": goals_result,
        # legacy top-level shortcuts so the review screen + extractGoals() in
        # eval-match.js both find goals at gemini_output.parsed.goals
        "raw": goals_result.get("raw"),
        "parsed": goals_result.get("parsed"),
        "usage": goals_result.get("usage"),
    }
    if "saves" in results:
        gemini_output["saves"] = results["saves"]
    if "distribution" in results:
        gemini_output["distribution"] = results["distribution"]

    job_finished_at = utc_iso()
    gemini_output["bench_meta"] = {
        "video_path": str(video_path),
        "video_size_bytes": video_path.stat().st_size,
        "started_at": job_started_at,
        "finished_at": job_finished_at,
        "total_elapsed_sec": round(time.time() - job_t0, 1),
        "template_vars": template_vars,
    }

    out_path.write_text(json.dumps({"gemini_output": gemini_output}, indent=2), encoding="utf-8")
    print(f"[{args.model}] saved → {out_path.relative_to(ROOT)}  ({fmt_min(time.time() - job_t0)} total)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
