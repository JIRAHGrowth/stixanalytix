"""
Build synthesized ground-truth JSON files from coach-reviewed published matches.

The coach has reviewed Gemini's output for each published video_job — accepted,
rejected, edited, or added events. The post-review published tables (matches,
goals_scored, goals_conceded, shot_events, distribution_events) ARE the truth
for those matches. This script reconstructs them into the same JSON shape as
the hand-curated workbooks in scripts/ground-truth/ so build-sft-training-data.py
can consume them unchanged.

Output: scripts/ground-truth-corrections/<keeper>-<date>-<opp>-<jobid8>.json

Usage:
    # All published jobs since a date
    python scripts/build-truth-from-corrections.py --published-since 2026-04-01

    # Specific job(s)
    python scripts/build-truth-from-corrections.py --job <uuid> [--job <uuid>]

    # Validate (don't write files; print summary)
    python scripts/build-truth-from-corrections.py --validate

Then feed the synthesized files to the SFT builder:
    python scripts/build-sft-training-data.py \
        --truth scripts/ground-truth-corrections/judah-*.json \
        --out training/sft-from-corrections.jsonl

Caveat: this is post-review truth, not independent tagging. eval-match.js
precision against this is meaningful (every false positive the coach dropped
shows up as a true positive that the model now should also drop). Recall is
only meaningful for events the model originally detected OR that the coach
manually added during review.

When build-sft-training-data.py runs on these files, the rows it emits teach
the model:
  - to KEEP events the coach kept (positive examples)
  - to DROP events the coach rejected (negative — the model emitted these but
    the synthesized truth has them omitted, so the SFT pass learns to predict
    a shorter list)
  - to ADD events the coach added (positive — model didn't see them but truth
    contains them, so the SFT pass learns the patterns it was missing)
"""
from __future__ import annotations
import argparse
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--job", action="append", default=None,
                   help="Specific video_job_id(s). Can repeat. "
                        "Default: all published jobs.")
    p.add_argument("--published-since", default=None,
                   help="Only include jobs published on/after this date (YYYY-MM-DD).")
    p.add_argument("--out-dir", default="scripts/ground-truth-corrections",
                   help="Output directory for synthesized truth files.")
    p.add_argument("--validate", action="store_true",
                   help="Don't write files; print what would be built.")
    p.add_argument("--overwrite", action="store_true",
                   help="Overwrite existing synthesized truth files.")
    return p.parse_args()


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", str(s).lower()).strip("-")


def sb_client():
    """Drop-in REST-API client (no supabase-py dependency). Same approach as
    scripts/build-sft-training-data.py — keeps local env minimal."""
    from dotenv import load_dotenv
    import requests
    load_dotenv(ROOT / ".env.local")
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

    class Client:
        def __init__(self):
            self.base = f"{url}/rest/v1"
            self.headers = {"apikey": key, "Authorization": f"Bearer {key}"}

        def get(self, table: str, params: dict) -> list[dict]:
            r = requests.get(f"{self.base}/{table}", params=params,
                             headers=self.headers, timeout=30)
            r.raise_for_status()
            return r.json()

    return Client()


def fetch_published_jobs(sb, job_filter: list[str] | None, since: str | None) -> list[dict]:
    params = {
        "select": "id,match_id,published_match_id,coach_id,keeper_id,match_metadata,storage_path,created_at,finished_at",
        "status": "eq.published",
        "order": "finished_at.desc",
    }
    if job_filter:
        params["id"] = f"in.({','.join(job_filter)})"
    if since:
        params["finished_at"] = f"gte.{since}"
    return sb.get("video_jobs", params)


def fetch_match(sb, match_id: str) -> dict | None:
    if not match_id:
        return None
    rows = sb.get("matches", {"select": "*", "id": f"eq.{match_id}"})
    return rows[0] if rows else None


def fetch_keeper(sb, keeper_id: str) -> dict | None:
    if not keeper_id:
        return None
    rows = sb.get("keepers", {"select": "id,name", "id": f"eq.{keeper_id}"})
    return rows[0] if rows else None


def fetch_events(sb, table: str, match_id: str) -> list[dict]:
    if not match_id:
        return []
    return sb.get(table, {"select": "*", "match_id": f"eq.{match_id}"})


def derive_team_colors(job_metadata: dict, match_row: dict | None) -> dict:
    """match_metadata on video_jobs holds the colors the coach uploaded with.
    Fall back to defaults so the prompts still render."""
    meta = job_metadata or {}
    return {
        "my_team_color": meta.get("my_team_color") or "black",
        "opponent_color": meta.get("opponent_color") or "white",
        "my_keeper_color": meta.get("my_keeper_color") or "orange",
    }


def reshape_goals(
    goals_scored: list[dict],
    goals_conceded: list[dict],
    colors: dict,
) -> list[dict]:
    """Combine KCITY goals (goals_scored) and opponent goals (goals_conceded)
    into the unified goals list the prompt expects, with scoring_team /
    conceding_team filled in."""
    out = []
    for g in goals_scored or []:
        out.append({
            "timestamp_seconds": g.get("timestamp_seconds"),
            "match_clock": None,
            "scoring_team": colors["my_team_color"],
            "conceding_team": colors["opponent_color"],
            "attack_type": g.get("attack_type"),
            "shot_type": None,
            "shot_location": None,
            "goal_placement_height": None,
            "goal_placement_side": None,
            "shot_description": g.get("shot_description"),
            "gk_observations": None,
            "note": g.get("coach_notes"),
            "_source": "goals_scored",
        })
    for g in goals_conceded or []:
        out.append({
            "timestamp_seconds": g.get("timestamp_seconds"),
            "match_clock": None,
            "scoring_team": colors["opponent_color"],
            "conceding_team": colors["my_team_color"],
            "attack_type": None,
            "shot_type": g.get("shot_type"),
            "shot_location": g.get("shot_origin"),
            "goal_placement_height": None,
            "goal_placement_side": g.get("goal_zone"),
            "shot_description": g.get("shot_description"),
            "gk_observations": g.get("gk_observations"),
            "note": g.get("coach_notes"),
            "_source": "goals_conceded",
        })
    out.sort(key=lambda e: (e.get("timestamp_seconds") is None, e.get("timestamp_seconds") or 0))
    return out


def reshape_saves(shot_events: list[dict]) -> list[dict]:
    """shot_events covers every shot on Judah's goal — both saved and conceded.
    For SFT we include all of them; the prompt's `saves` schema can carry the
    `gk_action: Goal` rows since they're useful for learning save-vs-goal
    boundaries."""
    out = []
    for s in shot_events or []:
        out.append({
            "timestamp_seconds": s.get("timestamp_seconds"),
            "match_clock": None,
            "shot_origin": s.get("shot_origin"),
            "shot_type": s.get("shot_type"),
            "on_target": s.get("on_target"),
            "gk_action": s.get("gk_action"),
            "gk_visible": s.get("gk_visible"),
            "outcome": s.get("outcome"),
            "body_distance_zone": s.get("body_distance_zone"),
            "goal_placement_height": s.get("goal_placement_height"),
            "goal_placement_side": s.get("goal_placement_side"),
            "shot_description": s.get("shot_description"),
            # preceding_attack — Phase 2.6 schema field. Coaches haven't been
            # tagging this historically; left null so build-sft will emit
            # rows without it. Rule F skips this requirement at training time.
            "preceding_attack": None,
            "gk_observations": s.get("gk_observations"),
            "note": s.get("coach_notes"),
        })
    out.sort(key=lambda e: (e.get("timestamp_seconds") is None, e.get("timestamp_seconds") or 0))
    return out


def reshape_distribution(distribution_events: list[dict]) -> list[dict]:
    out = []
    for d in distribution_events or []:
        out.append({
            "timestamp_seconds": d.get("timestamp_seconds"),
            "match_clock": d.get("match_clock"),
            "trigger": d.get("trigger"),
            "type": d.get("type"),
            "successful": d.get("successful"),
            "press_state": "pressed" if d.get("under_pressure") is True
                           else "unpressed" if d.get("under_pressure") is False
                           else "unclear",
            "pass_selection": d.get("pass_selection"),
            "direction": d.get("direction"),
            "receiver": d.get("receiver"),
            "first_touch": d.get("first_touch"),
            "note": d.get("notes"),
        })
    out.sort(key=lambda e: (e.get("timestamp_seconds") is None, e.get("timestamp_seconds") or 0))
    return out


def build_truth_record(job: dict, match: dict | None, keeper: dict | None,
                       goals_scored, goals_conceded, shot_events, distribution_events) -> dict:
    colors = derive_team_colors(job.get("match_metadata"), match)
    goals = reshape_goals(goals_scored, goals_conceded, colors)
    saves = reshape_saves(shot_events)
    dist = reshape_distribution(distribution_events)
    opponent = (match or {}).get("opponent") or (job.get("match_metadata") or {}).get("opponent") or "unknown"
    match_date = (match or {}).get("match_date") or (job.get("match_metadata") or {}).get("match_date")
    venue = (match or {}).get("venue") or (job.get("match_metadata") or {}).get("venue")
    final_score = None
    if match and match.get("goals_for") is not None and match.get("goals_against") is not None:
        final_score = f"{match['goals_for']}-{match['goals_against']}"

    keeper_slug = slugify((keeper or {}).get("name") or "judah")
    record = {
        "match_name": f"{keeper_slug}-vs-{slugify(opponent)}-{match_date or 'unknown'}",
        "match_date": match_date,
        "opponent": opponent,
        "venue": venue,
        "session_type": (match or {}).get("session_type") or "Match",
        "age_group": None,
        **colors,
        "duration_seconds": None,
        "final_score": final_score,
        "video_job_id": job["id"],
        "events": {
            "goals": goals,
            "saves": saves,
            "distribution": dist,
            "crosses": [],
            "sweeper": [],
            "one_v_ones": [],
        },
        "distribution_summary": None,
        "_source": "corrections_from_published",
        "_source_job": job["id"],
        "_source_match": (match or {}).get("id"),
    }
    return record


def main() -> int:
    args = parse_args()
    sb = sb_client()

    jobs = fetch_published_jobs(sb, args.job, args.published_since)
    print(f"published jobs found: {len(jobs)}")
    if not jobs:
        print("(nothing to do)")
        return 0

    out_dir = (ROOT / args.out_dir).resolve()
    if not args.validate:
        out_dir.mkdir(parents=True, exist_ok=True)

    summary = []
    for job in jobs:
        match = fetch_match(sb, job.get("published_match_id"))
        keeper = fetch_keeper(sb, job.get("keeper_id"))
        match_id = (match or {}).get("id")
        goals_scored = fetch_events(sb, "goals_scored", match_id)
        goals_conceded = fetch_events(sb, "goals_conceded", match_id)
        shot_events = fetch_events(sb, "shot_events", match_id)
        distribution_events = fetch_events(sb, "distribution_events", match_id)

        rec = build_truth_record(job, match, keeper,
                                 goals_scored, goals_conceded,
                                 shot_events, distribution_events)
        keeper_slug = slugify((keeper or {}).get("name") or "judah")
        date_part = rec["match_date"] or "nodate"
        opp_slug = slugify(rec["opponent"])
        out_name = f"{keeper_slug}-{date_part}-{opp_slug}-{job['id'][:8]}.json"
        out_path = out_dir / out_name

        counts = {
            "goals": len(rec["events"]["goals"]),
            "saves": len(rec["events"]["saves"]),
            "distribution": len(rec["events"]["distribution"]),
        }
        summary.append({
            "job_id": job["id"],
            "match_id": match_id,
            "out_name": out_name,
            "counts": counts,
        })
        print(f"  {out_name}  goals={counts['goals']}  saves={counts['saves']}  dist={counts['distribution']}")

        if args.validate:
            continue
        if out_path.exists() and not args.overwrite:
            print(f"    (exists; --overwrite to replace)")
            continue
        out_path.write_text(json.dumps(rec, indent=2, default=str), encoding="utf-8")

    print()
    print(f"=== summary ===")
    print(f"  jobs processed: {len(summary)}")
    total_g = sum(s["counts"]["goals"] for s in summary)
    total_s = sum(s["counts"]["saves"] for s in summary)
    total_d = sum(s["counts"]["distribution"] for s in summary)
    print(f"  total events: goals={total_g}  saves={total_s}  dist={total_d}")
    if args.validate:
        print("  (--validate; no files written)")
    else:
        print(f"  output dir: {out_dir.relative_to(ROOT)}")
        print()
        print("  next: feed these to build-sft-training-data.py")
        print(f"    python scripts/build-sft-training-data.py \\")
        print(f"        --truth {out_dir.relative_to(ROOT)}/<file>.json \\")
        print(f"        --out training/sft-from-corrections.jsonl")
    return 0


if __name__ == "__main__":
    sys.exit(main())
