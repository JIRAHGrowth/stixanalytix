"""
Local CLI to enqueue and kick off a video job.

Usage:
    python worker/enqueue.py --match-id <uuid> --coach-id <uuid> --video-url <url>

Inserts a video_jobs row (status='queued') via PostgREST, then spawns the
Modal worker. Requires .env.local in the project root with Supabase + Modal
credentials.

Deliberately uses only `requests` + `python-dotenv` to stay compatible with
Python 3.14+. The heavier `supabase` client is only used inside the Modal
image, which runs Python 3.11.
"""

import argparse
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv


def main() -> int:
    load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

    parser = argparse.ArgumentParser()
    parser.add_argument("--match-id", required=True)
    parser.add_argument("--coach-id", required=True)
    parser.add_argument("--video-url", required=True)
    args = parser.parse_args()

    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

    resp = requests.post(
        f"{url}/rest/v1/video_jobs",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        json={
            "match_id": args.match_id,
            "coach_id": args.coach_id,
            "video_url": args.video_url,
            "status": "queued",
        },
        timeout=30,
    )
    resp.raise_for_status()
    job_id = resp.json()[0]["id"]
    print(f"enqueued job_id={job_id}")

    from app import app, process
    with app.run():
        call = process.spawn(job_id)
        print(f"spawned modal call_id={call.object_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
