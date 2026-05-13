"use client";
import { useState } from "react";
import { tDark } from "@/lib/theme";
import { FONT } from "@/lib/constants";
import Card from "@/components/dashboard/Card";
import Sec from "@/components/dashboard/Sec";
import GoalHeatmap from "@/components/dashboard/GoalHeatmap";

function useBreakpoint() {
  const [w] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  return { isMobile: w < 768 };
}

export default function SingleGameView({ match, goals, logRow, keeperName, primaryColor, onBack, onReport, theme }) {
  const t = theme || tDark;
  const font = FONT;
  const bp = useBreakpoint();

  if (!match) return (
    <div style={{ padding: 32, color: t.dim, textAlign: "center" }}>
      Match data unavailable.
      <button onClick={onBack} style={{ marginTop: 16, display: "block", margin: "16px auto 0", padding: "8px 20px", background: t.accent, color: "#000", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: font }}>{"\u2190"} Back</button>
    </div>
  );

  const pc = primaryColor || t.accent;
  const svPct = match.shots_on_target > 0 ? (match.saves / match.shots_on_target * 100).toFixed(1) : "\u2013";
  const resultColor = logRow.res === "W" ? t.green : logRow.res === "L" ? t.red : t.yellow;
  const isMatch = match.session_type === "match";

  const saveTypes = [
    { label: "Catch", val: match.saves_catch || 0 },
    { label: "Parry", val: match.saves_parry || 0 },
    { label: "Smother", val: match.saves_dive || 0 },
    { label: "Block", val: match.saves_block || 0 },
    { label: "Deflect", val: match.saves_tip || 0 },
    { label: "Punch", val: match.saves_punch || 0 },
  ].filter(s => s.val > 0);
  const maxSave = Math.max(...saveTypes.map(s => s.val), 1);

  const goalZones = {};
  goals.forEach(g => { if (g.goal_zone) goalZones[g.goal_zone] = (goalZones[g.goal_zone] || 0) + 1; });

  const distRows = [
    { name: "GK Short", att: match.dist_gk_short_att || 0, suc: match.dist_gk_short_suc || 0 },
    { name: "GK Long", att: match.dist_gk_long_att || 0, suc: match.dist_gk_long_suc || 0 },
    { name: "Throws", att: match.dist_throws_att || 0, suc: match.dist_throws_suc || 0 },
    { name: "Passes", att: match.dist_passes_att || 0, suc: match.dist_passes_suc || 0 },
  ].filter(d => d.att > 0);

  const notes = match.coaching_notes || match.notes || null;
  const focus = match.coach_focus || match.session_focus || null;

  return (
    <div style={{ fontFamily: font, color: t.text }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: t.cardAlt, border: `1px solid ${t.border}`, borderRadius: 8, padding: "8px 14px", color: t.bright, fontSize: 12, cursor: "pointer", fontFamily: font }}>
          {"\u2190"} Back to Matches
        </button>
        <button onClick={() => onReport(match)} style={{ background: t.accent, border: "none", borderRadius: 8, padding: "8px 16px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: font, boxShadow: `0 0 12px ${t.accentGlow}` }}>
          {"\uD83D\uDCC4"} Generate Report
        </button>
      </div>

      <Card theme={t} s={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: t.bright }}>{logRow.opp}</div>
            <div style={{ fontSize: 12, color: t.dim, marginTop: 2 }}>{logRow.date} {"\u00B7"} {logRow.ha} {"\u00B7"} {isMatch ? "Match" : "Training"}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isMatch && <div style={{ fontSize: 22, fontWeight: 800, color: resultColor }}>{logRow.score || "\u2013"}</div>}
            {isMatch && (
              <div style={{ padding: "4px 10px", borderRadius: 6, background: resultColor + "22", color: resultColor, fontSize: 12, fontWeight: 700 }}>{logRow.res}</div>
            )}
            {match.goals_conceded === 0 && isMatch && (
              <div style={{ padding: "4px 10px", borderRadius: 6, background: t.green + "22", color: t.green, fontSize: 11, fontWeight: 700 }}>CS {"\u2713"}</div>
            )}
          </div>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "repeat(2, 1fr)" : "repeat(auto-fit, minmax(80px, 1fr))", gap: 8, marginBottom: 12 }}>
        {[
          { label: "SOT", val: match.shots_on_target ?? "\u2013" },
          { label: "Saves", val: match.saves ?? "\u2013" },
          { label: "GA", val: match.goals_conceded ?? "\u2013" },
          { label: "Sv%", val: svPct !== "\u2013" ? svPct + "%" : "\u2013" },
          { label: "1v1 W", val: match.one_v_one_won != null ? `${match.one_v_one_won}/${match.one_v_one_faced || 0}` : "\u2013" },
          { label: "Err\u2192Gol", val: match.errors_leading_to_goal ?? 0 },
        ].map(s => (
          <div key={s.label} style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: t.bright }}>{s.val}</div>
            <div style={{ fontSize: 9, color: t.dim, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {saveTypes.length > 0 && (
          <Card theme={t}>
            <Sec theme={t} icon={"\uD83E\uDDE4"}>Save Types</Sec>
            {saveTypes.map(s => (
              <div key={s.label} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                  <span style={{ color: t.text }}>{s.label}</span>
                  <span style={{ color: t.bright, fontWeight: 600 }}>{s.val}</span>
                </div>
                <div style={{ height: 6, background: t.bg, borderRadius: 3 }}>
                  <div style={{ height: "100%", width: `${(s.val / maxSave) * 100}%`, background: pc, borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </Card>
        )}
        <Card theme={t}>
          <GoalHeatmap theme={t} zones={goalZones} title={match.goals_conceded > 0 ? `${match.goals_conceded} Goal${match.goals_conceded !== 1 ? "s" : ""} Conceded` : "Clean Sheet"} />
        </Card>
      </div>

      {goals.length > 0 && (
        <Card theme={t} s={{ marginBottom: 12 }}>
          <Sec theme={t} icon={"\u26BD"}>Goal Analysis</Sec>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: t.dim, marginBottom: 6, textTransform: "uppercase" }}>Rank</div>
              {["Saveable", "Difficult", "Unsaveable"].map(r => {
                const cnt = goals.filter(g => g.goal_rank === r).length;
                return cnt > 0 ? (
                  <div key={r} style={{ fontSize: 11, display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ color: t.text }}>{r}</span>
                    <span style={{ fontWeight: 700, color: r === "Saveable" ? t.red : r === "Difficult" ? t.yellow : t.dim }}>{cnt}</span>
                  </div>
                ) : null;
              })}
            </div>
            <div>
              <div style={{ fontSize: 10, color: t.dim, marginBottom: 6, textTransform: "uppercase" }}>Source</div>
              {["Open Play", "Corner", "Free Kick", "Penalty"].map(s => {
                const cnt = goals.filter(g => g.goal_source === s).length;
                return cnt > 0 ? (
                  <div key={s} style={{ fontSize: 11, display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ color: t.text }}>{s}</span>
                    <span style={{ fontWeight: 700, color: t.bright }}>{cnt}</span>
                  </div>
                ) : null;
              })}
            </div>
            <div>
              <div style={{ fontSize: 10, color: t.dim, marginBottom: 6, textTransform: "uppercase" }}>Shot Type</div>
              {["Foot", "Header", "Deflection"].map(s => {
                const cnt = goals.filter(g => g.shot_type === s).length;
                return cnt > 0 ? (
                  <div key={s} style={{ fontSize: 11, display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ color: t.text }}>{s}</span>
                    <span style={{ fontWeight: 700, color: t.bright }}>{cnt}</span>
                  </div>
                ) : null;
              })}
            </div>
          </div>
        </Card>
      )}

      {distRows.length > 0 && (
        <Card theme={t} s={{ marginBottom: 12 }}>
          <Sec theme={t} icon={"\uD83C\uDFAF"}>Distribution Accuracy</Sec>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
            {distRows.map(d => {
              const p = d.att > 0 ? Math.round(d.suc / d.att * 100) : null;
              return (
                <div key={d.name} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: p >= 80 ? t.green : p >= 60 ? t.accent : t.yellow }}>{p != null ? p + "%" : "\u2013"}</div>
                  <div style={{ fontSize: 10, color: t.dim, marginTop: 2 }}>{d.name}</div>
                  <div style={{ fontSize: 10, color: t.text, marginTop: 1 }}>{d.suc}/{d.att}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card theme={t} s={{ marginBottom: 12 }}>
        <Sec theme={t} icon={"\uD83C\uDFC3"}>Physical & Crosses</Sec>
        <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: t.dim, marginBottom: 8, textTransform: "uppercase" }}>Sweeper</div>
            {[
              { label: "Clearances", val: match.sweeper_clearances },
              { label: "Interceptions", val: match.sweeper_interceptions },
              { label: "Tackles", val: match.sweeper_tackles },
            ].map(x => (
              <div key={x.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}>
                <span style={{ color: t.text }}>{x.label}</span>
                <span style={{ fontWeight: 700, color: t.bright }}>{x.val ?? 0}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 10, color: t.dim, marginBottom: 8, textTransform: "uppercase" }}>Crosses</div>
            {[
              { label: "Claimed", val: match.crosses_claimed },
              { label: "Punched", val: match.crosses_punched },
              { label: "Missed", val: match.crosses_missed },
            ].map(x => (
              <div key={x.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}>
                <span style={{ color: t.text }}>{x.label}</span>
                <span style={{ fontWeight: 700, color: t.bright }}>{x.val ?? 0}</span>
              </div>
            ))}
            {(match.crosses_total > 0) && (
              <div style={{ marginTop: 6, fontSize: 11, color: t.dim, borderTop: `1px solid ${t.border}`, paddingTop: 6 }}>
                Claim rate: <span style={{ color: t.bright, fontWeight: 700 }}>
                  {Math.round((match.crosses_claimed || 0) / match.crosses_total * 100)}%
                </span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {notes && (
        <Card theme={t} s={{ borderLeft: `3px solid ${pc}` }}>
          <Sec theme={t} icon={"\uD83D\uDCCB"}>Coaching Notes</Sec>
          <p style={{ fontSize: 12, color: t.text, lineHeight: 1.7, margin: 0 }}>{notes}</p>
          {focus && (
            <div style={{ marginTop: 10, background: pc + "15", borderRadius: 6, padding: "8px 12px", fontSize: 11, color: pc }}>
              <strong>Session Focus:</strong> {focus}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
