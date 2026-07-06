// Ground-truth coverage audit.
//
// Pulls all keepers + video_jobs from the DB, cross-references against files
// in scripts/ground-truth/, and prints a per-keeper punch list of matches
// that need ground truth tagged.
//
// Run: node scripts/ground-truth-coverage.mjs
import { createClient } from '@supabase/supabase-js';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
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

// === Load keepers ==========================================================
const { data: keepers } = await sb.from('keepers').select('id, name, number, active');
const keeperById = Object.fromEntries(keepers.map((k) => [k.id, k]));

// === Load video_jobs =======================================================
const { data: jobs } = await sb
  .from('video_jobs')
  .select('id, keeper_id, status, source_provider, match_metadata, created_at, published_match_id')
  .order('created_at', { ascending: false })
  .limit(200);

// === Scan ground truth files ==============================================
const gtDir = join(repoRoot, 'scripts', 'ground-truth');
const gtFiles = readdirSync(gtDir).filter((f) => !f.startsWith('_'));
const gtXlsx = new Set(gtFiles.filter((f) => f.endsWith('.xlsx')).map((f) => f.replace('.xlsx', '')));
const gtJson = new Set(gtFiles.filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')));

// Parse each JSON to also index by video_job_id (the source of truth for pairing)
const gtByJobId = new Map();
for (const f of gtJson) {
  try {
    const j = JSON.parse(readFileSync(join(gtDir, f + '.json'), 'utf8'));
    // excel-to-ground-truth emits video_job_id at the top level (not under metadata).
    const jid = j.video_job_id || j.metadata?.video_job_id;
    if (jid) gtByJobId.set(jid, f);
  } catch { /* skip malformed */ }
}

// === Slugify helper to match filenames =====================================
function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function guessGtSlug(job) {
  const keeper = keeperById[job.keeper_id];
  const keeperSlug = slugify(keeper?.name?.split(' ')[0] || 'unknown');
  const date = job.match_metadata?.match_date;
  const oppSlug = slugify(job.match_metadata?.opponent);
  const base = `${keeperSlug}-${date}`;
  if (!oppSlug) return base;
  return `${base}-${oppSlug}`;
}

// === Group jobs by keeper + report =========================================
const byKeeper = {};
for (const j of jobs) {
  const key = j.keeper_id || 'unknown';
  (byKeeper[key] ||= []).push(j);
}

console.log('\n=== GROUND-TRUTH COVERAGE AUDIT ===\n');
console.log(`Ground-truth files on disk: ${gtXlsx.size} xlsx, ${gtJson.size} json`);
console.log(`Ground truths linked by video_job_id: ${gtByJobId.size}\n`);

for (const [keeperId, ks] of Object.entries(byKeeper)) {
  const keeper = keeperById[keeperId];
  const heading = keeper ? `${keeper.name} (#${keeper.number}${keeper.active ? '' : ' — inactive'})` : `unknown keeper ${keeperId}`;
  console.log('━'.repeat(80));
  console.log(heading);
  console.log('━'.repeat(80));

  for (const j of ks) {
    const m = j.match_metadata || {};
    const date = m.match_date || '????-??-??';
    const opp = m.opponent || (m.session_type === 'training' ? '(training)' : '(no opponent)');
    const provider = j.source_provider || '—';
    const guess = guessGtSlug(j);

    // Coverage tests, in order of authority
    let coverage = '❌ NO GT';
    if (gtByJobId.has(j.id)) {
      coverage = `✅ GT (json linked): ${gtByJobId.get(j.id)}`;
    } else if (gtJson.has(guess)) {
      coverage = `⚠️  GT filename matches but json.metadata.video_job_id missing/mismatched: ${guess}`;
    } else if (gtXlsx.has(guess)) {
      coverage = `📝 XLSX only — needs excel-to-ground-truth conversion: ${guess}`;
    } else {
      // Fuzzy match: xlsx starts with keeperSlug + date
      const prefix = guess.split('-').slice(0, 4).join('-'); // keeper + YYYY-MM-DD
      const partial = [...gtXlsx].filter((s) => s.startsWith(prefix));
      if (partial.length) coverage = `📝 possible XLSX: ${partial.join(', ')}`;
    }

    console.log(
      `  ${date}  ${opp.padEnd(24)}  ${j.status.padEnd(14)}  provider=${provider.padEnd(6)}  ${coverage}`
    );
    console.log(`             job_id=${j.id}`);
  }
  console.log();
}

// === Orphan ground truths (files with no matching job) =====================
console.log('━'.repeat(80));
console.log('ORPHAN GROUND-TRUTH FILES (no matching video_job)');
console.log('━'.repeat(80));

const jobIds = new Set(jobs.map((j) => j.id));
const usedSlugs = new Set(jobs.map(guessGtSlug));
for (const slug of gtXlsx) {
  if (!usedSlugs.has(slug)) {
    console.log(`  ${slug}.xlsx  — no video_job with this keeper+date+opponent`);
  }
}
for (const [jid, slug] of gtByJobId.entries()) {
  if (!jobIds.has(jid)) {
    console.log(`  ${slug}.json — links to video_job_id ${jid} which doesn't exist`);
  }
}
