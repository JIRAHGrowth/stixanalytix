// Take one clip_storage_path per match and (a) generate a signed URL,
// (b) HEAD the URL to confirm the file actually exists. If HEAD 404s,
// the backfill uploaded 'produced' clips but they never landed in storage,
// which would explain "no clips playing" even though clip_storage_path is set.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(join(repoRoot, '.env.local'), 'utf8')
  .split('\n').filter((l) => l && !l.startsWith('#')).reduce((a, l) => {
    const eq = l.indexOf('='); if (eq === -1) return a;
    a[l.slice(0, eq).trim()] = l.slice(eq + 1).trim().replace(/^\"|\"$/g, ''); return a;
  }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const BC = [
  ['e4171541-e23f-4837-b5aa-b86097d01e32', 'Fusion 2008'],
  ['9a61bfa2-c289-479e-b1c2-87d6ffc77526', 'U16 Rise'],
  ['cb83dd4b-d3a6-4e53-8edb-71ae3244f72f', 'CMF 2008'],
  ['6a24c23e-c38a-4dc3-9f53-c62e96bef18d', 'Rise Academy'],
];

for (const [matchId, label] of BC) {
  // Grab one row with a UUID-keyed clip_storage_path from shot_events
  const { data } = await sb.from('shot_events').select('id, timestamp_seconds, clip_storage_path')
    .eq('match_id', matchId).not('clip_storage_path', 'is', null).limit(1);
  const row = data?.[0];
  if (!row) { console.log(label, ' -- no shot_events with clip found'); continue; }
  console.log('\n' + label);
  console.log('  event_id:  ' + row.id);
  console.log('  ts_sec:    ' + row.timestamp_seconds);
  console.log('  clip_path: ' + row.clip_storage_path);
  const signed = await sb.storage.from('match-videos').createSignedUrl(row.clip_storage_path, 60);
  if (signed.error) { console.log('  signed URL FAILED: ' + signed.error.message); continue; }
  const url = signed.data?.signedUrl;
  console.log('  signed OK, HEADing...');
  const res = await fetch(url, { method: 'HEAD' });
  console.log('  HEAD ' + res.status + '  content-length=' + res.headers.get('content-length'));
}
