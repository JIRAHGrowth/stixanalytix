"use client";
// Focus-mode wrapper for the 1v1 section. Same pattern as FocusModeSaves.

import { useEffect, useRef, useState, useCallback } from "react";
import { tDark } from "@/lib/theme";
import { FONT } from "@/lib/constants";
import GenericEventFocusCard from "./GenericEventFocusCard";

// Config mirrors one_v_one_events schema constraints.
const ONE_V_ONE_CONFIG = {
  eventLabel: "1v1",
  reclassifyTargets: [
    { id: "goal",         label: "→ Goal" },
    { id: "save",         label: "→ Save" },
    { id: "distribution", label: "→ Distribution" },
    { id: "cross",        label: "→ Cross" },
    { id: "sweeper",      label: "→ Sweeper" },
  ],
  fields: [
    { phase: "situation", key: "situation_type", label: "Situation",
      options: ["through_ball", "breakaway_run", "defensive_error", "loose_ball", "cross_back"],
      optionLabels: { through_ball: "Through ball", breakaway_run: "Breakaway", defensive_error: "Def. error", loose_ball: "Loose ball", cross_back: "Cross back" } },
    { phase: "situation", key: "approach_corridor", label: "Approach corridor",
      options: ["wide_l", "angled_l", "central", "angled_r", "wide_r"],
      optionLabels: { wide_l: "Wide L", angled_l: "Angled L", central: "Central", angled_r: "Angled R", wide_r: "Wide R" } },
    { phase: "gk decision", key: "decision", label: "Decision",
      options: ["came", "stayed"],
      optionLabels: { came: "Came", stayed: "Stayed" } },
    { phase: "gk decision", key: "timing", label: "Timing",
      options: ["early", "on_time", "late"],
      optionLabels: { early: "Early", on_time: "On time", late: "Late" } },
    { phase: "gk decision", key: "engagement_depth", label: "Engagement depth",
      options: ["inside_6", "edge_of_6", "penalty_spot", "edge_of_18", "beyond_18"],
      optionLabels: { inside_6: "Inside 6", edge_of_6: "Edge of 6", penalty_spot: "Pen spot", edge_of_18: "Edge of 18", beyond_18: "Beyond 18" } },
    { phase: "technique", key: "set_position", label: "Set position",
      options: ["standard_set", "low_set", "set_set"],
      optionLabels: { standard_set: "Standard", low_set: "Low set", set_set: "Set-set" } },
    { phase: "technique", key: "body_shape", label: "Body shape",
      options: ["k_barrier", "smother", "block_save", "long_barrier", "starfish", "slide", "let_through"],
      optionLabels: { k_barrier: "K-barrier", smother: "Smother", block_save: "Block", long_barrier: "Long barrier", starfish: "Starfish", slide: "Slide", let_through: "Let through" } },
    { phase: "outcome", key: "result", label: "Result",
      options: ["save", "goal", "cleared", "forced_wide", "foul_won", "foul_conceded"],
      optionLabels: { save: "Save", goal: "Goal", cleared: "Cleared", forced_wide: "Forced wide", foul_won: "Foul won", foul_conceded: "Foul conceded" } },
    { phase: "outcome", key: "rebound_quality", label: "Rebound",
      options: ["held_dead", "safe_rebound", "dangerous_rebound"],
      optionLabels: { held_dead: "Held dead", safe_rebound: "Safe rebound", dangerous_rebound: "Dangerous" } },
  ],
};

export default function FocusMode1v1({ rows, onChange, onReclassify, videoUrl, theme, isActive = true }) {
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
        No 1v1 events on this match yet. Use the <strong style={{ color: t.text }}>+ Add 1v1</strong> button below to log one.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {rows.map((r, i) => {
          const reviewed = r.keep === false || r.result || r.situation_type;
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
        config={ONE_V_ONE_CONFIG}
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
