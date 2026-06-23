"use client";
// Save focus card.
// Top right: Shot came from (pitch) then Shot was headed for (goal mouth) —
// mirroring the Goal card layout so the eye doesn't relearn it.
// Phases: The Shot / The Save / The Outcome.

import {
  GOAL_ZONES, SHOT_ORIGINS, ON_TARGET_OPTIONS,
  SAVE_TECHNIQUES, DIVE_FAMILIES, GK_VISIBLE_OPTIONS, OUTCOMES,
  FONT,
} from "@/lib/constants";
import { tDark } from "@/lib/theme";
import { fmtTs } from "@/lib/mappings";
import GoalMouthGrid from "./GoalMouthGrid";
import PitchOriginMap from "./PitchOriginMap";
import SegmentedField from "./SegmentedField";
import ExtensionSlider from "./ExtensionSlider";
import VideoClip from "./VideoClip";

const SHOT_TYPE_OPTS = ["Foot", "Header", "Volley"];
const OUTCOME_LABELS = {
  held: "Held", rebound_safe: "Safe rebound", rebound_dangerous: "Dangerous rebound",
  corner: "Corner", out_of_play: "Out of play", goal: "Goal",
};

export default function SaveFocusCard({
  row,
  index,
  total,
  videoUrl,
  onChange,
  onConfirm,
  onReject,
  onReclassify,    // (targetType: 'goal' | 'distribution') => void
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
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", background: t.cardAlt, borderBottom: `1px solid ${t.border}`,
        gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: t.dim, letterSpacing: 1, textTransform: "uppercase" }}>
            Save · {index + 1} of {total}
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
              title="This save was by OUR keeper — counts toward stats"
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
              title="This save was by the OPPOSITION keeper — preserved as training data, excluded from stats"
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
            <button type="button" onClick={() => onReclassify("distribution")} style={btnReclassify(t)}>→ Distribution</button>
          </>
        )}
        <button type="button" onClick={onConfirm} style={btnConfirm(t)}>Confirm & next →</button>
      </div>

      {/* TOP — video + diagrams */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(360px, 1.1fr)", gap: 16, padding: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <VideoClip
            clipUrl={g.clip_url}
            sourceUrl={videoUrl}
            timestampSeconds={r.timestamp_seconds}
            theme={t}
            label="4s before · 5s after"
          />
          {(g.shot_description || g.gk_observations) && (
            <div style={{ background: t.cardAlt, border: `1px solid ${t.border}`, borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 10, color: t.dim, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
                AI Observation
              </div>
              {g.shot_description && <div style={{ fontSize: 12, color: t.text, lineHeight: 1.5 }}>{g.shot_description}</div>}
              {g.gk_observations && <div style={{ fontSize: 11, color: t.dim, marginTop: 6, fontStyle: "italic" }}>GK: {g.gk_observations}</div>}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: t.dim, marginBottom: 6, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
              Shot came from
            </div>
            <PitchOriginMap
              selected={r.shot_origin || ""}
              onSelect={(z) => set({ shot_origin: z, keep: true })}
              theme={t}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: t.dim, marginBottom: 6, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
              Shot was headed for
            </div>
            <GoalMouthGrid
              selected={r.goal_zone || ""}
              onSelect={(z) => set({ goal_zone: z, keep: true })}
              theme={t}
            />
          </div>
        </div>
      </div>

      {/* PHASES */}
      <div style={{ padding: "8px 16px 16px", borderTop: `1px dashed ${t.border}`, display: "flex", flexDirection: "column", gap: 12 }}>
        <PhaseLabel t={t}>// THE SHOT</PhaseLabel>
        <SegmentedField label="On target" value={r.on_target} options={ON_TARGET_OPTIONS}
          onChange={(v) => set({ on_target: v })} theme={t} />
        <SegmentedField label="Type" value={r.shot_type} options={SHOT_TYPE_OPTS}
          onChange={(v) => set({ shot_type: v })} theme={t} />

        <PhaseLabel t={t}>// THE SAVE</PhaseLabel>
        <SegmentedField label="Technique"
          value={r.technique}
          options={SAVE_TECHNIQUES.map(s => s.id)}
          optionLabels={SAVE_TECHNIQUES.reduce((m, s) => ({ ...m, [s.id]: s.label }), {})}
          onChange={(v) => set({ technique: v })} theme={t} />
        <SegmentedField label="Dive family"
          value={r.dive_family}
          options={DIVE_FAMILIES.map(s => s.id)}
          optionLabels={DIVE_FAMILIES.reduce((m, s) => ({ ...m, [s.id]: s.label }), {})}
          onChange={(v) => set({ dive_family: v })} theme={t} />
        <div>
          <div style={{ fontSize: 10, color: t.dim, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>Extension</div>
          <ExtensionSlider value={r.body_distance_zone} onChange={(v) => set({ body_distance_zone: v })} theme={t} />
        </div>
        <SegmentedField label="GK vision" value={r.gk_visible} options={GK_VISIBLE_OPTIONS}
          onChange={(v) => set({ gk_visible: v })} theme={t} />

        <PhaseLabel t={t}>// THE OUTCOME</PhaseLabel>
        <SegmentedField label="Outcome" value={r.outcome} options={OUTCOMES}
          optionLabels={OUTCOME_LABELS}
          onChange={(v) => set({ outcome: v })} theme={t} />

        <div>
          <div style={{ fontSize: 10, color: t.dim, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>Notes</div>
          <textarea
            value={r.notes || ""}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="Optional observations on this save"
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
        ← prev · → next · Enter confirm · numpad 1-9 = goal zone
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
