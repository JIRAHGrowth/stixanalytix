"""
SFT corpus orchestrator — end-to-end builder for the Vertex SFT training set.

One command. Discovers eligible matches, enforces train/eval holdout, validates
video presence in GCS, generates truth files + Vertex JSONL, emits a manifest
that documents the entire build.

Holdout policy (documented in code, not convention):
  EVAL = video_jobs whose video_job_id is referenced from a hand-curated
         truth file in scripts/ground-truth/*.json. Independent human truth,
         not seeded from Gemini's own output.
  TRAIN = all other published video_jobs. Truth is synthesized from the
          post-review published tables (matches, goals_*, shot_events,
          distribution_events) via scripts/build-truth-from-corrections.py.

Structural guarantee: a video_job_id can be in TRAIN or EVAL but never both.
The orchestrator refuses to build if it detects overlap.

Usage:
    # Audit only — report what would be built, don't write files
    python scripts/build-sft-corpus.py --validate

    # Full build
    python scripts/build-sft-corpus.py --out training/v1

    # Skip the EVAL JSONL (only useful for production-like training runs)
    python scripts/build-sft-corpus.py --out training/v1 --no-eval

Outputs (under <out>/):
    train.jsonl           — Vertex SFT-format training rows
    train.stats.json
    eval.jsonl            — Same format, eval split
    eval.stats.json
    manifest.json         — Build provenance: corpus version, commit, splits,
                            per-keeper counts, per-section counts, skip reasons
    holdout-policy.md     — Human-readable record of the split and why

Senior-dev concerns this script intentionally addresses:
  * Reproducibility: every build tagged with commit SHA + timestamp.
  * Auditability: manifest enumerates every match, with reason if skipped.
  * Holdout discipline: structural — no overlap possible.
  * Idempotency: safe to re-run. Existing files reused unless --overwrite.
"""
from __future__ import annotations
import argparse
import glob
import json
import os
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--out", default=None,
                   help="Output directory. Required unless --validate.")
    p.add_argument("--validate", action="store_true",
                   help="Don't write files. Report eligibility + counts.")
    p.add_argument("--overwrite", action="store_true",
                   help="Overwrite existing output files.")
    p.add_argument("--no-eval", action="store_true",
                   help="Skip the EVAL JSONL (training-only build).")
    p.add_argument("--include-missing-video", action="store_true",
                   help="Emit rows even for matches whose video isn't in GCS yet.")
    p.add_argument("--chunk-duration-sec", type=int, default=300)
    p.add_argument("--media-resolution", default="MEDIA_RESOLUTION_MEDIUM",
                   choices=["MEDIA_RESOLUTION_LOW", "MEDIA_RESOLUTION_MEDIUM"])
    return p.parse_args()


def sb_client():
    """REST-only Supabase client. Same shape as build-truth-from-corrections.py."""
    from dotenv import load_dotenv
    import requests
    load_dotenv(ROOT / ".env.local")
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

    class Client:
        def __init__(self):
            self.base = f"{url}/rest/v1"
            self.headers = {"apikey": key, "Authorization": f"Bearer {key}"}

        def get(self, table, params):
            r = requests.get(f"{self.base}/{table}", params=params,
                             headers=self.headers, timeout=30)
            r.raise_for_status()
            return r.json()

    return Client()


def fetch_published_jobs(sb) -> list[dict]:
    return sb.get("video_jobs", {
        "select": "id,published_match_id,keeper_id,match_metadata,storage_path,finished_at",
        "status": "eq.published",
        "order": "finished_at.desc",
    })


def load_hand_curated_truth_files() -> dict[str, Path]:
    """Returns {video_job_id: path} for every hand-curated truth file in
    scripts/ground-truth/ that has a video_job_id. These are the EVAL set."""
    out = {}
    for tp in sorted(Path(ROOT / "scripts" / "ground-truth").glob("*.json")):
        try:
            j = json.loads(tp.read_text(encoding="utf-8"))
        except Exception:
            continue
        jid = j.get("video_job_id")
        if jid:
            out[jid] = tp
    return out


def gcloud_cmd_path() -> str:
    candidates = [
        os.environ.get("GCLOUD_PATH"),
        "gcloud",
        "C:/Users/joshu/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd",
    ]
    for c in candidates:
        if not c:
            continue
        try:
            subprocess.run([c, "--version"], capture_output=True, check=True, timeout=10)
            return c
        except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
            continue
    return ""


def check_gcs(bucket: str, job_id: str, gcloud: str) -> tuple[bool, str]:
    """Check both bench-videos/ AND match-videos/ paths (the codebase has
    historically used both — bench writes to one, SFT builder reads the other).
    Returns (exists, canonical_uri). Canonical is bench-videos/ when found
    there, otherwise match-videos/."""
    if not gcloud:
        return True, f"gs://{bucket}/bench-videos/{job_id}.mp4"  # assume present
    for prefix in ("bench-videos", "match-videos"):
        gs_uri = f"gs://{bucket}/{prefix}/{job_id}.mp4"
        try:
            r = subprocess.run(
                [gcloud, "storage", "objects", "describe", gs_uri,
                 "--format=value(size)"],
                capture_output=True, text=True, timeout=20,
            )
            if r.returncode == 0 and r.stdout.strip():
                return True, gs_uri
        except (subprocess.TimeoutExpired, subprocess.CalledProcessError):
            continue
    return False, f"gs://{bucket}/bench-videos/{job_id}.mp4"  # canonical=bench-videos


def get_gcs_bucket() -> str:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env.local")
    b = os.environ.get("GCS_TRAINING_BUCKET")
    if not b:
        print("ERROR: GCS_TRAINING_BUCKET not set in .env.local", file=sys.stderr)
        sys.exit(1)
    return b


def get_commit_sha() -> str | None:
    try:
        r = subprocess.run(["git", "rev-parse", "HEAD"],
                           capture_output=True, text=True, cwd=ROOT, timeout=5)
        return r.stdout.strip() or None
    except Exception:
        return None


def slugify(s: str) -> str:
    import re
    return re.sub(r"[^a-z0-9]+", "-", str(s).lower()).strip("-")


def run_subprocess(cmd: list[str], desc: str) -> int:
    print(f"  [run] {' '.join(cmd)}")
    r = subprocess.run(cmd, cwd=ROOT, env={**os.environ, "PYTHONUTF8": "1"})
    if r.returncode != 0:
        print(f"  [fail] {desc} (exit {r.returncode})", file=sys.stderr)
    return r.returncode


def build_train_truth_files(train_job_ids: list[str]) -> tuple[list[Path], list[dict]]:
    """Generate corrections-derived truth files for training matches.
    Returns (truth_paths, skip_reasons)."""
    if not train_job_ids:
        return [], []
    # Invoke build-truth-from-corrections.py for each train job. The script
    # writes to scripts/ground-truth-corrections/<keeper>-<date>-<opp>-<jid8>.json.
    cmd = [sys.executable, str(ROOT / "scripts" / "build-truth-from-corrections.py"),
           "--overwrite"]
    for jid in train_job_ids:
        cmd += ["--job", jid]
    rc = run_subprocess(cmd, "build-truth-from-corrections")
    if rc != 0:
        return [], [{"reason": "build-truth-from-corrections failed", "exit": rc}]

    # Discover the resulting truth files. The script's filename convention
    # embeds the first 8 chars of the job_id, so we can match unambiguously.
    out_dir = ROOT / "scripts" / "ground-truth-corrections"
    files = []
    for jid in train_job_ids:
        matches = list(out_dir.glob(f"*-{jid[:8]}.json"))
        if matches:
            files.extend(matches)
    return files, []


def main() -> int:
    args = parse_args()
    if not args.validate and not args.out:
        print("ERROR: --out or --validate required.", file=sys.stderr); return 1

    sb = sb_client()
    bucket = get_gcs_bucket()
    gcloud = gcloud_cmd_path()
    commit_sha = get_commit_sha()
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    print(f"=== SFT corpus build ===")
    print(f"  commit:    {commit_sha or '(unknown)'}")
    print(f"  timestamp: {timestamp}")
    print(f"  bucket:    {bucket}")
    print(f"  gcloud:    {'OK' if gcloud else '(missing — GCS presence assumed)'}")
    print()

    # 1. Discover all published jobs + hand-curated truth files
    jobs = fetch_published_jobs(sb)
    eval_truth_files = load_hand_curated_truth_files()
    print(f"Published jobs: {len(jobs)}")
    print(f"Hand-curated truth files (EVAL set): {len(eval_truth_files)}")

    # 2. Compute splits
    eval_job_ids = []
    train_job_ids = []
    for j in jobs:
        if j["id"] in eval_truth_files:
            eval_job_ids.append(j["id"])
        else:
            train_job_ids.append(j["id"])

    # Structural overlap guard (paranoid — shouldn't be possible by construction)
    overlap = set(eval_job_ids) & set(train_job_ids)
    if overlap:
        print(f"ERROR: train/eval overlap detected for: {overlap}", file=sys.stderr)
        return 1

    print(f"  TRAIN: {len(train_job_ids)} jobs")
    print(f"  EVAL:  {len(eval_job_ids)} jobs (hand-curated)")
    print()

    # 3. GCS presence audit (both splits)
    print("=== GCS presence audit ===")
    gcs_status = {}
    needs_upload = []
    for jid in (eval_job_ids + train_job_ids):
        present, uri = check_gcs(bucket, jid, gcloud)
        gcs_status[jid] = {"present": present, "uri": uri}
        if not present:
            needs_upload.append(jid)
        marker = "[+]" if present else "[ ]"
        print(f"  {marker} {jid[:8]}  {uri}")
    print()
    if needs_upload:
        print(f"  {len(needs_upload)} video(s) NOT in GCS. The orchestrator will mark these")
        print(f"  as skipped in the manifest. To upload them, run the bench worker on each")
        print(f"  (which auto-uploads), or invoke ensure_video_in_gcs directly:")
        for jid in needs_upload:
            print(f"    python -c \"from pathlib import Path; import sys; sys.path.insert(0,'scripts'); "
                  f"exec(open('scripts/run-bench-job-v2.py').read().split('def ensure_video_in_gcs')[1]"
                  f".split('def ')[0]); print('see ensure_video_in_gcs in run-bench-job-v2.py')\"")
        print()

    # 4. Build TRAIN truth files (skip jobs without GCS unless --include-missing-video)
    eligible_train = [
        j for j in train_job_ids
        if gcs_status[j]["present"] or args.include_missing_video
    ]
    eligible_eval = [
        j for j in eval_job_ids
        if gcs_status[j]["present"] or args.include_missing_video
    ]

    print(f"=== Truth-file generation (TRAIN) ===")
    print(f"  eligible TRAIN jobs: {len(eligible_train)}")

    train_truth_paths = []
    if eligible_train and not args.validate:
        train_truth_paths, skip_reasons = build_train_truth_files(eligible_train)
        for sr in skip_reasons:
            print(f"  WARN: {sr}")
    elif args.validate:
        # validate-mode: assume the files would be generated
        train_truth_paths = [
            ROOT / "scripts" / "ground-truth-corrections" / f"placeholder-{j[:8]}.json"
            for j in eligible_train
        ]

    eval_truth_paths = [eval_truth_files[j] for j in eligible_eval]
    print(f"  TRAIN truth files: {len(train_truth_paths)}")
    print(f"  EVAL truth files:  {len(eval_truth_paths)}")
    print()

    # 5. Run build-sft-training-data.py for TRAIN and EVAL separately
    if args.out:
        out_dir = (ROOT / args.out).resolve()
        out_dir.mkdir(parents=True, exist_ok=True)
    else:
        out_dir = None

    sft_stats = {"train": None, "eval": None}
    for split_name, truth_paths in [("train", train_truth_paths),
                                    ("eval", eval_truth_paths)]:
        if split_name == "eval" and args.no_eval:
            continue
        if not truth_paths:
            print(f"  {split_name}: no truth files; skipping.")
            continue
        if args.validate:
            print(f"  {split_name}: would build {len(truth_paths)} truth file(s)")
            continue

        out_file = out_dir / f"{split_name}.jsonl"
        if out_file.exists() and not args.overwrite:
            print(f"  {split_name}: {out_file} exists (use --overwrite to replace)")
            continue

        cmd = [
            sys.executable, str(ROOT / "scripts" / "build-sft-training-data.py"),
            "--out", str(out_file),
            "--chunk-duration-sec", str(args.chunk_duration_sec),
            "--media-resolution", args.media_resolution,
        ]
        for tp in truth_paths:
            cmd += ["--truth", str(tp)]
        if args.include_missing_video:
            cmd.append("--include-missing-video")
        rc = run_subprocess(cmd, f"build-sft-training-data ({split_name})")
        if rc != 0:
            print(f"  {split_name}: build failed. Continuing with what we have.")
            continue
        stats_file = out_file.with_suffix(".stats.json")
        if stats_file.exists():
            sft_stats[split_name] = json.loads(stats_file.read_text(encoding="utf-8"))

    # 6. Manifest — the auditable single source of truth for what was built
    keepers = defaultdict(lambda: {"train": 0, "eval": 0})
    for j in jobs:
        kid = j.get("keeper_id")
        if not kid:
            continue
        bucket_name = "eval" if j["id"] in eval_truth_files else "train"
        keepers[kid][bucket_name] += 1

    manifest = {
        "corpus_version": (args.out or "(validate)").rsplit("/", 1)[-1],
        "commit_sha": commit_sha,
        "built_at": timestamp,
        "chunk_duration_sec": args.chunk_duration_sec,
        "media_resolution": args.media_resolution,
        "bucket": bucket,
        "holdout_policy": (
            "EVAL = video_jobs referenced from a hand-curated truth file in "
            "scripts/ground-truth/. TRAIN = all other published video_jobs, "
            "truth synthesized from coach_corrections via "
            "build-truth-from-corrections.py. No overlap by construction."
        ),
        "splits": {
            "train": {
                "jobs": sorted(eligible_train),
                "rows": (sft_stats["train"] or {}).get("total_rows"),
                "skipped": sorted(set(train_job_ids) - set(eligible_train)),
            },
            "eval": {
                "jobs": sorted(eligible_eval),
                "rows": (sft_stats["eval"] or {}).get("total_rows"),
                "skipped": sorted(set(eval_job_ids) - set(eligible_eval)),
            },
        },
        "per_keeper": {k: dict(v) for k, v in keepers.items()},
        "skipped_due_to_missing_video": sorted(needs_upload),
        "gcs_status": gcs_status,
    }

    print()
    print("=== Build summary ===")
    print(f"  TRAIN: {len(eligible_train)} jobs ({manifest['splits']['train']['rows']} rows)")
    print(f"  EVAL:  {len(eligible_eval)} jobs ({manifest['splits']['eval']['rows']} rows)")
    print(f"  Skipped (no GCS): {len(needs_upload)}")
    print(f"  Per-keeper:")
    for k, v in keepers.items():
        print(f"    {k[:8]}: TRAIN={v['train']} EVAL={v['eval']}")

    if args.validate:
        print()
        print("(--validate mode; no files written)")
        return 0

    if not out_dir:
        return 0

    # Write manifest + human-readable holdout policy
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, default=str), encoding="utf-8"
    )

    holdout_md = (out_dir / "holdout-policy.md")
    holdout_md.write_text(_render_holdout_policy(manifest, jobs, eval_truth_files),
                          encoding="utf-8")

    print()
    print(f"  manifest:        {out_dir.relative_to(ROOT)}/manifest.json")
    print(f"  holdout policy:  {out_dir.relative_to(ROOT)}/holdout-policy.md")
    return 0


def _render_holdout_policy(manifest: dict, jobs: list[dict],
                           eval_truth_files: dict[str, Path]) -> str:
    """Human-readable record of WHICH match landed in WHICH split and why.
    A sr. dev would want to read this and immediately understand the corpus."""
    lines = [
        "# Holdout policy",
        "",
        f"Built at: {manifest['built_at']}",
        f"Commit:   {manifest['commit_sha'] or '(unknown)'}",
        "",
        "## Policy",
        "",
        f"{manifest['holdout_policy']}",
        "",
        "## Per-match assignment",
        "",
        "| video_job_id | split | reason |",
        "|---|---|---|",
    ]
    by_id = {j["id"]: j for j in jobs}
    for jid in sorted(by_id.keys()):
        if jid in eval_truth_files:
            split = "EVAL"
            reason = f"hand-curated: `{eval_truth_files[jid].relative_to(ROOT)}`"
        else:
            split = "TRAIN"
            reason = "no hand-curated truth; synthesized from published tables"
        lines.append(f"| `{jid[:8]}` | {split} | {reason} |")
    lines.append("")
    return "\n".join(lines)


if __name__ == "__main__":
    sys.exit(main())
