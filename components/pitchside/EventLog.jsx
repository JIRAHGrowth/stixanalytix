"use client";
import { tDark } from "@/lib/theme";
import { GK_ACTION_LABELS, FONT } from "@/lib/constants";

export default function EventLog({ events, half, onUndo, theme }) {
  const t = theme || tDark;
  const font = FONT;
  const halfEvents = events.filter(e => e.half === half);
  if (halfEvents.length === 0) return null;

  const describeEvent = (e) => {
    let desc = e.type;
    if (e.offTarget) return `${desc} \u2192 Off Target`;
    if (e.gkAction) desc += ` \u2192 ${GK_ACTION_LABELS[e.gkAction] || e.gkAction}`;
    if (e.isGoal) desc += " \u2192 GOAL";
    return desc;
  };

  return (
    <div style={{ background: t.card, borderRadius: 12, padding: "10px 14px", marginBottom: 8, border: `1px solid ${t.border}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: t.dim, textTransform: "uppercase", letterSpacing: 1 }}>
          {half} Event Log ({halfEvents.length})
        </span>
        {events.length > 0 && (
          <button onClick={onUndo} style={{
            padding: "6px 14px", borderRadius: 8, border: `1px solid ${t.orange}44`,
            background: t.orange + "11", color: t.orange, fontSize: 11,
            fontWeight: 700, cursor: "pointer", fontFamily: font, minHeight: 36,
          }}>{"\u21A9"} Undo Last</button>
        )}
      </div>
      <div style={{ maxHeight: 120, overflow: "auto" }}>
        {halfEvents.slice().reverse().map((e, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "4px 0",
            borderTop: i > 0 ? `1px solid ${t.border}11` : "none",
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: 4, flexShrink: 0,
              background: e.isGoal ? t.red : e.offTarget ? t.dim : t.green,
            }} />
            <span style={{ fontSize: 11, color: e.isGoal ? t.red : t.text, fontWeight: e.isGoal ? 600 : 400 }}>
              {describeEvent(e)}
            </span>
            {e.goalZone && <span style={{ fontSize: 9, color: t.dim }}>({e.goalZone})</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
