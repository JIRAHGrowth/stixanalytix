"use client";
// Landscape pitch view for GK distribution targets.
// Our goal on the LEFT, opponent goal on the RIGHT. 12 target zones in a
// 4×3 grid: 4 length bands (SHORT/MEDIUM/LONG/VERY LONG) × 3 lateral
// columns (L/C/R). short_c is the GK area in our own central third —
// non-target, shown for spatial context only.
//
// Geometry: viewBox 1050×700, 1 unit = 0.1 yd.
//   Pitch:         105 yd long × 70 yd wide   → 1050 × 700
//   18-yd box:     18 yd deep × 44 yd wide    → 180 × 440 (centered y)
//   6-yd box:      6 yd deep × 20 yd wide     → 60 × 200
//   Goal:          8 yd                       → 80
//   Penalty arc:   10 yd radius from spot     → 100
// Both ends are mirrored — opp half on the right uses the same shapes.

import { tDark } from "@/lib/theme";
import { DIST_TARGET_ZONES, FONT } from "@/lib/constants";

const W = 1050, H = 700;
const BOX_DEPTH = 180, BOX_W = 440;
const SIX_DEPTH = 60, SIX_W = 200;
const GOAL_W = 80;

// Band x-ranges (left to right = closer to our goal → further away)
const BAND_X = {
  SHORT:     [0, 330],    // own defensive third
  MEDIUM:    [330, 630],  // midfield
  LONG:      [630, 870],  // opponent half
  "VERY LONG": [870, 1050], // opp 18-yd box
};
// Lateral y-ranges
const LATERAL_Y = {
  L: [0, 233],
  C: [233, 467],
  R: [467, 700],
};

const zoneRect = (zone) => {
  const [x0, x1] = BAND_X[zone.band];
  const [y0, y1] = LATERAL_Y[zone.lateral];
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
};

export default function DistributionTargetMap({ selected, geminiGuess, onSelect, theme }) {
  const t = theme || tDark;

  const styleFor = (id, isGk) => {
    if (isGk) return { fill: "#ffffff04", stroke: "#ffffff10", sw: 0.5, cursor: "default" };
    if (selected === id) return { fill: t.accent + "55", stroke: t.accent, sw: 2.5, cursor: "pointer" };
    if (!selected && geminiGuess === id) return { fill: t.accent + "1f", stroke: t.accent + "AA", sw: 1.5, cursor: "pointer" };
    return { fill: "#ffffff06", stroke: "#ffffff14", sw: 0.5, cursor: "pointer" };
  };

  // GK marker position in our 6-yard area, central
  const gkX = 30, gkY = 350;

  // Trajectory endpoint = selected zone center (or null)
  const trajectoryTo = (() => {
    if (!selected) return null;
    const z = DIST_TARGET_ZONES.find(z => z.id === selected && !z.isGkArea);
    if (!z) return null;
    return zoneRect(z);
  })();

  return (
    <div style={{ width: "100%" }}>
      <div style={{ fontSize: 10, color: t.dim, letterSpacing: 2, textTransform: "uppercase", textAlign: "center", marginBottom: 4 }}>
        attacking direction → (our goal left, opp goal right)
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block", background: "#0a1d12" }} role="img" aria-label="Distribution target pitch">
        {/* Outer pitch */}
        <rect x={0} y={0} width={W} height={H} fill="none" stroke="#3a7a4a" strokeWidth={2} />
        {/* Halfway + centre circle */}
        <line x1={W / 2} y1={0} x2={W / 2} y2={H} stroke="#2e6a42" strokeWidth={1.5} />
        <circle cx={W / 2} cy={H / 2} r={100} fill="none" stroke="#2e6a42" strokeWidth={1.5} />
        <circle cx={W / 2} cy={H / 2} r={3} fill="#3a7a4a" />
        {/* Our 18-yd box (left) */}
        <rect x={0} y={(H - BOX_W) / 2} width={BOX_DEPTH} height={BOX_W} fill="none" stroke="#2e6a42" strokeWidth={1.5} />
        <rect x={0} y={(H - SIX_W) / 2} width={SIX_DEPTH} height={SIX_W} fill="none" stroke="#2e6a42" strokeWidth={1.5} />
        <path d={`M${BOX_DEPTH},${H / 2 - 80} A100,100 0 0,1 ${BOX_DEPTH},${H / 2 + 80}`} fill="none" stroke="#2e6a42" strokeWidth={1.5} />
        <circle cx={120} cy={H / 2} r={3} fill="#3a7a4a" />
        {/* Opp 18-yd box (right, mirrored) */}
        <rect x={W - BOX_DEPTH} y={(H - BOX_W) / 2} width={BOX_DEPTH} height={BOX_W} fill="none" stroke="#2e6a42" strokeWidth={1.5} />
        <rect x={W - SIX_DEPTH} y={(H - SIX_W) / 2} width={SIX_DEPTH} height={SIX_W} fill="none" stroke="#2e6a42" strokeWidth={1.5} />
        <path d={`M${W - BOX_DEPTH},${H / 2 - 80} A100,100 0 0,0 ${W - BOX_DEPTH},${H / 2 + 80}`} fill="none" stroke="#2e6a42" strokeWidth={1.5} />
        <circle cx={W - 120} cy={H / 2} r={3} fill="#3a7a4a" />

        {/* Zones */}
        {DIST_TARGET_ZONES.map(zone => {
          const rect = zoneRect(zone);
          const s = styleFor(zone.id, zone.isGkArea);
          return (
            <g key={zone.id} onClick={() => !zone.isGkArea && onSelect(zone.id)} style={{ cursor: s.cursor }}>
              <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill={s.fill} stroke={s.stroke} strokeWidth={s.sw} style={{ transition: "all 0.15s" }} />
            </g>
          );
        })}

        {/* Band-header labels along the top edge */}
        <g font-family={FONT} fontSize={18} fill="#7da291" fontStyle="italic">
          <text x={165} y={28} textAnchor="middle">SHORT · our third</text>
          <text x={480} y={28} textAnchor="middle">MEDIUM · midfield</text>
          <text x={750} y={28} textAnchor="middle">LONG · opp half</text>
          <text x={960} y={28} textAnchor="middle">VERY LONG · opp 18</text>
        </g>

        {/* Cell labels */}
        {DIST_TARGET_ZONES.map(zone => {
          const r = zoneRect(zone);
          const isSel = selected === zone.id;
          const isGuess = !selected && geminiGuess === zone.id;
          if (zone.isGkArea) {
            return (
              <text key={`l-${zone.id}`} x={r.cx} y={r.cy} textAnchor="middle" dominantBaseline="middle"
                fontFamily={FONT} fontSize={22} fill="#3a6a4a" style={{ pointerEvents: "none" }}>
                {zone.label}
              </text>
            );
          }
          return (
            <text key={`l-${zone.id}`} x={r.cx} y={r.cy} textAnchor="middle" dominantBaseline="middle"
              fontFamily={FONT}
              fontSize={isSel ? 26 : 22}
              fontWeight={isSel ? 700 : (isGuess ? 600 : 500)}
              fill={isSel ? t.accent : (isGuess ? t.accent : "#9aaab6")}
              style={{ pointerEvents: "none" }}>
              {zone.label}{isSel ? " ✓" : ""}
            </text>
          );
        })}

        {/* Our goal post (left) */}
        <line x1={0} y1={(H - GOAL_W) / 2} x2={0} y2={(H + GOAL_W) / 2} stroke="#e8eef2" strokeWidth={5} />
        <text x={20} y={H / 2 + 4} fontFamily={FONT} fontSize={14} fontWeight={700} fill="#e8eef2">OUR GOAL</text>
        {/* Opp goal post (right) */}
        <line x1={W} y1={(H - GOAL_W) / 2} x2={W} y2={(H + GOAL_W) / 2} stroke="#e8eef2" strokeWidth={5} />
        <text x={W - 20} y={H / 2 + 4} textAnchor="end" fontFamily={FONT} fontSize={14} fontWeight={700} fill="#e8eef2">OPP GOAL</text>

        {/* GK marker — drawn LAST so it sits above zone fills */}
        <circle cx={gkX} cy={gkY} r={14} fill={t.accent} stroke="#fff" strokeWidth={2} />
        <text x={gkX} y={gkY + 5} textAnchor="middle" fontFamily={FONT} fontSize={14} fontWeight={700} fill="#fff" style={{ pointerEvents: "none" }}>GK</text>

        {/* Trajectory arrow */}
        {trajectoryTo && (
          <>
            <defs>
              <marker id="dist-arrow" markerWidth={10} markerHeight={10} refX={7} refY={3} orient="auto">
                <path d="M0,0 L7,3 L0,6 Z" fill={t.accent} />
              </marker>
            </defs>
            <line x1={gkX + 14} y1={gkY} x2={trajectoryTo.cx} y2={trajectoryTo.cy}
              stroke={t.accent} strokeWidth={3} strokeDasharray="10,5" markerEnd="url(#dist-arrow)" />
          </>
        )}
      </svg>
    </div>
  );
}
