"use client";
import { tDark } from "@/lib/theme";

export default function Sec({ children, title, icon, theme }) {
  const t = theme || tDark;
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        {icon && <span style={{ fontSize: 16 }}>{icon}</span>}
        <span style={{ fontSize: 13, fontWeight: 700, color: t.accent, textTransform: "uppercase", letterSpacing: 1.5 }}>{title || children}</span>
        <div style={{ flex: 1, height: 1, background: t.border, marginLeft: 8 }} />
      </div>
      {title && children}
    </div>
  );
}
