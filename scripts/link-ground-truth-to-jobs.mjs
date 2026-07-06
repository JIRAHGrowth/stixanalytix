/**
 * Batch linkage patcher.
 *
 * For every XLSX in scripts/ground-truth/ that doesn't have a video_job_id
 * in its Metadata sheet, find the best-matching video_job and patch it in.
 * Then (re-)build the JSON via excel-to-ground-truth.js.
 *
 * Matching heuristic (in priority order):
 *   1. Exact keeper+date+opponent-slug (deterministic — treat as authoritative)
 *   2. Keeper+date match with substring on opponent
 *      → prefer published status > review_needed > analyzing > failed
 *      → break ties by earliest created_at (least likely to be a prompt-tuning rerun)
 *   3. No match → log and skip (leave file for manual attention)
 *
 * Loudly logs every choice made, so wrong picks are easy to spot + correct
 * by hand-editing the Metadata sheet.
 *
 * Run: node scripts/link-ground-truth-to-jobs.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';
import ExcelJS from 'exceljs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(join(repoRoot, '.env.local'), 'utf8')
  .split('\n').filter((l) => l && !l.startsWith('#')).reduce((a, l) => {
    const eq = l.indexOf('='); if (eq === -1) return a;
    a[l.slice(0, eq).trim()] = l.slice(eq + 1).trim().replace(/^["']|["']$/g, ''); return a;
  }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const STATUS_RANK = { published: 0, review_needed: 1, analyzing: 2, queued: 3, failed: 4 };

// === Load keepers + jobs ===================================================
const { data: keepers } = await sb.from('keepers').select('id, name');
const keeperNameToId = Object.fromEntries(keepers.map((k) => [slugify(k.name.split(' ')[0]), k.id]));

const { data: allJobs } = await sb.from('video_jobs')
  .select('id, keeper_id, status, match_metadata, created_at, published_match_id')
  .limit(500);

// Index jobs by keeper_id + date for fast lookup
const jobsByKeeperDate = new Map();
for (const j of allJobs) {
  const key = `${j.keeper_id}|${j.match_metadata?.match_date}`;
  if (!jobsByKeeperDate.has(key)) jobsByKeeperDate.set(key, []);
  jobsByKeeperDate.get(key).push(j);
}

// === Walk ground-truth XLSX files ==========================================
const gtDir = join(repoRoot, 'scripts', 'ground-truth');
const xlsxFiles = readdirSync(gtDir)
  .filter((f) => f.endsWith('.xlsx') && !f.startsWith('_'));

let stats = { patched: 0, alreadyLinked: 0, noMatch: 0, ambiguous: 0, jsonRebuilt: 0 };
const skipped = [];

for (const filename of xlsxFiles) {
  const slug = filename.replace('.xlsx', '');
  const xlsxPath = join(gtDir, filename);
  const jsonPath = join(gtDir, slug + '.json');

  // Parse filename: <keeper>-<YYYY>-<MM>-<DD>-<opponent-slug-parts>
  const parts = slug.split('-');
  const keeperSlug = parts[0];
  const date = parts.slice(1, 4).join('-');
  const oppSlug = parts.slice(4).join('-'); // may be empty

  const keeperId = keeperNameToId[keeperSlug];
  if (!keeperId) {
    skipped.push(`${filename}: unknown keeper slug "${keeperSlug}"`);
    stats.noMatch++;
    continue;
  }

  // Check if XLSX already has video_job_id
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const meta = wb.getWorksheet('Metadata');
  let existingJobId = null;
  let jobIdRow = null;
  for (let r = 2; r <= meta.lastRow.number; r++) {
    if (meta.getCell(`A${r}`).value === 'video_job_id') {
      existingJobId = meta.getCell(`B${r}`).value;
      jobIdRow = r;
      break;
    }
  }

  if (existingJobId && String(existingJobId).length > 30) {
    stats.alreadyLinked++;
    // Rebuild JSON if missing OR if XLSX is newer than JSON
    const needsRebuild = !existsSync(jsonPath);
    if (needsRebuild) {
      try {
        execSync(`node scripts/excel-to-ground-truth.js "${xlsxPath}"`, { cwd: repoRoot, stdio: 'pipe' });
        console.log(`  ✓ ${filename} already linked; built JSON`);
        stats.jsonRebuilt++;
      } catch (e) {
        console.log(`  ⚠ ${filename} already linked; JSON build failed: ${e.message}`);
      }
    } else {
      console.log(`  ✓ ${filename} already linked (${String(existingJobId).slice(0, 8)}…)`);
    }
    continue;
  }

  // Find candidate jobs on same keeper+date
  const candidates = (jobsByKeeperDate.get(`${keeperId}|${date}`) || [])
    .filter((j) => {
      // Filter out obvious test artifacts
      const opp = (j.match_metadata?.opponent || '').toLowerCase();
      return !opp.includes('test');
    });

  if (candidates.length === 0) {
    // Fallback: allow TEST jobs if there's nothing else
    const testCandidates = jobsByKeeperDate.get(`${keeperId}|${date}`) || [];
    if (testCandidates.length === 0) {
      console.log(`  ✗ ${filename} — no video_job for keeper+date ${date}`);
      skipped.push(`${filename}: no jobs on ${date} for ${keeperSlug}`);
      stats.noMatch++;
      continue;
    }
    // Only TEST jobs — still skip, but note them
    console.log(`  ✗ ${filename} — only TEST jobs on ${date}, skipping`);
    skipped.push(`${filename}: only TEST-labeled jobs on ${date}`);
    stats.noMatch++;
    continue;
  }

  // Score each candidate by opponent slug overlap + status rank
  const scored = candidates.map((j) => {
    const jobOppSlug = slugify(j.match_metadata?.opponent);
    // Simple containment score: does XLSX slug contain the opponent slug (or vice versa)?
    let overlap = 0;
    if (oppSlug && jobOppSlug) {
      if (oppSlug === jobOppSlug) overlap = 100;
      else if (oppSlug.includes(jobOppSlug) || jobOppSlug.includes(oppSlug)) overlap = 50;
      else {
        // Token overlap
        const a = new Set(oppSlug.split('-'));
        const b = new Set(jobOppSlug.split('-'));
        const shared = [...a].filter((t) => b.has(t)).length;
        overlap = shared * 10;
      }
    }
    return { job: j, overlap, statusRank: STATUS_RANK[j.status] ?? 99 };
  });

  scored.sort((a, b) => {
    if (b.overlap !== a.overlap) return b.overlap - a.overlap;
    if (a.statusRank !== b.statusRank) return a.statusRank - b.statusRank;
    return new Date(a.job.created_at).getTime() - new Date(b.job.created_at).getTime();
  });

  const winner = scored[0];
  const isAmbiguous = scored.length > 1 && scored[1].overlap === winner.overlap && scored[1].statusRank === winner.statusRank;

  // Patch XLSX
  meta.getCell(`B${jobIdRow}`).value = winner.job.id;
  await wb.xlsx.writeFile(xlsxPath);

  const winnerOpp = winner.job.match_metadata?.opponent || '(no opponent)';
  const marker = isAmbiguous ? '⚠ AMBIGUOUS' : '→';
  console.log(`  ${marker} ${filename} → ${winner.job.id.slice(0, 8)}… (${winnerOpp} · ${winner.job.status})`);
  if (isAmbiguous) {
    console.log(`      Other candidates on ${date}:`);
    for (const s of scored.slice(1, 4)) {
      console.log(`        ${s.job.id.slice(0, 8)}… ${s.job.match_metadata?.opponent} · ${s.job.status} · overlap=${s.overlap}`);
    }
    stats.ambiguous++;
  }
  stats.patched++;

  // Rebuild JSON
  try {
    execSync(`node scripts/excel-to-ground-truth.js "${xlsxPath}"`, { cwd: repoRoot, stdio: 'pipe' });
    stats.jsonRebuilt++;
  } catch (e) {
    console.log(`    (JSON rebuild failed: ${String(e.message).slice(0, 100)})`);
  }
}

console.log('\n─────────────────────────────────────────────────────────────');
console.log('Summary');
console.log('─────────────────────────────────────────────────────────────');
console.log(`  already linked:  ${stats.alreadyLinked}`);
console.log(`  patched:         ${stats.patched}`);
console.log(`    of which ambiguous (double-check): ${stats.ambiguous}`);
console.log(`  no match:        ${stats.noMatch}`);
console.log(`  JSONs built:     ${stats.jsonRebuilt}`);
if (skipped.length) {
  console.log('\nSkipped:');
  skipped.forEach((s) => console.log(`  - ${s}`));
}
