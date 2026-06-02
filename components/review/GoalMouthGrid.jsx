"use client";
// True-to-life goal mouth grid for the review screen.
// Geometry: a regulation goal is 24 ft wide × 8 ft tall → aspect 3:1.
// viewBox 360×120 keeps that exact ratio; each 3×3 cell is 120×40 (also 3:1).
// Off-target zones flank the goal as labelled ribbons (not to scale — they are
// abstract "missed" buckets, not pitch geometry).

import { tDark } from "@/lib/theme";
import { GOAL_ZONES, FONT } from "@/lib/constants";

const POST = 4;              // post thickness in SVG units
const NET_STROKE = 0.6;
const NET_COLOR = "#ffffff10";
const FRAME_COLOR = "#e8eef2";

export default function GoalMouthGrid({ selected, geminiGuess, onSelect, theme }) {
  const t = theme || tDark;

  // Side-ribbon width and over-bar ribbon height. Chosen for legibility, not
  // realism — the goal frame itself is the load-bearing geometry.
  const RIB_W = 56;
  const RIB_H = 34;

  const totalW = RIB_W + 360 + RIB_W;            // 472
  const totalH = RIB_H + 120;                    // 154

  // Cell origin inside the goal frame
  const gX = RIB_W;       // 56
  const gY = RIB_H;       // 34
  const cellW = 120;
  const cellH = 40;

  const isSel = (z) => selected === z;
  const isGuess = (z) => !selected && geminiGuess === z;

  const fillForZone = (z) => {
    if (isSel(z)) return t.red + "55";
    if (isGuess(z)) return t.accent + "33";
    return "transparent";
  };
  const strokeForZone = (z) => {
    if (isSel(z)) return t.red;
    if (isGuess(z)) return t.accent;
    return "transparent";
  };

  return (
    <div style={{ width: "100%" }}>
      <div style={{ fontSize: 9, color: t.dim, letterSpacing: 2, textTransform: "uppercase", textAlign: "center", marginBottom: 4 }}>
        ← view from behind the keeper →
      </div>
      <svg viewBox={`0 0 ${totalW} ${totalH}`} style={{ width: "100%", display: "block" }} role="img" aria-label="Goal mouth zone selector">
        {/* OVER BAR ribbon — sits above the goal, full goal width */}
        <g onClick={() => onSelect("Over Bar")} style={{ cursor: "pointer" }}>
          <rect
            x={gX} y={0} width={360} height={RIB_H}
            rx={4}
            fill={fillForZone("Over Bar")}
            stroke={strokeForZone("Over Bar")}
            strokeWidth={isSel("Over Bar") || isGuess("Over Bar") ? 2 : 1}
            style={{ transition: "all 0.15s" }}
          />
          <text x={gX + 180} y={RIB_H / 2 + 1} textAnchor="middle" dominantBaseline="middle"
            fontSize={11} fontWeight={isSel("Over Bar") ? 700 : 600}
            fill={isSel("Over Bar") ? t.red : (isGuess("Over Bar") ? t.accent : t.dim)}
            fontFamily={FONT} style={{ pointerEvents: "none", letterSpacing: 1, textTransform: "uppercase" }}>
            Over Bar
          </text>
        </g>

        {/* WIDE LEFT ribbon */}
        <g onClick={() => onSelect("Wide Left")} style={{ cursor: "pointer" }}>
          <rect
            x={0} y={RIB_H} width={RIB_W} height={120}
            rx={4}
            fill={fillForZone("Wide Left")}
            stroke={strokeForZone("Wide Left")}
            strokeWidth={isSel("Wide Left") || isGuess("Wide Left") ? 2 : 1}
            style={{ transition: "all 0.15s" }}
          />
          <text
            x={RIB_W / 2} y={RIB_H + 60}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={10} fontWeight={isSel("Wide Left") ? 700 : 600}
            fill={isSel("Wide Left") ? t.red : (isGuess("Wide Left") ? t.accent : t.dim)}
            fontFamily={FONT}
            style={{ pointerEvents: "none", letterSpacing: 1, textTransform: "uppercase" }}
            transform={`rotate(-90 ${RIB_W / 2} ${RIB_H + 60})`}
          >
            Wide L
          </text>
        </g>

        {/* WIDE RIGHT ribbon */}
        <g onClick={() => onSelect("Wide Right")} style={{ cursor: "pointer" }}>
          <rect
            x={RIB_W + 360} y={RIB_H} width={RIB_W} height={120}
            rx={4}
            fill={fillForZone("Wide Right")}
            stroke={strokeForZone("Wide Right")}
            strokeWidth={isSel("Wide Right") || isGuess("Wide Right") ? 2 : 1}
            style={{ transition: "all 0.15s" }}
          />
          <text
            x={RIB_W + 360 + RIB_W / 2} y={RIB_H + 60}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={10} fontWeight={isSel("Wide Right") ? 700 : 600}
            fill={isSel("Wide Right") ? t.red : (isGuess("Wide Right") ? t.accent : t.dim)}
            fontFamily={FONT}
            style={{ pointerEvents: "none", letterSpacing: 1, textTransform: "uppercase" }}
            transform={`rotate(90 ${RIB_W + 360 + RIB_W / 2} ${RIB_H + 60})`}
          >
            Wide R
          </text>
        </g>

        {/* Pitch / grass behind goal */}
        <rect x={gX} y={gY} width={360} height={120} fill="#0c1a12" />

        {/* Net pattern (diagonals both ways) — clipped to the goal mouth */}
        <defs>
          <clipPath id="goalMouthClip">
            <rect x={gX} y={gY} width={360} height={120} />
          </clipPath>
        </defs>
        <g clipPath="url(#goalMouthClip)" style={{ pointerEvents: "none" }}>
          {Array.from({ length: 24 }).map((_, i) => {
            const off = i * 20 - 120;
            return (
              <line key={`d1-${i}`} x1={gX + off} y1={gY} x2={gX + off + 120} y2={gY + 120}
                stroke={NET_COLOR} strokeWidth={NET_STROKE} />
            );
          })}
          {Array.from({ length: 24 }).map((_, i) => {
            const off = i * 20 - 120;
            return (
              <line key={`d2-${i}`} x1={gX + off} y1={gY + 120} x2={gX + off + 120} y2={gY}
                stroke={NET_COLOR} strokeWidth={NET_STROKE} />
            );
          })}
        </g>

        {/* 3×3 grid of clickable cells. zones are listed L→R, top→bottom. */}
        {GOAL_ZONES.map((z, i) => {
          const col = i % 3;
          const row = Math.floor(i / 3);
          const x = gX + col * cellW;
          const y = gY + row * cellH;
          const sel = isSel(z);
          const guess = isGuess(z);
          return (
            <g key={z} onClick={() => onSelect(z)} style={{ cursor: "pointer" }}>
              <rect
                x={x + 1} y={y + 1} width={cellW - 2} height={cellH - 2}
                fill={fillForZone(z)}
                stroke={strokeForZone(z)}
                strokeWidth={sel || guess ? 2 : 0}
                rx={2}
                style={{ transition: "all 0.15s" }}
              />
              <text x={x + cellW / 2} y={y + cellH / 2 + 1}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={11} fontWeight={sel ? 700 : (guess ? 600 : 500)}
                fill={sel ? t.red : (guess ? t.accent : "#8a9aa6")}
                fontFamily={FONT} style={{ pointerEvents: "none" }}>
                {z}
              </text>
            </g>
          );
        })}

        {/* Internal grid divider lines (subtle) */}
        <g style={{ pointerEvents: "none" }}>
          <line x1={gX + cellW} y1={gY} x2={gX + cellW} y2={gY + 120} stroke="#ffffff18" strokeWidth={0.8} />
          <line x1={gX + 2 * cellW} y1={gY} x2={gX + 2 * cellW} y2={gY + 120} stroke="#ffffff18" strokeWidth={0.8} />
          <line x1={gX} y1={gY + cellH} x2={gX + 360} y2={gY + cellH} stroke="#ffffff18" strokeWidth={0.8} />
          <line x1={gX} y1={gY + 2 * cellH} x2={gX + 360} y2={gY + 2 * cellH} stroke="#ffffff18" strokeWidth={0.8} />
        </g>

        {/* Goal frame: posts + crossbar drawn LAST so they sit above the net */}
        <g style={{ pointerEvents: "none" }}>
          <rect x={gX - POST / 2} y={gY - POST / 2} width={POST} height={120 + POST} fill={FRAME_COLOR} />
          <rect x={gX + 360 - POST / 2} y={gY - POST / 2} width={POST} height={120 + POST} fill={FRAME_COLOR} />
          <rect x={gX - POST / 2} y={gY - POST / 2} width={360 + POST} height={POST} fill={FRAME_COLOR} />
          {/* Goal line on grass */}
          <line x1={gX} y1={gY + 120} x2={gX + 360} y2={gY + 120} stroke="#e8eef266" strokeWidth={1.2} />
        </g>
      </svg>
    </div>
  );
}
