"use client";
import { tDark } from "@/lib/theme";
import { FONT } from "@/lib/constants";

export default function DeleteMatchConfirm({ match, onConfirm, onClose, theme }) {
  const t = theme || tDark;
  const font = FONT;
  const dateStr = new Date(match?.match_date || "").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const opponent = match?.opponent || "Unknown";

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, fontFamily: font }}>
      <div style={{ background: t.card, borderRadius: 12, border: `1px solid ${t.border}`, padding: 24, maxWidth: 420, width: "90%", color: t.text }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: t.red + "22", border: `1px solid ${t.red}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
            {"\u{1F5D1}\uFE0F"}
          </div>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: t.bright, margin: "0 0 6px" }}>Delete Match?</h2>
            <p style={{ fontSize: 13, color: t.dim, margin: 0, lineHeight: 1.5 }}>
              Delete match vs <strong style={{ color: t.text }}>{opponent}</strong> on <strong style={{ color: t.text }}>{dateStr}</strong>?
            </p>
            <p style={{ fontSize: 12, color: t.dim, margin: "10px 0 0", lineHeight: 1.5 }}>
              This will also remove all associated goals and attributes. This cannot be undone.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onConfirm} style={{ flex: 1, padding: "10px 14px", borderRadius: 6, background: t.red, border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: font }}>Delete</button>
          <button onClick={onClose} style={{ flex: 1, padding: "10px 14px", borderRadius: 6, background: t.cardAlt, border: `1px solid ${t.border}`, color: t.text, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: font }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
