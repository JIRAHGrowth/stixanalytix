// Look up the video_job that produced Rise Academy match 6a24c23e... and
// print its video_url, storage_path, and render_type-related metadata so we
// can tell whether the source is a VEO panorama render vs a coach-uploaded
// file, and whether swapping to a standard-view source is feasible for the
// BC Soccer demo tomorrow.
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

const MATCH = '6a24c23e-c38a-4dc3-9f53-c62e96bef18d';

let { data } = await sb.from('video_jobs')
  .select('*').eq('published_match_id', MATCH).limit(1);
if (!data?.length) {
  ({ data } = await sb.from('video_jobs').select('*').eq('match_id', MATCH).limit(1));
}
const job = data?.[0];
if (!job) { console.log('no video_job for match', MATCH); process.exit(1); }
console.log('columns:', Object.keys(job).sort().join(', '));
console.log('id:         ', job.id);
console.log('created_at: ', job.created_at);
console.log('video_url:  ', job.video_url);
console.log('storage_path:', job.storage_path);
const meta = job.match_metadata || {};
console.log('match_metadata:', JSON.stringify(meta, null, 2));
console.log('source_metadata:', JSON.stringify(job.source_metadata || {}, null, 2));
const g = job.gemini_output || {};
console.log('gemini_output top-level keys:', Object.keys(g).slice(0, 20).join(', '));
if (g?.raw && typeof g.raw === 'object') {
  console.log('gemini_output.raw keys:', Object.keys(g.raw).slice(0, 10).join(', '));
}
