// ═══ SHARED MAPPINGS ══════════════════════════════════════════════════════
// Convert between Gemini's free-form output and pitchside's enum vocabulary.
// Used by both the video review page and the publish API route.

/** Map Gemini height string → pitchside zone prefix */
export function mapHeight(h) {
  const v = String(h || "").toLowerCase();
  if (v.startsWith("top")) return "High";
  if (v.startsWith("mid")) return "Mid";
  if (v.startsWith("low")) return "Low";
  return "";
}

/** Map Gemini side string → pitchside zone suffix */
export function mapSide(s) {
  const v = String(s || "").toLowerCase();
  if (v === "centre" || v === "center") return "C";
  if (v.includes("left"))  return "L";
  if (v.includes("right")) return "R";
  return "";
}

/** Compose height + side into a goal zone string (e.g. "High L") */
export function defaultZone(g) {
  const h = mapHeight(g.goal_placement_height);
  const s = mapSide(g.goal_placement_side);
  if (!h || !s) return "";
  return `${h} ${s}`;
}

/** Map Gemini attack_type → pitchside goal source */
export function defaultSource(g) {
  const v = String(g.attack_type || "").toLowerCase();
  if (v === "corner") return "Corner";
  if (v === "penalty") return "Penalty";
  if (v === "open_play" || v === "counter_attack") return "Open Play";
  return "";
}

/** Map Gemini shot_type → pitchside shot type enum */
export function defaultShotType(g) {
  const v = String(g.shot_type || "").toLowerCase();
  if (v.includes("header")) return "Header";
  if (v.includes("deflection")) return "Deflection";
  return "Foot";
}

/** Format timestamp seconds → "M:SS" string */
export function fmtTs(s) {
  if (s == null) return "\u2014";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** Parse "M:SS" string → seconds (or null) */
export function tsStrToSeconds(str) {
  if (!str) return null;
  const m = /^(\d+):(\d{1,2})$/.exec(String(str).trim());
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/**
 * Coerce Gemini's stringly-typed booleans into a nullable boolean.
 * "true"/"false"/"unclear" → true/false/null
 */
export function coerceTriBool(v) {
  if (v === true || v === false) return v;
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (s === "true") return true;
  if (s === "false") return false;
  return null;
}

/**
 * Coerce Gemini's press_state enum into a nullable boolean.
 * "pressed" → true, "unpressed" → false, else → null
 */
export function coercePressState(v) {
  if (v === true || v === false) return v;
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (s === "pressed" || s === "true") return true;
  if (s === "unpressed" || s === "false") return false;
  return null;
}
