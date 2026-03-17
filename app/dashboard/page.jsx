h"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  LineChart, Line, CartesianGrid, Legend, PieChart, Pie,
} from "recharts";

// ═══ THEME ═══════════════════════════════════════════════════════════════════
const tDark = {
  bg: "#070b0e", card: "#0f1419", cardAlt: "#151c22", border: "#1e2a32",
  accent: "#10b981", accentDim: "#065f46", accentGlow: "#10b98133",
  gold: "#d4a853", orange: "#f97316",
  red: "#ef4444", green: "#22c55e", yellow: "#eab308",
  cyan: "#06b6d4", purple: "#a78bfa", teal: "#14b8a6", pink: "#f472b6",
  text: "#d1d9e0", dim: "#5c6b77", bright: "#f0f4f7",
};
const tLight = {
  bg: "#f5f7fa", card: "#ffffff", cardAlt: "#f0f2f5", border: "#e2e8f0",
  accent: "#10b981", accentDim: "#d1fae5", accentGlow: "#10b98122",
  gold: "#b8860b", orange: "#ea580c",
  red: "#dc2626", green: "#16a34a", yellow: "#ca8a04",
  cyan: "#0891b2", purple: "#7c3aed", teal: "#0d9488", pink: "#db2777",
  text: "#1e293b", dim: "#64748b", bright: "#0f172a",
};
let t = tDark;
const font = "'DM Sans', -apple-system, sans-serif";
const PAL = ["#10b981","#059669","#047857","#0d9668","#34d399","#6ee7b7","#0f766e","#15803d","#065f46","#a7f3d0"];
const ttS = { contentStyle: { background: t.card, border: `1px solid ${t.border}`, borderRadius: 8, fontSize: 10, color: t.text }, itemStyle: { color: t.text } };

const ROLES = ["Starter", "Backup", "Development", "Trial"];
const FOOTED = ["Left", "Right", "Ambidextrous"];
const ATTR_KEYS = [
  "game_rating","shot_stopping","handling","positioning","aerial_dominance",
  "distribution","decision_making","sweeper_play","set_piece_org",
  "footwork_agility","reaction_speed","communication","command_of_box",
  "composure","compete_level",
];
const ATTR_LABELS = {
  game_rating:"Game Rating", shot_stopping:"Shot Stopping", handling:"Handling",
  positioning:"Positioning", aerial_dominance:"Aerial Dominance",
  distribution:"Distribution", decision_making:"Decision Making",
  sweeper_play:"Sweeper Play", set_piece_org:"Set Piece Org.",
  footwork_agility:"Footwork & Agility", reaction_speed:"Reaction Speed",
  communication:"Communication", command_of_box:"Command of Box",
  composure:"Composure", compete_level:"Compete Level",
};
const CORE_ATTRS = ["shot_stopping","positioning","aerial_dominance","distribution","decision_making","composure","compete_level"];

const ZONE_LABELS = {
  "High L": "Top Left", "High C": "Top Center", "High R": "Top Right",
  "Mid L": "Mid Left", "Mid C": "Mid Center", "Mid R": "Mid Right",
  "Low L": "Low Left", "Low C": "Low Center", "Low R": "Low Right",
};
const ORIGIN_LABELS = {
  "6yard": "6-Yard Box", "boxC": "Central Box", "boxL": "Left Channel",
  "boxR": "Right Channel", "cornerL": "Corner Left", "cornerR": "Corner Right",
  "outC": "Central Distance", "outL": "Wide Left", "outR": "Wide Right",
  "penalty": "Penalty Spot",
};

// ═══ FORMATTING HELPERS ══════════════════════════════════════════════════════
const pct = v => v != null && !isNaN(v) ? (v * 100).toFixed(1) + "%" : "—";
const dec = (v, d = 2) => v != null && !isNaN(v) ? v.toFixed(d) : "—";
const svC = v => v >= .800 ? t.green : v >= .700 ? t.accent : v >= .650 ? t.yellow : t.red;
const ratC = v => v >= 4.0 ? t.green : v >= 3.5 ? t.accent : v >= 3.0 ? t.yellow : t.red;

// ═══ AGGREGATION ENGINE ═════════════════════════════════════════════════════
function aggregateMatches(matches) {
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

function aggregateGoals(goals) {
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

function aggregateAttrs(attrRows) {
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

function aggregateQuarterly(matches) {
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

function buildMatchLog(matches) {
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
function genAlerts(keeperName, seasonAgg, l5Agg, seasonGoals, l5Goals, sznAttrs, l5Attrs) {
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
  return a;
}

// ═══ UI COMPONENTS ══════════════════════════════════════════════════════════
function Chip({ label, selected, onClick, color }) {
  const c = color || t.accent;
  return (
    <button onClick={onClick} style={{
      padding: "10px 10px", borderRadius: 8,
      border: `1px solid ${selected ? c : t.border}`,
      background: selected ? c + "25" : t.bg,
      color: selected ? c : t.dim,
      fontSize: 12, fontWeight: selected ? 700 : 500, cursor: "pointer",
      transition: "all 0.12s", textAlign: "center", fontFamily: font, minHeight: 40,
    }}>{label}</button>
  );
}

function Card({ children, s }) {
  return <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, ...s }}>{children}</div>;
}

function Sec({ children, title, icon }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
        <span style={{ fontSize: 13, fontWeight: 700, color: t.accent, textTransform: "uppercase", letterSpacing: 1.5 }}>{title || children}</span>
        <div style={{ flex: 1, height: 1, background: t.border, marginLeft: 8 }} />
      </div>
      {title && children}
    </div>
  )
}

function StatBox({ label, value, sub, color }) {
  return (
    <div style={{ textAlign: "center", padding: "8px 5px" }}>
      <div style={{ fontSize: 9, color: t.dim, textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || t.bright }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: t.dim }}>{sub}</div>}
    </div>
  );
}

function PBar({ label, value, color, max = 100, suf = "%" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
      <div style={{ width: 95, fontSize: 10, color: t.text, flexShrink: 0, textAlign: "right" }}>{label}</div>
      <div style={{ flex: 1, height: 14, background: t.bg, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${Math.min((value / max) * 100, 100)}%`, height: "100%", background: color || t.accent, borderRadius: 3 }} />
      </div>
      <div style={{ width: 44, fontSize: 10, color: t.bright, fontWeight: 600, textAlign: "right" }}>
        {typeof value === "number" ? value.toFixed(1) : value}{suf}
      </div>
    </div>
  );
}

function TrendBadge({ cur, prev, inv, suf = "" }) {
  if (cur == null || prev == null) return null;
  const d = cur - prev;
  if (Math.abs(d) < 0.005) return null;
  const up = inv ? d < 0 : d > 0;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 2, padding: "2px 5px",
      borderRadius: 4, fontSize: 8, fontWeight: 700,
      background: up ? t.green + "22" : t.red + "22",
      color: up ? t.green : t.red,
    }}>{up ? "▲" : "▼"} {Math.abs(d).toFixed(suf === "%" ? 1 : 2)}{suf}</span>
  );
}

function ScopeToggle({ scope, setScope }) {
  return (
    <div style={{ display: "inline-flex", background: t.bg, borderRadius: 8, padding: 2, border: `1px solid ${t.border}`, marginBottom: 14 }}>
      {[{ id: "season", label: "Season" }, { id: "l5", label: "Last 5" }].map(s => (
        <button key={s.id} onClick={() => setScope(s.id)} style={{
          padding: "6px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: font,
          fontSize: 11, fontWeight: scope === s.id ? 700 : 500,
          background: scope === s.id ? t.accent + "22" : "transparent",
          color: scope === s.id ? t.accent : t.dim,
        }}>{s.label}</button>
      ))}
    </div>
  );
}

// ═══ GOAL HEATMAP ═══════════════════════════════════════════════════════════
const ZONE_POSITIONS = {
  "High L": { x: 5, y: 5 }, "High C": { x: 38, y: 5 }, "High R": { x: 71, y: 5 },
  "Mid L": { x: 5, y: 35 }, "Mid C": { x: 38, y: 35 }, "Mid R": { x: 71, y: 35 },
  "Low L": { x: 5, y: 62 }, "Low C": { x: 38, y: 62 }, "Low R": { x: 71, y: 62 },
};

function GoalHeatmap({ zones, title }) {
  if (!zones || Object.keys(zones).length === 0) {
    return <div style={{ textAlign: "center", padding: 24, color: t.dim, fontSize: 12 }}>No goal data</div>;
  }
  const maxVal = Math.max(...Object.values(zones), 1);
  const grid = [["High L","High C","High R"],["Mid L","Mid C","Mid R"],["Low L","Low C","Low R"]];
  return (
    <div>
      {title && <div style={{ fontSize: 11, color: t.dim, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2, border: "2px solid " + t.border, borderRadius: 6, overflow: "hidden", maxWidth: 260, margin: "0 auto" }}>
        {grid.flat().map(z => {
          const v = zones[z] || 0;
          const intensity = v > 0 ? 0.25 + (v / maxVal) * 0.75 : 0;
          const label = ZONE_LABELS[z] || z;
          return (
            <div key={z} style={{
              aspectRatio: "1.2", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              background: v > 0 ? "rgba(239,68,68," + intensity + ")" : t.bg,
              borderRight: z.includes("R") ? "none" : "1px solid " + t.border,
              borderBottom: z.includes("Low") ? "none" : "1px solid " + t.border,
            }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: v > 0 ? t.bright : t.dim }}>{v}</div>
              <div style={{ fontSize: 8, color: v > 0 ? "rgba(255,255,255,0.65)" : t.dim, marginTop: 2 }}>{label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PitchOriginMap({ origins, title }) {
  if (!origins || Object.keys(origins).length === 0) {
    return <div style={{ textAlign: "center", padding: 24, color: t.dim, fontSize: 12 }}>No origin data</div>;
  }

    const maxVal = Math.max(...Object.values(origins), 1);
    // Merge 10 DB zones into 7 visual zones matching approved mockup
    const vizZones = [
      {key:"wideL", x:3, y:3, w:15, h:78, label:["Wide","Left"], val:(origins.cornerL||0)+(origins.outL||0)},
      {key:"channelL", x:18, y:3, w:14, h:48, label:["Left","Channel"], val:origins.boxL||0},
      {key:"6yard", x:32, y:3, w:36, h:19, label:["6-Yard Box"], val:origins["6yard"]||0},
      {key:"central", x:32, y:22, w:36, h:29, label:["Central Box"], val:(origins.boxC||0)+(origins.penalty||0)},
      {key:"channelR", x:68, y:3, w:14, h:48, label:["Right","Channel"], val:origins.boxR||0},
      {key:"wideR", x:82, y:3, w:15, h:78, label:["Wide","Right"], val:(origins.cornerR||0)+(origins.outR||0)},
      {key:"outside", x:18, y:51, w:64, h:30, label:["Outside","the Box"], val:origins.outC||0},
    ];
    const vizMax = Math.max(...vizZones.map(z=>z.val), 1);

    return (
      <div style={{textTransform:"none"}}>
        <svg viewBox="0 0 100 85" style={{width:"100%",maxWidth:300,display:"block",margin:"0 auto"}}>
          <rect x="0" y="0" width="100" height="85" rx="3" fill={t.bg} stroke={t.border} strokeWidth="0.5"/>
          <rect x="30" y="0" width="40" height="3" rx="1" fill={t.dim} opacity="0.3"/>
          <text x="50" y="2" textAnchor="middle" fill={t.bright} fontSize="2.8" fontWeight="700" letterSpacing="1">GOAL</text>
          <line x1="18" y1="3" x2="18" y2="81" stroke={t.border} strokeWidth="0.3" strokeDasharray="2"/>
          <line x1="82" y1="3" x2="82" y2="81" stroke={t.border} strokeWidth="0.3" strokeDasharray="2"/>
          <line x1="32" y1="3" x2="32" y2="51" stroke={t.border} strokeWidth="0.3" strokeDasharray="2"/>
          <line x1="68" y1="3" x2="68" y2="51" stroke={t.border} strokeWidth="0.3" strokeDasharray="2"/>
          <line x1="32" y1="22" x2="68" y2="22" stroke={t.border} strokeWidth="0.3" strokeDasharray="2"/>
          <line x1="18" y1="51" x2="82" y2="51" stroke={t.border} strokeWidth="0.3" strokeDasharray="2"/>
          {vizZones.map(z => {
            const cx=z.x+z.w/2, cy=z.y+z.h/2;
            const isNarrow=z.w<=15, isTall=z.h>=40;
            const fontSize=isNarrow?2.5:(z.w>30?3.5:3);
            const valSize=z.val>0?(isNarrow?5.5:7.5):(isNarrow?3.5:4.5);
            const intensity=z.val>0?(0.15+(z.val/vizMax)*0.6):0;
            const valY=isTall?(z.y+z.h*0.35):(cy-3);
            const lblY=isTall?(z.y+z.h*0.55):(cy+4);
            return (
              <g key={z.key}>
                {z.val > 0 && <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="1.5" fill={"rgba(239,68,68,"+intensity+")"}/>}
                <text x={cx} y={valY} textAnchor="middle" dominantBaseline="middle" fill={z.val>0?t.bright:t.dim} fontSize={valSize} fontWeight="800" opacity={z.val>0?1:0.3}>{z.val}</text>
                <text x={cx} textAnchor="middle" fill={z.val>0?"rgba(255,255,255,0.75)":t.dim} fontSize={fontSize} fontWeight={z.val>0?"600":"500"}>
                  {z.label.map((line,i) => <tspan key={i} x={cx} y={i===0?lblY:undefined} dy={i>0?(fontSize+0.8):undefined}>{line}</tspan>)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
  );
}

function KeeperModal({ keeper, onSave, onClose, onDeactivate, primaryColor }) {
  const [name, setName] = useState(keeper?.name || "");
  const [number, setNumber] = useState(keeper?.number?.toString() || "");
  const [foot, setFoot] = useState(keeper?.catch_hand || "");
  const [dob, setDob] = useState(keeper?.date_of_birth || "");
  const [role, setRole] = useState(keeper?.role || "");
  const [saving, setSaving] = useState(false);
  const isEdit = !!keeper?.id;
  const canSave = name.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    await onSave({
      name: name.trim(),
      number: number ? parseInt(number) : null,
      catch_hand: foot || null,
      date_of_birth: dob || null,
      role: role || null,
    });
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: t.card, borderRadius: 16, width: "100%", maxWidth: 420, padding: 24, maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: t.bright }}>{isEdit ? "Edit Keeper" : "Add Goalkeeper"}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: t.dim, fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: t.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name"
            style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.bg, color: t.bright, fontSize: 15, fontFamily: font, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, color: t.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Number</label>
            <input type="number" value={number} onChange={e => setNumber(e.target.value)} placeholder="#"
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.bg, color: t.bright, fontSize: 15, fontFamily: font, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: t.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Date of Birth</label>
            <input type="date" value={dob} onChange={e => setDob(e.target.value)}
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.bg, color: t.bright, fontSize: 14, fontFamily: font, outline: "none", boxSizing: "border-box" }} />
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: t.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 8 }}>Footed</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {FOOTED.map(f => <Chip key={f} label={f} selected={foot === f} onClick={() => setFoot(f)} color={primaryColor} />)}
          </div>
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 11, color: t.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 8 }}>Depth Chart Role</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
            {ROLES.map(r => <Chip key={r} label={r} selected={role === r} onClick={() => setRole(r)} color={primaryColor} />)}
          </div>
        </div>
        <button onClick={handleSave} disabled={!canSave || saving} style={{
          width: "100%", padding: 16, borderRadius: 12, border: "none",
          background: canSave ? (primaryColor || t.accent) : t.border,
          color: canSave ? "#fff" : t.dim, fontSize: 16, fontWeight: 700,
          cursor: canSave ? "pointer" : "not-allowed", fontFamily: font, minHeight: 52,
        }}>{saving ? "Saving..." : isEdit ? "Save Changes" : "Add Goalkeeper"}</button>
        {isEdit && onDeactivate && (
          <button onClick={onDeactivate} style={{
            width: "100%", marginTop: 10, padding: 12, borderRadius: 8,
            background: "transparent", border: `1px solid ${t.red}33`,
            color: t.red, fontSize: 12, cursor: "pointer", fontFamily: font, minHeight: 40,
          }}>Remove from Active Roster</button>
        )}
      </div>
    </div>
  );
}

// ═══ EMPTY STATE ════════════════════════════════════════════════════════════
function EmptyState({ icon, title, subtitle }) {
  return (
    <Card s={{ textAlign: "center", padding: 40 }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: t.bright, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: t.dim, lineHeight: 1.5 }}>{subtitle}</div>
    </Card>
  );
}

// ═══ SINGLE GAME VIEW ═══════════════════════════════════════════════════════
// ═══ SHOT CROSS-REFERENCE ════════════════════════════════════════════════════
const ORIGINS = ["Inside Box", "Outside Box", "Penalty Spot", "Right Channel", "Left Channel", "Central", "Header Zone"];
const NET_ZONES = ["High L", "High C", "High R", "Mid L", "Mid C", "Mid R", "Low L", "Low C", "Low R"];
const NET_ZONE_GRID = [
  ["High L", "High C", "High R"],
  ["Mid L",  "Mid C",  "Mid R"],
  ["Low L",  "Low C",  "Low R"],
];

function ShotCrossRef({ goals }) {
  const [activeOrigin, setActiveOrigin] = useState(null);

  if (!goals || goals.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 32, color: t.dim, fontSize: 12 }}>
        No goal data to cross-reference yet.
      </div>
    );
  }

  // Build origin → zone matrix from raw goals
  const matrix = {};
  const originsUsed = new Set();
  const zonesUsed = new Set();

  goals.forEach(g => {
    const origin = g.shot_origin;
    const zone = g.goal_zone;
    if (!origin || !zone) return;
    originsUsed.add(origin);
    zonesUsed.add(zone);
    if (!matrix[origin]) matrix[origin] = {};
    matrix[origin][zone] = (matrix[origin][zone] || 0) + 1;
  });

  const usedOrigins = ORIGINS.filter(o => originsUsed.has(o));
  // Also include any origins in data not in our preset list
  originsUsed.forEach(o => { if (!ORIGINS.includes(o)) usedOrigins.push(o); });

  if (usedOrigins.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 24, color: t.dim, fontSize: 12 }}>
        Goal data exists but shot origin / net zone fields are not yet populated.
      </div>
    );
  }

  // When an origin is selected, show its net zone distribution
  const selectedData = activeOrigin ? (matrix[activeOrigin] || {}) : null;
  const selectedTotal = selectedData ? Object.values(selectedData).reduce((s, v) => s + v, 0) : 0;

  // For the summary table: totals per origin
  const originTotals = usedOrigins.map(o => ({
    origin: o,
    total: Object.values(matrix[o] || {}).reduce((s, v) => s + v, 0),
    topZone: Object.entries(matrix[o] || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "—",
  })).sort((a, b) => b.total - a.total);

  const maxTotal = Math.max(...originTotals.map(o => o.total), 1);

  return (
    <div>
      {/* Intro label */}
      <div style={{ fontSize: 11, color: t.dim, marginBottom: 14, lineHeight: 1.5 }}>
        Click a shot origin to see exactly where on the net those goals went. Reveals pattern vulnerabilities for targeted training.
      </div>

      {/* Origin summary bars — clickable */}
      <div style={{ marginBottom: 16 }}>
        {originTotals.map(({ origin, total, topZone }) => (
          <div
            key={origin}
            onClick={() => setActiveOrigin(activeOrigin === origin ? null : origin)}
            style={{
              display: "flex", alignItems: "center", gap: 10, marginBottom: 6,
              padding: "8px 10px", borderRadius: 8, cursor: "pointer",
              background: activeOrigin === origin ? t.red + "18" : "transparent",
              border: `1px solid ${activeOrigin === origin ? t.red + "55" : "transparent"}`,
              transition: "all 0.12s",
            }}
          >
            <div style={{ width: 110, fontSize: 11, color: activeOrigin === origin ? t.bright : t.text, fontWeight: activeOrigin === origin ? 700 : 400, flexShrink: 0 }}>{ORIGIN_LABELS[origin] || origin}</div>
            <div style={{ flex: 1, height: 10, background: t.bg, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(total / maxTotal) * 100}%`, background: activeOrigin === origin ? t.red : t.orange, borderRadius: 3, transition: "width 0.2s" }} />
            </div>
            <div style={{ width: 20, fontSize: 12, fontWeight: 700, color: t.bright, textAlign: "right" }}>{total}</div>
            <div style={{ width: 60, fontSize: 9, color: t.dim, textAlign: "right" }}>→ {topZone}</div>
          </div>
        ))}
      </div>

      {/* Net zone breakdown for selected origin */}
      {activeOrigin && selectedData && (
        <div style={{ background: t.cardAlt, borderRadius: 10, padding: 16, border: `1px solid ${t.border}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.bright, marginBottom: 4 }}>
            Goals from <span style={{ color: t.orange }}>{activeOrigin}</span> — where they went in
          </div>
          <div style={{ fontSize: 10, color: t.dim, marginBottom: 14 }}>
            {selectedTotal} goal{selectedTotal !== 1 ? "s" : ""} conceded from this position
          </div>

          {/* 3×3 net grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, maxWidth: 260, margin: "0 auto 14px" }}>
            {NET_ZONE_GRID.flat().map(zone => {
              const count = selectedData[zone] || 0;
              const pctVal = selectedTotal > 0 ? (count / selectedTotal) : 0;
              const intensity = pctVal;
              return (
                <div key={zone} style={{
                  background: count > 0 ? `rgba(239,68,68,${0.12 + intensity * 0.7})` : t.bg,
                  border: `1px solid ${count > 0 ? t.red + "55" : t.border}`,
                  borderRadius: 6, padding: "10px 4px", textAlign: "center",
                }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: count > 0 ? t.bright : t.dim }}>{count}</div>
                  <div style={{ fontSize: 8, color: t.dim, marginTop: 2 }}>{zone}</div>
                  {count > 0 && <div style={{ fontSize: 8, color: t.red, fontWeight: 600 }}>{(pctVal * 100).toFixed(0)}%</div>}
                </div>
              );
            })}
          </div>

          {/* Coaching insight */}
          {selectedTotal >= 2 && (() => {
            const top = Object.entries(selectedData).sort((a, b) => b[1] - a[1])[0];
            const topPct = top ? ((top[1] / selectedTotal) * 100).toFixed(0) : 0;
            const isHighDanger = top?.[0]?.startsWith("Low") || top?.[0]?.startsWith("Mid");
            return (
              <div style={{ background: t.red + "12", border: `1px solid ${t.red}33`, borderRadius: 8, padding: "10px 12px", fontSize: 11, color: t.text, lineHeight: 1.6 }}>
                <span style={{ color: t.red, fontWeight: 700 }}>⚠ Pattern: </span>
                {topPct}% of goals from <strong>{activeOrigin}</strong> go to the <strong>{top?.[0]}</strong> zone.
                {isHighDanger ? " Low/mid goals often indicate positioning or set stance — drill this channel in training." : " High goals from this zone suggest poor starting position or late reaction — review set position."}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function SingleGameView({ match, goals, logRow, keeperName, primaryColor, onBack, onReport }) {
  if (!match) return (
    <div style={{ padding: 32, color: t.dim, textAlign: "center" }}>
      Match data unavailable.
      <button onClick={onBack} style={{ marginTop: 16, display: "block", margin: "16px auto 0", padding: "8px 20px", background: t.accent, color: "#000", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: font }}>← Back</button>
    </div>
  );

  const pc = primaryColor || t.accent;
  const svPct = match.shots_on_target > 0 ? (match.saves / match.shots_on_target * 100).toFixed(1) : "–";
  const resultColor = logRow.res === "W" ? t.green : logRow.res === "L" ? t.red : t.yellow;
  const isMatch = match.session_type === "match";

  const saveTypes = [
    { label: "Catch", val: match.saves_catch || 0 },
    { label: "Parry", val: match.saves_parry || 0 },
    { label: "Smother",  val: match.saves_dive  || 0 },
    { label: "Block", val: match.saves_block || 0 },
    { label: "Deflect",   val: match.saves_tip   || 0 },
    { label: "Punch", val: match.saves_punch || 0 },
  ].filter(s => s.val > 0);
  const maxSave = Math.max(...saveTypes.map(s => s.val), 1);

  const goalZones = {};
  goals.forEach(g => { if (g.goal_zone) goalZones[g.goal_zone] = (goalZones[g.goal_zone] || 0) + 1; });

  const distRows = [
    { name: "GK Short", att: match.dist_gk_short_att || 0, suc: match.dist_gk_short_suc || 0 },
    { name: "GK Long",  att: match.dist_gk_long_att  || 0, suc: match.dist_gk_long_suc  || 0 },
    { name: "Throws",   att: match.dist_throws_att   || 0, suc: match.dist_throws_suc   || 0 },
    { name: "Passes",   att: match.dist_passes_att   || 0, suc: match.dist_passes_suc   || 0 },
  ].filter(d => d.att > 0);

  const notes = match.coaching_notes || match.notes || null;
  const focus = match.coach_focus || match.session_focus || null;

  return (
    <div style={{ fontFamily: font, color: t.text }}>
      {/* Header bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: t.cardAlt, border: `1px solid ${t.border}`, borderRadius: 8, padding: "8px 14px", color: t.bright, fontSize: 12, cursor: "pointer", fontFamily: font }}>
          ← Back to Matches
        </button>
        <button onClick={() => onReport(match)} style={{ background: t.accent, border: "none", borderRadius: 8, padding: "8px 16px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: font, boxShadow: `0 0 12px ${t.accentGlow}` }}>
          📄 Generate Report
        </button>
      </div>

      {/* Match header */}
      <Card s={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: t.bright }}>{logRow.opp}</div>
            <div style={{ fontSize: 12, color: t.dim, marginTop: 2 }}>{logRow.date} · {logRow.ha} · {isMatch ? "Match" : "Training"}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isMatch && <div style={{ fontSize: 22, fontWeight: 800, color: resultColor }}>{logRow.score || "–"}</div>}
            {isMatch && (
              <div style={{ padding: "4px 10px", borderRadius: 6, background: resultColor + "22", color: resultColor, fontSize: 12, fontWeight: 700 }}>{logRow.res}</div>
            )}
            {match.goals_conceded === 0 && isMatch && (
              <div style={{ padding: "4px 10px", borderRadius: 6, background: t.green + "22", color: t.green, fontSize: 11, fontWeight: 700 }}>CS ✓</div>
            )}
          </div>
        </div>
      </Card>

      {/* Key stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))", gap: 8, marginBottom: 12 }}>
        {[
          { label: "SOT",     val: match.shots_on_target ?? "–" },
          { label: "Saves",   val: match.saves ?? "–" },
          { label: "GA",      val: match.goals_conceded ?? "–" },
          { label: "Sv%",     val: svPct !== "–" ? svPct + "%" : "–" },
          { label: "1v1 W",   val: match.one_v_one_won != null ? `${match.one_v_one_won}/${match.one_v_one_faced || 0}` : "–" },
          { label: "Err→Gol", val: match.errors_leading_to_goal ?? 0 },
        ].map(s => (
          <div key={s.label} style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: t.bright }}>{s.val}</div>
            <div style={{ fontSize: 9, color: t.dim, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {saveTypes.length > 0 && (
          <Card>
            <Sec icon="🧤">Save Types</Sec>
            {saveTypes.map(s => (
              <div key={s.label} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                  <span style={{ color: t.text }}>{s.label}</span>
                  <span style={{ color: t.bright, fontWeight: 600 }}>{s.val}</span>
                </div>
                <div style={{ height: 6, background: t.bg, borderRadius: 3 }}>
                  <div style={{ height: "100%", width: `${(s.val / maxSave) * 100}%`, background: pc, borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </Card>
        )}
        <Card>
          <GoalHeatmap zones={goalZones} title={match.goals_conceded > 0 ? `${match.goals_conceded} Goal${match.goals_conceded !== 1 ? "s" : ""} Conceded` : "Clean Sheet"} />
        </Card>
      </div>

      {goals.length > 0 && (
        <Card s={{ marginBottom: 12 }}>
          <Sec icon="⚽">Goal Analysis</Sec>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: t.dim, marginBottom: 6, textTransform: "uppercase" }}>Rank</div>
              {["Saveable", "Difficult", "Unsaveable"].map(r => {
                const cnt = goals.filter(g => g.goal_rank === r).length;
                return cnt > 0 ? (
                  <div key={r} style={{ fontSize: 11, display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ color: t.text }}>{r}</span>
                    <span style={{ fontWeight: 700, color: r === "Saveable" ? t.red : r === "Difficult" ? t.yellow : t.dim }}>{cnt}</span>
                  </div>
                ) : null;
              })}
            </div>
            <div>
              <div style={{ fontSize: 10, color: t.dim, marginBottom: 6, textTransform: "uppercase" }}>Source</div>
              {["Open Play", "Corner", "Free Kick", "Penalty"].map(s => {
                const cnt = goals.filter(g => g.goal_source === s).length;
                return cnt > 0 ? (
                  <div key={s} style={{ fontSize: 11, display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ color: t.text }}>{s}</span>
                    <span style={{ fontWeight: 700, color: t.bright }}>{cnt}</span>
                  </div>
                ) : null;
              })}
            </div>
            <div>
              <div style={{ fontSize: 10, color: t.dim, marginBottom: 6, textTransform: "uppercase" }}>Shot Type</div>
              {["Foot", "Header", "Deflection"].map(s => {
                const cnt = goals.filter(g => g.shot_type === s).length;
                return cnt > 0 ? (
                  <div key={s} style={{ fontSize: 11, display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ color: t.text }}>{s}</span>
                    <span style={{ fontWeight: 700, color: t.bright }}>{cnt}</span>
                  </div>
                ) : null;
              })}
            </div>
          </div>
        </Card>
      )}

      {distRows.length > 0 && (
        <Card s={{ marginBottom: 12 }}>
          <Sec icon="🎯">Distribution Accuracy</Sec>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
            {distRows.map(d => {
              const p = d.att > 0 ? Math.round(d.suc / d.att * 100) : null;
              return (
                <div key={d.name} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: p >= 80 ? t.green : p >= 60 ? t.accent : t.yellow }}>{p != null ? p + "%" : "–"}</div>
                  <div style={{ fontSize: 10, color: t.dim, marginTop: 2 }}>{d.name}</div>
                  <div style={{ fontSize: 10, color: t.text, marginTop: 1 }}>{d.suc}/{d.att}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card s={{ marginBottom: 12 }}>
        <Sec icon="🏃">Physical & Crosses</Sec>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: t.dim, marginBottom: 8, textTransform: "uppercase" }}>Sweeper</div>
            {[
              { label: "Clearances",    val: match.sweeper_clearances },
              { label: "Interceptions", val: match.sweeper_interceptions },
              { label: "Tackles",       val: match.sweeper_tackles },
            ].map(x => (
              <div key={x.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}>
                <span style={{ color: t.text }}>{x.label}</span>
                <span style={{ fontWeight: 700, color: t.bright }}>{x.val ?? 0}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 10, color: t.dim, marginBottom: 8, textTransform: "uppercase" }}>Crosses</div>
            {[
              { label: "Claimed", val: match.crosses_claimed },
              { label: "Punched", val: match.crosses_punched },
              { label: "Missed",  val: match.crosses_missed },
            ].map(x => (
              <div key={x.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}>
                <span style={{ color: t.text }}>{x.label}</span>
                <span style={{ fontWeight: 700, color: t.bright }}>{x.val ?? 0}</span>
              </div>
            ))}
            {(match.crosses_total > 0) && (
              <div style={{ marginTop: 6, fontSize: 11, color: t.dim, borderTop: `1px solid ${t.border}`, paddingTop: 6 }}>
                Claim rate: <span style={{ color: t.bright, fontWeight: 700 }}>
                  {Math.round((match.crosses_claimed || 0) / match.crosses_total * 100)}%
                </span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {notes && (
        <Card s={{ borderLeft: `3px solid ${pc}` }}>
          <Sec icon="📋">Coaching Notes</Sec>
          <p style={{ fontSize: 12, color: t.text, lineHeight: 1.7, margin: 0 }}>{notes}</p>
          {focus && (
            <div style={{ marginTop: 10, background: pc + "15", borderRadius: 6, padding: "8px 12px", fontSize: 11, color: pc }}>
              <strong>Session Focus:</strong> {focus}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ═══ REPORT VIEW ════════════════════════════════════════════════════════════
function ReportView({ keeper, keeperData, alerts, targetGame, primaryColor, onBack }) {
  const pc = primaryColor || t.accent;
  if (!keeper || !keeperData) return null;

  const s = keeperData.season;
  const l = keeperData.l5;
  const sG = keeperData.seasonGoals;
  const sA = keeperData.sznAttrs;
  const l5A = keeperData.l5Attrs;
  const log = keeperData.matchLog || [];
  const isSingleGame = !!targetGame;
  const gm = isSingleGame ? targetGame : null;
  const svPct = gm ? (gm.shots_on_target > 0 ? (gm.saves / gm.shots_on_target * 100).toFixed(1) : null) : null;

  const radarData = CORE_ATTRS.map(k => ({
    attr: ATTR_LABELS[k],
    Season: sA?.[k] ? sA[k] * 20 : null,
    "Last 5": l5A?.[k] ? l5A[k] * 20 : null,
  })).filter(r => r.Season != null || r["Last 5"] != null);

  const pageStyle = {
    background: "#fff", color: "#111",
    fontFamily: "'DM Sans', sans-serif",
    width: "794px", minHeight: "1123px",
    padding: "32px 36px", boxSizing: "border-box",
    position: "relative", margin: "0 auto 24px",
    boxShadow: "0 4px 32px rgba(0,0,0,0.3)",
  };

  return (
    <div style={{ background: "#0a0a0f", minHeight: "100vh", padding: "20px", fontFamily: font }}>
      {/* Controls */}
      <div className="no-print" style={{ display: "flex", gap: 12, marginBottom: 20, justifyContent: "center" }}>
        <button onClick={onBack} style={{ padding: "10px 20px", background: t.card, border: `1px solid ${t.border}`, color: t.text, borderRadius: 8, cursor: "pointer", fontFamily: font, fontSize: 13 }}>
          ← Back to Dashboard
        </button>
        <button onClick={() => window.print()} style={{ padding: "10px 24px", background: pc, border: "none", color: "#000", borderRadius: 8, cursor: "pointer", fontFamily: font, fontSize: 13, fontWeight: 700 }}>
          🖨️ Print / Save as PDF
        </button>
      </div>

      {/* PAGE 1 */}
      <div style={pageStyle} className="print-page">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `3px solid ${pc}`, paddingBottom: 12, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#111" }}>
              {keeper.name}
              {isSingleGame && <span style={{ fontSize: 14, fontWeight: 500, color: "#555", marginLeft: 12 }}>vs {gm.opponent || "–"}</span>}
            </div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>Goalkeeper Performance Report · StixAnalytix</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: pc }}>{isSingleGame ? "Match Report" : "Season Report"}</div>
            <div style={{ fontSize: 11, color: "#888" }}>{new Date().toLocaleDateString("en-GB")}</div>
          </div>
        </div>

        {/* Key stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginBottom: 20 }}>
          {(isSingleGame ? [
            { label: "SOT",    val: gm.shots_on_target ?? "–" },
            { label: "Saves",  val: gm.saves ?? "–" },
            { label: "GA",     val: gm.goals_conceded ?? "–" },
            { label: "Sv%",    val: svPct ? svPct + "%" : "–" },
            { label: "1v1 Won",val: gm.one_v_one_won ?? "–" },
            { label: "Err→G",  val: gm.errors_leading_to_goal ?? 0 },
          ] : [
            { label: "GP",    val: s?.gp ?? "–" },
            { label: "Sv%",   val: s ? pct(s.svPct) : "–" },
            { label: "GAA",   val: s ? dec(s.gaa, 2) : "–" },
            { label: "CS%",   val: s ? pct(s.csPct) : "–" },
            { label: "W-D-L", val: s ? `${s.w}-${s.d}-${s.l}` : "–" },
            { label: "Saves", val: s?.saves ?? "–" },
          ]).map(x => (
            <div key={x.label} style={{ background: "#f5f5f7", borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#111" }}>{x.val}</div>
              <div style={{ fontSize: 9, color: "#888", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>{x.label}</div>
            </div>
          ))}
        </div>

        {/* Radar + Heatmap */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
          {radarData.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Attribute Profile</div>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#ddd" />
                  <PolarAngleAxis dataKey="attr" tick={{ fontSize: 8, fill: "#555" }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="Season" dataKey="Season" stroke={pc} fill={pc} fillOpacity={0.15} strokeWidth={2} />
                  <Radar name="Last 5" dataKey="Last 5" stroke={t.gold} fill={t.gold} fillOpacity={0.1} strokeWidth={2} strokeDasharray="4 2" />
                  <Legend wrapperStyle={{ fontSize: 10, color: "#555" }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Goals Conceded — Zone Map</div>
            <GoalHeatmap zones={sG?.zones || {}} />
          </div>
        </div>

        {/* Distribution */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Distribution Accuracy</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { name: "GK Short",      att: s?.distribution?.gkShort?.att,      suc: s?.distribution?.gkShort?.suc },
              { name: "GK Long",       att: s?.distribution?.gkLong?.att,       suc: s?.distribution?.gkLong?.suc },
              { name: "Throws",        att: s?.distribution?.throws?.att,       suc: s?.distribution?.throws?.suc },
              { name: "Passes",        att: s?.distribution?.passes?.att,       suc: s?.distribution?.passes?.suc },
              { name: "Under Pressure",att: s?.distribution?.underPressure?.att, suc: s?.distribution?.underPressure?.suc },
            ].filter(d => d.att > 0).map(d => {
              const p = d.att > 0 ? Math.round(d.suc / d.att * 100) : 0;
              return (
                <div key={d.name} style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3, color: "#333" }}>
                    <span>{d.name}</span><span style={{ fontWeight: 700 }}>{p}%</span>
                  </div>
                  <div style={{ height: 6, background: "#eee", borderRadius: 3 }}>
                    <div style={{ height: "100%", width: p + "%", background: p >= 80 ? t.green : p >= 60 ? pc : "#f97316", borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ position: "absolute", bottom: 24, left: 36, right: 36, borderTop: "1px solid #ddd", paddingTop: 10, display: "flex", justifyContent: "space-between", fontSize: 9, color: "#aaa" }}>
          <span>StixAnalytix · Goalkeeper Coaching Intelligence</span>
          <span>Page 1 of 2</span>
        </div>
      </div>

      {/* PAGE 2 */}
      <div style={pageStyle} className="print-page">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `3px solid ${pc}`, paddingBottom: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>{keeper.name} — {isSingleGame ? "Match" : "Season"} Report (cont.)</div>
          <div style={{ fontSize: 11, color: "#888" }}>StixAnalytix</div>
        </div>

        {/* Season vs Last 5 */}
        {!isSingleGame && s && l && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Season vs Last 5 Comparison</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: "#f5f5f7" }}>
                  {["Metric", "Season", "Last 5"].map(h => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: h === "Metric" ? "left" : "center", color: "#555", fontWeight: 700, borderBottom: "1px solid #ddd" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Save %",       szn: pct(s.svPct),  l5v: pct(l.svPct) },
                  { label: "GAA",          szn: dec(s.gaa, 2), l5v: dec(l.gaa, 2) },
                  { label: "CS %",         szn: pct(s.csPct),  l5v: pct(l.csPct) },
                  { label: "Saves / Game", szn: dec(s.gp > 0 ? s.saves/s.gp : null, 1), l5v: dec(l.gp > 0 ? l.saves/l.gp : null, 1) },
                  { label: "1v1 Win %",    szn: s.oneV1?.faced > 0 ? pct(s.oneV1.won/s.oneV1.faced) : "–", l5v: l.oneV1?.faced > 0 ? pct(l.oneV1.won/l.oneV1.faced) : "–" },
                  { label: "Cross Claim%", szn: s.crosses?.total > 0 ? pct(s.crosses.claimed/s.crosses.total) : "–", l5v: l.crosses?.total > 0 ? pct(l.crosses.claimed/l.crosses.total) : "–" },
                ].map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "7px 10px", color: "#333" }}>{row.label}</td>
                    <td style={{ padding: "7px 10px", textAlign: "center", fontWeight: 600, color: "#111" }}>{row.szn}</td>
                    <td style={{ padding: "7px 10px", textAlign: "center", fontWeight: 600, color: pc }}>{row.l5v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Alerts */}
        {alerts?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Active Coaching Alerts</div>
            {alerts.slice(0, 5).map((al, i) => (
              <div key={i} style={{ padding: "8px 12px", borderRadius: 6, marginBottom: 6, background: al.type === "positive" ? "#f0fdf4" : al.type === "alert" ? "#fef2f2" : "#fff7ed", borderLeft: `3px solid ${al.type === "positive" ? t.green : al.type === "alert" ? "#ef4444" : "#f97316"}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: al.type === "positive" ? "#15803d" : al.type === "alert" ? "#dc2626" : "#c2410c" }}>{al.title}</div>
                <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>{al.detail} · {al.action}</div>
              </div>
            ))}
          </div>
        )}

        {/* Match log */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Recent Match Log</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>
              <tr style={{ background: "#f5f5f7" }}>
                {["Date", "Opponent", "H/A", "Res", "Score", "SOT", "Sv", "GA", "Sv%"].map(h => (
                  <th key={h} style={{ padding: "6px 8px", textAlign: "center", color: "#666", fontWeight: 700, borderBottom: "1px solid #ddd" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {log.slice(0, 10).map((m, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "5px 8px", color: "#555", textAlign: "center" }}>{m.date}</td>
                  <td style={{ padding: "5px 8px", fontWeight: 600, color: "#222" }}>{m.opp}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center", color: "#777" }}>{m.ha}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center", fontWeight: 700, color: m.res === "W" ? "#16a34a" : m.res === "L" ? "#dc2626" : "#d97706" }}>{m.res}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center", color: "#333" }}>{m.score}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center", color: "#555" }}>{m.sot}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center", color: "#555" }}>{m.sv}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center", color: m.ga > 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }}>{m.ga}</td>
                  <td style={{ padding: "5px 8px", textAlign: "center", fontWeight: 600, color: "#333" }}>{m.svP != null ? pct(m.svP) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ position: "absolute", bottom: 24, left: 36, right: 36, borderTop: "1px solid #ddd", paddingTop: 10, display: "flex", justifyContent: "space-between", fontSize: 9, color: "#aaa" }}>
          <span>StixAnalytix · Goalkeeper Coaching Intelligence</span>
          <span>Page 2 of 2</span>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0 !important; }
          .print-page { page-break-after: always; box-shadow: none !important; margin: 0 !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EDIT MATCH MODAL
// ═══════════════════════════════════════════════════════════════════════════════

function EditMatchModal({ match, onSave, onClose }) {
  const [formData, setFormData] = useState({
    opponent: match?.opponent || "",
    match_date: match?.match_date || "",
    session_type: match?.session_type || "match",
    venue: match?.venue || "home",
    result: match?.result || "—",
    goals_for: match?.goals_for ?? 0,
    goals_against: match?.goals_against ?? 0,
    shots_on_target: match?.shots_on_target ?? 0,
    saves: match?.saves ?? 0,
    goals_conceded: match?.goals_conceded ?? 0,
  });

  const isMatch = formData.session_type === "match";
  const handleChange = (field, value) => { setFormData(prev => ({ ...prev, [field]: value })); };
  const handleSubmit = (e) => { e.preventDefault(); onSave(formData); };

  const inputStyle = { width: "100%", boxSizing: "border-box", padding: "8px 12px", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 6, color: t.text, fontFamily: font, fontSize: 13 };
  const labelStyle = { display: "block", fontSize: 12, color: t.dim, marginBottom: 6, fontWeight: 600 };
  const selectStyle = { ...inputStyle, cursor: "pointer" };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, fontFamily: font }}>
      <div style={{ background: t.card, borderRadius: 12, border: `1px solid ${t.border}`, padding: 24, maxWidth: 480, width: "90%", color: t.text }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: t.bright, margin: "0 0 20px" }}>Edit Match</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Opponent</label>
            <input type="text" value={formData.opponent} onChange={e => handleChange("opponent", e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Match Date</label>
              <input type="date" value={formData.match_date} onChange={e => handleChange("match_date", e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select value={formData.session_type} onChange={e => handleChange("session_type", e.target.value)} style={selectStyle}>
                <option value="match">Match</option>
                <option value="training">Training</option>
              </select>
            </div>
          </div>
          {isMatch && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Venue</label>
                <select value={formData.venue} onChange={e => handleChange("venue", e.target.value)} style={selectStyle}>
                  <option value="home">Home</option>
                  <option value="away">Away</option>
                  <option value="neutral">Neutral</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Result</label>
                <select value={formData.result} onChange={e => handleChange("result", e.target.value)} style={selectStyle}>
                  <option value="W">Win</option>
                  <option value="D">Draw</option>
                  <option value="L">Loss</option>
                  <option value="—">—</option>
                </select>
              </div>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Goals For</label>
              <input type="number" value={formData.goals_for} onChange={e => handleChange("goals_for", parseInt(e.target.value) || 0)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Goals Against</label>
              <input type="number" value={formData.goals_against} onChange={e => handleChange("goals_against", parseInt(e.target.value) || 0)} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Shots on Target</label>
              <input type="number" value={formData.shots_on_target} onChange={e => handleChange("shots_on_target", parseInt(e.target.value) || 0)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Saves</label>
              <input type="number" value={formData.saves} onChange={e => handleChange("saves", parseInt(e.target.value) || 0)} style={inputStyle} />
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Goals Conceded</label>
            <input type="number" value={formData.goals_conceded} onChange={e => handleChange("goals_conceded", parseInt(e.target.value) || 0)} style={inputStyle} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" style={{ flex: 1, padding: "10px 14px", borderRadius: 6, background: t.accent, border: "none", color: "#000", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: font }}>Save Changes</button>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px 14px", borderRadius: 6, background: t.cardAlt, border: `1px solid ${t.border}`, color: t.text, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: font }}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE MATCH CONFIRMATION MODAL
// ═══════════════════════════════════════════════════════════════════════════════

function DeleteMatchConfirm({ match, onConfirm, onClose }) {
  const dateStr = new Date(match?.match_date || "").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const opponent = match?.opponent || "Unknown";

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, fontFamily: font }}>
      <div style={{ background: t.card, borderRadius: 12, border: `1px solid ${t.border}`, padding: 24, maxWidth: 420, width: "90%", color: t.text }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: t.red + "22", border: `1px solid ${t.red}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
            🗑️
          </div>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: t.bright, margin: "0 0 6px" }}>Delete Match?</h2>
            <p style={{ fontSize: 13, color: t.dim, margin: 0, lineHeight: 1.5 }}>
              Delete match vs <strong style={{ color: t.text }}>{opponent}</strong> on <strong style={{ color: t.text }}>{dateStr}</strong>?
            </p>
            <p style={{ fontSize: 12, color: t.dim, margin: "10px 0 0", lineHeight: 1.5 }}>
              This will also remove all associated goals and attributes. This cannot be undone.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onConfirm} style={{ flex: 1, padding: "10px 14px", borderRadius: 6, background: t.red, border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: font }}>Delete</button>
          <button onClick={onClose} style={{ flex: 1, padding: "10px 14px", borderRadius: 6, background: t.cardAlt, border: `1px solid ${t.border}`, color: t.text, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: font }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

export default function DashboardPage() {
  const { user, profile, club, loading, signOut, supabase, isDelegate, delegateOf } = useAuth();
  const router = useRouter();

  const [darkMode, setDarkMode] = useState(true);
  t = darkMode ? tDark : tLight;
  const [keepers, setKeepers] = useState([]);
  const [loadingKeepers, setLoadingKeepers] = useState(true);
  const [showKeeperModal, setShowKeeperModal] = useState(false);
  const [editingKeeper, setEditingKeeper] = useState(null);

  // ── NEW: drill-down & report state ──
  const [selectedGame, setSelectedGame] = useState(null);
  const [reportMode, setReportMode] = useState(false);
  const [reportGame, setReportGame] = useState(null);

  const [allMatches, setAllMatches] = useState([]);
  const [allGoals, setAllGoals] = useState([]);
  const [allAttrs, setAllAttrs] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const [editingMatch, setEditingMatch] = useState(null);
  const [deletingMatch, setDeletingMatch] = useState(null);

  const [selectedKeeper, setSelectedKeeper] = useState(null);
  const [tab, setTab] = useState("overview");
  const [scope, setScope] = useState("season");
  const [cmpKeeper, setCmpKeeper] = useState(null);
  const [view, setView] = useState("analytics");

  useEffect(() => {
    if (!loading && profile && !profile.onboarding_complete && !isDelegate) router.push("/onboarding");
  }, [loading, profile, isDelegate]);

  const fetchKeepers = async () => {
    if (!user) return;
    if (isDelegate && delegateOf?.dashboard_access) {
      const { data } = await supabase
        .from("keepers").select("*")
        .eq("coach_id", delegateOf.coach_id).eq("active", true)
        .in("id", delegateOf.dashboard_keepers)
        .order("created_at", { ascending: true });
      if (data) {
        setKeepers(data);
        if (!selectedKeeper && data.length > 0) setSelectedKeeper(data[0].id);
      }
    } else {
      const { data } = await supabase
        .from("keepers").select("*")
        .eq("coach_id", user.id).eq("active", true)
        .order("created_at", { ascending: true });
      if (data) {
        setKeepers(data);
        if (!selectedKeeper && data.length > 0) setSelectedKeeper(data[0].id);
      }
    }
    setLoadingKeepers(false);
  };

  const fetchAnalyticsData = async () => {
    if (!user) return;
    setLoadingData(true);
    const coachId = isDelegate && delegateOf ? delegateOf.coach_id : user.id;
    const [matchRes, goalRes, attrRes] = await Promise.all([
      supabase.from("matches").select("*").eq("coach_id", coachId).order("match_date", { ascending: true }),
      supabase.from("goals_conceded").select("*").eq("coach_id", coachId),
      supabase.from("match_attributes").select("*").eq("coach_id", coachId),
    ]);
    if (matchRes.data) setAllMatches(matchRes.data);
    if (goalRes.data) setAllGoals(goalRes.data);
    if (attrRes.data) setAllAttrs(attrRes.data);
    setLoadingData(false);
  };

  const handleEditMatch = async (matchData) => {
    if (!editingMatch?.id) return;
    const { error } = await supabase.from("matches").update(matchData).eq("id", editingMatch.id);
    if (!error) {
      setEditingMatch(null);
      fetchAnalyticsData();
    }
  };

  const handleDeleteMatch = async () => {
    if (!deletingMatch?.id) return;
    try {
      await supabase.from("goals_conceded").delete().eq("match_id", deletingMatch.id);
      await supabase.from("match_attributes").delete().eq("match_id", deletingMatch.id);
      await supabase.from("matches").delete().eq("id", deletingMatch.id);
      setDeletingMatch(null);
      fetchAnalyticsData();
    } catch (err) {
      console.error("Error deleting match:", err);
    }
  };

  useEffect(() => {
    if (user && (profile?.onboarding_complete || (isDelegate && delegateOf?.dashboard_access))) {
      fetchKeepers();
      fetchAnalyticsData();
    }
  }, [user, profile, isDelegate, delegateOf]);

  const handleAddKeeper = async (keeperData) => {
    const { error } = await supabase.from("keepers").insert({
      ...keeperData, coach_id: user.id, club_id: club.id, active: true,
    });
    if (!error) { setShowKeeperModal(false); fetchKeepers(); }
  };

  const handleEditKeeper = async (keeperData) => {
    if (!editingKeeper?.id) return;
    const { error } = await supabase.from("keepers").update(keeperData).eq("id", editingKeeper.id);
    if (!error) { setEditingKeeper(null); fetchKeepers(); }
  };

  const handleDeactivateKeeper = async () => {
    if (!editingKeeper?.id) return;
    const { error } = await supabase.from("keepers").update({ active: false }).eq("id", editingKeeper.id);
    if (!error) { setEditingKeeper(null); fetchKeepers(); }
  };

  const keeperData = useMemo(() => {
    if (!selectedKeeper) return null;
    const kMatches = allMatches.filter(m => m.keeper_id === selectedKeeper);
    const matchIds = new Set(kMatches.map(m => m.id));
    const kGoals = allGoals.filter(g => matchIds.has(g.match_id));
    const kAttrs = allAttrs.filter(a => a.keeper_id === selectedKeeper);
    const sorted = [...kMatches].sort((a, b) => new Date(b.match_date) - new Date(a.match_date));
    const last5 = sorted.slice(0, 5);
    const l5Ids = new Set(last5.map(m => m.id));
    const l5Goals = kGoals.filter(g => l5Ids.has(g.match_id));
    const l5Attrs = kAttrs.filter(a => l5Ids.has(a.match_id));
    return {
      matches: kMatches,
      sorted,
      season: aggregateMatches(kMatches),
      l5: aggregateMatches(last5),
      quarterly: aggregateQuarterly(kMatches),
      matchLog: buildMatchLog(kMatches),
      seasonGoals: aggregateGoals(kGoals),
      l5Goals: aggregateGoals(l5Goals),
      sznAttrs: aggregateAttrs(kAttrs),
      l5Attrs: aggregateAttrs(l5Attrs),
      last5Matches: last5,
      rawGoals: kGoals,
      rawL5Goals: l5Goals,
    };
  }, [selectedKeeper, allMatches, allGoals, allAttrs]);

  const cmpData = useMemo(() => {
    if (!cmpKeeper) return null;
    const kMatches = allMatches.filter(m => m.keeper_id === cmpKeeper);
    const matchIds = new Set(kMatches.map(m => m.id));
    const kGoals = allGoals.filter(g => matchIds.has(g.match_id));
    const kAttrs = allAttrs.filter(a => a.keeper_id === cmpKeeper);
    return {
      season: aggregateMatches(kMatches),
      seasonGoals: aggregateGoals(kGoals),
      sznAttrs: aggregateAttrs(kAttrs),
      oneV1: aggregateMatches(kMatches)?.oneV1,
      crosses: aggregateMatches(kMatches)?.crosses,
      sweeper: aggregateMatches(kMatches)?.sweeper,
      rebounds: aggregateMatches(kMatches)?.rebounds,
    };
  }, [cmpKeeper, allMatches, allGoals, allAttrs]);

  const alerts = useMemo(() => {
    if (!keeperData?.season || !keeperData?.l5) return [];
    const kp = keepers.find(k => k.id === selectedKeeper);
    return genAlerts(kp?.name, keeperData.season, keeperData.l5,
      keeperData.seasonGoals, keeperData.l5Goals,
      keeperData.sznAttrs, keeperData.l5Attrs);
  }, [keeperData, selectedKeeper, keepers]);

  // ── NEW: drill-down & report helpers ──
  const openReport = (game = null) => {
    setReportGame(game);
    setReportMode(true);
  };

  const openGameDrillDown = (logRow) => {
    if (!keeperData) return;
    const match = keeperData.matches.find(m => m.id === logRow.id);
    const goals = allGoals.filter(g => g.match_id === logRow.id);
    setSelectedGame({ match, goals, logRow });
  };

  const isL5 = scope === "l5";
  const d = keeperData;
  const s = d && (isL5 ? d.l5 : d.season);
  const dGoals = d && (isL5 ? d.l5Goals : d.seasonGoals);
  const dAttrs = d && (isL5 ? d.l5Attrs : d.sznAttrs);
  const scopeLabel = isL5 ? "Last 5" : "Season";
  const hasMatches = d && d.matches.length > 0;

  const TABS = [
    { id: "overview", label: "Overview", icon: "📊" },
    { id: "matches", label: "Matches", icon: "📋" },
    { id: "caution", label: "Caution", icon: "⚡", badge: alerts.length },
    { id: "goals", label: "Goals", icon: "🥅" },
    { id: "distribution", label: "Distribution", icon: "📐" },
    { id: "crosses", label: "Crosses", icon: "✈️" },
    { id: "sweeper", label: "Sweeper", icon: "🏃" },
    { id: "attributes", label: "Attributes", icon: "⭐" },
    { id: "quarterly", label: "Quarterly", icon: "📅" },
    { id: "compare", label: "Compare", icon: "⚖️" },
  ];
  const scopeTabs = ["goals", "distribution", "crosses", "sweeper", "attributes"];
  const showScope = scopeTabs.includes(tab);

  if (loading || !user) {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font }}>
        <div style={{ color: t.dim, fontSize: 16 }}>Loading...</div>
      </div>
    );
  }

  // ── NEW: Report mode early return ──
  if (reportMode) return (
    <ReportView
      keeper={keepers.find(k => k.id === selectedKeeper)}
      keeperData={keeperData}
      alerts={alerts}
      targetGame={reportGame}
      primaryColor={club?.primary_color || t.accent}
      onBack={() => { setReportMode(false); setReportGame(null); }}
    />
  );

  const primaryColor = club?.primary_color || t.accent;
  const selectedKeeperObj = keepers.find(k => k.id === selectedKeeper);
  const cmpKeeperObj = keepers.find(k => k.id === cmpKeeper);

  const distData = s ? [
    { name: "GK Short",      att: s.distribution.gkShort.att,       suc: s.distribution.gkShort.suc,      pct: s.distribution.gkShort.att > 0 ? (s.distribution.gkShort.suc / s.distribution.gkShort.att * 100) : 0 },
    { name: "GK Long",       att: s.distribution.gkLong.att,        suc: s.distribution.gkLong.suc,       pct: s.distribution.gkLong.att > 0 ? (s.distribution.gkLong.suc / s.distribution.gkLong.att * 100) : 0 },
    { name: "Throws",        att: s.distribution.throws.att,        suc: s.distribution.throws.suc,       pct: s.distribution.throws.att > 0 ? (s.distribution.throws.suc / s.distribution.throws.att * 100) : 0 },
    { name: "Passes",        att: s.distribution.passes.att,        suc: s.distribution.passes.suc,       pct: s.distribution.passes.att > 0 ? (s.distribution.passes.suc / s.distribution.passes.att * 100) : 0 },
    { name: "Under Pressure",att: s.distribution.underPressure.att, suc: s.distribution.underPressure.suc, pct: s.distribution.underPressure.att > 0 ? (s.distribution.underPressure.suc / s.distribution.underPressure.att * 100) : 0 },
  ] : [];

  return (
    <div style={{ minHeight: "100vh", background: t.bg, fontFamily: font }}>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", borderBottom: `1px solid ${t.border}`, maxWidth: 960, margin: "0 auto" }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: t.bright }}>Stix<span style={{ color: t.accent }}>Analytix</span></span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!isDelegate && <Link href="/staff" style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 12, textDecoration: "none", fontFamily: font, display: "flex", alignItems: "center", gap: 4 }}>👥 Staff</Link>}
          <Link href="/pitchside" style={{ padding: "8px 14px", borderRadius: 8, background: primaryColor, color: "#fff", fontSize: 12, fontWeight: 600, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>📱 Pitchside</Link>
          <button onClick={() => setView(view === "analytics" ? "roster" : "analytics")} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 12, fontFamily: font, cursor: "pointer" }}>{view === "analytics" ? "👥 Roster" : "📊 Analytics"}</button>
          <button onClick={signOut} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 12, fontFamily: font, cursor: "pointer" }}>Sign Out</button>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 16px" }}>

        {isDelegate && delegateOf && (
          <div style={{ padding: "10px 16px", borderRadius: 10, marginBottom: 16, background: t.accent + "08", border: `1px solid ${t.accent}22`, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16 }}>📊</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: t.accent }}>Viewing as {delegateOf.role?.replace("_", " ")}</div>
              <div style={{ fontSize: 10, color: t.dim }}>Managed by {delegateOf.coach_name} · {delegateOf.club?.name || "Club"}</div>
            </div>
          </div>
        )}

        {/* ROSTER VIEW */}
        {view === "roster" && (
          <div>
            <div style={{ background: `linear-gradient(135deg, ${primaryColor}15, ${primaryColor}05)`, borderRadius: 16, padding: "24px 20px", border: `1px solid ${primaryColor}30`, marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: `linear-gradient(135deg, ${primaryColor}, ${club?.secondary_color || t.accentDim})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>⚽</div>
                <div>
                  <h1 style={{ fontSize: 20, fontWeight: 700, color: t.bright, margin: "0 0 2px" }}>{club?.name || "Your Club"}</h1>
                  <p style={{ fontSize: 12, color: t.dim, margin: 0 }}>{profile?.full_name} · {keepers.length} keeper{keepers.length !== 1 ? "s" : ""}</p>
                </div>
              </div>
            </div>
            <Card s={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <Sec icon="🧤">{isDelegate ? "Assigned Keepers" : "Your Goalkeepers"}</Sec>
                {!isDelegate && <button onClick={() => setShowKeeperModal(true)} style={{ padding: "8px 16px", borderRadius: 8, background: t.accent, border: "none", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: font }}>+ Add Keeper</button>}
              </div>
              {loadingKeepers ? (
                <div style={{ color: t.dim, fontSize: 13, padding: "20px 0", textAlign: "center" }}>Loading roster...</div>
              ) : keepers.length === 0 ? (
                <div style={{ color: t.dim, fontSize: 13, padding: "20px 0", textAlign: "center" }}>
                  No keepers yet.
                  <button onClick={() => setShowKeeperModal(true)} style={{ display: "block", margin: "12px auto 0", padding: "10px 20px", borderRadius: 8, background: primaryColor, border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Add Your First Goalkeeper</button>
                </div>
              ) : (
                keepers.map((k, i) => {
                  const kMatches = allMatches.filter(m => m.keeper_id === k.id);
                  const kAgg = aggregateMatches(kMatches);
                  return (
                    <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderTop: i > 0 ? `1px solid ${t.border}22` : "none", cursor: "pointer" }} onClick={() => setEditingKeeper(k)}>
                      <div style={{ width: 42, height: 42, borderRadius: 10, background: `linear-gradient(135deg, ${primaryColor}, ${club?.secondary_color || t.accentDim})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: "#fff" }}>#{k.number || "?"}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: t.bright }}>{k.name}</div>
                        <div style={{ fontSize: 11, color: t.dim }}>{[k.role, k.catch_hand ? `${k.catch_hand} footed` : null, kAgg ? `${kAgg.gp} games` : "0 games"].filter(Boolean).join(" · ")}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {kAgg && kAgg.gp > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: svC(kAgg.svPct) }}>{pct(kAgg.svPct)}</span>}
                        <span style={{ fontSize: 14, color: t.dim }}>✎</span>
                      </div>
                    </div>
                  );
                })
              )}
            </Card>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link href="/pitchside" style={{ flex: 1, minWidth: 200, padding: "20px 16px", borderRadius: 14, background: t.card, border: `1px solid ${t.border}`, textDecoration: "none", textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>⚽</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: t.bright }}>Log a Match</div>
                <div style={{ fontSize: 11, color: t.dim, marginTop: 4 }}>Track live GK performance</div>
              </Link>
              <Link href="/pitchside" style={{ flex: 1, minWidth: 200, padding: "20px 16px", borderRadius: 14, background: t.card, border: `1px solid ${t.border}`, textDecoration: "none", textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🔶</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: t.bright }}>Log Training</div>
                <div style={{ fontSize: 11, color: t.dim, marginTop: 4 }}>Capture session data</div>
              </Link>
            </div>
          </div>
        )}

        {/* ANALYTICS VIEW */}
        {view === "analytics" && (
          <div>
            {/* Keeper selector + Report button */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <select
                value={selectedKeeper || ""}
                onChange={e => { setSelectedKeeper(e.target.value); setTab("overview"); setScope("season"); setCmpKeeper(null); setSelectedGame(null); setReportMode(false); }}
                style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 8, padding: "10px 14px", color: t.bright, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, flex: 1, minWidth: 180 }}
              >
                {keepers.map(k => <option key={k.id} value={k.id}>#{k.number || "?"} {k.name}</option>)}
              </select>
              {selectedKeeperObj && <div style={{ fontSize: 11, color: t.dim }}>{selectedKeeperObj.role} · {selectedKeeperObj.catch_hand ? `${selectedKeeperObj.catch_hand} footed` : ""}</div>}
              {selectedKeeper && keeperData?.season && (
                <button onClick={() => openReport(null)} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 11, cursor: "pointer", fontFamily: font }}>
                  📄 Report
                </button>
              )}
              {loadingData && <div style={{ fontSize: 11, color: t.gold }}>Loading data...</div>}
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 8, marginBottom: 12 }}>
              {TABS.map(tb => (
                <button key={tb.id} onClick={() => { setTab(tb.id); setSelectedGame(null); if (!scopeTabs.includes(tb.id)) setScope("season"); }}
                  style={{ background: tab === tb.id ? t.accent + "18" : "transparent", border: `1px solid ${tab === tb.id ? t.accent + "44" : "transparent"}`, borderRadius: 7, padding: "6px 10px", color: tab === tb.id ? t.accent : t.dim, fontSize: 10, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", fontFamily: font, position: "relative" }}>
                  <span style={{ fontSize: 12 }}>{tb.icon}</span>{tb.label}
                  {(tb.badge || 0) > 0 && (
                    <span style={{ position: "absolute", top: -3, right: -3, width: 14, height: 14, borderRadius: 7, background: t.red, color: "#fff", fontSize: 7, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{tb.badge}</span>
                  )}
                </button>
              ))}
            </div>

            {showScope && <ScopeToggle scope={scope} setScope={setScope} />}
            <button onClick={() => setDarkMode(!darkMode)} style={{
              position: "fixed", top: 16, right: 16, zIndex: 9999,
              background: t.card, border: "1px solid " + t.border, borderRadius: 8,
              padding: "6px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              color: t.text, fontSize: 12, fontWeight: 600, fontFamily: font,
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)"
            }}>
              {darkMode ? "☀️" : "🌙"} {darkMode ? "Light" : "Dark"}
            </button>

            {!selectedKeeper && <EmptyState icon="👆" title="Select a Keeper" subtitle="Choose a goalkeeper from the dropdown to view analytics." />}
            {selectedKeeper && !hasMatches && tab !== "compare" && (
              <EmptyState icon="📱" title="No Sessions Logged Yet" subtitle={`Head to Pitchside to log a match or training session for ${selectedKeeperObj?.name || "this keeper"}.`} />
            )}

{/* OVERVIEW */}
          {tab === "overview" && s && (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

              {/* Row 0: Key Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8 }}>
                <StatBox label="GP" value={s.gp} />
                <StatBox label="Save %" value={(s.svPct * 100).toFixed(1) + "%"} color={s.svPct >= 0.7 ? t.green : s.svPct >= 0.5 ? t.yellow : t.red} />
                <StatBox label="GAA" value={s.gaa.toFixed(2)} color={s.gaa <= 1 ? t.green : s.gaa <= 2 ? t.yellow : t.red} />
                <StatBox label="CS" value={s.cs} />
                <StatBox label="W-D-L" value={s.w + "-" + s.d + "-" + s.l} />
              </div>

              {/* Row 1: Goals In + Goals From */}
              <Sec title="Goals Conceded">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <Card>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12 }}>Where Goals Went In</div>
                    <GoalHeatmap zones={dGoals ? dGoals.zones : {}} />
                  </Card>
                  <Card>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12 }}>Where Goals Came From</div>
                    <PitchOriginMap origins={dGoals ? dGoals.origins : {}} />
                  </Card>
                </div>
              </Sec>

              {/* Row 2: Shot Stopping */}
              <Sec title="Shot Stopping">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <Card>
                    <div style={{ textAlign: "center", padding: 16, color: t.dim, fontSize: 12 }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: t.accent }}>{s.saves}</div>
                      <div style={{ marginTop: 4 }}>Total Saves from {s.sot} Shots on Target</div>
                      <div style={{ marginTop: 8, fontSize: 20, fontWeight: 700, color: s.svPct >= 0.7 ? t.green : s.svPct >= 0.5 ? t.yellow : t.red }}>{(s.svPct * 100).toFixed(1)}%</div>
                      <div style={{ fontSize: 10, color: t.dim }}>Save Percentage</div>
                    </div>
                  </Card>
                  <Card>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12 }}>Save Types</div>
                    {s.saveTypes && Object.entries(s.saveTypes).sort((a,b) => b[1] - a[1]).map(([type, count]) => (
                      <div key={type} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <div style={{ width: 70, fontSize: 12, color: t.dim }}>{type}</div>
                        <div style={{ flex: 1, height: 16, background: t.bg, borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: (s.saves > 0 ? (count / s.saves * 100) : 0) + "%", background: t.accent, borderRadius: 4 }} />
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: t.text, width: 28, textAlign: "right" }}>{count}</div>
                      </div>
                    ))}
                  </Card>
                </div>
              </Sec>

              {/* Row 3: Savability + Shot Type & Positioning */}
              <Sec title="Savability & Shot Analysis">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <Card>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12 }}>Savability</div>
                    {dGoals && dGoals.ranks && Object.keys(dGoals.ranks).length > 0 ? (
                      <div>
                        {Object.entries(dGoals.ranks).sort((a,b) => b[1] - a[1]).map(([rank, count]) => (
                          <div key={rank} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <div style={{ width: 90, fontSize: 12, color: t.dim }}>{rank}</div>
                            <div style={{ flex: 1, height: 16, background: t.bg, borderRadius: 4, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: (s.ga > 0 ? (count / s.ga * 100) : 0) + "%", background: t.accent, borderRadius: 4 }} />
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: t.text, width: 28, textAlign: "right" }}>{count}</div>
                          </div>
                        ))}
                      </div>
                    ) : <div style={{ textAlign: "center", padding: 16, color: t.dim, fontSize: 12 }}>No savability data</div>}
                  </Card>
                  <Card>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12 }}>Shot Type & Positioning</div>
                    {dGoals && dGoals.shotTypes && Object.keys(dGoals.shotTypes).length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: t.dim, marginBottom: 6, textTransform: "uppercase" }}>Shot Type</div>
                        {Object.entries(dGoals.shotTypes).sort((a,b) => b[1] - a[1]).map(([type, count]) => (
                          <div key={type} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <div style={{ width: 80, fontSize: 12, color: t.dim }}>{type}</div>
                            <div style={{ flex: 1, height: 14, background: t.bg, borderRadius: 4, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: (s.ga > 0 ? (count / s.ga * 100) : 0) + "%", background: t.accent, borderRadius: 4 }} />
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: t.text, width: 24, textAlign: "right" }}>{count}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {dGoals && dGoals.positioning && Object.keys(dGoals.positioning).length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, color: t.dim, marginBottom: 6, textTransform: "uppercase" }}>Positioning</div>
                        {Object.entries(dGoals.positioning).sort((a,b) => b[1] - a[1]).map(([pos, count]) => (
                          <div key={pos} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <div style={{ width: 80, fontSize: 12, color: t.dim }}>{pos}</div>
                            <div style={{ flex: 1, height: 14, background: t.bg, borderRadius: 4, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: (s.ga > 0 ? (count / s.ga * 100) : 0) + "%", background: t.teal, borderRadius: 4 }} />
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: t.text, width: 24, textAlign: "right" }}>{count}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {(!dGoals || (!dGoals.shotTypes && !dGoals.positioning)) && <div style={{ textAlign: "center", padding: 16, color: t.dim, fontSize: 12 }}>No shot analysis data</div>}
                  </Card>
                </div>
              </Sec>

              {/* Row 4: Distribution */}
              <Sec title="Distribution">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <Card>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12 }}>Distribution Summary</div>
                    {s.distribution ? (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 22, fontWeight: 800, color: t.accent }}>{s.distribution.total || 0}</div>
                            <div style={{ fontSize: 10, color: t.dim }}>Total</div>
                          </div>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 22, fontWeight: 800, color: t.green }}>{s.distribution.accurate || 0}</div>
                            <div style={{ fontSize: 10, color: t.dim }}>Accurate</div>
                          </div>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 22, fontWeight: 800, color: t.red }}>{s.distribution.inaccurate || 0}</div>
                            <div style={{ fontSize: 10, color: t.dim }}>Inaccurate</div>
                          </div>
                        </div>
                        <div style={{ height: 20, background: t.bg, borderRadius: 4, overflow: "hidden", display: "flex" }}>
                          <div style={{ height: "100%", width: (s.distribution.total > 0 ? (s.distribution.accurate / s.distribution.total * 100) : 0) + "%", background: t.green }} />
                          <div style={{ height: "100%", width: (s.distribution.total > 0 ? (s.distribution.inaccurate / s.distribution.total * 100) : 0) + "%", background: t.red }} />
                        </div>
                        <div style={{ textAlign: "center", marginTop: 6, fontSize: 12, color: t.dim }}>
                          {s.distribution.total > 0 ? (s.distribution.accurate / s.distribution.total * 100).toFixed(0) + "% Accuracy" : "No data"}
                        </div>
                      </div>
                    ) : <div style={{ textAlign: "center", padding: 16, color: t.dim, fontSize: 12 }}>No distribution data</div>}
                  </Card>
                  <Card>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12 }}>By Type</div>
                    {s.distribution && s.distribution.types ? (
                      Object.entries(s.distribution.types).sort((a,b) => b[1] - a[1]).map(([type, count]) => (
                        <div key={type} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <div style={{ width: 80, fontSize: 12, color: t.dim }}>{type}</div>
                          <div style={{ flex: 1, height: 16, background: t.bg, borderRadius: 4, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: (s.distribution.total > 0 ? (count / s.distribution.total * 100) : 0) + "%", background: t.accent, borderRadius: 4 }} />
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: t.text, width: 28, textAlign: "right" }}>{count}</div>
                        </div>
                      ))
                    ) : <div style={{ textAlign: "center", padding: 16, color: t.dim, fontSize: 12 }}>No type breakdown</div>}
                  </Card>
                </div>
              </Sec>

              {/* Row 5: Crosses */}
              <Sec title="Crosses">
                <Card>
                  {s.crosses ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, textAlign: "center" }}>
                      {[
                        { label: "Claimed", value: s.crosses.claimed || 0, color: t.green },
                        { label: "Punched", value: s.crosses.punched || 0, color: t.accent },
                        { label: "Missed", value: s.crosses.missed || 0, color: t.red },
                        { label: "Left Alone", value: s.crosses.away || 0, color: t.dim },
                      ].map(item => {
                        const total = (s.crosses.claimed || 0) + (s.crosses.punched || 0) + (s.crosses.missed || 0) + (s.crosses.away || 0);
                        return (
                          <div key={item.label}>
                            <div style={{ fontSize: 28, fontWeight: 800, color: item.color }}>{item.value}</div>
                            <div style={{ fontSize: 11, color: t.dim, marginTop: 2 }}>{item.label}</div>
                            <div style={{ fontSize: 10, color: t.dim }}>{total > 0 ? (item.value / total * 100).toFixed(0) + "%" : ""}</div>
                          </div>
                        );
                      })}
                    </div>
                  ) : <div style={{ textAlign: "center", padding: 16, color: t.dim, fontSize: 12 }}>No cross data</div>}
                </Card>
              </Sec>

              {/* Row 6: Attributes */}
              <Sec title="Attributes">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <Card>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12 }}>Attribute Web</div>
                    {dAttrs && Object.keys(dAttrs).length > 0 ? (
                      <div style={{ position: "relative", width: "100%", maxWidth: 240, aspectRatio: "1", margin: "0 auto" }}>
                        <svg viewBox="0 0 200 200" style={{ width: "100%", height: "100%" }}>
                          {(() => {
                            const attrs = Object.entries(dAttrs);
                            const n = attrs.length;
                            if (n === 0) return null;
                            const cx = 100, cy = 100, r = 80;
                            const levels = [0.25, 0.5, 0.75, 1];
                            return (
                              <>
                                {levels.map(l => (
                                  <polygon key={l} points={attrs.map(([,], i) => {
                                    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
                                    return (cx + r * l * Math.cos(angle)) + "," + (cy + r * l * Math.sin(angle));
                                  }).join(" ")} fill="none" stroke={t.border} strokeWidth="0.5" />
                                ))}
                                {attrs.map(([name], i) => {
                                  const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
                                  const lx = cx + (r + 16) * Math.cos(angle);
                                  const ly = cy + (r + 16) * Math.sin(angle);
                                  return <text key={name} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fill={t.dim} fontSize="6">{ATTR_LABELS[name] || name}</text>;
                                })}
                                <polygon points={attrs.map(([, val], i) => {
                                  const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
                                  const v = Math.min(val / 10, 1);
                                  return (cx + r * v * Math.cos(angle)) + "," + (cy + r * v * Math.sin(angle));
                                }).join(" ")} fill={t.accentGlow} stroke={t.accent} strokeWidth="1.5" />
                                {attrs.map(([, val], i) => {
                                  const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
                                  const v = Math.min(val / 10, 1);
                                  return <circle key={i} cx={cx + r * v * Math.cos(angle)} cy={cy + r * v * Math.sin(angle)} r="3" fill={t.accent} />;
                                })}
                              </>
                            );
                          })()}
                        </svg>
                      </div>
                    ) : <div style={{ textAlign: "center", padding: 16, color: t.dim, fontSize: 12 }}>No attribute data</div>}
                  </Card>
                  <Card>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12 }}>Attribute Trends</div>
                    {dAttrs && Object.keys(dAttrs).length > 0 ? (
                      <div>
                        {Object.entries(dAttrs).map(([name, val]) => (
                          <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <div style={{ width: 90, fontSize: 12, color: t.dim }}>{ATTR_LABELS[name] || name}</div>
                            <div style={{ flex: 1, height: 14, background: t.bg, borderRadius: 4, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: Math.min(val / 10 * 100, 100) + "%", background: val >= 7 ? t.green : val >= 4 ? t.yellow : t.red, borderRadius: 4 }} />
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: t.text, width: 28, textAlign: "right" }}>{typeof val === "number" ? val.toFixed(1) : val}</div>
                          </div>
                        ))}
                      </div>
                    ) : <div style={{ textAlign: "center", padding: 16, color: t.dim, fontSize: 12 }}>No attribute data</div>}
                  </Card>
                </div>
              </Sec>

            </div>
          )}
                      {/* MATCHES */}
            {hasMatches && tab === "matches" && (
              <div>
                {selectedGame ? (
                  <SingleGameView
                    match={selectedGame.match}
                    goals={selectedGame.goals}
                    logRow={selectedGame.logRow}
                    keeperName={selectedKeeperObj?.name}
                    primaryColor={primaryColor}
                    onBack={() => setSelectedGame(null)}
                    onReport={(match) => {
                      setSelectedGame(null);
                      openReport(match);
                    }}
                  />
                ) : (
                  <>
                    <Sec icon="📋">Match Log — {selectedKeeperObj?.name} · click any row to drill in</Sec>
                    <Card s={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 580 }}>
                        <thead>
                          <tr>{["Date", "Type", "Opp", "H/A", "Res", "Score", "SOT", "Sv", "GA", "Sv%", "CS", ""].map(h => <th key={h} style={{ textAlign: "center", padding: "7px 5px", color: t.dim, borderBottom: `1px solid ${t.border}`, fontSize: 9 }}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {d.matchLog.map((m, i) => {
                            const matchRecord = d.matches.find(x => x.id === m.id);
                            return (
                              <tr key={i}
                                onClick={() => openGameDrillDown(m)}
                                style={{ background: i % 2 === 0 ? "transparent" : t.cardAlt + "44", cursor: "pointer" }}
                                onMouseEnter={e => e.currentTarget.style.background = t.cardAlt}
                                onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : t.cardAlt + "44"}
                              >
                                <td style={{ padding: "7px 5px", color: t.text, textAlign: "center" }}>{m.date}</td>
                                <td style={{ padding: "7px 5px", textAlign: "center" }}><span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 4, background: m.type === "match" ? t.accent + "22" : t.gold + "22", color: m.type === "match" ? t.accent : t.gold }}>{m.type === "match" ? "M" : "T"}</span></td>
                                <td style={{ padding: "7px 5px", color: t.bright, fontWeight: 600, textAlign: "center" }}>{m.opp}</td>
                                <td style={{ padding: "7px 5px", color: t.dim, textAlign: "center" }}>{m.type === "training" ? "\u2014" : m.ha}</td>
                                <td style={{ padding: "7px 5px", textAlign: "center", color: m.res === "W" ? t.green : m.res === "L" ? t.red : t.dim, fontWeight: 600 }}>{m.res}</td>
                                <td style={{ padding: "7px 5px", color: t.text, textAlign: "center" }}>{m.score}</td>
                                <td style={{ padding: "7px 5px", color: t.text, textAlign: "center" }}>{m.sot}</td>
                                <td style={{ padding: "7px 5px", color: t.text, textAlign: "center" }}>{m.sv}</td>
                                <td style={{ padding: "7px 5px", color: m.ga > 0 ? t.red : t.green, textAlign: "center", fontWeight: 600 }}>{m.ga}</td>
                                <td style={{ padding: "7px 5px", textAlign: "center", color: m.svP != null ? svC(m.svP) : t.dim, fontWeight: 600 }}>{m.svP != null ? pct(m.svP) : "\u2014"}</td>
                                <td style={{ padding: "7px 5px", textAlign: "center" }}>{m.cs ? <span style={{ color: t.green }}>✓</span> : ""}</td>
                                <td style={{ padding: "7px 5px", textAlign: "center" }}>
                                  {!isDelegate && (
                                    <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setEditingMatch(matchRecord); }}
                                        style={{ background: "none", border: "none", color: t.accent, cursor: "pointer", padding: "2px 4px", fontSize: 12 }}
                                        title="Edit"
                                      >
                                        ✏️
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setDeletingMatch(m); }}
                                        style={{ background: "none", border: "none", color: t.red, cursor: "pointer", padding: "2px 4px", fontSize: 12 }}
                                        title="Delete"
                                      >
                                        🗑️
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </Card>
                  </>
                )}
              </div>
            )}

            {/* CAUTION */}
            {hasMatches && tab === "caution" && (
              <div>
                <Sec icon="⚡">Coaching Alerts — {selectedKeeperObj?.name}</Sec>
                {alerts.length === 0 ? (
                  <EmptyState icon="✅" title="All Clear" subtitle="No coaching alerts based on current performance trends." />
                ) : (
                  alerts.map((al, i) => (
                    <Card key={i} s={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: al.type === "positive" ? t.green + "22" : al.type === "alert" ? t.red + "22" : t.orange + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, border: `1px solid ${al.type === "positive" ? t.green + "44" : al.type === "alert" ? t.red + "44" : t.orange + "44"}` }}>
                          {al.type === "positive" ? "📈" : al.type === "alert" ? "🚨" : "⚠️"}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: al.type === "positive" ? t.green : al.type === "alert" ? t.red : t.orange }}>{al.title}</span>
                            <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 4, background: t.border, color: t.dim }}>{al.cat}</span>
                          </div>
                          <div style={{ fontSize: 11, color: t.text, marginBottom: 6 }}>{al.detail}</div>
                          <div style={{ fontSize: 10, color: t.accent, fontWeight: 600 }}>→ {al.action}</div>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            )}

            {/* GOALS */}
            {hasMatches && s && tab === "goals" && (
              <div>
                <Sec icon="🥅">Goals Analysis — {scopeLabel}</Sec>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginBottom: 14 }}>
                  <Card><GoalHeatmap zones={dGoals?.zones} title="Where Goals Go In" /></Card>
                  <Card>
                    <div style={{ fontSize: 10, color: t.dim, marginBottom: 8 }}>Goal Sources</div>
                    {dGoals?.sources && Object.entries(dGoals.sources).length > 0 ? (
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie data={Object.entries(dGoals.sources).map(([name, value]) => ({ name, value }))} cx="50%" cy="50%" outerRadius={65} dataKey="value" label={({ name, value }) => `${ORIGIN_LABELS[name] || name}: ${value}`} labelLine={{ stroke: t.dim, strokeWidth: 0.5 }} style={{ fontSize: 9 }}>
                            {Object.keys(dGoals.sources).map((_, i) => <Cell key={i} fill={PAL[i % PAL.length]} />)}
                          </Pie>
                          <Tooltip {...ttS} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : <div style={{ color: t.dim, fontSize: 11, textAlign: "center", padding: 20 }}>No goals conceded</div>}
                  </Card>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
                  <Card>
                    <div style={{ fontSize: 10, color: t.dim, marginBottom: 8 }}>Saveability</div>
                    {dGoals?.ranks && Object.entries(dGoals.ranks).length > 0 ? (
                      Object.entries(dGoals.ranks).map(([rank, count]) => (
                        <PBar key={rank} label={rank} value={count} max={Math.max(...Object.values(dGoals.ranks), 1)} suf="" color={t.accent} />
                      ))
                    ) : <div style={{ color: t.dim, fontSize: 11, textAlign: "center", padding: 12 }}>No data</div>}
                  </Card>
                  <Card>
                    <div style={{ fontSize: 10, color: t.dim, marginBottom: 8 }}>Shot Type & Positioning</div>
                    {dGoals?.shotTypes && Object.entries(dGoals.shotTypes).length > 0 && (
                      <div style={{ marginBottom: 10 }}>{Object.entries(dGoals.shotTypes).map(([type, count]) => <PBar key={type} label={type} value={count} max={Math.max(...Object.values(dGoals.shotTypes), 1)} suf="" color={t.accent} />)}</div>
                    )}
                    {dGoals?.positioning && Object.entries(dGoals.positioning).length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: t.dim, marginBottom: 4, marginTop: 8 }}>GK Position at Goal</div>
                        {Object.entries(dGoals.positioning).map(([pos, count]) => <PBar key={pos} label={pos} value={count} max={Math.max(...Object.values(dGoals.positioning), 1)} suf="" color={t.accent} />)}
                      </div>
                    )}
                    {(!dGoals?.shotTypes || Object.keys(dGoals.shotTypes).length === 0) && <div style={{ color: t.dim, fontSize: 11, textAlign: "center", padding: 12 }}>No data</div>}
                  </Card>
                </div>

                {/* SHOT ORIGIN × NET ZONE CROSS-REFERENCE */}
                <div style={{ marginTop: 14 }}>
                  <Sec icon="🎯">Shot Origin vs Net Zone — Where Vulnerability Lives</Sec>
                  <Card>
                    <ShotCrossRef goals={isL5 ? d.rawL5Goals : d.rawGoals} />
                  </Card>
                </div>
              </div>
            )}

            {/* DISTRIBUTION */}
            {hasMatches && s && tab === "distribution" && (
              <div>
                <Sec icon="📐">Distribution — {scopeLabel}</Sec>
                <Card s={{ marginBottom: 14 }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={distData.filter(d => d.att > 0)} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
                      <XAxis dataKey="name" tick={{ fill: t.dim, fontSize: 9 }} />
                      <YAxis tick={{ fill: t.dim, fontSize: 9 }} />
                      <Tooltip {...ttS} />
                      <Legend wrapperStyle={{ fontSize: 9 }} />
                      <Bar dataKey="att" name="Attempted" fill={t.border} radius={[3, 3, 0, 0]} />
                      <Bar dataKey="suc" name="Successful" fill={t.accent} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
                <Card>
                  <div style={{ fontSize: 10, color: t.dim, marginBottom: 10 }}>Accuracy Breakdown</div>
                  {distData.filter(d => d.att > 0).map(d => <PBar key={d.name} label={d.name} value={d.pct} color={t.accent} />)}
                  {distData.every(d => d.att === 0) && <div style={{ color: t.dim, fontSize: 11, textAlign: "center", padding: 16 }}>No distribution data logged yet</div>}
                </Card>
              </div>
            )}

            {/* CROSSES */}
            {hasMatches && s && tab === "crosses" && (
              <div>
                <Sec icon="✈️">Cross Handling — {scopeLabel}</Sec>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginBottom: 14 }}>
                  <Card>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                      <StatBox label="Total" value={s.crosses.total} />
                      <StatBox label="Claimed" value={s.crosses.claimed} color={t.green} />
                      <StatBox label="Punched" value={s.crosses.punched} color={t.gold} />
                      <StatBox label="Missed" value={s.crosses.missed} color={t.red} />
                    </div>
                    {s.crosses.total > 0 && <PBar label="Claim Rate" value={(s.crosses.claimed / s.crosses.total) * 100} color={t.accent} />}
                  </Card>
                  <Card>
                    <div style={{ fontSize: 10, color: t.dim, marginBottom: 8 }}>Breakdown</div>
                    {s.crosses.total > 0 ? (
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie data={[{ name: "Claimed", value: s.crosses.claimed }, { name: "Punched", value: s.crosses.punched }, { name: "Missed", value: s.crosses.missed }].filter(d => d.value > 0)} cx="50%" cy="50%" outerRadius={65} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={{ stroke: t.dim, strokeWidth: 0.5 }} style={{ fontSize: 9 }}>
                            <Cell fill={t.green} /><Cell fill={t.border} /><Cell fill={t.red} />
                          </Pie>
                          <Tooltip {...ttS} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : <div style={{ color: t.dim, fontSize: 11, textAlign: "center", padding: 20 }}>No cross data</div>}
                  </Card>
                </div>
                {d.season && d.l5 && (
                  <Card>
                    <Sec icon="📈">Season vs Last 5</Sec>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={[{ name: "Claimed", Season: d.season.crosses.claimed, "Last 5": d.l5.crosses.claimed }, { name: "Punched", Season: d.season.crosses.punched, "Last 5": d.l5.crosses.punched }, { name: "Missed", Season: d.season.crosses.missed, "Last 5": d.l5.crosses.missed }]}>
                        <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
                        <XAxis dataKey="name" tick={{ fill: t.dim, fontSize: 9 }} />
                        <YAxis tick={{ fill: t.dim, fontSize: 9 }} />
                        <Tooltip {...ttS} />
                        <Legend wrapperStyle={{ fontSize: 9 }} />
                        <Bar dataKey="Season" fill={t.accent} radius={[3, 3, 0, 0]} />
                        <Bar dataKey="Last 5" fill={t.border} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                )}
              </div>
            )}

            {/* SWEEPER */}
            {hasMatches && s && tab === "sweeper" && (
              <div>
                <Sec icon="🏃">Sweeper & Rebounds — {scopeLabel}</Sec>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginBottom: 14 }}>
                  <Card>
                    <div style={{ fontSize: 10, color: t.dim, marginBottom: 10 }}>Sweeper-Keeper Actions</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                      <StatBox label="Clearances" value={s.sweeper.clearances} />
                      <StatBox label="Intercepts" value={s.sweeper.interceptions} />
                      <StatBox label="Tackles" value={s.sweeper.tackles} />
                    </div>
                    <div style={{ fontSize: 10, color: t.dim, marginBottom: 2 }}>Total: {s.sweeper.clearances + s.sweeper.interceptions + s.sweeper.tackles}</div>
                    {s.gp > 0 && <div style={{ fontSize: 10, color: t.dim }}>Per game: {((s.sweeper.clearances + s.sweeper.interceptions + s.sweeper.tackles) / s.gp).toFixed(1)}</div>}
                  </Card>
                  <Card>
                    <div style={{ fontSize: 10, color: t.dim, marginBottom: 10 }}>Rebound Control</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                      <StatBox label="Controlled" value={s.rebounds.controlled} color={t.green} />
                      <StatBox label="Dangerous" value={s.rebounds.dangerous} color={t.red} />
                    </div>
                    {(s.rebounds.controlled + s.rebounds.dangerous) > 0 && <PBar label="Control Rate" value={(s.rebounds.controlled / (s.rebounds.controlled + s.rebounds.dangerous)) * 100} color={t.accent} />}
                  </Card>
                </div>
                {d.season && d.l5 && (
                  <Card>
                    <Sec icon="📈">Season vs Last 5</Sec>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={[{ name: "Clearances", Season: d.season.sweeper.clearances, "Last 5": d.l5.sweeper.clearances }, { name: "Intercepts", Season: d.season.sweeper.interceptions, "Last 5": d.l5.sweeper.interceptions }, { name: "Tackles", Season: d.season.sweeper.tackles, "Last 5": d.l5.sweeper.tackles }, { name: "RB Ctrl", Season: d.season.rebounds.controlled, "Last 5": d.l5.rebounds.controlled }, { name: "RB Danger", Season: d.season.rebounds.dangerous, "Last 5": d.l5.rebounds.dangerous }]}>
                        <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
                        <XAxis dataKey="name" tick={{ fill: t.dim, fontSize: 8 }} />
                        <YAxis tick={{ fill: t.dim, fontSize: 9 }} />
                        <Tooltip {...ttS} />
                        <Legend wrapperStyle={{ fontSize: 9 }} />
                        <Bar dataKey="Season" fill={t.accent} radius={[3, 3, 0, 0]} />
                        <Bar dataKey="Last 5" fill={t.border} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                )}
              </div>
            )}

            {/* ATTRIBUTES */}
            {hasMatches && tab === "attributes" && (
              <div>
                <Sec icon="⭐">Attributes — {scopeLabel}</Sec>
                {dAttrs ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 14 }}>
                    <Card>
                      <div style={{ fontSize: 10, color: t.dim, marginBottom: 6 }}>Core Attributes — Season vs Last 5</div>
                      <ResponsiveContainer width="100%" height={260}>
                        <RadarChart data={CORE_ATTRS.map(k => ({ attr: ATTR_LABELS[k], Season: d.sznAttrs?.[k] || 0, "Last 5": d.l5Attrs?.[k] || 0, fullMark: 5 }))}>
                          <PolarGrid stroke={t.border} />
                          <PolarAngleAxis dataKey="attr" tick={{ fill: t.dim, fontSize: 7 }} />
                          <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fill: t.dim, fontSize: 7 }} />
                          <Radar dataKey="Season" stroke={t.accent} fill={t.accent} fillOpacity={0.15} strokeWidth={2} />
                          <Radar dataKey="Last 5" stroke={t.gold} fill={t.border} fillOpacity={0.1} strokeWidth={2} strokeDasharray="4 2" />
                          <Legend wrapperStyle={{ fontSize: 9 }} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </Card>
                    <Card>
                      <div style={{ fontSize: 10, color: t.dim, marginBottom: 6 }}>All Attributes ({scopeLabel})</div>
                      {ATTR_KEYS.filter(k => dAttrs[k] != null).sort((a, b) => (dAttrs[b] || 0) - (dAttrs[a] || 0)).map(k => (
                        <div key={k} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                          <div style={{ width: 95, fontSize: 9, color: t.dim, textAlign: "right", flexShrink: 0 }}>{ATTR_LABELS[k]}</div>
                          <div style={{ flex: 1, height: 10, background: t.bg, borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${(dAttrs[k] / 5) * 100}%`, height: "100%", borderRadius: 3, background: ratC(dAttrs[k]) }} /></div>
                          <div style={{ width: 28, fontSize: 9, color: t.bright, fontWeight: 600, textAlign: "right" }}>{dAttrs[k]?.toFixed(1)}</div>
                          <TrendBadge cur={d.l5Attrs?.[k]} prev={d.sznAttrs?.[k]} />
                        </div>
                      ))}
                    </Card>
                  </div>
                ) : <EmptyState icon="⭐" title="No Attribute Ratings" subtitle="Rate keeper attributes after each match in Pitchside." />}
                {s && (
                  <Card>
                    <Sec icon="🧤">Save Types ({scopeLabel})</Sec>
                    {Object.values(s.saveTypes).some(v => v > 0) ? (
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={Object.entries(s.saveTypes).filter(([, v]) => v > 0).map(([name, count]) => ({ name, count }))}>
                          <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
                          <XAxis dataKey="name" tick={{ fill: t.dim, fontSize: 9 }} />
                          <YAxis tick={{ fill: t.dim, fontSize: 9 }} />
                          <Tooltip {...ttS} />
                          <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Count">
                            {Object.entries(s.saveTypes).filter(([, v]) => v > 0).map((_, i) => <Cell key={i} fill={PAL[i % PAL.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <div style={{ color: t.dim, fontSize: 11, textAlign: "center", padding: 16 }}>No save type data</div>}
                  </Card>
                )}
              </div>
            )}

            {/* QUARTERLY */}
            {hasMatches && tab === "quarterly" && d.quarterly && (
              <div>
                <Sec icon="📅">Quarterly Breakdown</Sec>
                <Card s={{ marginBottom: 16, overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: "7px 8px", color: t.dim, borderBottom: `1px solid ${t.border}` }}>Metric</th>
                        {["Q1", "Q2", "Q3", "Q4"].map(q => <th key={q} style={{ textAlign: "center", padding: "7px 8px", color: t.dim, borderBottom: `1px solid ${t.border}` }}>{q}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { l: "Games", k: "gp", f: v => v || "—" },
                        { l: "Sv%", k: "svPct", f: v => v ? pct(v) : "—" },
                        { l: "GAA", k: "gaa", f: v => v ? dec(v) : "—" },
                        { l: "CS%", k: "csPct", f: v => v != null ? pct(v) : "—" },
                        { l: "Wins", k: "w", f: v => v != null ? v : "—" },
                      ].map(r => (
                        <tr key={r.k}>
                          <td style={{ padding: "7px 8px", color: t.text, borderBottom: `1px solid ${t.border}22` }}>{r.l}</td>
                          {["Q1", "Q2", "Q3", "Q4"].map(q => {
                            const v = d.quarterly[q]?.[r.k];
                            return <td key={q} style={{ textAlign: "center", padding: "7px 8px", color: v == null || (v === 0 && r.k === "gp") ? t.dim : t.bright, borderBottom: `1px solid ${t.border}22` }}>{r.f(v)}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
                <Card>
                  <Sec icon="📈">Trends</Sec>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={["Q1", "Q2", "Q3", "Q4"].map(q => ({ q, svPct: d.quarterly[q]?.svPct ? d.quarterly[q].svPct * 100 : null, gaa: d.quarterly[q]?.gaa || null }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
                      <XAxis dataKey="q" tick={{ fill: t.dim, fontSize: 9 }} />
                      <YAxis yAxisId="sv" domain={[0, 100]} tick={{ fill: t.dim, fontSize: 9 }} />
                      <YAxis yAxisId="gaa" orientation="right" domain={[0, "auto"]} tick={{ fill: t.dim, fontSize: 9 }} />
                      <Tooltip {...ttS} />
                      <Legend wrapperStyle={{ fontSize: 9 }} />
                      <Line yAxisId="sv" type="monotone" dataKey="svPct" name="Sv%" stroke={t.accent} strokeWidth={2} dot={{ fill: t.accent }} connectNulls />
                      <Line yAxisId="gaa" type="monotone" dataKey="gaa" name="GAA" stroke={t.orange} strokeWidth={2} dot={{ fill: t.orange }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              </div>
            )}

            {/* COMPARE */}
            {tab === "compare" && (
              <div>
                <Sec icon="⚖️">Head-to-Head</Sec>
                <Card s={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontSize: 8, color: t.dim }}>Primary</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: t.accent }}>#{selectedKeeperObj?.number || "?"} {selectedKeeperObj?.name}</div>
                    </div>
                    <div style={{ fontSize: 16, color: t.dim }}>vs</div>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontSize: 8, color: t.dim }}>Compare to</div>
                      <select value={cmpKeeper || ""} onChange={e => setCmpKeeper(e.target.value || null)} style={{ width: "100%", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 6, padding: "7px 9px", color: t.bright, fontSize: 11, cursor: "pointer", fontFamily: font }}>
                        <option value="">Select keeper...</option>
                        {keepers.filter(k => k.id !== selectedKeeper).map(k => <option key={k.id} value={k.id}>#{k.number || "?"} {k.name}</option>)}
                      </select>
                    </div>
                  </div>
                </Card>
                {cmpData?.season && d?.season ? (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
                      <Card>
                        <Sec icon="📊">Season Stats</Sec>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                          <thead><tr><th style={{ textAlign: "left", padding: "5px 0", color: t.dim }}></th><th style={{ textAlign: "center", color: t.accent, fontSize: 9 }}>{selectedKeeperObj?.name?.split(" ")[0]}</th><th style={{ textAlign: "center", color: t.gold, fontSize: 9 }}>{cmpKeeperObj?.name?.split(" ")[0]}</th></tr></thead>
                          <tbody>
                            {[
                              { l: "GP",       v1: d.season.gp,      v2: cmpData.season.gp },
                              { l: "Sv%",      v1: d.season.svPct,   v2: cmpData.season.svPct,  f: pct, b: "high" },
                              { l: "GAA",      v1: d.season.gaa,     v2: cmpData.season.gaa,    f: dec, b: "low" },
                              { l: "CS%",      v1: d.season.csPct,   v2: cmpData.season.csPct,  f: pct, b: "high" },
                              { l: "Cross%",   v1: d.season.crosses.total > 0 ? d.season.crosses.claimed/d.season.crosses.total : 0, v2: cmpData.season.crosses.total > 0 ? cmpData.season.crosses.claimed/cmpData.season.crosses.total : 0, f: pct, b: "high" },
                              { l: "1v1 Win%", v1: d.season.oneV1.faced > 0 ? d.season.oneV1.won/d.season.oneV1.faced : 0, v2: cmpData.season.oneV1.faced > 0 ? cmpData.season.oneV1.won/cmpData.season.oneV1.faced : 0, f: pct, b: "high" },
                            ].map(r => {
                              const fmt = r.f || (v => v);
                              const b1 = r.b === "high" ? r.v1 > r.v2 : r.b === "low" ? r.v1 < r.v2 : false;
                              return <tr key={r.l}><td style={{ padding: "5px 0", color: t.dim }}>{r.l}</td><td style={{ textAlign: "center", color: b1 ? t.green : t.bright, fontWeight: b1 ? 700 : 400 }}>{fmt(r.v1)}</td><td style={{ textAlign: "center", color: !b1 ? t.green : t.bright, fontWeight: !b1 ? 700 : 400 }}>{fmt(r.v2)}</td></tr>;
                            })}
                          </tbody>
                        </table>
                      </Card>
                      <Card>
                        <Sec icon="🏃">Sweeper & Rebounds</Sec>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                          <thead><tr><th style={{ textAlign: "left", padding: "5px 0", color: t.dim }}></th><th style={{ textAlign: "center", color: t.accent, fontSize: 9 }}>{selectedKeeperObj?.name?.split(" ")[0]}</th><th style={{ textAlign: "center", color: t.gold, fontSize: 9 }}>{cmpKeeperObj?.name?.split(" ")[0]}</th></tr></thead>
                          <tbody>
                            {[
                              { l: "Sweeper", v1: d.season.sweeper.clearances+d.season.sweeper.interceptions+d.season.sweeper.tackles, v2: cmpData.season.sweeper.clearances+cmpData.season.sweeper.interceptions+cmpData.season.sweeper.tackles, b: "high" },
                              { l: "RB Ctrl%", v1: (d.season.rebounds.controlled+d.season.rebounds.dangerous)>0?d.season.rebounds.controlled/(d.season.rebounds.controlled+d.season.rebounds.dangerous):0, v2: (cmpData.season.rebounds.controlled+cmpData.season.rebounds.dangerous)>0?cmpData.season.rebounds.controlled/(cmpData.season.rebounds.controlled+cmpData.season.rebounds.dangerous):0, f: pct, b: "high" },
                            ].map(r => {
                              const fmt = r.f || (v => v);
                              const b1 = r.b === "high" ? r.v1 > r.v2 : false;
                              return <tr key={r.l}><td style={{ padding: "5px 0", color: t.dim }}>{r.l}</td><td style={{ textAlign: "center", color: b1 ? t.green : t.bright, fontWeight: b1 ? 700 : 400 }}>{fmt(r.v1)}</td><td style={{ textAlign: "center", color: !b1 ? t.green : t.bright, fontWeight: !b1 ? 700 : 400 }}>{fmt(r.v2)}</td></tr>;
                            })}
                          </tbody>
                        </table>
                      </Card>
                    </div>
                    {d.sznAttrs && cmpData.sznAttrs && (
                      <Card s={{ marginBottom: 16 }}>
                        <Sec icon="⭐">Attributes</Sec>
                        <ResponsiveContainer width="100%" height={280}>
                          <RadarChart data={CORE_ATTRS.map(k => ({ attr: ATTR_LABELS[k], [selectedKeeperObj?.name?.split(" ")[0] || "A"]: d.sznAttrs[k] || 0, [cmpKeeperObj?.name?.split(" ")[0] || "B"]: cmpData.sznAttrs[k] || 0, fullMark: 5 }))}>
                            <PolarGrid stroke={t.border} />
                            <PolarAngleAxis dataKey="attr" tick={{ fill: t.dim, fontSize: 8 }} />
                            <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fill: t.dim, fontSize: 7 }} />
                            <Radar dataKey={selectedKeeperObj?.name?.split(" ")[0] || "A"} stroke={t.accent} fill={t.accent} fillOpacity={0.15} strokeWidth={2} />
                            <Radar dataKey={cmpKeeperObj?.name?.split(" ")[0] || "B"} stroke={t.gold} fill={t.border} fillOpacity={0.15} strokeWidth={2} />
                            <Legend wrapperStyle={{ fontSize: 9 }} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </Card>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <Card><GoalHeatmap zones={d.seasonGoals?.zones} title={`${selectedKeeperObj?.name?.split(" ")[0]} Goals`} /></Card>
                      <Card><GoalHeatmap zones={cmpData.seasonGoals?.zones} title={`${cmpKeeperObj?.name?.split(" ")[0]} Goals`} /></Card>
                    </div>
                  </div>
                ) : <EmptyState icon="⚖️" title="Select a Keeper to Compare" subtitle="Choose a second goalkeeper from the dropdown above." />}
              </div>
            )}

          </div>
        )}
      </div>

      <div style={{ textAlign: "center", padding: 14, borderTop: `1px solid ${t.border}`, fontSize: 8, color: t.dim }}>
        StixAnalytix · Built for coaching professionals
      </div>

      {showKeeperModal && <KeeperModal keeper={null} primaryColor={primaryColor} onClose={() => setShowKeeperModal(false)} onSave={handleAddKeeper} />}
      {editingKeeper && <KeeperModal keeper={editingKeeper} primaryColor={primaryColor} onClose={() => setEditingKeeper(null)} onSave={handleEditKeeper} onDeactivate={handleDeactivateKeeper} />}
      {editingMatch && <EditMatchModal match={editingMatch} onSave={handleEditMatch} onClose={() => setEditingMatch(null)} />}
      {deletingMatch && <DeleteMatchConfirm match={deletingMatch} onConfirm={handleDeleteMatch} onClose={() => setDeletingMatch(null)} />}
    </div>
  );
}

