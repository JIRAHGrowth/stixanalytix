#!/usr/bin/env node
/**
 * Bench orchestrator — run multiple Gemini models against multiple ground-truth
 * matches, score each result, emit a scorecard CSV + markdown table.
 *
 * Strategic context: this harness is built to OUTLIVE the May 2026 Gemini 2.5
 * → 3.x migration. The same artifact will score a future fine-tuned model
 * against the same ground truth (Nicolas's Proposal #3). Don't add migration-
 * specific logic here — keep it model-agnostic.
 *
 * Usage:
 *   node scripts/bench-models.js \
 *     --models gemini-2.5-pro,gemini-3-pro,gemini-2.5-flash,gemini-3.5-flash \
 *     --truth scripts/ground-truth/judah-2026-05-16-oufc-sosc.json \
 *     --video /abs/path/match.mp4 \
 *     [--tolerance 10] \
 *     [--skip-existing] \
 *     [--out-dir scripts/bench-results]
 *
 * Multi-match: pass --truth and --video multiple times in matched order, or
 * supply --matches-json with [{ key, truth, video }, ...]
 *
 * Each model × match takes ~10–30 minutes (single video upload + 3 prompts).
 * Use --skip-existing to resume after a failed run.
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { estimateMatchCost, LAST_VERIFIED } = require('./lib/gemini-pricing');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_MODELS = [
  'gemini-2.5-pro',
  'gemini-3-pro',
  'gemini-2.5-flash',
  'gemini-3.5-flash',
];

function parseArgs(argv) {
  const out = { models: null, matches: [], tolerance: 10, outDir: null, skipExisting: false };
  const truthList = [];
  const videoList = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    switch (a) {
      case '--models':       out.models = next.split(',').map(s => s.trim()).filter(Boolean); i++; break;
      case '--truth':        truthList.push(path.resolve(next)); i++; break;
      case '--video':        videoList.push(path.resolve(next)); i++; break;
      case '--matches-json': out.matches = JSON.parse(fs.readFileSync(path.resolve(next), 'utf8')); i++; break;
      case '--tolerance':    out.tolerance = parseInt(next, 10); i++; break;
      case '--out-dir':      out.outDir = path.resolve(next); i++; break;
      case '--skip-existing': out.skipExisting = true; break;
      case '--help':
      case '-h':
        printHelp(); process.exit(0);
      default:
        if (a.startsWith('--')) { console.error(`Unknown flag: ${a}`); process.exit(1); }
    }
  }
  if (!out.matches.length) {
    if (truthList.length !== videoList.length) {
      console.error('Mismatched --truth / --video counts (need one of each, paired)');
      process.exit(1);
    }
    out.matches = truthList.map((t, i) => ({
      key: path.basename(t, '.json'),
      truth: t,
      video: videoList[i],
    }));
  }
  if (!out.models) out.models = DEFAULT_MODELS;
  if (!out.outDir) out.outDir = path.join(ROOT, 'scripts', 'bench-results');
  return out;
}

function printHelp() {
  console.log(fs.readFileSync(__filename, 'utf8')
    .split('\n').slice(1, 27).map(l => l.replace(/^\s\*\s?/, '')).join('\n'));
}

function pct(x) { return x == null ? '—' : (x * 100).toFixed(1) + '%'; }
function fmtUsd(x) { return x == null ? '—' : '$' + x.toFixed(2); }

function runBenchJob(model, match, outDir, opts) {
  const outFile = path.join(outDir, match.key, `${model}.json`);
  if (opts.skipExisting && fs.existsSync(outFile)) {
    console.log(`  [skip] ${model} on ${match.key} — output exists`);
    return { outFile, skipped: true };
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const args = [
    path.join(ROOT, 'scripts', 'run-bench-job.py'),
    '--video', match.video,
    '--model', model,
    '--out', outFile,
    '--vars-json', match.truth,
  ];
  console.log(`  [run]  python ${args.slice(1).join(' ')}`);
  const r = spawnSync('python', args, { stdio: 'inherit', cwd: ROOT });
  if (r.status !== 0) {
    console.error(`  [fail] ${model} on ${match.key} (exit ${r.status})`);
    return { outFile, failed: true };
  }
  return { outFile, ok: true };
}

function runEval(geminiOutputFile, truthFile, tolerance) {
  const args = [
    path.join(ROOT, 'scripts', 'eval-match.js'),
    '--truth', truthFile,
    '--gemini-output-file', geminiOutputFile,
    '--tolerance', String(tolerance),
  ];
  const r = spawnSync('node', args, { encoding: 'utf8', cwd: ROOT });
  // Human-readable goes to stdout for the operator; we parse the machine block
  // from stderr (printed after the human report).
  process.stdout.write(r.stdout || '');
  const stderr = r.stderr || '';
  const m = stderr.match(/__BENCH_JSON__(.+)$/m);
  if (!m) {
    if (stderr) process.stderr.write(stderr);
    return null;
  }
  try { return JSON.parse(m[1]); } catch { return null; }
}

function scorecardRow(model, match, variant, evalSummary, benchOutput) {
  const sections = evalSummary?.sections || {};
  const cost = benchOutput ? estimateMatchCost(model, benchOutput) : { usd: null };
  const totalElapsed = benchOutput?.bench_meta?.total_elapsed_sec || null;
  return {
    match: match.key,
    model,
    variant,
    cost_usd: cost.usd,
    elapsed_sec: totalElapsed,
    goals_precision: sections.goals?.precision ?? null,
    goals_recall: sections.goals?.recall ?? null,
    goals_mae_sec: sections.goals?.timestamp_mae_sec ?? null,
    goals_truth: sections.goals?.truth_count ?? null,
    goals_pred:  sections.goals?.pred_count  ?? null,
    saves_precision: sections.saves?.precision ?? null,
    saves_recall: sections.saves?.recall ?? null,
    saves_mae_sec: sections.saves?.timestamp_mae_sec ?? null,
    saves_truth: sections.saves?.truth_count ?? null,
    saves_pred:  sections.saves?.pred_count  ?? null,
    dist_precision: sections.distribution?.precision ?? null,
    dist_recall: sections.distribution?.recall ?? null,
    dist_mae_sec: sections.distribution?.timestamp_mae_sec ?? null,
    dist_truth: sections.distribution?.truth_count ?? null,
    dist_pred:  sections.distribution?.pred_count  ?? null,
  };
}

function emitCsv(rows, outPath) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const lines = [cols.join(',')];
  for (const r of rows) {
    lines.push(cols.map(c => {
      const v = r[c];
      if (v == null) return '';
      if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(4);
      return String(v).replace(/,/g, ';');
    }).join(','));
  }
  fs.writeFileSync(outPath, lines.join('\n'));
}

function emitMarkdown(rows, outPath, meta) {
  const lines = [];
  lines.push(`# Bench scorecard — ${meta.timestamp}`);
  lines.push('');
  lines.push(`Pricing reference: ${LAST_VERIFIED}. Tolerance: ±${meta.tolerance}s.`);
  lines.push('');
  lines.push(`Models: ${meta.models.join(' · ')}`);
  lines.push(`Matches: ${meta.matches.map(m => m.key).join(' · ')}`);
  lines.push('');
  // Top-level summary table — variants ('raw' vs 'reconciled') stacked per model
  lines.push(`## Headline (per match × model × variant)`);
  lines.push('');
  lines.push('Variants: `raw` = model output post-low-signal-saves-filter only. `reconciled` = same output through the production worker\'s `_reconcile_events` (scoreboard delta, evidence count, cross-event collisions, low-conf dist drop). Diff = what the rules buy us per model.');
  lines.push('');
  lines.push('| Match | Model | Variant | $ | Time | Goals P/R/MAE | Saves P/R/MAE | Dist P/R/MAE |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const cell = (p, rec, mae) => `${pct(p)} / ${pct(rec)} / ${mae != null ? mae.toFixed(1) + 's' : '—'}`;
    lines.push(`| ${r.match} | \`${r.model}\` | ${r.variant || '—'} | ${fmtUsd(r.cost_usd)} | ${r.elapsed_sec ? r.elapsed_sec.toFixed(0) + 's' : '—'} | ${cell(r.goals_precision, r.goals_recall, r.goals_mae_sec)} | ${cell(r.saves_precision, r.saves_recall, r.saves_mae_sec)} | ${cell(r.dist_precision, r.dist_recall, r.dist_mae_sec)} |`);
  }
  lines.push('');
  // Event counts (helps spot model that over/under-detects)
  lines.push(`## Detection counts (truth → predicted)`);
  lines.push('');
  lines.push('| Match | Model | Variant | Goals | Saves | Distribution |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of rows) {
    const f = (t, p) => `${t ?? '?'} → ${p ?? '?'}`;
    lines.push(`| ${r.match} | \`${r.model}\` | ${r.variant || '—'} | ${f(r.goals_truth, r.goals_pred)} | ${f(r.saves_truth, r.saves_pred)} | ${f(r.dist_truth, r.dist_pred)} |`);
  }
  lines.push('');
  lines.push(`## Caveats`);
  lines.push('');
  lines.push('- Bench bypasses production chunking / voting / cross-event reconciliation. Compares **raw model quality** on identical prompts.');
  lines.push('- No encyclopedia or per-coach calibration injected. Production runs with both; cache hit rate alters $/match.');
  lines.push('- Cost is computed from the bench run\'s own `usage` tokens × the model\'s published $/M rate (see `scripts/lib/gemini-pricing.js`).');
  lines.push('- Ground-truth schemas have nullable fields (e.g. scoring_team) on early-phase workbooks — expect semantic-mismatch warnings even on correctly-matched events.');
  fs.writeFileSync(outPath, lines.join('\n'));
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.matches.length) {
    console.error('No matches provided. Use --truth + --video, or --matches-json.');
    process.exit(1);
  }
  for (const m of opts.matches) {
    if (!fs.existsSync(m.truth)) { console.error(`Truth file missing: ${m.truth}`); process.exit(1); }
    if (!fs.existsSync(m.video)) { console.error(`Video file missing: ${m.video}`); process.exit(1); }
  }
  fs.mkdirSync(opts.outDir, { recursive: true });

  console.log(`Bench plan: ${opts.models.length} models × ${opts.matches.length} matches = ${opts.models.length * opts.matches.length} runs`);
  console.log(`Models:  ${opts.models.join(', ')}`);
  console.log(`Matches: ${opts.matches.map(m => m.key).join(', ')}`);
  console.log(`Out:     ${path.relative(ROOT, opts.outDir)}`);
  console.log('');

  const rows = [];
  for (const match of opts.matches) {
    for (const model of opts.models) {
      console.log(`▶ ${model} on ${match.key}`);
      const job = runBenchJob(model, match, opts.outDir, opts);
      if (job.failed) {
        rows.push({ match: match.key, model, variant: 'raw', error: 'job_failed' });
        continue;
      }

      // Score both variants the bench job produced — raw (model-only) and
      // reconciled (with production worker's cross-event filters applied).
      // Same model run, two scorecard rows; the diff is the rules' contribution.
      const variants = [
        { name: 'raw', file: job.outFile },
        { name: 'reconciled', file: job.outFile.replace(/\.json$/, '.reconciled.json') },
      ];
      for (const v of variants) {
        if (!fs.existsSync(v.file)) {
          if (v.name === 'raw') {
            console.error(`  [warn] raw output missing: ${v.file}`);
            rows.push({ match: match.key, model, variant: v.name, error: 'output_missing' });
          }
          // reconciled missing is non-fatal — log and skip
          continue;
        }
        let benchPayload = null;
        try { benchPayload = JSON.parse(fs.readFileSync(v.file, 'utf8')); }
        catch (e) { console.error(`  [warn] could not parse ${v.file}: ${e.message}`); }
        const benchOutput = benchPayload?.gemini_output || benchPayload;

        console.log(`  scoring [${v.name}] against ${path.relative(ROOT, match.truth)}...`);
        const evalSummary = runEval(v.file, match.truth, opts.tolerance);
        const row = scorecardRow(model, match, v.name, evalSummary, benchOutput);
        rows.push(row);

        const evalOut = v.file.replace(/\.json$/, '.eval.json');
        fs.writeFileSync(evalOut, JSON.stringify(
          { model, match: match.key, variant: v.name, summary: evalSummary, row },
          null, 2
        ));
      }
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const scorecardDir = path.join(opts.outDir, 'scorecards');
  fs.mkdirSync(scorecardDir, { recursive: true });
  const csvPath = path.join(scorecardDir, `scorecard-${stamp}.csv`);
  const mdPath = path.join(scorecardDir, `scorecard-${stamp}.md`);
  emitCsv(rows, csvPath);
  emitMarkdown(rows, mdPath, { timestamp: stamp, tolerance: opts.tolerance, models: opts.models, matches: opts.matches });
  console.log('');
  console.log(`Scorecard written:`);
  console.log(`  ${path.relative(ROOT, csvPath)}`);
  console.log(`  ${path.relative(ROOT, mdPath)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
