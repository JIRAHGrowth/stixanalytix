"""
Per-keeper performance breakdown.

When keeper #2 onboards (Week 3 of the roadmap), we'll need to know
immediately whether a tuned model is overfitting on Judah's data. This
harness sets up the breakdown NOW — with N=1 it's degenerate, but the
moment keeper #2 has reviewed matches, the same script tells us if the
tuned model's precision/recall differ across keepers.

Sources:
  - Bench results JSONs (output of run-bench-job-v2.py)
  - Hand-curated truth files in scripts/ground-truth/ (each carries a
    video_job_id; we look up the keeper from video_jobs)

For each (keeper, section), reports: total events truth/pred, TP/FP/FN,
precision/recall.

Usage:
    python scripts/measure-per-keeper.py --out scripts/bench-results/scorecards/per-keeper-2026-05-27.md
"""
from __future__ import annotations
import argparse
import glob
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--bench-glob",
                   default="scripts/bench-results/*/gemini-2.5-flash.v3-prompts.reconciled.json")
    p.add_argument("--truth-dir", default="scripts/ground-truth")
    p.add_argument("--tolerance", type=int, default=10)
    p.add_argument("--out", default=None)
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
            self.headers = {"apikey": key, "Authorization": f"Bearer {key}"}
        def get(self, table, params):
            r = requests.get(f"{self.base}/{table}", params=params,
                             headers=self.headers, timeout=30)
            r.raise_for_status()
            return r.json()
    return C()


def fetch_jobs_by_ids(sb, ids: list[str]) -> dict:
    if not ids:
        return {}
    params = {
        "select": "id,keeper_id",
        "id": f"in.({','.join(ids)})",
    }
    return {r["id"]: r for r in sb.get("video_jobs", params)}


def fetch_keepers_by_ids(sb, ids: list[str]) -> dict:
    ids = [i for i in ids if i]
    if not ids:
        return {}
    params = {
        "select": "id,name",
        "id": f"in.({','.join(ids)})",
    }
    return {r["id"]: r for r in sb.get("keepers", params)}


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
    used_t, used_p = set(), set()
    for d, ti, pi in pairs:
        if ti in used_t or pi in used_p: continue
        used_t.add(ti); used_p.add(pi)
    return used_t, used_p


def extract_preds(payload, section):
    root = payload.get("gemini_output", payload)
    sb = root.get(section, {}) or {}
    return list((sb.get("parsed") or {}).get(section, []) or [])


def main() -> int:
    args = parse_args()
    sb = sb_client()

    # Load truth files; pull video_job_ids
    truth_paths = sorted(Path(p) for p in
                         glob.glob(str(ROOT / args.truth_dir / "*.json")))
    truth_by_match = {}
    job_id_to_match = {}
    for tp in truth_paths:
        try:
            j = json.loads(tp.read_text(encoding="utf-8"))
        except Exception:
            continue
        match_key = tp.stem
        jid = j.get("video_job_id")
        if jid:
            truth_by_match[match_key] = j
            job_id_to_match[jid] = match_key

    # Resolve keepers
    job_rows = fetch_jobs_by_ids(sb, list(job_id_to_match.keys()))
    keeper_ids = sorted({r["keeper_id"] for r in job_rows.values() if r.get("keeper_id")})
    keepers = fetch_keepers_by_ids(sb, keeper_ids)

    # Aggregate by keeper × section
    agg = defaultdict(lambda: defaultdict(lambda: {"tp": 0, "fp": 0, "fn": 0}))
    matches_per_keeper = defaultdict(set)

    bench_paths = sorted(Path(p) for p in glob.glob(str(ROOT / args.bench_glob)))
    for bp in bench_paths:
        match_key = bp.parent.name
        truth = truth_by_match.get(match_key)
        if not truth:
            continue
        jid = truth.get("video_job_id")
        keeper_id = (job_rows.get(jid) or {}).get("keeper_id")
        if not keeper_id:
            continue
        matches_per_keeper[keeper_id].add(match_key)
        bench = json.loads(bp.read_text(encoding="utf-8"))
        for section in ("goals", "saves", "distribution"):
            truths = (truth.get("events") or {}).get(section, []) or []
            preds = extract_preds(bench, section)
            used_t, used_p = match_pairs(truths, preds, args.tolerance)
            agg[keeper_id][section]["tp"] += len(used_p)
            agg[keeper_id][section]["fp"] += len(preds) - len(used_p)
            agg[keeper_id][section]["fn"] += len(truths) - len(used_t)

    # Render
    lines = []
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    lines.append(f"# Per-keeper performance — {ts}")
    lines.append("")
    lines.append(f"Tolerance ±{args.tolerance}s. Bench: {len(bench_paths)} files.")
    lines.append("")
    lines.append("This breakdown answers: 'is the model's performance "
                 "consistent across keepers, or is it Judah-specific?' "
                 "Critical for detecting overfit after the first SFT pass.")
    lines.append("")
    if len(agg) <= 1:
        lines.append("**Current state: N=1 keeper in the corpus.** The harness is "
                     "in place — when keeper #2 onboards and has reviewed matches, "
                     "this report will surface any cross-keeper performance gap.")
        lines.append("")

    lines.append("## Per-keeper breakdown")
    lines.append("")
    for keeper_id in sorted(agg.keys()):
        k_name = (keepers.get(keeper_id) or {}).get("name", "(unknown)")
        match_count = len(matches_per_keeper[keeper_id])
        lines.append(f"### {k_name} (`{keeper_id[:8]}`) — {match_count} match(es)")
        lines.append("")
        lines.append("| Section | TP | FP | FN | Precision | Recall |")
        lines.append("|---|---|---|---|---|---|")
        for section in ("goals", "saves", "distribution"):
            c = agg[keeper_id][section]
            tp, fp, fn = c["tp"], c["fp"], c["fn"]
            prec = tp / (tp + fp) * 100 if (tp + fp) else 0
            rec = tp / (tp + fn) * 100 if (tp + fn) else 0
            lines.append(f"| {section} | {tp} | {fp} | {fn} | "
                         f"{prec:.1f}% | {rec:.1f}% |")
        lines.append("")

    # Cross-keeper comparison table (only meaningful when N≥2)
    if len(agg) >= 2:
        lines.append("## Cross-keeper comparison")
        lines.append("")
        lines.append("| Section | Metric | " + " | ".join(
            (keepers.get(k) or {}).get("name", k[:8]) for k in sorted(agg.keys())
        ) + " |")
        lines.append("|---" * (len(agg) + 2) + "|")
        for section in ("goals", "saves", "distribution"):
            for metric in ("precision", "recall"):
                row = [section, metric]
                for keeper_id in sorted(agg.keys()):
                    c = agg[keeper_id][section]
                    tp, fp, fn = c["tp"], c["fp"], c["fn"]
                    if metric == "precision":
                        v = tp / (tp + fp) * 100 if (tp + fp) else 0
                    else:
                        v = tp / (tp + fn) * 100 if (tp + fn) else 0
                    row.append(f"{v:.1f}%")
                lines.append("| " + " | ".join(row) + " |")
        lines.append("")
        lines.append("**Interpretation rule of thumb:** if any metric differs "
                     "by >15pp across keepers, suspect keeper-specific overfit "
                     "(or genuinely different match shapes in their corpora).")
        lines.append("")
    else:
        lines.append("## Cross-keeper comparison")
        lines.append("")
        lines.append("(needs ≥2 keepers in the corpus; not yet applicable)")
        lines.append("")

    report = "\n".join(lines)
    print(report)
    if args.out:
        out_path = (ROOT / args.out).resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(report, encoding="utf-8")
        print(f"\nWrote {out_path.relative_to(ROOT)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
