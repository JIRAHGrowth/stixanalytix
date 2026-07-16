"use client";
// Focus-mode wrapper for the crosses section. Same pattern as FocusModeSaves.

import { useEffect, useRef, useState, useCallback } from "react";
import { tDark } from "@/lib/theme";
import { FONT } from "@/lib/constants";
import GenericEventFocusCard from "./GenericEventFocusCard";

// Config mirrors the cross_events schema constraints (side / cross_type /
// destination / gk_action / gk_starting_pos / outcome). Vocab lifted from
// the GT template (scripts/generate-ground-truth-template.js Crosses sheet)
// so review UI ↔ GT xlsx ↔ DB constraints all stay in lockstep.
const CROSS_CONFIG = {
  eventLabel: "Cross",
  reclassifyTargets: [
    { id: "save",         label: "→ Save" },
    { id: "distribution", label: "→ Distribution" },
    { id: "sweeper",      label: "→ Sweeper" },
    { id: "one_v_one",    label: "→ 1v1" },
  ],
  fields: [
    { phase: "delivery", key: "side", label: "Side",
      options: ["left", "right", "corner_left", "corner_right"],
      optionLabels: { left: "Left", right: "Right", corner_left: "Corner L", corner_right: "Corner R" } },
    { phase: "delivery", key: "cross_type", label: "Cross type",
      options: ["whipped", "floated", "driven", "cut_back", "looped"],
      optionLabels: { whipped: "Whipped", floated: "Floated", driven: "Driven", cut_back: "Cut-back", looped: "Looped" } },
    { phase: "delivery", key: "destination", label: "Destination",
      options: ["near_post", "6yd", "penalty_spot", "far_post", "out_of_box"],
      optionLabels: { near_post: "Near post", "6yd": "6yd", penalty_spot: "Penalty spot", far_post: "Far post", out_of_box: "Out of box" } },
    { phase: "gk decision", key: "gk_starting_pos", label: "GK starting pos",
      options: ["on_line", "edge_of_6yd", "edge_of_18yd", "outside_box"],
      optionLabels: { on_line: "On line", edge_of_6yd: "Edge of 6yd", edge_of_18yd: "Edge of 18yd", outside_box: "Outside box" } },
    { phase: "gk decision", key: "gk_action", label: "GK action",
      options: ["catch", "punch", "tip_over", "stayed_on_line", "missed", "defender_cleared"],
      optionLabels: { catch: "Catch", punch: "Punch", tip_over: "Tip over", stayed_on_line: "Stayed on line", missed: "Missed", defender_cleared: "Defender cleared" } },
    { phase: "outcome", key: "outcome", label: "Outcome",
      options: ["held", "punched_away", "tipped_over", "conceded", "cleared_by_defender", "shot_from_rebound"],
      optionLabels: { held: "Held", punched_away: "Punched away", tipped_over: "Tipped over", conceded: "Conceded", cleared_by_defender: "Cleared by def.", shot_from_rebound: "Shot from rebound" } },
  ],
};

export default function FocusModeCrosses({ rows, onChange, onReclassify, videoUrl, theme, isActive = true }) {
  const t = theme || tDark;
  const [index, setIndex] = useState(0);
  const total = rows.length;
  const safeIndex = Math.min(index, Math.max(0, total - 1));
  const row = rows[safeIndex];

  // Auto-jump to a coach-added row when it's appended — same pattern as FocusModeSaves.
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
        No cross events on this match yet. Use the <strong style={{ color: t.text }}>+ Add cross</strong> button below to log one, or reclassify a save that's actually a cross.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {rows.map((r, i) => {
          const reviewed = r.keep === false || r.gk_action || r.side;
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
        config={CROSS_CONFIG}
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
