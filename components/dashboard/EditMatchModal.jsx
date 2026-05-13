"use client";
import { useState } from "react";
import { tDark } from "@/lib/theme";
import { FONT } from "@/lib/constants";

function useBreakpoint() {
  const [w] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  return { isMobile: w < 768 };
}

export default function EditMatchModal({ match, onSave, onClose, theme }) {
  const t = theme || tDark;
  const font = FONT;
  const bp = useBreakpoint();
  const [formData, setFormData] = useState({
    opponent: match?.opponent || "",
    match_date: match?.match_date || "",
    session_type: match?.session_type || "match",
    venue: match?.venue || "home",
    result: match?.result || "\u2014",
    goals_for: match?.goals_for ?? 0,
    goals_against: match?.goals_against ?? 0,
    shots_on_target: match?.shots_on_target ?? 0,
    saves: match?.saves ?? 0,
    goals_conceded: match?.goals_conceded ?? 0,
  });

  const isMatch = formData.session_type === "match";
  const handleChange = (field, value) => { setFormData(prev => ({ ...prev, [field]: value })); };
  const handleSubmit = (e) => { e.preventDefault(); onSave(formData); };

  const inputStyle = { width: "100%", boxSizing: "border-box", padding: "8px 12px", background: t.bg, border: `1px solid ${t.border}`, borderRadius: 6, color: t.text, fontFamily: font, fontSize: 13 };
  const labelStyle = { display: "block", fontSize: 12, color: t.dim, marginBottom: 6, fontWeight: 600 };
  const selectStyle = { ...inputStyle, cursor: "pointer" };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, fontFamily: font }}>
      <div style={{ background: t.card, borderRadius: 12, border: `1px solid ${t.border}`, padding: 24, maxWidth: 480, width: "90%", color: t.text }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: t.bright, margin: "0 0 20px" }}>Edit Match</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Opponent</label>
            <input type="text" value={formData.opponent} onChange={e => handleChange("opponent", e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Match Date</label>
              <input type="date" value={formData.match_date} onChange={e => handleChange("match_date", e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select value={formData.session_type} onChange={e => handleChange("session_type", e.target.value)} style={selectStyle}>
                <option value="match">Match</option>
                <option value="training">Training</option>
              </select>
            </div>
          </div>
          {isMatch && (
            <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Venue</label>
                <select value={formData.venue} onChange={e => handleChange("venue", e.target.value)} style={selectStyle}>
                  <option value="home">Home</option>
                  <option value="away">Away</option>
                  <option value="neutral">Neutral</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Result</label>
                <select value={formData.result} onChange={e => handleChange("result", e.target.value)} style={selectStyle}>
                  <option value="W">Win</option>
                  <option value="D">Draw</option>
                  <option value="L">Loss</option>
                  <option value={"\u2014"}>{"\u2014"}</option>
                </select>
              </div>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Goals For</label>
              <input type="number" value={formData.goals_for} onChange={e => handleChange("goals_for", parseInt(e.target.value) || 0)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Goals Against</label>
              <input type="number" value={formData.goals_against} onChange={e => handleChange("goals_against", parseInt(e.target.value) || 0)} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Shots on Target</label>
              <input type="number" value={formData.shots_on_target} onChange={e => handleChange("shots_on_target", parseInt(e.target.value) || 0)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Saves</label>
              <input type="number" value={formData.saves} onChange={e => handleChange("saves", parseInt(e.target.value) || 0)} style={inputStyle} />
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Goals Conceded</label>
            <input type="number" value={formData.goals_conceded} onChange={e => handleChange("goals_conceded", parseInt(e.target.value) || 0)} style={inputStyle} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" style={{ flex: 1, padding: "10px 14px", borderRadius: 6, background: t.accent, border: "none", color: "#000", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: font }}>Save Changes</button>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px 14px", borderRadius: 6, background: t.cardAlt, border: `1px solid ${t.border}`, color: t.text, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: font }}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
