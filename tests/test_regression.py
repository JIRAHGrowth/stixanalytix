"""
Prompt + schema + reconciliation regression suite.

Runs in <1s, no model calls. Catches the breakage modes that have actually
shipped to main before:

  * Prompt template has an unsubstituted {{placeholder}}
  * Worker schema and prompt's "per-event fields" diverge after an edit
  * Reconciliation rule crashes on empty / malformed input
  * Ground-truth JSON file in scripts/ground-truth/ has the wrong shape
  * Adding a Required schema field without updating the prompt to ask for it

Invoke:
    python -m unittest tests.test_regression -v

Or via the runner:
    python tests/run.py
"""
from __future__ import annotations
import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "worker"))


# Common sample vars used to render prompts safely
SAMPLE_VARS = {
    "my_team_color": "black",
    "opponent_color": "blue",
    "my_keeper_color": "orange",
}

# Map prompt files to the worker schema constant + the response-key
# (which lists the events in the parsed payload).
PROMPT_CONTRACTS = [
    ("goals.md", "GOALS_RESPONSE_SCHEMA", "goals"),
    ("saves.md", "SAVES_RESPONSE_SCHEMA", "saves"),
    ("distribution.md", "DISTRIBUTION_RESPONSE_SCHEMA", "distribution"),
]


def _render(template: str, vars: dict) -> str:
    out = template
    for k, v in vars.items():
        out = out.replace("{{" + k + "}}", str(v))
    return out


class PromptRenderTests(unittest.TestCase):
    """Every prompt template renders cleanly with the standard template
    variables. No leftover {{...}} placeholders after substitution."""

    def test_no_unsubstituted_placeholders(self):
        for fname, _, _ in PROMPT_CONTRACTS:
            with self.subTest(prompt=fname):
                p = ROOT / "prompts" / fname
                text = p.read_text(encoding="utf-8")
                rendered = _render(text, SAMPLE_VARS)
                leftover = re.findall(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}", rendered)
                self.assertEqual(
                    leftover, [],
                    f"{fname} has unsubstituted placeholders after render: {leftover}. "
                    f"Either add them to SAMPLE_VARS in this test (if the worker "
                    f"now supplies them) or remove from the prompt.")

    def test_prompts_have_match_context(self):
        """Every prompt must reference team-color vars in a MATCH CONTEXT
        section — the color-anchor invariant we added in v3."""
        for fname, _, _ in PROMPT_CONTRACTS:
            with self.subTest(prompt=fname):
                text = (ROOT / "prompts" / fname).read_text(encoding="utf-8")
                self.assertIn("{{my_team_color}}", text,
                              f"{fname} doesn't reference my_team_color")
                self.assertIn("{{opponent_color}}", text,
                              f"{fname} doesn't reference opponent_color")


class SchemaPromptAlignmentTests(unittest.TestCase):
    """Every required field in the worker response schema must appear in the
    prompt's text (so the model has been told to produce it). This catches
    the failure mode where someone adds a schema field but forgets to update
    the prompt."""

    @classmethod
    def setUpClass(cls):
        from app import GOALS_RESPONSE_SCHEMA, SAVES_RESPONSE_SCHEMA, DISTRIBUTION_RESPONSE_SCHEMA
        cls.schemas = {
            "GOALS_RESPONSE_SCHEMA": GOALS_RESPONSE_SCHEMA,
            "SAVES_RESPONSE_SCHEMA": SAVES_RESPONSE_SCHEMA,
            "DISTRIBUTION_RESPONSE_SCHEMA": DISTRIBUTION_RESPONSE_SCHEMA,
        }

    def test_required_fields_referenced_in_prompt(self):
        for fname, schema_name, list_key in PROMPT_CONTRACTS:
            with self.subTest(prompt=fname):
                schema = self.schemas[schema_name]
                required = schema["properties"][list_key]["items"]["required"]
                text = (ROOT / "prompts" / fname).read_text(encoding="utf-8")
                missing = []
                for field in required:
                    # Allow the prompt to reference the field in backticks,
                    # under "Per-event fields", or anywhere in body text.
                    if field not in text:
                        missing.append(field)
                self.assertEqual(
                    missing, [],
                    f"{fname} is missing references to schema-required fields: {missing}. "
                    f"Either update the prompt to ask for them, or remove from the "
                    f"schema's required list.")

    def test_both_workers_have_matching_schemas(self):
        """worker/app.py and worker/app_v2.py must have equivalent schemas
        (we duplicated them on purpose for Modal vs canary deploy parity;
        let's at least verify they don't drift)."""
        from app import (
            GOALS_RESPONSE_SCHEMA as A_G,
            SAVES_RESPONSE_SCHEMA as A_S,
            DISTRIBUTION_RESPONSE_SCHEMA as A_D,
        )
        # Re-import from app_v2 with a fresh module namespace
        import importlib.util
        spec = importlib.util.spec_from_file_location("app_v2", ROOT / "worker" / "app_v2.py")
        v2 = importlib.util.module_from_spec(spec)
        try:
            spec.loader.exec_module(v2)
        except Exception as e:
            self.skipTest(f"can't import worker/app_v2.py: {e}")
        self.assertEqual(set(A_G["properties"]["goals"]["items"]["required"]),
                         set(v2.GOALS_RESPONSE_SCHEMA["properties"]["goals"]["items"]["required"]),
                         "goals schema required fields drift between app.py and app_v2.py")
        self.assertEqual(set(A_S["properties"]["saves"]["items"]["required"]),
                         set(v2.SAVES_RESPONSE_SCHEMA["properties"]["saves"]["items"]["required"]),
                         "saves schema required fields drift")
        self.assertEqual(set(A_D["properties"]["distribution"]["items"]["required"]),
                         set(v2.DISTRIBUTION_RESPONSE_SCHEMA["properties"]["distribution"]["items"]["required"]),
                         "distribution schema required fields drift")


class ReconciliationRulesTests(unittest.TestCase):
    """Reconciliation pipeline survives common edge cases and the documented
    rules drop what they're supposed to drop."""

    @classmethod
    def setUpClass(cls):
        from app import _reconcile_events
        # staticmethod wrapper — otherwise Python treats _reconcile_events as
        # an instance method and prepends self to the call.
        cls.reconcile = staticmethod(_reconcile_events)

    def test_empty_input_is_safe(self):
        g, s, d = self.reconcile([], [], [])
        self.assertEqual(g, [])
        self.assertEqual(s, [])
        self.assertEqual(d, [])

    def test_none_input_is_safe(self):
        g, s, d = self.reconcile(None, None, None)
        self.assertEqual(g, [])
        self.assertEqual(s, [])
        self.assertEqual(d, [])

    def test_rule_d_drops_goals_with_insufficient_evidence(self):
        """Rule D: drop goals where <2 of {kickoff, celebration, scoreboard}
        are affirmatively observed."""
        # All three evidence fields negative -> should drop
        bad = {
            "timestamp_seconds": 100,
            "scoring_team": "blue", "conceding_team": "black",
            "scoreboard_before": "not_visible", "scoreboard_after": "not_visible",
            "evidence_kickoff_after": "not_observed",
            "evidence_celebration": "not_observed",
            "evidence_scoreboard": "scoreboard_not_visible",
        }
        # Two evidence fields affirmative -> should keep
        good = {
            "timestamp_seconds": 200,
            "scoring_team": "blue", "conceding_team": "black",
            "scoreboard_before": "not_visible", "scoreboard_after": "not_visible",
            "evidence_kickoff_after": "kickoff at 3:20",
            "evidence_celebration": "blue players celebrate at corner",
            "evidence_scoreboard": "scoreboard_not_visible",
        }
        goals, _, _ = self.reconcile([bad, good], [], [])
        self.assertEqual(len(goals), 1)
        self.assertEqual(goals[0]["timestamp_seconds"], 200)

    def test_rule_f_drops_saves_with_no_attack_description(self):
        """Rule F (Phase 2.6): drop saves where preceding_attack is empty
        or generic, OR the GK is not visible and outcome is held with no
        shot language in description."""
        invented = {
            "timestamp_seconds": 100,
            "gk_visible": "no",
            "outcome": "held",
            "shot_description": "ball comes in", # no shot-language word
            "preceding_attack": None,
        }
        real = {
            "timestamp_seconds": 200,
            "gk_visible": "yes",
            "outcome": "held",
            "shot_description": "A driven shot from 18 yards central, struck at chest height.",
            "preceding_attack": ("Opposition #9 received the ball at the top of the box, "
                                 "took one touch and struck low across goal."),
        }
        _, saves, _ = self.reconcile([], [invented, real], [])
        kept_ts = [s["timestamp_seconds"] for s in saves]
        self.assertNotIn(100, kept_ts, "Rule F should drop the invented save")
        self.assertIn(200, kept_ts, "Rule F should keep the real save")

    def test_rule_g_drops_opposition_gk_actions(self):
        """Rule G (Phase 2.6): drop distributions where the kit + direction
        + outcome signature looks like the opposition GK's actions."""
        opp_gk = {
            "timestamp_seconds": 100,
            "trigger": "backpass", "type": "pass",
            "direction": "backwards", "receiver": "opponent",
            "successful": "false",
        }
        ours = {
            "timestamp_seconds": 200,
            "trigger": "goal_kick", "type": "gk_long",
            "direction": "centre", "receiver": "forward",
            "successful": "true",
        }
        _, _, dist = self.reconcile([], [], [opp_gk, ours])
        kept_ts = [d["timestamp_seconds"] for d in dist]
        self.assertNotIn(100, kept_ts, "Rule G should drop the opposition GK action")
        self.assertIn(200, kept_ts, "Rule G should keep our GK action")

    def test_rule_g_drops_trigger_type_mismatch(self):
        """Rule G also drops obvious trigger/type contradictions
        (e.g., goal_kick paired with throw)."""
        bad = {
            "timestamp_seconds": 100,
            "trigger": "goal_kick", "type": "throw",
            "direction": "centre", "receiver": "defender",
            "successful": "true",
        }
        _, _, dist = self.reconcile([], [], [bad])
        self.assertEqual(len(dist), 0,
                         "Rule G should drop goal_kick + throw mismatch")


class TruthFileShapeTests(unittest.TestCase):
    """Every hand-curated truth JSON in scripts/ground-truth/ parses cleanly
    and has the shape eval-match.js + build-sft-training-data.py expect."""

    REQUIRED_TOP_KEYS = {"events", "video_job_id", "my_team_color",
                         "opponent_color", "my_keeper_color"}
    REQUIRED_EVENT_KEYS = {"goals", "saves", "distribution"}

    def test_all_truth_files_parse_and_match_shape(self):
        truth_dir = ROOT / "scripts" / "ground-truth"
        files = list(truth_dir.glob("*.json"))
        if not files:
            self.skipTest("no ground-truth JSON files present (run excel-to-ground-truth.js first)")
        for f in files:
            with self.subTest(file=f.name):
                try:
                    j = json.loads(f.read_text(encoding="utf-8"))
                except json.JSONDecodeError as e:
                    self.fail(f"{f.name} doesn't parse: {e}")
                missing_top = self.REQUIRED_TOP_KEYS - set(j.keys())
                self.assertEqual(missing_top, set(),
                                 f"{f.name} missing top-level keys: {missing_top}")
                missing_events = self.REQUIRED_EVENT_KEYS - set((j.get("events") or {}).keys())
                self.assertEqual(missing_events, set(),
                                 f"{f.name} missing event sections: {missing_events}")
                # video_job_id must be a uuid-ish string
                vjid = j.get("video_job_id")
                self.assertIsNotNone(vjid, f"{f.name} has no video_job_id")
                self.assertRegex(str(vjid),
                                 r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
                                 f"{f.name} video_job_id not uuid-shaped: {vjid}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
