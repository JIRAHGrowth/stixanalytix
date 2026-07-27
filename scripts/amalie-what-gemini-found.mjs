// Snapshot of Gemini's output on Amalie's BC Soccer match — used before
// the coach has finished tagging, to give a "what to look for" preview.
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

const { data: job } = await sb.from('video_jobs')
  .select('gemini_output, match_metadata').eq('id', 'c6e6c58b-c48b-4e99-8059-4dae0f976180').single();
const meta = job.match_metadata;
const g = job.gemini_output || {};
const goals = g.parsed?.goals || [];
const saves = g.saves?.parsed?.saves || [];
const dist = g.distribution?.parsed?.distribution || [];

const fmt = (t) => {
  if (t === null || t === undefined) return '—';
  const s = Math.round(Number(t));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};

console.log('═══ AMALIE — BC Soccer vs CMF 2008 — Gemini output snapshot ═══');
console.log(`Match colors registered: our team ${meta.my_team_color || '?'} · GK ${meta.my_keeper_color || '?'} · opp ${meta.opponent_color || '?'}`);

console.log(`\n─── GOALS (${goals.length} detected) ───────────────────────────────`);
const goalTeams = {};
for (const g of goals) {
  const t = g.scoring_team || g.team || 'unknown';
  goalTeams[t] = (goalTeams[t] || 0) + 1;
}
console.log('by scoring_team:', goalTeams);
for (const g of goals.slice(0, 8)) {
  console.log(`  ${fmt(g.time_seconds ?? g.time)}  ${(g.scoring_team||g.team||'?').padEnd(14)}  ${(g.attack_type||'?').padEnd(12)}  ${(g.shot_type||'?')}`);
}
if (goals.length > 8) console.log(`  … ${goals.length - 8} more`);

console.log(`\n─── SAVES (${saves.length} detected) ───────────────────────────────`);
const saveActions = {};
for (const s of saves) {
  const a = s.gk_action || 'unknown';
  saveActions[a] = (saveActions[a] || 0) + 1;
}
console.log('by gk_action:', saveActions);
for (const s of saves.slice(0, 8)) {
  console.log(`  ${fmt(s.time_seconds ?? s.time)}  ${(s.gk_action||'?').padEnd(10)}  ${(s.outcome||'?').padEnd(20)}  ${(s.shot_origin||s.shot_location||'?')}`);
}
if (saves.length > 8) console.log(`  … ${saves.length - 8} more`);

console.log(`\n─── DISTRIBUTIONS (${dist.length} detected) ────────────────────────`);
const distTypes = {};
const distTriggers = {};
for (const d of dist) {
  const t = d.dist_type || d.type || 'unknown';
  distTypes[t] = (distTypes[t] || 0) + 1;
  const tr = d.trigger || 'unknown';
  distTriggers[tr] = (distTriggers[tr] || 0) + 1;
}
console.log('by dist_type:', distTypes);
console.log('by trigger:  ', distTriggers);
for (const d of dist.slice(0, 8)) {
  console.log(`  ${fmt(d.time_seconds ?? d.time)}  ${(d.dist_type||d.type||'?').padEnd(14)}  ${(d.trigger||'?').padEnd(12)}  ${(d.outcome||'?')}`);
}
if (dist.length > 8) console.log(`  … ${dist.length - 8} more`);
