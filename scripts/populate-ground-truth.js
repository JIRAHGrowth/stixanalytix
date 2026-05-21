/**
 * Populate a ground-truth .xlsx workbook with event data pulled from the
 * published Supabase tables (the post-review, coach-validated state).
 *
 * Use case: the coach reviewed and edited the analysis on /upload/[id]/review
 * but didn't independently tag the ground-truth workbook beforehand. The
 * published rows ARE the coach's accepted truth — so we extract them back
 * out and fill the workbook.
 *
 * Caveat: this is "post-review truth", not independent tagging. eval-match.js
 * precision against this is meaningful (false-positive deletions are captured);
 * recall is *only* reliable for events Gemini also detected (the coach may
 * have failed to add events Gemini missed entirely).
 *
 * Usage:
 *   node scripts/populate-ground-truth.js \
 *     --xlsx scripts/ground-truth/judah-2026-05-16-oufc.xlsx \
 *     --video-job-id <uuid>
 */

const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { createClient } = require('@supabase/supabase-js');

// Load .env.local if present so SUPABASE_* vars work without manual export.
try {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    });
  }
} catch {}

// ─── Inverse mappings: DB / canonical → Excel UI labels ──────────────────────

const ATTACK_TYPE_INV = {
  open_play: 'Open play', counter_attack: 'Counter attack', corner: 'Corner',
  free_kick: 'Free kick', penalty: 'Penalty', throw_in: 'Throw-in',
  set_piece_other: 'Set piece other', other: 'Other',
};
const SHOT_ORIGIN_INV = {
  '6yard': '6-Yard Box', boxL: 'Left Channel', boxC: 'Central Box', boxR: 'Right Channel',
  outL: 'Wide Left', outC: 'Central Distance', outR: 'Wide Right',
  cornerL: 'Corner Left', cornerR: 'Corner Right',
};
const PLACEMENT_HEIGHT_INV = { low: 'Low', mid: 'Mid', top: 'Top', unclear: 'Unclear' };
const PLACEMENT_SIDE_INV = {
  left_third: 'GK Left', centre: 'Centre', right_third: 'GK Right', unclear: 'Unclear',
};
const GK_ACTION_INV = {
  Catch: 'Catch', Block: 'Block', Parry: 'Parry', Deflect: 'Deflect', Punch: 'Punch',
  Smother: 'Smother', Starfish: 'Starfish', 'K-Barrier': 'K-Barrier', Missed: 'Missed',
  Goal: 'Goal', unclear: 'Unclear',
};
const ON_TARGET_INV = { yes: 'Yes', no: 'No', unclear: 'Unclear' };
const GK_VISIBLE_INV = { yes: 'Yes', partial: 'Partial', no: 'No' };
const OUTCOME_INV = {
  held: 'Held', rebound_safe: 'Rebound (safe)', rebound_dangerous: 'Rebound (dangerous)',
  corner: 'Corner', out_of_play: 'Out of play', goal: 'Goal',
};
const BODY_ZONE_INV = { A: 'A', B: 'B', C: 'C', unclear: 'Unclear' };
const DIST_TYPE_INV = {
  gk_short: 'GK short kick', gk_long: 'GK long kick', throw: 'Throw',
  pass: 'Pass', drop_kick: 'Drop-kick',
};
const DIST_TRIGGER_INV = {
  goal_kick: 'Goal kick', after_save: 'After save', backpass: 'Backpass',
  loose_ball: 'Loose ball in box', throw_in_to_gk: 'Throw-in to GK',
  free_kick_to_gk: 'Free kick to GK',
};
const DIST_PASS_SELECTION_INV = {
  short_to_defender: 'Short to defender', sideways_across_back: 'Sideways across back',
  long_to_forward: 'Long to forward', switch_wide: 'Switch wide',
  backwards_under_pressure: 'Backwards under pressure',
  clearance_under_pressure: 'Clearance under pressure',
  drilled_into_channel: 'Drilled into channel',
};
const SHOT_TYPE_TITLE = (s) => s == null ? null : s.split(/[\s_]+/).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

const inv = (table, v) => v == null ? null : (table[v] ?? null);
const titlecase = (s) => s == null ? null : s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const ynBool = (b) => b === true ? 'Yes' : b === false ? 'No' : null;
const secsToMMSS = (s) => {
  if (s == null) return null;
  const n = Math.round(Number(s));
  if (!Number.isFinite(n)) return null;
  const m = Math.floor(n / 60); const ss = n % 60;
  return `${m}:${String(ss).padStart(2, '0')}`;
};

// Parse goals_conceded.goal_zone strings like "Low R", "Top L", "Mid C".
function parseGoalZone(z) {
  if (!z) return { height: null, side: null };
  const s = String(z).trim();
  const m = /^(Top|Mid|Low|top|mid|low)\s*([LRC]?)$/.exec(s);
  if (!m) return { height: null, side: null };
  const height = { top: 'Top', mid: 'Mid', low: 'Low' }[m[1].toLowerCase()];
  const side = { L: 'GK Left', R: 'GK Right', C: 'Centre', '': null }[m[2]];
  return { height, side };
}

// ─── Args ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

// ─── Excel writers ───────────────────────────────────────────────────────────

function writeRow(sheet, rowIdx, values) {
  values.forEach((v, i) => {
    const cell = sheet.getCell(rowIdx, i + 1);
    cell.value = v == null ? null : v;
    // Force time-formatted columns to text so "16:44" doesn't get auto-cast.
    if (i === 0) cell.numFmt = '@';
  });
}

function findDistributionHeaderRow(sheet) {
  // ExcelJS's actualRowCount lies after read+write cycles — the header row
  // can sit beyond it. Scan a generous range instead.
  for (let r = 1; r <= 250; r++) {
    const v = sheet.getCell(`A${r}`).value;
    if (v && String(v).toLowerCase().startsWith('time (mm:ss)')) return r;
  }
  return null;
}

function populateGoals(sheet, goalsScored, goalsConceded, ctx) {
  // Column order from Goals sheet schema:
  // time, half, scoring_team, attack_type, shot_type, shot_location,
  // placement_height, placement_side, play_description, gk_observations, notes
  const rows = [];
  goalsScored.forEach(g => {
    rows.push({ ts: g.timestamp_seconds, row: [
      secsToMMSS(g.timestamp_seconds),
      g.half ? String(g.half) : null,
      'Us',
      inv(ATTACK_TYPE_INV, g.attack_type),
      null,                                         // shot_type not tracked on goals_scored
      null,                                         // shot_location not tracked on goals_scored
      null, null,
      g.shot_description || null,
      null,
      g.coach_notes || null,
    ]});
  });
  goalsConceded.forEach(g => {
    const zone = parseGoalZone(g.goal_zone);
    rows.push({ ts: g.timestamp_seconds, row: [
      secsToMMSS(g.timestamp_seconds),
      g.half ? String(g.half) : null,
      'Opponent',
      null,                                         // attack_type not in goals_conceded
      g.shot_type ? SHOT_TYPE_TITLE(g.shot_type) : null,
      inv(SHOT_ORIGIN_INV, g.shot_origin),
      zone.height,
      zone.side,
      g.shot_description || null,
      g.gk_observations || null,
      g.coach_notes || null,
    ]});
  });
  rows.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  rows.forEach((r, i) => writeRow(sheet, i + 2, r.row));
  return rows.length;
}

function populateSaves(sheet, shots) {
  // Column order:
  // time, half, shot_origin, shot_type, on_target, gk_action, gk_visible,
  // outcome, body_zone, placement_height, placement_side,
  // play_description, gk_observations, notes
  const sorted = [...shots].sort((a, b) => (a.timestamp_seconds ?? 0) - (b.timestamp_seconds ?? 0));
  sorted.forEach((s, i) => {
    const row = [
      secsToMMSS(s.timestamp_seconds),
      s.half ? String(s.half) : null,
      inv(SHOT_ORIGIN_INV, s.shot_origin),
      s.shot_type || null,                          // 'Foot' / 'Header' / 'Deflection' — already Title
      inv(ON_TARGET_INV, s.on_target),
      inv(GK_ACTION_INV, s.gk_action),
      inv(GK_VISIBLE_INV, s.gk_visible),
      inv(OUTCOME_INV, s.outcome),
      inv(BODY_ZONE_INV, s.body_distance_zone),
      inv(PLACEMENT_HEIGHT_INV, s.goal_placement_height),
      inv(PLACEMENT_SIDE_INV, s.goal_placement_side),
      s.shot_description || null,
      s.gk_observations || null,
      s.coach_notes || null,
    ];
    writeRow(sheet, i + 2, row);
  });
  return sorted.length;
}

function populateDistribution(sheet, events) {
  const headerRow = findDistributionHeaderRow(sheet);
  if (!headerRow) throw new Error('Distribution sheet: could not find "Time (MM:SS)" header row');
  // Column order:
  // time, half, trigger, type, successful, under_pressure, pass_selection,
  // direction, receiver, first_touch, notes
  const sorted = [...events].sort((a, b) => (a.timestamp_seconds ?? 0) - (b.timestamp_seconds ?? 0));
  sorted.forEach((d, i) => {
    const row = [
      secsToMMSS(d.timestamp_seconds),
      d.half ? String(d.half) : null,
      inv(DIST_TRIGGER_INV, d.trigger),
      inv(DIST_TYPE_INV, d.type),
      ynBool(d.successful),
      ynBool(d.under_pressure),
      inv(DIST_PASS_SELECTION_INV, d.pass_selection),
      d.direction ? titlecase(d.direction) : null,
      d.receiver ? titlecase(d.receiver) : null,
      d.first_touch ? titlecase(d.first_touch) : null,
      d.notes || null,
    ];
    writeRow(sheet, headerRow + 1 + i, row);
  });
  return sorted.length;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.xlsx || !args['video-job-id']) {
    console.error('Usage: node scripts/populate-ground-truth.js --xlsx <path> --video-job-id <uuid>');
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var.');
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: job, error: jobErr } = await supabase
    .from('video_jobs')
    .select('id, published_match_id, status, match_metadata')
    .eq('id', args['video-job-id'])
    .maybeSingle();
  if (jobErr || !job) { console.error('video_jobs lookup failed:', jobErr?.message || 'not found'); process.exit(1); }
  if (!job.published_match_id) { console.error('Job not yet published — no canonical data to pull.'); process.exit(1); }
  const matchId = job.published_match_id;

  const [gs, gc, se, de] = await Promise.all([
    supabase.from('goals_scored').select('timestamp_seconds, half, attack_type, shot_description, coach_notes').eq('match_id', matchId),
    supabase.from('goals_conceded').select('timestamp_seconds, half, shot_origin, shot_type, goal_zone, shot_description, gk_observations, coach_notes').eq('match_id', matchId),
    supabase.from('shot_events').select('timestamp_seconds, half, shot_origin, shot_type, on_target, gk_action, gk_visible, outcome, body_distance_zone, goal_placement_height, goal_placement_side, is_goal, shot_description, gk_observations, coach_notes').eq('match_id', matchId),
    supabase.from('distribution_events').select('timestamp_seconds, half, trigger, type, successful, under_pressure, pass_selection, direction, receiver, first_touch, notes').eq('match_id', matchId),
  ]);
  for (const r of [gs, gc, se, de]) {
    if (r.error) { console.error('Supabase error:', r.error.message); process.exit(1); }
  }
  // Saves sheet = shot_events that are NOT goals (goals live on Goals sheet)
  const saves = (se.data || []).filter(r => !r.is_goal);

  const xlsxPath = path.resolve(args.xlsx);
  if (!fs.existsSync(xlsxPath)) { console.error(`Not found: ${xlsxPath}`); process.exit(1); }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);

  const counts = {};
  const goals = wb.getWorksheet('Goals');
  if (goals) counts.goals = populateGoals(goals, gs.data || [], gc.data || []);
  const savesSheet = wb.getWorksheet('Saves');
  if (savesSheet) counts.saves = populateSaves(savesSheet, saves);
  const dist = wb.getWorksheet('Distribution');
  if (dist) counts.distribution = populateDistribution(dist, de.data || []);

  await wb.xlsx.writeFile(xlsxPath);
  console.log(`Wrote ${path.relative(process.cwd(), xlsxPath)}`);
  Object.entries(counts).forEach(([k, n]) => console.log(`  ${k}: ${n} rows`));
}

main().catch(e => { console.error(e); process.exit(1); });
