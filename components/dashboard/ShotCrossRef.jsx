"use client";
import { useState } from "react";
import { tDark } from "@/lib/theme";
import { ORIGIN_LABELS } from "@/lib/constants";

const ORIGINS = ["Inside Box", "Outside Box", "Penalty Spot", "Right Channel", "Left Channel", "Central", "Header Zone"];
const NET_ZONE_GRID = [
  ["High L", "High C", "High R"],
  ["Mid L",  "Mid C",  "Mid R"],
  ["Low L",  "Low C",  "Low R"],
];

export default function ShotCrossRef({ goals, theme }) {
  const t = theme || tDark;
  const [activeOrigin, setActiveOrigin] = useState(null);

  if (!goals || goals.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 32, color: t.dim, fontSize: 12 }}>
        No goal data to cross-reference yet.
      </div>
    );
  }

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
  originsUsed.forEach(o => { if (!ORIGINS.includes(o)) usedOrigins.push(o); });

  if (usedOrigins.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 24, color: t.dim, fontSize: 12 }}>
        Goal data exists but shot origin / net zone fields are not yet populated.
      </div>
    );
  }

  const selectedData = activeOrigin ? (matrix[activeOrigin] || {}) : null;
  const selectedTotal = selectedData ? Object.values(selectedData).reduce((s, v) => s + v, 0) : 0;

  const originTotals = usedOrigins.map(o => ({
    origin: o,
    total: Object.values(matrix[o] || {}).reduce((s, v) => s + v, 0),
    topZone: Object.entries(matrix[o] || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "\u2014",
  })).sort((a, b) => b.total - a.total);

  const maxTotal = Math.max(...originTotals.map(o => o.total), 1);

  return (
    <div>
      <div style={{ fontSize: 11, color: t.dim, marginBottom: 14, lineHeight: 1.5 }}>
        Click a shot origin to see exactly where on the net those goals went. Reveals pattern vulnerabilities for targeted training.
      </div>

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
            <div style={{ width: 60, fontSize: 9, color: t.dim, textAlign: "right" }}>{"\u2192"} {topZone}</div>
          </div>
        ))}
      </div>

      {activeOrigin && selectedData && (
        <div style={{ background: t.cardAlt, borderRadius: 10, padding: 16, border: `1px solid ${t.border}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.bright, marginBottom: 4 }}>
            Goals from <span style={{ color: t.orange }}>{activeOrigin}</span> {"\u2014"} where they went in
          </div>
          <div style={{ fontSize: 10, color: t.dim, marginBottom: 14 }}>
            {selectedTotal} goal{selectedTotal !== 1 ? "s" : ""} conceded from this position
          </div>

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

          {selectedTotal >= 2 && (() => {
            const top = Object.entries(selectedData).sort((a, b) => b[1] - a[1])[0];
            const topPct = top ? ((top[1] / selectedTotal) * 100).toFixed(0) : 0;
            const isHighDanger = top?.[0]?.startsWith("Low") || top?.[0]?.startsWith("Mid");
            return (
              <div style={{ background: t.red + "12", border: `1px solid ${t.red}33`, borderRadius: 8, padding: "10px 12px", fontSize: 11, color: t.text, lineHeight: 1.6 }}>
                <span style={{ color: t.red, fontWeight: 700 }}>{"\u26A0"} Pattern: </span>
                {topPct}% of goals from <strong>{activeOrigin}</strong> go to the <strong>{top?.[0]}</strong> zone.
                {isHighDanger ? " Low/mid goals often indicate positioning or set stance \u2014 drill this channel in training." : " High goals from this zone suggest poor starting position or late reaction \u2014 review set position."}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
