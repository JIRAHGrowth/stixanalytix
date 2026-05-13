"use client";
import { tDark } from "@/lib/theme";

export default function Counter({ label, value, onChange, min = 0, compact, color, theme }) {
  const t = theme || tDark;
  // Touch targets — buttons are 52x52 (was 44x44) per Apple HIG / Material 48px
  // minimum, with the read-out widened to match. On a sideline phone, fat-
  // fingering between - and + happened constantly at 44x44 and zero gutter.
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: compact ? "5px 0" : "7px 0" }}>
      <span style={{ fontSize: compact ? 13 : 14, color: t.text, fontWeight: 500 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        <button onClick={() => onChange(Math.max(min, value - 1))} style={{
          width: 52, height: 52, borderRadius: "10px 0 0 10px",
          border: `1px solid ${t.border}`, background: t.bg, color: t.bright,
          fontSize: 22, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          touchAction: "manipulation",
        }}>{"\u2212"}</button>
        <div style={{
          width: 56, height: 52, display: "flex", alignItems: "center", justifyContent: "center",
          background: t.cardAlt, borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}`,
          fontSize: 19, fontWeight: 700, color: color || t.bright,
        }}>{value}</div>
        <button onClick={() => onChange(value + 1)} style={{
          width: 52, height: 52, borderRadius: "0 10px 10px 0",
          border: `1px solid ${t.border}`, background: t.bg, color: t.bright,
          fontSize: 22, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          touchAction: "manipulation",
        }}>+</button>
      </div>
    </div>
  );
}
