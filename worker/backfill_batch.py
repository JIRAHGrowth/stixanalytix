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


# Round 2 (2026-06-15 evening): the 6 PUBLISHED Judah video-jobs that pre-date
# the clip pipeline. Without these, the matches page falls back to seeking
# the 1-3 GB source video on every click — what Joshua flagged as "loading
# circle of death."
JOBS = [
    "d173e102-f0d7-4259-84c2-afa23550442a",  # 2026-05-31 OUFC 2016
    "573c54fc-38f3-4a9e-9341-ef821e91405e",  # 2026-05-24 PFC 2016
    "a0877aa3-b47c-4077-84a7-8f3bced97ac4",  # 2026-05-21 OUFC
    "cf939885-f9ff-4d7b-bc2e-3d0815f40cb5",  # 2026-05-21 OUFC SOSC
    "bc00c75c-ffe8-4584-85e2-29f9aa492fa9",  # 2026-05-03 KCITY 2016 Gold
    "60cfa445-6364-4147-9830-0d1ddeffcb37",  # 2026-05-04 OFC 2016
]


def main() -> int:
    # Sequential execution (blocking) — the earlier 5-concurrent run had 3 of
    # them silently killed by Modal under resource contention. One at a time
    # is slow but reliable.
    backfill = modal.Function.from_name("stixanalytix-worker", "backfill_clips")
    for i, job_id in enumerate(JOBS, 1):
        print(f"[{i}/{len(JOBS)}] starting {job_id}...", flush=True)
        result = backfill.remote(job_id)
        print(f"[{i}/{len(JOBS)}]   done: {result}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
