"""
Gemini GK Analysis - StixAnalytix prototype
Uploads a match video to Gemini and asks for goalkeeper-specific event detection.

Usage:
    python gemini_gk_analysis.py <video_path> [--prompt prompts/gk_analysis_v1.txt] [--model gemini-2.5-pro]

Requires: GEMINI_API_KEY environment variable (get one free at https://aistudio.google.com/app/apikey)
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    import google.generativeai as genai
    from dotenv import load_dotenv
except ImportError:
    print("Run: pip install google-generativeai python-dotenv")
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Analyse a match video for GK events using Gemini")
    parser.add_argument("video", help="Path to the match video (.mp4)")
    parser.add_argument("--prompt", default="prompts/gk_analysis_v1.txt", help="Path to prompt file")
    parser.add_argument("--model", default="gemini-2.5-pro", help="Gemini model (gemini-2.5-pro or gemini-2.5-flash)")
    parser.add_argument("--results-dir", default="results", help="Where to save outputs")
    args = parser.parse_args()

    script_dir = Path(__file__).parent
    video_path = Path(args.video).resolve()
    prompt_path = (script_dir / args.prompt).resolve() if not Path(args.prompt).is_absolute() else Path(args.prompt)
    results_dir = (script_dir / args.results_dir).resolve()
    results_dir.mkdir(exist_ok=True)

    if not video_path.exists():
        print(f"ERROR: Video not found: {video_path}")
        sys.exit(1)
    if not prompt_path.exists():
        print(f"ERROR: Prompt not found: {prompt_path}")
        sys.exit(1)

    load_dotenv(script_dir.parent / ".env")
    load_dotenv(script_dir.parent / ".env.local")
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("ERROR: GEMINI_API_KEY not set.")
        print("Get one free at https://aistudio.google.com/app/apikey")
        print("Then set it:")
        print('  Windows PowerShell:  $env:GEMINI_API_KEY = "your-key"')
        print('  Or save to .env at project root:  GEMINI_API_KEY=your-key')
        sys.exit(1)

    genai.configure(api_key=api_key)

    prompt_text = prompt_path.read_text(encoding="utf-8")
    size_mb = video_path.stat().st_size / (1024 * 1024)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    print(f"\n{'='*60}")
    print(f"  StixAnalytix — Gemini GK Analysis")
    print(f"{'='*60}")
    print(f"  Video:   {video_path.name} ({size_mb:.0f} MB)")
    print(f"  Prompt:  {prompt_path.name}")
    print(f"  Model:   {args.model}")
    print(f"  Output:  {results_dir}")
    print(f"{'='*60}\n")

    print("[1/4] Uploading video to Gemini File API (this may take several minutes)...")
    upload_start = time.time()
    uploaded = genai.upload_file(path=str(video_path), display_name=video_path.name)
    print(f"      Uploaded in {time.time()-upload_start:.0f}s. URI: {uploaded.uri}")

    print("[2/4] Waiting for Gemini to process the video...")
    process_start = time.time()
    while uploaded.state.name == "PROCESSING":
        elapsed = time.time() - process_start
        print(f"      ...still processing ({elapsed:.0f}s elapsed)")
        time.sleep(15)
        uploaded = genai.get_file(uploaded.name)
    if uploaded.state.name == "FAILED":
        print(f"ERROR: Video processing failed: {uploaded.state}")
        sys.exit(1)
    print(f"      Ready in {time.time()-process_start:.0f}s")

    print(f"[3/4] Sending analysis prompt to {args.model}...")
    inference_start = time.time()
    model = genai.GenerativeModel(args.model)
    response = model.generate_content(
        [uploaded, prompt_text],
        generation_config={
            "temperature": 0.2,
            "response_mime_type": "application/json",
        },
        request_options={"timeout": 1800},
    )
    print(f"      Response received in {time.time()-inference_start:.0f}s")

    raw_text = response.text
    raw_path = results_dir / f"{timestamp}_raw.json"
    raw_path.write_text(raw_text, encoding="utf-8")
    print(f"      Raw response saved: {raw_path.name}")

    parsed = None
    try:
        parsed = json.loads(raw_text)
        pretty_path = results_dir / f"{timestamp}_parsed.json"
        pretty_path.write_text(json.dumps(parsed, indent=2), encoding="utf-8")
        print(f"      Parsed JSON saved: {pretty_path.name}")
    except json.JSONDecodeError as e:
        print(f"      WARNING: Couldn't parse as JSON ({e}). Raw output saved only.")

    print("[4/4] Summary")
    print(f"{'-'*60}")
    if parsed and "summary" in parsed:
        s = parsed["summary"]
        events = parsed.get("events", {})
        print(f"  Goals BLACK team:        {s.get('total_goals_black_team', '?')}")
        print(f"  Goals WHITE team:        {s.get('total_goals_white_team', '?')}")
        print(f"  Shots on target:         {s.get('total_shots_on_target', '?')}")
        print(f"  Shots off target:        {s.get('total_shots_off_target', '?')}")
        print(f"  Distributions:           {s.get('total_distributions', '?')}")
        print(f"  Match duration observed: {s.get('match_duration_observed', '?')}")
        print(f"  Overall confidence:      {s.get('overall_analysis_confidence', '?')}")
        print(f"  Camera notes:            {s.get('camera_quality_notes', '?')}")
        print(f"  Shot events captured:    {len(events.get('shots', []))}")
        print(f"  Distributions captured:  {len(events.get('distributions', []))}")
        print(f"  Sweeper actions:         {len(events.get('sweeper_actions', []))}")
        if s.get("key_observations"):
            print(f"\n  Key observations:")
            for obs in s["key_observations"]:
                print(f"    • {obs}")

    if hasattr(response, "usage_metadata"):
        u = response.usage_metadata
        print(f"\n  Tokens — input: {u.prompt_token_count:,}  output: {u.candidates_token_count:,}  total: {u.total_token_count:,}")

    print(f"{'-'*60}")
    print(f"\n  GROUND TRUTH (Joshua): 4-1 black team")
    print(f"  Compare against summary above to evaluate accuracy.\n")

    print("Cleaning up uploaded file from Gemini...")
    try:
        genai.delete_file(uploaded.name)
        print("  Done.")
    except Exception as e:
        print(f"  (Cleanup non-critical error: {e})")


if __name__ == "__main__":
    main()
