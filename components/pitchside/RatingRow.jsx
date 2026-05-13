"use client";
import { tDark } from "@/lib/theme";

export default function RatingRow({ label, value, onChange, theme }) {
  const t = theme || tDark;
  return (
    <div style={{ padding: "6px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: t.text, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: value ? (value >= 4 ? t.green : value >= 3 ? t.gold : t.red) : t.dim }}>{value || "\u2014"}</span>
      </div>
      <input type="range" min={1} max={5} step={0.5} value={value || 0} onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: t.accent, height: 6, cursor: "pointer" }} />
    </div>
  );
}
