"""
FP/TP characterization — Item #1 diagnostic for the reconciliation rule re-tune.

For one (truth, bench_output) pair: greedy-match predicted events to truth,
classify each predicted event as TP / FP, then dump per-event field values
so we can SEE what distinguishes a TP from an FP. New reconciliation rules
get designed from these patterns; guessing without this data is exactly
how rule re-tunes go sideways.

Inputs:
  --truth <truth.json>            ground-truth file
  --output <bench_output.json>    raw bench output (gemini_output-shaped)
  --job <video_job_id>            OR pull gemini_output from Supabase
  --tolerance 10                  matching window (sec)
  --section goals|saves|distribution|all  which sections to analyze
  --out <report.json>             optional structured dump

Outputs to stdout: per-section
  - TP count, FP count, FN count
  - For each FP: timestamp + key fields, including evidence fields
  - For each TP: same shape (so we can compare side-by-side)
  - Histogram of FP confidence levels
  - Histogram of evidence-field affirmation rates on FPs vs TPs
"""
from __future__ import annotations
import argparse
import json
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--truth", required=True)
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--output", help="local bench output JSON path")
    src.add_argument("--job", help="video_job_id to fetch gemini_output from Supabase")
    p.add_argument("--tolerance", type=int, default=10)
    p.add_argument("--section", default="all", choices=["goals", "saves", "distribution", "all"])
    p.add_argument("--out", default=None, help="optional structured JSON dump")
    return p.parse_args()


def load_truth(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def load_output_from_file(path: str) -> dict:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return data.get("gemini_output", data)


def load_output_from_supabase(job_id: str) -> dict:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")
    import requests
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    r = requests.get(
        f"{url}/rest/v1/video_jobs?id=eq.{job_id}&select=gemini_output",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
        timeout=30,
    )
    r.raise_for_status()
    rows = r.json()
    if not rows:
        raise RuntimeError(f"job {job_id} not found")
    return rows[0]["gemini_output"] or {}


SECTION_LIST_KEY = {"goals": "goals", "saves": "saves", "distribution": "distribution"}


def extract_truth_events(truth: dict, section: str) -> list[dict]:
    return list(truth.get("events", {}).get(section, []) or [])


def extract_predicted_events(gemini_output: dict, section: str) -> list[dict]:
    # gemini_output stores per-section results at top level
    if section == "goals":
        # legacy compat path: top-level parsed.goals AND goals.parsed.goals both exist
        sec = gemini_output.get("goals") or {}
        parsed = sec.get("parsed") if isinstance(sec, dict) else None
        if parsed:
            return list(parsed.get("goals", []) or [])
        # fallback to top-level parsed.goals
        return list((gemini_output.get("parsed") or {}).get("goals", []) or [])
    sec = gemini_output.get(section) or {}
    parsed = sec.get("parsed") if isinstance(sec, dict) else None
    if not parsed:
        return []
    list_key = SECTION_LIST_KEY[section]
    return list(parsed.get(list_key, []) or [])


def greedy_match(truth_events, pred_events, tolerance: int):
    """Return (matches, missed_truth_indices, extra_pred_indices).
    Matches: list of (truth_idx, pred_idx, delta_sec)."""
    pairs = []
    for ti, tr in enumerate(truth_events):
        for pi, pr in enumerate(pred_events):
            t_ts = tr.get("timestamp_seconds")
            p_ts = pr.get("timestamp_seconds")
            if not isinstance(t_ts, (int, float)) or not isinstance(p_ts, (int, float)):
                continue
            delta = abs(t_ts - p_ts)
            if delta <= tolerance:
                pairs.append((delta, ti, pi))
    pairs.sort()
    used_t, used_p, matches = set(), set(), []
    for delta, ti, pi in pairs:
        if ti in used_t or pi in used_p:
            continue
        matches.append((ti, pi, delta))
        used_t.add(ti)
        used_p.add(pi)
    missed = [i for i in range(len(truth_events)) if i not in used_t]
    extra = [i for i in range(len(pred_events)) if i not in used_p]
    return matches, missed, extra


def fmt_ts(s):
    if s is None:
        return "?"
    try:
        s = int(s)
        return f"{s // 60}:{s % 60:02d}"
    except Exception:
        return str(s)


NEGATIVE_EVIDENCE_TOKENS = {
    "", "not_observed", "no_observation", "none", "null", "n/a",
    "scoreboard_not_visible", "no_scoreboard_visible", "scoreboard_unchanged",
    "no_kickoff_observed", "no_celebration_observed", "unclear",
}


def is_affirmative(v):
    if v is None:
        return False
    s = str(v).strip().lower()
    return bool(s) and s not in NEGATIVE_EVIDENCE_TOKENS


def evidence_count_goals(ev):
    fields = ("evidence_kickoff_after", "evidence_celebration", "evidence_scoreboard")
    return sum(1 for f in fields if is_affirmative(ev.get(f)))


def analyze_goals(truth, pred, tolerance):
    matches, missed, extra = greedy_match(truth, pred, tolerance)
    print(f"\n═══ GOALS ═══   truth={len(truth)}  pred={len(pred)}  matched={len(matches)}  fn={len(missed)}  fp={len(extra)}")
    tp_idx = {pi for _, pi, _ in matches}

    # TP profile
    print(f"\n  True positives (n={len(matches)}):")
    for ti, pi, delta in matches:
        p = pred[pi]
        ec = evidence_count_goals(p)
        print(f"    {fmt_ts(p.get('timestamp_seconds'))}  conf={p.get('confidence')}  evidence={ec}/3  "
              f"scoreboard={(p.get('evidence_scoreboard') or '')[:35]!r}  kickoff={(p.get('evidence_kickoff_after') or '')[:25]!r}")

    # FP profile
    print(f"\n  False positives (n={len(extra)}):")
    fp_evidence_dist = Counter()
    fp_conf_dist = Counter()
    fp_sb_dist = Counter()
    for pi in extra:
        p = pred[pi]
        ec = evidence_count_goals(p)
        fp_evidence_dist[ec] += 1
        fp_conf_dist[p.get('confidence')] += 1
        sb = (p.get('evidence_scoreboard') or '').strip().lower()
        # Normalize
        if 'unchanged' in sb: fp_sb_dist['unchanged'] += 1
        elif 'not_visible' in sb or 'not visible' in sb: fp_sb_dist['not_visible'] += 1
        elif '->' in sb: fp_sb_dist['delta_visible'] += 1
        else: fp_sb_dist['other'] += 1
        print(f"    {fmt_ts(p.get('timestamp_seconds'))}  conf={p.get('confidence')}  evidence={ec}/3  "
              f"scoreboard={(p.get('evidence_scoreboard') or '')[:35]!r}  team={p.get('scoring_team')!r}")

    print(f"\n  FP evidence-count distribution: {dict(fp_evidence_dist)}")
    print(f"  FP confidence distribution: {dict(fp_conf_dist)}")
    print(f"  FP scoreboard-evidence distribution: {dict(fp_sb_dist)}")
    return {"matches": matches, "missed": missed, "extra": extra}


def analyze_saves(truth, pred, tolerance):
    matches, missed, extra = greedy_match(truth, pred, tolerance)
    print(f"\n═══ SAVES ═══   truth={len(truth)}  pred={len(pred)}  matched={len(matches)}  fn={len(missed)}  fp={len(extra)}")
    print(f"\n  True positives (n={len(matches)}):")
    for ti, pi, delta in matches[:10]:
        p = pred[pi]
        print(f"    {fmt_ts(p.get('timestamp_seconds'))}  on_target={p.get('on_target')}  action={p.get('gk_action')}  visible={p.get('gk_visible')}  conf={p.get('confidence')}")

    print(f"\n  False positives (n={len(extra)}, showing first 15):")
    fp_action_dist = Counter()
    fp_target_dist = Counter()
    fp_visible_dist = Counter()
    fp_conf_dist = Counter()
    for pi in extra:
        p = pred[pi]
        fp_action_dist[str(p.get('gk_action') or '').lower()] += 1
        fp_target_dist[str(p.get('on_target') or '').lower()] += 1
        fp_visible_dist[str(p.get('gk_visible') or '').lower()] += 1
        fp_conf_dist[p.get('confidence')] += 1
    for pi in extra[:15]:
        p = pred[pi]
        print(f"    {fmt_ts(p.get('timestamp_seconds'))}  on_target={p.get('on_target')}  action={p.get('gk_action')}  visible={p.get('gk_visible')}  conf={p.get('confidence')}")

    print(f"\n  FP gk_action distribution: {dict(fp_action_dist)}")
    print(f"  FP on_target distribution: {dict(fp_target_dist)}")
    print(f"  FP gk_visible distribution: {dict(fp_visible_dist)}")
    print(f"  FP confidence distribution: {dict(fp_conf_dist)}")
    return {"matches": matches, "missed": missed, "extra": extra}


def analyze_distribution(truth, pred, tolerance):
    matches, missed, extra = greedy_match(truth, pred, tolerance)
    print(f"\n═══ DISTRIBUTION ═══   truth={len(truth)}  pred={len(pred)}  matched={len(matches)}  fn={len(missed)}  fp={len(extra)}")
    print(f"\n  True positives (n={len(matches)}):")
    for ti, pi, delta in matches[:10]:
        p = pred[pi]
        print(f"    {fmt_ts(p.get('timestamp_seconds'))}  type={p.get('type')}  trigger={p.get('trigger')}  press={p.get('press_state')}  dir={p.get('direction')}  conf={p.get('confidence')}")

    fp_type_dist = Counter()
    fp_trigger_dist = Counter()
    fp_press_dist = Counter()
    fp_dir_dist = Counter()
    fp_conf_dist = Counter()
    for pi in extra:
        p = pred[pi]
        fp_type_dist[str(p.get('type') or '').lower()] += 1
        fp_trigger_dist[str(p.get('trigger') or '').lower()] += 1
        fp_press_dist[str(p.get('press_state') or '').lower()] += 1
        fp_dir_dist[str(p.get('direction') or '').lower()] += 1
        fp_conf_dist[p.get('confidence')] += 1
    print(f"\n  False positives (n={len(extra)}, showing first 15):")
    for pi in extra[:15]:
        p = pred[pi]
        print(f"    {fmt_ts(p.get('timestamp_seconds'))}  type={p.get('type')}  trigger={p.get('trigger')}  press={p.get('press_state')}  dir={p.get('direction')}  conf={p.get('confidence')}")

    # Density analysis: cluster of FPs in short windows = repeat-detection
    fp_ts = sorted([pred[pi].get('timestamp_seconds') for pi in extra if isinstance(pred[pi].get('timestamp_seconds'), (int, float))])
    dense_clusters = 0
    if len(fp_ts) > 1:
        for i in range(1, len(fp_ts)):
            if fp_ts[i] - fp_ts[i-1] < 5:  # < 5s apart
                dense_clusters += 1

    print(f"\n  FP type distribution:    {dict(fp_type_dist)}")
    print(f"  FP trigger distribution: {dict(fp_trigger_dist)}")
    print(f"  FP press distribution:   {dict(fp_press_dist)}")
    print(f"  FP direction distribution: {dict(fp_dir_dist)}")
    print(f"  FP confidence distribution: {dict(fp_conf_dist)}")
    print(f"  FP density: {dense_clusters} pairs of FPs within <5s of each other "
          f"(out of {len(fp_ts)-1 if len(fp_ts) > 1 else 0} consecutive)")
    return {"matches": matches, "missed": missed, "extra": extra}


def main():
    args = parse_args()
    truth = load_truth(args.truth)
    if args.output:
        out = load_output_from_file(args.output)
        print(f"Loaded bench output from {args.output}")
    else:
        out = load_output_from_supabase(args.job)
        print(f"Loaded gemini_output from Supabase job {args.job}")
    print(f"Truth: {args.truth}  tolerance: ±{args.tolerance}s")

    results = {}
    sections = ["goals", "saves", "distribution"] if args.section == "all" else [args.section]
    for s in sections:
        t = extract_truth_events(truth, s)
        p = extract_predicted_events(out, s)
        if s == "goals":
            results[s] = analyze_goals(t, p, args.tolerance)
        elif s == "saves":
            results[s] = analyze_saves(t, p, args.tolerance)
        elif s == "distribution":
            results[s] = analyze_distribution(t, p, args.tolerance)

    if args.out:
        # Structured dump for downstream rule design
        dump = {}
        for s in sections:
            t = extract_truth_events(truth, s)
            p = extract_predicted_events(out, s)
            r = results[s]
            dump[s] = {
                "truth_count": len(t),
                "pred_count": len(p),
                "tps": [{"pred": p[pi], "truth": t[ti], "delta_sec": d} for ti, pi, d in r["matches"]],
                "fps": [p[pi] for pi in r["extra"]],
                "fns": [t[ti] for ti in r["missed"]],
            }
        Path(args.out).write_text(json.dumps(dump, indent=2), encoding="utf-8")
        print(f"\nStructured dump written to {args.out}")


if __name__ == "__main__":
    sys.exit(main())
