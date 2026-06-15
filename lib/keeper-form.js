// ═══════════════════════════════════════════════════════════════════════════
// keeper-form.js — Algorithm for the keeper-card landing dashboard.
//
// Decisions locked 2026-06-15 (see docs/keeper-card-landing-spec.md):
//   1) Form Score weights: 0.40 save · 0.30 result · 0.20 dist · 0.10 errors
//   2) Detection window: last-5 vs prior-5 with median-of-3 stability filter
//   3) Significance thresholds: n≥8 ratio events, n≥3 attribute matches,
//      |Δ|≥8pp ratio, |Δ|≥0.5 attribute
//   4) Metric inventory: 15 metrics across event / attribute / psychological
//   5) Unsaveable goals excluded from Focus Areas
//
// Joshua's earlier decision: decision-making → Talk (no video).
// ═══════════════════════════════════════════════════════════════════════════

import { aggregateMatches, aggregateAttrs } from "@/lib/stats";

// ─── 1. Modality routing ──────────────────────────────────────────────────
// "Watch" = one moment, one clip. "Reel" = 3-clip pattern across many moments.
// "Talk" = no clip, this is a coaching conversation.
export const MODALITY = {
  // Event-level technique → Watch
  save_pct:                "watch",
  goals_against_per_match:  "watch",
  one_v_one_pct:           "watch",
  errors_leading_to_goal:  "watch",

  // Pattern across many events → Reel
  dist_success_pct:        "reel",
  dist_long_pct:           "reel",
  dist_under_pressure_pct: "reel",
  cross_claim_pct:         "reel",
  rebound_control_pct:     "reel",

  // Technique attributes → Reel (compile 3 representative clips)
  shot_stopping:           "reel",
  handling:                "reel",
  positioning:             "reel",
  aerial_dominance:        "reel",
  distribution:            "reel",
  footwork_agility:        "reel",
  reaction_speed:          "reel",
  set_piece_org:           "reel",
  command_of_box:          "reel",
  sweeper_play:            "reel",

  // Psychological / state → Talk
  decision_making:         "talk",   // Joshua's call 2026-06-15
  composure:               "talk",
  compete_level:           "talk",
  communication:           "talk",
};

// ─── 2. Metric labels (display) ───────────────────────────────────────────
export const METRIC_LABEL = {
  save_pct:                "Save %",
  goals_against_per_match: "Goals against / match",
  one_v_one_pct:           "1v1 win rate",
  errors_leading_to_goal:  "Errors leading to goal",
  dist_success_pct:        "Distribution success",
  dist_long_pct:           "Long-distribution success",
  dist_under_pressure_pct: "Distribution under pressure",
  cross_claim_pct:         "Cross-claim %",
  rebound_control_pct:     "Rebound control %",
  shot_stopping:           "Shot stopping",
  handling:                "Handling",
  positioning:             "Positioning",
  aerial_dominance:        "Aerial dominance",
  distribution:            "Distribution (attribute)",
  footwork_agility:        "Footwork & agility",
  reaction_speed:          "Reaction speed",
  set_piece_org:           "Set-piece organisation",
  command_of_box:          "Command of box",
  sweeper_play:            "Sweeper play",
  decision_making:         "Decision-making",
  composure:               "Composure",
  compete_level:           "Compete level",
  communication:           "Communication",
};

// ─── 3. Match selection helpers ───────────────────────────────────────────
// Sorts matches chronologically descending then takes the requested window.
// Only "match" session_type counts toward form (training sessions excluded).
function selectWindow(matches, { skip = 0, take = 5 } = {}) {
  return [...matches]
    .filter(m => m.session_type === "match")
    .sort((a, b) => new Date(b.match_date) - new Date(a.match_date))
    .slice(skip, skip + take);
}

// ─── 4. Compute metric values from a slice of matches + attribute rows ────
// Returns a flat object: { metric_name: value, ... }. Missing data → null.
function computeMetrics(matches, attrRows) {
  if (!matches.length) return {};
  const agg = aggregateMatches(matches);
  const attrs = attrRows && attrRows.length ? aggregateAttrs(attrRows) : null;

  // Sample sizes (used by significance filter — attached separately)
  const distTotal = agg.distribution.total;
  const distLongAtt = agg.distribution.gkLong.att;
  const distPressedAtt = agg.distribution.underPressure.att;
  const crossTotal = agg.crosses.total;
  const oneV1Faced = agg.oneV1.faced;
  const reboundTotal = agg.rebounds.controlled + agg.rebounds.dangerous;

  const safeRate = (suc, att) => (att > 0 ? suc / att : null);

  return {
    // ── ratio metrics ─────────────────────────────────────────────────
    save_pct:                safeRate(agg.saves, agg.sot),
    goals_against_per_match: agg.gp > 0 ? agg.ga / agg.gp : null,
    one_v_one_pct:           safeRate(agg.oneV1.won, agg.oneV1.faced),
    errors_leading_to_goal:  agg.handling.errGoal,
    dist_success_pct:        safeRate(agg.distribution.accurate, agg.distribution.total),
    dist_long_pct:           safeRate(agg.distribution.gkLong.suc, agg.distribution.gkLong.att),
    dist_under_pressure_pct: safeRate(agg.distribution.underPressure.suc, agg.distribution.underPressure.att),
    cross_claim_pct:         safeRate(agg.crosses.claimed, agg.crosses.total),
    rebound_control_pct:     reboundTotal > 0 ? agg.rebounds.controlled / reboundTotal : null,

    // ── attribute metrics (0-5 scale) ─────────────────────────────────
    shot_stopping:    attrs?.shot_stopping ?? null,
    handling:         attrs?.handling ?? null,
    positioning:      attrs?.positioning ?? null,
    aerial_dominance: attrs?.aerial_dominance ?? null,
    distribution:     attrs?.distribution ?? null,
    footwork_agility: attrs?.footwork_agility ?? null,
    reaction_speed:   attrs?.reaction_speed ?? null,
    set_piece_org:    attrs?.set_piece_org ?? null,
    command_of_box:   attrs?.command_of_box ?? null,
    sweeper_play:     attrs?.sweeper_play ?? null,
    decision_making:  attrs?.decision_making ?? null,
    composure:        attrs?.composure ?? null,
    compete_level:    attrs?.compete_level ?? null,
    communication:    attrs?.communication ?? null,

    // ── sample sizes (used downstream for significance) ───────────────
    _n: {
      matches:        matches.length,
      sot:            agg.sot,
      dist_total:     distTotal,
      dist_long:      distLongAtt,
      dist_pressed:   distPressedAtt,
      cross:          crossTotal,
      one_v_one:      oneV1Faced,
      rebound:        reboundTotal,
      attr_matches:   attrRows ? attrRows.filter(r =>
        r.shot_stopping != null || r.handling != null || r.composure != null
      ).length : 0,
    },
  };
}

// ─── 5. Form Score (composite) ────────────────────────────────────────────
// Weights locked by Joshua 2026-06-15:
//   save_pct         × 0.40
//   result_quality   × 0.30   (W=1.0, D=0.5, L=0)
//   dist_success_pct × 0.20
//   error_penalty    × 0.10   (0 errors = 1.0; each error -0.2)
export function computeFormScore(matches) {
  const window = selectWindow(matches, { skip: 0, take: 5 });
  if (!window.length) return { value: null, tier: "—", components: null };

  const agg = aggregateMatches(window);

  const savePct = agg.sot > 0 ? agg.saves / agg.sot : 0;
  const resultQuality = window.reduce((s, m) => {
    if (m.result === "W") return s + 1.0;
    if (m.result === "D") return s + 0.5;
    return s;
  }, 0) / window.length;
  const distSuccess = agg.distribution.total > 0
    ? agg.distribution.accurate / agg.distribution.total : 0;
  const errorPenalty = Math.max(0, 1 - 0.2 * agg.handling.errGoal);

  // Each component scaled to 0..100 then weighted
  const score =
    Math.round(
      (savePct * 100)        * 0.40 +
      (resultQuality * 100)  * 0.30 +
      (distSuccess * 100)    * 0.20 +
      (errorPenalty * 100)   * 0.10
    );

  const tier =
    score >= 90 ? "ELITE" :
    score >= 80 ? "STRONG" :
    score >= 70 ? "STEADY" :
    score >= 60 ? "BUILDING" : "FOCUS";

  return {
    value: score,
    tier,
    components: {
      save_pct:        Math.round(savePct * 100),
      result_quality:  Math.round(resultQuality * 100),
      dist_success:    Math.round(distSuccess * 100),
      error_penalty:   Math.round(errorPenalty * 100),
    },
    sample: {
      matches: window.length,
      sot: agg.sot,
      dist: agg.distribution.total,
      errors: agg.handling.errGoal,
    },
  };
}

// Convenience: delta of form score L5 vs prior-5.
export function computeFormScoreDelta(matches) {
  const now = computeFormScore(matches);
  const prev = computeFormScore([...matches].sort(
    (a, b) => new Date(b.match_date) - new Date(a.match_date)
  ).slice(5));
  if (now.value == null || prev.value == null) {
    return { ...now, prev: prev.value, delta: null };
  }
  return { ...now, prev: prev.value, delta: now.value - prev.value };
}

// ─── 6. Detection: L5 vs prior-5 with stability filter ────────────────────
// Returns an array of trend records:
//   { metric, modality, current, previous, delta, isUp, isAttribute,
//     n_current, n_previous, stable }
export function detectTrends(matches, attrRows) {
  const l5 = selectWindow(matches, { skip: 0, take: 5 });
  const p5 = selectWindow(matches, { skip: 5, take: 5 });
  if (!l5.length) return [];

  const matchIdsL5 = new Set(l5.map(m => m.id));
  const matchIdsP5 = new Set(p5.map(m => m.id));
  const attrL5 = (attrRows || []).filter(r => matchIdsL5.has(r.match_id));
  const attrP5 = (attrRows || []).filter(r => matchIdsP5.has(r.match_id));

  const metricsL5 = computeMetrics(l5, attrL5);
  const metricsP5 = p5.length ? computeMetrics(p5, attrP5) : {};

  const out = [];
  for (const metric of Object.keys(MODALITY)) {
    const current = metricsL5[metric];
    const previous = metricsP5[metric];
    if (current == null) continue;

    const isAttribute = metric in (attrL5[0] || {}) || [
      "shot_stopping","handling","positioning","aerial_dominance","distribution",
      "footwork_agility","reaction_speed","set_piece_org","command_of_box",
      "sweeper_play","decision_making","composure","compete_level","communication",
    ].includes(metric);

    // Determine direction. For errors_leading_to_goal and goals_against_per_match,
    // DOWN is the favourable direction. Everything else: UP is good.
    const lowerIsBetter = metric === "errors_leading_to_goal" || metric === "goals_against_per_match";
    const delta = previous != null ? current - previous : null;
    const isUp = delta == null ? null : lowerIsBetter ? delta < 0 : delta > 0;

    // Stability — median of recent 3 matches on same side of baseline as the L5 mean.
    // For attributes we don't have per-match granularity in attrRows in a way that
    // maps cleanly to matches here, so skip stability for attributes (the n≥3
    // sample-size requirement already guards them).
    let stable = true;
    if (!isAttribute && previous != null && l5.length >= 3) {
      const last3 = selectWindow(matches, { skip: 0, take: 3 });
      const lastMetricsForStability = computeMetrics(last3, []);
      const medianish = lastMetricsForStability[metric];
      if (medianish != null) {
        const currentSide = current > previous;
        const medianSide = medianish > previous;
        stable = currentSide === medianSide;
      }
    }

    // Sample-size routing
    const ns = metricsL5._n || {};
    const nCurrent =
      metric === "save_pct"                ? ns.sot :
      metric === "dist_success_pct"        ? ns.dist_total :
      metric === "dist_long_pct"           ? ns.dist_long :
      metric === "dist_under_pressure_pct" ? ns.dist_pressed :
      metric === "cross_claim_pct"         ? ns.cross :
      metric === "one_v_one_pct"           ? ns.one_v_one :
      metric === "rebound_control_pct"     ? ns.rebound :
      isAttribute                          ? ns.attr_matches :
      ns.matches;
    const nPrevious = previous != null ? (metricsP5._n?.matches || 0) : 0;

    out.push({
      metric,
      label: METRIC_LABEL[metric],
      modality: MODALITY[metric],
      current,
      previous,
      delta,
      isUp,
      isAttribute,
      n_current: nCurrent,
      n_previous: nPrevious,
      stable,
      lowerIsBetter,
    });
  }
  return out;
}

// ─── 7. Significance filter ───────────────────────────────────────────────
// Joshua's thresholds locked 2026-06-15:
//   ratio metrics:     n ≥ 8 events  AND  |Δ| ≥ 8 percentage points
//   attribute metrics: n ≥ 3 matches AND  |Δ| ≥ 0.5 (out of 5)
//   plus median-of-3 stability check (set on the trend record by detectTrends)
export function filterSignificant(trends) {
  return trends.filter(t => {
    if (t.delta == null || t.isUp == null) return false;
    if (!t.stable) return false;
    if (t.isAttribute) {
      if (t.n_current < 3) return false;
      if (Math.abs(t.delta) < 0.5) return false;
    } else {
      if (t.metric === "errors_leading_to_goal") {
        // Counts, not ratios — different gate: a 1-event delta IS meaningful
        // ("you committed an error" / "you stopped committing them"), so the
        // only filter is that something actually changed.
        if (Math.abs(t.delta) < 1) return false;
        return true;
      }
      if (t.n_current < 8) return false;
      // Δ measured in raw rate space (0..1). 8pp = 0.08.
      if (Math.abs(t.delta) < 0.08) return false;
    }
    return true;
  });
}

// ─── 8. Selection: top 3 per side with diversity ──────────────────────────
// Diversity rule: don't fill a card with 3 metrics from the same family.
// Families: event-watch, dist-reel, attribute-reel, talk.
function familyOf(t) {
  if (t.modality === "talk") return "talk";
  if (t.isAttribute) return "attribute";
  if (t.metric.startsWith("dist_") || t.metric === "cross_claim_pct") return "dist";
  if (t.metric === "rebound_control_pct") return "rebound";
  return "save-shot"; // save_pct, one_v_one_pct, errors, goals-against
}

export function selectCards(trends) {
  const sig = filterSignificant(trends);
  const up = sig.filter(t => t.isUp).sort(byAbsDelta);
  const down = sig.filter(t => !t.isUp).sort(byAbsDelta);

  return {
    trendingUp: pickWithDiversity(up, 3),
    focusAreas: pickWithDiversity(down, 3),
  };
}

function byAbsDelta(a, b) {
  return Math.abs(b.delta) - Math.abs(a.delta);
}

function pickWithDiversity(sortedTrends, limit) {
  const picked = [];
  const familyCount = {};
  for (const t of sortedTrends) {
    const fam = familyOf(t);
    // Allow up to 2 from the same family before forcing diversity
    if ((familyCount[fam] || 0) >= 2) continue;
    picked.push(t);
    familyCount[fam] = (familyCount[fam] || 0) + 1;
    if (picked.length >= limit) break;
  }
  return picked;
}

// ─── 9. "Best clip" selection for Watch items ─────────────────────────────
// Given a trend record + the keeper's event arrays, pick the single most
// representative clip to surface. Returns { clip_storage_path, event } or null.
//
// Selection heuristic (v1):
//   save_pct ↑:  most recent on-target save with a high-quality save_action
//                (Catch ranked higher than Parry) and outcome held/rebound_safe.
//   save_pct ↓:  most recent goal_rank=Saveable concession.
//   one_v_one ↑: most recent 1v1 won (would query one_v_one_events).
//   errors ↓:    the error itself, most recent.
export function selectBestClip(trend, { shotEvents = [], goalsConceded = [], distEvents = [] }) {
  if (trend.modality !== "watch") return null;

  const recencyDesc = (a, b) => {
    const da = new Date(a.created_at || 0).getTime();
    const db = new Date(b.created_at || 0).getTime();
    return db - da;
  };

  if (trend.metric === "save_pct") {
    if (trend.isUp) {
      // Best save: prefer Catch > Parry > Block > Deflect > Punch, on-target, held/safe outcome
      const ranking = { Catch: 5, Parry: 4, Block: 3, Deflect: 2, Punch: 1 };
      const candidates = shotEvents
        .filter(s => !s.is_goal && s.on_target === "yes" && s.clip_storage_path)
        .filter(s => s.outcome === "held" || s.outcome === "rebound_safe" || !s.outcome)
        .sort((a, b) => {
          const ra = ranking[a.gk_action] || 0;
          const rb = ranking[b.gk_action] || 0;
          if (rb !== ra) return rb - ra;
          return recencyDesc(a, b);
        });
      return candidates[0]
        ? { clip_storage_path: candidates[0].clip_storage_path, event: candidates[0] }
        : null;
    } else {
      // Most recent saveable concession
      const candidates = goalsConceded
        .filter(g => g.goal_rank === "Saveable" && g.clip_storage_path)
        .sort(recencyDesc);
      return candidates[0]
        ? { clip_storage_path: candidates[0].clip_storage_path, event: candidates[0] }
        : null;
    }
  }

  if (trend.metric === "errors_leading_to_goal" && !trend.isUp) {
    // Surface the error itself (a saveable concession with positioning/handling cited).
    // Since "errors_leading_to_goal" is captured as a match-level integer rather than
    // per-event yet, fall back to most recent saveable concession.
    const candidates = goalsConceded
      .filter(g => g.goal_rank === "Saveable" && g.clip_storage_path)
      .sort(recencyDesc);
    return candidates[0]
      ? { clip_storage_path: candidates[0].clip_storage_path, event: candidates[0] }
      : null;
  }

  // 1v1 watch items need one_v_one_events — defer until that bundle is wired in.
  return null;
}

// ─── 10. Top-level convenience ────────────────────────────────────────────
// Build everything the keeper-card landing needs, from raw data.
// Returns { formScore, trendingUp, focusAreas } where each card item carries
// its own bestClip (or null) for Watch-modality items.
export function buildKeeperCardData({ matches, attrs, shotEvents, goalsConceded, distEvents }) {
  const formScore = computeFormScoreDelta(matches);
  const trends = detectTrends(matches, attrs || []);
  const cards = selectCards(trends);

  const enrich = (t) => ({
    ...t,
    bestClip: selectBestClip(t, {
      shotEvents: shotEvents || [],
      goalsConceded: goalsConceded || [],
      distEvents: distEvents || [],
    }),
  });

  return {
    formScore,
    trendingUp: cards.trendingUp.map(enrich),
    focusAreas: cards.focusAreas.map(enrich),
  };
}
