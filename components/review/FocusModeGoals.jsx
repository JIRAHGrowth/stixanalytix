"use client";
// Focus-mode wrapper for the goals section.
// Drives prev/next navigation, keyboard shortcuts, and the empty state
// when every candidate has been visited.

import { useEffect, useState, useCallback } from "react";
import { tDark } from "@/lib/theme";
import { GOAL_ZONES, FONT } from "@/lib/constants";
import GoalFocusCard from "./GoalFocusCard";

// Numpad → goal zone. Top row of the numpad (7-8-9) maps to the top row of
// the goal mouth, so the keyboard reads like a tiny goal in front of you.
const NUMPAD_TO_ZONE = {
  Numpad7: GOAL_ZONES[0], Numpad8: GOAL_ZONES[1], Numpad9: GOAL_ZONES[2],
  Numpad4: GOAL_ZONES[3], Numpad5: GOAL_ZONES[4], Numpad6: GOAL_ZONES[5],
  Numpad1: GOAL_ZONES[6], Numpad2: GOAL_ZONES[7], Numpad3: GOAL_ZONES[8],
  // Fallbacks for keyboards / layouts without a numpad
  Digit7: GOAL_ZONES[0], Digit8: GOAL_ZONES[1], Digit9: GOAL_ZONES[2],
  Digit4: GOAL_ZONES[3], Digit5: GOAL_ZONES[4], Digit6: GOAL_ZONES[5],
  Digit1: GOAL_ZONES[6], Digit2: GOAL_ZONES[7], Digit3: GOAL_ZONES[8],
};

export default function FocusModeGoals({
  candidates,
  onChange,        // (id, patch) => void
  onReclassify,    // (id, targetType) => void
  videoUrl,
  meta,
  theme,
}) {
  const t = theme || tDark;
  const [index, setIndex] = useState(0);

  const total = candidates.length;
  const safeIndex = Math.min(index, Math.max(0, total - 1));
  const c = candidates[safeIndex];

  const go = useCallback((dir) => {
    setIndex(i => Math.max(0, Math.min(total - 1, i + dir)));
  }, [total]);

  const onConfirm = useCallback(() => {
    if (!c) return;
    onChange(c._id, { keep: true });
    go(1);
  }, [c, onChange, go]);

  const onReject = useCallback(() => {
    if (!c) return;
    onChange(c._id, { keep: false });
    go(1);
  }, [c, onChange, go]);

  // Keyboard shortcuts scoped to focus mode
  useEffect(() => {
    const handler = (e) => {
      const tag = (e.target?.tagName || "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) return;
      if (!c) return;

      if (e.key === "ArrowRight") { e.preventDefault(); go(1); return; }
      if (e.key === "ArrowLeft")  { e.preventDefault(); go(-1); return; }
      if (e.key === "Enter")      { e.preventDefault(); onConfirm(); return; }
      if (e.key === "r" || e.key === "R") { e.preventDefault(); onReject(); return; }
      if (e.key === "u" || e.key === "U") { e.preventDefault(); onChange(c._id, { scored_by_us: true, keep: true }); return; }
      if (e.key === "t" || e.key === "T") { e.preventDefault(); onChange(c._id, { scored_by_us: false, keep: true }); return; }

      const zone = NUMPAD_TO_ZONE[e.code];
      if (zone) {
        e.preventDefault();
        onChange(c._id, { goal_zone: zone, keep: true });
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [c, go, onChange, onConfirm, onReject]);

  if (total === 0) {
    return (
      <div style={{ background: t.card, border: `1px dashed ${t.border}`, borderRadius: 12, padding: 32, textAlign: "center", color: t.dim, fontSize: 13, fontFamily: FONT }}>
        Gemini found no goal candidates. Switch to <strong style={{ color: t.text }}>Bulk mode</strong> to add a missed goal manually.
      </div>
    );
  }

  return (
    <div>
      {/* Progress strip */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {candidates.map((cand, i) => {
          const reviewed = cand.keep === false || cand.scored_by_us != null;
          const isHere = i === safeIndex;
          const color = isHere ? t.accent : (reviewed ? t.green : t.border);
          return (
            <button
              key={cand._id}
              type="button"
              onClick={() => setIndex(i)}
              title={`Event ${i + 1}`}
              style={{
                flex: 1, height: 6, borderRadius: 3, border: "none",
                background: color, cursor: "pointer", padding: 0,
                transition: "background 0.15s",
              }}
            />
          );
        })}
      </div>

      <GoalFocusCard
        candidate={c}
        index={safeIndex}
        total={total}
        meta={meta}
        videoUrl={videoUrl}
        theme={t}
        onChange={(patch) => onChange(c._id, patch)}
        onConfirm={onConfirm}
        onReject={onReject}
        onReclassify={onReclassify ? (targetType) => onReclassify(c._id, targetType) : undefined}
        onPrev={() => go(-1)}
        onNext={() => go(1)}
      />
    </div>
  );
}
