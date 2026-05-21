/**
 * Phase A1 — initial-state keep decisions for the video-review surface.
 *
 * Rules are evidence-based, not confidence-based. Gemini self-reports nearly
 * every event at "high" today (see worker/app.py:194), so confidence alone
 * isn't discriminative. We lean on structured evidence fields the prompts
 * already capture.
 *
 * Coach can override anything; nothing here is a hard filter. The bench-derived
 * thresholds (Phase B, after measuring precision-per-band) will replace these
 * rules with per-(model, event_type, confidence_band) data-driven defaults.
 */

const NEGATIVE_EVIDENCE = new Set([
  "", "not_observed", "no_observation", "none", "null", "n/a",
  "scoreboard_not_visible", "no_scoreboard_visible", "scoreboard_unchanged",
  "no_kickoff_observed", "no_celebration_observed",
]);

const isAffirmative = (v) => {
  const s = String(v ?? "").trim().toLowerCase();
  return s !== "" && !NEGATIVE_EVIDENCE.has(s);
};

const SCOREBOARD_DELTA_RE = /\d+\s*-\s*\d+\s*->/;

/**
 * Goals — scoreboard-aware two-of-three rule, with a hard veto when the
 * scoreboard was visible and didn't change. Worker reconciliation already
 * drops the loosest cases at "<2 affirmatives"; UI default-keep adds the
 * scoreboard-veto layer on top.
 *
 * Returns { keep, reason } so the UI can render a short explanation chip.
 */
export function defaultKeepGoal(g) {
  const evScore = String(g?.evidence_scoreboard ?? "").trim().toLowerCase();
  if (evScore === "scoreboard_unchanged") {
    return { keep: false, reason: "skip-sb", explain: "scoreboard says no change" };
  }
  const affirmatives = [
    isAffirmative(g?.evidence_kickoff_after),
    isAffirmative(g?.evidence_celebration),
    SCOREBOARD_DELTA_RE.test(String(g?.evidence_scoreboard ?? "")),
  ].filter(Boolean).length;
  if (affirmatives >= 2) return { keep: true, reason: "keep", explain: `${affirmatives}/3 evidence` };
  return { keep: false, reason: "skip", explain: `${affirmatives}/3 evidence` };
}

/**
 * Saves — pre-keep the on-target rows where a GK action was clearly observed.
 * Off-target / unclear-action / GK-not-visible rows go to skip so the coach
 * has to make the call (this is where the noise concentrates).
 */
const REAL_GK_ACTIONS = new Set(["catch", "block", "parry", "punch", "deflect", "smother", "k-barrier"]);

export function defaultKeepSave(s) {
  const onTarget = String(s?.on_target ?? "").toLowerCase();
  const gkAction = String(s?.gk_action ?? "").toLowerCase();
  const gkVisible = String(s?.gk_visible ?? "").toLowerCase();
  if (onTarget === "yes" && REAL_GK_ACTIONS.has(gkAction) && gkVisible === "yes") {
    return { keep: true, reason: "keep", explain: "on-target, GK action visible" };
  }
  const reasons = [];
  if (onTarget !== "yes") reasons.push(`on_target=${onTarget || "?"}`);
  if (!REAL_GK_ACTIONS.has(gkAction)) reasons.push(`action=${gkAction || "?"}`);
  if (gkVisible !== "yes") reasons.push(`gk_visible=${gkVisible || "?"}`);
  return { keep: false, reason: "skip", explain: reasons.join("; ") };
}

/**
 * Distribution — worker rule A already drops low-confidence rows pre-review.
 * Default-keep here adds: trigger + direction unambiguous, press_state stated.
 */
const isAmbiguous = (v) => {
  const s = String(v ?? "").toLowerCase().trim();
  return !s || s === "unclear" || s === "null";
};

export function defaultKeepDistribution(d) {
  if (isAmbiguous(d?.trigger)) return { keep: false, reason: "skip", explain: "trigger unclear" };
  if (isAmbiguous(d?.direction)) return { keep: false, reason: "skip", explain: "direction unclear" };
  const pressKnown = !isAmbiguous(d?.press_state) || d?.under_pressure != null;
  if (!pressKnown) return { keep: false, reason: "skip", explain: "press state unclear" };
  return { keep: true, reason: "keep", explain: "trigger+direction+press all set" };
}
