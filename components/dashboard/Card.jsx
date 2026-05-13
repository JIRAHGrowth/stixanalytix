"use client";
import { tDark } from "@/lib/theme";

export default function Card({ children, s, theme }) {
  const t = theme || tDark;
  return <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, ...s }}>{children}</div>;
}
