"use client";
import { tDark } from "@/lib/theme";

export default function EmptyState({ icon, title, subtitle, theme }) {
  const t = theme || tDark;
  return (
    <div style={{ background: t.card, borderRadius: 12, border: `1px solid ${t.border}`, padding: 40, textAlign: "center" }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: t.bright, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: t.dim, lineHeight: 1.5 }}>{subtitle}</div>
    </div>
  );
}
