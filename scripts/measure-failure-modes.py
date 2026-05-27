"""
Failure-mode taxonomy with empirical frequencies.

Reads from two sources and produces a typed catalog of known failure modes
with counts per mode:

  1. coach_corrections table — what corrections did the coach actually log?
  2. v3 bench results — per-event FP analysis to detect uncorrected modes

Outputs a markdown report at scripts/bench-results/scorecards/failure-modes-<date>.md
suitable for sharing with a partner (Nicolas) and for tracking what each
SFT iteration is supposed to address.

Each mode carries:
  - name + definition
  - empirical frequency (coach corrections + bench FPs)
  - detection rule (how we identify the mode in data)
  - status (what we've shipped to address it; what's still open)

Usage:
    python scripts/measure-failure-modes.py --out scripts/bench-results/scorecards/failure-modes-2026-05-27.md
"""
from __future__ import annotations
import argparse
import glob
import json
import os
import sys
from collections import Counter, defaultdict
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
            import requests
            r = requests.get(f"{self.base}/{table}", params=params,
                             headers=self.headers, timeout=30)
            r.raise_for_status()
            return r.json()
    return C()


def fetch_all_corrections(sb) -> list[dict]:
    """The table maxes out at a few hundred rows currently — no pagination needed."""
    return sb.get("coach_corrections", {"select": "*", "limit": "5000"})


# ─── The taxonomy ─────────────────────────────────────────────────────────

TAXONOMY = [
    {
        "id": "team_color_flip",
        "name": "Team-color attribution flip",
        "definition": "Model correctly identifies a goal event but assigns the wrong scoring/conceding team. The shooter's jersey colour is mis-read.",
        "primary_detection": "coach_corrections rows with correction_type='wrong_team'.",
        "status_shipped": "v3 prompt: per-chunk kit-anchor preamble + mandatory `evidence_shooter_color` field + team-bias self-audit. Reconciliation Rule D requires 2-of-3 affirmative evidence.",
        "status_open": "Fluent narrative on the shooter's jersey passes the schema check even when invented. Genuine fix is SFT corpus of color-corrected examples — every wrong_team row in coach_corrections is gold training data.",
    },
    {
        "id": "goal_hallucination",
        "name": "Goal hallucination from celebration / replay / non-event",
        "definition": "Model emits a goal event that didn't happen. Most common on no-scoreboard youth video where the model uses celebration-like activity as ground truth.",
        "primary_detection": "coach_corrections with correction_type='false_positive' on goals, AND bench-time goal FPs.",
        "status_shipped": "v3 prompt: 'CALIBRATION — plausible counts' section; two-of-three evidence rule (Rule D); known-model-bias warning.",
        "status_open": "On chunked Flash, the model still confabulates fluent evidence text for invented events. SFT is required.",
    },
    {
        "id": "save_hallucination",
        "name": "Save hallucination (no opposition shot)",
        "definition": "Model emits a save event for a non-shot — backpass collection, loose-ball pickup, GK touch with no preceding attack.",
        "primary_detection": "Bench-time save FPs; particularly catastrophic on dominant-win matches (judah-2026-05-23-pfc: 51 of 55 saves were invented).",
        "status_shipped": "v3 prompt: removed the 'err on inclusion' floor; added mandatory `preceding_attack` field; explicit anti-examples (backpass, loose ball, distribution are NOT saves). Reconciliation Rule F drops invented saves.",
        "status_open": "Rule F fired 0 times across the v3 bench — the model writes plausible attack descriptions for hallucinated saves too. Field-presence heuristics don't catch fluent hallucination. SFT is required.",
    },
    {
        "id": "distribution_double_tag",
        "name": "Distribution double/triple-tagging of one possession",
        "definition": "Model emits N distribution events for one GK possession (receive + touch + release counted separately).",
        "primary_detection": "Rule E (dedupe by trigger+direction within 30s) drop counts; ≥10 dropped per match is the signature.",
        "status_shipped": "v3 prompt: ≥5-yard release definition + anti-examples for receive+touch+release. Reconciliation Rule E dedupes within 30s window.",
        "status_open": "Underlying over-tagging is structural; Rule E is band-aid. SFT with corrections-derived examples (one event per release, not per touch) addresses root cause.",
    },
    {
        "id": "opposition_gk_action",
        "name": "Opposition GK action attributed to our GK",
        "definition": "Model emits a distribution event for the OTHER team's GK because it didn't verify kit colour at release.",
        "primary_detection": "Receiver=opponent + direction=backwards + successful=false signature; Rule G.",
        "status_shipped": "v3 prompt: opposition-GK colour-check anti-example. Reconciliation Rule G heuristic.",
        "status_open": "Same as team-color flip — text-only sanity checks can't verify visual attribution.",
    },
    {
        "id": "directional_team_bias",
        "name": "Asymmetric bias toward 'analyzed team conceded'",
        "definition": "When the model commits to scoring_team it has a strong prior toward 'opposition scored' (analyzed team's GK conceded). Measured on the PFC match: 100% of 'conceding_team=my_team_color' predictions were wrong.",
        "primary_detection": "Bench-time TP rate by conceding_team value.",
        "status_shipped": "v3 prompt: known-model-bias warning + team-bias self-audit step in the self-check.",
        "status_open": "Self-audit is a prompt-level mitigation only. SFT on balanced-attribution examples is the structural fix.",
    },
    {
        "id": "confidence_degeneracy",
        "name": "Confidence field is degenerate (100% `high`)",
        "definition": "Model labels every event `confidence: high`, regardless of correctness. Measured empirically 2026-05-27: 543/543 events across the v3 bench were `high`. Precision at `high` is 4-10%.",
        "primary_detection": "scripts/measure-confidence-bands.py — bucket events by confidence label, measure per-bucket precision.",
        "status_shipped": "Measurement script + report; field is documented as misleading.",
        "status_open": "Either drop `confidence` from the schema or redefine its semantics. Self-awareness of uncertainty is a training gap that SFT can address.",
    },
    {
        "id": "match_shape_over_detection",
        "name": "Match-shape-induced over-detection",
        "definition": "On lopsided matches where the dominant team's GK is barely tested, the model invents events to satisfy 'normal match' expectations.",
        "primary_detection": "Per-match FP rate correlated with score margin.",
        "status_shipped": "v3 saves prompt explicitly addresses one-sided matches (0-3 shots is plausible for a dominant GK).",
        "status_open": "Prompt instruction fights the training prior. SFT on lopsided-match examples (PFC 15-0 with 4 real saves) is the structural fix.",
    },
]


def main() -> int:
    args = parse_args()
    sb = sb_client()

    # ─── Pull corrections ───
    corrections = fetch_all_corrections(sb)
    by_type = Counter(c["correction_type"] for c in corrections if c.get("correction_type"))
    by_video = defaultdict(lambda: Counter())
    for c in corrections:
        if c.get("video_job_id") and c.get("correction_type"):
            by_video[c["video_job_id"]][c["correction_type"]] += 1

    # ─── Bench FP counts per section ───
    bench_paths = sorted(Path(p).resolve()
                         for p in glob.glob(str(ROOT / args.bench_glob)))
    bench_fp = {"goals": 0, "saves": 0, "distribution": 0}
    bench_tp = {"goals": 0, "saves": 0, "distribution": 0}

    # Reuse the matching logic from measure-confidence-bands by inlining the
    # tiny essential bit. (Keeping the script self-contained.)
    def match_pairs(truth_list, pred_list, tol):
        pairs = []
        for ti, tr in enumerate(truth_list):
            for pi, pr in enumerate(pred_list):
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

    def extract(payload, section):
        root = payload.get("gemini_output", payload)
        sb = root.get(section, {}) or {}
        return list((sb.get("parsed") or {}).get(section, []) or [])

    for bp in bench_paths:
        truth_path = (ROOT / args.truth_dir / f"{bp.parent.name}.json")
        if not truth_path.exists(): continue
        bench = json.loads(bp.read_text(encoding="utf-8"))
        truth = json.loads(truth_path.read_text(encoding="utf-8"))
        for section in ("goals", "saves", "distribution"):
            preds = extract(bench, section)
            truths = (truth.get("events") or {}).get(section, []) or []
            _, used_p = match_pairs(truths, preds, args.tolerance)
            bench_tp[section] += len(used_p)
            bench_fp[section] += len(preds) - len(used_p)

    # ─── Render report ───
    lines = []
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    lines.append(f"# StixAnalytix failure-mode taxonomy — {timestamp}")
    lines.append("")
    lines.append(f"Empirical counts as of this build. Refresh by re-running "
                 f"`python scripts/measure-failure-modes.py`.")
    lines.append("")
    lines.append("Sources:")
    lines.append(f"- coach_corrections: **{len(corrections)} rows** across "
                 f"{len(by_video)} reviewed video_jobs.")
    lines.append(f"- v3 bench: **{len(bench_paths)} matches** at tolerance "
                 f"±{args.tolerance}s.")
    lines.append("")

    # Correction-type breakdown
    lines.append("## Coach corrections by type")
    lines.append("")
    lines.append("| Type | Count | % of total |")
    lines.append("|---|---|---|")
    total_corr = sum(by_type.values())
    for t, n in by_type.most_common():
        share = n / total_corr * 100 if total_corr else 0
        lines.append(f"| `{t}` | {n} | {share:.1f}% |")
    lines.append("")

    # Bench FP breakdown
    lines.append("## v3 bench false-positive counts")
    lines.append("")
    lines.append("| Section | TP | FP | Precision |")
    lines.append("|---|---|---|---|")
    for section in ("goals", "saves", "distribution"):
        tp, fp = bench_tp[section], bench_fp[section]
        total = tp + fp
        p = (tp / total * 100) if total else 0
        lines.append(f"| {section} | {tp} | {fp} | {p:.1f}% |")
    lines.append("")

    # The taxonomy itself
    lines.append("---")
    lines.append("")
    lines.append("## The taxonomy")
    lines.append("")
    for mode in TAXONOMY:
        lines.append(f"### {mode['name']} (`{mode['id']}`)")
        lines.append("")
        lines.append(f"**Definition.** {mode['definition']}")
        lines.append("")
        lines.append(f"**Detection.** {mode['primary_detection']}")
        lines.append("")
        # Empirical evidence per mode (heuristic — link by id)
        ev = []
        if mode["id"] == "team_color_flip":
            ev.append(f"- wrong_team corrections in DB: **{by_type.get('wrong_team', 0)}**")
        if mode["id"] == "goal_hallucination":
            ev.append(f"- false_positive corrections in DB: **{by_type.get('false_positive', 0)}**")
            ev.append(f"- bench goal FPs: **{bench_fp['goals']}**")
        if mode["id"] == "save_hallucination":
            ev.append(f"- bench save FPs: **{bench_fp['saves']}**")
        if mode["id"] == "distribution_double_tag":
            ev.append(f"- bench distribution FPs (post Rule E): **{bench_fp['distribution']}**")
        if mode["id"] == "confidence_degeneracy":
            ev.append(f"- See [confidence-bands report](confidence-bands-2026-05-27.md).")
        if ev:
            lines.append("**Empirical evidence:**")
            lines.extend(ev)
            lines.append("")
        lines.append(f"**Status — shipped.** {mode['status_shipped']}")
        lines.append("")
        lines.append(f"**Status — open.** {mode['status_open']}")
        lines.append("")

    # Closing — what this means strategically
    lines.append("---")
    lines.append("")
    lines.append("## Strategic read")
    lines.append("")
    lines.append("Six of the eight failure modes share the same root cause: "
                 "base Gemini's narrative fluency lets it fabricate plausible "
                 "evidence (color descriptions, attack sequences, GK observations) "
                 "for invented events. Field-presence heuristics cannot detect this. "
                 "Schema enforcement forces the field to be filled; it cannot force "
                 "the contents to correspond to reality.")
    lines.append("")
    lines.append("This is why fine-tuning is the load-bearing fix — not a complement "
                 "to prompt engineering, but the actual mechanism. The prompts ship "
                 "the failure mode from 'extreme over-detection' (e.g., 14 phantom "
                 "goals on a 15-0 match) to 'narrative-fluent over-detection' "
                 "(model writes detailed but invented descriptions). The latter is "
                 "less catastrophic but still wrong; it cannot be fixed without "
                 "teaching the model from examples.")
    lines.append("")
    lines.append("The SFT corpus is the asset. Every coach_correction row tagged "
                 "in our app is a training example. The taxonomy above gives us "
                 "the failure modes to weight in that corpus.")
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
