"""
Record a model run into the model_runs lineage table.

Three flows:

  1. Record a single bench run:
       python scripts/record-model-run.py \\
         --run-type bench \\
         --artifact scripts/bench-results/judah-2026-05-23-pfc/gemini-2.5-flash.v3-prompts.reconciled.json \\
         --truth scripts/ground-truth/judah-2026-05-23-pfc.json \\
         --notes 'v3 prompts; first PFC measurement'

  2. Backfill all v3 bench results at once:
       python scripts/record-model-run.py --backfill-v3

  3. List recent runs:
       python scripts/record-model-run.py --list [--model gemini-2.5-flash]

The script computes the scorecard (precision/recall/MAE per section) from
the artifact + truth using the same matching logic as eval-match.js. It
also captures prompt hashes from the current working tree so the row is
self-contained provenance.

A senior dev's first question on any model output is "what code produced
this?" — this table answers that for every committed bench run.
"""
from __future__ import annotations
import argparse
import glob
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def parse_args():
    p = argparse.ArgumentParser()
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--artifact", help="Bench JSON to record")
    g.add_argument("--backfill-v3", action="store_true",
                   help="Find and record every gemini-*.v3-prompts.reconciled.json under scripts/bench-results/")
    g.add_argument("--list", action="store_true",
                   help="Print recent model_runs rows.")
    p.add_argument("--truth", help="Truth JSON to score against (required for --artifact)")
    p.add_argument("--tolerance", type=int, default=10)
    p.add_argument("--run-type", default="bench",
                   choices=["bench", "production", "sft_training", "sft_eval"])
    p.add_argument("--corpus-version", default=None)
    p.add_argument("--notes", default="")
    p.add_argument("--model", default=None, help="Filter for --list mode")
    return p.parse_args()


def sb_client():
    from dotenv import load_dotenv
    import requests
    load_dotenv(ROOT / ".env.local")
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    class C:
        def __init__(self):
            self.base = f"{url}/rest/v1"
            self.headers = {"apikey": key, "Authorization": f"Bearer {key}",
                            "Content-Type": "application/json",
                            "Prefer": "return=representation"}
        def insert(self, table, row):
            r = requests.post(f"{self.base}/{table}", json=row,
                              headers=self.headers, timeout=30)
            r.raise_for_status()
            return r.json()
        def get(self, table, params):
            r = requests.get(f"{self.base}/{table}", params=params,
                             headers=self.headers, timeout=30)
            r.raise_for_status()
            return r.json()
    return C()


def commit_sha() -> str | None:
    try:
        r = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True,
                           text=True, cwd=ROOT, timeout=5)
        return r.stdout.strip() or None
    except Exception:
        return None


def hash_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()[:16]


def current_prompt_hashes() -> dict:
    out = {}
    for name in ("goals.md", "saves.md", "distribution.md"):
        p = ROOT / "prompts" / name
        if p.exists():
            out[name] = hash_file(p)
    return out


def match_pairs(truths, preds, tol):
    pairs = []
    for ti, tr in enumerate(truths):
        for pi, pr in enumerate(preds):
            if tr.get("timestamp_seconds") is None or pr.get("timestamp_seconds") is None:
                continue
            d = abs(tr["timestamp_seconds"] - pr["timestamp_seconds"])
            if d <= tol:
                pairs.append((d, ti, pi))
    pairs.sort()
    used_t, used_p, mae_sum = set(), set(), 0
    for d, ti, pi in pairs:
        if ti in used_t or pi in used_p: continue
        used_t.add(ti); used_p.add(pi); mae_sum += d
    mae = mae_sum / len(used_t) if used_t else None
    return used_t, used_p, mae


def extract_preds(payload, section):
    root = payload.get("gemini_output", payload)
    sb = root.get(section, {}) or {}
    return list((sb.get("parsed") or {}).get(section, []) or [])


def score_artifact(artifact: Path, truth: Path, tolerance: int) -> dict:
    bench = json.loads(artifact.read_text(encoding="utf-8"))
    truth_data = json.loads(truth.read_text(encoding="utf-8"))
    out = {}
    for section in ("goals", "saves", "distribution"):
        truths = (truth_data.get("events") or {}).get(section, []) or []
        preds = extract_preds(bench, section)
        used_t, used_p, mae = match_pairs(truths, preds, tolerance)
        tp = len(used_p)
        fp = len(preds) - tp
        fn = len(truths) - len(used_t)
        out[section] = {
            "truth_count": len(truths),
            "pred_count": len(preds),
            "tp": tp, "fp": fp, "fn": fn,
            "precision": tp / (tp + fp) if (tp + fp) else None,
            "recall": tp / (tp + fn) if (tp + fn) else None,
            "timestamp_mae_sec": mae,
        }
    return out


def record_run(artifact: Path, truth: Path, run_type: str,
               corpus_version: str | None, notes: str,
               tolerance: int) -> dict:
    bench = json.loads(artifact.read_text(encoding="utf-8"))
    root = bench.get("gemini_output", bench)
    bench_meta = root.get("bench_meta", {}) or {}

    row = {
        "run_type": run_type,
        "model_name": root.get("model") or bench.get("model") or "unknown",
        "base_model": None,  # filled in when this run is a tuned model
        "commit_sha": bench_meta.get("commit_sha") or commit_sha(),
        "config_hash": bench_meta.get("config_hash"),
        "config": bench_meta.get("config") or {},
        "corpus_version": corpus_version,
        "prompt_versions": current_prompt_hashes(),
        "scorecard": score_artifact(artifact, truth, tolerance),
        "artifact_uri": str(artifact.relative_to(ROOT)).replace("\\", "/"),
        "manifest": {
            "match": artifact.parent.name,
            "truth_file": str(truth.relative_to(ROOT)).replace("\\", "/"),
            "tolerance_sec": tolerance,
            "bench_meta_video_duration_sec": bench_meta.get("video_duration_sec"),
        },
        "notes": notes,
    }
    sb = sb_client()
    inserted = sb.insert("model_runs", row)
    return inserted[0] if isinstance(inserted, list) else inserted


def truth_for(artifact: Path) -> Path | None:
    candidate = ROOT / "scripts" / "ground-truth" / f"{artifact.parent.name}.json"
    return candidate if candidate.exists() else None


def main() -> int:
    args = parse_args()

    if args.list:
        sb = sb_client()
        params = {"select": "id,model_name,config_hash,corpus_version,artifact_uri,created_at,scorecard",
                  "order": "created_at.desc", "limit": "20"}
        if args.model:
            params["model_name"] = f"eq.{args.model}"
        rows = sb.get("model_runs", params)
        if not rows:
            print("(no rows)")
            return 0
        print(f"{'created':<20}  {'model':<28}  {'config':<12}  {'corpus':<8}  artifact")
        for r in rows:
            print(f"{r['created_at'][:19]}  {r['model_name']:<28}  "
                  f"{(r['config_hash'] or '-'):<12}  {(r['corpus_version'] or '-'):<8}  "
                  f"{r['artifact_uri']}")
        return 0

    if args.backfill_v3:
        paths = sorted(Path(p) for p in
                       glob.glob(str(ROOT / "scripts" / "bench-results" /
                                     "*" / "gemini-2.5-flash.v3-prompts.reconciled.json")))
        inserted = 0
        for ap in paths:
            tp = truth_for(ap)
            if not tp:
                print(f"  skip {ap.parent.name}: no truth file")
                continue
            row = record_run(ap, tp, "bench", None,
                             f"v3-prompts backfill ({ap.parent.name})",
                             args.tolerance)
            inserted += 1
            print(f"  inserted {row['id'][:8]}  {ap.parent.name}")
        print(f"\nDone. {inserted} rows inserted.")
        return 0

    # Single-artifact mode
    if not args.truth:
        print("ERROR: --truth required with --artifact", file=sys.stderr)
        return 1
    row = record_run(Path(args.artifact).resolve(),
                     Path(args.truth).resolve(),
                     args.run_type, args.corpus_version, args.notes,
                     args.tolerance)
    print(f"Inserted row id={row['id']}")
    print(f"  scorecard summary:")
    for section, m in row["scorecard"].items():
        p = (m['precision'] or 0) * 100
        r = (m['recall'] or 0) * 100
        print(f"    {section:13s} T={m['truth_count']} P={m['pred_count']} "
              f"prec={p:.1f}% rec={r:.1f}%")
    return 0


if __name__ == "__main__":
    sys.exit(main())
