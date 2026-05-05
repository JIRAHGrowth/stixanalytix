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

// Coerce Gemini's stringly-typed booleans ("true"/"false"/"unclear") into a
// nullable Postgres boolean. Anything we can't read confidently → null.
// Used for distribution.successful on insert.
function coerceTriBool(v) {
  if (v === true || v === false) return v;
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (s === 'true' || s === 'yes') return true;
  if (s === 'false' || s === 'no') return false;
  return null;
}

// Phase 2.4 — `press_state` enum coercion to legacy `under_pressure` boolean.
// New runs emit press_state ∈ {unpressed, pressed, unclear}; older runs emit
// under_pressure boolean. This handles both, mapping to the existing
// distribution_events.under_pressure boolean column for downstream consistency.
function coercePressState(d) {
  // Prefer new field if present
  const ps = (d.press_state || '').trim().toLowerCase();
  if (ps === 'pressed') return true;
  if (ps === 'unpressed') return false;
  if (ps === 'unclear') return null;
  // Fallback to legacy boolean field
  return coerceTriBool(d.under_pressure);
}

function emptyToNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

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

    // Compute counts from the kept save events.
    //
    //   shots_faced       = every save event + goals against. The "how many times
    //                       did the GK have to react" number a coach intuits.
    //   shots_on_target   = on-target saves + goals against. The "saveable shots"
    //                       count — what save% is traditionally calculated against.
    //   saves             = total save actions (Catch/Parry/Block/Deflect/Punch),
    //                       regardless of on_target. This is the coach's intuitive
    //                       "16 saves" number; counts every successful handle.
    //   saves_*           = per-action breakdowns of `saves` (also include all
    //                       save actions, on-target or not).
    //   save_percentage   = (on-target saves) / shots_on_target. Capped at 1.0.
    //                       Off-target saves don't count toward save% because the
    //                       shot wouldn't have been a goal anyway. This avoids the
    //                       >100% bug while keeping `saves` intuitive.
    const saveCounts = { saves_catch: 0, saves_parry: 0, saves_block: 0, saves_tip: 0, saves_punch: 0, saves_dive: 0 };
    let shotsOnTarget = 0, savesTotal = 0, savesOnTarget = 0;
    for (const s of saves) {
      const isOnTarget = s.on_target === 'yes';
      if (isOnTarget) shotsOnTarget++;
      const col = GK_ACTION_TO_COL[s.gk_action];
      if (col) {
        saveCounts[col] = (saveCounts[col] || 0) + 1;
        savesTotal++;
        if (isOnTarget) savesOnTarget++;
      }
    }
    shotsOnTarget += goalsAgainst;
    const shotsFaced = saves.length + goalsAgainst;
    const savePct = shotsOnTarget > 0 ? Math.min(1, savesOnTarget / shotsOnTarget) : 0;

    const meta = job.match_metadata || {};
    // Single-letter codes ('W'/'L'/'D') to match the format pitchside writes
    // and the format dashboard W-L-D record filters expect. Earlier video-
    // published matches stored 'Win'/'Loss'/'Draw' which silently excluded
    // them from the W-L-D tally.
    const result = goalsFor > goalsAgainst ? 'W' : goalsFor < goalsAgainst ? 'L' : 'D';

    // Aggregate kept distribution events into matches.dist_* columns so the
    // existing dashboard distribution panel "just works" without per-event
    // joins. Per-event detail is preserved separately in distribution_events.
    //
    // Mapping Gemini's 5-bucket type vocab onto pitchside's 4-bucket schema:
    //   gk_short  → gk_short   gk_long  → gk_long  drop_kick → gk_long
    //   throw     → throws     pass     → passes
    // 'under_pressure' is an overlay count (a pressed event ALSO counts in its
    // type bucket), matching pitchside semantics.
    // _att = total events of that type; _suc = those with successful=true.
    // (unclear/null does not count toward _suc but does count toward _att.)
    const distAgg = {
      dist_gk_short_att: 0, dist_gk_short_suc: 0,
      dist_gk_long_att: 0,  dist_gk_long_suc: 0,
      dist_throws_att: 0,   dist_throws_suc: 0,
      dist_passes_att: 0,   dist_passes_suc: 0,
      dist_under_pressure_att: 0, dist_under_pressure_suc: 0,
    };
    const distributionForAgg = Array.isArray(body.distribution) ? body.distribution : [];
    for (const d of distributionForAgg) {
      const ok = coerceTriBool(d.successful) === true;
      const pressed = coercePressState(d) === true;
      const type = String(d.type || '').toLowerCase();
      const bucket =
        type === 'gk_short' ? 'gk_short' :
        type === 'gk_long' || type === 'drop_kick' ? 'gk_long' :
        type === 'throw' ? 'throws' :
        type === 'pass' ? 'passes' : null;
      if (bucket) {
        distAgg[`dist_${bucket}_att`]++;
        if (ok) distAgg[`dist_${bucket}_suc`]++;
      }
      if (pressed) {
        distAgg.dist_under_pressure_att++;
        if (ok) distAgg.dist_under_pressure_suc++;
      }
    }
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
      shots_faced: shotsFaced,
      shots_on_target: shotsOnTarget,
      saves: savesTotal,
      save_percentage: savePct,
      ...saveCounts,
      ...distAgg,
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
        timestamp_seconds: Number.isFinite(c.timestamp_seconds) ? c.timestamp_seconds : null,
        minute: Number.isFinite(c.timestamp_seconds) ? Math.floor(c.timestamp_seconds / 60) : null,
        shot_description: c.shot_description || null,
        gk_observations: c.gk_observations || null,
        coach_notes: c.notes || null,
      }));
      const { error: gErr } = await admin.from('goals_conceded').insert(goalRows);
      if (gErr) {
        // Rollback the match insert so we don't leave an orphaned row
        await admin.from('matches').delete().eq('id', matchId);
        return NextResponse.json({ error: 'Insert concessions failed: ' + gErr.message }, { status: 500 });
      }
    }

    // Write goals_scored rows for ALL our-team goals: kept Gemini candidates
    // flagged scored_by_us=true AND coach-added extras. Previously only extras
    // were written, leaving Gemini-detected our-team goals as a number-only
    // record on matches.goals_for with no per-event narrative.
    const ourTeamCandidateGoals = (body.review_diff?.candidates || [])
      .filter(c => c.keep && c.scored_by_us === true)
      .map(c => {
        const gem = (job.gemini_output?.parsed?.goals || [])[c.gemini_index] || {};
        return {
          match_id: matchId,
          coach_id: user.id,
          keeper_id: job.keeper_id,
          timestamp_seconds: Number.isFinite(gem.timestamp_seconds) ? gem.timestamp_seconds : null,
          minute: Number.isFinite(gem.timestamp_seconds) ? Math.floor(gem.timestamp_seconds / 60) : null,
          shot_description: gem.buildup || null,
          coach_notes: c.notes || null,
          attack_type: gem.attack_type || null,
          half: null,
        };
      });
    const allScoredRows = [
      ...ourTeamCandidateGoals,
      ...teamScored.map(g => ({
        match_id: matchId,
        coach_id: user.id,
        keeper_id: job.keeper_id,
        timestamp_seconds: Number.isFinite(g.timestamp_seconds) ? g.timestamp_seconds : null,
        minute: Number.isFinite(g.timestamp_seconds) ? Math.floor(g.timestamp_seconds / 60) : null,
        shot_description: g.shot_description || null,
        coach_notes: g.notes || null,
        attack_type: g.attack_type || null,
        half: g.half || null,
      })),
    ];
    if (allScoredRows.length) {
      const { error: sErr } = await admin.from('goals_scored').insert(allScoredRows);
      if (sErr) console.error('goals_scored insert failed (non-fatal):', sErr);
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
          timestamp_seconds: Number.isFinite(s.timestamp_seconds) ? s.timestamp_seconds : null,
          on_target: s.on_target || null,
          outcome: s.outcome || null,
          body_distance_zone: s.body_distance_zone || null,
          goal_placement_height: s.goal_placement_height || null,
          goal_placement_side: s.goal_placement_side || null,
          gk_visible: s.gk_visible || null,
          coach_added: !!s.coach_added,
          shot_description: s.shot_description || null,
          gk_observations: s.gk_observations || null,
          coach_notes: s.notes || null,
        };
      });
      const { error: seErr } = await admin.from('shot_events').insert(shotRows);
      if (seErr) {
        console.error('shot_events insert failed (non-fatal):', seErr);
        // Don't roll back the match — shot_events are supplementary.
      }
    }

    // Phase 2.2 — write distribution_events rows for each kept distribution
    // candidate. Mirrors the saves → shot_events pattern: per-event records
    // for the dashboard distribution panel + future cross-match aggregates.
    // Non-fatal if it fails (the match still lands; coach can add manually).
    const distribution = Array.isArray(body.distribution) ? body.distribution : [];
    if (distribution.length) {
      const distRows = distribution.map(d => ({
        match_id: matchId,
        keeper_id: job.keeper_id,
        coach_id: user.id,
        timestamp_seconds: Number.isFinite(d.timestamp_seconds) ? d.timestamp_seconds : null,
        minute: Number.isFinite(d.timestamp_seconds) ? Math.floor(d.timestamp_seconds / 60) : null,
        half: d.half || null,
        match_clock: d.match_clock || null,
        trigger: d.trigger || null,
        type: d.type || null,
        successful: coerceTriBool(d.successful),
        under_pressure: coercePressState(d),
        pass_selection: emptyToNull(d.pass_selection),
        direction: emptyToNull(d.direction),
        receiver: emptyToNull(d.receiver),
        first_touch: emptyToNull(d.first_touch),
        notes: d.notes || null,
        confidence: d.confidence || null,
        source: 'video',
      }));
      const { error: dErr } = await admin.from('distribution_events').insert(distRows);
      if (dErr) {
        console.error('distribution_events insert failed (non-fatal):', dErr);
      } else {
        console.log(`[publish] wrote ${distRows.length} distribution_events row(s)`);
      }
    }

    const { error: updErr } = await admin.from('video_jobs').update({
      status: 'published',
      published_match_id: matchId,
      reviewed_output: {
        goals_for: goalsFor,
        goals_against: goalsAgainst,
        concessions,
        team_scored: teamScored,
        saves,
        distribution,
        review_diff: body.review_diff || null,
        notes: body.notes || null,
      },
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
    //
    // Gated behind DELETE_SOURCE_VIDEO_ON_PUBLISH because deleting on publish
    // makes re-analysis impossible (the worker downloads from a signed URL
    // pointing at this file). Until R2 cold storage is wired, coaches re-
    // analysing or re-watching footage from the dashboard is more valuable
    // than the storage cost. Set to "true" in env to opt back in.
    if (process.env.DELETE_SOURCE_VIDEO_ON_PUBLISH === 'true' && job.storage_path) {
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
