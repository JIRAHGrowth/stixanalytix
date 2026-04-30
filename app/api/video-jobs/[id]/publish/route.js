import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';

const VALID_ZONES = new Set(['High L','High C','High R','Mid L','Mid C','Mid R','Low L','Low C','Low R']);
const VALID_ORIGINS = new Set(['6yard','boxL','boxC','boxR','outL','outC','outR','cornerL','cornerR','crossL','crossR','unclear']);
const VALID_SOURCES = new Set(['Open Play','Corner','Penalty']);
const VALID_SHOT_TYPES = new Set(['Foot','Header','Deflection','Own Goal']);
const VALID_POSITIONING = new Set(['Set','Moving']);
const VALID_RANKS = new Set(['Saveable','Difficult','Unsaveable']);
const VALID_GK_ACTIONS = new Set(['Catch','Block','Parry','Deflect','Punch','Missed','Goal','unclear']);

const GK_ACTION_TO_COL = {
  Catch:   'saves_catch',
  Parry:   'saves_parry',
  Block:   'saves_block',
  Deflect: 'saves_tip',     // matches existing pitchside mapping (saves_tip = deflect)
  Punch:   'saves_punch',
  // 'Missed' → counts as goal_against, not a save
  // 'Goal' → counts as goal_against, not a save
  // 'unclear' → not counted (coach review needed)
};

function validateConcession(c, i) {
  const errs = [];
  if (c.goal_zone && !VALID_ZONES.has(c.goal_zone)) errs.push(`#${i+1} invalid goal_zone`);
  if (c.shot_origin && !VALID_ORIGINS.has(c.shot_origin)) errs.push(`#${i+1} invalid shot_origin`);
  if (c.goal_source && !VALID_SOURCES.has(c.goal_source)) errs.push(`#${i+1} invalid goal_source`);
  if (c.shot_type && !VALID_SHOT_TYPES.has(c.shot_type)) errs.push(`#${i+1} invalid shot_type`);
  if (c.gk_positioning && !VALID_POSITIONING.has(c.gk_positioning)) errs.push(`#${i+1} invalid gk_positioning`);
  if (c.goal_rank && !VALID_RANKS.has(c.goal_rank)) errs.push(`#${i+1} invalid goal_rank`);
  if (c.half != null && c.half !== 1 && c.half !== 2) errs.push(`#${i+1} half must be 1 or 2`);
  return errs;
}

export async function POST(request, { params }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    console.log('[publish] user.id=' + user.id + ' job_id=' + id);

    // Use admin client for the lookup so we don't get tripped up by RLS edge
    // cases with a stale session. We still verify coach_id == user.id below.
    const admin = createAdminClient();
    const { data: job, error: jobErr } = await admin
      .from('video_jobs').select('*').eq('id', id).maybeSingle();
    if (jobErr) {
      console.error('[publish] job lookup error:', jobErr);
      return NextResponse.json({ error: 'Lookup failed: ' + jobErr.message }, { status: 500 });
    }
    if (!job) {
      console.error('[publish] no job found with id=' + id);
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    if (job.coach_id !== user.id) {
      console.error('[publish] job.coach_id=' + job.coach_id + ' != user.id=' + user.id);
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (job.status !== 'review_needed') {
      return NextResponse.json({ error: `Cannot publish a job in status '${job.status}'` }, { status: 400 });
    }

    const body = await request.json();
    const goalsFor = parseInt(body.goals_for, 10);
    const goalsAgainst = parseInt(body.goals_against, 10);
    if (!Number.isFinite(goalsFor) || goalsFor < 0) return NextResponse.json({ error: 'goals_for must be a non-negative integer' }, { status: 400 });
    if (!Number.isFinite(goalsAgainst) || goalsAgainst < 0) return NextResponse.json({ error: 'goals_against must be a non-negative integer' }, { status: 400 });

    const concessions = Array.isArray(body.concessions) ? body.concessions : [];
    const teamScored = Array.isArray(body.team_scored) ? body.team_scored : [];
    const saves = Array.isArray(body.saves) ? body.saves : [];
    if (concessions.length !== goalsAgainst) {
      return NextResponse.json({ error: `concessions array length (${concessions.length}) must equal goals_against (${goalsAgainst})` }, { status: 400 });
    }
    const validationErrs = concessions.flatMap((c, i) => validateConcession(c, i));
    if (validationErrs.length) return NextResponse.json({ error: validationErrs.join('; ') }, { status: 400 });

    // Compute saves_* counters and shots-on-target from the kept save events
    const saveCounts = { saves_catch: 0, saves_parry: 0, saves_block: 0, saves_tip: 0, saves_punch: 0, saves_dive: 0 };
    let shotsOnTarget = 0, savesTotal = 0;
    for (const s of saves) {
      if (s.on_target === 'yes') shotsOnTarget++;
      const col = GK_ACTION_TO_COL[s.gk_action];
      if (col) {
        saveCounts[col] = (saveCounts[col] || 0) + 1;
        savesTotal++;
      }
    }
    // Goals against also count as shots on target (the shot beat the keeper)
    shotsOnTarget += goalsAgainst;
    const savePct = shotsOnTarget > 0 ? savesTotal / shotsOnTarget : 0;

    const meta = job.match_metadata || {};
    const result = goalsFor > goalsAgainst ? 'Win' : goalsFor < goalsAgainst ? 'Loss' : 'Draw';
    const profile = (await admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle()).data;

    const matchId = crypto.randomUUID();

    const matchRow = {
      id: matchId,
      coach_id: user.id,
      keeper_id: job.keeper_id,
      club_id: job.club_id,
      logged_by: user.id,
      logged_by_name: profile?.full_name || user.email || 'Video upload',
      session_type: meta.session_type || 'match',
      opponent: meta.opponent || null,
      venue: meta.venue || 'home',
      match_date: meta.match_date,
      goals_for: goalsFor,
      goals_against: goalsAgainst,
      result,
      goals_conceded: goalsAgainst,
      shots_on_target: shotsOnTarget,
      saves: savesTotal,
      save_percentage: savePct,
      ...saveCounts,
      was_subbed: !!meta.was_subbed,
      sub_minute: meta.sub_minute || null,
      sub_reason: meta.sub_reason || null,
      source_url: job.video_url || null,
      logged_via: 'video',
      notes: body.notes || null,
    };

    const { error: matchErr } = await admin.from('matches').insert(matchRow);
    if (matchErr) return NextResponse.json({ error: 'Insert match failed: ' + matchErr.message }, { status: 500 });

    if (concessions.length) {
      const goalRows = concessions.map(c => ({
        match_id: matchId,
        coach_id: user.id,
        goal_zone: c.goal_zone || null,
        shot_origin: c.shot_origin || null,
        goal_source: c.goal_source || null,
        goal_rank: c.goal_rank || null,
        shot_type: c.shot_type || null,
        gk_positioning: c.gk_positioning || null,
        half: c.half || null,
        // Convert timestamp_seconds (from video clock or coach input) into a
        // game-clock minute for reporting. Approximate — coach can edit later.
        minute: Number.isFinite(c.timestamp_seconds) ? Math.floor(c.timestamp_seconds / 60) : null,
      }));
      const { error: gErr } = await admin.from('goals_conceded').insert(goalRows);
      if (gErr) {
        // Rollback the match insert so we don't leave an orphaned row
        await admin.from('matches').delete().eq('id', matchId);
        return NextResponse.json({ error: 'Insert concessions failed: ' + gErr.message }, { status: 500 });
      }
    }

    // Phase 2.1 — write a shot_events row per kept save event.
    // Schema: match_id, keeper_id, coach_id, shot_origin, gk_action, goal_zone,
    //         is_goal, is_off_target, shot_type, event_type, half
    if (saves.length) {
      const shotRows = saves.map(s => {
        const isGoal = s.gk_action === 'Goal';
        const isOffTarget = s.on_target === 'no';
        // Map our 3-third side + height into the 9-zone label the dashboard uses
        // ("High L", "Mid C", etc.). Best-effort — review screen captures both.
        let goalZone = null;
        if (s.goal_placement_height && s.goal_placement_side) {
          const h = s.goal_placement_height === 'top' ? 'High'
                  : s.goal_placement_height === 'mid' ? 'Mid'
                  : s.goal_placement_height === 'low' ? 'Low' : null;
          const sd = s.goal_placement_side === 'left_third' ? 'L'
                   : s.goal_placement_side === 'centre' ? 'C'
                   : s.goal_placement_side === 'right_third' ? 'R' : null;
          if (h && sd) goalZone = `${h} ${sd}`;
        }
        return {
          match_id: matchId,
          keeper_id: job.keeper_id,
          coach_id: user.id,
          shot_origin: s.shot_origin === 'unclear' ? null : (s.shot_origin || null),
          gk_action: s.gk_action === 'unclear' ? null : (s.gk_action || null),
          goal_zone: goalZone,
          is_goal: isGoal,
          is_off_target: isOffTarget,
          shot_type: s.shot_type || null,
          event_type: 'Shot',
          half: null, // pitchside uses 'H1'/'H2'; we don't capture that today
        };
      });
      const { error: seErr } = await admin.from('shot_events').insert(shotRows);
      if (seErr) {
        console.error('shot_events insert failed (non-fatal):', seErr);
        // Don't roll back the match — shot_events are supplementary.
      }
    }

    const { error: updErr } = await admin.from('video_jobs').update({
      status: 'published',
      published_match_id: matchId,
      reviewed_output: { goals_for: goalsFor, goals_against: goalsAgainst, concessions, saves_count: saves.length },
    }).eq('id', id);
    if (updErr) {
      // Match landed but we couldn't flag the job — non-fatal but log it.
      console.error('Failed to mark job published:', updErr);
    }

    // D11: write coach_corrections rows so future analyses for this coach can
    // be calibrated against past corrections. Non-fatal if this fails.
    try {
      const corrections = computeCorrections({
        geminiOutput: job.gemini_output,
        reviewDiff: body.review_diff,
        meta,
        coachId: user.id,
        videoJobId: id,
        matchId,
      });
      if (corrections.length) {
        const { error: corrErr } = await admin.from('coach_corrections').insert(corrections);
        if (corrErr) console.error('coach_corrections insert failed:', corrErr);
        else console.log(`[publish] wrote ${corrections.length} coach_corrections row(s)`);
      }
    } catch (e) {
      console.error('coach_corrections diff failed (non-fatal):', e);
    }

    // Clean up the uploaded video file once we have the analyzed output safely
    // in matches/goals_conceded. Storage isn't free.
    if (job.storage_path) {
      admin.storage.from('match-videos').remove([job.storage_path]).catch(() => {});
    }

    return NextResponse.json({ match_id: matchId, ok: true });
  } catch (err) {
    console.error('publish error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * D11 — diff Gemini's output against the coach's review and produce
 * coach_corrections rows. We're conservative: only emit corrections when
 * we have a clear signal. This data is the lifeblood of the per-coach
 * calibration loop, so quality > quantity.
 */
function computeCorrections({ geminiOutput, reviewDiff, meta, coachId, videoJobId, matchId }) {
  const out = [];
  const geminiGoals = geminiOutput?.parsed?.goals || [];
  const myColor = String(meta?.my_team_color || '').toLowerCase();
  const oppColor = String(meta?.opponent_color || '').toLowerCase();
  const baseRow = (correction_type, gemini_value, coach_value) => ({
    coach_id: coachId,
    video_job_id: videoJobId,
    match_id: matchId,
    correction_type,
    gemini_value: gemini_value || null,
    coach_value: coach_value || null,
    match_metadata: {
      my_team_color: meta?.my_team_color,
      opponent_color: meta?.opponent_color,
      my_keeper_color: meta?.my_keeper_color,
      session_type: meta?.session_type,
      opponent: meta?.opponent,
      // Capture whether scoreboard was visible in Gemini's view — useful
      // calibration signal (no-scoreboard youth video has different error
      // patterns than broadcast).
      scoreboard_visible_any: geminiGoals.some(g =>
        g.scoreboard_before && g.scoreboard_before !== 'not_visible' && g.scoreboard_before !== ''
      ),
    },
  });

  if (!reviewDiff) return out;

  // Walk each Gemini candidate and the coach's verdict on it
  for (const cand of (reviewDiff.candidates || [])) {
    const gemini = geminiGoals[cand.gemini_index];
    if (!gemini) continue;
    const geminiThinksMyTeamScored =
      myColor && String(gemini.scoring_team || '').toLowerCase().includes(myColor);
    const geminiThinksOppScored =
      oppColor && String(gemini.scoring_team || '').toLowerCase().includes(oppColor);

    if (!cand.keep) {
      out.push(baseRow('false_positive', gemini, null));
      continue;
    }

    // Team flip detection
    if (cand.scored_by_us === true && geminiThinksOppScored) {
      out.push(baseRow('wrong_team', gemini, { scored_by: 'us' }));
    } else if (cand.scored_by_us === false && geminiThinksMyTeamScored) {
      out.push(baseRow('wrong_team', gemini, { scored_by: 'opponent' }));
    }

    // Field-level corrections (only meaningful for concessions where we
    // capture structured fields)
    if (cand.scored_by_us === false && cand.edited_fields) {
      // Compare Gemini's defaults to coach's pick. We re-derive Gemini's
      // suggested values the same way the review screen does so we can tell
      // what was changed.
      const geminiZone = mapZone(gemini);
      const geminiSource = mapSource(gemini.attack_type);
      const geminiShotType = mapShotType(gemini.shot_type);
      const f = cand.edited_fields;

      if (f.goal_zone && geminiZone && f.goal_zone !== geminiZone) {
        out.push(baseRow('wrong_zone',
          { gemini_zone: geminiZone, gemini_height: gemini.goal_placement_height, gemini_side: gemini.goal_placement_side },
          { coach_zone: f.goal_zone }));
      }
      if (f.goal_source && geminiSource && f.goal_source !== geminiSource) {
        out.push(baseRow('wrong_attack_type',
          { gemini_attack_type: gemini.attack_type, mapped: geminiSource },
          { coach_source: f.goal_source }));
      }
      if (f.shot_type && geminiShotType && f.shot_type !== geminiShotType) {
        out.push(baseRow('wrong_shot_type',
          { gemini_shot_type: gemini.shot_type, mapped: geminiShotType },
          { coach_shot_type: f.shot_type }));
      }
    }

    // If the candidate was kept with no team flip and no field change, that's
    // a positive signal (model got it right or close enough).
    const teamFlipped =
      (cand.scored_by_us === true && geminiThinksOppScored) ||
      (cand.scored_by_us === false && geminiThinksMyTeamScored);
    if (cand.keep && !teamFlipped) {
      out.push(baseRow('kept_as_is', gemini, { notes: cand.notes || null }));
    }
  }

  // Extras — coach added goals Gemini missed. Each is a missed_goal correction.
  for (const ex of (reviewDiff.extras || [])) {
    out.push(baseRow('missed_goal',
      null,
      {
        scored_by_us: ex.scored_by_us,
        timestamp_seconds: ex.timestamp_seconds,
        timestamp_str: ex.timestamp_str,
        notes: ex.notes,
        fields: ex.fields,
      }));
  }

  return out;
}

// Mirrors the defaults in app/upload/[jobId]/review/page.jsx — kept here so
// the publish API can compute the same Gemini-suggested values for diffing.
function mapZone(g) {
  const h = String(g.goal_placement_height || '').toLowerCase();
  const s = String(g.goal_placement_side || '').toLowerCase();
  let height = '';
  if (h.startsWith('top')) height = 'High';
  else if (h.startsWith('mid')) height = 'Mid';
  else if (h.startsWith('low')) height = 'Low';
  let side = '';
  if (s === 'centre' || s === 'center') side = 'C';
  if (!height || !side) return null;
  return `${height} ${side}`;
}
function mapSource(attack_type) {
  const v = String(attack_type || '').toLowerCase();
  if (v === 'corner') return 'Corner';
  if (v === 'penalty') return 'Penalty';
  if (v === 'open_play' || v === 'counter_attack') return 'Open Play';
  return null;
}
function mapShotType(shot_type) {
  const v = String(shot_type || '').toLowerCase();
  if (v.includes('header')) return 'Header';
  if (v.includes('deflection')) return 'Deflection';
  return 'Foot';
}
