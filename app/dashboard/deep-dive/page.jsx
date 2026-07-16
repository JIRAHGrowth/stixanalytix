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
import GoalHeatmap from "@/components/dashboard/GoalHeatmap";
import PitchOriginMap from "@/components/dashboard/PitchOriginMap";
import KeeperModal from "@/components/dashboard/KeeperModal";
import EditMatchModal from "@/components/dashboard/EditMatchModal";
import DeleteMatchConfirm from "@/components/dashboard/DeleteMatchConfirm";
import EmptyState from "@/components/dashboard/EmptyState";
import ShotCrossRef from "@/components/dashboard/ShotCrossRef";
import SingleGameView from "@/components/dashboard/SingleGameView";
import {
  fetchActiveKeepers, fetchAnalyticsBundle, fetchReviewStatus,
  deleteMatchCascade,
  fetchNoteContent as fetchNoteContentQ,
  fetchRankingContent as fetchRankingContentQ,
} from "@/lib/queries";
import {
  pct, dec, computeZoneConversion, computeZoneConversionUnified,
  aggregateMatches, aggregateGoals, aggregateAttrs,
  aggregateQuarterly, buildMatchLog, genAlerts,
} from "@/lib/stats";


// Responsive breakpoints
function useBreakpoint() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => { const h = () => setW(window.innerWidth); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, []);
  return { isMobile: w < 768, isTablet: w >= 768 && w < 1024, isDesktop: w >= 1024, width: w };
}

import { tDark, tLight } from "@/lib/theme";
import {
  ATTR_KEYS, ATTR_LABELS, CORE_ATTRS,
  ZONE_LABELS, ORIGIN_LABELS, FONT,
} from "@/lib/constants";

let t = tDark;
const font = FONT;
const PAL = ["#10b981","#059669","#047857","#0d9668","#34d399","#6ee7b7","#0f766e","#15803d","#065f46","#a7f3d0"];
const ttS = { contentStyle: { background: t.card, border: `1px solid ${t.border}`, borderRadius: 8, fontSize: 10, color: t.text }, itemStyle: { color: t.text } };

const svC = v => v >= .800 ? t.green : v >= .700 ? t.accent : v >= .650 ? t.yellow : t.red;
const ratC = v => v >= 4.0 ? t.green : v >= 3.5 ? t.accent : v >= 3.0 ? t.yellow : t.red;

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
      display: "flex", alignItems: "center", justifyContent: "center", margin: "4px auto 0", gap: 2, padding: "2px 5px",
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

// GoalHeatmap — extracted to @/components/dashboard/GoalHeatmap.jsx

// PitchOriginMap — extracted to @/components/dashboard/PitchOriginMap.jsx

// KeeperModal — extracted to @/components/dashboard/KeeperModal.jsx
// EmptyState — extracted to @/components/dashboard/EmptyState.jsx

// ShotCrossRef — extracted to @/components/dashboard/ShotCrossRef.jsx
// SingleGameView — extracted to @/components/dashboard/SingleGameView.jsx


// ═══ REPORT VIEW ════════════════════════════════════════════════════════════
function ReportView({ keeper, keeperData, alerts, targetGame, primaryColor, onBack }) {
  const bp = useBreakpoint();
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
    Season: sA?.[k] ? sA[k] : null,
    "Last 5": l5A?.[k] ? l5A[k] : null,
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
    <div className="report-outer" style={{ background: "#0a0a0f", minHeight: "100vh", padding: "20px", fontFamily: font }}>
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
        <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr" : "1fr 1fr", gap: 20, marginBottom: 20 }}>
          {radarData.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Attribute Profile</div>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#ddd" />
                  <PolarAngleAxis dataKey="attr" tick={{ fontSize: 8, fill: "#555" }} />
                  <PolarRadiusAxis domain={[0, 5]} tick={{ fill: "#999", fontSize: 8 }} axisLine={false} />
                  <Radar name="Season" dataKey="Season" stroke={pc} fill={pc} fillOpacity={0.15} strokeWidth={2} />
                  <Radar name="Last 5" dataKey="Last 5" stroke={t.gold} fill={t.gold} fillOpacity={0.1} strokeWidth={2} strokeDasharray="4 2" />
                  <Legend wrapperStyle={{ fontSize: 10, color: "#555" }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Goals Conceded — Zone Map</div>
            <GoalHeatmap theme={t} zones={sG?.zones || {}} />
          </div>
        </div>

        {/* Distribution */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Distribution Accuracy</div>
          <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
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
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {["All", "Performance", "Technical", "Mental"].map(function(cat) {
                var count = cat === "All" ? alerts.length : alerts.filter(function(al) { return al.cat === cat; }).length;
                return <Chip key={cat} label={cat + " (" + count + ")"} selected={alertFilter === cat} onClick={function() { setAlertFilter(cat); }} />;
              })}
            </div>
            {alerts.slice(0, 5).map((al, i) => (
              <div key={i} style={{ padding: "8px 12px", borderRadius: 6, marginBottom: 6, background: al.type === "positive" ? "#f0fdf4" : al.type === "alert" ? "#fef2f2" : "#fff7ed", borderLeft: `3px solid ${al.type === "positive" ? t.green : al.type === "alert" ? "#ef4444" : "#f97316"}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: al.type === "positive" ? "#15803d" : al.type === "alert" ? "#dc2626" : "#c2410c" }}>{al.title}</div>
                <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>{al.detail} · {al.action}</div>
              </div>
            ))}
          </div>
        )}

        
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

        {/* Match log */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Recent Matches</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>
              <tr style={{ background: "#f5f5f7" }}>
                {["Date", "Opponent", "H/A", "Res", "Score", "SOT", "Sv", "GA", "Sv%"].map(h => (
                  <th key={h} style={{ padding: "6px 8px", textAlign: "center", color: "#666", fontWeight: 700, borderBottom: "1px solid #ddd" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {log.filter(m => m.type !== "training").slice(0, 25).map((m, i) => (
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

        {/* Training Sessions */}
        {log.filter(m => m.type === "training").length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Recent Training Sessions</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
              <thead>
                <tr style={{ background: "#f5f5f7" }}>
                  {["Date", "Focus / Notes", "SOT", "Sv", "GA", "Sv%"].map(h => (
                    <th key={h} style={{ padding: "6px 8px", textAlign: h === "Focus / Notes" ? "left" : "center", color: "#666", fontWeight: 700, borderBottom: "1px solid #ddd" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {log.filter(m => m.type === "training").slice(0, 25).map((m, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "5px 8px", color: "#555", textAlign: "center" }}>{m.date}</td>
                    <td style={{ padding: "5px 8px", fontWeight: 600, color: "#222" }}>{m.opp}</td>
                    <td style={{ padding: "5px 8px", textAlign: "center", color: "#555" }}>{m.sot}</td>
                    <td style={{ padding: "5px 8px", textAlign: "center", color: "#555" }}>{m.sv}</td>
                    <td style={{ padding: "5px 8px", textAlign: "center", color: m.ga > 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }}>{m.ga}</td>
                    <td style={{ padding: "5px 8px", textAlign: "center", fontWeight: 600, color: "#333" }}>{m.svP != null ? pct(m.svP) : "\u2013"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ position: "absolute", bottom: 24, left: 36, right: 36, borderTop: "1px solid #ddd", paddingTop: 10, display: "flex", justifyContent: "space-between", fontSize: 9, color: "#aaa" }}>
          <span>StixAnalytix · Goalkeeper Coaching Intelligence</span>
          <span>Page 2 of 2</span>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body, html { background: white !important; margin: 0 !important; padding: 0 !important; }
          .report-outer, .report-outer * { background: white !important; }
          .report-outer { padding: 0 !important; min-height: 0 !important; }
          .print-page {
            box-shadow: none !important;
            margin: 0 !important;
            padding: 24px 28px !important;
            width: 100% !important;
            min-height: auto !important;
            break-after: page;
            background: white !important;
          }
          .print-page:last-of-type { break-after: auto; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>
    </div>
  );
}

// EditMatchModal — extracted to @/components/dashboard/EditMatchModal.jsx
// DeleteMatchConfirm — extracted to @/components/dashboard/DeleteMatchConfirm.jsx

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

export default function DashboardPage() {
  const { user, profile, club, loading, signOut, supabase, isDelegate, delegateOf } = useAuth();
  const router = useRouter();

  const [darkMode, setDarkMode] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const bp = useBreakpoint();
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
  const [allShotEvents, setAllShotEvents] = useState([]);
  const [allDistEvents, setAllDistEvents] = useState([]);
  const [allSweeperEvents, setAllSweeperEvents] = useState([]);
  const [allOneVOneEvents, setAllOneVOneEvents] = useState([]);
  const [allCrossEvents, setAllCrossEvents] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const [editingMatch, setEditingMatch] = useState(null);
  const [deletingMatch, setDeletingMatch] = useState(null);
  const [notesStatus, setNotesStatus] = useState({}); const [rankingsStatus, setRankingsStatus] = useState({}); const [expandedNotes, setExpandedNotes] = useState(null); const [expandedRankings, setExpandedRankings] = useState(null); const [noteText, setNoteText] = useState(""); const [editingNoteId, setEditingNoteId] = useState(null); const [editingRankingId, setEditingRankingId] = useState(null); const [rankingValues, setRankingValues] = useState({}); const [submittingNote, setSubmittingNote] = useState(false); const [submittingRanking, setSubmittingRanking] = useState(false); const [notesData, setNotesData] = useState({}); const [rankingsData, setRankingsData] = useState({}); const rankingsEnabled = true;
  const [alertFilter, setAlertFilter] = useState("All");

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
    const coachId = isDelegate && delegateOf ? delegateOf.coach_id : user.id;
    const scopeToIds = isDelegate && delegateOf?.dashboard_access ? delegateOf.dashboard_keepers : null;
    const data = await fetchActiveKeepers(supabase, coachId, { scopeToIds });
    setKeepers(data);
    if (!selectedKeeper && data.length > 0) setSelectedKeeper(data[0].id);
    setLoadingKeepers(false);
  };

  const fetchAnalyticsData = async () => {
    if (!user) return;
    setLoadingData(true);
    const coachId = isDelegate && delegateOf ? delegateOf.coach_id : user.id;
    const {
      matches, goals, attrs, shotEvents,
      distEvents, sweeperEvents, oneVOneEvents, crossEvents,
    } = await fetchAnalyticsBundle(supabase, coachId);
    setAllMatches(matches);
    setAllGoals(goals);
    setAllAttrs(attrs);
    setAllShotEvents(shotEvents);
    setAllDistEvents(distEvents || []);
    setAllSweeperEvents(sweeperEvents || []);
    setAllOneVOneEvents(oneVOneEvents || []);
    setAllCrossEvents(crossEvents || []);
    const { notesStatus: nS, rankingsStatus: rS } = await fetchReviewStatus(supabase, coachId);
    setNotesStatus(nS);
    setRankingsStatus(rS);
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
      await deleteMatchCascade(supabase, deletingMatch.id);
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
    // A match can now have a substituted GK (matches.secondary_keeper_id).
    // Include those on the sub's profile too so H2 stats aren't invisible.
    const kMatches = allMatches.filter(m => m.keeper_id === selectedKeeper || m.secondary_keeper_id === selectedKeeper);
    const matchIds = new Set(kMatches.map(m => m.id));
    // goals_conceded now has per-event keeper_id so a shared match doesn't
    // leak one GK's conceded goal onto the other's profile.
    const kGoals = allGoals.filter(g => matchIds.has(g.match_id) && g.keeper_id === selectedKeeper);
    const kAttrs = allAttrs.filter(a => a.keeper_id === selectedKeeper);
    const kShotEvents    = allShotEvents.filter(se => se.keeper_id === selectedKeeper);
    const kDistEvents    = allDistEvents.filter(e => e.keeper_id === selectedKeeper);
    const kSweeperEvents = allSweeperEvents.filter(e => e.keeper_id === selectedKeeper);
    const kOneVOneEvents = allOneVOneEvents.filter(e => e.keeper_id === selectedKeeper);
    const kCrossEvents   = allCrossEvents.filter(e => e.keeper_id === selectedKeeper);
    const sorted = [...kMatches].sort((a, b) => new Date(b.match_date) - new Date(a.match_date));
    const last5 = sorted.slice(0, 5);
    const l5Ids = new Set(last5.map(m => m.id));
    const l5Goals = kGoals.filter(g => l5Ids.has(g.match_id));
    const l5ShotEvents    = kShotEvents.filter(e => l5Ids.has(e.match_id));
    const l5DistEvents    = kDistEvents.filter(e => l5Ids.has(e.match_id));
    const l5SweeperEvents = kSweeperEvents.filter(e => l5Ids.has(e.match_id));
    const l5OneVOneEvents = kOneVOneEvents.filter(e => l5Ids.has(e.match_id));
    const l5CrossEvents   = kCrossEvents.filter(e => l5Ids.has(e.match_id));

    // Attributes "last 5" used to be `kAttrs.filter(a => l5Ids.has(a.match_id))` —
    // i.e. attribute rows that happen to belong to the 5 most recent matches.
    // If the coach didn't complete the post-match rating screen for some of
    // those matches, the window silently shrank to 2 or 3 rows and the
    // average divided by that smaller count without telling anyone.
    // Now we take the 5 most recent matches that ACTUALLY HAVE attribute
    // rows. That matches the coach's mental model ("show me my last 5
    // ratings") and the bars/radar reflect a full 5-game window.
    const matchById = new Map(kMatches.map(m => [m.id, m]));
    const l5Attrs = [...kAttrs]
      .map(a => ({ attr: a, match: matchById.get(a.match_id) }))
      .filter(x => x.match)
      .sort((a, b) => new Date(b.match.match_date) - new Date(a.match.match_date))
      .slice(0, 5)
      .map(x => x.attr);
    // Season = event-driven per-keeper aggregate (fixes multi-keeper matches
    // showing combined totals for both GKs). Quarterly still uses match-column
    // mode because scoping events by quarter would double the memo work; the
    // deep-dive quarterly view isn't per-half-critical yet.
    const seasonEventOpts = { shotEvents: kShotEvents, distEvents: kDistEvents, sweeperEvents: kSweeperEvents, oneVOneEvents: kOneVOneEvents, crossEvents: kCrossEvents, goalsConceded: kGoals };
    const l5EventOpts     = { shotEvents: l5ShotEvents, distEvents: l5DistEvents, sweeperEvents: l5SweeperEvents, oneVOneEvents: l5OneVOneEvents, crossEvents: l5CrossEvents, goalsConceded: l5Goals };
    return {
      matches: kMatches,
      sorted,
      season: aggregateMatches(kMatches, seasonEventOpts),
      l5: aggregateMatches(last5, l5EventOpts),
      quarterly: aggregateQuarterly(kMatches),
      matchLog: buildMatchLog(kMatches, { shotEvents: kShotEvents, goalsConceded: kGoals }),
      seasonGoals: aggregateGoals(kGoals),
      l5Goals: aggregateGoals(l5Goals),
      sznAttrs: aggregateAttrs(kAttrs),
      l5Attrs: aggregateAttrs(l5Attrs),
      l5AttrsCount: l5Attrs.length,
      last5Matches: last5,
      rawGoals: kGoals,
      rawL5Goals: l5Goals,
      seasonShotEvents: kShotEvents,
      l5ShotEvents: l5ShotEvents,
    };
  }, [selectedKeeper, allMatches, allGoals, allAttrs, allShotEvents, allDistEvents, allSweeperEvents, allOneVOneEvents, allCrossEvents]);

  const cmpData = useMemo(() => {
    if (!cmpKeeper) return null;
    const kMatches = allMatches.filter(m => m.keeper_id === cmpKeeper || m.secondary_keeper_id === cmpKeeper);
    const matchIds = new Set(kMatches.map(m => m.id));
    const kGoals = allGoals.filter(g => matchIds.has(g.match_id) && g.keeper_id === cmpKeeper);
    const kAttrs = allAttrs.filter(a => a.keeper_id === cmpKeeper);
    const kShotEvents    = allShotEvents.filter(e => e.keeper_id === cmpKeeper);
    const kDistEvents    = allDistEvents.filter(e => e.keeper_id === cmpKeeper);
    const kSweeperEvents = allSweeperEvents.filter(e => e.keeper_id === cmpKeeper);
    const kOneVOneEvents = allOneVOneEvents.filter(e => e.keeper_id === cmpKeeper);
    const kCrossEvents   = allCrossEvents.filter(e => e.keeper_id === cmpKeeper);
    const season = aggregateMatches(kMatches, {
      shotEvents: kShotEvents, distEvents: kDistEvents,
      sweeperEvents: kSweeperEvents, oneVOneEvents: kOneVOneEvents,
      crossEvents: kCrossEvents,
      goalsConceded: kGoals,
    });
    return {
      season,
      seasonGoals: aggregateGoals(kGoals),
      sznAttrs: aggregateAttrs(kAttrs),
      oneV1: season?.oneV1,
      crosses: season?.crosses,
      sweeper: season?.sweeper,
      rebounds: season?.rebounds,
    };
  }, [cmpKeeper, allMatches, allGoals, allAttrs, allShotEvents, allDistEvents, allSweeperEvents, allOneVOneEvents, allCrossEvents]);

  const alerts = useMemo(() => {
    if (!keeperData?.season || !keeperData?.l5) return [];
    const kp = keepers.find(k => k.id === selectedKeeper);
    return genAlerts(kp?.name, keeperData.season, keeperData.l5,
      keeperData.seasonGoals, keeperData.l5Goals,
      keeperData.sznAttrs, keeperData.l5Attrs, keeperData.seasonShotEvents, keeperData.l5ShotEvents);
  }, [keeperData, selectedKeeper, keepers]);

  // ── NEW: drill-down & report helpers ──
  const openReport = (game = null) => {
    setReportGame(game);
    setReportMode(true);
  };

  // --- NOTES & RANKINGS HELPERS ---
  const NOTE_ATTR_LABELS = { game_rating: "Game Rating", shot_stopping: "Shot Stopping", handling: "Handling", positioning: "Positioning", aerial_dominance: "Aerial Dominance", distribution: "Distribution", decision_making: "Decision Making", sweeper_play: "Sweeper Play", set_piece_org: "Set Piece Org.", footwork_agility: "Footwork & Agility", reaction_speed: "Reaction Speed", communication: "Communication", command_of_box: "Command of Box", composure: "Composure", compete_level: "Compete Level" };
  const fetchNoteContent = async (mid) => { const r = await fetchNoteContentQ(supabase, mid, selectedKeeper); setNotesData(p => ({...p, [mid]: r})); };
  const fetchRankingContent = async (mid) => { const r = await fetchRankingContentQ(supabase, mid, selectedKeeper); setRankingsData(p => ({...p, [mid]: r})); };
  const submitNote = async (mid) => { const _nt = document.getElementById("notes-textarea-"+mid)?.value || ""; if (!_nt.trim()||submittingNote) return; setSubmittingNote(true); const cId=isDelegate?delegateOf.coach_id:user.id; const ar=isDelegate&&(delegateOf.role==="goalkeeper"||delegateOf.role==="gk_parent")?"keeper":"coach"; await supabase.from("match_notes").upsert({match_id:mid,coach_id:cId,keeper_id:selectedKeeper,author_id:user.id,author_role:ar,note_text:_nt.trim(),submitted_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:"match_id,keeper_id,author_role"}); setNotesStatus(p=>({...p,[mid]:{...(p[mid]||{}),[ar]:new Date().toISOString()}})); await fetchNoteContent(mid); const _ta=document.getElementById("notes-textarea-"+mid); if(_ta) _ta.value=""; setEditingNoteId(null); setSubmittingNote(false); };
  const submitRanking = async (mid) => { if (submittingRanking) return; setSubmittingRanking(true); const cId=isDelegate?delegateOf.coach_id:user.id; const ar=isDelegate&&(delegateOf.role==="goalkeeper"||delegateOf.role==="gk_parent")?"keeper":"coach"; await supabase.from("match_rankings").upsert({match_id:mid,coach_id:cId,keeper_id:selectedKeeper,author_id:user.id,author_role:ar,submitted_at:new Date().toISOString(),updated_at:new Date().toISOString(),...rankingValues},{onConflict:"match_id,keeper_id,author_role"}); setRankingsStatus(p=>({...p,[mid]:{...(p[mid]||{}),[ar]:new Date().toISOString()}})); await fetchRankingContent(mid); setRankingValues({}); setEditingRankingId(null); setSubmittingRanking(false); };
  const getIconState = (so,mid) => { if(!so[mid]) return "pending"; if(so[mid].coach&&so[mid].keeper) return "both-done"; if(so[mid].coach) return "coach-done"; if(so[mid].keeper) return "keeper-done"; return "pending"; };
  const canEdit = (ts) => ts&&(Date.now()-new Date(ts).getTime())<86400000;
  const isAutoReleased = (ts,o) => !o&&ts&&(Date.now()-new Date(ts).getTime())>259200000;
  const isKeeperUnder18 = () => { const k = keepers.find(x => x.id === selectedKeeper); if (!k || !k.date_of_birth) return false; return (Date.now() - new Date(k.date_of_birth).getTime()) / (365.25*24*60*60*1000) < 18; };
  const toggleNotes = async (mid) => { if(expandedNotes===mid){setExpandedNotes(null);return;} setExpandedNotes(mid);setExpandedRankings(null); await fetchNoteContent(mid); };
  const toggleRankings = async (mid) => { if(!rankingsEnabled) return; if(expandedRankings===mid){setExpandedRankings(null);return;} setExpandedRankings(mid);setExpandedNotes(null); await fetchRankingContent(mid); };
  const StatusIcon = ({state,onClick}) => { const st={pending:{bg:"transparent",border:t.border,color:t.dim,icon:"○"},"coach-done":{bg:t.accent+"18",border:t.accent,color:t.accent,icon:"✓"},"keeper-done":{bg:t.dim+"18",border:t.dim,color:t.dim,icon:"✓"},"both-done":{bg:t.green+"18",border:t.green,color:t.green,icon:"✓"},"rankings-off":{bg:t.bg,border:t.border,color:t.dim,icon:"—"}}[state]||{bg:"transparent",border:t.border,color:t.dim,icon:"○"}; return (<button onClick={onClick} style={{width:26,height:26,borderRadius:6,border:"1.5px solid "+st.border,background:st.bg,color:st.color,fontSize:12,fontWeight:700,cursor:state==="rankings-off"?"default":"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>{st.icon}</button>); };
  const NotesPanel = ({matchId,matchLabel}) => { const myR=(isDelegate&&(delegateOf.role==="goalkeeper"||delegateOf.role==="gk_parent"))?"keeper":"coach"; const oR=myR==="coach"?"keeper":"coach"; const nd=notesData[matchId]||{}; const ns=notesStatus[matchId]||{}; const bd=!!ns.coach&&!!ns.keeper; const md=!!ns[myR]; const mn=nd[myR]; const rel=mn&&isAutoReleased(mn.submitted_at,ns[oR]); const ul=bd||rel; return (<tr><td colSpan={13} style={{padding:0}}><div style={{background:t.card,border:"1px solid "+t.border,borderRadius:12,padding:20,margin:"4px 0 8px"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={{fontSize:14,fontWeight:700,color:t.bright}}>{matchLabel} - Notes</div><button onClick={()=>setExpandedNotes(null)} style={{background:"none",border:"none",color:t.dim,cursor:"pointer",fontSize:18}}>{String.fromCharCode(10005)}</button></div><div style={{display:"flex",gap:8,marginBottom:16}}><span style={{padding:"2px 10px",borderRadius:12,fontSize:11,fontWeight:600,background:ns.coach?t.accent+"22":t.border,color:ns.coach?t.accent:t.dim}}>Coach {ns.coach?"✓":"○"}</span><span style={{padding:"2px 10px",borderRadius:12,fontSize:11,fontWeight:600,background:ns.keeper?t.accent+"22":t.border,color:ns.keeper?t.accent:t.dim}}>Keeper {ns.keeper?"✓":"○"}</span></div>{ul?(<div><div style={{padding:"8px 12px",borderRadius:8,background:t.green+"12",border:"1px solid "+t.green+"33",color:t.green,fontSize:12,marginBottom:16}}>{rel?"Auto-released (3 day timeout)":"Both submitted — notes unlocked"}</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>{["coach","keeper"].map(role=>{const n=nd[role];return n?(<div key={role} style={{background:t.bg,borderRadius:8,padding:12}}><div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}><span style={{width:24,height:24,borderRadius:12,background:t.accent,color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700}}>{role[0].toUpperCase()}</span><span style={{fontSize:12,fontWeight:600,color:t.text}}>{role==="coach"?"Coach":"Keeper"}</span><span style={{fontSize:10,color:t.dim,marginLeft:"auto"}}>{new Date(n.submitted_at).toLocaleDateString()}</span></div><div style={{fontSize:13,color:t.text,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{n.note_text}</div>{role===myR&&canEdit(n.submitted_at)&&<button onClick={()=>{const _ta=document.getElementById("notes-textarea-"+matchId); if(_ta) _ta.value=n.note_text;}} style={{marginTop:8,background:"none",border:"1px solid "+t.border,color:t.dim,borderRadius:6,padding:"4px 12px",fontSize:11,cursor:"pointer"}}>Edit</button>}</div>):<div key={role} style={{background:t.bg,borderRadius:8,padding:12,color:t.dim,fontSize:12}}>Awaiting {role}...</div>;})}</div></div>):(md && editingNoteId !== matchId)?(<div><div style={{background:t.bg,borderRadius:8,padding:12,marginBottom:12}}><div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}><span style={{width:24,height:24,borderRadius:12,background:t.accent,color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700}}>C</span><span style={{fontSize:12,fontWeight:600,color:t.text}}>Coach</span><span style={{fontSize:10,color:t.dim,marginLeft:"auto"}}>{nd[myR] && new Date(nd[myR].submitted_at).toLocaleDateString()}</span></div><div style={{fontSize:13,color:t.text,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{nd[myR] && nd[myR].note_text}</div>{nd[myR] && canEdit(nd[myR].submitted_at) && <button onClick={()=>{setEditingNoteId(matchId);setTimeout(()=>{const ta=document.getElementById("notes-textarea-"+matchId);if(ta)ta.value=nd[myR].note_text;},100);}} style={{marginTop:8,background:"none",border:"1px solid "+t.border,color:t.dim,borderRadius:6,padding:"4px 12px",fontSize:11,cursor:"pointer"}}>Edit</button>}</div>{!isKeeperUnder18() && <div style={{padding:"10px 14px",borderRadius:8,background:t.accent+"12",border:"1px solid "+t.accent+"33",color:t.accent,fontSize:12,textAlign:"center"}}>Waiting for keeper to submit. Auto-releases in 3 days.</div>}{isKeeperUnder18() && <div style={{padding:"10px 14px",borderRadius:8,background:t.gold+"12",border:"1px solid "+t.gold+"33",color:t.gold,fontSize:12}}>Coach notes only. This keeper is under 18.</div>}</div>):(<div><textarea id={"notes-textarea-"+matchId} defaultValue={noteText} placeholder="Write your notes for this match..." style={{width:"100%",minHeight:120,background:t.bg,border:"1px solid "+t.border,borderRadius:8,color:t.text,padding:12,fontSize:13,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/><button onClick={()=>submitNote(matchId)} disabled={submittingNote} style={{width:"100%",marginTop:8,padding:"10px 0",background:t.accent,color:"white",border:"none",borderRadius:8,fontWeight:700,fontSize:14,cursor:"pointer",opacity:submittingNote?0.5:1}}>{submittingNote?"Submitting...":"Submit Notes"}</button><div style={{marginTop:10,padding:"8px 12px",borderRadius:8,background:t.gold+"12",border:"1px solid "+t.gold+"33",color:t.gold,fontSize:11}}>{isKeeperUnder18() ? "Coach notes only — keeper is under 18." : "Notes are hidden until both parties submit. Auto-releases after 3 days."}</div></div>)}</div></td></tr>); };
  const RankingsPanel = ({matchId,matchLabel}) => { const myR=(isDelegate&&(delegateOf.role==="goalkeeper"||delegateOf.role==="gk_parent"))?"keeper":"coach"; const oR=myR==="coach"?"keeper":"coach"; const rd=rankingsData[matchId]||{}; const rs=rankingsStatus[matchId]||{}; const bd=!!rs.coach&&!!rs.keeper; const md=!!rs[myR]; const mr=rd[myR]; const rel=mr&&isAutoReleased(mr.submitted_at,rs[oR]); const ul=bd||rel; const ak=Object.keys(NOTE_ATTR_LABELS); return (<tr><td colSpan={13} style={{padding:0}}><div style={{background:t.card,border:"1px solid "+t.border,borderRadius:12,padding:20,margin:"4px 0 8px"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={{fontSize:14,fontWeight:700,color:t.bright}}>{matchLabel} - Rankings</div><button onClick={()=>setExpandedRankings(null)} style={{background:"none",border:"none",color:t.dim,cursor:"pointer",fontSize:18}}>{String.fromCharCode(10005)}</button></div><div style={{display:"flex",gap:8,marginBottom:16}}><span style={{padding:"2px 10px",borderRadius:12,fontSize:11,fontWeight:600,background:rs.coach?t.accent+"22":t.border,color:rs.coach?t.accent:t.dim}}>Coach {rs.coach?"✓":"○"}</span><span style={{padding:"2px 10px",borderRadius:12,fontSize:11,fontWeight:600,background:rs.keeper?t.accent+"22":t.border,color:rs.keeper?t.accent:t.dim}}>Keeper {rs.keeper?"✓":"○"}</span></div>{ul?(()=>{const cR=rd.coach||{};const kR=rd.keeper||{};const diffs=ak.map(k=>({key:k,label:NOTE_ATTR_LABELS[k],c:Number(cR[k]||0),k:Number(kR[k]||0),d:Math.abs(Number(cR[k]||0)-Number(kR[k]||0))}));const t3=[...diffs].sort((a,b)=>b.d-a.d).slice(0,3).map(x=>x.key);const gaps=[...diffs].sort((a,b)=>b.d-a.d).filter(x=>x.d>0).slice(0,3);return(<div><div style={{padding:"8px 12px",borderRadius:8,background:t.green+"12",border:"1px solid "+t.green+"33",color:t.green,fontSize:12,marginBottom:16}}>{rel?"Auto-released":"Both submitted — rankings unlocked"}</div><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr>{["Attribute","Coach","Keeper","Gap"].map(h=><th key={h} style={{textAlign:h==="Attribute"?"left":"center",padding:"6px 8px",color:t.dim,borderBottom:"1px solid "+t.border}}>{h}</th>)}</tr></thead><tbody>{diffs.map(d=>(<tr key={d.key} style={{borderLeft:t3.includes(d.key)?"3px solid "+t.gold:"3px solid transparent"}}><td style={{padding:"6px 8px",color:t.text}}>{d.label}</td><td style={{padding:"6px 8px",textAlign:"center",fontWeight:600,color:t.text}}>{d.c.toFixed(1)}</td><td style={{padding:"6px 8px",textAlign:"center",fontWeight:600,color:t.text}}>{d.k.toFixed(1)}</td><td style={{padding:"6px 8px",textAlign:"center",fontWeight:700,color:d.d<=0.5?t.green:d.d<=1?t.yellow:t.red}}>{d.d.toFixed(1)}</td></tr>))}</tbody></table>{gaps.length>0&&<div style={{marginTop:12,padding:"8px 12px",borderRadius:8,background:t.gold+"12",border:"1px solid "+t.gold+"33",color:t.gold,fontSize:11}}>Largest gaps: {gaps.map(g=>g.label+" ("+g.c.toFixed(1)+" vs "+g.k.toFixed(1)+")").join(", ")}.</div>}</div>);})():md && editingRankingId !== matchId?(<div><div style={{background:t.bg,borderRadius:8,padding:12,marginBottom:12}}><div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}><span style={{width:24,height:24,borderRadius:12,background:t.accent,color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700}}>C</span><span style={{fontSize:12,fontWeight:600,color:t.text}}>Your Rankings</span></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>{Object.keys(NOTE_ATTR_LABELS).map(k=>rd[myR]&&rd[myR][k]?<div key={k} style={{fontSize:11,color:t.text,padding:"3px 6px",background:t.cardAlt,borderRadius:4}}>{NOTE_ATTR_LABELS[k]}: <span style={{fontWeight:700,color:Number(rd[myR][k])>=4?t.green:Number(rd[myR][k])>=3?t.accent:t.yellow}}>{Number(rd[myR][k]).toFixed(1)}</span></div>:null)}</div></div>{canEdit(rs[myR]) && <button onClick={()=>{const existing=rd[myR]||{}; const vals={}; Object.keys(NOTE_ATTR_LABELS).forEach(k=>{if(existing[k])vals[k]=Number(existing[k]);}); setRankingValues(vals); setEditingRankingId(matchId);}} style={{width:"100%",marginTop:8,background:"none",border:"1px solid "+t.border,color:t.dim,borderRadius:6,padding:"6px 12px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Edit Rankings</button>}{!isKeeperUnder18() && <div style={{padding:"10px 14px",borderRadius:8,background:t.accent+"12",border:"1px solid "+t.accent+"33",color:t.accent,fontSize:12,textAlign:"center"}}>Waiting for keeper to submit. Auto-releases in 3 days.</div>}</div>):(<div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>{ak.map(k=>(<div key={k} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 10px",background:t.bg,borderRadius:6}}><span style={{fontSize:12,color:t.text,minWidth:110,flexShrink:0}}>{NOTE_ATTR_LABELS[k]}</span><input type="range" min={1} max={5} step={0.5} value={rankingValues[k]||0} onChange={e=>setRankingValues(p=>({...p,[k]:parseFloat(e.target.value)}))} style={{flex:1,accentColor:t.accent,height:6,cursor:"pointer"}} /><span style={{fontSize:13,fontWeight:700,color:rankingValues[k]?(rankingValues[k]>=4?t.green:rankingValues[k]>=3?t.accent:rankingValues[k]>=2?t.yellow:t.red):t.dim,minWidth:28,textAlign:"center"}}>{rankingValues[k]||"—"}</span></div>))}</div><button onClick={()=>submitRanking(matchId)} disabled={submittingRanking||Object.keys(rankingValues).length<15} style={{width:"100%",marginTop:12,padding:"10px 0",background:t.accent,color:"white",border:"none",borderRadius:8,fontWeight:700,fontSize:14,cursor:"pointer",opacity:submittingRanking||Object.keys(rankingValues).length<15?0.5:1}}>{submittingRanking?"Submitting...":"Submit Rankings ("+Object.keys(rankingValues).length+"/15)"}</button><div style={{marginTop:10,padding:"8px 12px",borderRadius:8,background:t.gold+"12",border:"1px solid "+t.gold+"33",color:t.gold,fontSize:11}}>{isKeeperUnder18() ? "Coach rankings only. This keeper is under 18." : "Rankings hidden until both submit. Auto-releases after 3 days."}</div></div>)}</div></td></tr>); };
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
  const scopeTabs = ["overview", "goals", "distribution", "crosses", "sweeper", "attributes"];
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: bp.isMobile ? "8px 12px" : "12px 20px", borderBottom: `1px solid ${t.border}`, maxWidth: bp.isMobile ? "100%" : 960, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Link href="/dashboard" style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
            <img src={darkMode ? "/logo.svg" : "/logo-light.svg"} alt="StixAnalytix" style={{ height: 36 }} />
          </Link>
          <Link href="/dashboard" style={{ fontSize: 11, color: t.dim, textDecoration: "none", letterSpacing: 0.4, fontFamily: font }}>
            ← Back to dashboard
          </Link>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!isDelegate && (
            selectedKeeper ? (
              <Link href={`/upload?keeper=${selectedKeeper}`} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 12, textDecoration: "none", fontFamily: font, display: "flex", alignItems: "center", gap: 4 }}>📤 Upload</Link>
            ) : (
              <span title="Select a keeper first" style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${t.border}`, background: "transparent", color: t.dim + "88", fontSize: 12, fontFamily: font, display: "flex", alignItems: "center", gap: 4, cursor: "not-allowed" }}>📤 Upload</span>
            )
          )}
          <Link href="/pitchside" style={{ padding: "8px 14px", borderRadius: 8, background: primaryColor, color: "#fff", fontSize: 12, fontWeight: 600, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>📱 Pitchside</Link>
          <button onClick={() => setView(view === "analytics" ? "roster" : "analytics")} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 12, fontFamily: font, cursor: "pointer" }}>{view === "analytics" ? "👥 Roster" : "📊 Analytics"}</button>
          {!isDelegate && <Link href="/staff" style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 12, textDecoration: "none", fontFamily: font, display: "flex", alignItems: "center", gap: 4 }}>👥 Staff</Link>}
          <button onClick={signOut} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 12, fontFamily: font, cursor: "pointer" }}>Sign Out</button><div style={{ position: "relative", display: "inline-block" }}><button onClick={() => setShowSettings(!showSettings)} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid " + t.border, background: "transparent", color: t.dim, fontSize: 14, fontFamily: font, cursor: "pointer" }}>⚙</button>{showSettings && <div onClick={() => setShowSettings(false)} style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, background: t.card, border: "1px solid " + t.border, borderRadius: 8, padding: 8, zIndex: 100, minWidth: 160, boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}><button onClick={() => { setDarkMode(!darkMode); setShowSettings(false); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", background: "none", border: "none", color: t.text, fontSize: 13, fontFamily: font, cursor: "pointer", borderRadius: 6 }}>{darkMode ? "☀️ Light Mode" : "🌙 Dark Mode"}</button></div>}</div>
        </div>
      </div>

      <div style={{ maxWidth: bp.isMobile ? "100%" : 960, margin: "0 auto", padding: "20px 16px" }}>

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
                  const kMatches = allMatches.filter(m => m.keeper_id === k.id || m.secondary_keeper_id === k.id);
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
            

            {!selectedKeeper && keepers.length === 0 && (
              <Card s={{ textAlign: "center", padding: 32 }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🧤</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: t.bright, marginBottom: 6 }}>Welcome to StixAnalytix</div>
                <div style={{ fontSize: 13, color: t.dim, lineHeight: 1.55, maxWidth: 420, margin: "0 auto 18px" }}>
                  Add your first goalkeeper, then log a match or upload video to see analytics here.
                </div>
                <button onClick={() => setView("roster")} style={{ padding: "10px 20px", borderRadius: 8, background: primaryColor, color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: font }}>+ Add your first goalkeeper</button>
              </Card>
            )}
            {!selectedKeeper && keepers.length > 0 && (
              <EmptyState theme={t} icon="👆" title="Select a Keeper" subtitle="Choose a goalkeeper from the dropdown to view analytics." />
            )}
            {selectedKeeper && !hasMatches && tab !== "compare" && (
              <Card s={{ textAlign: "center", padding: 32 }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>📊</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: t.bright, marginBottom: 6 }}>
                  No matches yet for {selectedKeeperObj?.name || "this keeper"}
                </div>
                <div style={{ fontSize: 13, color: t.dim, lineHeight: 1.55, maxWidth: 460, margin: "0 auto 18px" }}>
                  Log your first session in Pitchside, or upload a match video and let Gemini auto-tag it. Either path lands the data right here for analysis.
                </div>
                <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                  <Link href="/pitchside" style={{ padding: "10px 18px", borderRadius: 8, background: primaryColor, color: "#fff", border: "none", fontSize: 13, fontWeight: 700, textDecoration: "none", fontFamily: font }}>📱 Log a match in Pitchside</Link>
                  {!isDelegate && (
                    <Link href={`/upload?keeper=${selectedKeeper}`} style={{ padding: "10px 18px", borderRadius: 8, background: "transparent", border: `1px solid ${t.border}`, color: t.text, fontSize: 13, fontWeight: 600, textDecoration: "none", fontFamily: font }}>📤 Upload match video</Link>
                  )}
                </div>
              </Card>
            )}

{/* OVERVIEW */}
          {tab === "overview" && s && hasMatches && (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

              {/* Row 0: Key Stats */}
              <div>
              {/* Row 1: Simple stats */}
              <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "repeat(3, 1fr)" : "repeat(5, 1fr)", gap: 8, marginBottom: bp.isMobile ? 8 : 0 }}>
                <StatBox label="GP" value={s.gp} />
                {!bp.isMobile && <div><StatBox label="Save %" value={(s.svPct * 100).toFixed(1) + "%"} color={s.svPct >= 0.7 ? t.green : s.svPct >= 0.65 ? t.yellow : t.red} /><TrendBadge cur={d.l5 ? d.l5.svPct : null} prev={d.season ? d.season.svPct : null} suf="%" /></div>}
                {!bp.isMobile && <div><StatBox label="GAA" value={s.gaa.toFixed(2)} color={s.gaa < 1.5 ? t.green : s.gaa < 2.5 ? t.yellow : t.red} /><TrendBadge cur={d.l5 ? d.l5.gaa : null} prev={d.season ? d.season.gaa : null} inv suf="" /></div>}
                <StatBox label="CS" value={s.cs} />
                <StatBox label="W-D-L" value={s.w + "-" + s.d + "-" + s.l} />
              </div>
              {/* Row 2: Stats with trend badges (mobile only) */}
              {bp.isMobile && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div><StatBox label="Save %" value={(s.svPct * 100).toFixed(1) + "%"} color={s.svPct >= 0.7 ? t.green : s.svPct >= 0.65 ? t.yellow : t.red} /><TrendBadge cur={d.l5 ? d.l5.svPct : null} prev={d.season ? d.season.svPct : null} suf="%" /></div>
                <div><StatBox label="GAA" value={s.gaa.toFixed(2)} color={s.gaa < 1.5 ? t.green : s.gaa < 2.5 ? t.yellow : t.red} /><TrendBadge cur={d.l5 ? d.l5.gaa : null} prev={d.season ? d.season.gaa : null} inv suf="" /></div>
              </div>}
            </div>

              {/* Row 1: Goals In + Goals From */}
              <Sec title="Goals Conceded">
                <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                  <Card>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12 }}>Where Goals Went In</div>
                    <GoalHeatmap theme={t} zones={dGoals ? dGoals.zones : {}} />
                  </Card>
                  <Card>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12 }}>Where Goals Came From</div>
                    <PitchOriginMap theme={t} origins={dGoals ? dGoals.origins : {}} />
                  </Card>
                </div>
              </Sec>

              {/* Row 2: Shot Stopping */}
              <Sec title="Shot Stopping">
                <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
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
                        <div style={{ fontSize: 12, fontWeight: 700, color: t.text, width: 28, textAlign: "right" }}>{count}<span style={{ fontSize: 9, color: t.dim, marginLeft: 4 }}>({(s.saves > 0 ? (count / s.saves * 100).toFixed(0) : 0)}%)</span></div>
                      </div>
                    ))}
                  </Card>
                </div>
              </Sec>

              {/* Row 3: Savability + Shot Type & Positioning */}
              <Sec title="Savability & Shot Analysis">
                <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
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
                            <div style={{ fontSize: 12, fontWeight: 700, color: t.text, width: 28, textAlign: "right" }}>{count}<span style={{ fontSize: 9, color: t.dim, marginLeft: 4 }}>({(s.ga > 0 ? (count / s.ga * 100).toFixed(0) : 0)}%)</span></div>
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


            {/* Zone Threat Analysis */}
            <Sec title="Zone Threat Analysis">
              {(() => {
                const shotEvts = d ? (isL5 ? d.l5ShotEvents : d.seasonShotEvents) : [];
                const goalsForCard = d ? (isL5 ? d.rawL5Goals : d.rawGoals) : [];
                const zones = computeZoneConversionUnified(shotEvts || [], goalsForCard || []);
                if (zones.length === 0) return (
                  <Card><div style={{ textAlign: "center", padding: 24, color: t.dim, fontSize: 12 }}>No shot-origin data yet. Log a match in Pitchside or upload a video to populate this view.</div></Card>
                );
                const maxShots = Math.max.apply(null, zones.map(function(z) { return z.shots || 0; }).concat([1]));
                const maxGoals = Math.max.apply(null, zones.map(function(z) { return z.goals || 0; }).concat([1]));
                const hasLegacyOnly = zones.some(function(z) { return z.rate === null; });
                return (
                  <Card>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 12 }}>Where goals are coming from, and how dangerous each zone has been.</div>
                    {zones.map(function(z) {
                      var hasRate = z.rate !== null;
                      var pctVal = hasRate ? z.rate * 100 : null;
                      var barColor = !hasRate ? t.dim : pctVal < 15 ? t.green : pctVal < 25 ? t.gold : t.red;
                      // When no shots are tracked for this zone (legacy data),
                      // size the bar by goal count instead so the row still shows magnitude.
                      var barWidth = z.shots > 0
                        ? (z.shots / maxShots * 100)
                        : (z.goals / maxGoals * 100);
                      return (
                        <div key={z.zone} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <div style={{ width: 110, fontSize: 11, color: t.dim, flexShrink: 0 }}>{z.name}</div>
                          <div style={{ flex: 1, height: 18, background: t.bg, borderRadius: 4, overflow: "hidden", position: "relative" }}>
                            <div style={{ height: "100%", width: barWidth + "%", background: barColor, borderRadius: 4, opacity: 0.7 }} />
                          </div>
                          <div style={{ width: 60, fontSize: 11, color: t.dim, textAlign: "right" }}>{z.shots > 0 ? (z.shots + " shot" + (z.shots !== 1 ? "s" : "")) : "—"}</div>
                          <div style={{ width: 45, fontSize: 11, color: t.text, textAlign: "right" }}>{z.goals} GA</div>
                          <div style={{ width: 45, fontSize: 12, fontWeight: 700, color: barColor, textAlign: "right" }}>{hasRate ? pctVal.toFixed(1) + "%" : "—"}</div>
                        </div>
                      );
                    })}
                    <div style={{ marginTop: 8, fontSize: 10, color: t.dim }}>
                      Sorted by GA, then by conversion rate. Green &lt;15% | Gold 15–25% | Red &gt;25%.
                      {hasLegacyOnly && " — \"—\" rate = goal logged before per-shot data was captured (pre-2026-03)."}
                    </div>
                  </Card>
                );
              })()}
            </Sec>
              {/* Row 4: Distribution */}
              <Sec title="Distribution">
                <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
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
                <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
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
                    theme={t}
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
                          <tr>{["Date", "Type", "Opp", "H/A", "Res", "Score", "SOT", "Sv", "GA", "Sv%", "Notes", "Rankings", ""].map(h => <th key={h} style={{ textAlign: "center", padding: "7px 5px", color: (h === "Notes" || h === "Rankings") ? t.accent : t.dim, width: (h === "Notes" || h === "Rankings") ? 50 : "auto", borderBottom: `1px solid ${t.border}`, fontSize: 9 }}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {d.matchLog.map((m, i) => {
                            const matchRecord = d.matches.find(x => x.id === m.id);
                            return (<>
                              <tr key={i}
                                onClick={() => {
                                  // Video-tagged matches get the rich /matches/[id] view;
                                  // pitchside-logged matches keep the legacy inline drill-down.
                                  if (matchRecord?.logged_via === "video") {
                                    window.location.href = `/matches/${m.id}`;
                                  } else {
                                    openGameDrillDown(m);
                                  }
                                }}
                                style={{ background: i % 2 === 0 ? "transparent" : t.cardAlt + "44", cursor: "pointer" }}
                                onMouseEnter={e => e.currentTarget.style.background = t.cardAlt}
                                onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : t.cardAlt + "44"}
                              >
                                <td style={{ padding: "7px 5px", color: t.text, textAlign: "center" }}>{m.date}</td>
                                <td style={{ padding: "7px 5px", textAlign: "center" }}><span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 4, background: m.type === "match" ? t.accent + "22" : t.gold + "22", color: m.type === "match" ? t.accent : t.gold }}>{m.type === "match" ? "M" : "T"}</span></td>
                                <td style={{ padding: "7px 5px", color: t.bright, fontWeight: 600, textAlign: "center" }}>{m.opp}</td>
                                <td style={{ padding: "7px 5px", color: t.dim, textAlign: "center" }}>{m.type === "training" ? "—" : m.ha}</td>
                                <td style={{ padding: "7px 5px", textAlign: "center", color: m.res === "W" ? t.green : m.res === "L" ? t.red : t.dim, fontWeight: 600 }}>{m.res}</td>
                                <td style={{ padding: "7px 5px", color: t.text, textAlign: "center" }}>{m.score}</td>
                                <td style={{ padding: "7px 5px", color: t.text, textAlign: "center" }}>{m.sot}</td>
                                <td style={{ padding: "7px 5px", color: t.text, textAlign: "center" }}>{m.sv}</td>
                                <td style={{ padding: "7px 5px", color: m.ga > 0 ? t.red : t.green, textAlign: "center", fontWeight: 600 }}>{m.ga}</td>
                                <td style={{ padding: "7px 5px", textAlign: "center", color: m.svP != null ? svC(m.svP) : t.dim, fontWeight: 600 }}>{m.svP != null ? pct(m.svP) : "—"}</td>
                <td style={{ padding: "4px 6px", textAlign: "center" }} onClick={e => e.stopPropagation()}><StatusIcon state={getIconState(notesStatus, m.id)} onClick={() => toggleNotes(m.id)} /></td>
                <td style={{ padding: "4px 6px", textAlign: "center" }} onClick={e => e.stopPropagation()}><StatusIcon state={rankingsEnabled ? getIconState(rankingsStatus, m.id) : "rankings-off"} onClick={() => toggleRankings(m.id)} /></td>
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
                {expandedNotes === m.id && <NotesPanel matchId={m.id} matchLabel={m.opp + " — " + m.date} />}
                {expandedRankings === m.id && <RankingsPanel matchId={m.id} matchLabel={m.opp + " — " + m.date} />}
                </>
                            );
                          })}
                        </tbody>
                      </table>
                    </Card>
              <div style={{ display: "flex", gap: 16, padding: "8px 0", flexWrap: "wrap" }}>{[{ icon: "○", border: t.border, bg: "transparent", color: t.dim, label: "Not yet submitted" },{ icon: "✓", border: t.accent, bg: t.accent + "18", color: t.accent, label: "Coach submitted" },{ icon: "✓", border: t.dim, bg: t.dim + "18", color: t.dim, label: "Keeper submitted" },{ icon: "✓", border: t.green, bg: t.green + "18", color: t.green, label: "Both submitted" }].map((s, i) => (<div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 18, height: 18, borderRadius: 4, border: "1.5px solid " + s.border, background: s.bg, color: s.color, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{s.icon}</span><span style={{ fontSize: 10, color: t.dim }}>{s.label}</span></div>))}</div>
                  </>
                )}
              </div>
            )}

            {/* CAUTION */}
            {hasMatches && tab === "caution" && (
              <div>
                <Sec icon="⚡">Coaching Alerts — {selectedKeeperObj?.name}</Sec>
                {alerts.length === 0 ? (
                  <EmptyState theme={t} icon="✅" title="All Clear" subtitle="No coaching alerts based on current performance trends." />
                ) : (
                  alerts.filter(function(al) { return alertFilter === "All" || al.cat === alertFilter; }).map((al, i) => (
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
                  <Card><GoalHeatmap theme={t} zones={dGoals?.zones} title="Where Goals Go In" /></Card>
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
                    <ShotCrossRef theme={t} goals={isL5 ? d.rawL5Goals : d.rawGoals} />
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
                    <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr" : "1fr 1fr", gap: 8, marginBottom: 12 }}>
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
                      <div style={{ fontSize: 10, color: t.dim, marginBottom: 6 }}>
                        Core Attributes — Season vs Last {d.l5AttrsCount || 0} Rated
                      </div>
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
                ) : <EmptyState theme={t} icon="⭐" title="No Attribute Ratings" subtitle="Rate keeper attributes after each match in Pitchside." />}
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
                    <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 16 }}>
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
                    <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
                      <Card><GoalHeatmap theme={t} zones={d.seasonGoals?.zones} title={`${selectedKeeperObj?.name?.split(" ")[0]} Goals`} /></Card>
                      <Card><GoalHeatmap theme={t} zones={cmpData.seasonGoals?.zones} title={`${cmpKeeperObj?.name?.split(" ")[0]} Goals`} /></Card>
                    </div>
                  </div>
                ) : <EmptyState theme={t} icon="⚖️" title="Select a Keeper to Compare" subtitle="Choose a second goalkeeper from the dropdown above." />}
              </div>
            )}

          </div>
        )}
      </div>

      <div style={{ textAlign: "center", padding: 14, borderTop: `1px solid ${t.border}`, fontSize: 8, color: t.dim }}>
        StixAnalytix · Built for coaching professionals
      </div>

      {showKeeperModal && <KeeperModal theme={t} keeper={null} primaryColor={primaryColor} onClose={() => setShowKeeperModal(false)} onSave={handleAddKeeper} />}
      {editingKeeper && <KeeperModal theme={t} keeper={editingKeeper} primaryColor={primaryColor} onClose={() => setEditingKeeper(null)} onSave={handleEditKeeper} onDeactivate={handleDeactivateKeeper} />}
      {editingMatch && <EditMatchModal match={editingMatch} onSave={handleEditMatch} onClose={() => setEditingMatch(null)} theme={t} />}
      {deletingMatch && <DeleteMatchConfirm match={deletingMatch} onConfirm={handleDeleteMatch} onClose={() => setDeletingMatch(null)} theme={t} />}
    </div>
  );
}

