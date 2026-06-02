"use client";
// Focus-mode wrapper for the saves section. Same shape as FocusModeGoals.

import { useEffect, useState, useCallback } from "react";
import { tDark } from "@/lib/theme";
import { GOAL_ZONES, FONT } from "@/lib/constants";
import SaveFocusCard from "./SaveFocusCard";

// Numpad → goal zone, same mapping as FocusModeGoals.
const NUMPAD_TO_ZONE = {
  Numpad7: GOAL_ZONES[0], Numpad8: GOAL_ZONES[1], Numpad9: GOAL_ZONES[2],
  Numpad4: GOAL_ZONES[3], Numpad5: GOAL_ZONES[4], Numpad6: GOAL_ZONES[5],
  Numpad1: GOAL_ZONES[6], Numpad2: GOAL_ZONES[7], Numpad3: GOAL_ZONES[8],
  Digit7: GOAL_ZONES[0], Digit8: GOAL_ZONES[1], Digit9: GOAL_ZONES[2],
  Digit4: GOAL_ZONES[3], Digit5: GOAL_ZONES[4], Digit6: GOAL_ZONES[5],
  Digit1: GOAL_ZONES[6], Digit2: GOAL_ZONES[7], Digit3: GOAL_ZONES[8],
};

export default function FocusModeSaves({
  rows,
  onChange,
  onReclassify,
  videoUrl,
  theme,
}) {
  const t = theme || tDark;
  const [index, setIndex] = useState(0);

  const total = rows.length;
  const safeIndex = Math.min(index, Math.max(0, total - 1));
  const row = rows[safeIndex];

  const go = useCallback((dir) => {
    setIndex(i => Math.max(0, Math.min(total - 1, i + dir)));
  }, [total]);

  const onConfirm = useCallback(() => {
    if (!row) return;
    onChange(row._id, { keep: true });
    go(1);
  }, [row, onChange, go]);

  const onReject = useCallback(() => {
    if (!row) return;
    onChange(row._id, { keep: false });
    go(1);
  }, [row, onChange, go]);

  useEffect(() => {
    const handler = (e) => {
      const tag = (e.target?.tagName || "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) return;
      if (!row) return;
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); return; }
      if (e.key === "ArrowLeft")  { e.preventDefault(); go(-1); return; }
      if (e.key === "Enter")      { e.preventDefault(); onConfirm(); return; }
      if (e.key === "r" || e.key === "R") { e.preventDefault(); onReject(); return; }
      const zone = NUMPAD_TO_ZONE[e.code];
      if (zone) { e.preventDefault(); onChange(row._id, { goal_zone: zone, keep: true }); return; }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [row, go, onChange, onConfirm, onReject]);

  if (total === 0) {
    return (
      <div style={{ background: t.card, border: `1px dashed ${t.border}`, borderRadius: 12, padding: 32, textAlign: "center", color: t.dim, fontSize: 13, fontFamily: FONT }}>
        No save events on this match. Switch to <strong style={{ color: t.text }}>Bulk mode</strong> to add one manually.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {rows.map((r, i) => {
          const reviewed = r.keep === false || r.outcome || r.technique || r.goal_zone;
          const isHere = i === safeIndex;
          const color = isHere ? t.accent : (reviewed ? t.green : t.border);
          return (
            <button key={r._id} type="button" onClick={() => setIndex(i)} title={`Event ${i + 1}`}
              style={{
                flex: 1, height: 6, borderRadius: 3, border: "none",
                background: color, cursor: "pointer", padding: 0, transition: "background 0.15s",
              }} />
          );
        })}
      </div>

      <SaveFocusCard
        row={row}
        index={safeIndex}
        total={total}
        videoUrl={videoUrl}
        theme={t}
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
