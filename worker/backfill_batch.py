"""
One-shot batch backfill for the 5 older review_needed jobs that were processed
before the clip pipeline went live (~2026-06-01). Spawns backfill_clips on
the already-deployed Modal app — no local image rebuild required.

Each backfill takes ~10-15 min on Modal's side (download source video + ffmpeg
slice every event). The 5 spawns run concurrently. Modal returns immediately
with a call_id; script exits once all are queued.

Track progress at:  https://modal.com/apps/jirahgrowth/stixanalytix-worker

Verify after completion via the clip-coverage SQL in
docs/keeper-card-landing-spec.md (saves_clipped should be > 0).

Usage:
    py worker/backfill_batch.py
"""

import sys
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

import modal


# Joshua's 5 older review_needed jobs that pre-date the clip pipeline.
# Identified via audit on 2026-06-15 — see docs/keeper-card-landing-spec.md.
JOBS = [
    "f5ad42c7-a039-4fca-a1ab-0cb67e99627b",  # 2026-05-22
    "e052b7d0-5ee9-4031-9655-c59855dca309",  # 2026-05-21
    "c62b69d3-ca90-4ba0-95d5-38ef61ba4904",  # 2026-05-05
    "6d171d79-c660-4bad-9605-ada8e52f3c0a",  # 2026-05-05
    "f0fe8795-4dee-4fe6-910e-6dbc43c6e4bc",  # 2026-05-04
]


def main() -> int:
    backfill = modal.Function.from_name("stixanalytix-worker", "backfill_clips")
    for job_id in JOBS:
        call = backfill.spawn(job_id)
        print(f"spawned job_id={job_id} call_id={call.object_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
