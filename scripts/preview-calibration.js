/**
 * Preview the per-coach D11 calibration preamble.
 *
 * Mirrors the Python logic in worker/app.py::_build_calibration_preamble.
 * Run locally to see what would be prepended to the next Gemini analysis
 * for a given coach — handy for tuning the preamble's wording without
 * burning a real Gemini analysis.
 *
 * Usage:
 *   node scripts/preview-calibration.js [coach-uuid]
 *   (defaults to the dev coach if omitted)
 */

require('dotenv').config({ path: '.env.local' });

const DEFAULT_COACH = 'eb7e8a7a-1e3c-4454-b5f8-2d03bf952e4f';
const LIMIT = 30;

async function fetchCorrections(coachId) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/coach_corrections?coach_id=eq.${coachId}&order=created_at.desc&limit=${LIMIT}&select=correction_type,gemini_value,coach_value,match_metadata,created_at`;
  const res = await fetch(url, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function buildPreamble(rows) {
  if (!rows.length) return '';

  const byType = {};
  for (const r of rows) {
    (byType[r.correction_type] = byType[r.correction_type] || []).push(r);
  }
  const n = (k) => (byType[k] || []).length;

  const nTotal = rows.length;
  const nKept = n('kept_as_is');
  const nFalsePos = n('false_positive');
  const nMissed = n('missed_goal');
  const nTeamFlipped = n('wrong_team');
  const nZone = n('wrong_zone');
  const nAttack = n('wrong_attack_type');
  const nShot = n('wrong_shot_type');

  const lines = [
    '# CALIBRATION FROM THIS COACH',
    '',
    `This coach has reviewed ${nTotal} of your past goal candidates across previous matches.`,
    `They kept ${nKept} as-is, rejected ${nFalsePos} as false positives, ` +
    `added ${nMissed} goals you missed, ` +
    `flipped ${nTeamFlipped} on scoring team, and edited fields on ` +
    `${nZone + nAttack + nShot} (zone/attack/shot type).`,
    '',
    'Apply this calibration:',
    '',
  ];

  if (nFalsePos) {
    const examples = (byType.false_positive || []).slice(0, 5);
    const shotTypes = examples.map(e => String((e.gemini_value || {}).shot_type || '').toLowerCase());
    const reboundCount = shotTypes.filter(s => s.includes('rebound')).length;
    lines.push(`- You over-detect (${nFalsePos} false-positives in last ${nTotal}). ` +
      (reboundCount >= 2
        ? `Many were rebounds (rebound count: ${reboundCount}). Treat rebound shots as continuations of one play, not new goals.`
        : 'Be more conservative — require clear celebration AND restart, not just ball-in-net frames.'));
  }

  if (nMissed) {
    const examples = (byType.missed_goal || []).slice(0, 5);
    const oppMisses = examples.filter(e => (e.coach_value || {}).scored_by_us === false).length;
    const myMisses = examples.filter(e => (e.coach_value || {}).scored_by_us === true).length;
    if (oppMisses > myMisses) {
      lines.push(`- You under-detect goals scored by the OPPONENT (${oppMisses} of ${nMissed} missed goals were the opponent's). On lopsided matches, the dominated team's rare goals are easy to miss — watch for them deliberately, especially against the run of play.`);
    } else if (myMisses > oppMisses) {
      lines.push(`- You under-detect goals scored by the analyzed team (${myMisses} of ${nMissed} missed goals). Don't let the analyzed team's dominance make you complacent on confirmed celebrations.`);
    } else {
      lines.push(`- You missed ${nMissed} real goals. Re-read the rule: a goal counts only on celebration + restart OR scoreboard change. If both are clear, count it even if camera quality is poor.`);
    }
  }

  if (nTeamFlipped) {
    lines.push(`- You misattribute scoring_team frequently (${nTeamFlipped} flips in last ${nTotal}). When the ball crosses the line, find the celebrating jerseys and the team kicking off afterwards. Use the colour labels exactly as defined in MATCH CONTEXT.`);
  }

  if (nZone) {
    lines.push(`- This coach has corrected your \`goal_placement\` mapping ${nZone} times. Be precise on \`top/mid/low\` and \`near_post/centre/far_post\` — re-watch the frame where the ball crosses the line, don't approximate.`);
  }

  if (nAttack) {
    lines.push(`- This coach has corrected your \`attack_type\` ${nAttack} times. Use the strict definitions: \`corner\` only if from a corner kick directly, \`counter_attack\` only if your team won the ball in own half and scored within ~20s, \`open_play\` is the default. Don't conflate them.`);
  }

  if (![nFalsePos, nMissed, nTeamFlipped, nZone, nAttack, nShot].some(x => x > 0)) {
    lines.push(`- This coach has accepted all ${nKept} of your past candidates without changes. Your judgment is calibrated for this coach's matches; continue applying the same standards.`);
  }

  lines.push('');
  lines.push("Apply this calibration silently — don't mention it in your output. Just let it shift your thresholds and labels.");
  return lines.join('\n');
}

async function main() {
  const coachId = process.argv[2] || DEFAULT_COACH;
  console.log(`Fetching last ${LIMIT} corrections for coach ${coachId}...\n`);

  const rows = await fetchCorrections(coachId);
  console.log(`Found ${rows.length} correction(s).\n`);

  if (!rows.length) {
    console.log('No corrections yet — preamble would be empty (no calibration sent).');
    return;
  }

  const counts = {};
  for (const r of rows) counts[r.correction_type] = (counts[r.correction_type] || 0) + 1;
  console.log('By type:');
  Object.entries(counts).sort().forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log('');

  console.log('═══════════════════════════════════════════════════════════');
  console.log('PREAMBLE THAT WOULD BE PREPENDED TO THE NEXT GEMINI PROMPT');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(buildPreamble(rows));
  console.log('\n═══════════════════════════════════════════════════════════');

  const preamble = buildPreamble(rows);
  console.log(`\nPreamble: ${preamble.length} chars (~${Math.round(preamble.length / 4)} tokens, ~$${(preamble.length / 4 / 1_000_000 * 1.25).toFixed(5)} added per Pro analysis)`);
}

main().catch(e => { console.error('Failed:', e.message || e); process.exit(1); });
