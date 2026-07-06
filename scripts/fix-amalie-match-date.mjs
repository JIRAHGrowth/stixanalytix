// One-off: Amalie's BC Soccer job was submitted with match_date=2026-02-08.
// VEO's slug (20260227-...) shows the match was actually 2026-02-27.
// Update match_metadata.match_date to reflect reality.
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
const CORRECT_DATE = '2026-02-27';

const { data: before } = await sb.from('video_jobs').select('match_metadata').eq('id', JOB_ID).single();
console.log('Before match_date:', before.match_metadata.match_date);
const updated = { ...before.match_metadata, match_date: CORRECT_DATE };
const { error } = await sb.from('video_jobs').update({ match_metadata: updated }).eq('id', JOB_ID);
if (error) { console.error(error); process.exit(1); }
const { data: after } = await sb.from('video_jobs').select('match_metadata').eq('id', JOB_ID).single();
console.log('After match_date: ', after.match_metadata.match_date);
