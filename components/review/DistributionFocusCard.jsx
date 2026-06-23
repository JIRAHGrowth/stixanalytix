"use client";
// Single-event review card for a Distribution event.
// Top: video clip + AI observation.
// Right: landscape pitch with 12 target zones.
// Bottom: three phases — The Trigger / The Ball / The Outcome.
// Footer: Reject · Reclassify · Confirm.

import {
  DIST_TRIGGERS, DIST_TRIGGER_LABELS, DIST_TYPES, DIST_TYPE_LABELS,
  DIST_PRESSURE, DIST_SUCCESSFUL, DIST_SUCCESSFUL_LABELS,
  DIST_FIRST_TOUCH, DIST_FIRST_TOUCH_LABELS,
  FONT,
} from "@/lib/constants";
import { tDark } from "@/lib/theme";
import { fmtTs } from "@/lib/mappings";
import DistributionTargetMap from "./DistributionTargetMap";
import SegmentedField from "./SegmentedField";
import VideoClip from "./VideoClip";

export default function DistributionFocusCard({
  row,
  index,
  total,
  videoUrl,
  onChange,
  onConfirm,
  onReject,
  onReclassify,    // (targetType: 'goal' | 'save') => void
  onPrev,
  onNext,
  theme,
}) {
  const t = theme || tDark;
  const r = row;
  const g = r.gemini || {};

  const confidence = (g.confidence || "").toLowerCase();
  const confDot = confidence === "high" ? "●●●" : confidence === "medium" ? "●●○" : confidence === "low" ? "●○○" : "○○○";
  const confColor = confidence === "high" ? t.green : confidence === "medium" ? t.gold : confidence === "low" ? t.orange : t.dim;

  const set = (patch) => onChange(patch);

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
            Distribution · {index + 1} of {total}
          </span>
          <span style={{ fontSize: 13, color: t.bright, fontWeight: 700 }}>
            Video {fmtTs(r.timestamp_seconds)} · clock {r.match_clock || "—"}
          </span>
          {confidence && (
            <span style={{ fontSize: 11, color: confColor, fontFamily: "monospace" }}>
              AI confidence {confDot} {confidence}
            </span>
          )}
          {r._reclassified_from && (
            <span style={{ fontSize: 10, color: t.gold, background: t.gold + "22", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
              reclassified from {r._reclassified_from.source}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Keeper attribution — "Opp" rows are kept as training data but
              excluded from the analyzed keeper's dashboard rollups. */}
          <div style={{ display: "flex", border: `1px solid ${r.keeper_team === "opp" ? t.orange : t.green}55`, borderRadius: 6, overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => set({ keeper_team: "us" })}
              title="This distribution was by OUR keeper — counts toward stats"
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
              title="This distribution was by the OPPOSITION keeper — preserved as training data, excluded from stats"
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

      {/* ACTION BAR — moved up from footer so corrections don't require scrolling */}
      <div style={{
        padding: "10px 16px", borderBottom: `1px solid ${t.border}`,
        display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end",
        background: t.card,
      }}>
        <button type="button" onClick={onReject} style={btnReject(t)}>Reject</button>
        {onReclassify && (
          <>
            <button type="button" onClick={() => onReclassify("goal")} style={btnReclassify(t)}>→ Goal</button>
            <button type="button" onClick={() => onReclassify("save")} style={btnReclassify(t)}>→ Save</button>
          </>
        )}
        <button type="button" onClick={onConfirm} style={btnConfirm(t)}>Confirm & next →</button>
      </div>

      {/* BODY: video + diagram */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(360px, 1.2fr)", gap: 16, padding: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <VideoClip
            clipUrl={g.clip_url}
            sourceUrl={videoUrl}
            timestampSeconds={r.timestamp_seconds}
            theme={t}
            label="3s before · 7s after"
          />
          {(g.notes || g.pass_selection || g.direction) && (
            <div style={{ background: t.cardAlt, border: `1px solid ${t.border}`, borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 10, color: t.dim, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
                AI Observation
              </div>
              {g.direction && (
                <div style={{ fontSize: 12, color: t.text, lineHeight: 1.5 }}>
                  Direction: <strong style={{ color: t.bright }}>{g.direction}</strong>
                  {g.pass_selection ? <> · {g.pass_selection}</> : null}
                </div>
              )}
              {g.notes && <div style={{ fontSize: 11, color: t.dim, marginTop: 6, fontStyle: "italic" }}>"{g.notes}"</div>}
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 11, color: t.dim, marginBottom: 6, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
            Where the ball went
          </div>
          <DistributionTargetMap
            selected={r.target_zone || ""}
            onSelect={(z) => set({ target_zone: z, keep: true })}
            theme={t}
          />
        </div>
      </div>

      {/* PHASES */}
      <div style={{ padding: "8px 16px 16px", borderTop: `1px dashed ${t.border}`, display: "flex", flexDirection: "column", gap: 12 }}>
        <PhaseLabel t={t}>// THE TRIGGER</PhaseLabel>
        <SegmentedField label="Trigger" value={r.trigger} options={DIST_TRIGGERS}
          optionLabels={DIST_TRIGGER_LABELS} onChange={(v) => set({ trigger: v })} theme={t} />

        <PhaseLabel t={t}>// THE BALL</PhaseLabel>
        <SegmentedField label="Type" value={r.type} options={DIST_TYPES}
          optionLabels={DIST_TYPE_LABELS} onChange={(v) => set({ type: v })} theme={t} />
        <SegmentedField label="Pressure" value={r.press_state} options={DIST_PRESSURE}
          onChange={(v) => set({ press_state: v })} theme={t} />

        <PhaseLabel t={t}>// THE OUTCOME</PhaseLabel>
        <SegmentedField label="Successful" value={String(r.successful || "")} options={DIST_SUCCESSFUL}
          optionLabels={DIST_SUCCESSFUL_LABELS} onChange={(v) => set({ successful: v })} theme={t} />
        <SegmentedField label="First touch" value={r.first_touch} options={DIST_FIRST_TOUCH}
          optionLabels={DIST_FIRST_TOUCH_LABELS} onChange={(v) => set({ first_touch: v })} theme={t} />

        <div>
          <div style={{ fontSize: 10, color: t.dim, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>Notes</div>
          <textarea
            value={r.notes || ""}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="Optional observations on this distribution"
            rows={2}
            style={{
              width: "100%", padding: "8px 10px", fontSize: 12, borderRadius: 6,
              background: t.cardAlt, border: `1px solid ${t.border}`, color: t.bright,
              fontFamily: FONT, resize: "vertical",
            }}
          />
        </div>
      </div>

      {/* FOOTER — keyboard hint only; action buttons moved up under the header */}
      <div style={{
        padding: "10px 16px", borderTop: `1px solid ${t.border}`,
        background: t.cardAlt,
        fontSize: 11, color: t.dim, fontFamily: "monospace",
      }}>
        ← prev · → next · Enter confirm · click pitch target zone
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
