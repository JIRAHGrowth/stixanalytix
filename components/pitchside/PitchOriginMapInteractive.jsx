"use client";
import { tDark } from "@/lib/theme";
import { FONT } from "@/lib/constants";

export default function PitchOriginMapInteractive({ selected, onSelect, theme }) {
  const t = theme || tDark;
  const font = FONT;
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
    "boxL": { x: (boxL + sixL) / 2, y: (boxTop + goalY) / 2, t: "Left Ch." },
    "boxC": { x: cx, y: (boxTop + sixTop) / 2, t: "Central" },
    "boxR": { x: (sixR + boxR) / 2, y: (boxTop + goalY) / 2, t: "Right Ch." },
    "outL": { x: boxL / 2, y: (10 + goalY) / 2, t: "Wide L" },
    "outC": { x: cx, y: (10 + boxTop) / 2, t: "Cntrl Dist." },
    "outR": { x: (boxR + w) / 2, y: (10 + goalY) / 2, t: "Wide R" },
    "cornerL": { x: 16, y: goalY - 14, t: "Corner" },
    "cornerR": { x: w - 16, y: goalY - 14, t: "Corner" },
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
      <text x={cx} y={h - 1} textAnchor="middle" fontSize={7} fill="#3a6a4a88" fontFamily={font}>{"\u2193"} keeper&apos;s goal {"\u2193"}</text>
    </svg>
  );
}
