import { ORIGIN_LABELS, ATTR_KEYS } from "@/lib/constants";

// ═══ FORMATTING HELPERS ══════════════════════════════════════════════════════
export const pct = v => v != null && !isNaN(v) ? (v * 100).toFixed(1) + "%" : "—";
export const dec = (v, d = 2) => v != null && !isNaN(v) ? v.toFixed(d) : "—";

// ═══ ZONE CONVERSION ═════════════════════════════════════════════════════════
export function computeZoneConversion(shotEvents) {
  if (!shotEvents || !shotEvents.length) return [];
  const zones = {};
  shotEvents.forEach(function(se) {
    var zone = se.shot_origin;
    if (!zone) return;
    if (!zones[zone]) zones[zone] = { shots: 0, goals: 0 };
    zones[zone].shots++;
    if (se.is_goal) zones[zone].goals++;
  });
  return Object.entries(zones)
    .filter(function(e) { return e[1].shots > 0; })
    .map(function(e) {
      var name = ORIGIN_LABELS[e[0]] || e[0];
      return { zone: e[0], name: name, shots: e[1].shots, goals: e[1].goals, rate: e[1].goals / e[1].shots };
    })
    .sort(function(a, b) { return b.rate - a.rate; });
}

// Unified zone view that backfills legacy goals from `goals_conceded` for
// matches predating the shot_events schema (pre-2026-03). Modern matches
// have one shot_event per shot and `is_goal=true` for the ones that scored.
// Legacy matches only have rows in `goals_conceded` — no per-shot data.
// Strategy per match: compare goal-count from each source. If goals_conceded
// has MORE goals than shot_events represents, attribute the excess to their
// own `shot_origin` (no shot count is added — we don't have it for legacy).
// Result: GA column matches the keeper's true GA; rate is null for
// legacy-only zones (rendered as "—" instead of "0.0%").
export function computeZoneConversionUnified(shotEvents, goalsConceded) {
  shotEvents = shotEvents || [];
  goalsConceded = goalsConceded || [];
  const zones = {};

  shotEvents.forEach(function(se) {
    var zone = se.shot_origin;
    if (!zone) return;
    if (!zones[zone]) zones[zone] = { shots: 0, goals: 0 };
    zones[zone].shots++;
    if (se.is_goal) zones[zone].goals++;
  });

  // Count how many goals each match already has represented in shot_events.
  var seGoalsByMatch = {};
  shotEvents.forEach(function(se) {
    if (!se.is_goal) return;
    seGoalsByMatch[se.match_id] = (seGoalsByMatch[se.match_id] || 0) + 1;
  });

  // Group goals_conceded by match and attribute any excess to zones.
  var gcByMatch = {};
  goalsConceded.forEach(function(g) {
    if (!gcByMatch[g.match_id]) gcByMatch[g.match_id] = [];
    gcByMatch[g.match_id].push(g);
  });
  Object.keys(gcByMatch).forEach(function(matchId) {
    var goals = gcByMatch[matchId];
    var represented = seGoalsByMatch[matchId] || 0;
    if (goals.length <= represented) return;
    goals.slice(represented).forEach(function(g) {
      var zone = g.shot_origin;
      if (!zone) return;
      if (!zones[zone]) zones[zone] = { shots: 0, goals: 0 };
      // A goal is an on-target shot too — increment shots along with goals so
      // shots always represents SOT (saves + goals) and conversion rate stays
      // in [0, 100]%. Before this fix, a zone with 2 saves + 3 goals rendered
      // "2 shots, 3 GA, 150%" — impossible. (Joshua incident 2026-07-15.)
      zones[zone].shots++;
      zones[zone].goals++;
    });
  });

  return Object.entries(zones)
    .filter(function(e) { return e[1].shots > 0 || e[1].goals > 0; })
    .map(function(e) {
      var name = ORIGIN_LABELS[e[0]] || e[0];
      return {
        zone: e[0], name: name,
        shots: e[1].shots, goals: e[1].goals,
        rate: e[1].shots > 0 ? e[1].goals / e[1].shots : null,
      };
    })
    .sort(function(a, b) {
      if (b.goals !== a.goals) return b.goals - a.goals;
      return (b.rate || 0) - (a.rate || 0);
    });
}

// Group rows by a key. Used by aggregateMatches / buildMatchLog to dispatch
// per-match between event-driven and match-column-driven aggregation.
function groupBy(rows, key) {
  const out = {};
  rows.forEach(r => {
    const k = r[key];
    (out[k] = out[k] || []).push(r);
  });
  return out;
}

// ═══ AGGREGATION ENGINE ═════════════════════════════════════════════════════
//
// A match can now have two keepers (matches.secondary_keeper_id). Aggregate
// columns on the matches row are combined-both-GKs totals — misleading for
// per-keeper views. When callers pass event arrays scoped to a single keeper
// via `opts`, this function derives per-keeper stats from those events
// instead of summing `matches.saves` etc. Match-only fields (wins, losses,
// clean sheets) still come from the matches array.
//
// Callers with no event arrays get the old match-column behavior — used by
// aggregateQuarterly and any legacy callsite that hasn't been threaded
// through with events yet.
export function aggregateMatches(matches, opts = {}) {
  if (!matches.length) return null;
  const { shotEvents, distEvents, sweeperEvents, oneVOneEvents, goalsConceded } = opts;
  const eventDriven = shotEvents !== undefined || distEvents !== undefined ||
                      sweeperEvents !== undefined || oneVOneEvents !== undefined ||
                      goalsConceded !== undefined;

  const gp = matches.length;
  const sumM = (key) => matches.reduce((s, m) => s + (m[key] || 0), 0);

  // ── Saves / SOT / GA ──
  // Hybrid dispatch per match: use events for any match that HAS events;
  // fall back to matches.saves / .shots_on_target / .goals_conceded for
  // legacy matches predating the event tables. Classical soccer save%
  // convention: only on-target shots in the denominator, on-target saves in
  // the numerator — off-target reactions are useful context but not part of
  // save-percentage math (that's what produced svPct > 100% earlier).
  let saves = 0, sot = 0, ga = 0;
  if (eventDriven) {
    const shotsByMatch = groupBy(shotEvents || [], "match_id");
    const gcByMatch    = groupBy(goalsConceded || [], "match_id");
    matches.forEach(m => {
      const s = shotsByMatch[m.id] || [];
      const g = gcByMatch[m.id] || [];
      const hasEvents = s.length > 0 || g.length > 0;
      if (hasEvents) {
        const onTargetSaves = s.filter(e => !e.is_goal && e.on_target === "yes").length;
        saves += onTargetSaves;
        ga    += g.length;
        sot   += onTargetSaves + g.length;
      } else {
        saves += (m.saves || 0);
        ga    += (m.goals_conceded || 0);
        sot   += (m.shots_on_target || 0);
      }
    });
  } else {
    sot   = sumM("shots_on_target");
    saves = sumM("saves");
    ga    = sumM("goals_conceded");
  }
  // Belt-and-braces: if legacy data has saves > sot (pre-refactor bad rows),
  // clamp save% to 100%. Physical reality guarantees svPct ∈ [0, 1].
  const svPct = sot > 0 ? Math.min(1, saves / sot) : 0;
  const min = gp * 90;
  const gaa = gp > 0 ? ga / gp : 0;
  const wins = matches.filter(m => m.result === "W").length;
  const draws = matches.filter(m => m.result === "D").length;
  const losses = matches.filter(m => m.result === "L").length;
  // Clean sheet = TEAM-level, not per-keeper. If ANY goal was conceded in the
  // match (regardless of which keeper was in), no CS is credited to any GK
  // who played. Rationale (Joshua, 2026-07-15): "If a goal is scored against
  // the other GK, there is no clean sheet for the team." Standard soccer
  // convention treats CS as a team stat that keepers share credit for only
  // when the whole match was 0-conceded.
  const cs = matches.filter(m =>
    ((m.goals_against ?? m.goals_conceded ?? 0) === 0) &&
    (m.session_type === "match" || m.session_type === "friendly")
  ).length;
  const csPct = gp > 0 ? cs / gp : 0;

  // ── Save-type breakdown ──
  const saveTypes = eventDriven
    ? bucketSaveTypes(shotEvents || [])
    : { Catch: sumM("saves_catch"), Parry: sumM("saves_parry"), Smother: sumM("saves_dive"),
        Block: sumM("saves_block"), Deflect: sumM("saves_tip"), Punch: sumM("saves_punch") };

  // ── Distribution ──
  const distribution = eventDriven
    ? bucketDistribution(distEvents || [])
    : {
        gkShort: { att: sumM("dist_gk_short_att"), suc: sumM("dist_gk_short_suc") },
        gkLong: { att: sumM("dist_gk_long_att"), suc: sumM("dist_gk_long_suc") },
        throws: { att: sumM("dist_throws_att"), suc: sumM("dist_throws_suc") },
        passes: { att: sumM("dist_passes_att"), suc: sumM("dist_passes_suc") },
        underPressure: { att: sumM("dist_under_pressure_att"), suc: sumM("dist_under_pressure_suc") },
        total: sumM("dist_gk_short_att") + sumM("dist_gk_long_att") + sumM("dist_throws_att") + sumM("dist_passes_att"),
        accurate: sumM("dist_gk_short_suc") + sumM("dist_gk_long_suc") + sumM("dist_throws_suc") + sumM("dist_passes_suc"),
        inaccurate: (sumM("dist_gk_short_att") + sumM("dist_gk_long_att") + sumM("dist_throws_att") + sumM("dist_passes_att")) - (sumM("dist_gk_short_suc") + sumM("dist_gk_long_suc") + sumM("dist_throws_suc") + sumM("dist_passes_suc")),
        types: { "GK Short": sumM("dist_gk_short_att"), "GK Long": sumM("dist_gk_long_att"), "Throws": sumM("dist_throws_att"), "Passes": sumM("dist_passes_att"), "Under Pressure": sumM("dist_under_pressure_att") },
      };

  // ── Sweeper ──
  const sweeper = eventDriven && sweeperEvents !== undefined
    ? bucketSweeper(sweeperEvents || [])
    : { clearances: sumM("sweeper_clearances"), interceptions: sumM("sweeper_interceptions"), tackles: sumM("sweeper_tackles") };

  // ── 1v1s ──
  const oneV1 = eventDriven && oneVOneEvents !== undefined
    ? { faced: (oneVOneEvents || []).length, won: (oneVOneEvents || []).filter(e => e.result === "won" || e.outcome === "won").length }
    : { faced: sumM("one_v_one_faced"), won: sumM("one_v_one_won") };

  // ── Crosses, rebounds, errors — no per-event tables exist yet, so these
  //     stay as match-level sums even in event-driven mode. Multi-keeper
  //     matches will show combined totals here until per-event schemas exist.
  const crosses = {
    claimed: sumM("crosses_claimed"), punched: sumM("crosses_punched"),
    missed: sumM("crosses_missed"), total: sumM("crosses_total"),
  };
  const handling = { errGoal: sumM("errors_leading_to_goal") };
  const rebounds = { controlled: sumM("rebounds_controlled"), dangerous: sumM("rebounds_dangerous") };

  return {
    gp, min, sot, saves, ga, svPct, gaa, cs, csPct, w: wins, d: draws, l: losses,
    saveTypes, crosses, distribution, oneV1, handling, sweeper, rebounds,
  };
}

// ── Event-array bucketers used by aggregateMatches in event-driven mode ──
function bucketSaveTypes(shotEvents) {
  // Save-type column mapping mirrors GK_ACTION_TO_COL + the display convention
  // in the display layer (Smother → saves_dive, Deflect → saves_tip).
  const b = { Catch: 0, Parry: 0, Smother: 0, Block: 0, Deflect: 0, Punch: 0 };
  const map = { Catch: "Catch", Parry: "Parry", Block: "Block", Deflect: "Deflect",
                Punch: "Punch", Smother: "Smother", Starfish: "Smother", "K-Barrier": "Block" };
  shotEvents.forEach(e => {
    if (e.is_goal) return;
    const key = map[e.gk_action];
    if (key && Object.prototype.hasOwnProperty.call(b, key)) b[key]++;
  });
  return b;
}
function bucketDistribution(distEvents) {
  const b = {
    gkShort: { att: 0, suc: 0 }, gkLong: { att: 0, suc: 0 },
    throws: { att: 0, suc: 0 }, passes: { att: 0, suc: 0 },
    underPressure: { att: 0, suc: 0 },
  };
  distEvents.forEach(e => {
    const t = e.type; const suc = e.successful === true; const pressed = e.under_pressure === true;
    if (t === "gk_short") { b.gkShort.att++; if (suc) b.gkShort.suc++; }
    else if (t === "gk_long") { b.gkLong.att++; if (suc) b.gkLong.suc++; }
    else if (t === "throw") { b.throws.att++; if (suc) b.throws.suc++; }
    else if (t === "pass" || t === "drop_kick") { b.passes.att++; if (suc) b.passes.suc++; }
    if (pressed) { b.underPressure.att++; if (suc) b.underPressure.suc++; }
  });
  const total = b.gkShort.att + b.gkLong.att + b.throws.att + b.passes.att;
  const accurate = b.gkShort.suc + b.gkLong.suc + b.throws.suc + b.passes.suc;
  return {
    ...b,
    total, accurate, inaccurate: total - accurate,
    types: { "GK Short": b.gkShort.att, "GK Long": b.gkLong.att, "Throws": b.throws.att, "Passes": b.passes.att, "Under Pressure": b.underPressure.att },
  };
}
function bucketSweeper(sweeperEvents) {
  const b = { clearances: 0, interceptions: 0, tackles: 0 };
  sweeperEvents.forEach(e => {
    // Post-2026-07-12: DB uses the constrained action enum
    // (intercept / clearance_foot / clearance_header / slide / ...).
    const a = e.action;
    if (a === "intercept" || a === "interception") b.interceptions++;
    else if (a === "clearance_foot" || a === "clearance_header" || a === "clearance") b.clearances++;
    else if (a === "slide" || a === "tackle") b.tackles++;
  });
  return b;
}

export function aggregateGoals(goals) {
  const count = (key) => {
    const map = {};
    goals.forEach(g => { const v = g[key]; if (v) map[v] = (map[v] || 0) + 1; });
    return map;
  };
  return {
    zones: count("goal_zone"),
    origins: count("shot_origin"),
    sources: count("goal_source"),
    ranks: count("goal_rank"),
    shotTypes: count("shot_type"),
    positioning: count("gk_positioning"),
  };
}

export function aggregateAttrs(attrRows) {
  if (!attrRows.length) return null;
  const result = {};
  ATTR_KEYS.forEach(k => {
    const vals = attrRows.map(r => r[k]).filter(v => v != null);
    result[k] = vals.length > 0 ? vals.reduce((s, v) => s + Number(v), 0) / vals.length : null;
  });
  return result;
}

function getQuarter(dateStr) {
  const m = new Date(dateStr).getMonth();
  if (m < 3) return "Q3";
  if (m < 6) return "Q4";
  if (m < 9) return "Q1";
  return "Q2";
}

export function aggregateQuarterly(matches) {
  const qs = { Q1: [], Q2: [], Q3: [], Q4: [] };
  matches.forEach(m => { const q = getQuarter(m.match_date); qs[q].push(m); });
  const result = {};
  Object.entries(qs).forEach(([q, ms]) => {
    if (!ms.length) { result[q] = { gp: 0 }; return; }
    const agg = aggregateMatches(ms);
    result[q] = { gp: agg.gp, svPct: agg.svPct, gaa: agg.gaa, csPct: agg.csPct, w: agg.w };
  });
  return result;
}

// buildMatchLog — per-match row for the Matches tab.
//
// When event arrays are provided in opts, per-keeper stats are derived from
// events instead of the match-level aggregate columns (which are combined
// totals for multi-keeper matches). Falls back to match-column mode for
// callers that haven't been threaded through yet.
export function buildMatchLog(matches, opts = {}) {
  const { shotEvents, goalsConceded } = opts;
  const eventDriven = shotEvents !== undefined || goalsConceded !== undefined;

  // Pre-bucket events by match_id for O(1) per-match dispatch. onTargetSavesByMatch
  // counts only saves where on_target='yes' — used for both display sv and SOT.
  const onTargetSavesByMatch = {};
  const hasShotsByMatch = {};
  if (eventDriven) {
    (shotEvents || []).forEach(e => {
      hasShotsByMatch[e.match_id] = true;
      if (e.is_goal) return;
      if (e.on_target === "yes") onTargetSavesByMatch[e.match_id] = (onTargetSavesByMatch[e.match_id] || 0) + 1;
    });
  }
  const gaByMatch = {};
  const hasGcByMatch = {};
  if (eventDriven) {
    (goalsConceded || []).forEach(g => {
      gaByMatch[g.match_id] = (gaByMatch[g.match_id] || 0) + 1;
      hasGcByMatch[g.match_id] = true;
    });
  }

  return [...matches]
    .sort((a, b) => new Date(b.match_date) - new Date(a.match_date))
    .map(m => {
      // Hybrid per-row: use events for matches that have them, fall back to
      // match aggregate columns for legacy matches. Match log uses SOT-domain
      // saves so per-row save% never exceeds 100%.
      const hasEvents = hasShotsByMatch[m.id] || hasGcByMatch[m.id];
      const useEvents = eventDriven && hasEvents;
      const sv  = useEvents ? (onTargetSavesByMatch[m.id] || 0) : m.saves;
      const ga  = useEvents ? (gaByMatch[m.id] || 0) : m.goals_conceded;
      const sot = useEvents ? ((onTargetSavesByMatch[m.id] || 0) + (gaByMatch[m.id] || 0)) : m.shots_on_target;
      return {
        id: m.id,
        date: new Date(m.match_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        opp: m.opponent || "Training",
        type: m.session_type,
        ha: m.venue === "home" ? "H" : m.venue === "away" ? "A" : "N",
        res: m.result || "—",
        // Score is the match score (both teams), independent of which GK played
        score: (m.session_type === "match" || m.session_type === "friendly")
          ? `${m.goals_for || 0}-${m.goals_against || 0}` : "—",
        sot, sv, ga,
        svP: sot > 0 ? sv / sot : null,
        // Team-level CS (same rule as aggregateMatches). A GK gets a CS only
        // if the whole match was 0-conceded, regardless of which keeper was
        // in when goals happened.
        cs: (m.goals_against ?? m.goals_conceded ?? 0) === 0,
      };
    });
}

// ═══ ALERT GENERATOR ════════════════════════════════════════════════════════
export function genAlerts(keeperName, seasonAgg, l5Agg, seasonGoals, l5Goals, sznAttrs, l5Attrs, seasonShotEvents, l5ShotEvents) {
  const a = [];
  if (!seasonAgg || !l5Agg) return a;
  if (l5Agg.svPct < seasonAgg.svPct - 0.03)
    a.push({ type: "warning", cat: "Performance", title: "Save % Declining",
      detail: `Last 5: ${pct(l5Agg.svPct)} vs Season: ${pct(seasonAgg.svPct)}`,
      action: "Review positioning in recent film" });
  if (l5Agg.gaa > seasonAgg.gaa + 0.25)
    a.push({ type: "warning", cat: "Performance", title: "GAA Trending Up",
      detail: `Last 5: ${dec(l5Agg.gaa)} vs Season: ${dec(seasonAgg.gaa)}`,
      action: "Analyze goal quality — saveable or defensive?" });
  const sznClaimPct = seasonAgg.crosses.total > 0 ? (seasonAgg.crosses.claimed / seasonAgg.crosses.total) * 100 : 0;
  const l5ClaimPct = l5Agg.crosses.total > 0 ? (l5Agg.crosses.claimed / l5Agg.crosses.total) * 100 : 0;
  if (sznClaimPct > 0 && l5ClaimPct < sznClaimPct - 10)
    a.push({ type: "warning", cat: "Technical", title: "Cross Claiming Dropping",
      detail: `Claim rate fell ${sznClaimPct.toFixed(0)}% → ${l5ClaimPct.toFixed(0)}%`,
      action: "Judgment of flight, starting position, CB communication" });
  if (seasonAgg.handling.errGoal >= 2)
    a.push({ type: "alert", cat: "Technical", title: `${seasonAgg.handling.errGoal} Errors → Goals`,
      detail: "Direct errors leading to goals this season",
      action: "Isolate error types: handling, distribution, or positioning" });
  const sznRBtotal = seasonAgg.rebounds.controlled + seasonAgg.rebounds.dangerous;
  const l5RBtotal = l5Agg.rebounds.controlled + l5Agg.rebounds.dangerous;
  if (sznRBtotal > 0 && l5RBtotal > 0) {
    const sznCtrl = (seasonAgg.rebounds.controlled / sznRBtotal) * 100;
    const l5Ctrl = (l5Agg.rebounds.controlled / l5RBtotal) * 100;
    if (l5Ctrl < sznCtrl - 10)
      a.push({ type: "warning", cat: "Technical", title: "Rebound Control Slipping",
        detail: `Controlled rebound % dropped from ${sznCtrl.toFixed(0)}% to ${l5Ctrl.toFixed(0)}%`,
        action: "Focus on angle recovery and shot parrying technique" });
  }
  if (sznAttrs?.composure && l5Attrs?.composure && l5Attrs.composure < sznAttrs.composure - 0.3)
    a.push({ type: "alert", cat: "Mental", title: "Composure Trending Down",
      detail: `Season avg ${sznAttrs.composure.toFixed(1)} → Last 5 avg ${l5Attrs.composure.toFixed(1)}`,
      action: "1-on-1 about confidence. Watch body language." });
  if (sznAttrs?.compete_level && l5Attrs?.compete_level && l5Attrs.compete_level > sznAttrs.compete_level + 0.2)
    a.push({ type: "positive", cat: "Mental", title: "Compete Level Rising",
      detail: `Season ${sznAttrs.compete_level.toFixed(1)} → Last 5 ${l5Attrs.compete_level.toFixed(1)}`,
      action: "Reinforce with positive feedback" });
  // --- Zone vulnerability alerts (requires shot_events data) ---
  if (seasonShotEvents && seasonShotEvents.length && l5ShotEvents && l5ShotEvents.length) {
    var sznZones = computeZoneConversion(seasonShotEvents);
    var l5Zones = computeZoneConversion(l5ShotEvents);
    // Zone vulnerability spike: L5 conversion > season + 15pp
    l5Zones.forEach(function(lz) {
      var sz = sznZones.find(function(z) { return z.zone === lz.zone; });
      if (sz && lz.shots >= 3 && (lz.rate - sz.rate) > 0.15) {
        a.push({ type: "warning", cat: "Performance", title: "Vulnerability Rising: " + lz.name,
          detail: (lz.rate * 100).toFixed(1) + "% of shots resulting in goals in last 5 vs " + (sz.rate * 100).toFixed(1) + "% season average.",
          action: "Review positioning and angle coverage from this channel." });
      }
    });
    // High-volume zone with rising conversion
    var totalL5Shots = l5ShotEvents.length;
    l5Zones.forEach(function(lz) {
      var sz = sznZones.find(function(z) { return z.zone === lz.zone; });
      if (sz && lz.shots / totalL5Shots > 0.25 && lz.rate > sz.rate) {
        a.push({ type: "alert", cat: "Performance", title: "High Traffic Zone Leaking: " + lz.name,
          detail: lz.shots + " shots (" + (lz.shots / totalL5Shots * 100).toFixed(0) + "% of all) with " + (lz.rate * 100).toFixed(1) + "% conversion vs " + (sz.rate * 100).toFixed(1) + "% season.",
          action: "Zone accounts for heavy traffic and conversion is rising." });
      }
    });
    // Positive: zone improvement
    l5Zones.forEach(function(lz) {
      var sz = sznZones.find(function(z) { return z.zone === lz.zone; });
      if (sz && sz.rate > 0.20 && lz.rate < 0.12 && lz.shots >= 3) {
        a.push({ type: "positive", cat: "Performance", title: "Improved: " + lz.name,
          detail: "Conversion rate down to " + (lz.rate * 100).toFixed(1) + "% in last 5 from " + (sz.rate * 100).toFixed(1) + "% season.",
          action: "Reinforce what is working." });
      }
    });
  }
  // 1v1 win rate declining
  if (seasonAgg && l5Agg && seasonAgg.oneV1 && l5Agg.oneV1) {
    var sznV1Rate = seasonAgg.oneV1.faced > 0 ? (seasonAgg.oneV1.won / seasonAgg.oneV1.faced) : null;
    var l5V1Rate = l5Agg.oneV1.faced > 0 ? (l5Agg.oneV1.won / l5Agg.oneV1.faced) : null;
    if (sznV1Rate !== null && l5V1Rate !== null && (sznV1Rate - l5V1Rate) > 0.20) {
      a.push({ type: "warning", cat: "Performance", title: "1v1 Win Rate Declining",
        detail: (l5V1Rate * 100).toFixed(0) + "% last 5 vs " + (sznV1Rate * 100).toFixed(0) + "% season.",
        action: "Review angle play and decision-making in breakaway situations." });
    }
  }
  return a;
}
