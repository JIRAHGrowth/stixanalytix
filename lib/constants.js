// ═══ SHARED CONSTANTS ══════════════════════════════════════════════════════
// Single source of truth for all enums, labels, and mappings.
// Every page and API route imports from here — never redefine these inline.

// ── Goal zones (9-zone net grid) ─────────────────────────────────────────
export const GOAL_ZONES = [
  "High L","High C","High R",
  "Mid L","Mid C","Mid R",
  "Low L","Low C","Low R",
];

export const OFF_TARGET_ZONES = ["Wide Left", "Wide Right", "Over Bar"];

export const ZONE_LABELS = {
  "High L": "Top Left",   "High C": "Top Centre",  "High R": "Top Right",
  "Mid L":  "Mid Left",   "Mid C":  "Mid Centre",   "Mid R":  "Mid Right",
  "Low L":  "Low Left",   "Low C":  "Low Centre",   "Low R":  "Low Right",
};

// ── Shot origins (pitch zones) ───────────────────────────────────────────
export const SHOT_ORIGINS = [
  { id: "6yard",   label: "6-Yard Box" },
  { id: "boxL",    label: "Left Channel" },
  { id: "boxC",    label: "Central Box" },
  { id: "boxR",    label: "Right Channel" },
  { id: "outL",    label: "Wide Left" },
  { id: "outC",    label: "Central Distance" },
  { id: "outR",    label: "Wide Right" },
  { id: "cornerL", label: "Corner Left" },
  { id: "cornerR", label: "Corner Right" },
  { id: "crossL",  label: "Cross Left" },
  { id: "crossR",  label: "Cross Right" },
];

export const ORIGIN_LABELS = {
  "6yard":   "6-Yard Box",
  "boxL":    "Left Channel",
  "boxC":    "Central Box",
  "boxR":    "Right Channel",
  "outL":    "Wide Left",
  "outC":    "Central Distance",
  "outR":    "Wide Right",
  "cornerL": "Corner Left",
  "cornerR": "Corner Right",
  "crossL":  "Cross Left",
  "crossR":  "Cross Right",
  "penalty": "Penalty Spot",
};

// ── Goal classification ──────────────────────────────────────────────────
export const GOAL_SOURCES = ["Open Play", "Corner", "Penalty"];
export const SHOT_TYPES = ["Foot", "Header", "Deflection", "Own Goal"];
export const GK_POSITIONING = ["Set", "Moving"];
export const GOAL_RANKS = ["Saveable", "Difficult", "Unsaveable"];

// ── GK actions (context-specific for pitchside) ──────────────────────────
export const GK_ACTIONS_SHOT = ["Catch", "Block", "Smother", "Parry", "Deflect", "Punch", "Goal", "Missed/Misjudged"];
export const GK_ACTIONS_CROSS = ["Catch", "Punch", "Away", "Missed/Misjudged"];
export const GK_ACTIONS_PENALTY = ["Save – Catch", "Save – Smother", "Save – Parry", "Goal", "Missed/Misjudged"];
export const GK_ACTION_LABELS = { "Away": "Away" };

// ── GK actions (video pipeline vocabulary) ───────────────────────────────
export const GK_ACTIONS_VIDEO = ["Catch", "Block", "Parry", "Deflect", "Punch", "Missed", "Goal", "unclear"];

// ── GK action → database column mapping (for save aggregation) ───────────
export const GK_ACTION_TO_COL = {
  Catch:   "saves_catch",
  Parry:   "saves_parry",
  Block:   "saves_block",
  Deflect: "saves_tip",
  Punch:   "saves_punch",
};

// ── Validation sets (for API routes) ─────────────────────────────────────
export const VALID_ZONES       = new Set(GOAL_ZONES);
export const VALID_ORIGINS     = new Set([...SHOT_ORIGINS.map(o => o.id), "unclear"]);
export const VALID_SOURCES     = new Set(GOAL_SOURCES);
export const VALID_SHOT_TYPES  = new Set(SHOT_TYPES);
export const VALID_POSITIONING = new Set(GK_POSITIONING);
export const VALID_RANKS       = new Set(GOAL_RANKS);
export const VALID_GK_ACTIONS  = new Set(GK_ACTIONS_VIDEO);

// ── Match logging ────────────────────────────────────────────────────────
export const HALVES = ["H1", "H2", "ET"];
export const EVENT_TYPES = ["Shot", "1v1", "Corner", "Cross", "Penalty"];
export const SUB_REASONS = ["Removed – Injury", "Removed – Poor Play", "Removed – Other"];
export const SHOT_METHODS = SHOT_TYPES; // alias for pitchside compatibility

// ── Attributes ───────────────────────────────────────────────────────────
export const ATTRS = [
  "Game Rating","Shot Stopping","Handling","Positioning",
  "Aerial Dominance","Distribution","Decision Making","Sweeper Play",
  "Set Piece Org.","Footwork & Agility","Reaction Speed",
  "Communication","Command of Box","Composure","Compete Level",
];

export const ATTR_KEYS = [
  "game_rating","shot_stopping","handling","positioning","aerial_dominance",
  "distribution","decision_making","sweeper_play","set_piece_org",
  "footwork_agility","reaction_speed","communication","command_of_box",
  "composure","compete_level",
];

export const ATTR_LABELS = {
  game_rating: "Game Rating",
  shot_stopping: "Shot Stopping",
  handling: "Handling",
  positioning: "Positioning",
  aerial_dominance: "Aerial Dominance",
  distribution: "Distribution",
  decision_making: "Decision Making",
  sweeper_play: "Sweeper Play",
  set_piece_org: "Set Piece Org.",
  footwork_agility: "Footwork & Agility",
  reaction_speed: "Reaction Speed",
  communication: "Communication",
  command_of_box: "Command of Box",
  composure: "Composure",
  compete_level: "Compete Level",
};

export const CORE_ATTRS = [
  "shot_stopping","positioning","aerial_dominance",
  "distribution","decision_making","composure","compete_level",
];

// ── Keeper profile ───────────────────────────────────────────────────────
export const KEEPER_ROLES = ["Starter", "Backup", "Development", "Trial"];
export const KEEPER_DEPTHS = ["Starter", "Backup", "Third", "Development"];
export const FOOTED = ["Left", "Right", "Ambidextrous"];

// ── Coach/profile roles (onboarding) ─────────────────────────────────────
export const COACH_ROLES = [
  "GK Coach", "Director of Goalkeeping", "Head of Academy GK",
  "Scout", "Technical Director", "Individual Keeper", "Parent",
];

// ── Delegate roles (staff page) ──────────────────────────────────────────
export const DELEGATE_ROLES = [
  { id: "assistant_coach", label: "Assistant Coach", icon: "\u{1F9D1}\u{200D}\u{1F4BC}", desc: "Logs matches and views analytics for assigned keepers" },
  { id: "gk_parent", label: "GK Parent", icon: "\u{1F468}\u{200D}\u{1F467}", desc: "Logs matches and optionally views stats for their keeper" },
  { id: "scout", label: "Scout", icon: "\u{1F50D}", desc: "Views analytics only \u2014 no match logging" },
  { id: "team_manager", label: "Team Manager", icon: "\u{1F4CB}", desc: "Logs matches for any assigned keepers" },
  { id: "academy_coach", label: "Academy GK Coach", icon: "\u{1F393}", desc: "Full logging and analytics for their age group" },
  { id: "goalkeeper", label: "Goalkeeper", icon: "\u{1F9E4}", desc: "Submits their own notes and rankings for matches they played in" },
];

// ── Video review (save-event detail) ─────────────────────────────────────
export const ON_TARGET_OPTIONS = ["yes", "no", "unclear"];
export const GK_VISIBLE_OPTIONS = ["yes", "partial", "no"];
export const OUTCOMES = ["held", "rebound_safe", "rebound_dangerous", "corner", "out_of_play", "goal"];
export const BODY_ZONES = ["A", "B", "C", "unclear"];
export const GMH_OPTIONS = ["top", "mid", "low", "unclear"];
export const GMS_OPTIONS = ["left_third", "centre", "right_third", "unclear"];

// ── Save technique vocabulary (from gk_techniques encyclopedia) ──────────
// Chapters: 4 (catches), 9 (parries), 10 (tip), 17 (punches), 22/24/26 (block/smother)
export const SAVE_TECHNIQUES = [
  { id: "w_catch",        label: "W-catch" },
  { id: "scoop",          label: "Scoop" },
  { id: "chest_catch",    label: "Chest catch" },
  { id: "collapse_catch", label: "Collapse catch" },
  { id: "forward_parry",  label: "Forward parry" },
  { id: "side_parry",     label: "Side parry" },
  { id: "tip_over",       label: "Tip over" },
  { id: "punch",          label: "Punch" },
  { id: "block",          label: "Block" },
  { id: "smother",        label: "Smother" },
];

// Dive family (encyclopedia ch.13)
export const DIVE_FAMILIES = [
  { id: "none",              label: "None" },
  { id: "collapse",          label: "Collapse" },
  { id: "low_dive",          label: "Low dive" },
  { id: "mid_dive",          label: "Mid dive" },
  { id: "high_dive",         label: "High dive" },
  { id: "diagonal_forward",  label: "Diagonal forward" },
];

// ── Distribution target zones (12 zones on landscape pitch view) ─────────
// short_c is the GK area in our own central third — non-target, just shown
// for spatial context on the diagram.
export const DIST_TARGET_ZONES = [
  { id: "short_l", label: "Short L",  band: "SHORT",     lateral: "L" },
  { id: "short_c", label: "GK area",  band: "SHORT",     lateral: "C", isGkArea: true },
  { id: "short_r", label: "Short R",  band: "SHORT",     lateral: "R" },
  { id: "mid_l",   label: "Mid L",    band: "MEDIUM",    lateral: "L" },
  { id: "mid_c",   label: "Mid C",    band: "MEDIUM",    lateral: "C" },
  { id: "mid_r",   label: "Mid R",    band: "MEDIUM",    lateral: "R" },
  { id: "long_l",  label: "Long L",   band: "LONG",      lateral: "L" },
  { id: "long_c",  label: "Long C",   band: "LONG",      lateral: "C" },
  { id: "long_r",  label: "Long R",   band: "LONG",      lateral: "R" },
  { id: "xlong_l", label: "XLong L",  band: "VERY LONG", lateral: "L" },
  { id: "xlong_c", label: "XLong C",  band: "VERY LONG", lateral: "C" },
  { id: "xlong_r", label: "XLong R",  band: "VERY LONG", lateral: "R" },
];

// Trigger / type vocab (mirrors prompts/distribution.md + DB CHECK constraints)
export const DIST_TRIGGERS = ["goal_kick", "after_save", "backpass", "loose_ball", "throw_in_to_gk", "free_kick_to_gk"];
export const DIST_TRIGGER_LABELS = {
  goal_kick: "Goal kick", after_save: "After save", backpass: "Backpass",
  loose_ball: "Loose ball", throw_in_to_gk: "Throw-in to GK", free_kick_to_gk: "FK to GK",
};
export const DIST_TYPES = ["gk_short", "gk_long", "throw", "drop_kick", "pass"];
export const DIST_TYPE_LABELS = {
  gk_short: "Short pass", gk_long: "Long pass", throw: "Throw",
  drop_kick: "Drop-kick", pass: "Foot pass",
};
export const DIST_PRESSURE = ["pressed", "unpressed", "unclear"];
export const DIST_SUCCESSFUL = ["true", "false", "unclear"];
export const DIST_SUCCESSFUL_LABELS = { "true": "Found teammate", "false": "Lost possession", unclear: "Unclear" };
export const DIST_FIRST_TOUCH = ["clean", "heavy", "two_touches", "mishit"];
export const DIST_FIRST_TOUCH_LABELS = {
  clean: "Clean", heavy: "Heavy", two_touches: "Two-touch", mishit: "Mishit",
};

// ── Action colors (for save event display) ───────────────────────────────
// NOTE: these return theme-key names, not literal colors.
// Consumers should resolve against their active theme object.
export const GK_ACTION_SEVERITY = {
  Catch: "green", Block: "green",
  Parry: "accent", Deflect: "accent", Punch: "accent",
  Missed: "red", Goal: "red",
  unclear: "dim",
};

// ── Shared font ──────────────────────────────────────────────────────────
export const FONT = "'DM Sans', -apple-system, sans-serif";
