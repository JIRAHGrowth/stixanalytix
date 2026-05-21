/**
 * Spawn a new ground-truth workbook from _template.xlsx with the Metadata
 * sheet pre-filled. Replaces the legacy `cp + hand-edit metadata` step.
 *
 * Usage:
 *   node scripts/new-ground-truth.js \
 *     --date 2026-05-16 \
 *     --opponent "OUFC SOSC" \
 *     --score-us 2 --score-them 0 \
 *     --video-job-id <uuid>
 *
 * Output path:
 *   scripts/ground-truth/<keeper-slug>-<date>-<opponent-slug>.xlsx
 * (keeper-slug defaults to "judah")
 *
 * Any metadata field can be passed via flag; anything omitted is left blank
 * for the coach to fill while watching the recording.
 */

const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function slugify(s) {
  return String(s).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Label in column A → arg resolver. Order matches generate-ground-truth-template.js.
const FIELD_RESOLVERS = {
  'Match name':             (a) => `${a['keeper-slug'] || 'judah'}-vs-${slugify(a.opponent)}-${a.date}`,
  'Date':                   (a) => a.date,
  'Opponent':               (a) => a.opponent,
  'Venue':                  (a) => a.venue,
  'Session type':           (a) => a['session-type'] || 'Match',
  'My team color':          (a) => a['my-team-color'],
  'Opponent color':         (a) => a['opponent-color'],
  'My GK color':            (a) => a['my-keeper-color'],
  'Age group':              (a) => a['age-group'],
  'Video duration (MM:SS)': (a) => a.duration,
  'Final score — us':   (a) => a['score-us'] !== undefined ? Number(a['score-us']) : undefined,
  'Final score — them': (a) => a['score-them'] !== undefined ? Number(a['score-them']) : undefined,
  'video_job_id':           (a) => a['video-job-id'],
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.date || !args.opponent) {
    console.error('Usage: node scripts/new-ground-truth.js --date YYYY-MM-DD --opponent "Team name" [more flags]');
    process.exit(1);
  }

  const keeperSlug = args['keeper-slug'] || 'judah';
  const opponentSlug = slugify(args.opponent);
  const outName = `${keeperSlug}-${args.date}-${opponentSlug}.xlsx`;
  const outDir = path.join(__dirname, 'ground-truth');
  const templatePath = path.join(outDir, '_template.xlsx');
  const outPath = path.join(outDir, outName);

  if (!fs.existsSync(templatePath)) {
    console.error(`Template not found at ${templatePath}. Run: node scripts/generate-ground-truth-template.js`);
    process.exit(1);
  }
  if (fs.existsSync(outPath)) {
    console.error(`Refusing to overwrite ${outPath}. Delete it first if you really want to regenerate.`);
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(templatePath);
  const meta = wb.getWorksheet('Metadata');
  if (!meta) {
    console.error('Metadata sheet not found in template — regenerate it.');
    process.exit(1);
  }

  const lastRow = meta.lastRow.number;
  const filled = [];
  for (let r = 2; r <= lastRow; r++) {
    const label = meta.getCell(`A${r}`).value;
    const resolver = FIELD_RESOLVERS[label];
    if (!resolver) continue;
    const v = resolver(args);
    if (v === undefined || v === null || v === '') {
      meta.getCell(`B${r}`).value = '';
      continue;
    }
    meta.getCell(`B${r}`).value = v;
    filled.push(`${label}: ${v}`);
  }

  await wb.xlsx.writeFile(outPath);
  console.log(`Wrote ${path.relative(process.cwd(), outPath)}`);
  console.log('Pre-filled:');
  filled.forEach(f => console.log(`  - ${f}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
