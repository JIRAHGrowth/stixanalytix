// Regenerate every clip on the 4 BC Soccer matches (Amalie + GK2 Unknown).
//
// Why this exists: the initial publish route indexed clip_storage_path off
// gemini_output using Math.round(timestamp_seconds) as the key. That's
// correct for Gemini-detected events whose timestamp survived coach review
// unchanged — but wrong for (a) coach-added events (NULL at insert time)
// and (b) coach-edited-timestamp events (may point at the wrong clip via
// rounded-timestamp collision). The Luca / BC Soccer review meeting on
// 2026-07-28 needs every event's clip to match the persisted event row,
// no exceptions.
//
// This script fires the MODAL_BACKFILL_CLIPS_TRIGGER_URL endpoint with
// force=true for each of Amalie's 4 published matches, which spawns the
// backfill_clips_from_events Modal function. That function reads DB event
// rows, slices a fresh clip at each row's timestamp using the row's UUID
// as a stable filename suffix, and writes the new clip_storage_path back
// on the row. UUID-suffixed clip keys are stable across re-runs and
// survive event reordering / index shifts.
//
// Usage:
//   node scripts/backfill-bc-soccer-clips.mjs           # verify + fire all 4
//   node scripts/backfill-bc-soccer-clips.mjs --dry     # just print state, don't fire
//   node scripts/backfill-bc-soccer-clips.mjs --match <uuid>   # single match
//
// Cost: each match downloads the source video + slices ~30-60 clips at
// 720p / ffmpeg veryfast. ~3-5 min of Modal compute per match, ~$0.10-0.30
// per match at current Modal rates. Total for all 4: ~15-20 min wall time
// (all fire concurrently since spawn is fire-and-forget) and ~$0.50-1.20.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(join(repoRoot, '.env.local'), 'utf8')
  .split('\n').filter((l) => l && !l.startsWith('#')).reduce((a, l) => {
    const eq = l.indexOf('='); if (eq === -1) return a;
    a[l.slice(0, eq).trim()] = l.slice(eq + 1).trim().replace(/^["']|["']$/g, ''); return a;
  }, {});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Keeper UUIDs — from reference_keeper_uuids memory (verified 2026-07-15).
const AMALIE_KEEPER_ID = 'b8fb9a0c-212f-4165-b9d8-bb64c6ea8548';
const GK2_KEEPER_ID    = 'e3ac6897-9075-4477-8b51-d118b8135110';

// Match UUIDs — Amalie's 4 published BC Soccer matches. Hard-coded (rather
// than queried) so a keeper.active flip on one of them doesn't silently
// change scope. Cross-checked below via a query that surfaces any extras.
const BC_MATCHES = [
  { id: 'e4171541-e23f-4837-b5aa-b86097d01e32', label: 'Fusion 2008 (2025-11-20)   — subbed 62′ → GK2 H2' },
  { id: '9a61bfa2-c289-479e-b1c2-87d6ffc77526', label: 'U16 Rise (2025-11-06)      — solo Amalie, 3-0 win' },
  { id: 'cb83dd4b-d3a6-4e53-8edb-71ae3244f72f', label: 'CMF 2008 (2026-02-24)      — subbed 84′ → GK2 H2 (friendly)' },
  { id: '6a24c23e-c38a-4dc3-9f53-c62e96bef18d', label: 'Rise Academy (2026-04-30)  — subbed 79′ → GK2 H2' },
];

const argv = process.argv.slice(2);
const isDry = argv.includes('--dry');
const oneMatchIdx = argv.indexOf('--match');
const oneMatchId = oneMatchIdx !== -1 ? argv[oneMatchIdx + 1] : null;
const targets = oneMatchId ? BC_MATCHES.filter((m) => m.id === oneMatchId) : BC_MATCHES;
if (oneMatchId && !targets.length) {
  console.error(`--match ${oneMatchId} not in the BC Soccer set`);
  process.exit(1);
}

const EVENT_TABLES = [
  'goals_conceded',
  'shot_events',
  'distribution_events',
  'cross_events',
  'sweeper_events',
  'one_v_one_events',
];

async function surveyMatch(matchId) {
  // What's on this match right now — total rows and NULL-clip rows per table.
  // This is the "before" snapshot; running the backfill should NULL → path
  // on every row, and force=true should re-slice everything even where a
  // path already exists.
  const perTable = {};
  let totalRows = 0;
  let nullRows = 0;
  for (const tbl of EVENT_TABLES) {
    const { count: total } = await sb.from(tbl)
      .select('id', { count: 'exact', head: true }).eq('match_id', matchId);
    const { count: nulls } = await sb.from(tbl)
      .select('id', { count: 'exact', head: true }).eq('match_id', matchId).is('clip_storage_path', null);
    perTable[tbl] = { total: total ?? 0, null: nulls ?? 0 };
    totalRows += total ?? 0;
    nullRows += nulls ?? 0;
  }
  return { perTable, totalRows, nullRows };
}

async function unexpectedAmalieMatches() {
  // Sanity check: are there any published Amalie/GK2 matches NOT in our
  // hard-coded list? If so, print them so the coach can decide whether to
  // include them. Never auto-includes — this is a demo-critical run.
  const { data } = await sb.from('matches')
    .select('id, match_date, opponent, keeper_id, secondary_keeper_id, logged_via')
    .or(`keeper_id.eq.${AMALIE_KEEPER_ID},secondary_keeper_id.eq.${AMALIE_KEEPER_ID},keeper_id.eq.${GK2_KEEPER_ID},secondary_keeper_id.eq.${GK2_KEEPER_ID}`)
    .eq('logged_via', 'video')
    .order('match_date', { ascending: false });
  const known = new Set(BC_MATCHES.map((m) => m.id));
  return (data || []).filter((m) => !known.has(m.id));
}

async function fire(matchId) {
  const url = env.MODAL_BACKFILL_CLIPS_TRIGGER_URL;
  const secret = env.MODAL_TRIGGER_SECRET;
  if (!url || !secret) {
    return { error: 'MODAL_BACKFILL_CLIPS_TRIGGER_URL or MODAL_TRIGGER_SECRET missing from .env.local — deploy worker first (modal deploy worker/app.py) and copy printed URL into .env.local.' };
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Trigger-Secret': secret },
    body: JSON.stringify({ match_id: matchId, force: true }),
  });
  const text = await res.text();
  if (!res.ok) return { error: `HTTP ${res.status}: ${text.slice(0, 400)}` };
  try {
    const body = JSON.parse(text);
    return { modal_call_id: body.modal_call_id, force: body.force, match_id: body.match_id };
  } catch {
    return { error: `Non-JSON body: ${text.slice(0, 400)}` };
  }
}

console.log('═══ BC Soccer clip backfill — Amalie + GK2 Unknown ══════════════════');
console.log(isDry ? 'MODE: --dry (survey only, no triggers fired)' : 'MODE: live (force=true triggers will fire)');
console.log('');

const extras = await unexpectedAmalieMatches();
if (extras.length) {
  console.log('⚠ Extra Amalie/GK2 video-published matches NOT in the hard-coded set:');
  for (const m of extras) console.log(`   ${m.id}  ${m.match_date}  vs ${m.opponent || '?'}`);
  console.log('   → re-run with --match <uuid> if any of these should be included.\n');
}

const spawns = [];
for (const m of targets) {
  const survey = await surveyMatch(m.id);
  console.log(`─── ${m.label}`);
  console.log(`    match_id: ${m.id}`);
  console.log(`    events:   ${survey.totalRows} total (${survey.nullRows} NULL clip_storage_path)`);
  const perTable = Object.entries(survey.perTable)
    .filter(([, v]) => v.total > 0)
    .map(([t, v]) => `${t.replace(/_events$/, '')}=${v.total}${v.null ? `(${v.null}∅)` : ''}`)
    .join('  ');
  if (perTable) console.log(`    breakdown: ${perTable}`);
  if (isDry) { console.log(''); continue; }

  const result = await fire(m.id);
  if (result.error) {
    console.log(`    ✗ TRIGGER FAILED: ${result.error}`);
  } else {
    console.log(`    ✓ spawned  modal_call_id=${result.modal_call_id}  force=${result.force}`);
    spawns.push({ label: m.label, matchId: m.id, ...result });
  }
  console.log('');
}

if (!isDry) {
  console.log('═══ Summary ════════════════════════════════════════════════════════');
  console.log(`Spawned ${spawns.length}/${targets.length} backfill runs.`);
  if (spawns.length) {
    console.log('Each run downloads the source video + slices every event clip.');
    console.log('Expected wall time: ~3-5 min per match, all running concurrently.');
    console.log('Watch progress:  modal app logs stixanalytix-worker  (grep "[bfe]")');
    console.log('');
    console.log('Verify when done:  node scripts/backfill-bc-soccer-clips.mjs --dry');
    console.log('   (NULL count on each match should be 0 after backfill completes.)');
  }
}
