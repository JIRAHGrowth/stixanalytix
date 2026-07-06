// One-off diagnostic: read the most recent video_jobs row + its pipeline_runs.
// Uses service role key from .env.local. Run: node scripts/peek-video-job.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(join(repoRoot, '.env.local'), 'utf8')
  .split('\n')
  .filter((l) => l && !l.startsWith('#'))
  .reduce((acc, l) => {
    const eq = l.indexOf('=');
    if (eq === -1) return acc;
    acc[l.slice(0, eq).trim()] = l.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    return acc;
  }, {});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: jobs, error: jobsErr } = await sb
  .from('video_jobs')
  .select('id, status, source_provider, source_metadata, error_message, video_url, started_at, retry_count, created_at, match_metadata')
  .order('created_at', { ascending: false })
  .limit(3);

if (jobsErr) {
  console.error('jobs error:', jobsErr);
  process.exit(1);
}

for (const j of jobs) {
  console.log('─'.repeat(72));
  console.log('job_id:          ', j.id);
  console.log('status:          ', j.status);
  console.log('source_provider: ', j.source_provider);
  console.log('retry_count:     ', j.retry_count);
  console.log('started_at:      ', j.started_at);
  console.log('opponent:        ', j.match_metadata?.opponent);
  console.log('video_url:       ', (j.video_url || '').slice(0, 80));
  console.log('error_message:   ', j.error_message?.slice(0, 200));
  console.log('source_metadata:');
  if (j.source_metadata) {
    for (const [k, v] of Object.entries(j.source_metadata)) {
      const val = typeof v === 'string' ? v.slice(0, 100) : JSON.stringify(v)?.slice(0, 100);
      console.log(`  ${k.padEnd(22)} = ${val}`);
    }
  } else {
    console.log('  (null)');
  }

  const { data: runs } = await sb
    .from('pipeline_runs')
    .select('stage, status, duration_ms, error_message, created_at')
    .eq('video_job_id', j.id)
    .order('created_at', { ascending: true });
  console.log('pipeline_runs:');
  for (const r of runs || []) {
    const dur = r.duration_ms ? `${r.duration_ms}ms` : 'running…';
    const err = r.error_message ? ` — ${r.error_message.slice(0, 80)}` : '';
    console.log(`  ${r.stage.padEnd(14)} ${r.status.padEnd(10)} ${dur}${err}`);
  }
}
