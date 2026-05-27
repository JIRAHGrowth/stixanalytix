"""
Measure per-confidence-band precision against the bench results.

The model emits `confidence: high/medium/low` on every event. Nobody has
measured whether those labels actually correlate with true-positive rate.
This script answers that empirically — across the v3 bench corpus, for
each section (goals / saves / distribution), bucket the model's events
by confidence label and compute precision per bucket.

If the bands are informative (high > medium > low precision), confidence
becomes a usable filter at no incremental modelling cost. If they're flat
(precision uncorrelated with confidence), we drop the field from the
schema rather than leave a misleading signal in the output.

Usage:
    python scripts/measure-confidence-bands.py \\
      --bench-glob 'scripts/bench-results/*/gemini-2.5-flash.v3-prompts.reconciled.json' \\
      --truth-dir scripts/ground-truth \\
      --tolerance 10 \\
      --out scripts/bench-results/scorecards/confidence-bands-2026-05-27.md

Matching algorithm mirrors scripts/eval-match.js exactly: greedy by smallest
timestamp delta, within tolerance, no pred or truth event matched twice.
"""
from __future__ import annotations
import argparse
import glob
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--bench-glob",
                   default="scripts/bench-results/*/gemini-2.5-flash.v3-prompts.reconciled.json")
    p.add_argument("--truth-dir", default="scripts/ground-truth")
    p.add_argument("--tolerance", type=int, default=10)
    p.add_argument("--out", default=None,
                   help="Write report to this markdown file. Default: stdout only.")
    return p.parse_args()


def normalize_confidence(raw) -> str:
    """Confidence is emitted as 'high'/'medium'/'low' but sometimes as
    'High'/'unclear'/missing. Normalize to a small enum."""
    if raw is None:
        return "_missing"
    s = str(raw).strip().lower()
    if s in ("high", "medium", "low"):
        return s
    if s == "":
        return "_missing"
    return "_other"


def extract_events(payload: dict, section: str) -> list[dict]:
    """The bench JSON shape varies — reconciled outputs wrap everything in
    {gemini_output: {...}}, raw outputs put sections at the top level. Each
    section's events live under <section>.parsed.<section_listkey>[]."""
    # Unwrap gemini_output wrapper if present (reconciled variant shape)
    root = payload.get("gemini_output", payload)
    section_block = root.get(section, {}) or {}
    parsed = section_block.get("parsed") or {}
    list_key = section  # goals/saves/distribution
    # Some legacy outputs put goals at the top level
    if section == "goals" and not parsed:
        parsed = root.get("parsed") or {}
    return list(parsed.get(list_key, []) or [])


def extract_truth_events(truth: dict, section: str) -> list[dict]:
    events = (truth.get("events") or {})
    if section == "goals":
        return list(events.get("goals", []) or [])
    if section == "saves":
        return list(events.get("saves", []) or [])
    if section == "distribution":
        return list(events.get("distribution", []) or [])
    return []


def match_by_timestamp(truth_list: list[dict], pred_list: list[dict],
                       tolerance: int) -> tuple[set[int], set[int]]:
    """Greedy match by smallest delta. Mirrors scripts/eval-match.js.
    Returns (matched_pred_indices, matched_truth_indices)."""
    pairs = []
    for ti, tr in enumerate(truth_list):
        for pi, pr in enumerate(pred_list):
            t_ts = tr.get("timestamp_seconds")
            p_ts = pr.get("timestamp_seconds")
            if t_ts is None or p_ts is None:
                continue
            delta = abs(t_ts - p_ts)
            if delta <= tolerance:
                pairs.append((delta, ti, pi))
    pairs.sort()
    used_truth, used_pred = set(), set()
    for delta, ti, pi in pairs:
        if ti in used_truth or pi in used_pred:
            continue
        used_truth.add(ti)
        used_pred.add(pi)
    return used_pred, used_truth


def truth_path_for(bench_path: Path, truth_dir: Path) -> Path | None:
    """Map bench-results/<match>/<model>.json to ground-truth/<match>.json."""
    match_key = bench_path.parent.name
    candidate = truth_dir / f"{match_key}.json"
    return candidate if candidate.exists() else None


def aggregate_match(bench_path: Path, truth_path: Path, tolerance: int) -> dict:
    """For each section, return: {confidence_band: {tp, fp}} for predictions.
    Plus overall pred/truth/matched counts."""
    bench = json.loads(bench_path.read_text(encoding="utf-8"))
    truth = json.loads(truth_path.read_text(encoding="utf-8"))
    out = {}
    for section in ("goals", "saves", "distribution"):
        preds = extract_events(bench, section)
        truths = extract_truth_events(truth, section)
        matched_pred, _ = match_by_timestamp(truths, preds, tolerance)

        bands = defaultdict(lambda: {"tp": 0, "fp": 0})
        for pi, pr in enumerate(preds):
            band = normalize_confidence(pr.get("confidence"))
            if pi in matched_pred:
                bands[band]["tp"] += 1
            else:
                bands[band]["fp"] += 1
        out[section] = {
            "bands": dict(bands),
            "total_pred": len(preds),
            "total_truth": len(truths),
            "matched": len(matched_pred),
        }
    return out


def main() -> int:
    args = parse_args()
    truth_dir = (ROOT / args.truth_dir).resolve()
    paths = sorted(Path(p).resolve() for p in glob.glob(str(ROOT / args.bench_glob)))
    if not paths:
        print(f"No bench files matching {args.bench_glob}", file=sys.stderr); return 1

    # Aggregate per-section bands across all matches
    rolled = {s: defaultdict(lambda: {"tp": 0, "fp": 0}) for s in
              ("goals", "saves", "distribution")}
    per_match = {}

    for bp in paths:
        tp = truth_path_for(bp, truth_dir)
        if not tp:
            print(f"  no truth for {bp.parent.name}, skipping", file=sys.stderr); continue
        agg = aggregate_match(bp, tp, args.tolerance)
        per_match[bp.parent.name] = agg
        for section, sec in agg.items():
            for band, counts in sec["bands"].items():
                rolled[section][band]["tp"] += counts["tp"]
                rolled[section][band]["fp"] += counts["fp"]

    # Build report
    lines = []
    lines.append(f"# Confidence-band precision — {paths[0].name}")
    lines.append("")
    lines.append(f"Bench files: {len(paths)} · Tolerance: ±{args.tolerance}s")
    lines.append("")
    lines.append("Goal: empirically test whether the model's `confidence` label "
                 "correlates with TP rate. If `high` precision >> `medium` >> "
                 "`low`, confidence becomes a usable filter. If precision is "
                 "flat across bands, the field is misleading and should be "
                 "either dropped or re-defined.")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Roll-up across all matches")
    lines.append("")
    BAND_ORDER = ["high", "medium", "low", "_other", "_missing"]
    for section in ("goals", "saves", "distribution"):
        bands = rolled[section]
        section_total = sum(c["tp"] + c["fp"] for c in bands.values())
        if section_total == 0:
            lines.append(f"### {section}")
            lines.append("")
            lines.append("(no predictions)")
            lines.append("")
            continue
        lines.append(f"### {section}")
        lines.append("")
        lines.append("| Confidence | Events | TP | FP | Precision | % of total |")
        lines.append("|---|---|---|---|---|---|")
        for band in BAND_ORDER:
            counts = bands.get(band) or {"tp": 0, "fp": 0}
            n = counts["tp"] + counts["fp"]
            if n == 0:
                continue
            p = counts["tp"] / n if n else 0
            share = n / section_total if section_total else 0
            lines.append(f"| `{band}` | {n} | {counts['tp']} | {counts['fp']} | "
                         f"{p*100:.1f}% | {share*100:.1f}% |")
        lines.append("")

    # Per-match breakdown for transparency
    lines.append("---")
    lines.append("")
    lines.append("## Per-match")
    lines.append("")
    lines.append("| Match | Section | Band | TP | FP | Precision |")
    lines.append("|---|---|---|---|---|---|")
    for match_key in sorted(per_match.keys()):
        for section in ("goals", "saves", "distribution"):
            sec = per_match[match_key][section]
            for band in BAND_ORDER:
                counts = sec["bands"].get(band)
                if not counts:
                    continue
                n = counts["tp"] + counts["fp"]
                p = counts["tp"] / n if n else 0
                lines.append(f"| {match_key} | {section} | `{band}` | "
                             f"{counts['tp']} | {counts['fp']} | {p*100:.1f}% |")
    lines.append("")

    # Verdict heuristic
    lines.append("---")
    lines.append("")
    lines.append("## Verdict")
    lines.append("")
    verdict_notes = []
    for section in ("goals", "saves", "distribution"):
        bands = rolled[section]
        p_band = {}
        for band in ("high", "medium", "low"):
            counts = bands.get(band)
            if not counts: continue
            n = counts["tp"] + counts["fp"]
            if n == 0: continue
            p_band[band] = counts["tp"] / n
        if "high" not in p_band:
            verdict_notes.append(f"- **{section}**: no `high`-confidence events emitted. No verdict possible.")
            continue
        h_p = p_band["high"]
        m_p = p_band.get("medium")
        l_p = p_band.get("low")
        # How many bands actually got populated? If only `high`, the field
        # is degenerate — the model isn't using the band semantics at all.
        present_bands = sum(1 for v in [h_p, m_p, l_p] if v is not None)
        if present_bands == 1:
            verdict_notes.append(
                f"- **{section}**: **DEGENERATE — 100% of events labeled `high`.** "
                f"Precision at `high` is {h_p*100:.1f}%. The model is not using "
                f"`medium`/`low` at all; the field is structurally meaningless. "
                f"Implications: (1) drop `confidence` from the schema OR redefine its "
                f"semantics, (2) Rule A (drops low-conf dist) is a no-op in current state, "
                f"(3) self-awareness of uncertainty is a known training gap that SFT can address."
            )
            continue
        # Multi-band case: monotonic + meaningful spread = informative
        order_ok = True
        if m_p is not None and h_p < m_p - 0.05: order_ok = False
        if l_p is not None and m_p is not None and m_p < l_p - 0.05: order_ok = False
        worst = min(v for v in [h_p, m_p, l_p] if v is not None)
        spread_ok = (h_p - worst) >= 0.10
        band_str = (f"`high`={h_p*100:.0f}%" +
                    (f", `medium`={m_p*100:.0f}%" if m_p is not None else "") +
                    (f", `low`={l_p*100:.0f}%" if l_p is not None else ""))
        if order_ok and spread_ok:
            verdict_notes.append(f"- **{section}**: confidence IS a useful filter ({band_str}). "
                                 f"Consider promoting it to a reconciliation drop rule.")
        else:
            verdict_notes.append(f"- **{section}**: confidence is NOT informative ({band_str}). "
                                 f"Bands present but precision doesn't correlate with band label.")
    lines.extend(verdict_notes)
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
