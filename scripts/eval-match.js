/**
 * Match analysis eval harness.
 *
 * Compares Gemini's output for a match against a coach-tagged ground-truth
 * file and prints a precision/recall report card per event type. Run after
 * any prompt change to see whether accuracy improved or regressed.
 *
 * Usage:
 *   node scripts/eval-match.js \
 *     --truth scripts/ground-truth/<match-name>.json \
 *     --job <video_job_id>           # pulls gemini_output from Supabase
 *     [--tolerance 10]               # ±N seconds for matching events
 *     [--save-report]                # write a dated report to scripts/eval-reports/
 *
 * Or compare two Gemini runs against each other (no ground truth):
 *   node scripts/eval-match.js --job <id-A> --vs-job <id-B>
 *
 * Ground-truth format: see scripts/ground-truth/_template.json
 *
 * Matching algorithm: greedy by timestamp. For each ground-truth event,
 * find the closest Gemini event within ±tolerance seconds; mark both as
 * matched. Unmatched ground-truth = false negatives. Unmatched Gemini =
 * false positives.
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    out[key] = val;
  }
  return out;
}

function tsToSeconds(s) {
  if (typeof s === 'number') return s;
  if (typeof s !== 'string') return null;
  const m = /^(\d+):(\d{1,2})$/.exec(s.trim());
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function fmtSec(s) {
  if (s == null || !Number.isFinite(s)) return '?';
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

async function fetchJob(jobId) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars missing');
  const r = await fetch(`${url}/rest/v1/video_jobs?id=eq.${jobId}&select=id,gemini_output,match_metadata`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!r.ok) throw new Error(`Job fetch failed: ${r.status}`);
  const rows = await r.json();
  if (!rows.length) throw new Error(`Job ${jobId} not found`);
  return rows[0];
}

function extractGoals(geminiOutput) {
  const goals = geminiOutput?.parsed?.goals || [];
  return goals.map(g => ({
    timestamp_seconds: g.timestamp_seconds,
    scoring_team: String(g.scoring_team || '').toLowerCase(),
    shot_type: g.shot_type,
    confidence: g.confidence,
  }));
}

function extractSaves(geminiOutput) {
  const saves = geminiOutput?.saves?.parsed?.saves || [];
  return saves.map(s => ({
    timestamp_seconds: s.timestamp_seconds,
    gk_action: s.gk_action,
    on_target: s.on_target,
    body_distance_zone: s.body_distance_zone,
    confidence: s.confidence,
  }));
}

function normaliseTruth(truth) {
  return {
    duration_seconds: truth.duration_seconds || null,
    my_team_color: String(truth.my_team_color || '').toLowerCase(),
    opponent_color: String(truth.opponent_color || '').toLowerCase(),
    goals: (truth.events?.goals || []).map(g => ({
      timestamp_seconds: tsToSeconds(g.timestamp ?? g.timestamp_seconds),
      scoring_team: String(g.scoring_team || '').toLowerCase(),
      shot_type: g.shot_type,
      note: g.note || null,
    })),
    saves: (truth.events?.saves || []).map(s => ({
      timestamp_seconds: tsToSeconds(s.timestamp ?? s.timestamp_seconds),
      gk_action: s.gk_action,
      on_target: s.on_target,
      body_distance_zone: s.body_distance_zone,
      note: s.note || null,
    })),
  };
}

/**
 * Greedy timestamp matching. Returns:
 *   matched: array of [truthIdx, predIdx, deltaSec]
 *   missedTruth: indices into truthList that found no match
 *   extraPred:   indices into predList that found no match
 */
function matchByTimestamp(truthList, predList, tolerance) {
  const matched = [];
  const usedPred = new Set();
  const usedTruth = new Set();

  // Build all candidate pairs sorted by absolute timestamp distance
  const pairs = [];
  truthList.forEach((tr, ti) => {
    predList.forEach((pr, pi) => {
      if (tr.timestamp_seconds == null || pr.timestamp_seconds == null) return;
      const delta = Math.abs(tr.timestamp_seconds - pr.timestamp_seconds);
      if (delta <= tolerance) pairs.push({ ti, pi, delta });
    });
  });
  pairs.sort((a, b) => a.delta - b.delta);

  for (const p of pairs) {
    if (usedTruth.has(p.ti) || usedPred.has(p.pi)) continue;
    matched.push([p.ti, p.pi, p.delta]);
    usedTruth.add(p.ti);
    usedPred.add(p.pi);
  }

  const missedTruth = [];
  truthList.forEach((_, i) => { if (!usedTruth.has(i)) missedTruth.push(i); });
  const extraPred = [];
  predList.forEach((_, i) => { if (!usedPred.has(i)) extraPred.push(i); });

  return { matched, missedTruth, extraPred };
}

function pct(num, den) {
  if (!den) return '—';
  return ((num / den) * 100).toFixed(1) + '%';
}

function reportSection(name, truth, pred, tolerance) {
  const lines = [];
  const { matched, missedTruth, extraPred } = matchByTimestamp(truth, pred, tolerance);
  const tp = matched.length;
  const fp = extraPred.length;
  const fn = missedTruth.length;
  const precision = tp / (tp + fp);
  const recall = tp / (tp + fn);

  lines.push(``);
  lines.push(`═══ ${name.toUpperCase()} ═══`);
  lines.push(`Truth:      ${truth.length}`);
  lines.push(`Gemini:     ${pred.length}`);
  lines.push(`Matched:    ${tp}`);
  lines.push(`Missed:     ${fn}  (Gemini didn't catch)`);
  lines.push(`False pos:  ${fp}  (Gemini reported but not in truth)`);
  lines.push(`Precision:  ${(precision * 100).toFixed(1)}%   (of what Gemini reported, ${pct(tp, tp + fp)} were real)`);
  lines.push(`Recall:     ${(recall * 100).toFixed(1)}%   (of real events, ${pct(tp, tp + fn)} were caught)`);

  if (matched.length) {
    lines.push(``);
    lines.push(`Matched events (truth → Gemini, ±sec):`);
    matched.forEach(([ti, pi, delta]) => {
      const tr = truth[ti];
      const pr = pred[pi];
      const trLabel = name === 'goals'
        ? `${tr.scoring_team || '?'} ${tr.shot_type || ''}`.trim()
        : `${tr.gk_action || '?'}${tr.on_target === 'no' ? ' (off-target)' : ''}`;
      const prLabel = name === 'goals'
        ? `${pr.scoring_team || '?'} ${pr.shot_type || ''}`.trim()
        : `${pr.gk_action || '?'}${pr.on_target === 'no' ? ' (off-target)' : ''}`;
      const semantic = name === 'goals'
        ? (tr.scoring_team && pr.scoring_team && tr.scoring_team !== pr.scoring_team ? '  ⚠ team mismatch' : '')
        : (tr.gk_action && pr.gk_action && tr.gk_action !== pr.gk_action ? `  ⚠ action mismatch (truth ${tr.gk_action} → gemini ${pr.gk_action})` : '');
      lines.push(`  ${fmtSec(tr.timestamp_seconds).padEnd(7)} ${trLabel.padEnd(30)} → ${fmtSec(pr.timestamp_seconds).padEnd(7)} ${prLabel.padEnd(30)} Δ${delta}s${semantic}`);
    });
  }
  if (missedTruth.length) {
    lines.push(``);
    lines.push(`Missed by Gemini (false negatives):`);
    missedTruth.forEach(i => {
      const tr = truth[i];
      const label = name === 'goals'
        ? `${tr.scoring_team || '?'} ${tr.shot_type || ''}`.trim()
        : `${tr.gk_action || '?'}`;
      lines.push(`  ${fmtSec(tr.timestamp_seconds).padEnd(7)} ${label}${tr.note ? ` — ${tr.note}` : ''}`);
    });
  }
  if (extraPred.length) {
    lines.push(``);
    lines.push(`Reported by Gemini but not in truth (false positives):`);
    extraPred.forEach(i => {
      const pr = pred[i];
      const label = name === 'goals'
        ? `${pr.scoring_team || '?'} ${pr.shot_type || ''}`.trim()
        : `${pr.gk_action || '?'}`;
      lines.push(`  ${fmtSec(pr.timestamp_seconds).padEnd(7)} ${label}  (${pr.confidence || '?'} confidence)`);
    });
  }

  // Per-action accuracy for matched saves (was the gk_action right?)
  if (name === 'saves' && matched.length) {
    const actionMatches = matched.filter(([ti, pi]) => {
      const t = truth[ti].gk_action; const p = pred[pi].gk_action;
      return t && p && t === p;
    }).length;
    lines.push(``);
    lines.push(`gk_action accuracy on matched saves: ${actionMatches}/${matched.length}  (${pct(actionMatches, matched.length)})`);
  }

  return { lines, precision, recall, tp, fp, fn };
}

async function main() {
  const args = parseArgs(process.argv);
  const tolerance = parseInt(args.tolerance, 10) || 10;

  if (!args.job) die('--job <video_job_id> is required');

  const jobRow = await fetchJob(args.job);
  console.log(`Loaded job ${jobRow.id}`);
  if (jobRow.match_metadata?.opponent) {
    console.log(`  vs ${jobRow.match_metadata.opponent}, ${jobRow.match_metadata.match_date}`);
  }
  const geminiGoals = extractGoals(jobRow.gemini_output);
  const geminiSaves = extractSaves(jobRow.gemini_output);
  console.log(`  Gemini: ${geminiGoals.length} goals, ${geminiSaves.length} saves`);

  let allLines = [];
  let summary = {};

  if (args.truth) {
    const truth = normaliseTruth(JSON.parse(fs.readFileSync(path.resolve(args.truth), 'utf8')));
    console.log(`Loaded truth: ${truth.goals.length} goals, ${truth.saves.length} saves (duration: ${truth.duration_seconds || '?'}s)`);

    const goalsRpt = reportSection('goals', truth.goals, geminiGoals, tolerance);
    const savesRpt = reportSection('saves', truth.saves, geminiSaves, tolerance);
    allLines = [...goalsRpt.lines, ...savesRpt.lines];
    summary = { goals: goalsRpt, saves: savesRpt };
  } else if (args['vs-job']) {
    const otherRow = await fetchJob(args['vs-job']);
    const otherGoals = extractGoals(otherRow.gemini_output);
    const otherSaves = extractSaves(otherRow.gemini_output);
    console.log(`Compared against job ${otherRow.id}: ${otherGoals.length} goals, ${otherSaves.length} saves`);
    const goalsRpt = reportSection('goals', otherGoals, geminiGoals, tolerance);
    const savesRpt = reportSection('saves', otherSaves, geminiSaves, tolerance);
    allLines = [...goalsRpt.lines, ...savesRpt.lines];
  } else {
    die('Must provide --truth <file> OR --vs-job <id>');
  }

  console.log('');
  console.log(`Match tolerance: ±${tolerance}s`);
  console.log(allLines.join('\n'));

  if (args['save-report']) {
    const dir = path.join(__dirname, 'eval-reports');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const out = path.join(dir, `eval_${args.job}_${stamp}.txt`);
    fs.writeFileSync(out, [
      `Match eval — ${new Date().toISOString()}`,
      `Job: ${args.job}`,
      args.truth ? `Truth: ${args.truth}` : `vs-job: ${args['vs-job']}`,
      `Tolerance: ±${tolerance}s`,
      ...allLines,
    ].join('\n'));
    console.log(`\nReport saved: ${path.relative(process.cwd(), out)}`);
  }
}

function die(msg) { console.error('Error: ' + msg); process.exit(1); }

main().catch(e => { console.error(e); process.exit(1); });
