/**
 * Convert a filled-in ground-truth Excel workbook into a JSON file the eval
 * harness understands.
 *
 * Usage:
 *   node scripts/excel-to-ground-truth.js scripts/ground-truth/<match-name>.xlsx
 *
 * Output: scripts/ground-truth/<match-name>.json (next to the .xlsx)
 *
 * Reads the Metadata + per-event sheets, normalises values back into the
 * canonical lowercase / DB-vocab format, and emits a JSON shape compatible
 * with scripts/eval-match.js.
 */

const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

// ─── Mappings: Excel UI labels → DB / canonical strings ──────────────────────

const SCORING_TEAM = (v, ctx) => {
  if (!v) return null;
  const s = String(v).toLowerCase();
  if (s === 'us') return ctx.my_team_color;
  if (s === 'opponent' || s === 'them') return ctx.opponent_color;
  return s; // already a colour
};

const ATTACK_TYPE = {
  'open play': 'open_play', 'counter attack': 'counter_attack',
  'corner': 'corner', 'free kick': 'free_kick', 'penalty': 'penalty',
  'throw-in': 'throw_in', 'set piece other': 'set_piece_other', 'other': 'other',
};

const SHOT_LOCATION_TO_ORIGIN = {
  '6-yard box': '6yard',
  'left channel': 'boxL', 'central box': 'boxC', 'right channel': 'boxR',
  'wide left': 'outL', 'central distance': 'outC', 'wide right': 'outR',
  'corner left': 'cornerL', 'corner right': 'cornerR',
};

const PLACEMENT_HEIGHT = { 'top': 'top', 'mid': 'mid', 'low': 'low', 'unclear': 'unclear' };

// Saves: side is from GK perspective in the form. Eval format uses left_third / centre / right_third.
const PLACEMENT_SIDE_GK = {
  'gk left': 'left_third', 'centre': 'centre', 'gk right': 'right_third', 'unclear': 'unclear',
};
// Goals: Excel form lets the user pick GK perspective for placement_side too. Same map.
const PLACEMENT_SIDE_GOALS = PLACEMENT_SIDE_GK;

const ON_TARGET = { 'yes': 'yes', 'no': 'no', 'unclear': 'unclear' };
const YN_BOOL = { 'yes': true, 'no': false };

const GK_ACTION = {
  'catch': 'Catch', 'block': 'Block', 'parry': 'Parry', 'deflect': 'Deflect',
  'punch': 'Punch', 'smother': 'Smother', 'starfish': 'Starfish', 'k-barrier': 'K-Barrier',
  'missed': 'Missed', 'goal': 'Goal', 'unclear': 'unclear',
};
const GK_VISIBLE = { 'yes': 'yes', 'partial': 'partial', 'no': 'no' };
const OUTCOME = {
  'held': 'held', 'rebound (safe)': 'rebound_safe', 'rebound (dangerous)': 'rebound_dangerous',
  'corner': 'corner', 'out of play': 'out_of_play', 'goal': 'goal',
  // distribution / sweeper have different outcome words handled inline
};
const BODY_ZONE = { 'a': 'A', 'b': 'B', 'c': 'C', 'unclear': 'unclear' };

const DIST_TYPE = {
  'gk short kick': 'gk_short', 'gk long kick': 'gk_long',
  'throw': 'throw', 'pass': 'pass', 'drop-kick': 'drop_kick',
};
const DIST_TRIGGER = {
  'goal kick': 'goal_kick', 'after save': 'after_save', 'backpass': 'backpass',
  'loose ball in box': 'loose_ball', 'throw-in to gk': 'throw_in_to_gk',
  'free kick to gk': 'free_kick_to_gk',
};
const DIST_PASS_SELECTION = {
  'short to defender': 'short_to_defender', 'sideways across back': 'sideways_across_back',
  'long to forward': 'long_to_forward', 'switch wide': 'switch_wide',
  'backwards under pressure': 'backwards_under_pressure',
  'clearance under pressure': 'clearance_under_pressure',
  'drilled into channel': 'drilled_into_channel',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tsToSeconds(s) {
  if (s == null) return null;
  if (typeof s === 'number') return Math.round(s);
  if (s instanceof Date) {
    // Excel formatted this as a time-of-day Date but the user typed MM:SS.
    // We tried to catch this in readCell via cell.text — if we got here the
    // formatter wasn't applied. Best-effort: read displayed local time and
    // treat hours-of-day as MM, minutes-of-day as SS.
    return s.getHours() * 60 + s.getMinutes();
  }
  const str = String(s).trim();
  if (!str) return null;
  // Accept "MM:SS" or "H:MM:SS" (treats first segment as minutes if 2 parts,
  // hours+minutes+seconds if 3 parts which Excel sometimes formats time as)
  const m3 = /^(\d+):(\d{1,2}):(\d{1,2})$/.exec(str);
  if (m3) return parseInt(m3[1], 10) * 60 + parseInt(m3[2], 10);  // H:MM:SS where H = MM, MM = SS, ignore SS-of-cell
  const m2 = /^(\d+):(\d{1,2})$/.exec(str);
  if (m2) return parseInt(m2[1], 10) * 60 + parseInt(m2[2], 10);
  const n = parseFloat(str);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function readCell(cell) {
  if (cell == null) return null;
  let v = cell.value;
  if (v == null) return null;
  // Excel may auto-convert MM:SS strings to time-of-day Date objects. The
  // safest extraction is the cell's DISPLAYED TEXT — exceljs's cell.text
  // honours the cell's number format and gives us the same string the user
  // sees in Excel ("16:44"). Use that for time/date cells; preserve the Date
  // as a fallback for explicit date columns (Metadata.Date).
  if (v instanceof Date) {
    const displayed = (cell.text || '').trim();
    // If the displayed text looks like MM:SS or HH:MM, return it as a string
    // for downstream parsing. Otherwise return the Date for date-column logic.
    if (/^\d+:\d{1,2}(:\d{1,2})?$/.test(displayed)) return displayed;
    return v;
  }
  // ExcelJS gives objects for rich text / formulas — try to flatten
  if (typeof v === 'object') {
    if (v.text) v = v.text;
    else if (v.result !== undefined) v = v.result;
    else if (Array.isArray(v.richText)) v = v.richText.map(t => t.text).join('');
    else v = String(v);
  }
  if (typeof v === 'string') v = v.trim();
  return v === '' ? null : v;
}

function dateToISO(d) {
  if (!(d instanceof Date)) return d == null ? null : String(d);
  // Use UTC components so timezone-shifted Excel dates round-trip cleanly.
  // Excel stores dates as midnight, which can show as "previous day 16:00" in
  // PST. We strip time and emit YYYY-MM-DD using UTC.
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function lc(v) { return v == null ? null : String(v).toLowerCase().trim(); }

function map(table, key) {
  if (key == null) return null;
  return table[lc(key)] ?? null;
}

function parseEventSheet(sheet, columnDefs, opts = {}) {
  const events = [];
  const dataStart = opts.dataStartRow || 2; // Goals/Saves/etc — header at row 1, sample at 2
  const lastRow = sheet.actualRowCount;
  for (let r = dataStart; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    const obj = {};
    let hasAny = false;
    columnDefs.forEach((col, i) => {
      const v = readCell(row.getCell(i + 1));
      obj[col.key] = v;
      if (v != null && v !== '') hasAny = true;
    });
    if (hasAny) events.push(obj);
  }
  return events;
}

// ─── Per-sheet readers ───────────────────────────────────────────────────────

function readMetadata(sheet) {
  const out = {};
  for (let r = 2; r <= sheet.actualRowCount; r++) {
    const label = lc(readCell(sheet.getCell(`A${r}`)));
    const value = readCell(sheet.getCell(`B${r}`));
    if (!label) continue;
    out[label] = value;
  }
  // Normalise expected keys
  return {
    match_name:       out['match name'] || null,
    match_date:       dateToISO(out['date']),
    opponent:         out['opponent'] || null,
    venue:            lc(out['venue']) || null,
    session_type:     lc(out['session type']) || null,
    my_team_color:    lc(out['my team color']) || null,
    opponent_color:   lc(out['opponent color']) || null,
    my_keeper_color:  lc(out['my gk color']) || null,
    age_group:        out['age group'] || null,
    duration_str:     out['video duration (mm:ss)'] || null,
    duration_seconds: tsToSeconds(out['video duration (mm:ss)']),
    final_score_us:   Number(out['final score — us']) || 0,
    final_score_them: Number(out['final score — them']) || 0,
    video_job_id:     out['video_job_id'] || null,
  };
}

function readGoals(sheet, ctx) {
  const cols = [
    { key: 'time' }, { key: 'half' }, { key: 'scoring_team' }, { key: 'attack_type' },
    { key: 'shot_type' }, { key: 'shot_location' }, { key: 'placement_height' },
    { key: 'placement_side' }, { key: 'play_description' }, { key: 'gk_observations' },
    { key: 'notes' },
  ];
  return parseEventSheet(sheet, cols).map(e => ({
    timestamp: e.time,
    timestamp_seconds: tsToSeconds(e.time),
    half: e.half ? parseInt(e.half, 10) : null,
    scoring_team: SCORING_TEAM(e.scoring_team, ctx),
    attack_type: map(ATTACK_TYPE, e.attack_type),
    shot_type: e.shot_type ? lc(e.shot_type).replace(/\s+/g, '_').replace(/-/g, '_') : null,
    shot_location: map(SHOT_LOCATION_TO_ORIGIN, e.shot_location),
    goal_placement_height: map(PLACEMENT_HEIGHT, e.placement_height),
    goal_placement_side: map(PLACEMENT_SIDE_GOALS, e.placement_side),
    play_description: e.play_description || null,
    gk_observations: e.gk_observations || null,
    note: e.notes || null,
  }));
}

function readSaves(sheet) {
  const cols = [
    { key: 'time' }, { key: 'half' }, { key: 'shot_origin' }, { key: 'shot_type' },
    { key: 'on_target' }, { key: 'gk_action' }, { key: 'gk_visible' }, { key: 'outcome' },
    { key: 'body_zone' }, { key: 'placement_height' }, { key: 'placement_side' },
    { key: 'play_description' }, { key: 'gk_observations' }, { key: 'notes' },
  ];
  return parseEventSheet(sheet, cols).map(e => ({
    timestamp: e.time,
    timestamp_seconds: tsToSeconds(e.time),
    half: e.half ? parseInt(e.half, 10) : null,
    shot_origin: map(SHOT_LOCATION_TO_ORIGIN, e.shot_origin),
    shot_type: e.shot_type ? String(e.shot_type) : null,  // Foot / Header / Deflection — preserve case
    on_target: map(ON_TARGET, e.on_target),
    gk_action: map(GK_ACTION, e.gk_action),
    gk_visible: map(GK_VISIBLE, e.gk_visible),
    outcome: map(OUTCOME, e.outcome),
    body_distance_zone: map(BODY_ZONE, e.body_zone),
    goal_placement_height: map(PLACEMENT_HEIGHT, e.placement_height),
    goal_placement_side: map(PLACEMENT_SIDE_GK, e.placement_side),
    play_description: e.play_description || null,
    gk_observations: e.gk_observations || null,
    note: e.notes || null,
  }));
}

function readDistribution(sheet) {
  // Distribution sheet has a summary block at the top, then event rows.
  // We need to find where the event header row is — search for a row whose
  // first cell is "Time (MM:SS)".
  let headerRow = null;
  for (let r = 1; r <= sheet.actualRowCount; r++) {
    const a = readCell(sheet.getCell(`A${r}`));
    if (a && lc(a).startsWith('time (mm:ss)')) { headerRow = r; break; }
  }

  // Read the summary block (rows 1..headerRow-2 contain the totals)
  const summary = { totals: {} };
  if (headerRow) {
    for (let r = 1; r < headerRow - 1; r++) {
      const label = readCell(sheet.getCell(`A${r}`));
      const value = readCell(sheet.getCell(`B${r}`));
      if (!label) continue;
      const lab = lc(label);
      // Map labels like "GK Short — attempts" → key
      const map = {
        'gk short — attempts': 'gk_short_att', 'gk short — successful': 'gk_short_suc',
        'gk long — attempts': 'gk_long_att', 'gk long — successful': 'gk_long_suc',
        'throws — attempts': 'throws_att', 'throws — successful': 'throws_suc',
        'passes — attempts': 'passes_att', 'passes — successful': 'passes_suc',
        'under pressure — attempts': 'pressure_att', 'under pressure — successful': 'pressure_suc',
      };
      const k = map[lab];
      if (k && value !== null) {
        const n = Number(value);
        if (Number.isFinite(n)) summary.totals[k] = n;
      }
    }
  }

  if (!headerRow) return { events: [], summary };

  const cols = [
    { key: 'time' }, { key: 'half' }, { key: 'trigger' }, { key: 'type' },
    { key: 'successful' }, { key: 'under_pressure' }, { key: 'pass_selection' },
    { key: 'direction' }, { key: 'receiver' }, { key: 'first_touch' }, { key: 'notes' },
  ];
  const events = parseEventSheet(sheet, cols, { dataStartRow: headerRow + 1 }).map(e => ({
    timestamp: e.time,
    timestamp_seconds: tsToSeconds(e.time),
    half: e.half ? parseInt(e.half, 10) : null,
    trigger: map(DIST_TRIGGER, e.trigger),
    type: map(DIST_TYPE, e.type),
    successful: e.successful ? !!YN_BOOL[lc(e.successful)] : null,
    under_pressure: e.under_pressure ? !!YN_BOOL[lc(e.under_pressure)] : null,
    pass_selection: map(DIST_PASS_SELECTION, e.pass_selection),
    direction: e.direction ? lc(e.direction) : null,
    receiver: e.receiver ? lc(e.receiver).replace(/[()]/g, '').replace(/\s+/g, '_') : null,
    first_touch: e.first_touch ? lc(e.first_touch).replace(/\s+/g, '_') : null,
    note: e.notes || null,
  }));

  return { events, summary };
}

function readCrosses(sheet) {
  const cols = [
    { key: 'time' }, { key: 'half' }, { key: 'side' }, { key: 'cross_type' },
    { key: 'destination' }, { key: 'gk_action' }, { key: 'gk_position' },
    { key: 'outcome' }, { key: 'notes' },
  ];
  return parseEventSheet(sheet, cols).map(e => ({
    timestamp: e.time,
    timestamp_seconds: tsToSeconds(e.time),
    half: e.half ? parseInt(e.half, 10) : null,
    side: e.side ? lc(e.side).replace(/\s+/g, '_') : null,
    cross_type: e.cross_type ? lc(e.cross_type) : null,
    destination: e.destination ? lc(e.destination).replace(/\s+/g, '_') : null,
    gk_action: e.gk_action ? lc(e.gk_action).replace(/\//g, '_').replace(/\s+/g, '_') : null,
    gk_position: e.gk_position ? lc(e.gk_position).replace(/\s+/g, '_') : null,
    outcome: e.outcome ? lc(e.outcome).replace(/\s+/g, '_') : null,
    note: e.notes || null,
  }));
}

function readSweeper(sheet) {
  const cols = [
    { key: 'time' }, { key: 'half' }, { key: 'action' }, { key: 'distance' },
    { key: 'successful' }, { key: 'pressure' }, { key: 'outcome' }, { key: 'notes' },
  ];
  return parseEventSheet(sheet, cols).map(e => ({
    timestamp: e.time,
    timestamp_seconds: tsToSeconds(e.time),
    half: e.half ? parseInt(e.half, 10) : null,
    action: e.action ? lc(e.action) : null,
    distance: e.distance ? lc(e.distance).replace(/[–-]/g, '_').replace(/\s+/g, '_') : null,
    successful: e.successful ? !!YN_BOOL[lc(e.successful)] : null,
    pressure: e.pressure ? lc(e.pressure).replace(/\s+/g, '_').replace(/\+/g, '_plus') : null,
    outcome: e.outcome ? lc(e.outcome).replace(/\s+/g, '_') : null,
    note: e.notes || null,
  }));
}

function readOneVOnes(sheet) {
  const cols = [
    { key: 'time' }, { key: 'half' }, { key: 'event' }, { key: 'outcome' }, { key: 'notes' },
  ];
  return parseEventSheet(sheet, cols).map(e => ({
    timestamp: e.time,
    timestamp_seconds: tsToSeconds(e.time),
    half: e.half ? parseInt(e.half, 10) : null,
    event_type: e.event ? lc(e.event).replace(/\s+/g, '_').replace(/[()]/g, '') : null,
    outcome: e.outcome ? lc(e.outcome) : null,
    note: e.notes || null,
  }));
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const xlsxPath = process.argv[2];
  if (!xlsxPath) {
    console.error('Usage: node scripts/excel-to-ground-truth.js <path-to-xlsx>');
    process.exit(1);
  }
  const absPath = path.resolve(xlsxPath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(absPath);
  const get = (name) => wb.getWorksheet(name);

  if (!get('Metadata')) { console.error('No Metadata sheet found.'); process.exit(1); }

  const meta = readMetadata(get('Metadata'));
  const ctx = { my_team_color: meta.my_team_color, opponent_color: meta.opponent_color };

  const goals = get('Goals') ? readGoals(get('Goals'), ctx) : [];
  const saves = get('Saves') ? readSaves(get('Saves')) : [];
  const distribution = get('Distribution') ? readDistribution(get('Distribution')) : { events: [], summary: { totals: {} } };
  const crosses = get('Crosses') ? readCrosses(get('Crosses')) : [];
  const sweeper = get('Sweeper') ? readSweeper(get('Sweeper')) : [];
  const oneVOnes = get('1v1s') ? readOneVOnes(get('1v1s')) : [];

  const out = {
    match_name: meta.match_name,
    match_date: meta.match_date,
    opponent: meta.opponent,
    venue: meta.venue,
    session_type: meta.session_type,
    age_group: meta.age_group,
    my_team_color: meta.my_team_color,
    opponent_color: meta.opponent_color,
    my_keeper_color: meta.my_keeper_color,
    duration_seconds: meta.duration_seconds,
    final_score: { us: meta.final_score_us, them: meta.final_score_them },
    video_job_id: meta.video_job_id,
    events: {
      goals,
      saves,
      distribution: distribution.events,
      crosses,
      sweeper,
      one_v_ones: oneVOnes,
    },
    distribution_summary: distribution.summary,
    _generated_at: new Date().toISOString(),
    _source_xlsx: path.basename(absPath),
  };

  // Output: same name as input but .json
  const outPath = absPath.replace(/\.xlsx$/i, '.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  console.log(`Wrote ${path.relative(process.cwd(), outPath)}`);
  console.log(`Events tagged:`);
  console.log(`  Goals:        ${goals.length}`);
  console.log(`  Saves:        ${saves.length}`);
  console.log(`  Distribution: ${distribution.events.length} (+ totals: ${Object.keys(distribution.summary.totals).length})`);
  console.log(`  Crosses:      ${crosses.length}`);
  console.log(`  Sweeper:      ${sweeper.length}`);
  console.log(`  1v1s:         ${oneVOnes.length}`);
  if (!meta.video_job_id) {
    console.log(`\nReminder: fill in video_job_id in the Metadata sheet, then re-run, before using with eval-match.js`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
