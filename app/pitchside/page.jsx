"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ═══ THEME ═══════════════════════════════════════════════════════════════════
const tDark = {
  bg: "#070b0e", card: "#0f1419", cardAlt: "#151c22", border: "#1e2a32",
  accent: "#10b981", accentDim: "#065f46", accentGlow: "#10b98133",
  gold: "#d4a853", goldDim: "#d4a85322",
  red: "#ef4444", green: "#22c55e", yellow: "#eab308", orange: "#f97316",
  teal: "#14b8a6", cyan: "#06b6d4", purple: "#a78bfa",
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

// ═══ CONSTANTS ══════════════════════════════════════════════════════════════
const HALVES = ["H1", "H2", "ET"];
const EVENT_TYPES = ["Corner", "Cross", "Shot", "1v1", "Penalty"];
const GK_ACTIONS_CROSS = ["Claim", "Punched", "Missed/Misjudged"];
const GK_ACTIONS_SHOT = ["Claim", "Parry", "Dive", "Block", "Tip", "Punched", "Goal", "Missed/Misjudged"];
const GK_ACTIONS_PENALTY = ["Save – Dive", "Save – Catch", "Save – Parry", "Goal", "Missed/Misjudged"];
const SHOT_METHODS = ["Foot", "Header", "Deflection", "Own Goal"];
const GOAL_ZONES = ["High L","High C","High R","Mid L","Mid C","Mid R","Low L","Low C","Low R"];
const OFF_TARGET_ZONES = ["Wide Left", "Wide Right", "Over Bar"];
const GK_POSITIONING = ["Set", "Moving"];
const GOAL_RANKS = ["Saveable", "Difficult", "Unsaveable"];
const SUB_REASONS = ["Removed – Injury", "Removed – Poor Play", "Removed – Other"];
const ATTRS = [
  "Game Rating","Shot Stopping","Handling","Positioning",
  "Aerial Dominance","Distribution","Decision Making","Sweeper Play",
  "Set Piece Org.","Footwork & Agility","Reaction Speed",
  "Communication","Command of Box","Composure","Compete Level",
];
const SHOT_ORIGINS = [
  { id: "6yard", label: "6-Yard Box" },
  { id: "boxL", label: "Box Left" },
  { id: "boxC", label: "Box Center" },
  { id: "boxR", label: "Box Right" },
  { id: "outL", label: "Outside Left" },
  { id: "outC", label: "Outside Center" },
  { id: "outR", label: "Outside Right" },
  { id: "cornerL", label: "Corner Left" },
  { id: "cornerR", label: "Corner Right" },
];

// ═══ REUSABLE COMPONENTS ════════════════════════════════════════════════════

function Counter({ label, value, onChange, min = 0, compact, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: compact ? "5px 0" : "7px 0" }}>
      <span style={{ fontSize: compact ? 13 : 14, color: t.text, fontWeight: 500 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        <button onClick={() => onChange(Math.max(min, value - 1))} style={{
          width: 44, height: 44, borderRadius: "10px 0 0 10px",
          border: `1px solid ${t.border}`, background: t.bg, color: t.bright,
          fontSize: 20, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>−</button>
        <div style={{
          width: 48, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
          background: t.cardAlt, borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}`,
          fontSize: 18, fontWeight: 700, color: color || t.bright,
        }}>{value}</div>
        <button onClick={() => onChange(value + 1)} style={{
          width: 44, height: 44, borderRadius: "0 10px 10px 0",
          border: `1px solid ${t.border}`, background: t.bg, color: t.bright,
          fontSize: 20, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>+</button>
      </div>
    </div>
  );
}

function Chip({ label, selected, onClick, small, color }) {
  const c = color || t.accent;
  return (
    <button onClick={onClick} style={{
      padding: small ? "10px 10px" : "14px 12px", borderRadius: 10,
      border: `1px solid ${selected ? c : t.border}`,
      background: selected ? c + "25" : t.bg,
      color: selected ? c : t.dim,
      fontSize: small ? 12 : 13, fontWeight: selected ? 700 : 500, cursor: "pointer",
      transition: "all 0.12s", textAlign: "center", lineHeight: 1.2, fontFamily: font,
      minHeight: 44,
    }}>{label}</button>
  );
}

function SectionHeader({ title, icon, accentColor }) {
  const ac = accentColor || t.accent;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: t.bright }}>{title}</span>
    </div>
  );
}

function RatingRow({ label, value, onChange }) {
  return (
    <div style={{ padding: "5px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: t.text, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: value ? (value >= 4 ? t.green : value >= 3 ? t.gold : t.red) : t.dim }}>{value || "—"}</span>
      </div>
      <div style={{ display: "flex", gap: 3 }}>
        {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map(v => (
          <button key={v} onClick={() => onChange(v)} style={{
            flex: 1, height: 34, borderRadius: 6, border: "none", cursor: "pointer",
            fontSize: 10, fontWeight: 700, fontFamily: font,
            background: value === v ? (v >= 4 ? t.green : v >= 3 ? t.gold : t.red) : t.bg,
            color: value === v ? "#fff" : t.dim, transition: "all 0.12s",
          }}>{v % 1 === 0 ? v : ""}</button>
        ))}
      </div>
    </div>
  );
}

// ═══ PITCH ORIGIN MAP ═══════════════════════════════════════════════════════
function PitchOriginMap({ selected, onSelect }) {
  const w = 320, h = 260;
  const goalW = 80, goalH = 10, sixW = 130, sixH = 38, boxW = 240, boxH = 110;
  const cx = w / 2;
  const goalY = h - 14;
  const boxTop = goalY - boxH;
  const sixTop = goalY - sixH;
  const boxL = cx - boxW / 2, boxR = cx + boxW / 2;
  const sixL = cx - sixW / 2, sixR = cx + sixW / 2;
  const cornerSize = 40;

  const zones = [
    { id: "6yard", path: `M${sixL},${sixTop} L${sixR},${sixTop} L${sixR},${goalY} L${sixL},${goalY} Z` },
    { id: "boxL", path: `M${boxL},${boxTop} L${sixL},${boxTop} L${sixL},${goalY} L${boxL},${goalY} Z` },
    { id: "boxC", path: `M${sixL},${boxTop} L${sixR},${boxTop} L${sixR},${sixTop} L${sixL},${sixTop} Z` },
    { id: "boxR", path: `M${sixR},${boxTop} L${boxR},${boxTop} L${boxR},${goalY} L${sixR},${goalY} Z` },
    { id: "outL", path: `M0,10 L${boxL},10 L${boxL},${goalY} L0,${goalY} Z` },
    { id: "outC", path: `M${boxL},10 L${boxR},10 L${boxR},${boxTop} L${boxL},${boxTop} Z` },
    { id: "outR", path: `M${boxR},10 L${w},10 L${w},${goalY} L${boxR},${goalY} Z` },
    { id: "cornerL", path: `M0,${goalY} L${cornerSize},${goalY} A${cornerSize},${cornerSize} 0 0,1 0,${goalY - cornerSize} Z` },
    { id: "cornerR", path: `M${w},${goalY} L${w - cornerSize},${goalY} A${cornerSize},${cornerSize} 0 0,0 ${w},${goalY - cornerSize} Z` },
  ];

  const labels = {
    "6yard": { x: cx, y: goalY - sixH / 2 - 2, t: "6-Yard" },
    "boxL": { x: (boxL + sixL) / 2, y: (boxTop + goalY) / 2, t: "Box L" },
    "boxC": { x: cx, y: (boxTop + sixTop) / 2, t: "Box C" },
    "boxR": { x: (sixR + boxR) / 2, y: (boxTop + goalY) / 2, t: "Box R" },
    "outL": { x: boxL / 2, y: (10 + goalY) / 2, t: "Outside L" },
    "outC": { x: cx, y: (10 + boxTop) / 2, t: "Outside C" },
    "outR": { x: (boxR + w) / 2, y: (10 + goalY) / 2, t: "Outside R" },
    "cornerL": { x: 16, y: goalY - 14, t: "CK" },
    "cornerR": { x: w - 16, y: goalY - 14, t: "CK" },
  };

  const zc = (id) => selected === id
    ? { fill: t.accent + "55", stroke: t.accent, sw: 2.5 }
    : { fill: "#ffffff08", stroke: "#ffffff12", sw: 0.5 };

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", maxWidth: 360, display: "block", margin: "0 auto" }}>
      <rect x={0} y={0} width={w} height={h} rx={8} fill="#0c1a12" />
      <rect x={boxL} y={boxTop} width={boxW} height={boxH} fill="none" stroke="#2a5a3a" strokeWidth={1.5} />
      <rect x={sixL} y={sixTop} width={sixW} height={sixH} fill="none" stroke="#2a5a3a" strokeWidth={1.5} />
      <circle cx={cx} cy={goalY - boxH * 0.55} r={2.5} fill="#2a5a3a" />
      <path d={`M${cx - 48},${boxTop} A52,52 0 0,1 ${cx + 48},${boxTop}`} fill="none" stroke="#2a5a3a" strokeWidth={1.5} />
      <line x1={0} y1={goalY} x2={w} y2={goalY} stroke="#3a7a4a" strokeWidth={1} />
      <rect x={cx - goalW / 2} y={goalY} width={goalW} height={goalH} rx={2} fill="#1a3a22" stroke="#4a9a5a" strokeWidth={2} />
      <text x={cx} y={goalY + goalH - 2} textAnchor="middle" fontSize={7} fill="#4a9a5a" fontWeight={700} fontFamily={font}>GOAL</text>
      <path d={`M0,${goalY} A${cornerSize},${cornerSize} 0 0,1 ${cornerSize},${goalY}`} fill="none" stroke="#2a5a3a" strokeWidth={1} />
      <path d={`M${w},${goalY} A${cornerSize},${cornerSize} 0 0,0 ${w - cornerSize},${goalY}`} fill="none" stroke="#2a5a3a" strokeWidth={1} />
      <line x1={0} y1={10} x2={w} y2={10} stroke="#2a5a3a44" strokeWidth={1} strokeDasharray="4,4" />
      {zones.map(z => {
        const c = zc(z.id);
        const l = labels[z.id];
        return (
          <g key={z.id} onClick={() => onSelect(z.id)} style={{ cursor: "pointer" }}>
            <path d={z.path} fill={c.fill} stroke={c.stroke} strokeWidth={c.sw} style={{ transition: "all 0.15s" }} />
            <text x={l.x} y={l.y} textAnchor="middle" dominantBaseline="middle"
              fontSize={z.id.startsWith("corner") ? 8 : 9} fontWeight={selected === z.id ? 700 : 500}
              fill={selected === z.id ? t.accent : "#5a8a6a"} fontFamily={font}
              style={{ pointerEvents: "none" }}>{l.t}</text>
          </g>
        );
      })}
      <text x={cx} y={h - 1} textAnchor="middle" fontSize={7} fill="#3a6a4a88" fontFamily={font}>↓ keeper&apos;s goal ↓</text>
    </svg>
  );
}

// ═══ GOAL ZONE MAP (with off-target zones) ═════════════════════════════════
function GoalZoneMap({ selected, onSelect, showOffTarget }) {
  const w = 300, h = 180;
  const cols = 3, rows = 3;
  const cellW = w / cols, cellH = h / rows;
  const zoneLabels = GOAL_ZONES;

  return (
    <div>
      <div style={{ position: "relative", background: t.bg, borderRadius: 10, border: `1px solid ${t.border}`, padding: 8 }}>
        <div style={{ position: "absolute", top: 2, left: "50%", transform: "translateX(-50%)", fontSize: 9, color: t.dim + "88", letterSpacing: 2, textTransform: "uppercase" }}>← goal face →</div>
        <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", maxWidth: 340, display: "block", margin: "8px auto 0" }}>
          <rect x={0} y={0} width={w} height={h} rx={4} fill="none" stroke="#4a9a5a" strokeWidth={3} />
          {[1, 2].map(i => (
            <line key={`v${i}`} x1={cellW * i} y1={0} x2={cellW * i} y2={h} stroke={t.border} strokeWidth={1} />
          ))}
          {[1, 2].map(i => (
            <line key={`h${i}`} x1={0} y1={cellH * i} x2={w} y2={cellH * i} stroke={t.border} strokeWidth={1} />
          ))}
          {zoneLabels.map((z, i) => {
            const col = i % 3, row = Math.floor(i / 3);
            const isSelected = selected === z;
            return (
              <g key={z} onClick={() => onSelect(z)} style={{ cursor: "pointer" }}>
                <rect x={col * cellW + 1} y={row * cellH + 1} width={cellW - 2} height={cellH - 2}
                  fill={isSelected ? t.red + "44" : "transparent"} rx={3}
                  stroke={isSelected ? t.red : "transparent"} strokeWidth={isSelected ? 2 : 0}
                  style={{ transition: "all 0.15s" }} />
                <text x={col * cellW + cellW / 2} y={row * cellH + cellH / 2}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={11} fontWeight={isSelected ? 700 : 500}
                  fill={isSelected ? t.red : t.dim} fontFamily={font}
                  style={{ pointerEvents: "none" }}>{z}</text>
              </g>
            );
          })}
        </svg>
      </div>
      {/* Off-target zones */}
      {showOffTarget !== false && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 8 }}>
          {OFF_TARGET_ZONES.map(z => {
            const isSelected = selected === z;
            return (
              <button key={z} onClick={() => onSelect(z)} style={{
                padding: "12px 8px", borderRadius: 8,
                border: `1px solid ${isSelected ? t.orange : t.border}`,
                background: isSelected ? t.orange + "25" : t.bg,
                color: isSelected ? t.orange : t.dim,
                fontSize: 11, fontWeight: isSelected ? 700 : 500,
                cursor: "pointer", textAlign: "center", fontFamily: font,
                minHeight: 44,
              }}>{z}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══ HALF SUMMARY MODAL ════════════════════════════════════════════════════
function HalfSummary({ half, events, halves, goalsFor, onClose, clubName, opponent }) {
  const hEvents = events.filter(e => e.half === half);
  const shots = hEvents.filter(e => e.type === "Shot" || e.type === "1v1" || e.type === "Penalty");
  const saves = hEvents.filter(e => !e.isGoal && !e.offTarget && (e.type === "Shot" || e.type === "1v1" || e.type === "Penalty") && e.gkAction && e.gkAction !== "Missed/Misjudged" && !e.gkAction.startsWith("Goal"));
  const goals = hEvents.filter(e => e.isGoal);
  const crosses = hEvents.filter(e => e.type === "Cross" || e.type === "Corner");
  const claims = crosses.filter(e => e.gkAction === "Claim");
  const sot = shots.filter(e => !e.offTarget).length;
  const svPct = sot > 0 ? (((sot - goals.length) / sot) * 100).toFixed(1) + "%" : "—";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: t.card, borderRadius: 16, width: "100%", maxWidth: 400, padding: 20, maxHeight: "85vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: t.bright }}>📋 {half} Summary</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: t.dim, fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
          {[
            { l: "SOT", v: sot },
            { l: "GA", v: goals.length, c: goals.length >= 2 ? t.red : t.bright },
            { l: "Sv%", v: svPct, c: sot > 0 && saves.length / sot >= 0.85 ? t.green : t.bright },
          ].map(m => (
            <div key={m.l} style={{ background: t.bg, borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: t.dim, textTransform: "uppercase", fontWeight: 600 }}>{m.l}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: m.c || t.bright, marginTop: 2 }}>{m.v}</div>
            </div>
          ))}
        </div>
        {goals.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: t.dim, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>Goals conceded</div>
            {goals.map((gl, i) => (
              <div key={i} style={{ fontSize: 11, color: t.text, padding: "4px 0", borderBottom: `1px solid ${t.border}11` }}>
                {gl.method === "Own Goal" ? "🟣 OG" : "🚨"} {gl.type} • {SHOT_ORIGINS.find(o => o.id === gl.origin)?.label || gl.origin || "Penalty"}
                {gl.goalZone ? ` • ${gl.goalZone}` : ""}{gl.rank ? ` • ${gl.rank}` : ""}
              </div>
            ))}
          </div>
        )}
        <button onClick={onClose} style={{ width: "100%", padding: 14, borderRadius: 10, border: "none", background: t.accent, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: font, minHeight: 48 }}>Back to Match</button>
      </div>
    </div>
  );
}

// ═══ EVENT LOG DISPLAY ═════════════════════════════════════════════════════
function EventLog({ events, half, onUndo }) {
  const halfEvents = events.filter(e => e.half === half);
  if (halfEvents.length === 0) return null;

  const describeEvent = (e) => {
    let desc = e.type;
    if (e.offTarget) return `${desc} → Off Target`;
    if (e.gkAction) desc += ` → ${e.gkAction}`;
    if (e.isGoal) desc += " → GOAL";
    return desc;
  };

  return (
    <div style={{ background: t.card, borderRadius: 12, padding: "10px 14px", marginBottom: 8, border: `1px solid ${t.border}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: t.dim, textTransform: "uppercase", letterSpacing: 1 }}>
          {half} Event Log ({halfEvents.length})
        </span>
        {events.length > 0 && (
          <button onClick={onUndo} style={{
            padding: "6px 14px", borderRadius: 8, border: `1px solid ${t.orange}44`,
            background: t.orange + "11", color: t.orange, fontSize: 11,
            fontWeight: 700, cursor: "pointer", fontFamily: font, minHeight: 36,
          }}>↩ Undo Last</button>
        )}
      </div>
      <div style={{ maxHeight: 120, overflow: "auto" }}>
        {halfEvents.slice().reverse().map((e, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "4px 0",
            borderTop: i > 0 ? `1px solid ${t.border}11` : "none",
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: 4, flexShrink: 0,
              background: e.isGoal ? t.red : e.offTarget ? t.dim : t.green,
            }} />
            <span style={{ fontSize: 11, color: e.isGoal ? t.red : t.text, fontWeight: e.isGoal ? 600 : 400 }}>
              {describeEvent(e)}
            </span>
            {e.goalZone && <span style={{ fontSize: 9, color: t.dim }}>({e.goalZone})</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══ MAIN APP ═══════════════════════════════════════════════════════════════

export default function PitchsidePage() {
  const { user, profile, club, supabase, loading: authLoading, isDelegate, delegateOf } = useAuth();
  const router = useRouter();

  // ─── Phase routing
  const [darkMode, setDarkMode] = useState(true);
  t = darkMode ? tDark : tLight;
  const [phase, setPhase] = useState("setup"); // setup | match | attributes | saving | saved

  // ─── Setup state
  const [keepers, setKeepers] = useState([]);
  const [loadingKeepers, setLoadingKeepers] = useState(true);
  const [selectedKeeperId, setSelectedKeeperId] = useState(null);
  const [sessionType, setSessionType] = useState("match");
  const [opponent, setOpponent] = useState("");
  const [homeAway, setHomeAway] = useState(null);
  const [matchDate, setMatchDate] = useState(new Date().toISOString().split("T")[0]);
  const [minutesPlayed, setMinutesPlayed] = useState("90");

  // ─── Match state
  const [half, setHalf] = useState("H1");
  const emptyH = () => ({ rbControlled: 0, rbDangerous: 0, note: "" });
  const [halves, setHalves] = useState({ "H1": emptyH(), "H2": emptyH(), "ET": emptyH() });
  const [events, setEvents] = useState([]);
  const [goalsFor, setGoalsFor] = useState(0);
  const [result, setResult] = useState(null);
  const [lastSave, setLastSave] = useState(null);

  // ─── Event logging
  const [evtType, setEvtType] = useState(null);
  const [evtOrigin, setEvtOrigin] = useState(null);
  const [evtAction, setEvtAction] = useState(null);
  const [evtGoalZone, setEvtGoalZone] = useState(null);
  const [evtMethod, setEvtMethod] = useState(null);
  const [evtPosition, setEvtPosition] = useState(null);
  const [evtRank, setEvtRank] = useState(null);
  const [evtIsGoal, setEvtIsGoal] = useState(false);

  // ─── Distribution (per half)
  const dKeys = ["dGkShort","dGkShortOk","dGkLong","dGkLongOk","dThrow","dThrowOk","dPass","dPassOk","dPressure","dPressureOk"];
  const swKeys = ["swClear","swIntercept","swTackle"];
  const initHalfExtra = () => {
    const o = {};
    dKeys.forEach(k => o[k] = 0);
    swKeys.forEach(k => o[k] = 0);
    return o;
  };
  const [halfExtras, setHalfExtras] = useState({ "H1": initHalfExtra(), "H2": initHalfExtra(), "ET": initHalfExtra() });

  // ─── PKs (shootout)
  const [psoAttempts, setPsoAttempts] = useState(0);
  const [psoSaves, setPsoSaves] = useState(0);
  const [showPSO, setShowPSO] = useState(false);

  // ─── Attributes
  const [attrs, setAttrs] = useState({});

  // ─── Substitute
  const [subReason, setSubReason] = useState(null);
  const [wasSub, setWasSub] = useState(false);
  const [subMinute, setSubMinute] = useState("");

  // ─── UI
  const [showHalfSummary, setShowHalfSummary] = useState(null);
  const [showSetup, setShowSetup] = useState(false);
  const [saveError, setSaveError] = useState("");

  // ─── Auto-save & recovery
  const AUTOSAVE_KEY = "stix_pitchside_autosave";
  const [recoveryData, setRecoveryData] = useState(null);
  const [showRecovery, setShowRecovery] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState(null); // null | "saving" | "saved"

  // Check for saved session on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Only offer recovery if the session is from the last 24 hours
        const savedAt = new Date(parsed._savedAt);
        const hoursSince = (Date.now() - savedAt.getTime()) / (1000 * 60 * 60);
        if (hoursSince < 24 && parsed.phase && parsed.phase !== "setup" && parsed.phase !== "saved") {
          setRecoveryData(parsed);
          setShowRecovery(true);
        } else if (hoursSince >= 24) {
          // Stale session — clean up
          localStorage.removeItem(AUTOSAVE_KEY);
        }
      }
    } catch (e) {
      console.error("Recovery check failed:", e);
      localStorage.removeItem(AUTOSAVE_KEY);
    }
  }, []);

  // Restore a saved session
  const restoreSession = () => {
    if (!recoveryData) return;
    try {
      if (recoveryData.phase) setPhase(recoveryData.phase === "saving" ? "attributes" : recoveryData.phase);
      if (recoveryData.selectedKeeperId) setSelectedKeeperId(recoveryData.selectedKeeperId);
      if (recoveryData.sessionType) setSessionType(recoveryData.sessionType);
      if (recoveryData.opponent != null) setOpponent(recoveryData.opponent);
      if (recoveryData.homeAway) setHomeAway(recoveryData.homeAway);
      if (recoveryData.matchDate) setMatchDate(recoveryData.matchDate);
      if (recoveryData.minutesPlayed) setMinutesPlayed(recoveryData.minutesPlayed);
      if (recoveryData.half) setHalf(recoveryData.half);
      if (recoveryData.halves) setHalves(recoveryData.halves);
      if (recoveryData.events) setEvents(recoveryData.events);
      if (recoveryData.goalsFor != null) setGoalsFor(recoveryData.goalsFor);
      if (recoveryData.result) setResult(recoveryData.result);
      if (recoveryData.halfExtras) setHalfExtras(recoveryData.halfExtras);
      if (recoveryData.attrs) setAttrs(recoveryData.attrs);
      if (recoveryData.psoAttempts) setPsoAttempts(recoveryData.psoAttempts);
      if (recoveryData.psoSaves) setPsoSaves(recoveryData.psoSaves);
      if (recoveryData.wasSub) setWasSub(recoveryData.wasSub);
      if (recoveryData.subReason) setSubReason(recoveryData.subReason);
      if (recoveryData.subMinute) setSubMinute(recoveryData.subMinute);
    } catch (e) {
      console.error("Session restore failed:", e);
    }
    setShowRecovery(false);
    setRecoveryData(null);
  };

  const discardSession = () => {
    localStorage.removeItem(AUTOSAVE_KEY);
    setShowRecovery(false);
    setRecoveryData(null);
  };

  // Auto-save match state to localStorage on every meaningful change
  useEffect(() => {
    // Only auto-save once we're past setup (there's data worth saving)
    if (phase === "setup" || phase === "saved") return;

    const saveTimer = setTimeout(() => {
      try {
        const snapshot = {
          _savedAt: new Date().toISOString(),
          _keeperName: keepers.find(k => k.id === selectedKeeperId)?.name || "Unknown",
          _opponent: opponent || (sessionType === "training" ? "Training" : ""),
          phase, selectedKeeperId, sessionType, opponent, homeAway, matchDate, minutesPlayed,
          half, halves, events, goalsFor, result, halfExtras, attrs,
          psoAttempts, psoSaves, wasSub, subReason, subMinute,
        };
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snapshot));
        setAutoSaveStatus("saved");
        // Fade out the indicator after 2 seconds
        setTimeout(() => setAutoSaveStatus(null), 2000);
      } catch (e) {
        console.error("Auto-save failed:", e);
      }
    }, 500); // Debounce: wait 500ms after last change before saving

    return () => clearTimeout(saveTimer);
  }, [phase, half, halves, events, goalsFor, result, halfExtras, attrs, psoAttempts, psoSaves, wasSub, subReason, subMinute]);

  // ─── Load keepers
  useEffect(() => {
    const fetchKeepers = async () => {
      if (!user) return;

      if (isDelegate && delegateOf) {
        // Delegate: fetch only keepers they have pitchside access to
        const { data } = await supabase
          .from("keepers").select("*")
          .eq("coach_id", delegateOf.coach_id).eq("active", true)
          .in("id", delegateOf.pitchside_keepers)
          .order("created_at");
        if (data) setKeepers(data);
      } else {
        // Coach: fetch all their keepers
        const { data } = await supabase
          .from("keepers").select("*").eq("coach_id", user.id).eq("active", true).order("created_at");
        if (data) setKeepers(data);
      }
      setLoadingKeepers(false);
    };
    if (user) fetchKeepers();
  }, [user, isDelegate, delegateOf]);

  // ─── Helpers
  const hd = halves[half];
  const setH = (key, val) => {
    setHalves(prev => ({ ...prev, [half]: { ...prev[half], [key]: val } }));
    setLastSave(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  };
  const he = halfExtras[half];
  const setHE = (key, val) => {
    setHalfExtras(prev => ({ ...prev, [half]: { ...prev[half], [key]: val } }));
    setLastSave(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  };

  const selectedKeeper = keepers.find(k => k.id === selectedKeeperId);
  const activeKeeper = selectedKeeper?.name || "Keeper";
  const activeOpponent = opponent || (sessionType === "training" ? "Training" : "Opponent");

  // Derived stats
  const shotTypes = events.filter(e => e.type === "Shot" || e.type === "1v1" || e.type === "Penalty");
  const totalSOT = shotTypes.filter(e => !e.offTarget).length;
  const goalEvents = events.filter(e => e.isGoal);
  const totalGA = goalEvents.length;
  const totalSaves = totalSOT - totalGA;
  const svPct = totalSOT > 0 ? ((totalSaves / totalSOT) * 100).toFixed(1) : "—";

  // Reset event flow
  const resetEvt = () => {
    setEvtType(null); setEvtOrigin(null); setEvtAction(null);
    setEvtGoalZone(null); setEvtMethod(null); setEvtPosition(null);
    setEvtRank(null); setEvtIsGoal(false);
  };

  const getAvailableActions = () => {
    if (evtType === "Cross" || evtType === "Corner") return GK_ACTIONS_CROSS;
    if (evtType === "Penalty") return GK_ACTIONS_PENALTY;
    return GK_ACTIONS_SHOT;
  };

  const isGoalAction = (action) => action === "Goal" || action === "Goal";
  const isSaveAction = (action) => action && action !== "Missed/Misjudged" && !action.startsWith("Goal");
  const needsGoalZone = () => {
    if (!evtAction) return false;
    if (evtIsGoal) return true;
    if ((evtType === "Shot" || evtType === "1v1" || evtType === "Penalty") && (isSaveAction(evtAction) || evtAction === "Missed/Misjudged")) return true;
    return false;
  };
  const needsMethod = () => (evtType === "Shot" || evtType === "1v1" || evtType === "Penalty") || evtIsGoal;
  const isOffTarget = (zone) => OFF_TARGET_ZONES.includes(zone);

  // Log event
  const logEvent = () => {
    const goalZoneIsOff = isOffTarget(evtGoalZone);
    const evt = {
      type: evtType, origin: evtOrigin, gkAction: evtAction,
      goalZone: evtGoalZone || null, method: evtMethod || null,
      gkPosition: evtPosition || null, rank: evtRank || null,
      isGoal: evtIsGoal, offTarget: goalZoneIsOff && !evtIsGoal,
      half, keeper: activeKeeper, timestamp: new Date().toISOString(),
    };
    setEvents([...events, evt]);
    resetEvt();
    setLastSave(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  };

  const logOffTarget = () => {
    const evt = {
      type: "Shot", origin: evtOrigin, gkAction: null, goalZone: null, method: null,
      gkPosition: null, rank: null, isGoal: false, offTarget: true, half,
      keeper: activeKeeper, timestamp: new Date().toISOString(),
    };
    setEvents([...events, evt]);
    resetEvt();
    setLastSave(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  };

  // Undo last event
  const undoLastEvent = () => {
    if (events.length > 0) {
      setEvents(events.slice(0, -1));
      setLastSave(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    }
  };

  const canLog = () => {
    if (!evtType || !evtAction) return false;
    if (evtType !== "Corner" && evtType !== "Penalty" && !evtOrigin) return false;
    if (evtIsGoal && (!evtGoalZone || !evtMethod || !evtPosition || !evtRank)) return false;
    // For saves/misses with a zone selected, allow logging
    if (isSaveAction(evtAction) && evtGoalZone) return true;
    if (evtAction === "Missed/Misjudged" && evtGoalZone && !evtIsGoal) return true;
    if (evtIsGoal && evtGoalZone && evtMethod && evtPosition && evtRank) return true;
    // Cross/corner claims/punches without goal
    if ((evtType === "Cross" || evtType === "Corner") && evtAction && !evtIsGoal) return true;
    return false;
  };

  // ═══ SAVE TO SUPABASE ════════════════════════════════════════════════════
  const saveToDatabase = async () => {
    setPhase("saving");
    setSaveError("");

    try {
      const sumHE = (key) => ["H1", "H2", "ET"].reduce((s, hf) => s + (halfExtras[hf]?.[key] || 0), 0);
      const sumH = (key) => ["H1", "H2", "ET"].reduce((s, hf) => s + (halves[hf]?.[key] || 0), 0);

      const saveEvents = events.filter(e => isSaveAction(e.gkAction) && !e.isGoal && (e.type === "Shot" || e.type === "1v1" || e.type === "Penalty"));
      const countAction = (a) => saveEvents.filter(e => e.gkAction === a || e.gkAction?.startsWith(a)).length;

      const crossEvents = events.filter(e => e.type === "Cross" || e.type === "Corner");
      const crossClaimed = crossEvents.filter(e => e.gkAction === "Claim").length;
      const crossPunched = crossEvents.filter(e => e.gkAction === "Punched").length;
      const crossMissed = crossEvents.filter(e => e.gkAction === "Missed/Misjudged").length;

      const oneV1 = events.filter(e => e.type === "1v1");
      const oneV1Won = oneV1.filter(e => !e.isGoal).length;

      const errorsToGoal = events.filter(e => e.isGoal && e.gkAction === "Missed/Misjudged").length;
      const savePct = totalSOT > 0 ? totalSaves / totalSOT : 0;

      const allNotes = ["H1", "H2", "ET"]
        .map(hf => halves[hf]?.note ? `${hf}: ${halves[hf].note}` : null)
        .filter(Boolean).join("\n");

      const { data: matchData, error: matchError } = await supabase
        .from("matches")
        .insert({
          coach_id: isDelegate && delegateOf ? delegateOf.coach_id : user.id,
          keeper_id: selectedKeeperId,
          club_id: isDelegate && delegateOf ? delegateOf.club?.id : club.id,
          logged_by: user.id,
          logged_by_name: profile?.full_name || user.email,
          session_type: sessionType,
          opponent: sessionType === "training" ? null : opponent,
          venue: homeAway?.toLowerCase() || "home",
          match_date: matchDate,
          goals_for: goalsFor, goals_against: totalGA,
          result: sessionType === "training" ? null : result,
          shots_on_target: totalSOT, saves: totalSaves,
          goals_conceded: totalGA, save_percentage: savePct,
          saves_catch: countAction("Claim") + countAction("Save – Catch"),
          saves_parry: countAction("Parry") + countAction("Save – Parry"),
          saves_dive: countAction("Dive") + countAction("Save – Dive"),
          saves_block: countAction("Block"),
          saves_tip: countAction("Tip"),
          saves_punch: countAction("Punched"),
          crosses_claimed: crossClaimed, crosses_punched: crossPunched,
          crosses_missed: crossMissed, crosses_total: crossEvents.length,
          dist_gk_short_att: sumHE("dGkShort"), dist_gk_short_suc: sumHE("dGkShortOk"),
          dist_gk_long_att: sumHE("dGkLong"), dist_gk_long_suc: sumHE("dGkLongOk"),
          dist_throws_att: sumHE("dThrow"), dist_throws_suc: sumHE("dThrowOk"),
          dist_passes_att: sumHE("dPass"), dist_passes_suc: sumHE("dPassOk"),
          dist_under_pressure_att: sumHE("dPressure"), dist_under_pressure_suc: sumHE("dPressureOk"),
          one_v_one_faced: oneV1.length, one_v_one_won: oneV1Won,
          errors_leading_to_goal: errorsToGoal,
          sweeper_clearances: sumHE("swClear"), sweeper_interceptions: sumHE("swIntercept"),
          sweeper_tackles: sumHE("swTackle"),
          rebounds_controlled: sumH("rbControlled"), rebounds_dangerous: sumH("rbDangerous"),
          notes: allNotes || null,
          was_subbed: wasSub, sub_reason: subReason || null,
          sub_minute: subMinute ? parseInt(subMinute) : null,
        })
        .select().single();

      if (matchError) throw matchError;

      if (goalEvents.length > 0) {
        const goalRows = goalEvents.map(g => ({
          match_id: matchData.id, coach_id: isDelegate && delegateOf ? delegateOf.coach_id : user.id,
          goal_zone: g.goalZone || null, shot_origin: g.origin || null,
          goal_source: g.type === "Corner" ? "Corner" : g.type === "Penalty" ? "Penalty" : "Open Play",
          goal_rank: g.rank || null, shot_type: g.method || null,
          gk_positioning: g.gkPosition || null,
          half: g.half === "H1" ? 1 : g.half === "H2" ? 2 : null,
        }));
        const { error: goalsError } = await supabase.from("goals_conceded").insert(goalRows);
        if (goalsError) throw goalsError;
      }

      const attrKeys = {
        "Game Rating": "game_rating", "Shot Stopping": "shot_stopping",
        "Handling": "handling", "Positioning": "positioning",
        "Aerial Dominance": "aerial_dominance", "Distribution": "distribution",
        "Decision Making": "decision_making", "Sweeper Play": "sweeper_play",
        "Set Piece Org.": "set_piece_org", "Footwork & Agility": "footwork_agility",
        "Reaction Speed": "reaction_speed", "Communication": "communication",
        "Command of Box": "command_of_box", "Composure": "composure",
        "Compete Level": "compete_level",
      };
      const attrRow = { match_id: matchData.id, keeper_id: selectedKeeperId, coach_id: isDelegate && delegateOf ? delegateOf.coach_id : user.id };
      Object.entries(attrKeys).forEach(([label, col]) => { attrRow[col] = attrs[label] || null; });
      const { error: attrError } = await supabase.from("match_attributes").insert(attrRow);
      if (attrError) throw attrError;

      // Clear auto-save — data is safely in Supabase now
      try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) {}
      setPhase("saved");
    } catch (err) {
      console.error("Save error:", err);
      setSaveError(err.message || "Failed to save.");
      setPhase("attributes");
    }
  };

  const handleEndGame = () => setPhase("attributes");
  const handleAttrsComplete = () => saveToDatabase();
  const handleSubstitute = (reason) => { setSubReason(reason); setWasSub(true); setPhase("attributes"); };

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font }}>
            <button onClick={() => setDarkMode(!darkMode)} style={{
              position: "fixed", top: 16, right: 16, zIndex: 9999,
              background: t.card, border: "1px solid " + t.border, borderRadius: 8,
              padding: "6px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              color: t.text, fontSize: 12, fontWeight: 600, fontFamily: font,
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)"
            }}>
              {darkMode ? "☀️" : "🌙"} {darkMode ? "Light" : "Dark"}
            </button>
        <div style={{ color: t.dim }}>Loading...</div>
      </div>
    );
  }

  // ═══ RECOVERY MODAL ═══════════════════════════════════════════════════════
  if (showRecovery && recoveryData) {
    const savedAt = new Date(recoveryData._savedAt);
    const timeStr = savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const dateStr = savedAt.toLocaleDateString([], { month: "short", day: "numeric" });
    return (
      <div style={{ minHeight: "100vh", background: t.bg, fontFamily: font, color: t.text, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ background: t.card, borderRadius: 20, padding: 28, maxWidth: 400, width: "100%", border: `1px solid ${t.border}`, textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: t.gold + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 16px" }}>⚠️</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: t.bright, margin: "0 0 8px" }}>Unsaved Session Found</h2>
          <p style={{ fontSize: 13, color: t.dim, margin: "0 0 20px", lineHeight: 1.5 }}>
            {recoveryData._keeperName || "Keeper"} vs {recoveryData._opponent || "Unknown"}<br />
            Last saved {dateStr} at {timeStr}<br />
            {recoveryData.events?.length || 0} events recorded • {recoveryData.phase === "attributes" ? "At attribute ratings" : `In ${recoveryData.half || "H1"}`}
          </p>
          <button onClick={restoreSession} style={{
            width: "100%", padding: 16, borderRadius: 12, border: "none",
            background: t.accent, color: "#fff", fontSize: 15, fontWeight: 700,
            cursor: "pointer", fontFamily: font, marginBottom: 10, minHeight: 52,
          }}>Resume This Session</button>
          <button onClick={discardSession} style={{
            width: "100%", padding: 14, borderRadius: 12,
            border: `1px solid ${t.border}`, background: "transparent",
            color: t.dim, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, minHeight: 48,
          }}>Discard & Start Fresh</button>
        </div>
      </div>
    );
  }

  // ═══ SETUP PAGE ══════════════════════════════════════════════════════════

  if (phase === "setup") {
    const ready = selectedKeeperId && (sessionType === "training" || opponent.trim());
    return (
      <div style={{ minHeight: "100vh", background: t.bg, fontFamily: font, color: t.text }}>
        <div style={{ maxWidth: 520, margin: "0 auto", padding: "32px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
            <Link href="/dashboard" style={{ color: t.dim, textDecoration: "none", fontSize: 13, padding: "8px 0" }}>← Dashboard</Link>
            <span style={{ fontSize: 18, fontWeight: 700, color: t.bright }}>
              Stix<span style={{ color: t.accent }}>Analytix</span>
            </span>
          </div>

          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: `linear-gradient(135deg, ${club?.primary_color || t.accent}, ${club?.secondary_color || t.accentDim})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, margin: "0 auto 12px", boxShadow: `0 4px 20px ${t.accent}44` }}>⚽</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: t.bright, margin: 0 }}>New Session</h1>
            <p style={{ fontSize: 13, color: t.dim, marginTop: 4 }}>{club?.name || "Your Club"}</p>
          </div>

          {/* Delegate banner */}
          {isDelegate && delegateOf && (
            <div style={{
              padding: "10px 16px", borderRadius: 10, marginBottom: 12,
              background: t.cyan + "08", border: `1px solid ${t.cyan}22`,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ fontSize: 14 }}>📱</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: t.cyan }}>Logging for {delegateOf.coach_name}</div>
                <div style={{ fontSize: 10, color: t.dim }}>{delegateOf.club?.name || "Club"} · {delegateOf.pitchside_keepers?.length || 0} assigned keeper{delegateOf.pitchside_keepers?.length !== 1 ? "s" : ""}</div>
              </div>
            </div>
          )}

          {/* Session Type */}
          <div style={{ background: t.card, borderRadius: 14, padding: 16, border: `1px solid ${t.border}`, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: t.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Session Type</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Chip label="⚽ Match" selected={sessionType === "match"} onClick={() => setSessionType("match")} />
              <Chip label="🔶 Training" selected={sessionType === "training"} onClick={() => setSessionType("training")} />
            </div>
          </div>

          {/* Goalkeeper */}
          <div style={{ background: t.card, borderRadius: 14, padding: 16, border: `1px solid ${t.border}`, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: t.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Goalkeeper</div>
            {loadingKeepers ? (
              <div style={{ color: t.dim, fontSize: 13, padding: 10, textAlign: "center" }}>Loading roster...</div>
            ) : keepers.length === 0 ? (
              <div style={{ color: t.dim, fontSize: 13, padding: 10, textAlign: "center" }}>
                No keepers found. <Link href="/onboarding" style={{ color: t.accent }}>Add keepers first.</Link>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6 }}>
                {keepers.map(k => (
                  <button key={k.id} onClick={() => setSelectedKeeperId(k.id)} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "14px 14px",
                    borderRadius: 10, border: `1px solid ${selectedKeeperId === k.id ? (club?.primary_color || t.accent) : t.border}`,
                    background: selectedKeeperId === k.id ? (club?.primary_color || t.accent) + "18" : t.bg,
                    cursor: "pointer", width: "100%", textAlign: "left", minHeight: 56,
                  }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: `linear-gradient(135deg, ${club?.primary_color || t.accent}, ${club?.secondary_color || t.accentDim})`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 900, color: "#fff",
                    }}>#{k.number || "?"}</div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: selectedKeeperId === k.id ? t.bright : t.text }}>{k.name}</div>
                      <div style={{ fontSize: 11, color: t.dim }}>{k.role || "—"}</div>
                    </div>
                    {selectedKeeperId === k.id && (
                      <span style={{ marginLeft: "auto", color: club?.primary_color || t.accent, fontWeight: 700, fontSize: 16 }}>✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Opponent */}
          {sessionType === "match" && (
            <div style={{ background: t.card, borderRadius: 14, padding: 16, border: `1px solid ${t.border}`, marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: t.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Opponent</div>
              <input value={opponent} onChange={e => setOpponent(e.target.value)}
                placeholder="e.g. Ajax U19, Kelowna United"
                style={{ width: "100%", padding: "14px 16px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.bg, color: t.bright, fontSize: 15, fontFamily: font, outline: "none", boxSizing: "border-box" }}
                onFocus={e => e.target.style.borderColor = t.accent}
                onBlur={e => e.target.style.borderColor = t.border}
              />
            </div>
          )}

          {/* Home/Away + Date + Minutes */}
          <div style={{ display: "grid", gridTemplateColumns: sessionType === "match" ? "1fr 1fr" : "1fr 1fr", gap: 10, marginBottom: 12 }}>
            {sessionType === "match" && (
              <div style={{ background: t.card, borderRadius: 14, padding: 14, border: `1px solid ${t.border}` }}>
                <div style={{ fontSize: 11, color: t.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Venue</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {["Home", "Away"].map(ha => (
                    <Chip key={ha} label={ha} selected={homeAway === ha} onClick={() => setHomeAway(ha)} small />
                  ))}
                </div>
              </div>
            )}
            <div style={{ background: t.card, borderRadius: 14, padding: 14, border: `1px solid ${t.border}` }}>
              <div style={{ fontSize: 11, color: t.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Minutes Played</div>
              <input type="number" value={minutesPlayed} onChange={e => setMinutesPlayed(e.target.value)}
                placeholder="90" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.bright, fontSize: 14, fontFamily: font, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          <div style={{ background: t.card, borderRadius: 14, padding: 14, border: `1px solid ${t.border}`, marginBottom: 24 }}>
            <div style={{ fontSize: 11, color: t.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Date</div>
            <input type="date" value={matchDate} onChange={e => setMatchDate(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.bright, fontSize: 14, fontFamily: font, outline: "none", boxSizing: "border-box" }} />
          </div>

          <button onClick={() => { if (ready) setPhase("match"); }} disabled={!ready} style={{
            width: "100%", padding: 18, borderRadius: 12, border: "none",
            background: ready ? (club?.primary_color || t.accent) : t.border,
            color: ready ? "#fff" : t.dim,
            fontSize: 17, fontWeight: 800, cursor: ready ? "pointer" : "not-allowed",
            boxShadow: ready ? `0 4px 20px ${t.accent}44` : "none", fontFamily: font, minHeight: 56,
          }}>⚽ Start Tracking</button>
        </div>
      </div>
    );
  }

  // ═══ ATTRIBUTES PAGE ════════════════════════════════════════════════════

  if (phase === "attributes") {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, fontFamily: font, color: t.text }}>
        <div style={{ maxWidth: 520, margin: "0 auto", padding: "24px 16px" }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>⭐</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: t.bright, margin: "0 0 4px" }}>
              {subReason ? "Rate Outgoing Keeper" : "Post-Match Attributes"}
            </h2>
            <p style={{ fontSize: 13, color: t.dim }}>{subReason ? `${activeKeeper} — ${subReason}` : `Rate ${activeKeeper}'s performance`}</p>
          </div>

          <div style={{ background: t.gold + "11", border: `1px solid ${t.gold}33`, borderRadius: 8, padding: "8px 10px", marginBottom: 16, fontSize: 11, color: t.gold, lineHeight: 1.5 }}>
            📌 Your subjective coaching assessment — the &ldquo;how it looked&rdquo; layer that numbers alone can&rsquo;t capture.
          </div>

          {saveError && (
            <div style={{ background: "#ef444415", border: `1px solid ${t.red}30`, borderRadius: 8, padding: "10px 14px", marginBottom: 14, color: t.red, fontSize: 13 }}>{saveError}</div>
          )}

          <div style={{ background: t.card, borderRadius: 14, padding: 16, border: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 10, color: t.dim, marginBottom: 8 }}>{ATTRS.length} attributes, rated 1–5</div>
            {ATTRS.map(a => (
              <RatingRow key={a} label={a} value={attrs[a]} onChange={v => setAttrs({ ...attrs, [a]: v })} />
            ))}
          </div>

          <button onClick={handleAttrsComplete} style={{
            width: "100%", padding: 18, borderRadius: 12, border: "none", marginTop: 16,
            background: club?.primary_color || t.accent, color: "#fff",
            fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: font, minHeight: 56,
          }}>💾 Save {sessionType === "training" ? "Session" : "Match"}</button>

          <button onClick={handleAttrsComplete} style={{
            width: "100%", marginTop: 8, padding: 12, borderRadius: 8,
            background: "transparent", border: `1px solid ${t.border}`, color: t.dim,
            fontSize: 12, cursor: "pointer", fontFamily: font, minHeight: 44,
          }}>Skip ratings →</button>
        </div>
      </div>
    );
  }

  // ═══ SAVING SCREEN ═══════════════════════════════════════════════════════

  if (phase === "saving") {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, fontFamily: font, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💾</div>
          <div style={{ color: t.bright, fontSize: 18, fontWeight: 600 }}>Saving to cloud...</div>
        </div>
      </div>
    );
  }

  // ═══ SAVED CONFIRMATION ═══════════════════════════════════════════════════

  if (phase === "saved") {
    const totalDist = ["H1","H2","ET"].reduce((s, hf) => s + (halfExtras[hf]?.dGkShort || 0) + (halfExtras[hf]?.dGkLong || 0) + (halfExtras[hf]?.dThrow || 0) + (halfExtras[hf]?.dPass || 0), 0);
    const totalDistOk = ["H1","H2","ET"].reduce((s, hf) => s + (halfExtras[hf]?.dGkShortOk || 0) + (halfExtras[hf]?.dGkLongOk || 0) + (halfExtras[hf]?.dThrowOk || 0) + (halfExtras[hf]?.dPassOk || 0), 0);
    const distPct = totalDist > 0 ? ((totalDistOk / totalDist) * 100).toFixed(0) + "%" : "—";
    const crossEvts = events.filter(e => e.type === "Cross" || e.type === "Corner");
    const claims = crossEvts.filter(e => e.gkAction === "Claim").length;

    return (
      <div style={{ minHeight: "100vh", background: t.bg, fontFamily: font, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ fontSize: 56, marginBottom: 14 }}>✅</div>
        <h2 style={{ color: t.green, fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>
          {sessionType === "training" ? "Session Saved!" : "Match Saved!"}
        </h2>
        <p style={{ color: t.dim, fontSize: 13, textAlign: "center" }}>Stored in the cloud.</p>

        <div style={{ background: t.card, borderRadius: 12, padding: 16, marginTop: 20, width: "100%", maxWidth: 340, border: `1px solid ${t.border}` }}>
          {[
            sessionType === "match" ? ["Score", `${club?.name || "Us"} ${goalsFor} – ${totalGA} ${opponent}`, goalsFor > totalGA ? t.green : goalsFor < totalGA ? t.red : t.yellow] : null,
            ["Save %", `${totalSaves}/${totalSOT} — ${svPct}%`, null],
            sessionType === "match" ? ["Result", result || "—", result === "W" ? t.green : result === "D" ? t.yellow : t.red] : null,
            ["Events Logged", `${events.length}`, t.accent],
            ["Distribution", `${totalDistOk}/${totalDist} — ${distPct}`, null],
          ].filter(Boolean).map(([l, v, c]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
              <span style={{ color: t.dim }}>{l}</span>
              <span style={{ color: c || t.bright, fontWeight: 700 }}>{v}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          <button onClick={() => {
            try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) {}
            setPhase("setup"); setSelectedKeeperId(null); setOpponent("");
            setHalves({ "H1": emptyH(), "H2": emptyH(), "ET": emptyH() });
            setHalfExtras({ "H1": initHalfExtra(), "H2": initHalfExtra(), "ET": initHalfExtra() });
            setEvents([]); setGoalsFor(0); setAttrs({}); setResult(null);
            setHalf("H1"); setPsoAttempts(0); setPsoSaves(0); setShowPSO(false);
            setWasSub(false); setSubReason(null); setSubMinute(""); resetEvt();
            setSessionType("match"); setHomeAway(null); setMinutesPlayed("90");
            setMatchDate(new Date().toISOString().split("T")[0]);
          }} style={{
            padding: "14px 28px", borderRadius: 10, background: club?.primary_color || t.accent,
            color: "#fff", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: font, minHeight: 48,
          }}>New Session</button>
          <Link href="/dashboard" style={{
            padding: "14px 28px", borderRadius: 10, border: `1px solid ${t.border}`,
            background: "transparent", color: t.text, fontSize: 14, fontWeight: 600,
            textDecoration: "none", display: "flex", alignItems: "center",
          }}>Dashboard</Link>
        </div>
      </div>
    );
  }

  // ═══ MAIN MATCH TRACKING ══════════════════════════════════════════════════

  const distTotal = (he.dGkShort || 0) + (he.dGkLong || 0) + (he.dThrow || 0) + (he.dPass || 0);
  const sweeperTotal = (he.swClear || 0) + (he.swIntercept || 0) + (he.swTackle || 0);

  return (
    <div style={{ minHeight: "100vh", background: t.bg, fontFamily: font, color: t.text, paddingBottom: 40 }}>

      {/* ══ STICKY HEADER ══ */}
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: t.card, borderBottom: `1px solid ${t.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: `linear-gradient(135deg, ${club?.primary_color || t.accent}, ${club?.secondary_color || t.accentDim})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 900, color: "#fff",
            }}>⚽</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.bright }}>{activeKeeper}</div>
              <div style={{ fontSize: 10, color: t.dim }}>
                {sessionType === "training" ? "Training Session" : `${homeAway === "Home" ? "vs" : "@"} ${activeOpponent}`}
                {sessionType === "training" && (
                  <span style={{ marginLeft: 6, background: t.teal + "22", color: t.teal, padding: "1px 6px", borderRadius: 4, fontSize: 9, fontWeight: 600 }}>TRAINING</span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {autoSaveStatus === "saved" && <span style={{ fontSize: 9, color: t.accent, background: t.accent + "18", padding: "2px 6px", borderRadius: 4, transition: "opacity 0.5s" }}>💾 saved</span>}
            {lastSave && !autoSaveStatus && <span style={{ fontSize: 9, color: t.green, background: t.green + "18", padding: "2px 6px", borderRadius: 4 }}>✓ {lastSave}</span>}
            <button onClick={() => setShowSetup(true)} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 11, color: t.dim, cursor: "pointer", minHeight: 32 }}>⚙</button>
          </div>
        </div>

        {/* Score */}
        {sessionType === "match" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "8px 14px", borderTop: `1px solid ${t.border}22` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: t.dim, fontWeight: 600, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opponent?.slice(0, 12)}</span>
              <span style={{ fontSize: 24, fontWeight: 800, color: t.red }}>{totalGA}</span>
            </div>
            <span style={{ fontSize: 14, color: t.dim }}>–</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 24, fontWeight: 800, color: t.green }}>{goalsFor}</span>
              <span style={{ fontSize: 11, color: t.dim, fontWeight: 600, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{club?.name?.slice(0, 12) || "Us"}</span>
            </div>
            <div style={{ display: "flex", gap: 4, marginLeft: 6 }}>
              <button onClick={() => setGoalsFor(goalsFor + 1)} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${t.green}44`, background: t.green + "15", color: t.green, fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 40 }}>⚽+</button>
              {goalsFor > 0 && <button onClick={() => setGoalsFor(goalsFor - 1)} style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 13, cursor: "pointer", minHeight: 40 }}>−</button>}
            </div>
          </div>
        )}

        {/* Stat bar */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 0, padding: "6px 14px", borderTop: `1px solid ${t.border}22` }}>
          {[
            { l: "Shots", v: shotTypes.length },
            { l: "SOT", v: totalSOT },
            { l: "Saves", v: totalSaves, c: t.green },
            { l: "Sv%", v: svPct, c: svPct !== "—" && parseFloat(svPct) >= 85 ? t.green : svPct !== "—" && parseFloat(svPct) < 75 ? t.red : t.bright },
          ].map(m => (
            <div key={m.l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, color: t.dim, textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.5 }}>{m.l}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: m.c || t.bright }}>{m.v}</div>
            </div>
          ))}
        </div>

        {/* Half selector */}
        <div style={{ display: "flex", gap: 3, padding: "6px 14px 10px" }}>
          {HALVES.map(hf => {
            const hfGoals = events.filter(e => e.half === hf && e.isGoal).length;
            return (
              <button key={hf} onClick={() => { setHalf(hf); resetEvt(); }} style={{
                flex: 1, padding: "10px 0", borderRadius: 8, border: "none", cursor: "pointer",
                background: half === hf ? (club?.primary_color || t.accent) : t.bg,
                color: half === hf ? "#fff" : t.dim,
                fontSize: 13, fontWeight: half === hf ? 700 : 500, position: "relative", fontFamily: font, minHeight: 40,
              }}>
                {hf}
                {hfGoals > 0 && <span style={{ position: "absolute", top: -4, right: half === hf ? 6 : "calc(50% + 6px)", width: 15, height: 15, borderRadius: "50%", background: t.red, color: "#fff", fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{hfGoals}</span>}
              </button>
            );
          })}
          <button onClick={() => { setShowPSO(!showPSO); resetEvt(); }} style={{
            flex: 1, padding: "10px 0", borderRadius: 8, border: "none", cursor: "pointer",
            background: showPSO ? t.gold : t.bg, color: showPSO ? "#fff" : t.dim,
            fontSize: 13, fontWeight: showPSO ? 700 : 500, fontFamily: font, minHeight: 40,
          }}>PKs</button>
          {!showPSO && (
            <button onClick={() => setShowHalfSummary(half)} style={{
              padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.gold}44`,
              cursor: "pointer", background: t.gold + "11", color: t.gold, fontSize: 12, fontWeight: 700, minHeight: 40,
            }}>📋</button>
          )}
        </div>
      </div>

      {/* ══ CONTENT ══ */}
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "10px 12px" }}>

        {showPSO ? (
          <div style={{ background: t.card, border: `1px solid ${t.gold}44`, borderRadius: 12, padding: 16, marginBottom: 10 }}>
            <SectionHeader title="Penalty Shootout" icon="🎯" accentColor={t.gold} />
            <Counter label="Penalties Faced" value={psoAttempts} onChange={v => { setPsoAttempts(v); setLastSave(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })); }} />
            <Counter label="Saves" value={psoSaves} onChange={v => { setPsoSaves(v); setLastSave(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })); }} color={t.green} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", marginTop: 4, borderTop: `1px solid ${t.border}22` }}>
              <span style={{ fontSize: 13, color: t.dim }}>PK Save %</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: psoAttempts > 0 ? (psoSaves / psoAttempts >= 0.4 ? t.green : t.red) : t.dim }}>
                {psoAttempts > 0 ? ((psoSaves / psoAttempts) * 100).toFixed(1) + "%" : "—"}
              </span>
            </div>
          </div>
        ) : (
          <>
            {/* ═══ EVENT LOG ═══ */}
            <EventLog events={events} half={half} onUndo={undoLastEvent} />

            {/* ═══ EVENT LOGGING ═══ */}
            <div style={{ background: t.card, border: `1px solid ${(club?.primary_color || t.accent)}44`, borderRadius: 12, padding: "14px 14px", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 14 }}>🧤</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: t.bright }}>Log Event</span>
                {evtType && (
                  <button onClick={resetEvt} style={{ marginLeft: "auto", background: t.red + "22", border: "none", color: t.red, borderRadius: 8, padding: "6px 12px", fontSize: 11, cursor: "pointer", fontWeight: 600, fontFamily: font, minHeight: 36 }}>✕ Cancel</button>
                )}
              </div>

              {/* Event type — 5 buttons including Penalty */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 4, marginBottom: 10 }}>
                {EVENT_TYPES.map(et => (
                  <Chip key={et} label={et} selected={evtType === et} onClick={() => {
                    resetEvt(); setEvtType(et);
                    if (et === "Penalty") setEvtOrigin("penalty");
                  }} small color={evtType === et ? (club?.primary_color || t.accent) : undefined} />
                ))}
              </div>

              {/* Origin */}
              {evtType && !evtOrigin && evtType !== "Penalty" && (
                <div style={{ marginBottom: 10 }}>
                  {evtType === "Corner" ? (
                    <>
                      <div style={{ fontSize: 10, color: t.dim, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>Corner Side</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                        <Chip label="Left" selected={evtOrigin === "cornerL"} onClick={() => setEvtOrigin("cornerL")} />
                        <Chip label="Right" selected={evtOrigin === "cornerR"} onClick={() => setEvtOrigin("cornerR")} />
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 10, color: t.dim, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>Where did it come from?</div>
                      <PitchOriginMap selected={evtOrigin} onSelect={setEvtOrigin} />
                      {evtOrigin && <div style={{ textAlign: "center", marginTop: 6, fontSize: 11, fontWeight: 600, color: club?.primary_color || t.accent }}>✓ {SHOT_ORIGINS.find(o => o.id === evtOrigin)?.label}</div>}
                    </>
                  )}
                </div>
              )}

              {/* Off-target shortcut */}
              {evtType === "Shot" && evtOrigin && !evtAction && (
                <button onClick={logOffTarget} style={{
                  width: "100%", padding: "10px 0", borderRadius: 8, marginBottom: 8,
                  border: `1px solid ${t.dim}44`, background: "transparent", color: t.dim,
                  fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font, minHeight: 44,
                }}>Shot off target (no GK action)</button>
              )}

              {/* GK Action */}
              {evtType && evtOrigin && !evtAction && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: t.dim, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>GK Action</div>
                  <div style={{ display: "grid", gridTemplateColumns: evtType === "Penalty" ? "repeat(3, 1fr)" : "repeat(4, 1fr)", gap: 4 }}>
                    {getAvailableActions().map(a => (
                      <Chip key={a} label={a} selected={evtAction === a} small
                        color={a === "Missed/Misjudged" ? t.red : a === "Goal" ? t.red : (club?.primary_color || t.accent)}
                        onClick={() => {
                          setEvtAction(a);
                          if (a === "Goal") setEvtIsGoal(true);
                          if (a === "Missed/Misjudged" && (evtType === "Shot" || evtType === "1v1" || evtType === "Penalty")) {
                            setEvtIsGoal(true);
                          }
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Goal zone / shot aim — shows off-target zones too */}
              {evtAction && needsGoalZone() && !evtGoalZone && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: t.dim, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>
                    {evtIsGoal ? "Where did the ball go in?" : "Where was the shot aimed?"}
                  </div>
                  <GoalZoneMap selected={evtGoalZone} onSelect={(z) => {
                    setEvtGoalZone(z);
                    // If off-target and not a goal, it's done after zone
                    if (isOffTarget(z) && !evtIsGoal) {
                      // Will be logged when canLog triggers
                    }
                  }} showOffTarget={!evtIsGoal || evtAction === "Missed/Misjudged"} />
                </div>
              )}

              {/* Shot method */}
              {evtAction && evtGoalZone && !isOffTarget(evtGoalZone) && needsMethod() && evtIsGoal && !evtMethod && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: t.dim, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>How was it struck?</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
                    {SHOT_METHODS.map(m => (
                      <Chip key={m} label={m} selected={evtMethod === m} onClick={() => setEvtMethod(m)} small
                        color={m === "Own Goal" ? t.purple : undefined} />
                    ))}
                  </div>
                </div>
              )}

              {/* Position & Rank (goals only) */}
              {evtIsGoal && evtMethod && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, color: t.dim, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>GK Position</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {GK_POSITIONING.map(p => (
                        <Chip key={p} label={p} selected={evtPosition === p} onClick={() => setEvtPosition(p)} color={p === "Set" ? t.green : t.orange} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: t.dim, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>Rank</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {GOAL_RANKS.map(r => (
                        <Chip key={r} label={r} selected={evtRank === r} onClick={() => setEvtRank(r)}
                          color={r === "Saveable" ? t.red : r === "Difficult" ? t.yellow : t.green} />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Log button */}
              {canLog() && (
                <button onClick={logEvent} style={{
                  width: "100%", padding: 14, borderRadius: 10, border: "none",
                  background: evtIsGoal ? t.red : (club?.primary_color || t.accent),
                  color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: font, minHeight: 52,
                }}>
                  {evtIsGoal ? "🚨 Log Goal Conceded" : `✓ Log ${evtType}`}
                </button>
              )}
            </div>

            {/* ═══ REBOUNDS — ALWAYS VISIBLE ═══ */}
            <div style={{ background: t.card, border: `1px solid ${t.cyan}33`, borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
              <SectionHeader title="Rebounds" icon="🔄" accentColor={t.cyan} />
              <Counter label="Controlled to Safety" value={hd.rbControlled} onChange={v => setH("rbControlled", v)} compact color={t.green} />
              <Counter label="Dangerous (to opponent)" value={hd.rbDangerous} onChange={v => setH("rbDangerous", v)} compact color={t.red} />
            </div>

            {/* ═══ DISTRIBUTION — ALWAYS VISIBLE ═══ */}
            <div style={{ background: t.card, border: `1px solid ${t.gold}33`, borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
              <SectionHeader title="Distribution" icon="📤" accentColor={t.gold} />
              <div style={{ fontSize: 10, color: t.dim, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Goal Kicks</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <div>
                  <Counter label="Short" value={he.dGkShort} onChange={v => setHE("dGkShort", v)} compact />
                  <Counter label="↳ Successful" value={he.dGkShortOk} onChange={v => setHE("dGkShortOk", Math.min(v, he.dGkShort))} compact color={t.green} />
                </div>
                <div>
                  <Counter label="Long" value={he.dGkLong} onChange={v => setHE("dGkLong", v)} compact />
                  <Counter label="↳ Successful" value={he.dGkLongOk} onChange={v => setHE("dGkLongOk", Math.min(v, he.dGkLong))} compact color={t.green} />
                </div>
              </div>
              <div style={{ fontSize: 10, color: t.dim, fontWeight: 600, textTransform: "uppercase", marginBottom: 4, marginTop: 4 }}>Throws</div>
              <Counter label="Throws" value={he.dThrow} onChange={v => setHE("dThrow", v)} compact />
              <Counter label="↳ Successful" value={he.dThrowOk} onChange={v => setHE("dThrowOk", Math.min(v, he.dThrow))} compact color={t.green} />
              <div style={{ fontSize: 10, color: t.dim, fontWeight: 600, textTransform: "uppercase", marginBottom: 4, marginTop: 8 }}>Passes (Open Play)</div>
              <Counter label="Passes" value={he.dPass} onChange={v => setHE("dPass", v)} compact />
              <Counter label="↳ Successful" value={he.dPassOk} onChange={v => setHE("dPassOk", Math.min(v, he.dPass))} compact color={t.green} />
              <div style={{ marginTop: 8, paddingTop: 6, borderTop: `1px solid ${t.border}22` }}>
                <Counter label="Under Pressure" value={he.dPressure} onChange={v => setHE("dPressure", v)} compact color={t.orange} />
                <Counter label="↳ Successful" value={he.dPressureOk} onChange={v => setHE("dPressureOk", Math.min(v, he.dPressure))} compact color={t.green} />
              </div>
              {distTotal > 0 && (
                <div style={{ marginTop: 8, padding: "6px 10px", background: t.bg, borderRadius: 6, fontSize: 12, color: t.dim, display: "flex", justifyContent: "space-between" }}>
                  <span>Overall Accuracy</span>
                  <span style={{ fontWeight: 700, color: t.gold }}>
                    {(((he.dGkShortOk + he.dGkLongOk + he.dThrowOk + he.dPassOk) / distTotal) * 100).toFixed(0)}%
                  </span>
                </div>
              )}
            </div>

            {/* ═══ SWEEPER — ALWAYS VISIBLE ═══ */}
            <div style={{ background: t.card, border: `1px solid ${t.teal}33`, borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
              <SectionHeader title="Sweeper-Keeper" icon="🏃" accentColor={t.teal} />
              <Counter label="Clearances" value={he.swClear} onChange={v => setHE("swClear", v)} compact />
              <Counter label="Interceptions" value={he.swIntercept} onChange={v => setHE("swIntercept", v)} compact />
              <Counter label="Tackles" value={he.swTackle} onChange={v => setHE("swTackle", v)} compact />
            </div>

            {/* ═══ NOTES ═══ */}
            <div style={{ background: t.card, border: `1px solid ${t.gold}33`, borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
              <SectionHeader title={`${half} Notes`} icon="🗣️" accentColor={t.gold} />
              <textarea value={hd.note} onChange={e => setH("note", e.target.value)}
                placeholder="Tap to type or use voice-to-text…"
                style={{ width: "100%", minHeight: 70, padding: 12, borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 14, fontFamily: font, resize: "vertical", outline: "none", boxSizing: "border-box" }} />
              <div style={{ fontSize: 10, color: t.dim, marginTop: 4 }}>💡 Use your device&rsquo;s mic key for voice-to-text</div>
            </div>

            {/* ═══ SUBSTITUTE ═══ */}
            <div style={{ background: t.card, borderRadius: 12, padding: 14, border: `1px solid ${t.orange}33`, marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: t.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Substitute</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                {SUB_REASONS.map(r => (
                  <button key={r} onClick={() => handleSubstitute(r)} style={{
                    padding: "12px 6px", borderRadius: 8, border: `1px solid ${t.orange}33`,
                    background: t.orange + "08", color: t.orange, fontSize: 11, fontWeight: 600,
                    cursor: "pointer", lineHeight: 1.3, textAlign: "center", fontFamily: font, minHeight: 48,
                  }}>{r}</button>
                ))}
              </div>
            </div>

            {/* ═══ END MATCH ═══ */}
            <div style={{ background: t.card, borderRadius: 12, padding: 16, border: `1px solid ${t.border}`, marginTop: 8 }}>
              <div style={{ fontSize: 11, color: t.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                End {sessionType === "training" ? "Session" : "Match"}
              </div>
              {sessionType === "match" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5, marginBottom: 12 }}>
                  {["W", "D", "L"].map(r => (
                    <Chip key={r} label={r === "W" ? "Win" : r === "D" ? "Draw" : "Loss"}
                      selected={result === r} onClick={() => setResult(r)}
                      color={r === "W" ? t.green : r === "D" ? t.yellow : t.red} />
                  ))}
                </div>
              )}
              <button onClick={handleEndGame} disabled={sessionType === "match" && !result} style={{
                width: "100%", padding: 16, borderRadius: 10, border: "none",
                background: (sessionType === "training" || result) ? t.green : t.border,
                color: (sessionType === "training" || result) ? "#fff" : t.dim,
                fontSize: 16, fontWeight: 700, cursor: (sessionType === "training" || result) ? "pointer" : "not-allowed",
                fontFamily: font, minHeight: 52,
              }}>💾 Save {sessionType === "training" ? "Session" : "Match"}</button>
            </div>
          </>
        )}
      </div>

      {/* ══ MODALS ══ */}
      {showHalfSummary && (
        <HalfSummary half={showHalfSummary} events={events} halves={halves}
          goalsFor={goalsFor} clubName={club?.name} opponent={activeOpponent}
          onClose={() => setShowHalfSummary(null)} />
      )}

      {showSetup && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: t.card, borderRadius: 16, width: "100%", maxWidth: 380, padding: 20 }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700, color: t.bright }}>⚙ Session Setup</h3>
            <div style={{ fontSize: 13, color: t.dim, lineHeight: 2 }}>
              <div>Type: <strong style={{ color: t.bright }}>{sessionType === "training" ? "Training" : "Match"}</strong></div>
              <div>Goalkeeper: <strong style={{ color: t.bright }}>{activeKeeper}</strong></div>
              {sessionType === "match" && <div>Opponent: <strong style={{ color: t.bright }}>{opponent}</strong></div>}
              {sessionType === "match" && <div>Venue: <strong style={{ color: t.bright }}>{homeAway || "—"}</strong></div>}
              <div>Date: <strong style={{ color: t.bright }}>{matchDate}</strong></div>
              <div>Minutes: <strong style={{ color: t.bright }}>{minutesPlayed}</strong></div>
            </div>
            <button onClick={() => setShowSetup(false)} style={{ width: "100%", marginTop: 16, padding: 14, borderRadius: 10, background: club?.primary_color || t.accent, color: "#fff", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: font, minHeight: 48 }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}



