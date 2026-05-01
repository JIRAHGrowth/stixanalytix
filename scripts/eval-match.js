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

function extractDistribution(geminiOutput) {
  const dist = geminiOutput?.distribution?.parsed?.distribution || [];
  return dist.map(d => ({
    timestamp_seconds: d.timestamp_seconds,
    type: d.type,
    trigger: d.trigger,
    successful: d.successful,
    under_pressure: d.under_pressure,
    confidence: d.confidence,
  }));
}

function extractCrosses(geminiOutput) {
  const c = geminiOutput?.crosses?.parsed?.crosses || [];
  return c.map(x => ({
    timestamp_seconds: x.timestamp_seconds,
    side: x.side,
    gk_action: x.gk_action,
    outcome: x.outcome,
    confidence: x.confidence,
  }));
}

function extractSweeper(geminiOutput) {
  const sw = geminiOutput?.sweeper?.parsed?.sweeper || [];
  return sw.map(s => ({
    timestamp_seconds: s.timestamp_seconds,
    action: s.action,
    successful: s.successful,
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
    distribution: (truth.events?.distribution || []).map(d => ({
      timestamp_seconds: tsToSeconds(d.timestamp ?? d.timestamp_seconds),
      type: d.type,
      trigger: d.trigger,
      successful: d.successful,
      under_pressure: d.under_pressure,
      note: d.note || null,
    })),
    crosses: (truth.events?.crosses || []).map(c => ({
      timestamp_seconds: tsToSeconds(c.timestamp ?? c.timestamp_seconds),
      side: c.side,
      gk_action: c.gk_action,
      outcome: c.outcome,
      note: c.note || null,
    })),
    sweeper: (truth.events?.sweeper || []).map(s => ({
      timestamp_seconds: tsToSeconds(s.timestamp ?? s.timestamp_seconds),
      action: s.action,
      successful: s.successful,
      note: s.note || null,
    })),
    distribution_summary: truth.distribution_summary || null,
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

// Per-event-type label functions used in the report — keep this map small and
// easy to extend as we add Phase 2.x event types.
const LABELERS = {
  goals: (e) => `${e.scoring_team || '?'} ${e.shot_type || ''}`.trim(),
  saves: (e) => `${e.gk_action || '?'}${e.on_target === 'no' ? ' (off-target)' : ''}`,
  distribution: (e) => `${e.type || '?'}${e.trigger ? ` (${e.trigger})` : ''}${e.under_pressure ? ' [pressured]' : ''}${e.successful === false ? ' ✗' : ''}`,
  crosses: (e) => `${e.side || '?'} → ${e.gk_action || '?'}${e.outcome ? ` (${e.outcome})` : ''}`,
  sweeper: (e) => `${e.action || '?'}${e.successful === false ? ' ✗' : ''}`,
};

const SEMANTIC_CHECKS = {
  goals: (tr, pr) => (tr.scoring_team && pr.scoring_team && tr.scoring_team !== pr.scoring_team) ? `  ⚠ team mismatch (${tr.scoring_team} vs ${pr.scoring_team})` : '',
  saves: (tr, pr) => (tr.gk_action && pr.gk_action && tr.gk_action !== pr.gk_action) ? `  ⚠ action mismatch (truth ${tr.gk_action} → gemini ${pr.gk_action})` : '',
  distribution: (tr, pr) => (tr.type && pr.type && tr.type !== pr.type) ? `  ⚠ type mismatch (${tr.type} vs ${pr.type})` : '',
  crosses: (tr, pr) => (tr.gk_action && pr.gk_action && tr.gk_action !== pr.gk_action) ? `  ⚠ action mismatch (${tr.gk_action} vs ${pr.gk_action})` : '',
  sweeper: (tr, pr) => (tr.action && pr.action && tr.action !== pr.action) ? `  ⚠ action mismatch (${tr.action} vs ${pr.action})` : '',
};

function reportSection(name, truth, pred, tolerance) {
  const lines = [];
  const { matched, missedTruth, extraPred } = matchByTimestamp(truth, pred, tolerance);
  const tp = matched.length;
  const fp = extraPred.length;
  const fn = missedTruth.length;
  const precision = (tp + fp) > 0 ? tp / (tp + fp) : 0;
  const recall = (tp + fn) > 0 ? tp / (tp + fn) : 0;
  const labeler = LABELERS[name] || ((e) => JSON.stringify(e));
  const semantic = SEMANTIC_CHECKS[name] || (() => '');

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
      lines.push(`  ${fmtSec(tr.timestamp_seconds).padEnd(7)} ${labeler(tr).padEnd(36)} → ${fmtSec(pr.timestamp_seconds).padEnd(7)} ${labeler(pr).padEnd(36)} Δ${delta}s${semantic(tr, pr)}`);
    });
  }
  if (missedTruth.length) {
    lines.push(``);
    lines.push(`Missed by Gemini (false negatives):`);
    missedTruth.forEach(i => {
      const tr = truth[i];
      lines.push(`  ${fmtSec(tr.timestamp_seconds).padEnd(7)} ${labeler(tr)}${tr.note ? ` — ${tr.note}` : ''}`);
    });
  }
  if (extraPred.length) {
    lines.push(``);
    lines.push(`Reported by Gemini but not in truth (false positives):`);
    extraPred.forEach(i => {
      const pr = pred[i];
      lines.push(`  ${fmtSec(pr.timestamp_seconds).padEnd(7)} ${labeler(pr)}  (${pr.confidence || '?'} confidence)`);
    });
  }

  // Per-event-type semantic accuracy on matched events
  if (matched.length) {
    if (name === 'saves') {
      const actionMatches = matched.filter(([ti, pi]) => {
        const t = truth[ti].gk_action; const p = pred[pi].gk_action;
        return t && p && t === p;
      }).length;
      lines.push(``);
      lines.push(`gk_action accuracy on matched saves: ${actionMatches}/${matched.length}  (${pct(actionMatches, matched.length)})`);
    } else if (name === 'distribution') {
      const typeMatches = matched.filter(([ti, pi]) => {
        const t = truth[ti].type; const p = pred[pi].type;
        return t && p && t === p;
      }).length;
      const triggerMatches = matched.filter(([ti, pi]) => {
        const t = truth[ti].trigger; const p = pred[pi].trigger;
        return t && p && t === p;
      }).length;
      lines.push(``);
      lines.push(`type accuracy on matched distributions: ${typeMatches}/${matched.length}  (${pct(typeMatches, matched.length)})`);
      lines.push(`trigger accuracy on matched distributions: ${triggerMatches}/${matched.length}  (${pct(triggerMatches, matched.length)})`);
    } else if (name === 'crosses') {
      const actionMatches = matched.filter(([ti, pi]) => {
        const t = truth[ti].gk_action; const p = pred[pi].gk_action;
        return t && p && t === p;
      }).length;
      lines.push(``);
      lines.push(`gk_action accuracy on matched crosses: ${actionMatches}/${matched.length}  (${pct(actionMatches, matched.length)})`);
    } else if (name === 'sweeper') {
      const actionMatches = matched.filter(([ti, pi]) => {
        const t = truth[ti].action; const p = pred[pi].action;
        return t && p && t === p;
      }).length;
      lines.push(``);
      lines.push(`action accuracy on matched sweeper events: ${actionMatches}/${matched.length}  (${pct(actionMatches, matched.length)})`);
    }
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
  const geminiDist = extractDistribution(jobRow.gemini_output);
  const geminiCrosses = extractCrosses(jobRow.gemini_output);
  const geminiSweeper = extractSweeper(jobRow.gemini_output);
  console.log(`  Gemini: ${geminiGoals.length} goals · ${geminiSaves.length} saves · ${geminiDist.length} dist · ${geminiCrosses.length} crosses · ${geminiSweeper.length} sweeper`);

  let allLines = [];
  let summary = {};

  if (args.truth) {
    const truth = normaliseTruth(JSON.parse(fs.readFileSync(path.resolve(args.truth), 'utf8')));
    console.log(`Loaded truth: ${truth.goals.length} goals · ${truth.saves.length} saves · ${truth.distribution.length} dist · ${truth.crosses.length} crosses · ${truth.sweeper.length} sweeper`);
    if (truth.duration_seconds) console.log(`  duration: ${truth.duration_seconds}s`);

    const goalsRpt   = reportSection('goals',        truth.goals,        geminiGoals,   tolerance);
    const savesRpt   = reportSection('saves',        truth.saves,        geminiSaves,   tolerance);
    const distRpt    = truth.distribution.length || geminiDist.length    ? reportSection('distribution', truth.distribution, geminiDist,    tolerance) : null;
    const crossesRpt = truth.crosses.length      || geminiCrosses.length ? reportSection('crosses',      truth.crosses,      geminiCrosses, tolerance) : null;
    const sweeperRpt = truth.sweeper.length      || geminiSweeper.length ? reportSection('sweeper',      truth.sweeper,      geminiSweeper, tolerance) : null;

    allLines = [
      ...goalsRpt.lines, ...savesRpt.lines,
      ...(distRpt    ? distRpt.lines    : []),
      ...(crossesRpt ? crossesRpt.lines : []),
      ...(sweeperRpt ? sweeperRpt.lines : []),
    ];
    summary = { goals: goalsRpt, saves: savesRpt, distribution: distRpt, crosses: crossesRpt, sweeper: sweeperRpt };
  } else if (args['vs-job']) {
    const otherRow = await fetchJob(args['vs-job']);
    const oG  = extractGoals(otherRow.gemini_output);
    const oS  = extractSaves(otherRow.gemini_output);
    const oD  = extractDistribution(otherRow.gemini_output);
    const oC  = extractCrosses(otherRow.gemini_output);
    const oSw = extractSweeper(otherRow.gemini_output);
    console.log(`Compared against job ${otherRow.id}: ${oG.length} goals · ${oS.length} saves · ${oD.length} dist · ${oC.length} crosses · ${oSw.length} sweeper`);
    const goalsRpt   = reportSection('goals',        oG,  geminiGoals,   tolerance);
    const savesRpt   = reportSection('saves',        oS,  geminiSaves,   tolerance);
    const distRpt    = oD.length  || geminiDist.length    ? reportSection('distribution', oD, geminiDist,    tolerance) : null;
    const crossesRpt = oC.length  || geminiCrosses.length ? reportSection('crosses',      oC, geminiCrosses, tolerance) : null;
    const sweeperRpt = oSw.length || geminiSweeper.length ? reportSection('sweeper',      oSw, geminiSweeper, tolerance) : null;
    allLines = [
      ...goalsRpt.lines, ...savesRpt.lines,
      ...(distRpt    ? distRpt.lines    : []),
      ...(crossesRpt ? crossesRpt.lines : []),
      ...(sweeperRpt ? sweeperRpt.lines : []),
    ];
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
