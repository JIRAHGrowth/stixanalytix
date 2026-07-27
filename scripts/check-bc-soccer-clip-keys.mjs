// Sample clip_storage_path values from the 4 BC Soccer matches and report
// how many still use the OLD index-based key (clips/<job>/save_000.mp4) vs
// the NEW UUID-based key (clips/<job>/save_a1b2c3d4.mp4) written by
// backfill_clips_from_events. Old = 3-digit-zero-padded index; new = 8-hex-char
// UUID prefix. Ratio should trend from all-old → all-new as the 4 spawns finish.
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

const BC = [
  ['e4171541-e23f-4837-b5aa-b86097d01e32', 'Fusion 2008'],
  ['9a61bfa2-c289-479e-b1c2-87d6ffc77526', 'U16 Rise'],
  ['cb83dd4b-d3a6-4e53-8edb-71ae3244f72f', 'CMF 2008'],
  ['6a24c23e-c38a-4dc3-9f53-c62e96bef18d', 'Rise Academy'],
];
const TABLES = ['goals_conceded', 'shot_events', 'distribution_events', 'cross_events', 'sweeper_events', 'one_v_one_events'];

// Old convention: /save_000.mp4, /dist_012.mp4 (3 digits, zero-padded)
// New convention: /save_a1b2c3d4.mp4 (8 hex chars from event UUID)
const OLD_RE = /_[0-9]{3}\.mp4$/;
const NEW_RE = /_[0-9a-f]{8}\.mp4$/i;

for (const [matchId, label] of BC) {
  let old = 0, fresh = 0, other = 0, nul = 0, total = 0;
  const sample = { old: null, fresh: null };
  for (const tbl of TABLES) {
    const { data } = await sb.from(tbl)
      .select('id, clip_storage_path').eq('match_id', matchId);
    for (const r of (data || [])) {
      total++;
      if (!r.clip_storage_path) { nul++; continue; }
      if (NEW_RE.test(r.clip_storage_path)) { fresh++; if (!sample.fresh) sample.fresh = r.clip_storage_path; }
      else if (OLD_RE.test(r.clip_storage_path)) { old++; if (!sample.old) sample.old = r.clip_storage_path; }
      else other++;
    }
  }
  const pct = total ? Math.round(100 * fresh / total) : 0;
  console.log(`${label.padEnd(15)} ${total} events   fresh(uuid)=${fresh}  old(idx)=${old}  other=${other}  null=${nul}   [${pct}% migrated]`);
  if (sample.old)   console.log(`   old sample: ${sample.old}`);
  if (sample.fresh) console.log(`   new sample: ${sample.fresh}`);
}
