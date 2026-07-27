// Diagnose the current BC Soccer run — where did it fail this time?
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

// Latest CMF 2008 job for Amalie (regardless of status)
const { data: jobs } = await sb.from('video_jobs')
  .select('id, status, error_message, retry_count, started_at, finished_at, created_at, match_metadata')
  .order('created_at', { ascending: false })
  .limit(5);

const bc = jobs.find((j) => j.match_metadata?.opponent === 'CMF 2008' && j.status === 'failed' && j.id !== 'd2df3782-65c9-4664-8593-4d2ceb89a699')
       || jobs.find((j) => j.match_metadata?.opponent === 'CMF 2008');
if (!bc) { console.log('No BC Soccer job found'); process.exit(1); }

console.log('═══════════════════════════════════════════════════════════════');
console.log('CURRENT BC SOCCER JOB');
console.log('═══════════════════════════════════════════════════════════════');
console.log('job_id:        ', bc.id);
console.log('status:        ', bc.status);
console.log('error_message: ', bc.error_message);
console.log('retry_count:   ', bc.retry_count);
console.log('started_at:    ', bc.started_at);
console.log('finished_at:   ', bc.finished_at);
const elapsed = bc.finished_at
  ? (new Date(bc.finished_at).getTime() - new Date(bc.started_at).getTime()) / 1000
  : (Date.now() - new Date(bc.started_at).getTime()) / 1000;
console.log('elapsed:       ', `${Math.round(elapsed)}s (${Math.round(elapsed/60)}m)`);

const { data: runs } = await sb.from('pipeline_runs')
  .select('stage, status, chunk_index, prompt_kind, pass_index, duration_ms, error_message, created_at, finished_at')
  .eq('video_job_id', bc.id)
  .order('created_at', { ascending: true });

console.log(`\nPIPELINE TIMELINE (${runs.length} stages)`);
console.log('═══════════════════════════════════════════════════════════════');
const icon = { completed: '✓', running: '…', failed: '✗', skipped: '·' };
for (const r of runs) {
  const label = [r.stage, r.chunk_index !== null ? `chunk#${r.chunk_index}` : null,
    r.prompt_kind ? `[${r.prompt_kind}]` : null,
    r.pass_index !== null ? `p${r.pass_index}` : null].filter(Boolean).join(' ');
  const t = new Date(r.created_at).toISOString().slice(11, 19);
  const dur = r.duration_ms ? `${(r.duration_ms/1000).toFixed(1)}s` : 'running…';
  const err = r.error_message ? ` ⚠ ${r.error_message.slice(0, 200)}` : '';
  console.log(`  ${t} ${icon[r.status]||'?'} ${label.padEnd(38)} ${dur.padEnd(10)}${err}`);
}

const failed = runs.filter((r) => r.status === 'failed');
if (failed.length) {
  console.log('\n═══ FAILED STAGES (full error text) ═══════════════════════════');
  for (const f of failed) {
    console.log(`\n  ${f.stage}${f.chunk_index !== null ? `#${f.chunk_index}` : ''} [${f.prompt_kind || '-'}] p${f.pass_index ?? '-'}:`);
    console.log(`    ${f.error_message || '(no message)'}`);
  }
}

const running = runs.filter((r) => r.status === 'running');
if (running.length) {
  console.log(`\n${running.length} stage(s) still marked running (stale unless container is live).`);
}
