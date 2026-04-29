/**
 * Load a Gemini-tagged match into Supabase.
 *
 * Reads the JSON produced by scripts/test-gemini-match.js, translates each
 * goal into the pitchside vocabulary, and inserts one `matches` row plus
 * N `goals_conceded` rows via the service-role key.
 *
 * Usage:
 *   node scripts/load-gemini-match.js \
 *     --result scripts/results/match-<key>-<ts>.json \
 *     --coach-id <uuid> --keeper-id <uuid> --club-id <uuid> \
 *     --match-date 2026-04-25 --opponent "OFC 2016" --venue home \
 *     --my-team-color black --opponent-color "light blue" \
 *     --session match
 *
 * Optional:
 *   --dry-run    Print rows without inserting.
 *   --notes "extra context"   Prepended to the match notes.
 *   --manual-score "4-1"      Override Gemini's per-goal classification. Goals_for/against
 *                             are taken from this flag; concession rows are generated as N
 *                             null-field rows the coach can fill in later via the dashboard.
 *                             Use this when Gemini's timestamps or counts are clearly wrong
 *                             (no scoreboard, drift past video duration, etc.) but you still
 *                             want the match in the dashboard with the correct top-line score.
 *
 * Mapping rules (pragmatic — partial fields are OK, rich text is preserved in notes):
 *   goal_zone height:  top->High, middle->Mid, low->Low, unclear->null (whole zone null)
 *   goal_zone side:    centre->C, otherwise null (Gemini's near/far post is shot-origin-relative,
 *                      not GK-relative — without a clean attacker-side signal we don't guess)
 *   goal_source:       corner->Corner, penalty->Penalty, else Open Play
 *   shot_type:         header->Header, deflection->Deflection, else Foot (no Own Goal in schema)
 *   half:              1 if timestamp_seconds < video_midpoint, else 2 (heuristic only)
 *   shot_origin, gk_positioning, goal_rank: left null — Gemini cannot infer reliably.
 *
 * The full per-goal Gemini description is concatenated into matches.notes so
 * nothing is lost when the coach reviews later.
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    out[key] = val;
  }
  return out;
}

function mapHeight(h) {
  if (!h) return null;
  const v = String(h).toLowerCase();
  if (v.startsWith('top')) return 'High';
  if (v.startsWith('mid')) return 'Mid';
  if (v.startsWith('low')) return 'Low';
  return null;
}

function mapSide(s) {
  if (!s) return null;
  const v = String(s).toLowerCase();
  if (v === 'centre' || v === 'center') return 'C';
  // near_post / far_post / unclear → null (we don't have the GK-relative side reliably)
  return null;
}

function mapZone(g) {
  const h = mapHeight(g.goal_placement_height);
  const s = mapSide(g.goal_placement_side);
  if (!h || !s) return null;
  return `${h} ${s}`;
}

function mapSource(attack_type) {
  const v = String(attack_type || '').toLowerCase();
  if (v === 'corner') return 'Corner';
  if (v === 'penalty') return 'Penalty';
  return 'Open Play';
}

function mapShotType(shot_type) {
  const v = String(shot_type || '').toLowerCase();
  if (v.includes('header')) return 'Header';
  if (v.includes('deflection')) return 'Deflection';
  return 'Foot';
}

function deriveHalf(ts, allTs) {
  if (allTs.length === 0) return null;
  const max = Math.max(...allTs);
  const mid = max / 2;
  return ts < mid ? 1 : 2;
}

function fmtTs(s) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function buildNotes({ resultJson, args, caveats }) {
  const lines = [];
  if (args.notes) lines.push(args.notes, '');
  lines.push('Auto-tagged from Gemini video analysis (' + (resultJson.modelUsed || 'gemini') + ').');
  lines.push('Source: ' + (resultJson.key || 'video'));
  if (caveats && caveats.length) {
    lines.push('');
    lines.push('CAVEATS:');
    caveats.forEach(c => lines.push('  - ' + c));
  }
  lines.push('');
  resultJson.parsed.goals.forEach((g, i) => {
    lines.push(`Goal ${i + 1}  video ${fmtTs(g.timestamp_seconds)}  match clock ${g.match_clock}  conf ${g.confidence}`);
    lines.push(`  ${g.scoring_team} vs ${g.conceding_team}  scoreboard ${g.scoreboard_before} -> ${g.scoreboard_after}`);
    lines.push(`  attack: ${g.attack_type} | shot: ${g.shot_type} from ${g.shot_location}`);
    lines.push(`  placement: ${g.goal_placement_height} / ${g.goal_placement_side}`);
    lines.push(`  buildup: ${g.buildup}`);
    lines.push(`  GK: ${g.gk_observations}`);
    lines.push('');
  });
  return lines.join('\n');
}

async function postgrest(table, rows, args) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`POST ${table} failed (${res.status}): ${txt}`);
  }
  return res.json();
}

async function main() {
  const args = parseArgs(process.argv);
  const required = ['result', 'coach-id', 'keeper-id', 'club-id', 'match-date', 'opponent', 'venue', 'my-team-color', 'opponent-color'];
  const missing = required.filter(k => !args[k]);
  if (missing.length) {
    console.error('Missing flags: ' + missing.map(k => '--' + k).join(', '));
    process.exit(1);
  }

  const resultPath = path.resolve(args.result);
  const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  const goals = result.parsed?.goals || [];
  if (!goals.length) {
    console.error('No goals in result file. Aborting.');
    process.exit(1);
  }

  const myColor = String(args['my-team-color']).toLowerCase().trim();
  const oppColor = String(args['opponent-color']).toLowerCase().trim();
  const matches = (g, color) => String(g || '').toLowerCase().includes(color);

  const caveats = [];
  let goalsFor = 0, goalsAgainst = 0;
  let concessions = [];
  const allTs = goals.map(g => g.timestamp_seconds || 0);

  if (args['manual-score']) {
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(String(args['manual-score']).trim());
    if (!m) {
      console.error('--manual-score must be like "4-1" (goals_for-goals_against)');
      process.exit(1);
    }
    goalsFor = parseInt(m[1], 10);
    goalsAgainst = parseInt(m[2], 10);
    concessions = Array.from({ length: goalsAgainst }, () => ({})); // null-field rows
    caveats.push(`Score set manually to ${goalsFor}-${goalsAgainst} (Gemini classification was unusable — see below).`);
    caveats.push(`Gemini detected ${goals.length} candidate goal events; per-goal details are NOT loaded into goals_conceded for this match. Concession rows are blank — fill via the dashboard if you want per-goal detail.`);
  } else {
    // Auto mode: trust Gemini's per-goal scoring_team
    for (const g of goals) {
      const scorer = String(g.scoring_team || '').toLowerCase();
      const myScored = matches(scorer, myColor);
      const oppScored = matches(scorer, oppColor);
      if (myScored && !oppScored) {
        goalsFor++;
      } else if (oppScored && !myScored) {
        goalsAgainst++;
        concessions.push(g);
      } else {
        console.warn(`! ambiguous scoring_team "${g.scoring_team}" for goal at ${fmtTs(g.timestamp_seconds)} — skipping`);
      }
    }
  }

  const matchId = crypto.randomUUID();
  const result_str = goalsFor > goalsAgainst ? 'Win' : goalsFor < goalsAgainst ? 'Loss' : 'Draw';

  const matchRow = {
    id: matchId,
    coach_id: args['coach-id'],
    keeper_id: args['keeper-id'],
    club_id: args['club-id'],
    logged_by: args['coach-id'],
    logged_by_name: 'Gemini auto-tag',
    session_type: args.session || 'match',
    opponent: args.opponent,
    venue: String(args.venue).toLowerCase(),
    match_date: args['match-date'],
    goals_for: goalsFor,
    goals_against: goalsAgainst,
    result: result_str,
    goals_conceded: goalsAgainst,
    notes: buildNotes({ resultJson: result, args, caveats }),
  };

  const goalRows = concessions.map(g => ({
    match_id: matchId,
    coach_id: args['coach-id'],
    goal_zone: g.goal_placement_height ? mapZone(g) : null,
    shot_origin: null,
    goal_source: g.attack_type ? mapSource(g.attack_type) : null,
    goal_rank: null,
    shot_type: g.shot_type ? mapShotType(g.shot_type) : null,
    gk_positioning: null,
    half: g.timestamp_seconds ? deriveHalf(g.timestamp_seconds, allTs) : null,
  }));

  console.log('=== match row ===');
  console.log(JSON.stringify(matchRow, null, 2));
  console.log('\n=== goals_conceded rows (' + goalRows.length + ') ===');
  goalRows.forEach((r, i) => console.log(`#${i + 1}`, JSON.stringify(r)));
  console.log(`\nResult: ${myColor} ${goalsFor} - ${goalsAgainst} ${oppColor}  (${result_str})`);

  if (args['dry-run']) {
    console.log('\n--dry-run set, not inserting.');
    return;
  }

  console.log('\nInserting...');
  await postgrest('matches', [matchRow], args);
  console.log('  matches: 1 row');
  if (goalRows.length) {
    await postgrest('goals_conceded', goalRows, args);
    console.log('  goals_conceded: ' + goalRows.length + ' rows');
  }
  console.log(`\nDone. match_id=${matchId}`);
}

main().catch(e => {
  console.error('Failed:', e.message || e);
  process.exit(1);
});
