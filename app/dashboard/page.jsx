"use client";
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
const t = {
  bg: "#070b0e", card: "#0f1419", cardAlt: "#151c22", border: "#1e2a32",
  accent: "#10b981", accentDim: "#065f46", accentGlow: "#10b98133",
  gold: "#d4a853", orange: "#f97316",
  red: "#ef4444", green: "#22c55e", yellow: "#eab308",
  cyan: "#06b6d4", purple: "#a78bfa", teal: "#14b8a6", pink: "#f472b6",
  text: "#d1d9e0", dim: "#5c6b77", bright: "#f0f4f7",
};
const font = "'DM Sans', -apple-system, sans-serif";
const PAL = ["#10b981","#06b6d4","#eab308","#f97316","#ef4444","#a78bfa","#f472b6","#22c55e","#14b8a6","#38bdf8"];
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

// ═══ FORMATTING HELPERS ══════════════════════════════════════════════════════
const pct = v => v != null && !isNaN(v) ? (v * 100).toFixed(1) + "%" : "—";
const dec = (v, d = 2) => v != null && !isNaN(v) ? v.toFixed(d) : "—";
const svC = v => v >= .800 ? t.green : v >= .700 ? t.accent : v >= .650 ? t.yellow : t.red;
const ratC = v => v >= 4.0 ? t.green : v >= 3.5 ? t.accent : v >= 3.0 ? t.yellow : t.red;

// ═══ AGGREGATION ENGINE ═════════════════════════════════════════════════════
// Takes raw match rows and computes the same data shape the prototype used

function aggregateMatches(matches) {
  if (!matches.length) return null;
  const gp = matches.length;
  const sum = (key) => matches.reduce((s, m) => s + (m[key] || 0), 0);
  const sot = sum("shots_on_target");
  const sv = sum("saves");
  const ga = sum("goals_conceded");
  const svPct = sot > 0 ? sv / sot : 0;
  const min = gp * 90; // approximate
  const gaa = gp > 0 ? ga / gp : 0;
  const wins = matches.filter(m => m.result === "W").length;
  const draws = matches.filter(m => m.result === "D").length;
  const losses = matches.filter(m => m.result === "L").length;
  const cs = matches.filter(m => m.goals_conceded === 0 && m.session_type === "match").length;
  const csPct = gp > 0 ? cs / gp : 0;

  return {
    gp, min, sot, saves: sv, ga, svPct, gaa, cs, csPct, w: wins, d: draws, l: losses,
    saveTypes: {
      Catch: sum("saves_catch"), Parry: sum("saves_parry"), Dive: sum("saves_dive"),
      Block: sum("saves_block"), Tip: sum("saves_tip"), Punch: sum("saves_punch"),
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
  if (m < 3) return "Q3"; // Jan-Mar → season Q3
  if (m < 6) return "Q4"; // Apr-Jun → season Q4
  if (m < 9) return "Q1"; // Jul-Sep → season Q1
  return "Q2"; // Oct-Dec → season Q2
}

function aggregateQuarterly(matches) {
  const qs = { Q1: [], Q2: [], Q3: [], Q4: [] };
  matches.forEach(m => {
    const q = getQuarter(m.match_date);
    qs[q].push(m);
  });
  const result = {};
  Object.entries(qs).forEach(([q, ms]) => {
    if (!ms.length) { result[q] = { gp: 0 }; return; }
    const agg = aggregateMatches(ms);
    result[q] = { gp: agg.gp, svPct: agg.svPct, gaa: agg.gaa, csPct: agg.csPct, w: agg.w };
  });
  return result;
}

// Build match log for the Matches tab
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

  // Save % declining
  if (l5Agg.svPct < seasonAgg.svPct - 0.03)
    a.push({ type: "warning", cat: "Performance", title: "Save % Declining",
      detail: `Last 5: ${pct(l5Agg.svPct)} vs Season: ${pct(seasonAgg.svPct)}`,
      action: "Review positioning in recent film" });

  // GAA trending up
  if (l5Agg.gaa > seasonAgg.gaa + 0.25)
    a.push({ type: "warning", cat: "Performance", title: "GAA Trending Up",
      detail: `Last 5: ${dec(l5Agg.gaa)} vs Season: ${dec(seasonAgg.gaa)}`,
      action: "Analyze goal quality — saveable or defensive?" });

  // Cross claiming dropping
  const sznClaimPct = seasonAgg.crosses.total > 0 ? (seasonAgg.crosses.claimed / seasonAgg.crosses.total) * 100 : 0;
  const l5ClaimPct = l5Agg.crosses.total > 0 ? (l5Agg.crosses.claimed / l5Agg.crosses.total) * 100 : 0;
  if (sznClaimPct > 0 && l5ClaimPct < sznClaimPct - 10)
    a.push({ type: "warning", cat: "Technical", title: "Cross Claiming Dropping",
      detail: `Claim rate fell ${sznClaimPct.toFixed(0)}% → ${l5ClaimPct.toFixed(0)}%`,
      action: "Judgment of flight, starting position, CB communication" });

  // Errors leading to goal
  if (seasonAgg.handling.errGoal >= 2)
    a.push({ type: "alert", cat: "Technical", title: `${seasonAgg.handling.errGoal} Errors → Goals`,
      detail: "Direct errors leading to goals this season",
      action: "Isolate error types: handling, distribution, or positioning" });

  // Rebound control slipping
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

  // Composure declining
  if (sznAttrs?.composure && l5Attrs?.composure && l5Attrs.composure < sznAttrs.composure - 0.3)
    a.push({ type: "alert", cat: "Mental", title: "Composure Trending Down",
      detail: `Season avg ${sznAttrs.composure.toFixed(1)} → Last 5 avg ${l5Attrs.composure.toFixed(1)}`,
      action: "1-on-1 about confidence. Watch body language." });

  // Compete level rising (positive)
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

function Sec({ children, icon }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      {icon && <span style={{ fontSize: 15 }}>{icon}</span>}
      <span style={{ fontSize: 11, fontWeight: 700, color: t.accent, textTransform: "uppercase", letterSpacing: 1.2 }}>{children}</span>
      <div style={{ flex: 1, height: 1, background: t.border, marginLeft: 4 }} />
    </div>
  );
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
    return <div style={{ textAlign: "center", padding: 24, color: t.dim, fontSize: 12 }}>No goal data yet</div>;
  }
  const maxVal = Math.max(...Object.values(zones), 1);
  return (
    <div>
      {title && <div style={{ fontSize: 10, color: t.dim, marginBottom: 8, textAlign: "center" }}>{title}</div>}
      <svg viewBox="0 0 104 84" style={{ width: "100%", maxWidth: 280, display: "block", margin: "0 auto" }}>
        {/* Goal frame */}
        <rect x="2" y="2" width="100" height="80" rx="2" fill="none" stroke={t.border} strokeWidth="1.5" />
        {/* Zones */}
        {Object.entries(ZONE_POSITIONS).map(([zone, pos]) => {
          const count = zones[zone] || 0;
          const intensity = count / maxVal;
          return (
            <g key={zone}>
              <rect x={pos.x} y={pos.y} width="28" height="22" rx="3"
                fill={count > 0 ? `rgba(239,68,68,${0.15 + intensity * 0.6})` : t.bg}
                stroke={t.border} strokeWidth="0.5" />
              <text x={pos.x + 14} y={pos.y + 13} textAnchor="middle" dominantBaseline="middle"
                fill={count > 0 ? t.bright : t.dim} fontSize="10" fontWeight="700">{count}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ═══ KEEPER MODAL ═══════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

export default function DashboardPage() {
  const { user, profile, club, loading, signOut, supabase, isDelegate, delegateOf } = useAuth();
  const router = useRouter();

  // Keeper management state
  const [keepers, setKeepers] = useState([]);
  const [loadingKeepers, setLoadingKeepers] = useState(true);
  const [showKeeperModal, setShowKeeperModal] = useState(false);
  const [editingKeeper, setEditingKeeper] = useState(null);

  // Analytics state
  const [allMatches, setAllMatches] = useState([]);
  const [allGoals, setAllGoals] = useState([]);
  const [allAttrs, setAllAttrs] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  // View state
  const [selectedKeeper, setSelectedKeeper] = useState(null);
  const [tab, setTab] = useState("overview");
  const [scope, setScope] = useState("season");
  const [cmpKeeper, setCmpKeeper] = useState(null);
  const [view, setView] = useState("analytics"); // "analytics" | "roster"

  // ═══ AUTH GUARD ═══
  useEffect(() => {
    if (!loading && profile && !profile.onboarding_complete && !isDelegate) router.push("/onboarding");
  }, [loading, profile, isDelegate]);

  // ═══ FETCH KEEPERS ═══
  const fetchKeepers = async () => {
    if (!user) return;

    if (isDelegate && delegateOf?.dashboard_access) {
      // Delegate: fetch only keepers they have dashboard access to
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
      // Coach: fetch all their keepers
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

  // ═══ FETCH ALL ANALYTICS DATA ═══
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

  useEffect(() => {
    if (user && (profile?.onboarding_complete || (isDelegate && delegateOf?.dashboard_access))) {
      fetchKeepers();
      fetchAnalyticsData();
    }
  }, [user, profile, isDelegate, delegateOf]);

  // ═══ KEEPER MANAGEMENT ═══
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

  // ═══ COMPUTED DATA (per selected keeper) ═══
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
    };
  }, [selectedKeeper, allMatches, allGoals, allAttrs]);

  // Compare keeper data
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

  // Alerts
  const alerts = useMemo(() => {
    if (!keeperData?.season || !keeperData?.l5) return [];
    const kp = keepers.find(k => k.id === selectedKeeper);
    return genAlerts(kp?.name, keeperData.season, keeperData.l5,
      keeperData.seasonGoals, keeperData.l5Goals,
      keeperData.sznAttrs, keeperData.l5Attrs);
  }, [keeperData, selectedKeeper, keepers]);

  // ═══ DERIVED VALUES ═══
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

  // ═══ LOADING ═══
  // Only gate on auth loading — the useEffect above handles onboarding redirect for coaches.
  // Delegates (who have onboarding_complete=false) must be allowed through.
  if (loading || !user) {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font }}>
        <div style={{ color: t.dim, fontSize: 16 }}>Loading...</div>
      </div>
    );
  }

  const primaryColor = club?.primary_color || t.accent;
  const selectedKeeperObj = keepers.find(k => k.id === selectedKeeper);
  const cmpKeeperObj = keepers.find(k => k.id === cmpKeeper);

  // Distribution helper for bar charts
  const distData = s ? [
    { name: "GK Short", att: s.distribution.gkShort.att, suc: s.distribution.gkShort.suc, pct: s.distribution.gkShort.att > 0 ? (s.distribution.gkShort.suc / s.distribution.gkShort.att * 100) : 0 },
    { name: "GK Long", att: s.distribution.gkLong.att, suc: s.distribution.gkLong.suc, pct: s.distribution.gkLong.att > 0 ? (s.distribution.gkLong.suc / s.distribution.gkLong.att * 100) : 0 },
    { name: "Throws", att: s.distribution.throws.att, suc: s.distribution.throws.suc, pct: s.distribution.throws.att > 0 ? (s.distribution.throws.suc / s.distribution.throws.att * 100) : 0 },
    { name: "Passes", att: s.distribution.passes.att, suc: s.distribution.passes.suc, pct: s.distribution.passes.att > 0 ? (s.distribution.passes.suc / s.distribution.passes.att * 100) : 0 },
    { name: "Under Pressure", att: s.distribution.underPressure.att, suc: s.distribution.underPressure.suc, pct: s.distribution.underPressure.att > 0 ? (s.distribution.underPressure.suc / s.distribution.underPressure.att * 100) : 0 },
  ] : [];

  return (
    <div style={{ minHeight: "100vh", background: t.bg, fontFamily: font }}>
      {/* ═══ HEADER ═══ */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 20px", borderBottom: `1px solid ${t.border}`,
        maxWidth: 960, margin: "0 auto",
      }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: t.bright }}>
            Stix<span style={{ color: t.accent }}>Analytix</span>
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!isDelegate && <Link href="/staff" style={{
            padding: "8px 14px", borderRadius: 8, border: `1px solid ${t.border}`,
            background: "transparent", color: t.dim, fontSize: 12, textDecoration: "none", fontFamily: font,
            display: "flex", alignItems: "center", gap: 4,
          }}>👥 Staff</Link>}
          <Link href="/pitchside" style={{
            padding: "8px 14px", borderRadius: 8, background: primaryColor, color: "#fff",
            fontSize: 12, fontWeight: 600, textDecoration: "none", display: "flex", alignItems: "center", gap: 4,
          }}>📱 Pitchside</Link>
          <button onClick={() => setView(view === "analytics" ? "roster" : "analytics")} style={{
            padding: "8px 14px", borderRadius: 8, border: `1px solid ${t.border}`,
            background: "transparent", color: t.dim, fontSize: 12, fontFamily: font, cursor: "pointer",
          }}>{view === "analytics" ? "👥 Roster" : "📊 Analytics"}</button>
          <button onClick={signOut} style={{
            padding: "8px 14px", borderRadius: 8, border: `1px solid ${t.border}`,
            background: "transparent", color: t.dim, fontSize: 12, fontFamily: font, cursor: "pointer",
          }}>Sign Out</button>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 16px" }}>

        {/* ═══ DELEGATE BANNER ═══ */}
        {isDelegate && delegateOf && (
          <div style={{
            padding: "10px 16px", borderRadius: 10, marginBottom: 16,
            background: t.cyan + "08", border: `1px solid ${t.cyan}22`,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 16 }}>📊</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: t.cyan }}>Viewing as {delegateOf.role?.replace("_", " ")}</div>
              <div style={{ fontSize: 10, color: t.dim }}>Managed by {delegateOf.coach_name} · {delegateOf.club?.name || "Club"}</div>
            </div>
          </div>
        )}

        {/* ═══ ROSTER VIEW ═══ */}
        {view === "roster" && (
          <div>
            <div style={{
              background: `linear-gradient(135deg, ${primaryColor}15, ${primaryColor}05)`,
              borderRadius: 16, padding: "24px 20px", border: `1px solid ${primaryColor}30`, marginBottom: 24,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: `linear-gradient(135deg, ${primaryColor}, ${club?.secondary_color || t.accentDim})`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
                }}>⚽</div>
                <div>
                  <h1 style={{ fontSize: 20, fontWeight: 700, color: t.bright, margin: "0 0 2px" }}>{club?.name || "Your Club"}</h1>
                  <p style={{ fontSize: 12, color: t.dim, margin: 0 }}>{profile?.full_name} · {keepers.length} keeper{keepers.length !== 1 ? "s" : ""}</p>
                </div>
              </div>
            </div>

            <Card s={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <Sec icon="🧤">{isDelegate ? "Assigned Keepers" : "Your Goalkeepers"}</Sec>
                {!isDelegate && <button onClick={() => setShowKeeperModal(true)} style={{
                  padding: "8px 16px", borderRadius: 8, background: t.accent,
                  border: "none", color: "#fff",
                  fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: font,
                }}>+ Add Keeper</button>}
              </div>
              {loadingKeepers ? (
                <div style={{ color: t.dim, fontSize: 13, padding: "20px 0", textAlign: "center" }}>Loading roster...</div>
              ) : keepers.length === 0 ? (
                <div style={{ color: t.dim, fontSize: 13, padding: "20px 0", textAlign: "center" }}>
                  No keepers yet.
                  <button onClick={() => setShowKeeperModal(true)} style={{
                    display: "block", margin: "12px auto 0", padding: "10px 20px", borderRadius: 8,
                    background: primaryColor, border: "none", color: "#fff",
                    fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font,
                  }}>Add Your First Goalkeeper</button>
                </div>
              ) : (
                keepers.map((k, i) => {
                  const kMatches = allMatches.filter(m => m.keeper_id === k.id);
                  const kAgg = aggregateMatches(kMatches);
                  return (
                    <div key={k.id} style={{
                      display: "flex", alignItems: "center", gap: 14, padding: "14px 0",
                      borderTop: i > 0 ? `1px solid ${t.border}22` : "none", cursor: "pointer",
                    }} onClick={() => setEditingKeeper(k)}>
                      <div style={{
                        width: 42, height: 42, borderRadius: 10,
                        background: `linear-gradient(135deg, ${primaryColor}, ${club?.secondary_color || t.accentDim})`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 900, color: "#fff",
                      }}>#{k.number || "?"}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: t.bright }}>{k.name}</div>
                        <div style={{ fontSize: 11, color: t.dim }}>
                          {[k.role, k.catch_hand ? `${k.catch_hand} footed` : null, kAgg ? `${kAgg.gp} games` : "0 games"].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {kAgg && kAgg.gp > 0 && (
                          <span style={{ fontSize: 12, fontWeight: 700, color: svC(kAgg.svPct) }}>{pct(kAgg.svPct)}</span>
                        )}
                        <span style={{ fontSize: 14, color: t.dim }}>✎</span>
                      </div>
                    </div>
                  );
                })
              )}
            </Card>

            {/* Quick actions */}
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

        {/* ═══ ANALYTICS VIEW ═══ */}
        {view === "analytics" && (
          <div>
            {/* Keeper selector */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <select
                value={selectedKeeper || ""}
                onChange={e => { setSelectedKeeper(e.target.value); setTab("overview"); setScope("season"); setCmpKeeper(null); }}
                style={{
                  background: t.card, border: `1px solid ${t.border}`, borderRadius: 8,
                  padding: "10px 14px", color: t.bright, fontSize: 13, fontWeight: 600,
                  cursor: "pointer", fontFamily: font, flex: 1, minWidth: 180,
                }}
              >
                {keepers.map(k => (
                  <option key={k.id} value={k.id}>#{k.number || "?"} {k.name}</option>
                ))}
              </select>
              {selectedKeeperObj && (
                <div style={{ fontSize: 11, color: t.dim }}>
                  {selectedKeeperObj.role} · {selectedKeeperObj.catch_hand ? `${selectedKeeperObj.catch_hand} footed` : ""}
                </div>
              )}
              {loadingData && <div style={{ fontSize: 11, color: t.gold }}>Loading data...</div>}
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 8, marginBottom: 12 }}>
              {TABS.map(tb => (
                <button key={tb.id} onClick={() => { setTab(tb.id); if (!scopeTabs.includes(tb.id)) setScope("season"); }}
                  style={{
                    background: tab === tb.id ? t.accent + "18" : "transparent",
                    border: `1px solid ${tab === tb.id ? t.accent + "44" : "transparent"}`,
                    borderRadius: 7, padding: "6px 10px", color: tab === tb.id ? t.accent : t.dim,
                    fontSize: 10, fontWeight: 600, cursor: "pointer", display: "flex",
                    alignItems: "center", gap: 4, whiteSpace: "nowrap", fontFamily: font, position: "relative",
                  }}>
                  <span style={{ fontSize: 12 }}>{tb.icon}</span>{tb.label}
                  {(tb.badge || 0) > 0 && (
                    <span style={{
                      position: "absolute", top: -3, right: -3, width: 14, height: 14, borderRadius: 7,
                      background: t.red, color: "#fff", fontSize: 7, fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{tb.badge}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Scope toggle */}
            {showScope && <ScopeToggle scope={scope} setScope={setScope} />}

            {/* No keeper selected */}
            {!selectedKeeper && <EmptyState icon="👆" title="Select a Keeper" subtitle="Choose a goalkeeper from the dropdown to view analytics." />}

            {/* No matches yet */}
            {selectedKeeper && !hasMatches && tab !== "compare" && (
              <EmptyState icon="📱" title="No Sessions Logged Yet"
                subtitle={`Head to Pitchside to log a match or training session for ${selectedKeeperObj?.name || "this keeper"}.`} />
            )}

            {/* ═══ OVERVIEW ═══ */}
            {hasMatches && s && tab === "overview" && (
              <div>
                <Sec icon="📊">Season Overview — {selectedKeeperObj?.name}</Sec>
                {/* Stat cards row */}
                <Card s={{ marginBottom: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(70px, 1fr))", gap: 4 }}>
                    <StatBox label="GP" value={d.season.gp} />
                    <StatBox label="Sv%" value={pct(d.season.svPct)} color={svC(d.season.svPct)} sub={d.l5 ? <TrendBadge cur={d.l5.svPct * 100} prev={d.season.svPct * 100} suf="%" /> : null} />
                    <StatBox label="GAA" value={dec(d.season.gaa)} sub={d.l5 ? <TrendBadge cur={d.l5.gaa} prev={d.season.gaa} inv /> : null} />
                    <StatBox label="CS" value={d.season.cs} sub={pct(d.season.csPct)} />
                    <StatBox label="W-D-L" value={`${d.season.w}-${d.season.d}-${d.season.l}`} />
                  </div>
                </Card>

                {/* Key metrics */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                  <Card>
                    <div style={{ fontSize: 10, color: t.dim, marginBottom: 6 }}>Distribution Accuracy</div>
                    {distData.filter(d => d.att > 0).map(d => (
                      <PBar key={d.name} label={d.name} value={d.pct} color={d.pct >= 80 ? t.green : d.pct >= 60 ? t.accent : t.yellow} />
                    ))}
                    {distData.every(d => d.att === 0) && <div style={{ color: t.dim, fontSize: 11, textAlign: "center", padding: 12 }}>No distribution data</div>}
                  </Card>
                  <Card>
                    <div style={{ fontSize: 10, color: t.dim, marginBottom: 6 }}>Key Actions</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: t.bright }}>{s.crosses.claimed}</div>
                        <div style={{ fontSize: 9, color: t.dim }}>Crosses Claimed</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: t.bright }}>{s.oneV1.won}/{s.oneV1.faced}</div>
                        <div style={{ fontSize: 9, color: t.dim }}>1v1 Won</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: t.bright }}>{s.sweeper.clearances + s.sweeper.interceptions + s.sweeper.tackles}</div>
                        <div style={{ fontSize: 9, color: t.dim }}>Sweeper Actions</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: s.handling.errGoal > 0 ? t.red : t.green }}>{s.handling.errGoal}</div>
                        <div style={{ fontSize: 9, color: t.dim }}>Errors → Goal</div>
                      </div>
                    </div>
                  </Card>
                </div>

                {/* Alerts preview */}
                {alerts.length > 0 && (
                  <Card s={{ marginBottom: 14 }}>
                    <Sec icon="⚡">Coaching Alerts ({alerts.length})</Sec>
                    {alerts.slice(0, 3).map((al, i) => (
                      <div key={i} style={{
                        padding: "10px 12px", borderRadius: 8, marginBottom: 6,
                        background: al.type === "positive" ? t.green + "11" : al.type === "alert" ? t.red + "11" : t.orange + "11",
                        border: `1px solid ${al.type === "positive" ? t.green + "33" : al.type === "alert" ? t.red + "33" : t.orange + "33"}`,
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: al.type === "positive" ? t.green : al.type === "alert" ? t.red : t.orange }}>{al.title}</div>
                        <div style={{ fontSize: 10, color: t.dim, marginTop: 2 }}>{al.detail}</div>
                      </div>
                    ))}
                    {alerts.length > 3 && (
                      <button onClick={() => setTab("caution")} style={{
                        background: "none", border: "none", color: t.accent, fontSize: 11,
                        cursor: "pointer", fontFamily: font, padding: "4px 0",
                      }}>View all {alerts.length} alerts →</button>
                    )}
                  </Card>
                )}

                {/* Recent matches */}
                {d.matchLog.length > 0 && (
                  <Card>
                    <Sec icon="📋">Recent Matches</Sec>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 480 }}>
                        <thead>
                          <tr>
                            {["Date", "Opp", "H/A", "Result", "Score", "SOT", "Sv", "GA", "Sv%"].map(h => (
                              <th key={h} style={{ textAlign: "center", padding: "7px 6px", color: t.dim, borderBottom: `1px solid ${t.border}`, fontSize: 9 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {d.matchLog.slice(0, 5).map((m, i) => (
                            <tr key={i}>
                              <td style={{ padding: "7px 6px", color: t.text, textAlign: "center", borderBottom: `1px solid ${t.border}22` }}>{m.date}</td>
                              <td style={{ padding: "7px 6px", color: t.bright, fontWeight: 600, textAlign: "center", borderBottom: `1px solid ${t.border}22` }}>{m.opp}</td>
                              <td style={{ padding: "7px 6px", color: t.dim, textAlign: "center", borderBottom: `1px solid ${t.border}22` }}>{m.type === "training" ? "T" : m.ha}</td>
                              <td style={{ padding: "7px 6px", textAlign: "center", borderBottom: `1px solid ${t.border}22`, color: m.res === "W" ? t.green : m.res === "L" ? t.red : t.dim, fontWeight: 600 }}>{m.res}</td>
                              <td style={{ padding: "7px 6px", color: t.text, textAlign: "center", borderBottom: `1px solid ${t.border}22` }}>{m.score}</td>
                              <td style={{ padding: "7px 6px", color: t.text, textAlign: "center", borderBottom: `1px solid ${t.border}22` }}>{m.sot}</td>
                              <td style={{ padding: "7px 6px", color: t.text, textAlign: "center", borderBottom: `1px solid ${t.border}22` }}>{m.sv}</td>
                              <td style={{ padding: "7px 6px", color: m.ga > 0 ? t.red : t.green, textAlign: "center", borderBottom: `1px solid ${t.border}22`, fontWeight: 600 }}>{m.ga}</td>
                              <td style={{ padding: "7px 6px", textAlign: "center", borderBottom: `1px solid ${t.border}22`, color: m.svP != null ? svC(m.svP) : t.dim, fontWeight: 600 }}>{m.svP != null ? pct(m.svP) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {d.matchLog.length > 5 && (
                      <button onClick={() => setTab("matches")} style={{
                        background: "none", border: "none", color: t.accent, fontSize: 11,
                        cursor: "pointer", fontFamily: font, padding: "8px 0 0",
                      }}>View all {d.matchLog.length} matches →</button>
                    )}
                  </Card>
                )}
              </div>
            )}

            {/* ═══ MATCHES ═══ */}
            {hasMatches && tab === "matches" && (
              <div>
                <Sec icon="📋">Match Log — {selectedKeeperObj?.name}</Sec>
                <Card s={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 520 }}>
                    <thead>
                      <tr>
                        {["Date", "Type", "Opp", "H/A", "Res", "Score", "SOT", "Sv", "GA", "Sv%", "CS"].map(h => (
                          <th key={h} style={{ textAlign: "center", padding: "7px 5px", color: t.dim, borderBottom: `1px solid ${t.border}`, fontSize: 9 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {d.matchLog.map((m, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : t.cardAlt + "44" }}>
                          <td style={{ padding: "7px 5px", color: t.text, textAlign: "center" }}>{m.date}</td>
                          <td style={{ padding: "7px 5px", textAlign: "center" }}>
                            <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 4, background: m.type === "match" ? t.accent + "22" : t.gold + "22", color: m.type === "match" ? t.accent : t.gold }}>{m.type === "match" ? "M" : "T"}</span>
                          </td>
                          <td style={{ padding: "7px 5px", color: t.bright, fontWeight: 600, textAlign: "center" }}>{m.opp}</td>
                          <td style={{ padding: "7px 5px", color: t.dim, textAlign: "center" }}>{m.type === "training" ? "—" : m.ha}</td>
                          <td style={{ padding: "7px 5px", textAlign: "center", color: m.res === "W" ? t.green : m.res === "L" ? t.red : t.dim, fontWeight: 600 }}>{m.res}</td>
                          <td style={{ padding: "7px 5px", color: t.text, textAlign: "center" }}>{m.score}</td>
                          <td style={{ padding: "7px 5px", color: t.text, textAlign: "center" }}>{m.sot}</td>
                          <td style={{ padding: "7px 5px", color: t.text, textAlign: "center" }}>{m.sv}</td>
                          <td style={{ padding: "7px 5px", color: m.ga > 0 ? t.red : t.green, textAlign: "center", fontWeight: 600 }}>{m.ga}</td>
                          <td style={{ padding: "7px 5px", textAlign: "center", color: m.svP != null ? svC(m.svP) : t.dim, fontWeight: 600 }}>{m.svP != null ? pct(m.svP) : "—"}</td>
                          <td style={{ padding: "7px 5px", textAlign: "center" }}>{m.cs ? <span style={{ color: t.green }}>✓</span> : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </div>
            )}

            {/* ═══ CAUTION ═══ */}
            {hasMatches && tab === "caution" && (
              <div>
                <Sec icon="⚡">Coaching Alerts — {selectedKeeperObj?.name}</Sec>
                {alerts.length === 0 ? (
                  <EmptyState icon="✅" title="All Clear" subtitle="No coaching alerts based on current performance trends." />
                ) : (
                  alerts.map((al, i) => (
                    <Card key={i} s={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                          background: al.type === "positive" ? t.green + "22" : al.type === "alert" ? t.red + "22" : t.orange + "22",
                          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                          border: `1px solid ${al.type === "positive" ? t.green + "44" : al.type === "alert" ? t.red + "44" : t.orange + "44"}`,
                        }}>
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

            {/* ═══ GOALS ═══ */}
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
                          <Pie data={Object.entries(dGoals.sources).map(([name, value]) => ({ name, value }))}
                            cx="50%" cy="50%" outerRadius={65} dataKey="value" label={({ name, value }) => `${name}: ${value}`}
                            labelLine={{ stroke: t.dim, strokeWidth: 0.5 }}
                            style={{ fontSize: 9 }}>
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
                        <PBar key={rank} label={rank} value={count} max={Math.max(...Object.values(dGoals.ranks), 1)} suf="" color={rank === "Saveable" ? t.red : rank === "Difficult" ? t.orange : t.green} />
                      ))
                    ) : <div style={{ color: t.dim, fontSize: 11, textAlign: "center", padding: 12 }}>No data</div>}
                  </Card>
                  <Card>
                    <div style={{ fontSize: 10, color: t.dim, marginBottom: 8 }}>Shot Type & Positioning</div>
                    {dGoals?.shotTypes && Object.entries(dGoals.shotTypes).length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        {Object.entries(dGoals.shotTypes).map(([type, count]) => (
                          <PBar key={type} label={type} value={count} max={Math.max(...Object.values(dGoals.shotTypes), 1)} suf="" color={t.cyan} />
                        ))}
                      </div>
                    )}
                    {dGoals?.positioning && Object.entries(dGoals.positioning).length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: t.dim, marginBottom: 4, marginTop: 8 }}>GK Position at Goal</div>
                        {Object.entries(dGoals.positioning).map(([pos, count]) => (
                          <PBar key={pos} label={pos} value={count} max={Math.max(...Object.values(dGoals.positioning), 1)} suf="" color={t.purple} />
                        ))}
                      </div>
                    )}
                    {(!dGoals?.shotTypes || Object.keys(dGoals.shotTypes).length === 0) && <div style={{ color: t.dim, fontSize: 11, textAlign: "center", padding: 12 }}>No data</div>}
                  </Card>
                </div>
              </div>
            )}

            {/* ═══ DISTRIBUTION ═══ */}
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
                  {distData.filter(d => d.att > 0).map(d => (
                    <PBar key={d.name} label={d.name} value={d.pct} color={d.pct >= 80 ? t.green : d.pct >= 60 ? t.accent : t.yellow} />
                  ))}
                  {distData.every(d => d.att === 0) && <div style={{ color: t.dim, fontSize: 11, textAlign: "center", padding: 16 }}>No distribution data logged yet</div>}
                </Card>
              </div>
            )}

            {/* ═══ CROSSES ═══ */}
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
                    {s.crosses.total > 0 && (
                      <PBar label="Claim Rate" value={(s.crosses.claimed / s.crosses.total) * 100}
                        color={(s.crosses.claimed / s.crosses.total) >= 0.7 ? t.green : t.yellow} />
                    )}
                  </Card>
                  <Card>
                    <div style={{ fontSize: 10, color: t.dim, marginBottom: 8 }}>Breakdown</div>
                    {s.crosses.total > 0 ? (
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie data={[
                            { name: "Claimed", value: s.crosses.claimed },
                            { name: "Punched", value: s.crosses.punched },
                            { name: "Missed", value: s.crosses.missed },
                          ].filter(d => d.value > 0)} cx="50%" cy="50%" outerRadius={65} dataKey="value"
                            label={({ name, value }) => `${name}: ${value}`} labelLine={{ stroke: t.dim, strokeWidth: 0.5 }}
                            style={{ fontSize: 9 }}>
                            <Cell fill={t.green} />
                            <Cell fill={t.gold} />
                            <Cell fill={t.red} />
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
                      <BarChart data={[
                        { name: "Claimed", Season: d.season.crosses.claimed, "Last 5": d.l5.crosses.claimed },
                        { name: "Punched", Season: d.season.crosses.punched, "Last 5": d.l5.crosses.punched },
                        { name: "Missed", Season: d.season.crosses.missed, "Last 5": d.l5.crosses.missed },
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
                        <XAxis dataKey="name" tick={{ fill: t.dim, fontSize: 9 }} />
                        <YAxis tick={{ fill: t.dim, fontSize: 9 }} />
                        <Tooltip {...ttS} />
                        <Legend wrapperStyle={{ fontSize: 9 }} />
                        <Bar dataKey="Season" fill={t.accent} radius={[3, 3, 0, 0]} />
                        <Bar dataKey="Last 5" fill={t.gold} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                )}
              </div>
            )}

            {/* ═══ SWEEPER ═══ */}
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
                    {(s.rebounds.controlled + s.rebounds.dangerous) > 0 && (
                      <PBar label="Control Rate"
                        value={(s.rebounds.controlled / (s.rebounds.controlled + s.rebounds.dangerous)) * 100}
                        color={(s.rebounds.controlled / (s.rebounds.controlled + s.rebounds.dangerous)) >= 0.75 ? t.green : t.yellow} />
                    )}
                  </Card>
                </div>
                {d.season && d.l5 && (
                  <Card>
                    <Sec icon="📈">Season vs Last 5</Sec>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={[
                        { name: "Clearances", Season: d.season.sweeper.clearances, "Last 5": d.l5.sweeper.clearances },
                        { name: "Intercepts", Season: d.season.sweeper.interceptions, "Last 5": d.l5.sweeper.interceptions },
                        { name: "Tackles", Season: d.season.sweeper.tackles, "Last 5": d.l5.sweeper.tackles },
                        { name: "RB Ctrl", Season: d.season.rebounds.controlled, "Last 5": d.l5.rebounds.controlled },
                        { name: "RB Danger", Season: d.season.rebounds.dangerous, "Last 5": d.l5.rebounds.dangerous },
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
                        <XAxis dataKey="name" tick={{ fill: t.dim, fontSize: 8 }} />
                        <YAxis tick={{ fill: t.dim, fontSize: 9 }} />
                        <Tooltip {...ttS} />
                        <Legend wrapperStyle={{ fontSize: 9 }} />
                        <Bar dataKey="Season" fill={t.accent} radius={[3, 3, 0, 0]} />
                        <Bar dataKey="Last 5" fill={t.gold} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                )}
              </div>
            )}

            {/* ═══ ATTRIBUTES ═══ */}
            {hasMatches && tab === "attributes" && (
              <div>
                <Sec icon="⭐">Attributes — {scopeLabel}</Sec>
                {dAttrs ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 14 }}>
                    <Card>
                      <div style={{ fontSize: 10, color: t.dim, marginBottom: 6 }}>Core Attributes — Season vs Last 5</div>
                      <ResponsiveContainer width="100%" height={260}>
                        <RadarChart data={CORE_ATTRS.map(k => ({
                          attr: ATTR_LABELS[k],
                          Season: d.sznAttrs?.[k] || 0,
                          "Last 5": d.l5Attrs?.[k] || 0,
                          fullMark: 5,
                        }))}>
                          <PolarGrid stroke={t.border} />
                          <PolarAngleAxis dataKey="attr" tick={{ fill: t.dim, fontSize: 7 }} />
                          <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fill: t.dim, fontSize: 7 }} />
                          <Radar dataKey="Season" stroke={t.accent} fill={t.accent} fillOpacity={0.15} strokeWidth={2} />
                          <Radar dataKey="Last 5" stroke={t.gold} fill={t.gold} fillOpacity={0.1} strokeWidth={2} strokeDasharray="4 2" />
                          <Legend wrapperStyle={{ fontSize: 9 }} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </Card>
                    <Card>
                      <div style={{ fontSize: 10, color: t.dim, marginBottom: 6 }}>All Attributes ({scopeLabel})</div>
                      {ATTR_KEYS.filter(k => dAttrs[k] != null).sort((a, b) => (dAttrs[b] || 0) - (dAttrs[a] || 0)).map(k => (
                        <div key={k} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                          <div style={{ width: 95, fontSize: 9, color: t.dim, textAlign: "right", flexShrink: 0 }}>{ATTR_LABELS[k]}</div>
                          <div style={{ flex: 1, height: 10, background: t.bg, borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${(dAttrs[k] / 5) * 100}%`, height: "100%", borderRadius: 3, background: ratC(dAttrs[k]) }} />
                          </div>
                          <div style={{ width: 28, fontSize: 9, color: t.bright, fontWeight: 600, textAlign: "right" }}>{dAttrs[k]?.toFixed(1)}</div>
                          <TrendBadge cur={d.l5Attrs?.[k]} prev={d.sznAttrs?.[k]} />
                        </div>
                      ))}
                    </Card>
                  </div>
                ) : (
                  <EmptyState icon="⭐" title="No Attribute Ratings" subtitle="Rate keeper attributes after each match in Pitchside." />
                )}

                {/* Save types */}
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

            {/* ═══ QUARTERLY ═══ */}
            {hasMatches && tab === "quarterly" && d.quarterly && (
              <div>
                <Sec icon="📅">Quarterly Breakdown</Sec>
                <Card s={{ marginBottom: 16, overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: "7px 8px", color: t.dim, borderBottom: `1px solid ${t.border}` }}>Metric</th>
                        {["Q1", "Q2", "Q3", "Q4"].map(q => (
                          <th key={q} style={{ textAlign: "center", padding: "7px 8px", color: t.dim, borderBottom: `1px solid ${t.border}` }}>{q}</th>
                        ))}
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
                            return (
                              <td key={q} style={{
                                textAlign: "center", padding: "7px 8px",
                                color: v == null || (v === 0 && r.k === "gp") ? t.dim : t.bright,
                                borderBottom: `1px solid ${t.border}22`,
                              }}>{r.f(v)}</td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
                <Card>
                  <Sec icon="📈">Trends</Sec>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={["Q1", "Q2", "Q3", "Q4"].map(q => ({
                      q,
                      svPct: d.quarterly[q]?.svPct ? d.quarterly[q].svPct * 100 : null,
                      gaa: d.quarterly[q]?.gaa || null,
                    }))}>
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

            {/* ═══ COMPARE ═══ */}
            {tab === "compare" && (
              <div>
                <Sec icon="⚖️">Head-to-Head</Sec>
                <Card s={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontSize: 8, color: t.dim }}>Primary</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: t.accent }}>
                        #{selectedKeeperObj?.number || "?"} {selectedKeeperObj?.name}
                      </div>
                    </div>
                    <div style={{ fontSize: 16, color: t.dim }}>vs</div>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontSize: 8, color: t.dim }}>Compare to</div>
                      <select value={cmpKeeper || ""} onChange={e => setCmpKeeper(e.target.value || null)}
                        style={{ width: "100%", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 6, padding: "7px 9px", color: t.bright, fontSize: 11, cursor: "pointer", fontFamily: font }}>
                        <option value="">Select keeper...</option>
                        {keepers.filter(k => k.id !== selectedKeeper).map(k => (
                          <option key={k.id} value={k.id}>#{k.number || "?"} {k.name}</option>
                        ))}
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
                          <thead>
                            <tr>
                              <th style={{ textAlign: "left", padding: "5px 0", color: t.dim }}></th>
                              <th style={{ textAlign: "center", color: t.accent, fontSize: 9 }}>{selectedKeeperObj?.name?.split(" ")[0]}</th>
                              <th style={{ textAlign: "center", color: t.gold, fontSize: 9 }}>{cmpKeeperObj?.name?.split(" ")[0]}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              { l: "GP", v1: d.season.gp, v2: cmpData.season.gp },
                              { l: "Sv%", v1: d.season.svPct, v2: cmpData.season.svPct, f: pct, b: "high" },
                              { l: "GAA", v1: d.season.gaa, v2: cmpData.season.gaa, f: dec, b: "low" },
                              { l: "CS%", v1: d.season.csPct, v2: cmpData.season.csPct, f: pct, b: "high" },
                              { l: "Cross%", v1: d.season.crosses.total > 0 ? d.season.crosses.claimed / d.season.crosses.total : 0, v2: cmpData.season.crosses.total > 0 ? cmpData.season.crosses.claimed / cmpData.season.crosses.total : 0, f: pct, b: "high" },
                              { l: "1v1 Win%", v1: d.season.oneV1.faced > 0 ? d.season.oneV1.won / d.season.oneV1.faced : 0, v2: cmpData.season.oneV1.faced > 0 ? cmpData.season.oneV1.won / cmpData.season.oneV1.faced : 0, f: pct, b: "high" },
                            ].map(r => {
                              const fmt = r.f || (v => v);
                              const b1 = r.b === "high" ? r.v1 > r.v2 : r.b === "low" ? r.v1 < r.v2 : false;
                              return (
                                <tr key={r.l}>
                                  <td style={{ padding: "5px 0", color: t.dim }}>{r.l}</td>
                                  <td style={{ textAlign: "center", color: b1 ? t.green : t.bright, fontWeight: b1 ? 700 : 400 }}>{fmt(r.v1)}</td>
                                  <td style={{ textAlign: "center", color: !b1 ? t.green : t.bright, fontWeight: !b1 ? 700 : 400 }}>{fmt(r.v2)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </Card>
                      <Card>
                        <Sec icon="🏃">Sweeper & Rebounds</Sec>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                          <thead>
                            <tr>
                              <th style={{ textAlign: "left", padding: "5px 0", color: t.dim }}></th>
                              <th style={{ textAlign: "center", color: t.accent, fontSize: 9 }}>{selectedKeeperObj?.name?.split(" ")[0]}</th>
                              <th style={{ textAlign: "center", color: t.gold, fontSize: 9 }}>{cmpKeeperObj?.name?.split(" ")[0]}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              { l: "Sweeper", v1: d.season.sweeper.clearances + d.season.sweeper.interceptions + d.season.sweeper.tackles, v2: cmpData.season.sweeper.clearances + cmpData.season.sweeper.interceptions + cmpData.season.sweeper.tackles, b: "high" },
                              { l: "RB Ctrl%", v1: (d.season.rebounds.controlled + d.season.rebounds.dangerous) > 0 ? d.season.rebounds.controlled / (d.season.rebounds.controlled + d.season.rebounds.dangerous) : 0, v2: (cmpData.season.rebounds.controlled + cmpData.season.rebounds.dangerous) > 0 ? cmpData.season.rebounds.controlled / (cmpData.season.rebounds.controlled + cmpData.season.rebounds.dangerous) : 0, f: pct, b: "high" },
                            ].map(r => {
                              const fmt = r.f || (v => v);
                              const b1 = r.b === "high" ? r.v1 > r.v2 : false;
                              return (
                                <tr key={r.l}>
                                  <td style={{ padding: "5px 0", color: t.dim }}>{r.l}</td>
                                  <td style={{ textAlign: "center", color: b1 ? t.green : t.bright, fontWeight: b1 ? 700 : 400 }}>{fmt(r.v1)}</td>
                                  <td style={{ textAlign: "center", color: !b1 ? t.green : t.bright, fontWeight: !b1 ? 700 : 400 }}>{fmt(r.v2)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </Card>
                    </div>

                    {/* Compare radar */}
                    {d.sznAttrs && cmpData.sznAttrs && (
                      <Card s={{ marginBottom: 16 }}>
                        <Sec icon="⭐">Attributes</Sec>
                        <ResponsiveContainer width="100%" height={280}>
                          <RadarChart data={CORE_ATTRS.map(k => ({
                            attr: ATTR_LABELS[k],
                            [selectedKeeperObj?.name?.split(" ")[0] || "A"]: d.sznAttrs[k] || 0,
                            [cmpKeeperObj?.name?.split(" ")[0] || "B"]: cmpData.sznAttrs[k] || 0,
                            fullMark: 5,
                          }))}>
                            <PolarGrid stroke={t.border} />
                            <PolarAngleAxis dataKey="attr" tick={{ fill: t.dim, fontSize: 8 }} />
                            <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fill: t.dim, fontSize: 7 }} />
                            <Radar dataKey={selectedKeeperObj?.name?.split(" ")[0] || "A"} stroke={t.accent} fill={t.accent} fillOpacity={0.15} strokeWidth={2} />
                            <Radar dataKey={cmpKeeperObj?.name?.split(" ")[0] || "B"} stroke={t.gold} fill={t.gold} fillOpacity={0.15} strokeWidth={2} />
                            <Legend wrapperStyle={{ fontSize: 9 }} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </Card>
                    )}

                    {/* Compare heatmaps */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <Card><GoalHeatmap zones={d.seasonGoals?.zones} title={`${selectedKeeperObj?.name?.split(" ")[0]} Goals`} /></Card>
                      <Card><GoalHeatmap zones={cmpData.seasonGoals?.zones} title={`${cmpKeeperObj?.name?.split(" ")[0]} Goals`} /></Card>
                    </div>
                  </div>
                ) : (
                  <EmptyState icon="⚖️" title="Select a Keeper to Compare" subtitle="Choose a second goalkeeper from the dropdown above." />
                )}
              </div>
            )}

          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ textAlign: "center", padding: 14, borderTop: `1px solid ${t.border}`, fontSize: 8, color: t.dim }}>
        StixAnalytix · Built for coaching professionals
      </div>

      {/* ═══ MODALS ═══ */}
      {showKeeperModal && (
        <KeeperModal keeper={null} primaryColor={primaryColor}
          onClose={() => setShowKeeperModal(false)} onSave={handleAddKeeper} />
      )}
      {editingKeeper && (
        <KeeperModal keeper={editingKeeper} primaryColor={primaryColor}
          onClose={() => setEditingKeeper(null)} onSave={handleEditKeeper}
          onDeactivate={handleDeactivateKeeper} />
      )}
    </div>
  );
}



