// Download one of the fresh backfill_clips_from_events clips for Rise
// Academy, run ffprobe, and print its resolution. Tells us whether the
// resolver picked standard (1920x1080) or panorama (2048x2048) when
// re-resolving the VEO URL at backfill time.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(join(repoRoot, '.env.local'), 'utf8')
  .split('\n').filter((l) => l && !l.startsWith('#')).reduce((a, l) => {
    const eq = l.indexOf('='); if (eq === -1) return a;
    a[l.slice(0, eq).trim()] = l.slice(eq + 1).trim().replace(/^["']|["']$/g, ''); return a;
  }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const MATCH = '6a24c23e-c38a-4dc3-9f53-c62e96bef18d';
const { data } = await sb.from('shot_events').select('id, clip_storage_path')
  .eq('match_id', MATCH).not('clip_storage_path', 'is', null).limit(1);
const row = data?.[0];
if (!row) { console.log('no clip found'); process.exit(1); }
console.log('event_id:  ', row.id);
console.log('clip_path: ', row.clip_storage_path);

const { data: signed } = await sb.storage.from('match-videos')
  .createSignedUrl(row.clip_storage_path, 300);
const url = signed?.signedUrl;
console.log('signed URL OK, downloading...');

const res = await fetch(url);
if (!res.ok) { console.log('fetch failed', res.status); process.exit(1); }
const buf = Buffer.from(await res.arrayBuffer());
const tmp = join(tmpdir(), `rise-clip-${row.id.slice(0, 8)}.mp4`);
writeFileSync(tmp, buf);
console.log(`downloaded ${(buf.length / 1024).toFixed(0)} KB to ${tmp}`);

// ffprobe the resolution
try {
  const out = execSync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${tmp}"`,
    { encoding: 'utf8' }
  );
  const [w, h] = out.trim().split(',');
  console.log(`resolution: ${w}x${h}`);
  const parsedW = parseInt(w, 10);
  if (parsedW <= 720) console.log('   → 720p downscale artefact (worker scales to -2:720)');
  console.log('   (source render is: standard = wide 16:9 aspect, panorama = ~1:1 aspect)');
  const ratio = parsedW / parseInt(h, 10);
  if (ratio > 1.5) console.log('   → aspect ratio suggests STANDARD render 🎉');
  else if (ratio < 1.2) console.log('   → aspect ratio suggests PANORAMA render 😕');
} finally {
  try { unlinkSync(tmp); } catch {}
}
