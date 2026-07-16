"use client";
// Focus-mode wrapper for the sweeper section. Same pattern as FocusModeSaves.

import { useEffect, useRef, useState, useCallback } from "react";
import { tDark } from "@/lib/theme";
import { FONT } from "@/lib/constants";
import GenericEventFocusCard from "./GenericEventFocusCard";

// Config mirrors sweeper_events schema constraints.
const SWEEPER_CONFIG = {
  eventLabel: "Sweeper",
  reclassifyTargets: [
    { id: "save",         label: "→ Save" },
    { id: "distribution", label: "→ Distribution" },
    { id: "cross",        label: "→ Cross" },
    { id: "one_v_one",    label: "→ 1v1" },
  ],
  fields: [
    { phase: "trigger", key: "trigger", label: "Trigger",
      options: ["through_ball", "loose_ball", "opp_dribble", "clearance_request"],
      optionLabels: { through_ball: "Through ball", loose_ball: "Loose ball", opp_dribble: "Opp dribble", clearance_request: "Clearance req." } },
    { phase: "gk position", key: "gk_starting_depth", label: "Starting depth",
      options: ["on_line", "edge_of_6", "edge_of_18", "beyond_18"],
      optionLabels: { on_line: "On line", edge_of_6: "Edge of 6", edge_of_18: "Edge of 18", beyond_18: "Beyond 18" } },
    { phase: "gk position", key: "timing", label: "Timing",
      options: ["early", "on_time", "late"],
      optionLabels: { early: "Early", on_time: "On time", late: "Late" } },
    { phase: "action", key: "action", label: "Action",
      options: ["intercept", "clearance_foot", "clearance_header", "control_distribute", "slide", "smother", "let_through"],
      optionLabels: { intercept: "Intercept", clearance_foot: "Clear (foot)", clearance_header: "Clear (head)", control_distribute: "Control+distribute", slide: "Slide", smother: "Smother", let_through: "Let through" } },
    { phase: "action", key: "pressure", label: "Pressure",
      options: ["alone", "with_opp", "with_teammate"],
      optionLabels: { alone: "Alone", with_opp: "With opp", with_teammate: "With TM" } },
    { phase: "action", key: "risk_grade", label: "Risk",
      options: ["low", "medium", "high"],
      optionLabels: { low: "Low", medium: "Med", high: "High" } },
    { phase: "outcome", key: "result", label: "Result",
      options: ["cleared_safely", "kept_possession", "conceded_corner", "lost_possession", "goal", "yellow_red"],
      optionLabels: { cleared_safely: "Cleared safely", kept_possession: "Kept possession", conceded_corner: "Conceded corner", lost_possession: "Lost possession", goal: "Goal", yellow_red: "Yellow/Red" } },
  ],
};

export default function FocusModeSweeper({ rows, onChange, onReclassify, videoUrl, theme, isActive = true }) {
  const t = theme || tDark;
  const [index, setIndex] = useState(0);
  const total = rows.length;
  const safeIndex = Math.min(index, Math.max(0, total - 1));
  const row = rows[safeIndex];

  const prevLen = useRef(rows.length);
  useEffect(() => {
    if (rows.length > prevLen.current) {
      const last = rows[rows.length - 1];
      if (last && last.coach_added) setIndex(rows.length - 1);
    }
    prevLen.current = rows.length;
  }, [rows]);

  const go = useCallback((dir) => { setIndex(i => Math.max(0, Math.min(total - 1, i + dir))); }, [total]);
  const onConfirm = useCallback(() => { if (!row) return; onChange(row._id, { keep: true }); go(1); }, [row, onChange, go]);
  const onReject  = useCallback(() => { if (!row) return; onChange(row._id, { keep: false }); go(1); }, [row, onChange, go]);

  useEffect(() => {
    if (!isActive) return;
    const handler = (e) => {
      const tag = (e.target?.tagName || "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) return;
      if (!row) return;
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      else if (e.key === "Enter") { e.preventDefault(); onConfirm(); }
      else if (e.key === "r" || e.key === "R") { e.preventDefault(); onReject(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isActive, row, go, onConfirm, onReject]);

  if (total === 0) {
    return (
      <div style={{ background: t.card, border: `1px dashed ${t.border}`, borderRadius: 12, padding: 32, textAlign: "center", color: t.dim, fontSize: 13, fontFamily: FONT }}>
        No sweeper events on this match yet. Use the <strong style={{ color: t.text }}>+ Add sweeper</strong> button below to log one.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {rows.map((r, i) => {
          const reviewed = r.keep === false || r.action || r.result;
          const isHere = i === safeIndex;
          const color = isHere ? t.accent : (reviewed ? t.green : t.border);
          return (
            <button key={r._id} type="button" onClick={() => setIndex(i)} title={`Event ${i + 1}`}
              style={{ flex: 1, height: 6, borderRadius: 3, border: "none", background: color, cursor: "pointer", padding: 0, transition: "background 0.15s" }} />
          );
        })}
      </div>
      <GenericEventFocusCard
        row={row} index={safeIndex} total={total}
        config={SWEEPER_CONFIG}
        videoUrl={videoUrl} theme={t}
        onChange={(patch) => onChange(row._id, patch)}
        onConfirm={onConfirm}
        onReject={onReject}
        onReclassify={onReclassify ? (targetType) => onReclassify(row._id, targetType) : undefined}
        onPrev={() => go(-1)}
        onNext={() => go(1)}
      />
    </div>
  );
}
