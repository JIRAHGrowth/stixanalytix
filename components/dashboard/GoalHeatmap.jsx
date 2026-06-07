"use client";
import { ZONE_LABELS } from "@/lib/constants";
import { tDark } from "@/lib/theme";

const ZONE_POSITIONS = {
  "High L": { x: 5, y: 5 }, "High C": { x: 38, y: 5 }, "High R": { x: 71, y: 5 },
  "Mid L": { x: 5, y: 35 }, "Mid C": { x: 38, y: 35 }, "Mid R": { x: 71, y: 35 },
  "Low L": { x: 5, y: 62 }, "Low C": { x: 38, y: 62 }, "Low R": { x: 71, y: 62 },
};

export default function GoalHeatmap({ zones, title, theme }) {
  const t = theme || tDark;
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
              // Each cell 3:1 → 3 cols × 3 rows = 9 wide : 3 tall = 3:1 overall,
              // matching a real soccer goal frame (24 ft × 8 ft).
              aspectRatio: "3", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              background: v > 0 ? "rgba(239,68,68," + intensity + ")" : t.bg,
              borderRight: z.includes("R") ? "none" : "1px solid " + t.border,
              borderBottom: z.includes("Low") ? "none" : "1px solid " + t.border,
            }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: v > 0 ? t.bright : t.dim }}>{v}{v > 0 && <div style={{ fontSize: 7, color: t.dim, marginTop: -1 }}>{(v / Math.max(1, Object.values(zones).reduce(function(a,b){return a+b},0)) * 100).toFixed(0)}%</div>}</div>
              <div style={{ fontSize: 8, color: v > 0 ? "rgba(255,255,255,0.65)" : t.dim, marginTop: 2 }}>{label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
