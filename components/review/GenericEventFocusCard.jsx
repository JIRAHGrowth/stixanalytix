"use client";
// Generic focus card used by FocusModeCrosses / FocusModeSweeper / FocusMode1v1.
//
// Design: header (label + prev/next + keeper_team toggle), action bar (reject /
// reclassify / confirm), video clip on the left, config-driven SegmentedField
// list on the right. No pitch/goal-mouth diagrams — the vocab for these three
// event types is enum-only, so segmented buttons cover it cleanly.
//
// Config shape:
//   { eventLabel: "Cross" | "Sweeper" | "1v1",
//     reclassifyTargets: [{ id: 'save', label: '→ Save' }, ...],
//     fields: [{ key, label, options, optionLabels?, phase? }, ...] }

import { FONT } from "@/lib/constants";
import { tDark } from "@/lib/theme";
import { fmtTs } from "@/lib/mappings";
import SegmentedField from "./SegmentedField";
import VideoClip from "./VideoClip";

export default function GenericEventFocusCard({
  row,
  index,
  total,
  config,             // { eventLabel, reclassifyTargets, fields }
  videoUrl,
  onChange,           // (patch) => void
  onConfirm,
  onReject,
  onReclassify,       // (targetType) => void
  onPrev,
  onNext,
  theme,
}) {
  const t = theme || tDark;
  const r = row;
  const g = r.gemini || {};

  const set = (patch) => onChange(patch);

  // Group fields by phase for consistent visual chunking. Fields with no phase
  // land in a default group at the top.
  const phaseOrder = [];
  const phaseGroups = {};
  for (const f of config.fields) {
    const phase = f.phase || "";
    if (!(phase in phaseGroups)) { phaseGroups[phase] = []; phaseOrder.push(phase); }
    phaseGroups[phase].push(f);
  }

  return (
    <div style={{
      background: t.card, border: `1px solid ${t.border}`, borderRadius: 14,
      overflow: "hidden", fontFamily: FONT,
    }}>
      {/* HEADER */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", background: t.cardAlt, borderBottom: `1px solid ${t.border}`,
        gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: t.dim, letterSpacing: 1, textTransform: "uppercase" }}>
            {config.eventLabel} · {index + 1} of {total}
          </span>
          <span style={{ fontSize: 13, color: t.bright, fontWeight: 700 }}>
            Video {fmtTs(r.timestamp_seconds)} · clock {r.match_clock || "—"}
          </span>
          {r._reclassified_from && (
            <span style={{ fontSize: 10, color: t.gold, background: t.gold + "22", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
              reclassified from {r._reclassified_from.source}
            </span>
          )}
          {r.coach_added && (
            <span style={{ fontSize: 10, color: t.accent, background: t.accent + "22", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
              coach-added
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Keeper attribution — mirror of SaveFocusCard so coach's mental model is stable */}
          <div style={{ display: "flex", border: `1px solid ${r.keeper_team === "opp" ? t.orange : t.green}55`, borderRadius: 6, overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => set({ keeper_team: "us" })}
              title="This event was for OUR keeper — counts toward stats"
              style={{
                padding: "5px 10px", fontSize: 11, fontWeight: 700, fontFamily: FONT,
                background: r.keeper_team === "us" ? t.green : "transparent",
                color: r.keeper_team === "us" ? "#fff" : t.dim,
                border: "none", cursor: "pointer",
              }}
            >Ours</button>
            <button
              type="button"
              onClick={() => set({ keeper_team: "opp" })}
              title="This event was for the OPPOSITION keeper — preserved as training data, excluded from stats"
              style={{
                padding: "5px 10px", fontSize: 11, fontWeight: 700, fontFamily: FONT,
                background: r.keeper_team === "opp" ? t.orange : "transparent",
                color: r.keeper_team === "opp" ? "#fff" : t.dim,
                border: "none", cursor: "pointer",
              }}
            >Opp</button>
          </div>
          <button type="button" onClick={onPrev} disabled={index === 0} style={btnGhost(t, index === 0)}>← Prev</button>
          <button type="button" onClick={onNext} disabled={index >= total - 1} style={btnGhost(t, index >= total - 1)}>Skip →</button>
        </div>
      </div>

      {/* ACTION BAR */}
      <div style={{
        padding: "10px 16px", borderBottom: `1px solid ${t.border}`,
        display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end",
        background: t.card,
      }}>
        <button type="button" onClick={onReject} style={btnReject(t)}>Reject</button>
        {onReclassify && (config.reclassifyTargets || []).map(target => (
          <button key={target.id} type="button" onClick={() => onReclassify(target.id)} style={btnReclassify(t)}>
            {target.label}
          </button>
        ))}
        <button type="button" onClick={onConfirm} style={btnConfirm(t)}>Confirm &amp; next →</button>
      </div>

      {/* BODY: video left, fields right */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(360px, 1.4fr)", gap: 16, padding: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <VideoClip
            clipUrl={g.clip_url}
            sourceUrl={videoUrl}
            timestampSeconds={r.timestamp_seconds}
            theme={t}
            label="4s before · 5s after"
          />
          {(g.shot_description || g.gk_observations || r.notes) && (
            <div style={{ background: t.cardAlt, border: `1px solid ${t.border}`, borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 10, color: t.dim, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
                Context
              </div>
              {g.shot_description && <div style={{ fontSize: 12, color: t.text, lineHeight: 1.5 }}>{g.shot_description}</div>}
              {g.gk_observations && <div style={{ fontSize: 11, color: t.dim, marginTop: 6, fontStyle: "italic" }}>GK: {g.gk_observations}</div>}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {phaseOrder.map((phase) => (
            <div key={phase || "_default"} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {phase && <PhaseLabel t={t}>// {phase.toUpperCase()}</PhaseLabel>}
              {phaseGroups[phase].map(f => (
                <SegmentedField
                  key={f.key}
                  label={f.label}
                  value={r[f.key]}
                  options={f.options}
                  optionLabels={f.optionLabels}
                  onChange={(v) => set({ [f.key]: v })}
                  theme={t}
                />
              ))}
            </div>
          ))}
          <div>
            <div style={{ fontSize: 10, color: t.dim, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>Notes</div>
            <textarea
              value={r.notes || ""}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="Optional observations"
              rows={2}
              style={{
                width: "100%", padding: "8px 10px", fontSize: 12, borderRadius: 6,
                background: t.cardAlt, border: `1px solid ${t.border}`, color: t.bright,
                fontFamily: FONT, resize: "vertical",
              }}
            />
          </div>
        </div>
      </div>

      <div style={{
        padding: "10px 16px", borderTop: `1px solid ${t.border}`,
        background: t.cardAlt,
        fontSize: 11, color: t.dim, fontFamily: "monospace",
      }}>
        ← prev · → next · Enter confirm · R reject
      </div>
    </div>
  );
}

function PhaseLabel({ t, children }) {
  return (
    <div style={{
      fontSize: 10, color: t.accent, letterSpacing: 1,
      textTransform: "uppercase", fontWeight: 700, fontFamily: "monospace",
      marginTop: 4,
    }}>{children}</div>
  );
}

function btnGhost(t, disabled) {
  return {
    padding: "5px 10px", fontSize: 11, borderRadius: 5,
    background: "transparent", color: disabled ? t.dim + "66" : t.dim,
    border: `1px solid ${t.border}`, fontFamily: FONT,
    cursor: disabled ? "default" : "pointer",
  };
}
function btnReject(t) {
  return {
    padding: "8px 14px", fontSize: 12, borderRadius: 6,
    background: "transparent", color: t.red,
    border: `1px solid ${t.red}66`, fontFamily: FONT,
    cursor: "pointer", fontWeight: 600,
  };
}
function btnReclassify(t) {
  return {
    padding: "8px 12px", fontSize: 12, borderRadius: 6,
    background: "transparent", color: t.gold,
    border: `1px solid ${t.gold}66`, fontFamily: FONT,
    cursor: "pointer", fontWeight: 600,
  };
}
function btnConfirm(t) {
  return {
    padding: "8px 18px", fontSize: 13, borderRadius: 6,
    background: t.accent, color: "#fff", border: "none",
    fontFamily: FONT, cursor: "pointer", fontWeight: 700,
  };
}
