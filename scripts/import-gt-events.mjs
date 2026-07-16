#!/usr/bin/env node
/**
 * import-gt-events.mjs — ADDITIVE-ONLY GT → DB pipeline.
 *
 * Scope, by design:
 *   ┌────────────────────────────────────────────────────────────────────┐
 *   │  Writes ONLY to: cross_events, sweeper_events, one_v_one_events   │
 *   │  Never touches:  goals_conceded, shot_events, distribution_events,│
 *   │                  goals_scored                                     │
 *   └────────────────────────────────────────────────────────────────────┘
 *
 * Rationale (root architecture, 2026-07-15):
 *   - Goals/saves/dists have TWO independent write paths (video-publish and
 *     pitchside RPC). Both go through coach review and are already reconciled.
 *   - GT xlsx is authoritative for THREE event types Gemini can't detect:
 *     crosses, sweeper actions, 1v1s. These flow ONLY through GT import.
 *   - Previous reconciler tried to merge GT into goals/saves/dists via UPDATE
 *     — one boolean-vs-string typo silently null-clobbered 238 distribution
 *     rows on 2026-07-14. Additive-only makes that bug class impossible.
 *
 * INVARIANTS this script enforces:
 *   1. Only INSERT or UPDATE — never DELETE.
 *   2. Only write to the three GT-only tables above.
 *   3. Every event carries keeper_id (per Phase A NOT NULL constraint).
 *   4. keeper_id routed by GT sub_minute: t < sub_seconds → primary keeper,
 *      t >= sub_seconds → secondary keeper.
 *   5. keeper_team ('us'/'opp') from GT — 'opp' events preserved for training.
 *   6. For opp events on multi-keeper matches, still route keeper_id by ts
 *      (matches the shot_events/distribution_events convention).
 *   7. clip_storage_path attached from worker's gemini_output index when a
 *      matching ts exists. GT-only events with no clip left NULL for the
 *      worker.backfill_clips_from_events pass.
 *
 * USAGE
 *   node scripts/import-gt-events.mjs                     # dry-run all GTs
 *   node scripts/import-gt-events.mjs --apply             # write
 *   node scripts/import-gt-events.mjs <slug> --apply      # single match
 *   node scripts/import-gt-events.mjs --verbose           # per-event detail
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

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');
const positional = argv.filter(a => !a.startsWith('--'));

const TS_TOLERANCE = 15; // seconds; tight tolerance since we're not merging fields on published data

// ── Helpers ──────────────────────────────────────────────────────────────────

// keeper_team normaliser: GT emits color names or 'us'/'opponent'.
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

// Route a GT event to primary or secondary keeper based on its timestamp.
// Both 'us' and 'opp' events use this — 'opp' events still need SOME
// keeper_id for the NOT NULL constraint, and using ts routing keeps their
// attribution consistent with when our GK was on the pitch.
function keeperFor(match, timestampSeconds) {
  const primary = match.keeper_id;
  const secondary = match.secondary_keeper_id;
  const subS = match.sub_minute ? match.sub_minute * 60 : null;
  if (!subS || !secondary) return primary;
  if (!Number.isFinite(timestampSeconds)) return primary;
  return timestampSeconds >= subS ? secondary : primary;
}

function indexClipPaths(geminiOutput) {
  const idx = new Map();
  if (!geminiOutput || typeof geminiOutput !== 'object') return idx;
  const feed = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const e of arr) {
      const ts = e?.timestamp_seconds;
      if (Number.isFinite(ts) && e?.clip_storage_path) idx.set(Math.round(ts), e.clip_storage_path);
    }
  };
  feed(geminiOutput?.parsed?.goals);
  feed(geminiOutput?.saves?.parsed?.saves);
  feed(geminiOutput?.distribution?.parsed?.distribution);
  return idx;
}
function clipPathFor(idx, ts) {
  if (!Number.isFinite(ts)) return null;
  for (let d = 0; d <= 3; d++) {
    const hit = idx.get(Math.round(ts) + d) || idx.get(Math.round(ts) - d);
    if (hit) return hit;
  }
  return null;
}

function pairByTs(gtList, dbList, tsKey = 'timestamp_seconds') {
  const usedDb = new Set();
  const pairs = [];
  const unmatchedGt = [];
  const sortedGt = [...gtList].sort((a, b) => (a[tsKey] ?? 0) - (b[tsKey] ?? 0));
  for (const g of sortedGt) {
    if (!Number.isFinite(g[tsKey])) { unmatchedGt.push(g); continue; }
    let bestIdx = -1, bestDelta = Infinity;
    dbList.forEach((d, i) => {
      if (usedDb.has(i)) return;
      const ts = d[tsKey];
      if (!Number.isFinite(ts)) return;
      const delta = Math.abs(ts - g[tsKey]);
      if (delta < bestDelta && delta <= TS_TOLERANCE) { bestDelta = delta; bestIdx = i; }
    });
    if (bestIdx >= 0) { pairs.push([g, dbList[bestIdx]]); usedDb.add(bestIdx); }
    else unmatchedGt.push(g);
  }
  return { pairs, unmatchedGt };
}

// ── Enum maps (mirror those in sweeper/1v1 DB constraints) ───────────────────

const SWEEPER_ACTION_MAP = {
  interception: 'intercept', intercept: 'intercept',
  clearance: 'clearance_foot', clearance_foot: 'clearance_foot',
  header: 'clearance_header', clearance_header: 'clearance_header',
  tackle: 'slide', slide: 'slide',
  smother: 'smother', control_distribute: 'control_distribute', let_through: 'let_through',
};
const SWEEPER_PRESSURE_MAP = {
  none: 'alone', alone: 'alone',
  '1_attacker': 'with_opp', '2+_attackers': 'with_opp', with_opp: 'with_opp',
  with_teammate: 'with_teammate',
};
const SWEEPER_RESULT_MAP = {
  possession_retained: 'kept_possession', kept_possession: 'kept_possession',
  cleared_safely: 'cleared_safely',
  conceded_turnover: 'lost_possession', lost_possession: 'lost_possession',
  conceded_corner: 'conceded_corner',
  goal_conceded: 'goal', goal: 'goal',
  yellow_red: 'yellow_red',
};
const ONE_V_ONE_RESULT_MAP = {
  won: 'save', save: 'save', saved: 'save',
  goal: 'goal', conceded: 'goal',
  cleared: 'cleared',
  forced_wide: 'forced_wide',
  foul_won: 'foul_won', foul_conceded: 'foul_conceded',
};

// ── Row builders ─────────────────────────────────────────────────────────────

function buildCrossRow({ gt, match, kt, clipIdx, dbRow }) {
  const keep = (gtVal, dbVal) => (gtVal == null || gtVal === '') ? (dbVal ?? null) : gtVal;
  return {
    match_id: match.id,
    coach_id: match.coach_id,
    keeper_id: keeperFor(match, gt.timestamp_seconds),
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
    keeper_team: kt || dbRow?.keeper_team || 'us',
    source: dbRow?.source || 'manual',
    coach_added: dbRow?.coach_added ?? false,
    clip_storage_path: clipPathFor(clipIdx, gt.timestamp_seconds) || dbRow?.clip_storage_path || null,
  };
}

function buildSweeperRow({ gt, match, kt, clipIdx, dbRow }) {
  const action = SWEEPER_ACTION_MAP[String(gt.action || '').toLowerCase()] || dbRow?.action || null;
  const pressure = SWEEPER_PRESSURE_MAP[String(gt.pressure || '').toLowerCase()] || dbRow?.pressure || null;
  const successMappedResult =
    gt.successful === true || gt.successful === 'yes' ? 'kept_possession'
    : gt.successful === false || gt.successful === 'no' ? 'lost_possession' : null;
  const result = SWEEPER_RESULT_MAP[String(gt.outcome || '').toLowerCase()]
    || successMappedResult
    || dbRow?.result || null;
  return {
    match_id: match.id,
    coach_id: match.coach_id,
    keeper_id: keeperFor(match, gt.timestamp_seconds),
    timestamp_seconds: gt.timestamp_seconds ?? dbRow?.timestamp_seconds ?? null,
    minute: Number.isFinite(gt.timestamp_seconds) ? Math.floor(gt.timestamp_seconds / 60) : (dbRow?.minute ?? null),
    half: gt.half === 1 ? 'H1' : gt.half === 2 ? 'H2' : (dbRow?.half ?? null),
    action,
    pressure,
    result,
    sweep_zone: gt.distance || dbRow?.sweep_zone || null,
    notes: gt.note || (gt.outcome && !SWEEPER_RESULT_MAP[String(gt.outcome).toLowerCase()] ? gt.outcome : dbRow?.notes) || null,
    source: dbRow?.source || 'manual',
    coach_added: dbRow?.coach_added ?? false,
    clip_storage_path: clipPathFor(clipIdx, gt.timestamp_seconds) || dbRow?.clip_storage_path || null,
  };
}

function buildOneV1Row({ gt, match, kt, clipIdx, dbRow }) {
  const result = ONE_V_ONE_RESULT_MAP[String(gt.outcome || '').toLowerCase()] || dbRow?.result || null;
  const eventLabel = gt.event_type || gt.event || null;
  return {
    match_id: match.id,
    coach_id: match.coach_id,
    keeper_id: keeperFor(match, gt.timestamp_seconds),
    timestamp_seconds: gt.timestamp_seconds ?? dbRow?.timestamp_seconds ?? null,
    minute: Number.isFinite(gt.timestamp_seconds) ? Math.floor(gt.timestamp_seconds / 60) : (dbRow?.minute ?? null),
    half: gt.half === 1 ? 'H1' : gt.half === 2 ? 'H2' : (dbRow?.half ?? null),
    result,
    notes: [eventLabel, gt.outcome, gt.note].filter(Boolean).join(' — ') || dbRow?.notes || null,
    source: dbRow?.source || 'manual',
    coach_added: dbRow?.coach_added ?? false,
    clip_storage_path: clipPathFor(clipIdx, gt.timestamp_seconds) || dbRow?.clip_storage_path || null,
  };
}

// ── Per-match import ─────────────────────────────────────────────────────────

async function importMatch(gtPath) {
  const gt = JSON.parse(fs.readFileSync(gtPath, 'utf8'));
  const slug = gt.match_name || path.basename(gtPath, '.json');
  console.log(`\n════════════════════════════════════════════════════════════════════`);
  console.log(`GT: ${slug}   (${gt.opponent || '—'}, ${gt.match_date || '?'})`);

  // Resolve match_id via video_job_id (preferred) or opponent+date
  let matchId = null;
  if (gt.video_job_id) {
    const { data: job } = await sb.from('video_jobs').select('published_match_id').eq('id', gt.video_job_id).maybeSingle();
    if (job?.published_match_id) matchId = job.published_match_id;
  }
  if (!matchId) {
    const { data: cs } = await sb.from('matches').select('id').eq('match_date', gt.match_date).ilike('opponent', gt.opponent || '');
    if (!cs || cs.length !== 1) { console.log(`  ✗ ambiguous or missing match for ${gt.opponent} ${gt.match_date}. Skip.`); return; }
    matchId = cs[0].id;
  }
  const { data: match } = await sb.from('matches').select('*').eq('id', matchId).single();
  if (!match) { console.log(`  ✗ match ${matchId} not found`); return; }
  const { data: vj } = await sb.from('video_jobs').select('gemini_output').eq('published_match_id', matchId).maybeSingle();
  const clipIdx = indexClipPaths(vj?.gemini_output);

  const [{ data: dbCrosses = [] }, { data: dbSweeper = [] }, { data: dbOneV1 = [] }] = await Promise.all([
    sb.from('cross_events').select('*').eq('match_id', matchId),
    sb.from('sweeper_events').select('*').eq('match_id', matchId),
    sb.from('one_v_one_events').select('*').eq('match_id', matchId),
  ]);

  const myColor = String(gt.my_team_color || '').toLowerCase();
  const oppColor = String(gt.opponent_color || '').toLowerCase();

  // Include BOTH us and opp events (opp preserved for training data)
  const withKt = (arr) => (arr || []).map(e => ({ ...e, _kt: normKeeperTeam(e.keeper_team, myColor, oppColor) || 'us' }));
  const gtCrosses = withKt(gt.events?.crosses);
  const gtSweeper = withKt(gt.events?.sweeper);
  const gtOneV1 = withKt(gt.events?.one_v_ones);

  const plan = { insert: [], update: [] };
  const stats = { crosses: {}, sweeper: {}, oneV1: {} };

  // ── crosses ──
  {
    const { pairs, unmatchedGt } = pairByTs(gtCrosses, dbCrosses);
    pairs.forEach(([g, d]) => plan.update.push({ table: 'cross_events', id: d.id, patch: buildCrossRow({ gt: g, match, kt: g._kt, clipIdx, dbRow: d }) }));
    unmatchedGt.forEach(g => plan.insert.push({ table: 'cross_events', row: buildCrossRow({ gt: g, match, kt: g._kt, clipIdx }) }));
    stats.crosses = { gt: gtCrosses.length, db: dbCrosses.length, add: unmatchedGt.length, update: pairs.length };
  }
  // ── sweeper ──
  {
    const { pairs, unmatchedGt } = pairByTs(gtSweeper, dbSweeper);
    pairs.forEach(([g, d]) => plan.update.push({ table: 'sweeper_events', id: d.id, patch: buildSweeperRow({ gt: g, match, kt: g._kt, clipIdx, dbRow: d }) }));
    unmatchedGt.forEach(g => plan.insert.push({ table: 'sweeper_events', row: buildSweeperRow({ gt: g, match, kt: g._kt, clipIdx }) }));
    stats.sweeper = { gt: gtSweeper.length, db: dbSweeper.length, add: unmatchedGt.length, update: pairs.length };
  }
  // ── 1v1 ──
  {
    const { pairs, unmatchedGt } = pairByTs(gtOneV1, dbOneV1);
    pairs.forEach(([g, d]) => plan.update.push({ table: 'one_v_one_events', id: d.id, patch: buildOneV1Row({ gt: g, match, kt: g._kt, clipIdx, dbRow: d }) }));
    unmatchedGt.forEach(g => plan.insert.push({ table: 'one_v_one_events', row: buildOneV1Row({ gt: g, match, kt: g._kt, clipIdx }) }));
    stats.oneV1 = { gt: gtOneV1.length, db: dbOneV1.length, add: unmatchedGt.length, update: pairs.length };
  }

  const label = (s) => `gt=${String(s.gt).padStart(3)}  db=${String(s.db).padStart(3)}  add=${s.add || 0}  update=${s.update || 0}`;
  console.log(`  crosses:   ${label(stats.crosses)}`);
  console.log(`  sweeper:   ${label(stats.sweeper)}`);
  console.log(`  1v1:       ${label(stats.oneV1)}`);
  console.log(`  PLAN: ${plan.insert.length} inserts, ${plan.update.length} updates, 0 deletes  (never deletes by design)`);
  const missingClips = plan.insert.filter(p => !p.row.clip_storage_path).length;
  if (missingClips) console.log(`  ↳ ${missingClips} inserts have no clip_storage_path — run worker.backfill_clips_from_events`);

  if (VERBOSE) {
    plan.insert.forEach(p => console.log(`    INSERT ${p.table.padEnd(20)} ts=${p.row.timestamp_seconds} kt=${p.row.keeper_team}`));
    plan.update.forEach(p => console.log(`    UPDATE ${p.table.padEnd(20)} id=${p.id.slice(0, 8)}`));
  }

  if (!APPLY) { console.log(`  (dry-run — pass --apply to write)`); return; }

  let ok = 0, err = 0;
  for (const p of plan.update) {
    const { error } = await sb.from(p.table).update(p.patch).eq('id', p.id);
    if (error) { err++; console.log(`    err: update ${p.table} ${p.id}: ${error.message}`); } else ok++;
  }
  for (const p of plan.insert) {
    const { error } = await sb.from(p.table).insert(p.row);
    if (error) { err++; console.log(`    err: insert ${p.table} ts=${p.row.timestamp_seconds}: ${error.message}`); } else ok++;
  }
  console.log(`  ✓ ${ok} writes applied, ${err} errors`);
  return { matchId, missingClips, err };
}

// ── Entry ────────────────────────────────────────────────────────────────────

async function main() {
  let gtFiles = [];
  const slug = positional[0];
  if (slug) {
    const p = path.join(GT_DIR, slug.endsWith('.json') ? slug : `${slug}.json`);
    if (!fs.existsSync(p)) { console.error(`GT not found: ${p}`); process.exit(1); }
    gtFiles = [p];
  } else {
    gtFiles = fs.readdirSync(GT_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_')).map(f => path.join(GT_DIR, f));
  }
  for (const f of gtFiles) {
    try { await importMatch(f); }
    catch (e) { console.error(`\n✗ ${path.basename(f)} failed: ${e.message}`); if (VERBOSE) console.error(e.stack); }
  }
  console.log(`\n════════════════════════════════════════════════════════════════════`);
  console.log(APPLY ? 'DONE. Import applied. Additive-only — no rows deleted.' : 'DONE. Dry-run. Pass --apply to write.');
}
main().catch(e => { console.error(e); process.exit(1); });
