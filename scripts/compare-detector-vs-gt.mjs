#!/usr/bin/env node
/**
 * compare-detector-vs-gt.mjs — Phase 2.4 calibration harness.
 *
 * For a given job_id (or match_id), print side-by-side counts:
 *
 *   Type        Gemini   GT     Delta
 *   crosses         8     11      -3
 *   sweeper        14     18      -4
 *   one_v_one       1      2      -1
 *
 * Gemini counts come from video_jobs.gemini_output.{crosses,sweeper,one_v_one}
 * (the checkpoint written by the worker BEFORE publish).
 * GT counts come from the {cross,sweeper,one_v_one}_events tables where the
 * rows have source='ground_truth'.
 *
 * USAGE
 *   node scripts/compare-detector-vs-gt.mjs <job_id>
 *   node scripts/compare-detector-vs-gt.mjs --match <match_id>
 *   node scripts/compare-detector-vs-gt.mjs --slug <match-slug>   # via published_match_id lookup
 *   node scripts/compare-detector-vs-gt.mjs --all-amalie          # all Amalie matches with a job + GT
 *   node scripts/compare-detector-vs-gt.mjs --verbose             # per-event ts + fields
 *
 * Add --json for machine-readable output.
 *
 * This script READS ONLY. No inserts, no updates, no side effects.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const argv = process.argv.slice(2);
const VERBOSE = argv.includes('--verbose');
const JSON_OUT = argv.includes('--json');
const ALL_AMALIE = argv.includes('--all-amalie');
const matchFlagIdx = argv.indexOf('--match');
const slugFlagIdx = argv.indexOf('--slug');
const positional = argv.filter(a => !a.startsWith('--'));

async function resolveTargets() {
  if (ALL_AMALIE) {
    // All Amalie matches that have BOTH a video_job with gemini_output AND
    // at least one GT event on any of the three tables. That's the eligible
    // calibration set.
    const { data: keepers } = await sb.from('keepers').select('id,name').ilike('name', '%Amalie%');
    const kid = keepers?.[0]?.id;
    if (!kid) { console.error('No Amalie keeper found.'); process.exit(1); }
    const { data: jobs } = await sb.from('video_jobs')
      .select('id, published_match_id, keeper_id')
      .eq('keeper_id', kid)
      .not('gemini_output', 'is', null);
    const targets = [];
    for (const j of (jobs || [])) {
      if (!j.published_match_id) continue;
      const gt = await sb.rpc ? null : null; // no rpc; check counts manually
      const { count: c1 } = await sb.from('cross_events').select('id', { count: 'exact', head: true })
        .eq('match_id', j.published_match_id).in('source', ['ground_truth', 'manual']);
      const { count: c2 } = await sb.from('sweeper_events').select('id', { count: 'exact', head: true })
        .eq('match_id', j.published_match_id).in('source', ['ground_truth', 'manual']);
      const { count: c3 } = await sb.from('one_v_one_events').select('id', { count: 'exact', head: true })
        .eq('match_id', j.published_match_id).in('source', ['ground_truth', 'manual']);
      if ((c1 || 0) + (c2 || 0) + (c3 || 0) > 0) {
        targets.push({ job_id: j.id, match_id: j.published_match_id });
      }
    }
    return targets;
  }
  if (matchFlagIdx >= 0) {
    const matchId = argv[matchFlagIdx + 1];
    const { data: j } = await sb.from('video_jobs')
      .select('id')
      .eq('published_match_id', matchId)
      .not('gemini_output', 'is', null)
      .maybeSingle();
    if (!j) { console.error(`No video_job with gemini_output for match_id ${matchId}`); process.exit(1); }
    return [{ job_id: j.id, match_id: matchId }];
  }
  if (slugFlagIdx >= 0) {
    console.error('--slug not yet implemented; use --match <uuid> or a bare job_id.');
    process.exit(1);
  }
  if (positional.length === 0) {
    console.error('Usage: node scripts/compare-detector-vs-gt.mjs <job_id> | --match <match_id> | --all-amalie');
    process.exit(1);
  }
  const jobId = positional[0];
  const { data: j } = await sb.from('video_jobs').select('id,published_match_id').eq('id', jobId).maybeSingle();
  if (!j) { console.error(`No video_job with id ${jobId}`); process.exit(1); }
  return [{ job_id: j.id, match_id: j.published_match_id }];
}

function extractGeminiCounts(gOut) {
  const c = (gOut?.crosses?.parsed?.crosses || []).length;
  const s = (gOut?.sweeper?.parsed?.sweeper || []).length;
  const o = (gOut?.one_v_one?.parsed?.one_v_one || []).length;
  return { crosses: c, sweeper: s, one_v_one: o };
}

async function gtCounts(matchId) {
  const { count: c } = await sb.from('cross_events').select('id', { count: 'exact', head: true })
    .eq('match_id', matchId).in('source', ['ground_truth', 'manual']);
  const { count: s } = await sb.from('sweeper_events').select('id', { count: 'exact', head: true })
    .eq('match_id', matchId).in('source', ['ground_truth', 'manual']);
  const { count: o } = await sb.from('one_v_one_events').select('id', { count: 'exact', head: true })
    .eq('match_id', matchId).in('source', ['ground_truth', 'manual']);
  return { crosses: c || 0, sweeper: s || 0, one_v_one: o || 0 };
}

async function verboseEvents(matchId, gOut) {
  // Pull ts-ordered per-type from both sides for eyeball comparison.
  const gCross = (gOut?.crosses?.parsed?.crosses || []).map(e => ({
    ts: e.timestamp_seconds, side: e.side, type: e.cross_type, gk: e.gk_action,
  }));
  const gSweep = (gOut?.sweeper?.parsed?.sweeper || []).map(e => ({
    ts: e.timestamp_seconds, trg: e.trigger, act: e.action, res: e.result,
  }));
  const g1v1 = (gOut?.one_v_one?.parsed?.one_v_one || []).map(e => ({
    ts: e.timestamp_seconds, sit: e.situation_type, shape: e.body_shape, res: e.result,
  }));
  const [gtCross, gtSweep, gt1v1] = await Promise.all([
    sb.from('cross_events').select('timestamp_seconds,side,cross_type,gk_action')
      .eq('match_id', matchId).in('source', ['ground_truth', 'manual']).order('timestamp_seconds', { ascending: true }),
    sb.from('sweeper_events').select('timestamp_seconds,trigger,action,result')
      .eq('match_id', matchId).in('source', ['ground_truth', 'manual']).order('timestamp_seconds', { ascending: true }),
    sb.from('one_v_one_events').select('timestamp_seconds,situation_type,body_shape,result')
      .eq('match_id', matchId).in('source', ['ground_truth', 'manual']).order('timestamp_seconds', { ascending: true }),
  ]);
  return {
    crosses: { gemini: gCross, gt: gtCross.data || [] },
    sweeper: { gemini: gSweep, gt: gtSweep.data || [] },
    one_v_one: { gemini: g1v1, gt: gt1v1.data || [] },
  };
}

function fmtRow(type, gem, gt) {
  const delta = gem - gt;
  const sign = delta > 0 ? `+${delta}` : `${delta}`;
  return `  ${type.padEnd(12)} ${String(gem).padStart(6)} ${String(gt).padStart(6)} ${sign.padStart(8)}`;
}

async function main() {
  const targets = await resolveTargets();
  const results = [];
  for (const t of targets) {
    const { data: j } = await sb.from('video_jobs')
      .select('id,published_match_id,gemini_output')
      .eq('id', t.job_id).maybeSingle();
    if (!j) continue;
    const matchId = t.match_id || j.published_match_id;
    const gem = extractGeminiCounts(j.gemini_output);
    const gt = matchId ? await gtCounts(matchId) : { crosses: 0, sweeper: 0, one_v_one: 0 };
    let matchLabel = matchId;
    if (matchId) {
      const { data: m } = await sb.from('matches').select('match_date,opponent').eq('id', matchId).maybeSingle();
      if (m) matchLabel = `${m.match_date}  ${m.opponent}`;
    }
    const detail = VERBOSE && matchId ? await verboseEvents(matchId, j.gemini_output) : null;
    results.push({ job_id: j.id, match_id: matchId, match_label: matchLabel, gemini: gem, gt, detail });
  }
  if (JSON_OUT) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }
  console.log('\nPhase 2.4 detector vs GT — count comparison\n');
  for (const r of results) {
    console.log(`Match: ${r.match_label}   (job ${r.job_id})`);
    console.log('  Type          Gemini     GT    Delta');
    console.log(fmtRow('crosses',   r.gemini.crosses,   r.gt.crosses));
    console.log(fmtRow('sweeper',   r.gemini.sweeper,   r.gt.sweeper));
    console.log(fmtRow('one_v_one', r.gemini.one_v_one, r.gt.one_v_one));
    if (r.detail) {
      for (const kind of ['crosses', 'sweeper', 'one_v_one']) {
        console.log(`\n  --- ${kind} events (Gemini | GT) ---`);
        const g = r.detail[kind].gemini;
        const gt = r.detail[kind].gt;
        const n = Math.max(g.length, gt.length);
        for (let i = 0; i < n; i++) {
          const l = g[i] ? JSON.stringify(g[i]) : '-';
          const r_ = gt[i] ? JSON.stringify(gt[i]) : '-';
          console.log(`  ${String(i + 1).padStart(2)}  ${l}   |   ${r_}`);
        }
      }
    }
    console.log('');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
