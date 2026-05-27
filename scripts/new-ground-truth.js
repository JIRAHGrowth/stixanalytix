/**
 * Spawn a new ground-truth workbook from _template.xlsx with the Metadata
 * sheet pre-filled. Replaces the legacy `cp + hand-edit metadata` step.
 *
 * Create mode (default — refuses to overwrite an existing workbook):
 *   node scripts/new-ground-truth.js \
 *     --date 2026-05-16 \
 *     --opponent "OUFC SOSC" \
 *     --score-us 2 --score-them 0 \
 *     --video-job-id <uuid>
 *
 * Patch mode (--patch — updates Metadata on an existing workbook; only the
 * fields whose flags were explicitly passed are written; everything else,
 * including all event sheets, is left untouched):
 *   node scripts/new-ground-truth.js --patch \
 *     --xlsx scripts/ground-truth/judah-2026-05-16-oufc.xlsx \
 *     --my-team-color black --opponent-color maroon --my-keeper-color orange
 *
 * Output path (create mode):
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

// Flag name → Metadata column-A label. Used in both create and patch modes.
// Order matches generate-ground-truth-template.js.
const FLAG_TO_FIELD = {
  date:               'Date',
  opponent:           'Opponent',
  venue:              'Venue',
  'session-type':     'Session type',
  'my-team-color':    'My team color',
  'opponent-color':   'Opponent color',
  'my-keeper-color':  'My GK color',
  'age-group':        'Age group',
  duration:           'Video duration (MM:SS)',
  'score-us':         'Final score — us',
  'score-them':       'Final score — them',
  'video-job-id':     'video_job_id',
};

function resolveValue(flag, args) {
  if (!(flag in args)) return undefined;
  if (flag === 'score-us' || flag === 'score-them') return Number(args[flag]);
  return args[flag];
}

async function runCreate(args) {
  if (!args.date || !args.opponent) {
    console.error('Create mode requires --date YYYY-MM-DD and --opponent "Team name".');
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
    console.error(`Refusing to overwrite ${outPath}. Delete it first, or use --patch to update metadata in place.`);
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(templatePath);
  const meta = wb.getWorksheet('Metadata');
  if (!meta) { console.error('Metadata sheet not found in template — regenerate it.'); process.exit(1); }

  // Default Session type if caller didn't pass one — preserves prior behavior.
  if (!('session-type' in args)) args['session-type'] = 'Match';

  // Auto-derive Match name in create mode (skipped in patch).
  const matchName = `${keeperSlug}-vs-${opponentSlug}-${args.date}`;
  const filled = [];
  for (let r = 2; r <= meta.lastRow.number; r++) {
    const label = meta.getCell(`A${r}`).value;
    if (label === 'Match name') { meta.getCell(`B${r}`).value = matchName; filled.push(`Match name: ${matchName}`); continue; }
    const flag = Object.keys(FLAG_TO_FIELD).find(k => FLAG_TO_FIELD[k] === label);
    const v = flag ? resolveValue(flag, args) : undefined;
    if (v === undefined || v === null || v === '') { meta.getCell(`B${r}`).value = ''; continue; }
    meta.getCell(`B${r}`).value = v;
    filled.push(`${label}: ${v}`);
  }
  await wb.xlsx.writeFile(outPath);
  console.log(`Wrote ${path.relative(process.cwd(), outPath)}`);
  console.log('Pre-filled:');
  filled.forEach(f => console.log(`  - ${f}`));
}

async function runPatch(args) {
  if (!args.xlsx) { console.error('Patch mode requires --xlsx <path-to-existing-workbook>'); process.exit(1); }
  const xlsxPath = path.resolve(args.xlsx);
  if (!fs.existsSync(xlsxPath)) { console.error(`Not found: ${xlsxPath}`); process.exit(1); }

  // Only patch fields that were explicitly passed. Everything else (event
  // sheets, prior metadata) is left untouched.
  const updates = {};
  for (const [flag, label] of Object.entries(FLAG_TO_FIELD)) {
    const v = resolveValue(flag, args);
    if (v !== undefined) updates[label] = v;
  }
  if (Object.keys(updates).length === 0) {
    console.error('Nothing to patch — pass at least one --field=value flag (e.g. --my-team-color black).');
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const meta = wb.getWorksheet('Metadata');
  if (!meta) { console.error('Metadata sheet not found in workbook.'); process.exit(1); }

  const written = [];
  for (let r = 2; r <= meta.lastRow.number; r++) {
    const label = meta.getCell(`A${r}`).value;
    if (label in updates) {
      meta.getCell(`B${r}`).value = updates[label];
      written.push(`${label}: ${updates[label]}`);
      delete updates[label];
    }
  }
  await wb.xlsx.writeFile(xlsxPath);
  console.log(`Patched ${path.relative(process.cwd(), xlsxPath)}`);
  written.forEach(w => console.log(`  - ${w}`));
  const missed = Object.keys(updates);
  if (missed.length) {
    console.warn(`Warning: no row matched the following labels (workbook may need regenerating from template):`);
    missed.forEach(m => console.warn(`  - ${m}`));
    process.exit(2);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.patch) return runPatch(args);
  return runCreate(args);
}

main().catch((e) => { console.error(e); process.exit(1); });
