"use client";
import { tDark } from "@/lib/theme";
import { GOAL_ZONES, FONT } from "@/lib/constants";

export default function GoalZoneMap({ selected, onSelect, showOffTarget, theme }) {
  const t = theme || tDark;
  const font = FONT;
  const zoneLabels = GOAL_ZONES;
  const bw = 3;
  const selOff = (z) => selected === z ? t.orange + "33" : "transparent";
  const selOffBorder = (z) => selected === z ? t.orange : t.border;
  const selOffColor = (z) => selected === z ? t.orange : t.dim;
  const selOffWeight = (z) => selected === z ? 700 : 500;
  return (
    <div style={{ position: "relative", background: t.bg, borderRadius: 10, border: `1px solid ${t.border}`, padding: 8 }}>
      <div style={{ position: "absolute", top: 2, left: "50%", transform: "translateX(-50%)", fontSize: 9, color: t.dim + "88", letterSpacing: 2, textTransform: "uppercase" }}>{"\u2190"} goal face {"\u2192"}</div>
      {showOffTarget !== false && (
        <div onClick={() => onSelect("Over Bar")} style={{ cursor: "pointer", width: "100%", maxWidth: 340, margin: "8px auto 0", height: 22, display: "flex", alignItems: "center", justifyContent: "center", border: `${bw}px solid ${selOffBorder("Over Bar")}`, borderBottom: "none", borderRadius: "6px 6px 0 0", background: selOff("Over Bar"), transition: "all 0.15s" }}>
          <span style={{ fontSize: 9, fontWeight: selOffWeight("Over Bar"), color: selOffColor("Over Bar"), textTransform: "uppercase", letterSpacing: 1, fontFamily: font }}>Over Bar</span>
        </div>
      )}
      <div style={{ display: "flex", width: "100%", maxWidth: 340, margin: showOffTarget === false ? "8px auto 0" : "0 auto" }}>
        {showOffTarget !== false && (
          <div onClick={() => onSelect("Wide Left")} style={{ cursor: "pointer", width: 28, display: "flex", alignItems: "center", justifyContent: "center", border: `${bw}px solid ${selOffBorder("Wide Left")}`, borderRight: "none", borderRadius: "6px 0 0 6px", background: selOff("Wide Left"), transition: "all 0.15s" }}>
            <span style={{ writingMode: "vertical-rl", textOrientation: "mixed", fontSize: 9, fontWeight: selOffWeight("Wide Left"), color: selOffColor("Wide Left"), textTransform: "uppercase", letterSpacing: 1, fontFamily: font }}>Wide L</span>
          </div>
        )}
        <svg viewBox="0 0 300 180" style={{ flex: 1, display: "block" }}>
          <rect x={0} y={0} width={300} height={180} rx={0} fill="none" stroke="#4a9a5a" strokeWidth={bw} />
          {[1, 2].map(i => (<line key={`v${i}`} x1={100 * i} y1={0} x2={100 * i} y2={180} stroke={t.border} strokeWidth={1} />))}
          {[1, 2].map(i => (<line key={`h${i}`} x1={0} y1={60 * i} x2={300} y2={60 * i} stroke={t.border} strokeWidth={1} />))}
          {zoneLabels.map((z, i) => {
            const col = i % 3, row = Math.floor(i / 3);
            const isSelected = selected === z;
            return (<g key={z} onClick={() => onSelect(z)} style={{ cursor: "pointer" }}>
              <rect x={col * 100 + 1} y={row * 60 + 1} width={98} height={58} fill={isSelected ? t.red + "44" : "transparent"} rx={3} stroke={isSelected ? t.red : "transparent"} strokeWidth={isSelected ? 2 : 0} style={{ transition: "all 0.15s" }} />
              <text x={col * 100 + 50} y={row * 60 + 30} textAnchor="middle" dominantBaseline="middle" fontSize={11} fontWeight={isSelected ? 700 : 500} fill={isSelected ? t.red : t.dim} fontFamily={font} style={{ pointerEvents: "none" }}>{z}</text>
            </g>);
          })}
        </svg>
        {showOffTarget !== false && (
          <div onClick={() => onSelect("Wide Right")} style={{ cursor: "pointer", width: 28, display: "flex", alignItems: "center", justifyContent: "center", border: `${bw}px solid ${selOffBorder("Wide Right")}`, borderLeft: "none", borderRadius: "0 6px 6px 0", background: selOff("Wide Right"), transition: "all 0.15s" }}>
            <span style={{ writingMode: "vertical-rl", textOrientation: "mixed", fontSize: 9, fontWeight: selOffWeight("Wide Right"), color: selOffColor("Wide Right"), textTransform: "uppercase", letterSpacing: 1, fontFamily: font }}>Wide R</span>
          </div>
        )}
      </div>
    </div>
  );
}
