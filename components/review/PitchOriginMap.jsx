"use client";
// Attacking-third pitch view for the review screen.
// Geometry uses 1 SVG unit = 0.1 yard, so measurements read like the
// Laws of the Game with a 10× scale:
//   18-yard box:  44 yd wide × 18 yd deep   → 440 × 180
//   6-yard box:   20 yd wide × 6 yd deep    → 200 × 60
//   Goal:         8 yd wide                  → 80
//   Penalty spot: 12 yd from goal            → 120 from goal line
//   Penalty arc:  10 yd radius from spot     → 100
// Pitch width shown: 70 yd (700). Depth shown: 30 yd (300).
// The view is keeper-perspective: goal at the bottom, attackers come from the top.

import { tDark } from "@/lib/theme";
import { FONT } from "@/lib/constants";

const W = 700, H = 300;
const BOX_W = 440, BOX_H = 180;
const SIX_W = 200, SIX_H = 60;
const GOAL_W = 80, GOAL_DEPTH = 9;
const PEN_SPOT_FROM_GOAL = 120;
const PEN_ARC_R = 100;
const CORNER_TAP_R = 56;   // tap zone (~5.6 yd) — bigger than the real arc for ergonomics
const CORNER_ARC_R = 10;   // visual arc, true scale (1 yd)

const cx = W / 2;
const goalY = H;
const boxTop = goalY - BOX_H;       // 120
const sixTop = goalY - SIX_H;       // 240
const boxL = cx - BOX_W / 2;        // 130
const boxR = cx + BOX_W / 2;        // 570
const sixL = cx - SIX_W / 2;        // 250
const sixR = cx + SIX_W / 2;        // 450
const goalL = cx - GOAL_W / 2;      // 310
const penSpotY = goalY - PEN_SPOT_FROM_GOAL;  // 180
// Penalty D arc intersects box-top (y=120) at x = cx ± √(r² - (boxTop-penSpotY)²)
//   = 350 ± √(100² - 60²) = 350 ± 80
const arcL = cx - 80;  // 270
const arcR = cx + 80;  // 430

export default function PitchOriginMap({ selected, geminiGuess, onSelect, theme }) {
  const t = theme || tDark;

  // Zone order matters: later items are drawn on top → corners win clicks
  // over the wide-side rectangles they overlap.
  const zones = [
    {
      id: "outC",
      path: `M${boxL},0 L${boxR},0 L${boxR},${boxTop} L${boxL},${boxTop} Z`,
      label: { x: cx, y: 56, text: "Central distance" },
    },
    {
      id: "outL",
      path: `M0,0 L${boxL},0 L${boxL},${goalY} L0,${goalY} Z`,
      label: { x: boxL / 2, y: 150, text: "Wide L" },
    },
    {
      id: "outR",
      path: `M${boxR},0 L${W},0 L${W},${goalY} L${boxR},${goalY} Z`,
      label: { x: boxR + (W - boxR) / 2, y: 150, text: "Wide R" },
    },
    {
      id: "boxL",
      path: `M${boxL},${boxTop} L${sixL},${boxTop} L${sixL},${goalY} L${boxL},${goalY} Z`,
      label: { x: (boxL + sixL) / 2, y: (boxTop + goalY) / 2, text: "Left ch." },
    },
    {
      id: "boxR",
      path: `M${sixR},${boxTop} L${boxR},${boxTop} L${boxR},${goalY} L${sixR},${goalY} Z`,
      label: { x: (sixR + boxR) / 2, y: (boxTop + goalY) / 2, text: "Right ch." },
    },
    {
      id: "boxC",
      path: `M${sixL},${boxTop} L${sixR},${boxTop} L${sixR},${sixTop} L${sixL},${sixTop} Z`,
      label: { x: cx, y: (boxTop + sixTop) / 2, text: "Central box" },
    },
    {
      id: "6yard",
      path: `M${sixL},${sixTop} L${sixR},${sixTop} L${sixR},${goalY} L${sixL},${goalY} Z`,
      label: { x: cx, y: sixTop + (goalY - sixTop) / 2, text: "6-yard" },
    },
    {
      id: "cornerL",
      path: `M0,${goalY} L${CORNER_TAP_R},${goalY} A${CORNER_TAP_R},${CORNER_TAP_R} 0 0,1 0,${goalY - CORNER_TAP_R} Z`,
      label: { x: 22, y: goalY - 18, text: "Corner" },
    },
    {
      id: "cornerR",
      path: `M${W},${goalY} L${W - CORNER_TAP_R},${goalY} A${CORNER_TAP_R},${CORNER_TAP_R} 0 0,0 ${W},${goalY - CORNER_TAP_R} Z`,
      label: { x: W - 22, y: goalY - 18, text: "Corner" },
    },
  ];

  const styleFor = (id) => {
    if (selected === id) return { fill: t.accent + "55", stroke: t.accent, sw: 2.5 };
    if (!selected && geminiGuess === id) return { fill: t.accent + "1f", stroke: t.accent + "AA", sw: 1.5 };
    return { fill: "#ffffff06", stroke: "#ffffff14", sw: 0.5 };
  };

  return (
    <div style={{ width: "100%" }}>
      <div style={{ fontSize: 9, color: t.dim, letterSpacing: 2, textTransform: "uppercase", textAlign: "center", marginBottom: 4 }}>
        attacking direction ↓
      </div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} style={{ width: "100%", display: "block" }} role="img" aria-label="Pitch zone selector for shot origin">
        <defs>
          <linearGradient id="grass-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#091c11" />
            <stop offset="100%" stopColor="#0e2418" />
          </linearGradient>
          {/* Mowing stripes (very subtle, alternate every 5 yards) */}
          <pattern id="mow" x="0" y="0" width={W} height="50" patternUnits="userSpaceOnUse">
            <rect x={0} y={0} width={W} height={25} fill="#ffffff04" />
          </pattern>
        </defs>
        <rect x={0} y={0} width={W} height={H} fill="url(#grass-grad)" />
        <rect x={0} y={0} width={W} height={H} fill="url(#mow)" />

        {/* Pitch lines drawn FIRST so zone fills sit above them subtly */}
        <g stroke="#2e6a42" strokeWidth={1.5} fill="none" style={{ pointerEvents: "none" }}>
          <rect x={boxL} y={boxTop} width={BOX_W} height={BOX_H} />
          <rect x={sixL} y={sixTop} width={SIX_W} height={SIX_H} />
          <path d={`M${arcL},${boxTop} A${PEN_ARC_R},${PEN_ARC_R} 0 0,1 ${arcR},${boxTop}`} />
          <line x1={0} y1={goalY} x2={W} y2={goalY} stroke="#3a7a4a" strokeWidth={1.2} />
        </g>
        <circle cx={cx} cy={penSpotY} r={2.5} fill="#3a7a4a" style={{ pointerEvents: "none" }} />

        {/* True-scale corner arcs (1 yd radius) */}
        <g fill="none" stroke="#2e6a42" strokeWidth={1.2} style={{ pointerEvents: "none" }}>
          <path d={`M0,${goalY - CORNER_ARC_R} A${CORNER_ARC_R},${CORNER_ARC_R} 0 0,0 ${CORNER_ARC_R},${goalY}`} />
          <path d={`M${W},${goalY - CORNER_ARC_R} A${CORNER_ARC_R},${CORNER_ARC_R} 0 0,1 ${W - CORNER_ARC_R},${goalY}`} />
        </g>

        {/* Clickable zones */}
        {zones.map(z => {
          const s = styleFor(z.id);
          const isSel = selected === z.id;
          const isGuess = !selected && geminiGuess === z.id;
          const lbl = z.label;
          return (
            <g key={z.id} onClick={() => onSelect(z.id)} style={{ cursor: "pointer" }}>
              <path d={z.path} fill={s.fill} stroke={s.stroke} strokeWidth={s.sw} style={{ transition: "all 0.15s" }} />
              <text
                x={lbl.x} y={lbl.y}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={z.id.startsWith("corner") ? 10 : 12}
                fontWeight={isSel ? 700 : (isGuess ? 600 : 500)}
                fill={isSel ? t.accent : (isGuess ? t.accent : "#7da291")}
                fontFamily={FONT}
                style={{ pointerEvents: "none" }}
              >
                {lbl.text}
              </text>
            </g>
          );
        })}

        {/* Goal block — drawn LAST so it sits on top of everything at the line */}
        <g style={{ pointerEvents: "none" }}>
          <rect x={goalL} y={goalY} width={GOAL_W} height={GOAL_DEPTH} rx={1} fill="#1b3a26" stroke="#e8eef2" strokeWidth={1.5} />
          <text x={cx} y={goalY + GOAL_DEPTH + 9} textAnchor="middle" fontSize={9} fontWeight={700} fill="#3a7a4a" fontFamily={FONT} letterSpacing={1}>
            GOAL
          </text>
        </g>
      </svg>
    </div>
  );
}
