#!/usr/bin/env node
/**
 * restore-published-events.mjs — undo the 2026-07-14 field-clobber incident.
 *
 * CONTEXT
 *   The GT→DB reconciler (scripts/apply-gt-to-db.mjs, first version) ran an
 *   UPDATE pass on goals_conceded / shot_events / distribution_events for 11
 *   matches. Two bugs in that UPDATE:
 *     (a) `successful` and `under_pressure` on distribution_events were
 *         checked as strings against booleans → null-clobbered on every touch.
 *     (b) `keeper_team` was hardcoded to 'us' → any DB row that had been
 *         coach-tagged 'opp' at review time could be flipped to 'us' if it
 *         paired to a GT us-event at similar ts.
 *
 *   Root fix — architecture: reconciler is being rewritten as additive-only
 *   (crosses/sweeper/1v1 only, never touches goals/saves/dists). Before that
 *   ships, we restore the 3 clobbered tables to their published state.
 *
 * STRATEGY
 *   video_jobs.reviewed_output was written at publish time and holds the
 *   coach-reviewed values for every kept event. It is the ground truth for
 *   published rows. This script:
 *     1. Iterates 11 matches by match_id.
 *     2. Loads reviewed_output from the associated video_jobs row.
 *     3. Pairs each reviewed event to a DB row by timestamp (±10s).
 *     4. UPDATEs the DB row's clobbered fields from reviewed_output.
 *   Never touches: keeper_id (Phase A backfill got this right),
 *                  clip_storage_path (still valid pointers).
 *
 * USAGE
 *   node scripts/restore-published-events.mjs                # dry-run all 11
 *   node scripts/restore-published-events.mjs --apply        # write
 *   node scripts/restore-published-events.mjs --match <id>   # single match
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
const singleMatchIdx = argv.indexOf('--match');
const SINGLE_MATCH = singleMatchIdx >= 0 ? argv[singleMatchIdx + 1] : null;

const TS_TOLERANCE = 10; // seconds; reviewed_output ts ↔ DB ts should be identical or very close

// The 11 matches touched by the first reconciler run (from the incident report).
const MATCH_IDS = [
  'e4171541-e23f-4837-b5aa-b86097d01e32', // Fusion 2008 (Amalie/GK2)
  'cb83dd4b-d3a6-4e53-8edb-71ae3244f72f', // CMF 2008
  '6a24c23e-c38a-4dc3-9f53-c62e96bef18d', // Rise Academy Apr
  '9a61bfa2-c289-479e-b1c2-87d6ffc77526', // U16 Rise Nov
  '7574367c-c490-4a5f-8822-1f9004e550c9', // Judah OFC 2016
  '8611f3a9-b1a9-4766-836f-f15092ae587e', // Judah KCITY 2016 Gold
  '5d1c7340-0313-48b7-8e81-85749784a7cd', // Judah OUFC
  'd2d14f77-315e-4157-9b7c-801fa580599c', // Judah OUFC SOSC
  '58cc6321-8134-488e-8b24-4a53c03ec978', // Judah PFC 2016
  '784bfa68-b28d-4d8c-b71f-8cacaa4715d5', // Judah OUFC 2016
  '2af4a891-b88a-46b9-8650-b46e9dd6bc2f', // Judah KYSA Lions
];

// Coerce publish-time string booleans ("true"/"false") to DB booleans.
// Publish route's coerceTriBool: 'true'|'yes' → true, 'false'|'no' → false, else → null.
function coerceBool(v) {
  if (v === true || v === false) return v;
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (s === 'true' || s === 'yes') return true;
  if (s === 'false' || s === 'no') return false;
  return null;
}
function coercePress(rev) {
  // reviewed_output added a press_state enum later. Prefer that; else legacy under_pressure.
  const ps = (rev.press_state || '').toLowerCase();
  if (ps === 'pressed') return true;
  if (ps === 'unpressed') return false;
  if (ps === 'unclear') return null;
  return coerceBool(rev.under_pressure);
}

// Greedy timestamp-nearest pair with tolerance. Returns [{rev,db}] pairs
// and unmatched-rev / unmatched-db lists.
function pairByTs(revList, dbList) {
  const usedDb = new Set();
  const pairs = [];
  const unmatchedRev = [];
  const sortedRev = [...revList].sort((a, b) => (a.timestamp_seconds ?? 0) - (b.timestamp_seconds ?? 0));
  for (const r of sortedRev) {
    if (!Number.isFinite(r.timestamp_seconds)) { unmatchedRev.push(r); continue; }
    let bestIdx = -1, bestDelta = Infinity;
    dbList.forEach((d, i) => {
      if (usedDb.has(i)) return;
      if (!Number.isFinite(d.timestamp_seconds)) return;
      const delta = Math.abs(d.timestamp_seconds - r.timestamp_seconds);
      if (delta < bestDelta && delta <= TS_TOLERANCE) { bestDelta = delta; bestIdx = i; }
    });
    if (bestIdx >= 0) { pairs.push([r, dbList[bestIdx]]); usedDb.add(bestIdx); }
    else unmatchedRev.push(r);
  }
  return { pairs, unmatchedRev, unmatchedDb: dbList.filter((_, i) => !usedDb.has(i)) };
}

async function restoreMatch(matchId) {
  console.log(`\n════════════════════════════════════════════════════════════════════`);
  const { data: match } = await sb.from('matches').select('id, opponent, match_date').eq('id', matchId).maybeSingle();
  if (!match) { console.log(`match ${matchId} not found — skip`); return; }
  console.log(`${match.match_date}  ${match.opponent}  (${matchId.slice(0, 8)})`);

  const { data: vj } = await sb.from('video_jobs').select('id, reviewed_output').eq('published_match_id', matchId).maybeSingle();
  if (!vj || !vj.reviewed_output) { console.log(`  no reviewed_output for this match — skip`); return; }
  const rev = vj.reviewed_output;
  const revGoals = Array.isArray(rev.concessions) ? rev.concessions : [];
  const revSaves = Array.isArray(rev.saves) ? rev.saves : [];
  const revDists = Array.isArray(rev.distribution) ? rev.distribution : [];

  const [{ data: dbGoals = [] }, { data: dbSaves = [] }, { data: dbDists = [] }] = await Promise.all([
    sb.from('goals_conceded').select('*').eq('match_id', matchId),
    sb.from('shot_events').select('*').eq('match_id', matchId),
    sb.from('distribution_events').select('*').eq('match_id', matchId),
  ]);

  const plan = [];  // { table, id, patch, note }

  // ── goals_conceded restore ──
  {
    const { pairs } = pairByTs(revGoals, dbGoals);
    for (const [r, d] of pairs) {
      const patch = {
        goal_zone: r.goal_zone ?? d.goal_zone,
        shot_origin: r.shot_origin ?? d.shot_origin,
        goal_source: r.goal_source ?? d.goal_source,
        goal_rank: r.goal_rank ?? d.goal_rank,
        shot_type: r.shot_type ?? d.shot_type,
        gk_positioning: r.gk_positioning ?? d.gk_positioning,
        half: r.half ?? d.half,
        shot_description: r.shot_description ?? d.shot_description,
        gk_observations: r.gk_observations ?? d.gk_observations,
        coach_notes: r.notes ?? d.coach_notes,
      };
      plan.push({ table: 'goals_conceded', id: d.id, patch, note: `goal ts=${d.timestamp_seconds}` });
    }
  }

  // ── shot_events restore ──
  {
    const { pairs } = pairByTs(revSaves, dbSaves);
    for (const [r, d] of pairs) {
      const patch = {
        shot_origin: r.shot_origin === 'unclear' ? null : (r.shot_origin ?? d.shot_origin),
        gk_action: r.gk_action === 'unclear' ? null : (r.gk_action ?? d.gk_action),
        goal_zone: r.goal_zone ?? d.goal_zone,
        is_goal: r.gk_action === 'Goal',
        is_off_target: r.on_target === 'no',
        shot_type: r.shot_type ?? d.shot_type,
        on_target: r.on_target ?? d.on_target,
        outcome: r.outcome ?? d.outcome,
        body_distance_zone: r.body_distance_zone ?? d.body_distance_zone,
        goal_placement_height: r.goal_placement_height ?? d.goal_placement_height,
        goal_placement_side: r.goal_placement_side ?? d.goal_placement_side,
        gk_visible: r.gk_visible ?? d.gk_visible,
        technique: r.technique ?? d.technique,
        dive_family: r.dive_family ?? d.dive_family,
        // KEY RESTORE: keeper_team must reflect the coach's review, not my
        // reconciler's forced 'us'. 'opp' events belong to opponent GK.
        keeper_team: (r.keeper_team === 'us' || r.keeper_team === 'opp') ? r.keeper_team : d.keeper_team,
        coach_added: r.coach_added ?? d.coach_added,
        shot_description: r.shot_description ?? d.shot_description,
        gk_observations: r.gk_observations ?? d.gk_observations,
        coach_notes: r.notes ?? d.coach_notes,
      };
      plan.push({ table: 'shot_events', id: d.id, patch, note: `save ts=${d.timestamp_seconds} keeper_team→${patch.keeper_team}` });
    }
  }

  // ── distribution_events restore (THE MAIN DAMAGE) ──
  {
    const { pairs } = pairByTs(revDists, dbDists);
    for (const [r, d] of pairs) {
      const successful = coerceBool(r.successful);
      const underPressure = coercePress(r);
      const patch = {
        trigger: r.trigger ?? d.trigger,
        type: r.type ?? d.type,
        // THE FIX: restore boolean values properly coerced from publish-time strings
        successful: successful !== null ? successful : d.successful,
        under_pressure: underPressure !== null ? underPressure : d.under_pressure,
        pass_selection: r.pass_selection ?? d.pass_selection,
        direction: r.direction ?? d.direction,
        receiver: r.receiver ?? d.receiver,
        first_touch: r.first_touch ?? d.first_touch,
        target_zone: r.target_zone ?? d.target_zone,
        notes: r.notes ?? d.notes,
        confidence: r.confidence ?? d.confidence,
        keeper_team: (r.keeper_team === 'us' || r.keeper_team === 'opp') ? r.keeper_team : d.keeper_team,
        match_clock: r.match_clock ?? d.match_clock,
      };
      plan.push({ table: 'distribution_events', id: d.id, patch, note: `dist ts=${d.timestamp_seconds} succ→${patch.successful} press→${patch.under_pressure}` });
    }
  }

  // Summarise
  const byTable = plan.reduce((acc, p) => { acc[p.table] = (acc[p.table] || 0) + 1; return acc; }, {});
  console.log(`  restore plan: ${Object.entries(byTable).map(([t, n]) => `${t}=${n}`).join(', ')}`);
  if (VERBOSE) plan.slice(0, 6).forEach(p => console.log(`    ${p.table.padEnd(20)} ${p.note}`));

  if (!APPLY) { console.log(`  (dry-run — pass --apply to write)`); return { plan }; }

  let ok = 0, err = 0, errs = [];
  for (const p of plan) {
    const { error } = await sb.from(p.table).update(p.patch).eq('id', p.id);
    if (error) { err++; errs.push(`${p.table} ${p.id}: ${error.message}`); }
    else ok++;
  }
  console.log(`  ✓ ${ok} updates applied, ${err} errors`);
  if (err) errs.slice(0, 5).forEach(e => console.log(`    ${e}`));

  // Recompute matches aggregate columns from post-restore event counts.
  const [{ data: gc }, { data: se }] = await Promise.all([
    sb.from('goals_conceded').select('id').eq('match_id', matchId),
    sb.from('shot_events').select('id, on_target, is_goal, keeper_team').eq('match_id', matchId),
  ]);
  const goals_conceded = gc.length;
  const usShots = se.filter(s => s.keeper_team !== 'opp');
  const saves = usShots.filter(s => !s.is_goal && s.on_target === 'yes').length;
  const shots_on_target = saves + goals_conceded;
  const save_percentage = shots_on_target > 0 ? saves / shots_on_target : 0;
  await sb.from('matches').update({ goals_conceded, saves, shots_on_target, save_percentage }).eq('id', matchId);
  console.log(`  matches row recomputed: GA=${goals_conceded} saves=${saves} SOT=${shots_on_target} sv%=${(save_percentage*100).toFixed(1)}`);

  return { plan };
}

async function main() {
  const ids = SINGLE_MATCH ? [SINGLE_MATCH] : MATCH_IDS;
  for (const id of ids) {
    try { await restoreMatch(id); }
    catch (e) { console.error(`match ${id} failed: ${e.message}`); if (VERBOSE) console.error(e.stack); }
  }
  console.log(`\n════════════════════════════════════════════════════════════════════`);
  console.log(APPLY ? 'DONE. Restore applied.' : 'DONE. Dry-run only. Pass --apply to write.');
}
main().catch(e => { console.error(e); process.exit(1); });
