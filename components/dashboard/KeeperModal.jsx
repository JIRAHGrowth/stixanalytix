"use client";
import { useState } from "react";
import { tDark } from "@/lib/theme";
import { KEEPER_ROLES, FOOTED, FONT } from "@/lib/constants";
import Chip from "@/components/pitchside/Chip";

function useBreakpoint() {
  const [w] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  return { isMobile: w < 768 };
}

export default function KeeperModal({ keeper, onSave, onClose, onDeactivate, primaryColor, theme }) {
  const t = theme || tDark;
  const font = FONT;
  const bp = useBreakpoint();
  const [name, setName] = useState(keeper?.name || "");
  const [number, setNumber] = useState(keeper?.number?.toString() || "");
  const [foot, setFoot] = useState(keeper?.catch_hand || "");
  const [dob, setDob] = useState(keeper?.date_of_birth || "");
  const [role, setRole] = useState(keeper?.role || "");
  const [saving, setSaving] = useState(false);
  const isEdit = !!keeper?.id;
  const canSave = name.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    await onSave({
      name: name.trim(),
      number: number ? parseInt(number) : null,
      catch_hand: foot || null,
      date_of_birth: dob || null,
      role: role || null,
    });
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: t.card, borderRadius: 16, width: "100%", maxWidth: 420, padding: 24, maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: t.bright }}>{isEdit ? "Edit Keeper" : "Add Goalkeeper"}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: t.dim, fontSize: 22, cursor: "pointer" }}>{"\u2715"}</button>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: t.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name"
            style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.bg, color: t.bright, fontSize: 15, fontFamily: font, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, color: t.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Number</label>
            <input type="number" value={number} onChange={e => setNumber(e.target.value)} placeholder="#"
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.bg, color: t.bright, fontSize: 15, fontFamily: font, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: t.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Date of Birth</label>
            <input type="date" value={dob} onChange={e => setDob(e.target.value)}
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.bg, color: t.bright, fontSize: 14, fontFamily: font, outline: "none", boxSizing: "border-box" }} />
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: t.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 8 }}>Footed</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {FOOTED.map(f => <Chip key={f} theme={t} label={f} selected={foot === f} onClick={() => setFoot(f)} color={primaryColor} small />)}
          </div>
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 11, color: t.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 8 }}>Depth Chart Role</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
            {KEEPER_ROLES.map(r => <Chip key={r} theme={t} label={r} selected={role === r} onClick={() => setRole(r)} color={primaryColor} small />)}
          </div>
        </div>
        <button onClick={handleSave} disabled={!canSave || saving} style={{
          width: "100%", padding: 16, borderRadius: 12, border: "none",
          background: canSave ? (primaryColor || t.accent) : t.border,
          color: canSave ? "#fff" : t.dim, fontSize: 16, fontWeight: 700,
          cursor: canSave ? "pointer" : "not-allowed", fontFamily: font, minHeight: 52,
        }}>{saving ? "Saving..." : isEdit ? "Save Changes" : "Add Goalkeeper"}</button>
        {isEdit && onDeactivate && (
          <button onClick={onDeactivate} style={{
            width: "100%", marginTop: 10, padding: 12, borderRadius: 8,
            background: "transparent", border: `1px solid ${t.red}33`,
            color: t.red, fontSize: 12, cursor: "pointer", fontFamily: font, minHeight: 40,
          }}>Remove from Active Roster</button>
        )}
      </div>
    </div>
  );
}
