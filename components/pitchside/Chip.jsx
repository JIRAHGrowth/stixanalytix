"use client";
import { tDark } from "@/lib/theme";
import { FONT } from "@/lib/constants";

export default function Chip({ label, selected, onClick, small, color, theme }) {
  const t = theme || tDark;
  const font = FONT;
  const c = color || t.accent;
  return (
    <button onClick={onClick} style={{
      padding: small ? "10px 10px" : "14px 12px", borderRadius: 10,
      border: `1px solid ${selected ? c : t.border}`,
      background: selected ? c + "25" : t.bg,
      color: selected ? c : t.dim,
      fontSize: small ? 12 : 13, fontWeight: selected ? 700 : 500, cursor: "pointer",
      transition: "all 0.12s", textAlign: "center", lineHeight: 1.2, fontFamily: font,
      minHeight: 44,
    }}>{label}</button>
  );
}
