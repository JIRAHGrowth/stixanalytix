// Verify Amalie is ready to eval: XLSX events counted + Gemini output populated
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ExcelJS from 'exceljs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(join(repoRoot, '.env.local'), 'utf8')
  .split('\n').filter((l) => l && !l.startsWith('#')).reduce((a, l) => {
    const eq = l.indexOf('='); if (eq === -1) return a;
    a[l.slice(0, eq).trim()] = l.slice(eq + 1).trim().replace(/^["']|["']$/g, ''); return a;
  }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// XLSX row counts
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(join(repoRoot, 'scripts/ground-truth/amalie-2026-02-27-cmf-2008.xlsx'));
const sheetNames = ['Goals', 'Saves', 'Distribution', 'Crosses', 'Sweeper', '1v1s'];
console.log('=== XLSX EVENT COUNTS (excluding header + sample row) ===');
for (const name of sheetNames) {
  const ws = wb.getWorksheet(name);
  if (!ws) { console.log(`  ${name}: sheet missing`); continue; }
  // Count non-empty rows past row 2 (row 1 = header, row 2 = sample). Consider empty if col A is blank.
  let real = 0;
  for (let r = 3; r <= ws.rowCount; r++) {
    const cell = ws.getCell(`A${r}`).value;
    if (cell !== null && cell !== undefined && String(cell).trim() !== '') real++;
  }
  // Also check row 2 — coach may have overwritten the sample with real data
  const row2 = ws.getCell(`A2`).value;
  const row2NonSample = row2 !== null && row2 !== undefined && String(row2).trim() !== ''
    && !String(ws.getCell('I2').value || '').toLowerCase().includes('sample');
  console.log(`  ${name.padEnd(12)}: ${real} row(s) past row 2${row2NonSample ? ' (+ row 2 may be real)' : ''}`);
}

// XLSX metadata
const meta = wb.getWorksheet('Metadata');
let vJobId = null;
for (let r = 2; r <= meta.lastRow.number; r++) {
  if (meta.getCell(`A${r}`).value === 'video_job_id') vJobId = meta.getCell(`B${r}`).value;
}
console.log('\nXLSX video_job_id:', vJobId);

// Gemini output for the CURRENT (completed) job
const CURRENT_JOB = 'c6e6c58b-c48b-4e99-8059-4dae0f976180';
const { data: job } = await sb.from('video_jobs')
  .select('id, status, gemini_output')
  .eq('id', CURRENT_JOB).single();

console.log('\n=== GEMINI OUTPUT ON JOB', CURRENT_JOB.slice(0, 8), '===');
console.log('  status:', job.status);
const g = job.gemini_output || {};
const goals = g.parsed?.goals || [];
const saves = g.saves?.parsed?.saves || [];
const dist = g.distribution?.parsed?.distribution || [];
console.log('  goals detected:       ', goals.length);
console.log('  saves detected:       ', saves.length);
console.log('  distribution detected:', dist.length);
