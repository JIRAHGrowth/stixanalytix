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


# Round 3 (2026-06-15 night): re-cut ALL of Judah's video-job clips with
# force=True because the deployed Modal worker was a stale build using
# the ultrafast preset, producing ~30 MB clips per event. Browser chokes
# on streaming a 30 MB MP4, so the matches page showed the "loading
# circle of death" even for KYSA whose clips technically existed.
#
# Re-deployed worker now uses -preset veryfast -crf 26 -vf scale=-2:720
# which targets 1-3 MB clips. force=True overwrites the old files.
#
# Combined batch: KYSA + yesterday's 5 + tonight's 6 = 12 jobs total.
JOBS = [
    # KYSA Lions (the published one whose clips were already 25 MB avg)
    "51ac2750-43f7-439f-a3f7-92cdea5b7dc2",  # 2026-06-06 KYSA Lions
    # Yesterday's 5 (also produced 30 MB clips by the stale worker)
    "f5ad42c7-a039-4fca-a1ab-0cb67e99627b",  # 2026-05-22
    "e052b7d0-5ee9-4031-9655-c59855dca309",  # 2026-05-21
    "c62b69d3-ca90-4ba0-95d5-38ef61ba4904",  # 2026-05-05
    "6d171d79-c660-4bad-9605-ada8e52f3c0a",  # 2026-05-05
    "f0fe8795-4dee-4fe6-910e-6dbc43c6e4bc",  # 2026-05-04
    # Tonight's 6 (some partial from the stopped run — force=True covers all)
    "d173e102-f0d7-4259-84c2-afa23550442a",  # 2026-05-31 OUFC 2016
    "573c54fc-38f3-4a9e-9341-ef821e91405e",  # 2026-05-24 PFC 2016
    "a0877aa3-b47c-4077-84a7-8f3bced97ac4",  # 2026-05-21 OUFC
    "cf939885-f9ff-4d7b-bc2e-3d0815f40cb5",  # 2026-05-21 OUFC SOSC
    "bc00c75c-ffe8-4584-85e2-29f9aa492fa9",  # 2026-05-03 KCITY 2016 Gold
    "60cfa445-6364-4147-9830-0d1ddeffcb37",  # 2026-05-04 OFC 2016
]

# Force re-cut every event clip — see commit comment above.
FORCE_REBUILD = True


def main() -> int:
    # Sequential execution (blocking) — the earlier 5-concurrent run had 3 of
    # them silently killed by Modal under resource contention. One at a time
    # is slow but reliable. ~10-15 min per job × N jobs.
    backfill = modal.Function.from_name("stixanalytix-worker", "backfill_clips")
    for i, job_id in enumerate(JOBS, 1):
        print(f"[{i}/{len(JOBS)}] starting {job_id} (force={FORCE_REBUILD})...", flush=True)
        result = backfill.remote(job_id, force=FORCE_REBUILD)
        print(f"[{i}/{len(JOBS)}]   done: {result}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
