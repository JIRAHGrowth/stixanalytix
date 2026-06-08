"use client";
import { tDark } from "@/lib/theme";

// Attacking-third pitch view, drawn with real pitch markings.
//
// viewBox 100 × 60 ≈ 1.67:1 — a final-third framing (the attacking
// third is ~32 m deep × 68 m wide ≈ 1.94:1). A strict half-pitch is
// 1.30:1 but reads as a near-square; the final-third framing is what
// coaches expect to see.
//
// Layer order:
//   1. pitch background
//   2. dashed zone divider lines (thin, subtle)
//   3. real pitch markings — penalty area, 6-yard, penalty arc (solid,
//      slightly thicker — these are the lines you'd see on an actual pitch)
//   4. goal frame on the goal line
//   5. zone overlays (semi-transparent fills + values)
//   6. zone labels
//
// Pitch lines use `t.text` (mid-bright, readable on both themes); zone
// dividers use `t.border` (dim, dashed) so the eye reads the pitch
// markings as the dominant structure.

const PITCH_W = 100;
const PITCH_H = 60;
const MARGIN  = 2;

const SIX_BOX_W   = 27;
const SIX_BOX_H   = 8;
const PEN_BOX_W   = 57;
const PEN_BOX_H   = 24;
const PEN_SPOT_Y  = 19;
const PEN_ARC_R   = 10;
const GOAL_W      = 11;
const GOAL_DEPTH  = 2;

const STROKE_PITCH = 0.6;   // 18-yard, 6-yard, arc, pitch outline
const STROKE_ZONE  = 0.3;   // dashed zone dividers

export default function PitchOriginMap({ origins, title, theme }) {
  const t = theme || tDark;
  if (!origins || Object.keys(origins).length === 0) {
    return <div style={{ textAlign: "center", padding: 24, color: t.dim, fontSize: 12 }}>No origin data</div>;
  }

  const cx = PITCH_W / 2;
  const penLeftX  = cx - PEN_BOX_W / 2;
  const penRightX = cx + PEN_BOX_W / 2;
  const sixLeftX  = cx - SIX_BOX_W / 2;
  const sixRightX = cx + SIX_BOX_W / 2;
  const penTopY     = MARGIN;
  const penBottomY  = MARGIN + PEN_BOX_H;
  const sixBottomY  = MARGIN + SIX_BOX_H;
  const pitchBottomY = PITCH_H - MARGIN;

  const vizZones = [
    { key: "wideL",    x: MARGIN,    y: penTopY,    w: penLeftX - MARGIN,            h: pitchBottomY - penTopY,
      label: ["Wide", "Left"],       val: (origins.cornerL || 0) + (origins.outL || 0) },
    { key: "channelL", x: penLeftX,  y: penTopY,    w: sixLeftX - penLeftX,          h: PEN_BOX_H,
      label: ["Left", "Channel"],    val: origins.boxL || 0 },
    { key: "6yard",    x: sixLeftX,  y: penTopY,    w: SIX_BOX_W,                    h: SIX_BOX_H,
      label: ["6-Yard"],             val: origins["6yard"] || 0 },
    { key: "central",  x: sixLeftX,  y: sixBottomY, w: SIX_BOX_W,                    h: PEN_BOX_H - SIX_BOX_H,
      label: ["Central", "Box"],     val: (origins.boxC || 0) + (origins.penalty || 0) },
    { key: "channelR", x: sixRightX, y: penTopY,    w: penRightX - sixRightX,        h: PEN_BOX_H,
      label: ["Right", "Channel"],   val: origins.boxR || 0 },
    { key: "wideR",    x: penRightX, y: penTopY,    w: PITCH_W - MARGIN - penRightX, h: pitchBottomY - penTopY,
      label: ["Wide", "Right"],      val: (origins.cornerR || 0) + (origins.outR || 0) },
    { key: "outside",  x: penLeftX,  y: penBottomY, w: PEN_BOX_W,                    h: pitchBottomY - penBottomY,
      label: ["Outside", "the Box"], val: origins.outC || 0 },
  ];

  const vizMax = Math.max(...vizZones.map(z => z.val), 1);
  const lineMain = t.text;
  const lineZone = t.border;

  // Penalty arc: bulges out from the penalty spot BEYOND the 18-yard line.
  const arcDx = Math.sqrt(Math.max(0, PEN_ARC_R * PEN_ARC_R - (PEN_SPOT_Y - penBottomY) ** 2));
  const arcStartX = cx - arcDx;
  const arcEndX   = cx + arcDx;
  const penArcPath = `M ${arcStartX} ${penBottomY} A ${PEN_ARC_R} ${PEN_ARC_R} 0 0 0 ${arcEndX} ${penBottomY}`;

  return (
    <div style={{ textTransform: "none" }}>
      <svg viewBox={`0 0 ${PITCH_W} ${PITCH_H}`} style={{ width: "100%", maxWidth: 460, display: "block", margin: "0 auto" }}>
        {/* — pitch background — */}
        <rect x={MARGIN} y={MARGIN} width={PITCH_W - MARGIN * 2} height={PITCH_H - MARGIN * 2}
              rx="1" fill={t.bg} stroke={lineMain} strokeWidth={STROKE_PITCH} />

        {/* — dashed zone dividers (thin, drawn before solid markings) — */}
        {/* sixLeftX / sixRightX extensions from the 6-yard floor down to the 18-yard line —
            these divide channelL/R from the central column inside the penalty area. */}
        <line x1={sixLeftX}  y1={sixBottomY} x2={sixLeftX}  y2={penBottomY}
              stroke={lineZone} strokeWidth={STROKE_ZONE} strokeDasharray="1.4 1.2" />
        <line x1={sixRightX} y1={sixBottomY} x2={sixRightX} y2={penBottomY}
              stroke={lineZone} strokeWidth={STROKE_ZONE} strokeDasharray="1.4 1.2" />
        {/* penLeftX / penRightX extensions below the 18-yard line — divide wideL/R from outside-the-box */}
        <line x1={penLeftX}  y1={penBottomY} x2={penLeftX}  y2={pitchBottomY}
              stroke={lineZone} strokeWidth={STROKE_ZONE} strokeDasharray="1.4 1.2" />
        <line x1={penRightX} y1={penBottomY} x2={penRightX} y2={pitchBottomY}
              stroke={lineZone} strokeWidth={STROKE_ZONE} strokeDasharray="1.4 1.2" />

        {/* — real pitch markings (thicker, solid) — */}
        <rect x={penLeftX} y={penTopY} width={PEN_BOX_W} height={PEN_BOX_H}
              fill="none" stroke={lineMain} strokeWidth={STROKE_PITCH} />
        <rect x={sixLeftX} y={penTopY} width={SIX_BOX_W} height={SIX_BOX_H}
              fill="none" stroke={lineMain} strokeWidth={STROKE_PITCH} />
        <path d={penArcPath} fill="none" stroke={lineMain} strokeWidth={STROKE_PITCH} />
        <circle cx={cx} cy={PEN_SPOT_Y} r="0.6" fill={lineMain} />

        {/* — goal frame on the goal line — */}
        <rect x={cx - GOAL_W / 2} y={MARGIN - GOAL_DEPTH} width={GOAL_W} height={GOAL_DEPTH}
              fill={t.bright} opacity="0.75" rx="0.3" />
        <text x={cx} y={MARGIN - GOAL_DEPTH - 0.7} textAnchor="middle" fill={t.dim}
              fontSize="2.2" fontWeight="700" letterSpacing="0.6">GOAL</text>

        {/* — zone overlays — */}
        {vizZones.map(z => {
          const cxZ = z.x + z.w / 2;
          const cyZ = z.y + z.h / 2;
          const isNarrow = z.w <= 12;
          const isTall = z.h > 30;
          const lblFont = isNarrow ? 2 : (z.w > 30 ? 2.6 : 2.4);
          const valFont = z.val > 0 ? (isNarrow ? 4.5 : 6) : 0;
          const intensity = z.val > 0 ? (0.18 + (z.val / vizMax) * 0.55) : 0;
          const valY = isTall ? (z.y + z.h * 0.30) : (cyZ - 1.5);
          const lblY = isTall ? (z.y + z.h * 0.45) : (cyZ + 3);
          return (
            <g key={z.key}>
              {z.val > 0 && (
                <rect x={z.x + 0.5} y={z.y + 0.5} width={z.w - 1} height={z.h - 1}
                      rx="0.8" fill={`rgba(239,68,68,${intensity})`} />
              )}
              {z.val > 0 && (
                <text x={cxZ} y={valY} textAnchor="middle" dominantBaseline="middle"
                      fill={t.bright} fontSize={valFont} fontWeight="800">
                  {z.val}
                </text>
              )}
              <text x={cxZ} textAnchor="middle"
                    fill={z.val > 0 ? "rgba(255,255,255,0.78)" : t.dim}
                    fontSize={lblFont} fontWeight={z.val > 0 ? "600" : "500"}
                    opacity={z.val > 0 ? 1 : 0.6}>
                {z.label.map((line, i) => (
                  <tspan key={i} x={cxZ} y={i === 0 ? lblY : undefined}
                         dy={i > 0 ? (lblFont + 0.4) : undefined}>{line}</tspan>
                ))}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
