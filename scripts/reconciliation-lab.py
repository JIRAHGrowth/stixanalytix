"""
Reconciliation rule lab — iterate new rules against cached bench output
at zero API cost. Compare candidate rules to the production
`_reconcile_events` and score both via the existing eval-match.js
harness.

Usage:
    # Default: run all built-in candidate rules on the canary
    python scripts/reconciliation-lab.py --job f5ad42c7-... --truth scripts/ground-truth/judah-2026-04-25.json

    # Or test against a local bench output file
    python scripts/reconciliation-lab.py --output scripts/bench-results/.../foo.json --truth ...

Outputs a side-by-side table:
    rule_set | goals(R/P) | saves(R/P) | dist(R/P) | total_dropped

Each candidate rule is composable - we measure individual rules AND
combinations - so we ship the smallest rule set that achieves the
target FP reduction without recall loss.
"""
from __future__ import annotations
import argparse
import copy
import json
import os
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "worker"))

# Use the production helpers; rules must stay compatible
from app import (
    _reconcile_events as _prod_reconcile,
    _filter_low_signal_saves,
)


# ============================================================================
# Greedy matcher (mirrors eval-match.js)
# ============================================================================

def greedy_match(truth_events, pred_events, tolerance=10):
    pairs = []
    for ti, tr in enumerate(truth_events):
        for pi, pr in enumerate(pred_events):
            t = tr.get("timestamp_seconds")
            p = pr.get("timestamp_seconds")
            if not isinstance(t, (int, float)) or not isinstance(p, (int, float)):
                continue
            d = abs(t - p)
            if d <= tolerance:
                pairs.append((d, ti, pi))
    pairs.sort()
    used_t, used_p, matches = set(), set(), []
    for d, ti, pi in pairs:
        if ti in used_t or pi in used_p:
            continue
        matches.append((ti, pi, d))
        used_t.add(ti); used_p.add(pi)
    return len(matches), len(pred_events) - len(matches), len(truth_events) - len(matches)


def pr_from_counts(tp, fp, fn):
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    return precision, recall


# ============================================================================
# Candidate rules
# Each rule is (name, fn) where fn(goals, saves, dist) -> (goals, saves, dist)
# Rules are pure functions; chain them by composition.
# ============================================================================

def rule_baseline(goals, saves, dist):
    """No-op. Captures the model's raw post-_filter_low_signal_saves output."""
    return goals, saves, dist


def rule_prod_reconcile(goals, saves, dist):
    """Existing production reconciliation rules."""
    return _prod_reconcile(goals, saves, dist)


# ---- Goal rules ----

def rule_g_require_shot_type(goals, saves, dist):
    """Drop goals where shot_type is missing / unclear. A real goal HAS a
    shot type the model could identify (rebound, header, foot, etc.)."""
    NEG = {"", "unclear", "unknown", "n/a", "not_visible", "not_observed"}
    kept = [g for g in goals if str(g.get("shot_type") or "").strip().lower() not in NEG]
    return kept, saves, dist


def rule_g_require_celebration_AND_kickoff(goals, saves, dist):
    """Tighten the existing >=2 rule: require BOTH evidence_celebration
    AND evidence_kickoff_after to be affirmative. Drops the case where
    one of them was inferred from scoreboard alone."""
    NEG_TOKENS = {"", "not_observed", "no_observation", "none", "null", "n/a",
                  "no_kickoff_observed", "no_celebration_observed"}
    def aff(v):
        s = str(v or "").strip().lower()
        return bool(s) and s not in NEG_TOKENS
    kept = [g for g in goals if aff(g.get("evidence_celebration")) and aff(g.get("evidence_kickoff_after"))]
    return kept, saves, dist


def rule_g_team_color_match(goals, saves, dist):
    """Goals where scoring_team is the opponent color BUT match_metadata had
    no team colors specified (so the model guessed) and scoreboard isn't visible
    are very low-signal. Drop those.

    For canary: meta.opponent_color=null, so any 'light blue' guess on a
    no-scoreboard match is unverifiable. Drop unless there's external evidence.
    """
    # This needs match_metadata in scope — defer the full implementation;
    # the simpler version is rule_g_require_shot_type which has similar effect.
    return goals, saves, dist


# ---- Save rules ----

def rule_s_require_real_shot(goals, saves, dist):
    """A save requires a SHOT, not just a GK ball-contact. Two checks:
    1. shot_type must be a real shot type ({Foot, Header, Deflection}), not missing
    2. on_target must be 'yes' (already implicit but be explicit)
    """
    REAL_SHOT_TYPES = {"foot", "header", "deflection"}
    kept = []
    for s in saves:
        st = str(s.get("shot_type") or "").strip().lower()
        ot = str(s.get("on_target") or "").strip().lower()
        if st in REAL_SHOT_TYPES and ot == "yes":
            kept.append(s)
    return goals, kept, dist


def rule_s_drop_catch_only(goals, saves, dist):
    """Catches with shot_origin in {6yard, boxC} (close-range) AND
    no goal_placement_height/side are very likely routine ball receipts,
    not saves. Drop them. Preserves Block/Parry/Punch as those imply
    actual shot deflection."""
    kept = []
    for s in saves:
        action = str(s.get("gk_action") or "").strip().lower()
        if action != "catch":
            kept.append(s)
            continue
        origin = str(s.get("shot_origin") or "").strip().lower()
        h = str(s.get("goal_placement_height") or "").strip().lower()
        sd = str(s.get("goal_placement_side") or "").strip().lower()
        # Catch with no placement info AND close-range origin = routine
        if origin in {"6yard", "boxc"} and h in {"", "unclear", "not_visible"} and sd in {"", "unclear", "not_visible"}:
            continue  # drop
        kept.append(s)
    return goals, kept, dist


# ---- Distribution rules ----

def rule_d_density_throttle(goals, saves, dist):
    """Cap distribution events to 1 per 60-second window. Real matches have
    0.3-1 dist event/min peak (per ground truth). Sort by confidence desc,
    keep the highest-confidence in each minute window.

    This is the BIG FP killer for distribution. Truth has 16 in 52min (0.31/min);
    bench produced 119 (2.3/min). The cap drops the bulk of repeats."""
    CONF_RANK = {"high": 3, "medium": 2, "low": 1}
    # Sort by (timestamp, -confidence)
    keyed = sorted(
        (d for d in dist if isinstance(d.get("timestamp_seconds"), (int, float))),
        key=lambda d: (d["timestamp_seconds"], -CONF_RANK.get(str(d.get("confidence") or "").lower(), 0)),
    )
    kept = []
    last_ts = -10_000
    for d in keyed:
        if d["timestamp_seconds"] - last_ts >= 60:
            kept.append(d)
            last_ts = d["timestamp_seconds"]
    # Append no-ts events unchanged
    kept.extend([d for d in dist if not isinstance(d.get("timestamp_seconds"), (int, float))])
    return goals, saves, kept


def rule_d_require_pass_selection(goals, saves, dist):
    """Meaningful distributions have a clear pass_selection. 'unclear' or
    missing pass_selection = the model couldn't tell what kind of
    distribution it was, which means it probably wasn't a meaningful one."""
    NEG = {"", "unclear", "unknown", "n/a", "not_observed", "null"}
    kept = [d for d in dist if str(d.get("pass_selection") or "").strip().lower() not in NEG]
    return goals, saves, kept


def rule_d_drop_unpressed_loose_ball(goals, saves, dist):
    """Loose_ball + unpressed = routine ball recovery, not a strategic
    distribution event. These are the bulk of the FPs (46/114 in canary)."""
    kept = []
    for d in dist:
        trigger = str(d.get("trigger") or "").strip().lower()
        press = str(d.get("press_state") or "").strip().lower()
        if trigger == "loose_ball" and press == "unpressed":
            continue
        kept.append(d)
    return goals, saves, kept


def rule_s_density_throttle(goals, saves, dist):
    """Saves are rare events. Truth on canary: 11 saves in 52 min = 0.21/min.
    Cap at 1 per 60-second window. The first 5 min of the bench had 11 FP
    "saves" — pure over-detection that this cleans up. Keep highest-confidence
    per window; ties broken by gk_action != 'catch' (real-shot actions
    preferred over passive catches)."""
    ACTION_RANK = {"block": 5, "parry": 5, "punch": 5, "deflect": 5, "smother": 4, "k-barrier": 4,
                   "catch": 2, "save": 3}
    CONF_RANK = {"high": 3, "medium": 2, "low": 1}
    keyed = sorted(
        (s for s in saves if isinstance(s.get("timestamp_seconds"), (int, float))),
        key=lambda s: (s["timestamp_seconds"],
                       -CONF_RANK.get(str(s.get("confidence") or "").lower(), 0),
                       -ACTION_RANK.get(str(s.get("gk_action") or "").lower(), 0)),
    )
    kept = []
    last_ts = -10_000
    for s in keyed:
        if s["timestamp_seconds"] - last_ts >= 60:
            kept.append(s)
            last_ts = s["timestamp_seconds"]
    kept.extend([s for s in saves if not isinstance(s.get("timestamp_seconds"), (int, float))])
    return goals, kept, dist


def rule_d_dedupe_trigger_direction_30s(goals, saves, dist):
    """If the same (trigger, direction) fires within 30 seconds, treat it
    as one event - the model has called the same play multiple times.
    Keep the highest-confidence one, prefer earliest timestamp."""
    CONF_RANK = {"high": 3, "medium": 2, "low": 1}
    keyed = sorted(
        (d for d in dist if isinstance(d.get("timestamp_seconds"), (int, float))),
        key=lambda d: d["timestamp_seconds"],
    )
    kept = []
    for d in keyed:
        key = (str(d.get("trigger") or "").lower(), str(d.get("direction") or "").lower())
        ts = d["timestamp_seconds"]
        # Find existing event within 30s with same key
        clash = None
        for k in kept:
            if str(k.get("trigger") or "").lower() == key[0] and \
               str(k.get("direction") or "").lower() == key[1] and \
               abs(k["timestamp_seconds"] - ts) <= 30:
                clash = k
                break
        if clash is None:
            kept.append(d)
            continue
        # Conflict: keep the higher-confidence one
        if CONF_RANK.get(str(d.get("confidence") or "").lower(), 0) > \
           CONF_RANK.get(str(clash.get("confidence") or "").lower(), 0):
            kept.remove(clash)
            kept.append(d)
        # else: drop d (keep existing)
    kept.extend([d for d in dist if not isinstance(d.get("timestamp_seconds"), (int, float))])
    return goals, saves, kept


def rule_d_dedupe_trigger_direction_60s(goals, saves, dist):
    """Wider window than 30s — for backpass/loose_ball clusters where the
    model annotates every touch separately within a single GK possession."""
    CONF_RANK = {"high": 3, "medium": 2, "low": 1}
    keyed = sorted(
        (d for d in dist if isinstance(d.get("timestamp_seconds"), (int, float))),
        key=lambda d: d["timestamp_seconds"],
    )
    kept = []
    for d in keyed:
        key = (str(d.get("trigger") or "").lower(), str(d.get("direction") or "").lower())
        ts = d["timestamp_seconds"]
        clash = None
        for k in kept:
            if str(k.get("trigger") or "").lower() == key[0] and \
               str(k.get("direction") or "").lower() == key[1] and \
               abs(k["timestamp_seconds"] - ts) <= 60:
                clash = k
                break
        if clash is None:
            kept.append(d)
            continue
        if CONF_RANK.get(str(d.get("confidence") or "").lower(), 0) > \
           CONF_RANK.get(str(clash.get("confidence") or "").lower(), 0):
            kept.remove(clash)
            kept.append(d)
    kept.extend([d for d in dist if not isinstance(d.get("timestamp_seconds"), (int, float))])
    return goals, saves, kept


def rule_d_dedupe_trigger_only_30s(goals, saves, dist):
    """Dedupe by trigger alone (ignore direction) within 30s. Catches the
    'model called same loose-ball play three times' pattern. More aggressive
    than the trigger+direction variant — drops cases where the model varies
    direction labels for the same actual event."""
    CONF_RANK = {"high": 3, "medium": 2, "low": 1}
    keyed = sorted(
        (d for d in dist if isinstance(d.get("timestamp_seconds"), (int, float))),
        key=lambda d: d["timestamp_seconds"],
    )
    kept = []
    for d in keyed:
        trig = str(d.get("trigger") or "").lower()
        ts = d["timestamp_seconds"]
        clash = None
        for k in kept:
            if str(k.get("trigger") or "").lower() == trig and abs(k["timestamp_seconds"] - ts) <= 30:
                clash = k
                break
        if clash is None:
            kept.append(d)
            continue
        if CONF_RANK.get(str(d.get("confidence") or "").lower(), 0) > \
           CONF_RANK.get(str(clash.get("confidence") or "").lower(), 0):
            kept.remove(clash)
            kept.append(d)
    kept.extend([d for d in dist if not isinstance(d.get("timestamp_seconds"), (int, float))])
    return goals, saves, kept


def rule_d_density_throttle_120s(goals, saves, dist):
    """Looser than the 60s version: cap at 1 per 120-second window.
    Truth has bursts of 4 events in 5 minutes — too aggressive a cap loses
    real events. 120s allows ~2.5 per 5-min window."""
    CONF_RANK = {"high": 3, "medium": 2, "low": 1}
    keyed = sorted(
        (d for d in dist if isinstance(d.get("timestamp_seconds"), (int, float))),
        key=lambda d: (d["timestamp_seconds"],
                       -CONF_RANK.get(str(d.get("confidence") or "").lower(), 0)),
    )
    kept = []
    last_ts = -10_000
    for d in keyed:
        if d["timestamp_seconds"] - last_ts >= 120:
            kept.append(d)
            last_ts = d["timestamp_seconds"]
    kept.extend([d for d in dist if not isinstance(d.get("timestamp_seconds"), (int, float))])
    return goals, saves, kept


# ============================================================================
# Rule chain definitions — each candidate is an ordered list of rules
# ============================================================================

def compose(*rules):
    def chained(goals, saves, dist):
        for r in rules:
            goals, saves, dist = r(goals, saves, dist)
        return goals, saves, dist
    return chained


CANDIDATES = [
    ("baseline (no rules)", rule_baseline),
    ("PROD (current _reconcile_events)", rule_prod_reconcile),

    # Save rules
    ("PROD + S:density_throttle_60s", compose(rule_prod_reconcile, rule_s_density_throttle)),

    # Distribution rules — single
    ("PROD + D:density_throttle_60s", compose(rule_prod_reconcile, rule_d_density_throttle)),
    ("PROD + D:density_throttle_120s", compose(rule_prod_reconcile, rule_d_density_throttle_120s)),
    ("PROD + D:dedupe_trigger_dir_30s", compose(rule_prod_reconcile, rule_d_dedupe_trigger_direction_30s)),
    ("PROD + D:drop_unpressed_loose_ball", compose(rule_prod_reconcile, rule_d_drop_unpressed_loose_ball)),

    # Distribution combos (target: cut FPs without recall loss)
    ("PROD + D:dedupe_30 + drop_unpressed_loose_ball", compose(
        rule_prod_reconcile, rule_d_dedupe_trigger_direction_30s, rule_d_drop_unpressed_loose_ball,
    )),
    ("PROD + D:dedupe_60 + drop_unpressed_loose_ball", compose(
        rule_prod_reconcile, rule_d_dedupe_trigger_direction_60s, rule_d_drop_unpressed_loose_ball,
    )),
    ("PROD + D:dedupe_trigger_only_30s", compose(
        rule_prod_reconcile, rule_d_dedupe_trigger_only_30s,
    )),

    # SHIP candidates (preserves recall, max FP cut)
    ("SHIP A: PROD + D:dedupe_30 (clean win)", compose(
        rule_prod_reconcile, rule_d_dedupe_trigger_direction_30s,
    )),
    ("SHIP B: PROD + D:dedupe_60 (more aggressive)", compose(
        rule_prod_reconcile, rule_d_dedupe_trigger_direction_60s,
    )),
]


# ============================================================================
# Load + run + score
# ============================================================================

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--truth", required=True)
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--output", help="local bench output JSON")
    src.add_argument("--job", help="video_job_id - fetch from Supabase")
    p.add_argument("--tolerance", type=int, default=10)
    return p.parse_args()


def load_pred(args):
    if args.output:
        d = json.loads(Path(args.output).read_text(encoding="utf-8"))
        return d.get("gemini_output", d)
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env.local")
    import requests
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    r = requests.get(
        f"{url}/rest/v1/video_jobs?id=eq.{args.job}&select=gemini_output",
        headers={"apikey": key, "Authorization": f"Bearer {key}"}, timeout=30,
    )
    r.raise_for_status()
    return r.json()[0]["gemini_output"]


def extract_events(go):
    g = ((go.get("goals") or {}).get("parsed") or {}).get("goals", [])
    if not g:
        g = (go.get("parsed") or {}).get("goals", [])
    s = ((go.get("saves") or {}).get("parsed") or {}).get("saves", [])
    d = ((go.get("distribution") or {}).get("parsed") or {}).get("distribution", [])
    return list(g or []), list(s or []), list(d or [])


def fmt(p, r):
    return f"{p*100:5.1f}%/{r*100:5.1f}%"


def main():
    args = parse_args()
    truth = json.loads(Path(args.truth).read_text(encoding="utf-8"))
    t_goals = truth.get("events", {}).get("goals", []) or []
    t_saves = truth.get("events", {}).get("saves", []) or []
    t_dist = truth.get("events", {}).get("distribution", []) or []

    go = load_pred(args)
    raw_goals, raw_saves, raw_dist = extract_events(go)
    raw_saves = _filter_low_signal_saves(raw_saves)

    print(f"Truth:    goals={len(t_goals)}  saves={len(t_saves)}  dist={len(t_dist)}")
    print(f"Raw pred: goals={len(raw_goals)}  saves={len(raw_saves)}  dist={len(raw_dist)} (post low-signal-saves filter)")
    print(f"Tolerance: ±{args.tolerance}s")
    print()
    print(f"{'rule_set':<54} | {'goals tp/fp/fn':<14} | {'g P/R':<14} | {'saves tp/fp/fn':<14} | {'s P/R':<14} | {'dist tp/fp/fn':<14} | {'d P/R':<14}")
    print("-" * 168)

    baseline_fp = None
    for name, rule_fn in CANDIDATES:
        g, s, d = rule_fn(copy.deepcopy(raw_goals), copy.deepcopy(raw_saves), copy.deepcopy(raw_dist))
        g_tp, g_fp, g_fn = greedy_match(t_goals, g, args.tolerance)
        s_tp, s_fp, s_fn = greedy_match(t_saves, s, args.tolerance)
        d_tp, d_fp, d_fn = greedy_match(t_dist, d, args.tolerance)
        g_p, g_r = pr_from_counts(g_tp, g_fp, g_fn)
        s_p, s_r = pr_from_counts(s_tp, s_fp, s_fn)
        d_p, d_r = pr_from_counts(d_tp, d_fp, d_fn)
        print(f"{name:<54} | {g_tp:>2}/{g_fp:>3}/{g_fn:>3}      | {fmt(g_p, g_r):<14} | {s_tp:>2}/{s_fp:>3}/{s_fn:>3}      | {fmt(s_p, s_r):<14} | {d_tp:>3}/{d_fp:>3}/{d_fn:>3}     | {fmt(d_p, d_r):<14}")


if __name__ == "__main__":
    main()
