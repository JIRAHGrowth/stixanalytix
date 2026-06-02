"use client";
// Three-step ordinal slider for the Save card's "extension" field.
// A · at body  →  B · 1–2 yd  →  C · full extension
// Values stored as the existing BODY_ZONES enum: 'A' | 'B' | 'C' | 'unclear'.

import { tDark } from "@/lib/theme";
import { FONT } from "@/lib/constants";

const STEPS = [
  { value: "A", label: "A", caption: "at body" },
  { value: "B", label: "B", caption: "1–2 yd" },
  { value: "C", label: "C", caption: "full extension" },
];

export default function ExtensionSlider({ value, onChange, theme }) {
  const t = theme || tDark;
  const idx = STEPS.findIndex(s => s.value === value);

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, height: 6, background: t.border, borderRadius: 3, position: "relative" }}>
          {idx >= 0 && (
            <>
              <div style={{ position: "absolute", height: 6, background: t.accent, borderRadius: 3, top: 0, left: 0, width: `${(idx / 2) * 100}%` }} />
              <div style={{ position: "absolute", top: -3, width: 12, height: 12, borderRadius: "50%", background: t.accent, border: `2px solid ${t.bg}`, left: `calc(${(idx / 2) * 100}% - 6px)` }} />
            </>
          )}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        {STEPS.map(s => {
          const isOn = s.value === value;
          return (
            <button key={s.value} type="button" onClick={() => onChange(s.value)}
              style={{
                background: "transparent", border: "none", cursor: "pointer",
                fontFamily: FONT, fontSize: 11, color: isOn ? t.accent : t.dim,
                fontWeight: isOn ? 700 : 500, padding: 0, textAlign: "center",
              }}>
              {isOn ? <strong>{s.label} · {s.caption}</strong> : <>{s.label} · {s.caption}</>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
