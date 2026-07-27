// For each of Amalie's 3 subbed matches, cross-check the sub_minute against
// each event's keeper_id. If publish-time attribution worked, every event
// under 60*sub_minute seconds should carry Amalie's keeper_id and every event
// after should carry GK2's. Any mismatch is a data-quality problem the
// match-page tab-switcher fix can't solve — we'd need to re-attribute.
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

const AMALIE = 'b8fb9a0c-212f-4165-b9d8-bb64c6ea8548';
const GK2    = 'e3ac6897-9075-4477-8b51-d118b8135110';

const SUBBED = [
  { id: 'e4171541-e23f-4837-b5aa-b86097d01e32', label: 'Fusion 2008' },
  { id: 'cb83dd4b-d3a6-4e53-8edb-71ae3244f72f', label: 'CMF 2008' },
  { id: '6a24c23e-c38a-4dc3-9f53-c62e96bef18d', label: 'Rise Academy' },
  { id: '9a61bfa2-c289-479e-b1c2-87d6ffc77526', label: 'U16 Rise (no sub — Amalie solo)' },
];
const TABLES = ['goals_conceded', 'goals_scored', 'shot_events', 'distribution_events', 'cross_events', 'sweeper_events', 'one_v_one_events'];

for (const m of SUBBED) {
  const { data: match } = await sb.from('matches').select('*').eq('id', m.id).maybeSingle();
  console.log(`\n─── ${m.label}`);
  console.log(`    was_subbed=${match.was_subbed}  sub_minute=${match.sub_minute}  secondary_keeper=${match.secondary_keeper_id?.slice(0,8) || '—'}`);
  const cutoffSec = match.sub_minute ? match.sub_minute * 60 : null;

  let counts = { amalie: 0, gk2: 0, other: 0, nullKid: 0 };
  let mismatches = [];
  for (const tbl of TABLES) {
    const { data: rows } = await sb.from(tbl).select('id, timestamp_seconds, keeper_id').eq('match_id', m.id);
    for (const r of (rows || [])) {
      if (r.keeper_id === AMALIE) counts.amalie++;
      else if (r.keeper_id === GK2) counts.gk2++;
      else if (r.keeper_id == null) counts.nullKid++;
      else counts.other++;

      if (cutoffSec != null && r.timestamp_seconds != null) {
        const shouldBe = r.timestamp_seconds < cutoffSec ? AMALIE : GK2;
        if (r.keeper_id && r.keeper_id !== shouldBe) {
          mismatches.push({ tbl, id: r.id.slice(0,8), ts: r.timestamp_seconds, kid: r.keeper_id?.slice(0,8), shouldBe: shouldBe?.slice(0,8) });
        }
      }
    }
  }
  console.log(`    keeper_id counts: Amalie=${counts.amalie}  GK2=${counts.gk2}  other=${counts.other}  NULL=${counts.nullKid}`);
  if (mismatches.length) {
    console.log(`    ⚠  ${mismatches.length} event(s) don't match sub_minute rule:`);
    mismatches.slice(0, 8).forEach(x => console.log(`         [${x.tbl}] id=${x.id} ts=${x.ts}  keeper=${x.kid}  should be=${x.shouldBe}`));
  } else {
    console.log(`    ✓ all events consistent with sub_minute rule`);
  }
}
