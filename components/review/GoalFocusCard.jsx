"use client";
// Single-event review card. One goal candidate, full width.
// Left rail: video clip + Gemini's raw read (so the coach can sanity-check
// what the model saw). Right rail: spatial diagrams (where it went, where it
// came from). Bottom: segmented buttons for non-spatial fields.

import {
  GOAL_SOURCES, SHOT_TYPES, GK_POSITIONING, GOAL_RANKS, FONT,
} from "@/lib/constants";
import { tDark } from "@/lib/theme";
import { fmtTs } from "@/lib/mappings";
import GoalMouthGrid from "./GoalMouthGrid";
import PitchOriginMap from "./PitchOriginMap";
import SegmentedField from "./SegmentedField";
import VideoClip from "./VideoClip";

export default function GoalFocusCard({
  candidate,
  index,
  total,
  meta,
  videoUrl,
  onChange,
  onConfirm,
  onReject,
  onReclassify,    // (targetType: 'distribution' | 'save') => void
  onPrev,
  onNext,
  theme,
}) {
  const t = theme || tDark;
  const c = candidate;
  const g = c.gemini || {};

  const isConcession = c.scored_by_us === false;
  const isOwnGoal = c.scored_by_us === true;
  const teamUnknown = c.scored_by_us == null;

  const confidence = (g.confidence || "").toLowerCase();
  const confDot = confidence === "high" ? "●●●" : confidence === "medium" ? "●●○" : confidence === "low" ? "●○○" : "○○○";
  const confColor = confidence === "high" ? t.green : confidence === "medium" ? t.gold : confidence === "low" ? t.orange : t.dim;

  const set = (patch) => onChange(patch);

  // For Half, render as 1 / 2 / ET-style buttons
  const halfValue = c.half ? String(c.half) : "";

  return (
    <div style={{
      background: t.card,
      border: `1px solid ${t.border}`,
      borderRadius: 14,
      overflow: "hidden",
      fontFamily: FONT,
    }}>
      {/* HEADER */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", background: t.cardAlt, borderBottom: `1px solid ${t.border}`,
        gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: t.dim, letterSpacing: 1, textTransform: "uppercase" }}>
            Goal · {index + 1} of {total}
          </span>
          <span style={{ fontSize: 13, color: t.bright, fontWeight: 700 }}>
            Video {fmtTs(g.timestamp_seconds)} · clock {g.match_clock || "—"}
          </span>
          <span style={{ fontSize: 11, color: confColor, fontFamily: "monospace" }}>
            Gemini {confDot} {confidence || "—"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={onPrev} disabled={index === 0}
            style={btnGhost(t, index === 0)}>← Prev</button>
          <button type="button" onClick={onNext} disabled={index >= total - 1}
            style={btnGhost(t, index >= total - 1)}>Skip →</button>
        </div>
      </div>

      {/* TOP — Video + diagrams */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(360px, 1.1fr)", gap: 16, padding: 16 }}>
        {/* LEFT: video + Gemini text */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <VideoClip
            clipUrl={g.clip_url}
            sourceUrl={videoUrl}
            timestampSeconds={g.timestamp_seconds}
            theme={t}
            label="5s before · 3s after"
          />

          <div style={{ background: t.cardAlt, border: `1px solid ${t.border}`, borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 10, color: t.dim, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
              Gemini observed
            </div>
            <div style={{ fontSize: 12, color: t.text, lineHeight: 1.5 }}>
              <strong style={{ color: t.bright }}>{g.scoring_team || "—"}</strong> scored.{" "}
              {g.attack_type || "—"} · {g.shot_type || "—"} from {g.shot_location || "—"} · {g.goal_placement_height}/{g.goal_placement_side}
            </div>
            {g.buildup && (
              <div style={{ fontSize: 11, color: t.dim, marginTop: 6, fontStyle: "italic" }}>"{g.buildup}"</div>
            )}
            {g.gk_observations && (
              <div style={{ fontSize: 11, color: t.dim, marginTop: 4 }}>GK: {g.gk_observations}</div>
            )}
          </div>

          {/* TEAM picker — sits above everything because it gates everything */}
          <div style={{ background: t.cardAlt, border: `1px solid ${t.border}`, borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 10, color: t.dim, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
              Who scored?
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <TeamBtn t={t} active={isOwnGoal}
                color={t.green}
                onClick={() => set({ scored_by_us: true, keep: true })}>
                We did ({meta?.my_team_color || "us"})
              </TeamBtn>
              <TeamBtn t={t} active={isConcession}
                color={t.red}
                onClick={() => set({ scored_by_us: false, keep: true })}>
                They did ({meta?.opponent_color || "them"})
              </TeamBtn>
              <TeamBtn t={t} active={teamUnknown && !c.keep}
                color={t.dim}
                onClick={() => set({ keep: false })}>
                Not a goal
              </TeamBtn>
            </div>
          </div>
        </div>

        {/* RIGHT: diagrams */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: t.dim, marginBottom: 6, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
              Where it went in {!isConcession && <span style={{ color: t.dim }}>· (concessions only)</span>}
            </div>
            <GoalMouthGrid
              selected={c.goal_zone || ""}
              onSelect={(z) => set({ goal_zone: z, keep: true })}
              theme={t}
            />
          </div>

          <div>
            <div style={{ fontSize: 11, color: t.dim, marginBottom: 6, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
              Where it came from {!isConcession && <span style={{ color: t.dim }}>· (concessions only)</span>}
            </div>
            <PitchOriginMap
              selected={c.shot_origin || ""}
              onSelect={(z) => set({ shot_origin: z, keep: true })}
              theme={t}
            />
          </div>
        </div>
      </div>

      {/* BOTTOM — categorical fields (only for concessions; own goals don't need them) */}
      {isConcession && (
        <div style={{ padding: "8px 16px 16px", borderTop: `1px dashed ${t.border}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <SegmentedField label="Source" value={c.goal_source} options={GOAL_SOURCES}
            onChange={(v) => set({ goal_source: v })} theme={t} />
          <SegmentedField label="Body" value={c.shot_type} options={SHOT_TYPES}
            onChange={(v) => set({ shot_type: v })} theme={t} />
          <SegmentedField label="GK set?" value={c.gk_positioning} options={GK_POSITIONING}
            onChange={(v) => set({ gk_positioning: v })} theme={t} />
          <SegmentedField label="Rank" value={c.goal_rank} options={GOAL_RANKS}
            onChange={(v) => set({ goal_rank: v })} theme={t} />
          <SegmentedField label="Half" value={halfValue} options={["1", "2"]}
            optionLabels={{ "1": "1st", "2": "2nd" }}
            onChange={(v) => set({ half: v ? parseInt(v, 10) : null })} theme={t} size="sm" />
          <div>
            <div style={{ fontSize: 10, color: t.dim, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Notes
            </div>
            <textarea
              value={c.notes || ""}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="Optional observations on this goal"
              rows={2}
              style={{
                width: "100%", padding: "8px 10px", fontSize: 12, borderRadius: 6,
                background: t.cardAlt, border: `1px solid ${t.border}`, color: t.bright,
                fontFamily: FONT, resize: "vertical",
              }}
            />
          </div>
        </div>
      )}

      {/* FOOTER */}
      <div style={{
        padding: "12px 16px", borderTop: `1px solid ${t.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, flexWrap: "wrap", background: t.cardAlt,
      }}>
        <div style={{ fontSize: 11, color: t.dim, fontFamily: "monospace" }}>
          ← prev · → next · Enter confirm · Esc reject · numpad 1-9 = goal zone
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button type="button" onClick={onReject} style={btnReject(t)}>Reject</button>
          {onReclassify && (
            <button
              type="button"
              onClick={() => onReclassify("distribution")}
              style={btnReclassify(t)}
              title="This isn't a goal — it's a GK distribution event. The clip is reused; you'll enter the distribution fields fresh."
            >
              Reclassify → Distribution
            </button>
          )}
          <button type="button" onClick={onConfirm} style={btnConfirm(t)}>
            Confirm & next →
          </button>
        </div>
      </div>
    </div>
  );
}

function TeamBtn({ active, color, onClick, children, t }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: "6px 12px", fontSize: 12, borderRadius: 6, cursor: "pointer", fontFamily: FONT,
      background: active ? color : "transparent",
      color: active ? "#fff" : t.text,
      border: `1px solid ${active ? color : t.border}`,
      fontWeight: active ? 700 : 500,
      transition: "all 0.12s",
    }}>{children}</button>
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
    padding: "8px 14px", fontSize: 12, borderRadius: 6,
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
