"use client";
import { tDark } from "@/lib/theme";

// Half-pitch attacking-end view, drawn with real pitch markings.
//
// viewBox 100 × 60 ≈ 1.67:1 — close to a final-third view (the attacking
// third is ~35 m deep × 68 m wide = 1.94:1) which is the area shots come
// from. A strict half-pitch is 1.30:1 but visually it reads as "tall square"
// and lost coaches familiar with broadcast tactic diagrams. Final-third
// framing reads as a pitch immediately.
//
// Goal at the TOP (y=0). Coordinates run downward into the field.
// Pitch markings (penalty area, 6-yard, penalty spot + arc) are drawn as
// solid lines so it looks like a pitch, not a zone grid. Shot-origin
// zones are overlaid as semi-transparent colored rectangles with values.

const PITCH_W = 100;
const PITCH_H = 60;
const MARGIN  = 2;

// Pitch dimensions in viewBox units (proportional to a real ~32 m × 68 m
// final third — width scaled so 68 m = 96 viewBox units after margins).
const SIX_BOX_W   = 27;   // 6-yard box is ~18.3 m wide → 18.3/68*96 ≈ 26
const SIX_BOX_H   = 8;    // 6-yard box is ~5.5 m deep → 5.5/32*56 ≈ 9.6 → 8 reads better
const PEN_BOX_W   = 57;   // 18-yard box ~40.3 m wide → 40.3/68*96 ≈ 57
const PEN_BOX_H   = 24;   // 18-yard box ~16.5 m deep → 16.5/32*56 ≈ 29 → 24 reads better
const PEN_SPOT_Y  = 19;   // ~12 yd / 11 m from goal
const PEN_ARC_R   = 10;   // ~10 yd radius
const GOAL_W      = 11;   // 7.32 m / 68 m * 96 ≈ 10.3
const GOAL_DEPTH  = 2;

export default function PitchOriginMap({ origins, title, theme }) {
  const t = theme || tDark;
  if (!origins || Object.keys(origins).length === 0) {
    return <div style={{ textAlign: "center", padding: 24, color: t.dim, fontSize: 12 }}>No origin data</div>;
  }

  // Pitch coords for zone overlays. Six zones mapped over the pitch
  // geography: 6-yard, central box (penalty arc area), left/right
  // channels (inside penalty area but to the side of 6-yard), wide L/R
  // (outside penalty area, on the flanks), outside-the-box (central, in
  // front of the penalty area).
  const cx = PITCH_W / 2;                                 // 50
  const penLeftX = cx - PEN_BOX_W / 2;                    // 21.5
  const penRightX = cx + PEN_BOX_W / 2;                   // 78.5
  const sixLeftX = cx - SIX_BOX_W / 2;                    // 36.5
  const sixRightX = cx + SIX_BOX_W / 2;                   // 63.5
  const penTopY = MARGIN;                                 // 2
  const penBottomY = MARGIN + PEN_BOX_H;                  // 26
  const sixBottomY = MARGIN + SIX_BOX_H;                  // 10
  const pitchBottomY = PITCH_H - MARGIN;                  // 58

  const vizZones = [
    { key: "wideL",    x: MARGIN,      y: penTopY,    w: penLeftX - MARGIN,             h: pitchBottomY - penTopY,
      label: ["Wide", "Left"],          val: (origins.cornerL || 0) + (origins.outL || 0) },
    { key: "channelL", x: penLeftX,    y: penTopY,    w: sixLeftX - penLeftX,           h: PEN_BOX_H,
      label: ["Left", "Channel"],       val: origins.boxL || 0 },
    { key: "6yard",    x: sixLeftX,    y: penTopY,    w: SIX_BOX_W,                     h: SIX_BOX_H,
      label: ["6-Yard"],                val: origins["6yard"] || 0 },
    { key: "central",  x: sixLeftX,    y: sixBottomY, w: SIX_BOX_W,                     h: PEN_BOX_H - SIX_BOX_H,
      label: ["Central", "Box"],        val: (origins.boxC || 0) + (origins.penalty || 0) },
    { key: "channelR", x: sixRightX,   y: penTopY,    w: penRightX - sixRightX,         h: PEN_BOX_H,
      label: ["Right", "Channel"],      val: origins.boxR || 0 },
    { key: "wideR",    x: penRightX,   y: penTopY,    w: PITCH_W - MARGIN - penRightX,  h: pitchBottomY - penTopY,
      label: ["Wide", "Right"],         val: (origins.cornerR || 0) + (origins.outR || 0) },
    { key: "outside",  x: penLeftX,    y: penBottomY, w: PEN_BOX_W,                     h: pitchBottomY - penBottomY,
      label: ["Outside", "the Box"],    val: origins.outC || 0 },
  ];

  const vizMax = Math.max(...vizZones.map(z => z.val), 1);
  const lineStroke = t.dim;
  const goalFill = t.text;

  // Penalty arc (D) — the semicircle that bulges out FROM the penalty spot
  // BEYOND the 18-yard line. Drawn as an SVG arc clipped to "below penBottomY".
  const arcStartX = cx - Math.sqrt(Math.max(0, PEN_ARC_R * PEN_ARC_R - (PEN_SPOT_Y - penBottomY) ** 2));
  const arcEndX = cx + Math.sqrt(Math.max(0, PEN_ARC_R * PEN_ARC_R - (PEN_SPOT_Y - penBottomY) ** 2));
  const penArcPath = `M ${arcStartX} ${penBottomY} A ${PEN_ARC_R} ${PEN_ARC_R} 0 0 0 ${arcEndX} ${penBottomY}`;

  return (
    <div style={{ textTransform: "none" }}>
      <svg viewBox={`0 0 ${PITCH_W} ${PITCH_H}`} style={{ width: "100%", maxWidth: 420, display: "block", margin: "0 auto" }}>
        {/* — pitch background — */}
        <rect x={MARGIN} y={MARGIN} width={PITCH_W - MARGIN * 2} height={PITCH_H - MARGIN * 2}
              rx="1" fill={t.bg} stroke={lineStroke} strokeWidth="0.5" />

        {/* — penalty area (18-yard box) — */}
        <rect x={penLeftX} y={penTopY} width={PEN_BOX_W} height={PEN_BOX_H}
              fill="none" stroke={lineStroke} strokeWidth="0.5" />

        {/* — 6-yard box — */}
        <rect x={sixLeftX} y={penTopY} width={SIX_BOX_W} height={SIX_BOX_H}
              fill="none" stroke={lineStroke} strokeWidth="0.5" />

        {/* — penalty arc (D) outside the penalty area — */}
        <path d={penArcPath} fill="none" stroke={lineStroke} strokeWidth="0.4" />

        {/* — penalty spot — */}
        <circle cx={cx} cy={PEN_SPOT_Y} r="0.6" fill={lineStroke} />

        {/* — goal frame on the goal line — */}
        <rect x={cx - GOAL_W / 2} y={MARGIN - GOAL_DEPTH} width={GOAL_W} height={GOAL_DEPTH}
              fill={goalFill} opacity="0.6" rx="0.3" />
        <text x={cx} y={MARGIN - GOAL_DEPTH - 0.7} textAnchor="middle" fill={t.dim}
              fontSize="2.4" fontWeight="700" letterSpacing="0.8">GOAL</text>

        {/* — zone overlays — */}
        {vizZones.map(z => {
          const cxZ = z.x + z.w / 2;
          const cyZ = z.y + z.h / 2;
          const isNarrow = z.w <= 12;
          const fontSize = isNarrow ? 2.2 : (z.w > 30 ? 3.2 : 2.8);
          const valSize = z.val > 0 ? (isNarrow ? 5.5 : 7) : 0;
          const intensity = z.val > 0 ? (0.18 + (z.val / vizMax) * 0.55) : 0;
          // For wide-tall zones (wide L/R), put value near top so the label sits below.
          const isTall = z.h > 30;
          const valY = isTall ? (z.y + z.h * 0.30) : (cyZ - 2);
          const lblY = isTall ? (z.y + z.h * 0.55) : (cyZ + 3.5);
          return (
            <g key={z.key}>
              {z.val > 0 && (
                <rect x={z.x + 0.5} y={z.y + 0.5} width={z.w - 1} height={z.h - 1}
                      rx="1" fill={`rgba(239,68,68,${intensity})`} />
              )}
              {z.val > 0 && (
                <text x={cxZ} y={valY} textAnchor="middle" dominantBaseline="middle"
                      fill={t.bright} fontSize={valSize} fontWeight="800">
                  {z.val}
                </text>
              )}
              <text x={cxZ} textAnchor="middle"
                    fill={z.val > 0 ? "rgba(255,255,255,0.78)" : t.dim}
                    fontSize={fontSize} fontWeight={z.val > 0 ? "600" : "500"}
                    opacity={z.val > 0 ? 1 : 0.5}>
                {z.label.map((line, i) => (
                  <tspan key={i} x={cxZ} y={i === 0 ? lblY : undefined}
                         dy={i > 0 ? (fontSize + 0.6) : undefined}>{line}</tspan>
                ))}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
