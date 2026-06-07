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

// ═══ AGGREGATION ENGINE ═════════════════════════════════════════════════════
export function aggregateMatches(matches) {
  if (!matches.length) return null;
  const gp = matches.length;
  const sum = (key) => matches.reduce((s, m) => s + (m[key] || 0), 0);
  const sot = sum("shots_on_target");
  const sv = sum("saves");
  const ga = sum("goals_conceded");
  const svPct = sot > 0 ? sv / sot : 0;
  const min = gp * 90;
  const gaa = gp > 0 ? ga / gp : 0;
  const wins = matches.filter(m => m.result === "W").length;
  const draws = matches.filter(m => m.result === "D").length;
  const losses = matches.filter(m => m.result === "L").length;
  const cs = matches.filter(m => m.goals_conceded === 0 && m.session_type === "match").length;
  const csPct = gp > 0 ? cs / gp : 0;
  return {
    gp, min, sot, saves: sv, ga, svPct, gaa, cs, csPct, w: wins, d: draws, l: losses,
    saveTypes: {
      Catch: sum("saves_catch"), Parry: sum("saves_parry"), Smother: sum("saves_dive"),
      Block: sum("saves_block"), Deflect: sum("saves_tip"), Punch: sum("saves_punch"),
    },
    crosses: {
      claimed: sum("crosses_claimed"), punched: sum("crosses_punched"),
      missed: sum("crosses_missed"), total: sum("crosses_total"),
    },
    distribution: {
      gkShort: { att: sum("dist_gk_short_att"), suc: sum("dist_gk_short_suc") },
      gkLong: { att: sum("dist_gk_long_att"), suc: sum("dist_gk_long_suc") },
      throws: { att: sum("dist_throws_att"), suc: sum("dist_throws_suc") },
      passes: { att: sum("dist_passes_att"), suc: sum("dist_passes_suc") },
      underPressure: { att: sum("dist_under_pressure_att"), suc: sum("dist_under_pressure_suc") },
      total: sum("dist_gk_short_att") + sum("dist_gk_long_att") + sum("dist_throws_att") + sum("dist_passes_att") + sum("dist_under_pressure_att"),
      accurate: sum("dist_gk_short_suc") + sum("dist_gk_long_suc") + sum("dist_throws_suc") + sum("dist_passes_suc") + sum("dist_under_pressure_suc"),
      inaccurate: (sum("dist_gk_short_att") + sum("dist_gk_long_att") + sum("dist_throws_att") + sum("dist_passes_att") + sum("dist_under_pressure_att")) - (sum("dist_gk_short_suc") + sum("dist_gk_long_suc") + sum("dist_throws_suc") + sum("dist_passes_suc") + sum("dist_under_pressure_suc")),
      types: { "GK Short": sum("dist_gk_short_att"), "GK Long": sum("dist_gk_long_att"), "Throws": sum("dist_throws_att"), "Passes": sum("dist_passes_att"), "Under Pressure": sum("dist_under_pressure_att") },
    },
    oneV1: { faced: sum("one_v_one_faced"), won: sum("one_v_one_won") },
    handling: { errGoal: sum("errors_leading_to_goal") },
    sweeper: {
      clearances: sum("sweeper_clearances"), interceptions: sum("sweeper_interceptions"),
      tackles: sum("sweeper_tackles"),
    },
    rebounds: { controlled: sum("rebounds_controlled"), dangerous: sum("rebounds_dangerous") },
  };
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

export function buildMatchLog(matches) {
  return [...matches]
    .sort((a, b) => new Date(b.match_date) - new Date(a.match_date))
    .map(m => ({
      id: m.id,
      date: new Date(m.match_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      opp: m.opponent || "Training",
      type: m.session_type,
      ha: m.venue === "home" ? "H" : m.venue === "away" ? "A" : "N",
      res: m.result || "—",
      score: m.session_type === "match" ? `${m.goals_for || 0}-${m.goals_against || 0}` : "—",
      sot: m.shots_on_target,
      sv: m.saves,
      ga: m.goals_conceded,
      svP: m.shots_on_target > 0 ? m.saves / m.shots_on_target : null,
      cs: m.goals_conceded === 0,
    }));
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
