"""
Resumable-upload Gemini match runner.

Same contract as scripts/test-gemini-match.js (reads prompts/goals.md, uses the
same response schema, writes the same output shape) but built on the Python
google-generativeai SDK so that 1+ GB uploads survive a flaky connection.

Usage:
    python scripts/run-gemini-match.py "<absolute path to match .mp4>" [--key <name>] [--model gemini-2.5-pro]

Output: scripts/results/match-<key>-<unix_ms>.json — drop-in for scripts/load-gemini-match.js.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

try:
    import google.generativeai as genai
    from dotenv import load_dotenv
except ImportError:
    print("Run: pip install google-generativeai python-dotenv", file=sys.stderr)
    sys.exit(1)


RESPONSE_SCHEMA = {
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
                    "confidence": {"type": "STRING"},
                },
                "required": [
                    "timestamp_seconds", "match_clock", "scoring_team",
                    "conceding_team", "scoreboard_before", "scoreboard_after",
                    "attack_type", "buildup", "shot_type", "shot_location",
                    "goal_placement_height", "goal_placement_side",
                    "gk_observations", "confidence",
                ],
            },
        }
    },
    "required": ["goals"],
}


def fmt_min(seconds: float) -> str:
    return f"{seconds / 60:.1f} min"


def main() -> int:
    project_root = Path(__file__).resolve().parent.parent
    load_dotenv(project_root / ".env.local")

    parser = argparse.ArgumentParser()
    parser.add_argument("video", help="Absolute path to match .mp4")
    parser.add_argument("--key", default=None, help="Short name for output filename (default: video stem)")
    parser.add_argument("--model", default="gemini-2.5-pro")
    args = parser.parse_args()

    video_path = Path(args.video).resolve()
    if not video_path.is_file():
        print(f"Not a file: {video_path}", file=sys.stderr)
        return 1

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("GEMINI_API_KEY missing from .env.local", file=sys.stderr)
        return 1

    key = args.key or video_path.stem
    prompt_path = project_root / "prompts" / "goals.md"
    prompt = prompt_path.read_text(encoding="utf-8")

    size_gb = video_path.stat().st_size / (1024 ** 3)
    print(f"Target: {key} ({size_gb:.2f} GB)")
    print("Expect 5-20 min upload + 5-15 min Gemini processing. Be patient.\n")

    genai.configure(api_key=api_key)

    print("Uploading to Gemini Files API (resumable)...")
    t0 = time.time()
    uploaded = genai.upload_file(path=str(video_path), mime_type="video/mp4", display_name=f"stix match {key}")
    print(f"Uploaded in {fmt_min(time.time() - t0)}")

    print("Waiting for Gemini video processing...")
    t0 = time.time()
    while uploaded.state.name == "PROCESSING":
        sys.stdout.write(".")
        sys.stdout.flush()
        time.sleep(15)
        uploaded = genai.get_file(uploaded.name)
    print(f"\nProcessed in {fmt_min(time.time() - t0)}")
    if uploaded.state.name != "ACTIVE":
        print(f"File ended in state {uploaded.state.name}", file=sys.stderr)
        return 1

    generation_config = {
        "response_mime_type": "application/json",
        "response_schema": RESPONSE_SCHEMA,
    }
    model = genai.GenerativeModel(args.model, generation_config=generation_config)

    last_error = None
    result = None
    for attempt in range(1, 4):
        try:
            print(f"Asking {args.model} (attempt {attempt}/3)...")
            t0 = time.time()
            result = model.generate_content([uploaded, prompt])
            print(f"Generated in {fmt_min(time.time() - t0)}")
            break
        except Exception as e:
            last_error = e
            msg = str(e)
            if "429" in msg:
                print("  Rate limit / quota. Stopping.", file=sys.stderr)
                raise
            if "503" not in msg and "500" not in msg and "UNAVAILABLE" not in msg:
                raise
            wait = attempt * 30
            print(f"  Transient error ({msg[:120]}). Waiting {wait}s...")
            time.sleep(wait)

    if result is None:
        raise last_error or RuntimeError("All attempts failed")

    text = result.text
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        print(f"Could not parse JSON from model output: {e}", file=sys.stderr)
        print("Raw text was:")
        print(text)
        return 1

    print(f"\n=== Results from {args.model} on {key} ===\n")
    print(f"Goals detected: {len(parsed.get('goals', []))}")
    for i, g in enumerate(parsed.get("goals", []), 1):
        ts = g.get("timestamp_seconds", 0)
        print(f"\n  {i}. video {ts // 60}:{ts % 60:02d}  match clock {g.get('match_clock')}  confidence: {g.get('confidence')}")
        print(f"     {g.get('scoring_team')} scored vs {g.get('conceding_team')}")
        print(f"     scoreboard: {g.get('scoreboard_before')} -> {g.get('scoreboard_after')}")
        print(f"     attack_type: {g.get('attack_type')}")
        print(f"     buildup: {g.get('buildup')}")
        print(f"     shot: {g.get('shot_type')} from {g.get('shot_location')}")
        print(f"     placement: {g.get('goal_placement_height')} / {g.get('goal_placement_side')}")
        print(f"     GK: {g.get('gk_observations')}")

    usage = getattr(result, "usage_metadata", None)
    usage_dict = None
    if usage is not None:
        usage_dict = {
            "totalTokenCount": getattr(usage, "total_token_count", None),
            "promptTokenCount": getattr(usage, "prompt_token_count", None),
            "candidatesTokenCount": getattr(usage, "candidates_token_count", None),
        }
        if usage_dict["totalTokenCount"]:
            print(f"\nTokens: {usage_dict['totalTokenCount']:,} total (prompt {usage_dict['promptTokenCount']:,}, output {usage_dict['candidatesTokenCount']:,})")

    out_dir = project_root / "scripts" / "results"
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / f"match-{key}-{int(time.time() * 1000)}.json"
    out_path.write_text(json.dumps({
        "modelUsed": args.model,
        "key": key,
        "usage": usage_dict,
        "parsed": parsed,
        "rawText": text,
    }, indent=2), encoding="utf-8")
    print(f"\nFull output saved to {out_path.relative_to(project_root)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
