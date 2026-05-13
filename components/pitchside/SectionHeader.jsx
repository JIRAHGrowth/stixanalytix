"use client";
import { tDark } from "@/lib/theme";

export default function SectionHeader({ title, icon, accentColor, theme }) {
  const t = theme || tDark;
  const ac = accentColor || t.accent;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: t.bright }}>{title}</span>
    </div>
  );
}
