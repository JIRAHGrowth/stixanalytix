// The Rise Academy backfill produced 101/103 clips. This surfaces the 2 events
// that were skipped so we know what to expect on the dashboard (they'll play
// their OLD clip, or nothing if clip_storage_path is NULL).
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
const TABLES = ['goals_conceded', 'shot_events', 'distribution_events', 'cross_events', 'sweeper_events', 'one_v_one_events'];
const NEW_RE = /_[0-9a-f]{8}\.mp4$/i;

for (const tbl of TABLES) {
  const { data } = await sb.from(tbl).select('*').eq('match_id', MATCH);
  for (const r of (data || [])) {
    const isFresh = r.clip_storage_path && NEW_RE.test(r.clip_storage_path);
    if (!isFresh) {
      console.log(`\n[${tbl}] id=${r.id.slice(0, 8)}  timestamp_seconds=${r.timestamp_seconds ?? 'NULL'}`);
      console.log(`   clip_storage_path: ${r.clip_storage_path ?? 'NULL'}`);
      const previewFields = ['gk_action', 'type', 'trigger', 'shot_origin', 'shot_type', 'coach_added'];
      const preview = previewFields.filter(k => r[k] != null).map(k => `${k}=${r[k]}`).join('  ');
      if (preview) console.log(`   ${preview}`);
    }
  }
}
