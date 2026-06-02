"use client";
// Focus-mode wrapper for the distribution section. Same pattern as
// FocusModeGoals: chronological progress strip, prev/next nav, keyboard
// shortcuts. Distribution doesn't use the goal-mouth numpad mapping since
// there's no 9-zone goal-mouth grid — but the target zone diagram is fully
// click-driven, which is faster than a keyboard mapping anyway.

import { useEffect, useState, useCallback } from "react";
import { tDark } from "@/lib/theme";
import { FONT } from "@/lib/constants";
import DistributionFocusCard from "./DistributionFocusCard";

export default function FocusModeDistribution({
  rows,
  onChange,        // (id, patch) => void
  onReclassify,    // (id, targetType) => void  optional
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
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [row, go, onConfirm, onReject]);

  if (total === 0) {
    return (
      <div style={{ background: t.card, border: `1px dashed ${t.border}`, borderRadius: 12, padding: 32, textAlign: "center", color: t.dim, fontSize: 13, fontFamily: FONT }}>
        No distribution events on this match yet. Switch to <strong style={{ color: t.text }}>Bulk mode</strong> to add one manually.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {rows.map((r, i) => {
          const reviewed = r.keep === false || r.target_zone || r.trigger;
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

      <DistributionFocusCard
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
