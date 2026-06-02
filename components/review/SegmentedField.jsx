"use client";
// Segmented-button replacement for short-list dropdowns on the review screen.
// The visual highlights Gemini's guess in soft accent and the user's choice in
// solid accent, so a "just confirm everything" pass collapses to glancing at
// the row and pressing Enter.

import { tDark } from "@/lib/theme";
import { FONT } from "@/lib/constants";

export default function SegmentedField({
  label,
  value,
  options,           // [string]  or  [{ id, label }]
  optionLabels,      // optional map { id: "Label" }
  geminiGuess,       // string|null — pre-fills if value is empty
  onChange,
  theme,
  size = "md",       // "sm" | "md"
}) {
  const t = theme || tDark;
  const norm = (options || []).map((o) => (typeof o === "string" ? { id: o, label: optionLabels?.[o] ?? o } : o));

  const pad = size === "sm" ? "4px 8px" : "6px 12px";
  const fs = size === "sm" ? 11 : 12;

  return (
    <div>
      <div style={{ fontSize: 10, color: t.dim, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {norm.map((o) => {
          const isSel = value === o.id;
          const isGuess = !value && geminiGuess === o.id;
          const base = {
            padding: pad,
            fontSize: fs,
            fontFamily: FONT,
            borderRadius: 6,
            cursor: "pointer",
            transition: "all 0.12s",
            border: "1px solid",
            whiteSpace: "nowrap",
          };
          const style = isSel
            ? { ...base, background: t.accent, borderColor: t.accent, color: "#fff", fontWeight: 700 }
            : isGuess
              ? { ...base, background: t.accent + "1a", borderColor: t.accent + "66", color: t.accent, fontWeight: 600 }
              : { ...base, background: "transparent", borderColor: t.border, color: t.text, fontWeight: 500 };
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              style={style}
              aria-pressed={isSel}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
