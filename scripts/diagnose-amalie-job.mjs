// Diagnose why Amalie's BC Soccer job hasn't flipped to review_needed.
// Pulls the current status, full pipeline_runs timeline, and any error.
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

const JOB_ID = 'd2df3782-65c9-4664-8593-4d2ceb89a699';

const { data: job } = await sb.from('video_jobs')
  .select('id, status, error_message, retry_count, started_at, finished_at, created_at, gemini_output')
  .eq('id', JOB_ID).single();

console.log('═══════════════════════════════════════════════════════════════');
console.log('AMALIE BC SOCCER JOB');
console.log('═══════════════════════════════════════════════════════════════');
console.log('status:        ', job.status);
console.log('error_message: ', job.error_message);
console.log('retry_count:   ', job.retry_count);
console.log('created_at:    ', job.created_at);
console.log('started_at:    ', job.started_at);
console.log('finished_at:   ', job.finished_at);
const elapsed = job.finished_at
  ? (new Date(job.finished_at).getTime() - new Date(job.started_at).getTime()) / 1000
  : (Date.now() - new Date(job.started_at).getTime()) / 1000;
console.log('elapsed:       ', `${Math.round(elapsed)}s (${Math.round(elapsed / 60)}m)`);

const parsed = job.gemini_output?.parsed;
const saves = job.gemini_output?.saves?.parsed;
const dist = job.gemini_output?.distribution?.parsed;
console.log('\ngemini_output populated?');
console.log('  goals:        ', parsed ? `yes — ${(parsed.goals || []).length} goal(s)` : 'no');
console.log('  saves:        ', saves ? `yes — ${(saves.saves || []).length} save(s)` : 'no');
console.log('  distribution: ', dist ? `yes — ${(dist.distribution || []).length} action(s)` : 'no');

// === Full pipeline_runs timeline ==========================================
const { data: runs } = await sb.from('pipeline_runs')
  .select('stage, status, chunk_index, prompt_kind, pass_index, duration_ms, error_message, created_at, finished_at, usage_metadata')
  .eq('video_job_id', JOB_ID)
  .order('created_at', { ascending: true });

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`PIPELINE TIMELINE (${runs.length} stages)`);
console.log('═══════════════════════════════════════════════════════════════');

const statusIcon = { completed: '✓', running: '…', failed: '✗', skipped: '·' };
for (const r of runs) {
  const icon = statusIcon[r.status] || '?';
  const stageLabel = [
    r.stage,
    r.chunk_index !== null ? `chunk#${r.chunk_index}` : null,
    r.prompt_kind ? `[${r.prompt_kind}]` : null,
    r.pass_index !== null ? `p${r.pass_index}` : null,
  ].filter(Boolean).join(' ');
  const t = new Date(r.created_at).toISOString().slice(11, 19);
  const dur = r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : 'running…';
  const err = r.error_message ? ` ⚠ ${r.error_message.slice(0, 100)}` : '';
  const tokens = r.usage_metadata?.total_token_count ? ` (${r.usage_metadata.total_token_count.toLocaleString()} tok)` : '';
  console.log(`  ${t} ${icon} ${stageLabel.padEnd(38)} ${dur.padEnd(10)}${tokens}${err}`);
}

// Summary of failed runs
const failed = runs.filter((r) => r.status === 'failed');
if (failed.length) {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('FAILED STAGES');
  console.log('═══════════════════════════════════════════════════════════════');
  for (const f of failed) {
    console.log(`  ${f.stage}${f.chunk_index !== null ? `#${f.chunk_index}` : ''}: ${f.error_message}`);
  }
}

const running = runs.filter((r) => r.status === 'running');
if (running.length) {
  console.log(`\n${running.length} stage(s) still running.`);
}
