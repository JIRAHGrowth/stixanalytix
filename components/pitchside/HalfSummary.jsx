"use client";
import { tDark } from "@/lib/theme";
import { SHOT_ORIGINS, FONT } from "@/lib/constants";

export default function HalfSummary({ half, events, halves, goalsFor, onClose, clubName, opponent, theme }) {
  const t = theme || tDark;
  const font = FONT;
  const hEvents = events.filter(e => e.half === half);
  const shots = hEvents.filter(e => e.type === "Shot" || e.type === "1v1" || e.type === "Penalty");
  const saves = hEvents.filter(e => !e.isGoal && !e.offTarget && (e.type === "Shot" || e.type === "1v1" || e.type === "Penalty") && e.gkAction && e.gkAction !== "Missed/Misjudged" && !e.gkAction.startsWith("Goal"));
  const goals = hEvents.filter(e => e.isGoal);
  const crosses = hEvents.filter(e => e.type === "Cross" || e.type === "Corner");
  const claims = crosses.filter(e => e.gkAction === "Catch");
  const sot = shots.filter(e => !e.offTarget).length;
  const svPct = sot > 0 ? (((sot - goals.length) / sot) * 100).toFixed(1) + "%" : "\u2014";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: t.card, borderRadius: 16, width: "100%", maxWidth: 400, padding: 20, maxHeight: "85vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: t.bright }}>{"\uD83D\uDCCB"} {half} Summary</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: t.dim, fontSize: 22, cursor: "pointer" }}>{"\u2715"}</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
          {[
            { l: "SOT", v: sot },
            { l: "GA", v: goals.length, c: goals.length >= 2 ? t.red : t.bright },
            { l: "Sv%", v: svPct, c: sot > 0 && saves.length / sot >= 0.85 ? t.green : t.bright },
          ].map(m => (
            <div key={m.l} style={{ background: t.bg, borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: t.dim, textTransform: "uppercase", fontWeight: 600 }}>{m.l}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: m.c || t.bright, marginTop: 2 }}>{m.v}</div>
            </div>
          ))}
        </div>
        {goals.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: t.dim, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>Goals conceded</div>
            {goals.map((gl, i) => (
              <div key={i} style={{ fontSize: 11, color: t.text, padding: "4px 0", borderBottom: `1px solid ${t.border}11` }}>
                {gl.method === "Own Goal" ? "\uD83D\uDFE3 OG" : "\uD83D\uDEA8"} {gl.type} {"\u2022"} {SHOT_ORIGINS.find(o => o.id === gl.origin)?.label || gl.origin || "Penalty"}
                {gl.goalZone ? ` \u2022 ${gl.goalZone}` : ""}{gl.rank ? ` \u2022 ${gl.rank}` : ""}
              </div>
            ))}
          </div>
        )}
        <button onClick={onClose} style={{ width: "100%", padding: 14, borderRadius: 10, border: "none", background: t.accent, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: font, minHeight: 48 }}>Back to Match</button>
      </div>
    </div>
  );
}
