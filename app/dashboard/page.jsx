"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";

const t = {
  bg: "#070b0e", card: "#0f1419", cardAlt: "#151c22", border: "#1e2a32",
  accent: "#10b981", accentDim: "#065f46", accentGlow: "#10b98133",
  gold: "#d4a853", orange: "#f97316",
  red: "#ef4444", green: "#22c55e", yellow: "#eab308",
  text: "#d1d9e0", dim: "#5c6b77", bright: "#f0f4f7",
};
const font = "'DM Sans', -apple-system, sans-serif";

const ROLES = ["Starter", "Backup", "Development", "Trial"];
const FOOTED = ["Left", "Right", "Ambidextrous"];

function Chip({ label, selected, onClick, color }) {
  const c = color || t.accent;
  return (
    <button onClick={onClick} style={{
      padding: "10px 10px", borderRadius: 8,
      border: `1px solid ${selected ? c : t.border}`,
      background: selected ? c + "25" : t.bg,
      color: selected ? c : t.dim,
      fontSize: 12, fontWeight: selected ? 700 : 500, cursor: "pointer",
      transition: "all 0.12s", textAlign: "center", fontFamily: font, minHeight: 40,
    }}>{label}</button>
  );
}

// ═══ KEEPER MODAL ═══════════════════════════════════════════════════════════
function KeeperModal({ keeper, onSave, onClose, onDeactivate, primaryColor }) {
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
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: t.bright }}>
            {isEdit ? "Edit Keeper" : "Add Goalkeeper"}
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: t.dim, fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>

        {/* Name */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: t.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name"
            style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.bg, color: t.bright, fontSize: 15, fontFamily: font, outline: "none", boxSizing: "border-box" }}
            onFocus={e => e.target.style.borderColor = primaryColor || t.accent}
            onBlur={e => e.target.style.borderColor = t.border}
          />
        </div>

        {/* Number + DOB row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
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

        {/* Footed */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: t.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 8 }}>Footed</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {FOOTED.map(f => (
              <Chip key={f} label={f} selected={foot === f} onClick={() => setFoot(f)} color={primaryColor} />
            ))}
          </div>
        </div>

        {/* Role */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 11, color: t.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 8 }}>Depth Chart Role</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
            {ROLES.map(r => (
              <Chip key={r} label={r} selected={role === r} onClick={() => setRole(r)} color={primaryColor} />
            ))}
          </div>
        </div>

        {/* Save button */}
        <button onClick={handleSave} disabled={!canSave || saving} style={{
          width: "100%", padding: 16, borderRadius: 12, border: "none",
          background: canSave ? (primaryColor || t.accent) : t.border,
          color: canSave ? "#fff" : t.dim,
          fontSize: 16, fontWeight: 700, cursor: canSave ? "pointer" : "not-allowed",
          fontFamily: font, minHeight: 52,
        }}>{saving ? "Saving..." : isEdit ? "Save Changes" : "Add Goalkeeper"}</button>

        {/* Deactivate (edit mode only) */}
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

// ═══ MAIN DASHBOARD ═════════════════════════════════════════════════════════

export default function DashboardPage() {
  const { user, profile, club, loading, signOut, supabase } = useAuth();
  const router = useRouter();
  const [keepers, setKeepers] = useState([]);
  const [loadingKeepers, setLoadingKeepers] = useState(true);
  const [showKeeperModal, setShowKeeperModal] = useState(false);
  const [editingKeeper, setEditingKeeper] = useState(null);

  useEffect(() => {
    if (!loading && profile && !profile.onboarding_complete) {
      router.push("/onboarding");
    }
  }, [loading, profile]);

  const fetchKeepers = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("keepers")
      .select("*")
      .eq("coach_id", user.id)
      .eq("active", true)
      .order("created_at", { ascending: true });
    if (data) setKeepers(data);
    setLoadingKeepers(false);
  };

  useEffect(() => {
    if (user && profile?.onboarding_complete) {
      fetchKeepers();
    }
  }, [user, profile]);

  // Add new keeper
  const handleAddKeeper = async (keeperData) => {
    const { error } = await supabase
      .from("keepers")
      .insert({
        ...keeperData,
        coach_id: user.id,
        club_id: club.id,
        active: true,
      });
    if (!error) {
      setShowKeeperModal(false);
      fetchKeepers();
    }
  };

  // Update existing keeper
  const handleEditKeeper = async (keeperData) => {
    if (!editingKeeper?.id) return;
    const { error } = await supabase
      .from("keepers")
      .update(keeperData)
      .eq("id", editingKeeper.id);
    if (!error) {
      setEditingKeeper(null);
      fetchKeepers();
    }
  };

  // Deactivate keeper (soft delete)
  const handleDeactivateKeeper = async () => {
    if (!editingKeeper?.id) return;
    const { error } = await supabase
      .from("keepers")
      .update({ active: false })
      .eq("id", editingKeeper.id);
    if (!error) {
      setEditingKeeper(null);
      fetchKeepers();
    }
  };

  if (loading || !profile?.onboarding_complete) {
    return (
      <div style={{
        minHeight: "100vh", background: t.bg, display: "flex",
        alignItems: "center", justifyContent: "center", fontFamily: font,
      }}>
        <div style={{ color: t.dim, fontSize: 16 }}>Loading...</div>
      </div>
    );
  }

  const primaryColor = club?.primary_color || t.accent;
  const secondaryColor = club?.secondary_color || t.accentDim;

  return (
    <div style={{ minHeight: "100vh", background: t.bg, fontFamily: font }}>
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "16px 20px", borderBottom: `1px solid ${t.border}`,
        maxWidth: 900, margin: "0 auto",
      }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: t.bright }}>
            Stix<span style={{ color: t.accent }}>Analytix</span>
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/pitchside" style={{
            padding: "10px 18px", borderRadius: 8,
            background: primaryColor, color: "#fff",
            fontSize: 13, fontWeight: 600, textDecoration: "none", minHeight: 40,
            display: "flex", alignItems: "center",
          }}>
            📱 Pitchside
          </Link>
          <button onClick={signOut} style={{
            padding: "10px 14px", borderRadius: 8,
            border: `1px solid ${t.border}`, background: "transparent",
            color: t.dim, fontSize: 12, fontFamily: font, cursor: "pointer", minHeight: 40,
          }}>
            Sign Out
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "32px 20px" }}>

        {/* Welcome banner */}
        <div style={{
          background: `linear-gradient(135deg, ${primaryColor}15, ${secondaryColor}10)`,
          borderRadius: 16, padding: "28px 24px",
          border: `1px solid ${primaryColor}30`, marginBottom: 28,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14,
              background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24, boxShadow: `0 4px 16px ${primaryColor}44`,
            }}>⚽</div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: t.bright, margin: "0 0 4px" }}>
                {club?.name || "Your Club"}
              </h1>
              <p style={{ fontSize: 13, color: t.dim, margin: 0 }}>
                {profile?.full_name} · {profile?.role || "Coach"} · {keepers.length} keeper{keepers.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>

        {/* Phase status */}
        <div style={{
          background: t.card, borderRadius: 14, padding: 24,
          border: `1px solid ${t.border}`, marginBottom: 24,
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: t.bright, margin: "0 0 16px" }}>
            Build Progress
          </h2>
          {[
            { phase: "Phase 1", label: "Auth & Database", done: true },
            { phase: "Phase 2", label: "Onboarding Wizard", done: true },
            { phase: "Phase 3", label: "Pitchside → Database", done: true },
            { phase: "Phase 4", label: "Full Analytics Dashboard", done: false, next: true },
            { phase: "Phase 5", label: "Polish & Mobile Testing", done: false },
          ].map((p, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
              borderTop: i > 0 ? `1px solid ${t.border}22` : "none",
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: p.done ? t.accent + "22" : p.next ? t.gold + "22" : t.border + "44",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, color: p.done ? t.accent : p.next ? t.gold : t.dim,
                fontWeight: 700, border: `1px solid ${p.done ? t.accent + "44" : p.next ? t.gold + "44" : "transparent"}`,
              }}>
                {p.done ? "✓" : p.next ? "→" : i + 1}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: p.done ? t.accent : p.next ? t.gold : t.dim }}>
                  {p.phase}: {p.label}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Keeper roster */}
        <div style={{
          background: t.card, borderRadius: 14, padding: 24,
          border: `1px solid ${t.border}`, marginBottom: 24,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: t.bright, margin: 0 }}>
              Your Goalkeepers ({keepers.length})
            </h2>
            <button onClick={() => setShowKeeperModal(true)} style={{
              padding: "8px 16px", borderRadius: 8,
              background: primaryColor + "18", border: `1px solid ${primaryColor}44`,
              color: primaryColor, fontSize: 12, fontWeight: 700,
              cursor: "pointer", fontFamily: font, minHeight: 36,
            }}>+ Add Keeper</button>
          </div>

          {loadingKeepers ? (
            <div style={{ color: t.dim, fontSize: 13, padding: "20px 0", textAlign: "center" }}>Loading roster...</div>
          ) : keepers.length === 0 ? (
            <div style={{ color: t.dim, fontSize: 13, padding: "20px 0", textAlign: "center" }}>
              No keepers added yet.
              <button onClick={() => setShowKeeperModal(true)} style={{
                display: "block", margin: "12px auto 0", padding: "10px 20px", borderRadius: 8,
                background: primaryColor, border: "none", color: "#fff",
                fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font,
              }}>Add Your First Goalkeeper</button>
            </div>
          ) : (
            keepers.map((k, i) => (
              <div key={k.id} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "12px 0",
                borderTop: i > 0 ? `1px solid ${t.border}22` : "none",
                cursor: "pointer",
              }} onClick={() => setEditingKeeper(k)}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 900, color: "#fff",
                }}>#{k.number || "?"}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: t.bright }}>{k.name}</div>
                  <div style={{ fontSize: 11, color: t.dim }}>
                    {[k.role, k.catch_hand ? `${k.catch_hand} footed` : null].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                    background: k.role === "Starter" ? t.accent + "22" : t.border + "44",
                    color: k.role === "Starter" ? t.accent : t.dim,
                  }}>
                    {k.role || "—"}
                  </div>
                  <span style={{ fontSize: 14, color: t.dim }}>✎</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Quick actions */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/pitchside" style={{
            flex: 1, minWidth: 200, padding: "20px 16px", borderRadius: 14,
            background: t.card, border: `1px solid ${t.border}`,
            textDecoration: "none", textAlign: "center",
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚽</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.bright }}>Log a Match</div>
            <div style={{ fontSize: 11, color: t.dim, marginTop: 4 }}>Track live GK performance</div>
          </Link>
          <Link href="/pitchside" style={{
            flex: 1, minWidth: 200, padding: "20px 16px", borderRadius: 14,
            background: t.card, border: `1px solid ${t.border}`,
            textDecoration: "none", textAlign: "center",
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🏋️</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.bright }}>Log Training</div>
            <div style={{ fontSize: 11, color: t.dim, marginTop: 4 }}>Capture session data</div>
          </Link>
        </div>
      </div>

      {/* ═══ ADD KEEPER MODAL ═══ */}
      {showKeeperModal && (
        <KeeperModal
          keeper={null}
          primaryColor={primaryColor}
          onClose={() => setShowKeeperModal(false)}
          onSave={handleAddKeeper}
        />
      )}

      {/* ═══ EDIT KEEPER MODAL ═══ */}
      {editingKeeper && (
        <KeeperModal
          keeper={editingKeeper}
          primaryColor={primaryColor}
          onClose={() => setEditingKeeper(null)}
          onSave={handleEditKeeper}
          onDeactivate={handleDeactivateKeeper}
        />
      )}
    </div>
  );
}

