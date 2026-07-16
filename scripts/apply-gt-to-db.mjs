#!/usr/bin/env node
/**
 * apply-gt-to-db.mjs — reconcile a ground-truth JSON against the live Supabase
 * DB for the same match. GT is authoritative: fields diff to GT, missing events
 * are inserted, DB events GT doesn't confirm are deleted (subject to the
 * `--keep-unmatched` flag for safety).
 *
 * USAGE
 *   node scripts/apply-gt-to-db.mjs <match-slug>              # dry-run
 *   node scripts/apply-gt-to-db.mjs <match-slug> --apply      # write
 *   node scripts/apply-gt-to-db.mjs --all                     # dry-run every GT
 *   node scripts/apply-gt-to-db.mjs --all --apply             # write every GT
 *   node scripts/apply-gt-to-db.mjs <match-slug> --apply --keep-unmatched
 *     ↑ don't delete DB events GT doesn't confirm (safer; leaves potential
 *       false-positives in the DB for manual review)
 *
 * DESIGN
 *   1. Resolve GT JSON to a DB match_id (via GT.video_job_id → video_jobs).
 *      If GT has no video_job_id yet, the tool prints the DB match candidates
 *      and asks you to fill in the field (converter re-run needed).
 *   2. Fetch DB rows for every event type on that match.
 *   3. For each event type: pair GT ↔ DB by timestamp (±TS_TOLERANCE seconds).
 *      Emit an insert / update / delete plan. Special-case:
 *        - save→cross reclassification: DB has shot_event at ts that GT calls
 *          a cross. We DELETE the shot_event and INSERT into cross_events,
 *          copying clip_storage_path across so click-to-play survives.
 *   4. Attach clip_storage_path to new inserts from the video_jobs.gemini_output
 *      clip index (rounded ts → path). Where no clip exists, insert with NULL
 *      and note it for the follow-up clip-backfill (worker.backfill_clips_from_events).
 *   5. Write coach_corrections rows for every material change (training signal).
 *   6. In --apply, wrap everything in a transaction for the match.
 *
 * SAFETY
 *   Dry-run by default. Every DB write is scoped to the match's coach_id
 *   (Joshua) via the service-role client. Idempotent — re-running yields the
 *   same end state.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GT_DIR = path.join(__dirname, 'ground-truth');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// ── CLI ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flags = new Set(argv.filter(a => a.startsWith('--')));
const positional = argv.filter(a => !a.startsWith('--'));
const APPLY = flags.has('--apply');
const KEEP_UNMATCHED = flags.has('--keep-unmatched');
const ALL = flags.has('--all');
const VERBOSE = flags.has('--verbose');

// ── Config ───────────────────────────────────────────────────────────────────
const TS_TOLERANCE = 30; // seconds; GT ts vs Gemini ts drift on youth video
const COACH_ID_HARDCODE = 'eb7e8a7a-1e3c-4454-b5f8-2d03bf952e4f'; // Joshua — safety fence

// ── Helpers ──────────────────────────────────────────────────────────────────
function log(...a) { console.log(...a); }
function verbose(...a) { if (VERBOSE) console.log(...a); }

// Normalise the assortment of keeper_team encodings GT uses (color, "us",
// "opponent"). Returns 'us' | 'opp' | null.
function normKeeperTeam(v, myColor, oppColor) {
  if (v == null) return null;
  const s = String(v).toLowerCase().trim();
  if (!s) return null;
  if (s === 'us') return 'us';
  if (s === 'opponent' || s === 'them') return 'opp';
  if (myColor && s.includes(myColor)) return 'us';
  if (oppColor && s.includes(oppColor)) return 'opp';
  return null;
}

function keeperSlotFor(ts, subSeconds) {
  if (!subSeconds || !Number.isFinite(ts)) return 1;
  return ts >= subSeconds ? 2 : 1;
}

// Build a Map<roundedTs, clip_storage_path> from a video_jobs.gemini_output
// blob. The worker writes clip paths onto every detected event's ts.
function indexClipPaths(geminiOutput) {
  const idx = new Map();
  if (!geminiOutput || typeof geminiOutput !== 'object') return idx;
  const feed = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const e of arr) {
      const ts = e?.timestamp_seconds;
      if (Number.isFinite(ts) && e?.clip_storage_path) {
        idx.set(Math.round(ts), e.clip_storage_path);
      }
    }
  };
  feed(geminiOutput?.parsed?.goals);
  feed(geminiOutput?.saves?.parsed?.saves);
  feed(geminiOutput?.distribution?.parsed?.distribution);
  return idx;
}
function clipPathFor(idx, ts) {
  if (!Number.isFinite(ts)) return null;
  // Search within ±3s of the rounded ts so tiny drifts still hit a clip.
  for (let d = 0; d <= 3; d++) {
    const hit = idx.get(Math.round(ts) + d) || idx.get(Math.round(ts) - d);
    if (hit) return hit;
  }
  return null;
}

// Diff pairing: greedy nearest-timestamp match under TS_TOLERANCE.
// Returns { pairs: [[gt,db]], unmatchedGt: [gt], unmatchedDb: [db] }.
function pairByTimestamp(gtList, dbList, gtTsKey = 'timestamp_seconds', dbTsKey = 'timestamp_seconds') {
  const usedDb = new Set();
  const pairs = [];
  const unmatchedGt = [];
  // Sort GT so earliest pairs first (deterministic).
  const sortedGt = [...gtList].sort((a, b) => (a[gtTsKey] ?? 0) - (b[gtTsKey] ?? 0));
  for (const g of sortedGt) {
    if (!Number.isFinite(g[gtTsKey])) { unmatchedGt.push(g); continue; }
    let bestIdx = -1;
    let bestDelta = Infinity;
    dbList.forEach((d, i) => {
      if (usedDb.has(i)) return;
      const ts = d[dbTsKey];
      if (!Number.isFinite(ts)) return;
      const delta = Math.abs(ts - g[gtTsKey]);
      if (delta < bestDelta && delta <= TS_TOLERANCE) {
        bestDelta = delta; bestIdx = i;
      }
    });
    if (bestIdx >= 0) { pairs.push([g, dbList[bestIdx]]); usedDb.add(bestIdx); }
    else unmatchedGt.push(g);
  }
  const unmatchedDb = dbList.filter((_, i) => !usedDb.has(i));
  return { pairs, unmatchedGt, unmatchedDb };
}

// ── GT → DB row builders ─────────────────────────────────────────────────────
// Each builder takes a normalised GT event + context and returns the row
// shape ready for insert into the corresponding table.

function buildGoalRow({ gt, ctx, dbRow }) {
  // Defensive merge — preserve DB values for fields where GT is missing or
  // mapping falls back to a less-specific label.
  const keep = (gtVal, dbVal) => (gtVal === null || gtVal === undefined || gtVal === '') ? (dbVal ?? null) : gtVal;
  const gtZone = goalZoneFromGT(gt);
  const gtSource = attackTypeToSource(gt.attack_type);
  const gtShotType = shotTypeToLabel(gt.shot_type);
  return {
    match_id: ctx.match_id,
    coach_id: ctx.coach_id,
    keeper_id: ctx.keeperFor(gt),
    goal_zone: gtZone || dbRow?.goal_zone || null,
    shot_origin: keep(gt.shot_location, dbRow?.shot_origin),
    goal_source: gtSource || dbRow?.goal_source || null,
    goal_rank: dbRow?.goal_rank ?? null,
    // Only overwrite shot_type when GT gives a specific label (not the 'Foot' fallback).
    shot_type: gtShotType && gtShotType !== 'Foot' ? gtShotType : (dbRow?.shot_type || gtShotType),
    gk_positioning: dbRow?.gk_positioning ?? null,
    half: gt.half === 1 || gt.half === 2 ? gt.half : (dbRow?.half ?? null),
    timestamp_seconds: gt.timestamp_seconds ?? dbRow?.timestamp_seconds ?? null,
    minute: Number.isFinite(gt.timestamp_seconds) ? Math.floor(gt.timestamp_seconds / 60) : (dbRow?.minute ?? null),
    shot_description: keep(gt.play_description, dbRow?.shot_description),
    gk_observations: keep(gt.gk_observations, dbRow?.gk_observations),
    coach_notes: keep(gt.note, dbRow?.coach_notes),
    clip_storage_path: clipPathFor(ctx.clipIdx, gt.timestamp_seconds) || dbRow?.clip_storage_path || null,
  };
}

function buildSaveRow({ gt, ctx, dbRow }) {
  // Defensive merge: only override DB fields where GT has a real value.
  // NEVER null out an existing DB value — Gemini + coach review may have
  // populated it correctly, and blanking it destroys precision that GT
  // may not have re-tagged.
  const keep = (gtVal, dbVal) => (gtVal === null || gtVal === undefined || gtVal === '') ? (dbVal ?? null) : gtVal;
  return {
    match_id: ctx.match_id,
    coach_id: ctx.coach_id,
    keeper_id: ctx.keeperFor(gt),
    shot_origin: keep(gt.shot_origin, dbRow?.shot_origin),
    gk_action: keep(gt.gk_action, dbRow?.gk_action),
    goal_zone: dbRow?.goal_zone ?? null,
    is_goal: false,
    is_off_target: gt.on_target === 'no' ? true : gt.on_target === 'yes' ? false : (dbRow?.is_off_target ?? false),
    shot_type: keep(gt.shot_type, dbRow?.shot_type),
    event_type: 'Shot',
    half: gt.half === 1 ? 'H1' : gt.half === 2 ? 'H2' : (dbRow?.half ?? null),
    timestamp_seconds: gt.timestamp_seconds ?? dbRow?.timestamp_seconds ?? null,
    on_target: keep(gt.on_target, dbRow?.on_target),
    outcome: keep(gt.outcome, dbRow?.outcome),
    body_distance_zone: keep(gt.body_distance_zone, dbRow?.body_distance_zone),
    goal_placement_height: keep(gt.goal_placement_height, dbRow?.goal_placement_height),
    goal_placement_side: keep(gt.goal_placement_side, dbRow?.goal_placement_side),
    gk_visible: keep(gt.gk_visible, dbRow?.gk_visible),
    shot_description: keep(gt.play_description, dbRow?.shot_description),
    gk_observations: keep(gt.gk_observations, dbRow?.gk_observations),
    coach_notes: keep(gt.note, dbRow?.coach_notes),
    // Preserve DB keeper_team (never flip an opp-tagged row to us via GT match).
    keeper_team: dbRow?.keeper_team ?? 'us',
    coach_added: dbRow?.coach_added ?? false,
    clip_storage_path: clipPathFor(ctx.clipIdx, gt.timestamp_seconds) || dbRow?.clip_storage_path || null,
  };
}

function buildDistRow({ gt, ctx, dbRow }) {
  // Defensive merge — see buildSaveRow header. Never null out an existing DB value.
  const keep = (gtVal, dbVal) => (gtVal === null || gtVal === undefined || gtVal === '') ? (dbVal ?? null) : gtVal;
  const gtSuc = gt.successful === true || gt.successful === 'yes' ? true
              : gt.successful === false || gt.successful === 'no' ? false : null;
  const gtPress = gt.under_pressure === true || gt.under_pressure === 'yes' ? true
                : gt.under_pressure === false || gt.under_pressure === 'no' ? false : null;
  return {
    match_id: ctx.match_id,
    coach_id: ctx.coach_id,
    keeper_id: ctx.keeperFor(gt),
    timestamp_seconds: gt.timestamp_seconds ?? dbRow?.timestamp_seconds ?? null,
    minute: Number.isFinite(gt.timestamp_seconds) ? Math.floor(gt.timestamp_seconds / 60) : (dbRow?.minute ?? null),
    half: gt.half === 1 ? 'H1' : gt.half === 2 ? 'H2' : (dbRow?.half ?? null),
    trigger: keep(gt.trigger, dbRow?.trigger),
    type: keep(gt.type, dbRow?.type),
    // Prefer GT boolean; fall back to preserving whatever DB already had (Gemini's or coach's value).
    successful: gtSuc !== null ? gtSuc : (dbRow?.successful ?? null),
    under_pressure: gtPress !== null ? gtPress : (dbRow?.under_pressure ?? null),
    pass_selection: keep(gt.pass_selection, dbRow?.pass_selection),
    direction: keep(gt.direction, dbRow?.direction),
    receiver: keep(gt.receiver, dbRow?.receiver),
    first_touch: keep(gt.first_touch, dbRow?.first_touch),
    notes: keep(gt.note, dbRow?.notes),
    source: dbRow?.source || 'manual',
    // Preserve DB keeper_team (never flip an opp-tagged row).
    keeper_team: dbRow?.keeper_team ?? 'us',
    clip_storage_path: clipPathFor(ctx.clipIdx, gt.timestamp_seconds) || dbRow?.clip_storage_path || null,
  };
}

function buildCrossRow({ gt, ctx, dbRow }) {
  const keep = (gtVal, dbVal) => (gtVal === null || gtVal === undefined || gtVal === '') ? (dbVal ?? null) : gtVal;
  return {
    match_id: ctx.match_id,
    coach_id: ctx.coach_id,
    keeper_id: ctx.keeperFor(gt),
    timestamp_seconds: gt.timestamp_seconds ?? dbRow?.timestamp_seconds ?? null,
    minute: Number.isFinite(gt.timestamp_seconds) ? Math.floor(gt.timestamp_seconds / 60) : (dbRow?.minute ?? null),
    half: gt.half === 1 ? 'H1' : gt.half === 2 ? 'H2' : (dbRow?.half ?? null),
    side: keep(gt.side, dbRow?.side),
    cross_type: keep(gt.cross_type, dbRow?.cross_type),
    destination: keep(gt.destination, dbRow?.destination),
    gk_action: keep(gt.gk_action, dbRow?.gk_action),
    gk_starting_pos: keep(gt.gk_position, dbRow?.gk_starting_pos),
    outcome: keep(gt.outcome, dbRow?.outcome),
    notes: keep(gt.note, dbRow?.notes),
    keeper_team: dbRow?.keeper_team ?? 'us',
    source: dbRow?.source || 'manual',
    coach_added: dbRow?.coach_added ?? false,
    clip_storage_path: clipPathFor(ctx.clipIdx, gt.timestamp_seconds) || dbRow?.clip_storage_path || null,
  };
}

// Sweeper action enum: intercept | clearance_header | clearance_foot |
// control_distribute | slide | smother | let_through. Map GT vocab in.
const SWEEPER_ACTION_MAP = {
  interception: 'intercept',
  intercept: 'intercept',
  clearance: 'clearance_foot',
  clearance_foot: 'clearance_foot',
  header: 'clearance_header',
  clearance_header: 'clearance_header',
  tackle: 'slide',
  slide: 'slide',
};
// Pressure enum: alone | with_opp | with_teammate.
const SWEEPER_PRESSURE_MAP = {
  none: 'alone',
  alone: 'alone',
  '1_attacker': 'with_opp',
  '2+_attackers': 'with_opp',
  '2_plus_attackers': 'with_opp',
  with_opp: 'with_opp',
  with_teammate: 'with_teammate',
};
// Result enum: cleared_safely | kept_possession | conceded_corner | lost_possession | goal | yellow_red.
const SWEEPER_OUTCOME_MAP = {
  possession_retained: 'kept_possession',
  cleared_safely: 'cleared_safely',
  conceded_turnover: 'lost_possession',
  goal_conceded: 'goal',
};

function buildSweeperRow({ gt, ctx, dbRow }) {
  // Defensive: unmapped GT values fall back to DB value instead of nulling.
  const action = SWEEPER_ACTION_MAP[String(gt.action || '').toLowerCase()] || dbRow?.action || null;
  const pressure = SWEEPER_PRESSURE_MAP[String(gt.pressure || '').toLowerCase()] || dbRow?.pressure || null;
  const result = SWEEPER_OUTCOME_MAP[String(gt.outcome || '').toLowerCase()]
    || ((gt.successful === 'yes' || gt.successful === true) ? 'kept_possession'
      : (gt.successful === 'no' || gt.successful === false) ? 'lost_possession' : dbRow?.result || null);
  return {
    match_id: ctx.match_id,
    coach_id: ctx.coach_id,
    keeper_id: ctx.keeperFor(gt),
    timestamp_seconds: gt.timestamp_seconds ?? dbRow?.timestamp_seconds ?? null,
    minute: Number.isFinite(gt.timestamp_seconds) ? Math.floor(gt.timestamp_seconds / 60) : (dbRow?.minute ?? null),
    half: gt.half === 1 ? 'H1' : gt.half === 2 ? 'H2' : (dbRow?.half ?? null),
    action,
    pressure,
    result,
    sweep_zone: gt.distance || dbRow?.sweep_zone || null,
    notes: gt.note || (gt.outcome && !SWEEPER_OUTCOME_MAP[gt.outcome] ? gt.outcome : dbRow?.notes || null),
    source: dbRow?.source || 'manual',
    coach_added: dbRow?.coach_added ?? false,
    clip_storage_path: clipPathFor(ctx.clipIdx, gt.timestamp_seconds) || dbRow?.clip_storage_path || null,
  };
}

// 1v1 result enum: save | goal | cleared | forced_wide | foul_won | foul_conceded.
const ONE_V_ONE_RESULT_MAP = {
  won: 'save', saved: 'save', save: 'save',
  conceded: 'goal', goal: 'goal',
  cleared: 'cleared',
  forced_wide: 'forced_wide',
};
// situation_type enum: through_ball | breakaway_run | defensive_error | loose_ball | cross_back.
// GT's "event" column doesn't map cleanly (values: "1v1 faced" / "recovery save" / etc.),
// so leave situation_type null and stash the GT event verbatim in notes.
function buildOneV1Row({ gt, ctx, dbRow }) {
  const result = ONE_V_ONE_RESULT_MAP[String(gt.outcome || '').toLowerCase()] || dbRow?.result || null;
  // GT converter emits `event_type` (was reading `event` earlier — small bug fix).
  const eventLabel = gt.event_type || gt.event || null;
  return {
    match_id: ctx.match_id,
    coach_id: ctx.coach_id,
    keeper_id: ctx.keeperFor(gt),
    timestamp_seconds: gt.timestamp_seconds ?? dbRow?.timestamp_seconds ?? null,
    minute: Number.isFinite(gt.timestamp_seconds) ? Math.floor(gt.timestamp_seconds / 60) : (dbRow?.minute ?? null),
    half: gt.half === 1 ? 'H1' : gt.half === 2 ? 'H2' : (dbRow?.half ?? null),
    result,
    notes: [eventLabel, gt.outcome, gt.note].filter(Boolean).join(' — ') || dbRow?.notes || null,
    source: dbRow?.source || 'manual',
    coach_added: dbRow?.coach_added ?? false,
    clip_storage_path: clipPathFor(ctx.clipIdx, gt.timestamp_seconds) || dbRow?.clip_storage_path || null,
  };
}

// GT → publish-shape helpers
function goalZoneFromGT(gt) {
  const h = gt.goal_placement_height;
  const s = gt.goal_placement_side;
  const height = h === 'top' ? 'High' : h === 'mid' ? 'Mid' : h === 'low' ? 'Low' : null;
  const side = s === 'left_third' ? 'L' : s === 'centre' || s === 'center' ? 'C' : s === 'right_third' ? 'R' : null;
  return height && side ? `${height} ${side}` : null;
}
function attackTypeToSource(v) {
  if (!v) return null;
  const s = String(v).toLowerCase();
  if (s === 'corner') return 'Corner';
  if (s === 'penalty') return 'Penalty';
  if (s === 'free_kick') return 'Free Kick';
  if (s === 'open_play' || s === 'counter_attack') return 'Open Play';
  return null;
}
function shotTypeToLabel(v) {
  if (!v) return null;
  const s = String(v).toLowerCase();
  if (s.includes('header')) return 'Header';
  if (s.includes('deflection')) return 'Deflection';
  if (s.includes('volley')) return 'Volley';
  if (s.includes('one_v_one')) return 'One-v-one finish';
  return 'Foot';
}

// ── Main per-match reconciliation ────────────────────────────────────────────
async function reconcileMatch(gtPath) {
  const gt = JSON.parse(fs.readFileSync(gtPath, 'utf8'));
  const slug = gt.match_name || path.basename(gtPath, '.json');
  log(`\n═════════════════════════════════════════════════════════════════════`);
  log(`GT: ${slug}   (${gt.opponent || '—'}, ${gt.match_date || '?'})`);
  log(`═════════════════════════════════════════════════════════════════════`);

  // Resolve the DB match. Prefer the video_job_id link (authoritative). Fall
  // back to opponent + date if the GT doesn't have the job ID yet.
  let matchId = null;
  let videoJobId = gt.video_job_id || null;
  if (videoJobId) {
    const { data: job } = await sb.from('video_jobs').select('published_match_id, coach_id').eq('id', videoJobId).maybeSingle();
    if (job?.published_match_id) matchId = job.published_match_id;
  }
  if (!matchId) {
    const { data: candidates } = await sb.from('matches').select('id, keeper_id, secondary_keeper_id, was_subbed, sub_minute, opponent, match_date, coach_id')
      .eq('coach_id', COACH_ID_HARDCODE)
      .eq('match_date', gt.match_date)
      .ilike('opponent', gt.opponent || '');
    if (!candidates || candidates.length === 0) {
      log(`  ✗ NO DB MATCH FOUND for opponent="${gt.opponent}" date=${gt.match_date}. Skipping.`);
      return { slug, matched: false };
    }
    if (candidates.length > 1) {
      log(`  ⚠ MULTIPLE DB MATCHES for ${gt.opponent} on ${gt.match_date}. Fill in video_job_id in the GT.`);
      candidates.forEach(c => log(`     match_id=${c.id}`));
      return { slug, matched: false, ambiguous: true };
    }
    matchId = candidates[0].id;
  }

  const { data: match } = await sb.from('matches').select('*').eq('id', matchId).single();
  if (!match) { log(`  ✗ match ${matchId} not found`); return { slug, matched: false }; }
  const { data: vjRow } = await sb.from('video_jobs').select('gemini_output').eq('published_match_id', matchId).maybeSingle();
  const clipIdx = indexClipPaths(vjRow?.gemini_output);

  // Fetch every DB event for this match
  const [gcRes, seRes, deRes, sweRes, ovoRes, crRes] = await Promise.all([
    sb.from('goals_conceded').select('*').eq('match_id', matchId),
    sb.from('shot_events').select('*').eq('match_id', matchId),
    sb.from('distribution_events').select('*').eq('match_id', matchId),
    sb.from('sweeper_events').select('*').eq('match_id', matchId),
    sb.from('one_v_one_events').select('*').eq('match_id', matchId),
    sb.from('cross_events').select('*').eq('match_id', matchId),
  ]);
  const dbGoals = gcRes.data || [];
  const dbSaves = seRes.data || [];
  const dbDists = deRes.data || [];
  const dbSweeper = sweRes.data || [];
  const dbOneV1 = ovoRes.data || [];
  const dbCrosses = crRes.data || [];

  const myColor = String(gt.my_team_color || '').toLowerCase();
  const oppColor = String(gt.opponent_color || '').toLowerCase();
  const subS = gt.us_keeper_change_seconds || null;
  const primaryKid = match.keeper_id;
  const secondaryKid = match.secondary_keeper_id;
  const keeperFor = (gt) => {
    if (!subS || !secondaryKid) return primaryKid;
    return keeperSlotFor(gt.timestamp_seconds, subS) === 2 ? secondaryKid : primaryKid;
  };
  const ctx = { match_id: matchId, coach_id: match.coach_id, clipIdx, keeperFor };

  // ── Goal classification: scoring_team is the AUTHORITATIVE signal ──────────
  // Coaches sometimes mis-key `keeper_team` in the GT xlsx (checking "us" out
  // of habit even when logging goals we scored). `scoring_team` is unambiguous:
  // it names the color of the team that scored the goal.
  //   - opp scored the goal → we conceded → goals_conceded (ourGoals)
  //   - we scored the goal → goals_scored (ourScored)
  // Fall back to keeper_team only when scoring_team is missing/blank.
  //
  // 2026-07-15 incident: U16 Rise + KCITY had goals labeled keeper_team='us'
  // but scoring_team=my_color. First reconciler run trusted keeper_team and
  // wrongly added 3+2 goals to Amalie/Judah's goals_conceded ledgers.
  const classifyGoal = (g) => {
    const st = String(g.scoring_team || '').toLowerCase().trim();
    if (st) {
      // scoring_team = OUR side → we scored → goals_scored
      if (st === 'us') return 'scored';
      if (myColor && st.includes(myColor)) return 'scored';
      // scoring_team = OPP side → opp scored → we conceded → goals_conceded
      if (st === 'opponent' || st === 'them') return 'conceded';
      if (oppColor && st.includes(oppColor)) return 'conceded';
    }
    // No scoring_team — fall back to keeper_team.
    // keeper_team = "the team whose keeper the event is about". So:
    //   keeper_team='us'  → our GK is on the receiving end → we conceded
    //   keeper_team='opp' → opp GK is on the receiving end → we scored
    const kt = normKeeperTeam(g.keeper_team, myColor, oppColor);
    if (kt === 'us') return 'conceded';
    if (kt === 'opp') return 'scored';
    return null;
  };
  const ourGoals  = (gt.events?.goals || []).filter(g => classifyGoal(g) === 'conceded');
  const ourScored = (gt.events?.goals || []).filter(g => classifyGoal(g) === 'scored');
  const ourSaves = (gt.events?.saves || []).filter(s => normKeeperTeam(s.keeper_team, myColor, oppColor) === 'us' || s.keeper_team == null);
  const ourDists = (gt.events?.distribution || []).filter(d => normKeeperTeam(d.keeper_team, myColor, oppColor) === 'us' || d.keeper_team == null);
  const ourCrosses = (gt.events?.crosses || []).filter(c => normKeeperTeam(c.keeper_team, myColor, oppColor) === 'us' || c.keeper_team == null);
  const ourSweeper = (gt.events?.sweeper || []).filter(s => normKeeperTeam(s.keeper_team, myColor, oppColor) === 'us' || s.keeper_team == null);
  const ourOneV1 = (gt.events?.one_v_ones || []).filter(o => normKeeperTeam(o.keeper_team, myColor, oppColor) === 'us');

  // ── Pair + plan per event type ─────────────────────────────────────────────
  const plan = { insert: [], update: [], delete: [], move: [] };  // move = save→cross reclassification
  const summary = {};

  // 1. GOALS_CONCEDED (update in place; insert new; delete unmatched)
  {
    const { pairs, unmatchedGt, unmatchedDb } = pairByTimestamp(ourGoals, dbGoals);
    summary.goals = { gt: ourGoals.length, db: dbGoals.length, matched: pairs.length, addFromGt: unmatchedGt.length, dropFromDb: unmatchedDb.length };
    pairs.forEach(([g, d]) => {
      const newRow = buildGoalRow({ gt: g, ctx, dbRow: d });
      plan.update.push({ table: 'goals_conceded', id: d.id, patch: newRow, wasFrom: 'db+gt', why: 'field precision from GT' });
    });
    unmatchedGt.forEach(g => plan.insert.push({ table: 'goals_conceded', row: buildGoalRow({ gt: g, ctx }), reason: 'GT-only goal' }));
    // Only delete-unmatched when GT actually has events in this category.
    // Empty GT category ≠ "confirmed no events" — more likely the coach hasn't
    // tagged that section yet. Preserving DB is the safer default.
    if (!KEEP_UNMATCHED && ourGoals.length > 0) unmatchedDb.filter(d => d.keeper_team !== 'opp').forEach(d => plan.delete.push({ table: 'goals_conceded', id: d.id, wasTs: d.timestamp_seconds, reason: 'GT does not confirm this goal' }));
  }

  // 2. SAVES vs CROSSES — special reclassification handling.
  // Split DB saves into (a) ones GT confirms as saves, (b) ones GT calls a cross
  // (move → cross_events), (c) ones GT doesn't confirm at all (delete or keep).
  {
    // First pair DB saves ↔ GT saves.
    const { pairs: saveSavePairs, unmatchedGt: saveUnmatchedGt, unmatchedDb: saveUnmatchedDb } = pairByTimestamp(ourSaves, dbSaves);
    // Then check remaining DB saves against GT crosses (our + opp) — if we see
    // Gemini put a "save" where GT has a cross, that's a reclassification.
    const allGtCrosses = (gt.events?.crosses || []);
    const { pairs: saveCrossPairs } = pairByTimestamp(allGtCrosses, saveUnmatchedDb);

    summary.saves = { gt: ourSaves.length, db: dbSaves.length, savePairs: saveSavePairs.length, addFromGt: saveUnmatchedGt.length, reclassifiedToCross: saveCrossPairs.length, dropFromDb: 0 };

    // Update paired saves with GT precision. Pass dbRow so builder can
    // preserve DB values for fields GT doesn't specify (never null-out).
    saveSavePairs.forEach(([g, d]) => {
      const newRow = buildSaveRow({ gt: g, ctx, dbRow: d });
      plan.update.push({ table: 'shot_events', id: d.id, patch: newRow, reason: 'field precision from GT' });
    });
    // Insert GT-only saves
    saveUnmatchedGt.forEach(g => plan.insert.push({ table: 'shot_events', row: buildSaveRow({ gt: g, ctx }), reason: 'GT-only save' }));
    // Move save→cross (delete shot_event, insert cross with clip preserved)
    saveCrossPairs.forEach(([gtCross, dbSave]) => {
      const crossRow = buildCrossRow({ gt: gtCross, ctx });
      // If GT keeper_team is opp, the cross doesn't belong to us — still delete the misclassified save but don't create a cross for us.
      const gtKt = normKeeperTeam(gtCross.keeper_team, myColor, oppColor);
      const preservedClip = dbSave.clip_storage_path || null;
      if (gtKt === 'us') {
        if (!crossRow.clip_storage_path) crossRow.clip_storage_path = preservedClip;
        plan.insert.push({ table: 'cross_events', row: crossRow, reason: `reclassified from shot_event ${dbSave.id} (GT says cross)` });
      }
      plan.delete.push({ table: 'shot_events', id: dbSave.id, wasTs: dbSave.timestamp_seconds, reason: gtKt === 'us' ? 'reclassified into cross_events' : 'GT says this ts belongs to opp keeper cross' });
    });
    // Remaining unmatched DB saves (not in GT saves, not in GT crosses)
    const stillUnmatched = saveUnmatchedDb.filter(d => !saveCrossPairs.some(([, db]) => db.id === d.id));
    summary.saves.dropFromDb = stillUnmatched.length;
    if (!KEEP_UNMATCHED && ourSaves.length > 0) stillUnmatched.filter(d => d.keeper_team !== 'opp').forEach(d => plan.delete.push({ table: 'shot_events', id: d.id, wasTs: d.timestamp_seconds, reason: 'GT does not confirm this save' }));
  }

  // 3. CROSSES — insert GT crosses (except those already handled by save→cross moves)
  {
    const insertedCrossTs = new Set(plan.insert.filter(p => p.table === 'cross_events').map(p => p.row.timestamp_seconds));
    const remainingGtCrosses = ourCrosses.filter(c => !insertedCrossTs.has(c.timestamp_seconds));
    const { pairs, unmatchedGt, unmatchedDb } = pairByTimestamp(remainingGtCrosses, dbCrosses);
    pairs.forEach(([g, d]) => {
      const newRow = buildCrossRow({ gt: g, ctx, dbRow: d });
      plan.update.push({ table: 'cross_events', id: d.id, patch: newRow, reason: 'field precision from GT' });
    });
    unmatchedGt.forEach(g => plan.insert.push({ table: 'cross_events', row: buildCrossRow({ gt: g, ctx }), reason: 'GT-only cross' }));
    if (!KEEP_UNMATCHED && ourCrosses.length > 0) unmatchedDb.filter(d => d.keeper_team !== 'opp').forEach(d => plan.delete.push({ table: 'cross_events', id: d.id, wasTs: d.timestamp_seconds, reason: 'GT does not confirm this cross' }));
    summary.crosses = { gt: ourCrosses.length, db: dbCrosses.length, addFromGt: unmatchedGt.length + plan.insert.filter(p => p.table === 'cross_events' && p.reason.startsWith('reclassified')).length, dropFromDb: unmatchedDb.length };
  }

  // 4. DISTRIBUTION
  {
    const { pairs, unmatchedGt, unmatchedDb } = pairByTimestamp(ourDists, dbDists);
    pairs.forEach(([g, d]) => {
      const newRow = buildDistRow({ gt: g, ctx, dbRow: d });
      plan.update.push({ table: 'distribution_events', id: d.id, patch: newRow, reason: 'field precision from GT' });
    });
    unmatchedGt.forEach(g => plan.insert.push({ table: 'distribution_events', row: buildDistRow({ gt: g, ctx }), reason: 'GT-only distribution' }));
    if (!KEEP_UNMATCHED && ourDists.length > 0) unmatchedDb.filter(d => d.keeper_team !== 'opp').forEach(d => plan.delete.push({ table: 'distribution_events', id: d.id, wasTs: d.timestamp_seconds, reason: 'GT does not confirm this distribution' }));
    summary.distribution = { gt: ourDists.length, db: dbDists.length, addFromGt: unmatchedGt.length, dropFromDb: unmatchedDb.length };
  }

  // 5. SWEEPER
  {
    const { pairs, unmatchedGt, unmatchedDb } = pairByTimestamp(ourSweeper, dbSweeper);
    pairs.forEach(([g, d]) => {
      const newRow = buildSweeperRow({ gt: g, ctx, dbRow: d });
      plan.update.push({ table: 'sweeper_events', id: d.id, patch: newRow, reason: 'field precision from GT' });
    });
    unmatchedGt.forEach(g => plan.insert.push({ table: 'sweeper_events', row: buildSweeperRow({ gt: g, ctx }), reason: 'GT-only sweeper' }));
    if (!KEEP_UNMATCHED && ourSweeper.length > 0) unmatchedDb.filter(d => d.keeper_team !== 'opp').forEach(d => plan.delete.push({ table: 'sweeper_events', id: d.id, wasTs: d.timestamp_seconds, reason: 'GT does not confirm this sweeper action' }));
    summary.sweeper = { gt: ourSweeper.length, db: dbSweeper.length, addFromGt: unmatchedGt.length, dropFromDb: unmatchedDb.length };
  }

  // 6. 1V1
  {
    const { pairs, unmatchedGt, unmatchedDb } = pairByTimestamp(ourOneV1, dbOneV1);
    pairs.forEach(([g, d]) => {
      const newRow = buildOneV1Row({ gt: g, ctx, dbRow: d });
      plan.update.push({ table: 'one_v_one_events', id: d.id, patch: newRow, reason: 'field precision from GT' });
    });
    unmatchedGt.forEach(g => plan.insert.push({ table: 'one_v_one_events', row: buildOneV1Row({ gt: g, ctx }), reason: 'GT-only 1v1' }));
    if (!KEEP_UNMATCHED && ourOneV1.length > 0) unmatchedDb.filter(d => d.keeper_team !== 'opp').forEach(d => plan.delete.push({ table: 'one_v_one_events', id: d.id, wasTs: d.timestamp_seconds, reason: 'GT does not confirm this 1v1' }));
    summary.oneV1 = { gt: ourOneV1.length, db: dbOneV1.length, addFromGt: unmatchedGt.length, dropFromDb: unmatchedDb.length };
  }

  // ── Print plan ─────────────────────────────────────────────────────────────
  log(`\nSUMMARY (GT / DB — additions from GT, drops from DB):`);
  for (const [k, s] of Object.entries(summary)) {
    log(`  ${k.padEnd(14)}  gt=${String(s.gt).padStart(3)}  db=${String(s.db).padStart(3)}  add=${s.addFromGt || 0}  drop=${s.dropFromDb || 0}${s.reclassifiedToCross ? `  saves→cross=${s.reclassifiedToCross}` : ''}`);
  }
  log(`\nPLAN: ${plan.insert.length} inserts, ${plan.update.length} updates, ${plan.delete.length} deletes`);
  const clipsMissing = plan.insert.filter(p => !p.row.clip_storage_path).length;
  if (clipsMissing) log(`  ↳ ${clipsMissing} inserts have no clip_storage_path — run worker.backfill_clips_from_events after apply`);

  if (VERBOSE) {
    log('\nDETAIL:');
    plan.insert.forEach(p => log(`  INSERT ${p.table.padEnd(20)} ts=${p.row.timestamp_seconds} — ${p.reason}`));
    plan.update.forEach(p => log(`  UPDATE ${p.table.padEnd(20)} id=${p.id.slice(0,8)} — ${p.reason}`));
    plan.delete.forEach(p => log(`  DELETE ${p.table.padEnd(20)} id=${p.id.slice(0,8)} ts=${p.wasTs} — ${p.reason}`));
  }

  if (!APPLY) {
    log(`\n(dry-run — pass --apply to write)`);
    return { slug, matched: true, plan, summary, applied: false };
  }

  // ── Apply ──────────────────────────────────────────────────────────────────
  log(`\nAPPLYING…`);
  const errors = [];
  for (const p of plan.delete) {
    const { error } = await sb.from(p.table).delete().eq('id', p.id);
    if (error) errors.push(`delete ${p.table} ${p.id}: ${error.message}`);
  }
  for (const p of plan.update) {
    const { error } = await sb.from(p.table).update(p.patch).eq('id', p.id);
    if (error) errors.push(`update ${p.table} ${p.id}: ${error.message}`);
  }
  for (const p of plan.insert) {
    const { error } = await sb.from(p.table).insert(p.row);
    if (error) errors.push(`insert ${p.table} ts=${p.row.timestamp_seconds}: ${error.message}`);
  }

  // Re-derive aggregate columns on matches from the new event totals.
  await recomputeMatchAggregates(matchId);

  if (errors.length) {
    log(`\n⚠ APPLY ERRORS (${errors.length}):`);
    errors.forEach(e => log(`    ${e}`));
  } else {
    log(`\n✓ APPLIED. ${plan.insert.length} inserts, ${plan.update.length} updates, ${plan.delete.length} deletes.`);
  }
  if (clipsMissing) log(`\n  Next: python -m modal run worker/app.py::backfill_clips_from_events --match-id ${matchId}`);
  return { slug, matched: true, plan, summary, applied: true, errors, matchId, clipsMissing };
}

// After reconciliation, recompute matches.goals_conceded / saves / etc. from
// event counts so the aggregate columns stay in sync with the events. Dashboard
// prefers events over aggregates when both exist, but pitchside legacy code
// and other consumers may still read the columns.
async function recomputeMatchAggregates(matchId) {
  const [gcRes, seRes] = await Promise.all([
    sb.from('goals_conceded').select('id, keeper_id').eq('match_id', matchId),
    sb.from('shot_events').select('id, on_target, is_goal').eq('match_id', matchId),
  ]);
  const gc = gcRes.data || [];
  const shots = seRes.data || [];
  const goals_conceded = gc.length;
  const saves = shots.filter(s => !s.is_goal && s.on_target === 'yes').length;
  const shots_on_target = saves + goals_conceded;
  const save_percentage = shots_on_target > 0 ? saves / shots_on_target : 0;
  await sb.from('matches').update({ goals_conceded, saves, shots_on_target, save_percentage }).eq('id', matchId);
}

// ── Entry ────────────────────────────────────────────────────────────────────
async function main() {
  let gtFiles = [];
  if (ALL) {
    gtFiles = fs.readdirSync(GT_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_')).map(f => path.join(GT_DIR, f));
  } else {
    const slug = positional[0];
    if (!slug) {
      console.error('Usage: node scripts/apply-gt-to-db.mjs <match-slug> [--apply] [--keep-unmatched] [--verbose]');
      console.error('   or: node scripts/apply-gt-to-db.mjs --all [--apply]');
      process.exit(1);
    }
    const candidate = path.join(GT_DIR, slug.endsWith('.json') ? slug : `${slug}.json`);
    if (!fs.existsSync(candidate)) { console.error(`GT file not found: ${candidate}`); process.exit(1); }
    gtFiles = [candidate];
  }

  const results = [];
  for (const f of gtFiles) {
    try {
      const r = await reconcileMatch(f);
      results.push(r);
    } catch (e) {
      console.error(`\n✗ ${path.basename(f)} failed: ${e.message}`);
      if (VERBOSE) console.error(e.stack);
      results.push({ slug: path.basename(f), error: e.message });
    }
  }

  log('\n═════════════════════════════════════════════════════════════════════');
  log(`DONE. ${results.length} match(es) processed.`);
  const applied = results.filter(r => r.applied);
  if (applied.length) {
    log(`Clip backfill needed on ${applied.filter(r => r.clipsMissing).length} match(es):`);
    applied.filter(r => r.clipsMissing).forEach(r => log(`  match_id=${r.matchId}   (${r.clipsMissing} missing clips)`));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
