"use client";
import { ZONE_LABELS } from "@/lib/constants";
import { tDark } from "@/lib/theme";

// Goal-frame heatmap. 3:1 aspect ratio matches a real soccer goal
// (24 ft × 8 ft). Top / left / right borders are drawn thick in
// `t.bright` to read as the crossbar + posts of a goal frame; the
// bottom edge is left open since the goal line is just paint on the
// ground, not a structural bar. Internal cell dividers are thin and
// dim so the goal frame stays the dominant shape on the eye.

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
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gridTemplateRows: "1fr 1fr 1fr",
        gap: 0,
        width: "100%",
        maxWidth: 540,
        aspectRatio: "3 / 1",
        margin: "0 auto",
        // Goal frame: crossbar (top) + posts (left, right). No bottom —
        // the goal line is the ground.
        borderTop: `4px solid ${t.bright}`,
        borderLeft: `4px solid ${t.bright}`,
        borderRight: `4px solid ${t.bright}`,
        borderBottom: "none",
        borderTopLeftRadius: 3,
        borderTopRightRadius: 3,
        overflow: "hidden",
      }}>
        {grid.flat().map((z, i) => {
          const v = zones[z] || 0;
          const intensity = v > 0 ? 0.22 + (v / maxVal) * 0.68 : 0;
          const label = ZONE_LABELS[z] || z;
          const col = i % 3;
          const row = Math.floor(i / 3);
          return (
            <div key={z} style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: v > 0 ? `rgba(239,68,68,${intensity})` : "transparent",
              // Subtle internal grid lines — only between cells, never on
              // the outer goal-frame edges (the thick border handles those).
              borderRight: col < 2 ? `1px solid ${t.border}` : "none",
              borderBottom: row < 2 ? `1px solid ${t.border}` : "none",
              padding: "4px 6px",
              minHeight: 0,
            }}>
              <div style={{
                fontSize: 15,
                fontWeight: 800,
                lineHeight: 1,
                color: v > 0 ? "#fff" : t.dim,
              }}>{v}</div>
              <div style={{
                fontSize: 9,
                color: v > 0 ? "rgba(255,255,255,0.72)" : t.dim,
                marginTop: 3,
                letterSpacing: 0.2,
                lineHeight: 1,
              }}>{label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
