"""
Rebuild the .reconciled.json sibling for an existing raw bench output.

Used to recover when a bench job succeeded at the Gemini API call + raw JSON
write but crashed before writing the reconciled variant (e.g. encoding crash
on the success-print line). No API cost - pure post-processing.

Usage:
    python scripts/rebuild-reconciled.py <raw.json> [<raw.json>...]

Idempotent. Overwrites existing .reconciled.json files.
"""
import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "worker"))

try:
    from app import _reconcile_events
except Exception as e:
    print(f"Could not import _reconcile_events from worker/app.py: {e}", file=sys.stderr)
    sys.exit(1)


def rebuild(raw_path: Path) -> None:
    payload = json.loads(raw_path.read_text(encoding="utf-8"))
    gemini_output = payload.get("gemini_output", payload)

    goals = ((gemini_output.get("goals") or {}).get("parsed") or {}).get("goals") or []
    saves = ((gemini_output.get("saves") or {}).get("parsed") or {}).get("saves") or []
    dist  = ((gemini_output.get("distribution") or {}).get("parsed") or {}).get("distribution") or []
    g2, s2, d2 = _reconcile_events(goals, saves, dist)

    rec = copy.deepcopy(gemini_output)
    if rec.get("goals") and rec["goals"].get("parsed") is not None:
        rec["goals"]["parsed"]["goals"] = g2
    if rec.get("saves") and rec["saves"].get("parsed") is not None:
        rec["saves"]["parsed"]["saves"] = s2
    if rec.get("distribution") and rec["distribution"].get("parsed") is not None:
        rec["distribution"]["parsed"]["distribution"] = d2
    if rec.get("parsed") and rec.get("goals") and rec["goals"].get("parsed") is not None:
        rec["parsed"] = rec["goals"]["parsed"]
    rec["bench_variant"] = "reconciled"

    out_path = raw_path.with_suffix(".reconciled.json")
    out_path.write_text(json.dumps({"gemini_output": rec}, indent=2), encoding="utf-8")
    print(f"  rebuilt {out_path.name}  ({len(g2)} goals, {len(s2)} saves, {len(d2)} dist)")


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        return 1
    for arg in sys.argv[1:]:
        p = Path(arg).resolve()
        if not p.is_file():
            print(f"skip (not a file): {p}", file=sys.stderr)
            continue
        rebuild(p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
