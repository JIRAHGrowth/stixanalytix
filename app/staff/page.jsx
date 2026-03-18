"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ═══ THEME (matches dashboard/pitchside exactly) ════════════════════════════
const t = {
  bg: "#070b0e", card: "#0f1419", cardAlt: "#151c22", border: "#1e2a32",
  accent: "#10b981", accentDim: "#065f46", accentGlow: "#10b98133",
  gold: "#d4a853", orange: "#f97316",
  red: "#ef4444", green: "#22c55e", yellow: "#eab308",
  cyan: "#06b6d4", purple: "#a78bfa", teal: "#14b8a6",
  text: "#d1d9e0", dim: "#5c6b77", bright: "#f0f4f7",
};
const font = "'DM Sans', -apple-system, sans-serif";

const ROLES = [
  { id: "assistant_coach", label: "Assistant Coach", icon: "🧑‍💼", desc: "Logs matches and views analytics for assigned keepers" },
  { id: "gk_parent", label: "GK Parent", icon: "👨‍👧", desc: "Logs matches and optionally views stats for their keeper" },
  { id: "scout", label: "Scout", icon: "🔍", desc: "Views analytics only — no match logging" },
  { id: "team_manager", label: "Team Manager", icon: "📋", desc: "Logs matches for any assigned keepers" },
  { id: "academy_coach", label: "Academy GK Coach", icon: "🎓", desc: "Full logging and analytics for their age group" },
  { id: "goalkeeper", label: "Goalkeeper", icon: "🧤", desc: "Submits their own notes and rankings for matches they played in" },
];

const roleMeta = (roleId) => ROLES.find(r => r.id === roleId) || { label: roleId, icon: "👤" };

// ═══ UI COMPONENTS ══════════════════════════════════════════════════════════

function Card({ children, s }) {
  return <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, ...s }}>{children}</div>;
}

function Sec({ children, icon }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      {icon && <span style={{ fontSize: 15 }}>{icon}</span>}
      <span style={{ fontSize: 11, fontWeight: 700, color: t.accent, textTransform: "uppercase", letterSpacing: 1.2 }}>{children}</span>
      <div style={{ flex: 1, height: 1, background: t.border, marginLeft: 4 }} />
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    active: { bg: t.green + "18", color: t.green, label: "Active" },
    pending: { bg: t.yellow + "18", color: t.yellow, label: "Invite Sent" },
    revoked: { bg: t.red + "18", color: t.red, label: "Revoked" },
  };
  const s = styles[status] || styles.active;
  return (
    <span style={{ padding: "3px 8px", borderRadius: 6, fontSize: 9, fontWeight: 700, background: s.bg, color: s.color }}>{s.label}</span>
  );
}

function KeeperCheckbox({ keeper, checked, onChange }) {
  return (
    <div onClick={() => onChange(!checked)} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, cursor: "pointer",
      background: checked ? t.accent + "12" : t.bg, border: `1px solid ${checked ? t.accent + "44" : t.border}`,
      transition: "all 0.15s",
    }}>
      <div style={{
        width: 20, height: 20, borderRadius: 5, border: `2px solid ${checked ? t.accent : t.border}`,
        background: checked ? t.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.15s", flexShrink: 0,
      }}>{checked && <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>✓</span>}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: checked ? t.bright : t.text }}>#{keeper.number} {keeper.name}</div>
        <div style={{ fontSize: 10, color: t.dim }}>{keeper.role || "—"}</div>
      </div>
    </div>
  );
}

function Toggle({ on, onToggle, label }) {
  return (
    <div onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "6px 0" }}>
      <div style={{
        width: 40, height: 22, borderRadius: 11, padding: 2, background: on ? t.accent : t.border,
        transition: "background 0.2s", display: "flex", alignItems: "center",
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: 9, background: "#fff",
          transform: on ? "translateX(18px)" : "translateX(0)", transition: "transform 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }} />
      </div>
      {label && <span style={{ fontSize: 12, color: on ? t.bright : t.dim, fontWeight: 500 }}>{label}</span>}
    </div>
  );
}

// ═══ INVITE / CREATE MODAL ══════════════════════════════════════════════════

function InviteModal({ mode, keepers, onClose, onSave }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("");
  const [pitchsideKeepers, setPitchsideKeepers] = useState([]);
  const [dashboardAccess, setDashboardAccess] = useState(false);
  const [dashboardKeepers, setDashboardKeepers] = useState([]);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isCreate = mode === "create";

  const toggleKeeper = (list, setList, kid) => {
    setList(list.includes(kid) ? list.filter(k => k !== kid) : [...list, kid]);
  };

  const canProceed = () => {
    if (step === 0) {
      if (isCreate) return name.trim() && email.trim() && password.trim() && role;
      return email.trim() && role;
    }
    if (step === 1) return pitchsideKeepers.length > 0 || role === "scout";
    return true;
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave({
        name: name.trim() || email.split("@")[0],
        email: email.trim().toLowerCase(),
        role,
        pitchside_keepers: pitchsideKeepers,
        dashboard_keepers: dashboardAccess ? dashboardKeepers : [],
        dashboard_access: dashboardAccess,
        createAccount: isCreate,
        password: isCreate ? password : null,
      });
    } catch (err) {
      setError(err.message || "Something went wrong.");
      setSaving(false);
    }
  };

  const inputStyle = {
    width: "100%", padding: "12px 14px", borderRadius: 10,
    border: `1px solid ${t.border}`, background: t.bg,
    color: t.bright, fontSize: 14, fontFamily: font,
    outline: "none", boxSizing: "border-box", transition: "border-color 0.2s",
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.75)",
      zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        background: t.card, borderRadius: 16, border: `1px solid ${t.border}`,
        width: "100%", maxWidth: 440, maxHeight: "90vh", overflow: "auto",
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.bright }}>
              {isCreate ? "Create Staff Account" : "Invite Staff Member"}
            </div>
            <div style={{ fontSize: 11, color: t.dim, marginTop: 2 }}>
              Step {step + 1} of 3 — {["Details", "Pitchside Access", "Dashboard Access"][step]}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8, border: `1px solid ${t.border}`,
            background: t.bg, color: t.dim, fontSize: 16, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font,
          }}>✕</button>
        </div>

        {/* Progress */}
        <div style={{ display: "flex", gap: 3, padding: "12px 20px 0" }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? t.accent : t.border, transition: "background 0.3s" }} />
          ))}
        </div>

        <div style={{ padding: 20 }}>
          {/* STEP 0: DETAILS */}
          {step === 0 && (
            <div>
              {isCreate && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: t.dim, display: "block", marginBottom: 4 }}>Full Name *</label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sarah Martinez" style={inputStyle}
                    onFocus={e => e.target.style.borderColor = t.accent} onBlur={e => e.target.style.borderColor = t.border} />
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: t.dim, display: "block", marginBottom: 4 }}>Email Address *</label>
                <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" type="email" style={inputStyle}
                  onFocus={e => e.target.style.borderColor = t.accent} onBlur={e => e.target.style.borderColor = t.border} />
              </div>

              {isCreate && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: t.dim, display: "block", marginBottom: 4 }}>Temporary Password *</label>
                  <input value={password} onChange={e => setPassword(e.target.value)} placeholder="They'll change this on first login" style={inputStyle}
                    onFocus={e => e.target.style.borderColor = t.accent} onBlur={e => e.target.style.borderColor = t.border} />
                  <div style={{ fontSize: 10, color: t.dim, marginTop: 4 }}>Share this with the person directly.</div>
                </div>
              )}

              {!isCreate && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: t.dim, display: "block", marginBottom: 4 }}>Name (optional)</label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Pulled from their account on signup" style={inputStyle}
                    onFocus={e => e.target.style.borderColor = t.accent} onBlur={e => e.target.style.borderColor = t.border} />
                </div>
              )}

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: t.dim, display: "block", marginBottom: 8 }}>Role *</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {ROLES.map(r => (
                    <div key={r.id} onClick={() => setRole(r.id)} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                      background: role === r.id ? t.accent + "12" : t.bg,
                      border: `1px solid ${role === r.id ? t.accent + "55" : t.border}`, transition: "all 0.15s",
                    }}>
                      <span style={{ fontSize: 18 }}>{r.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: role === r.id ? t.bright : t.text }}>{r.label}</div>
                        <div style={{ fontSize: 10, color: t.dim }}>{r.desc}</div>
                      </div>
                      <div style={{
                        width: 18, height: 18, borderRadius: 9, border: `2px solid ${role === r.id ? t.accent : t.border}`,
                        background: role === r.id ? t.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center",
                      }}>{role === r.id && <div style={{ width: 6, height: 6, borderRadius: 3, background: "#fff" }} />}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 1: PITCHSIDE ACCESS */}
          {step === 1 && (
            <div>
              <div style={{
                padding: "10px 14px", background: t.accent + "08", border: `1px solid ${t.accent}22`,
                borderRadius: 8, marginBottom: 14, fontSize: 11, color: t.text, lineHeight: 1.6,
              }}>
                📱 <strong style={{ color: t.accent }}>Pitchside Access</strong> — Select which keepers this person can log match data for.
                {role === "scout" && <><br /><span style={{ color: t.dim }}>Scouts typically don't log matches — skip to dashboard access.</span></>}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: t.dim }}>{pitchsideKeepers.length} of {keepers.length} selected</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setPitchsideKeepers(keepers.map(k => k.id))} style={{
                    padding: "4px 10px", borderRadius: 5, border: `1px solid ${t.accent}33`,
                    background: t.accent + "08", color: t.accent, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: font,
                  }}>Select All</button>
                  <button onClick={() => setPitchsideKeepers([])} style={{
                    padding: "4px 10px", borderRadius: 5, border: `1px solid ${t.border}`,
                    background: t.bg, color: t.dim, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: font,
                  }}>Clear</button>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {keepers.map(k => (
                  <KeeperCheckbox key={k.id} keeper={k} checked={pitchsideKeepers.includes(k.id)}
                    onChange={() => toggleKeeper(pitchsideKeepers, setPitchsideKeepers, k.id)} />
                ))}
              </div>

              {role === "gk_parent" && (
                <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 8, background: t.gold + "08", border: `1px solid ${t.gold}22`, fontSize: 10, color: t.gold, lineHeight: 1.5 }}>
                  💡 For parents, typically assign just their child's keeper profile.
                </div>
              )}
            </div>
          )}

          {/* STEP 2: DASHBOARD ACCESS */}
          {step === 2 && (
            <div>
              <div style={{
                padding: "10px 14px", background: t.cyan + "08", border: `1px solid ${t.cyan}22`,
                borderRadius: 8, marginBottom: 14, fontSize: 11, color: t.text, lineHeight: 1.6,
              }}>
                📊 <strong style={{ color: t.cyan }}>Dashboard Access</strong> — Should this person be able to view keeper analytics? They'll see the full dashboard filtered to selected keepers.
              </div>

              <Toggle on={dashboardAccess} label={dashboardAccess ? "Dashboard access enabled" : "No dashboard access"}
                onToggle={() => {
                  setDashboardAccess(!dashboardAccess);
                  if (!dashboardAccess) setDashboardKeepers([...pitchsideKeepers]);
                }} />

              {dashboardAccess && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: t.dim }}>{dashboardKeepers.length} of {keepers.length} visible</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => setDashboardKeepers([...pitchsideKeepers])} style={{
                        padding: "4px 10px", borderRadius: 5, border: `1px solid ${t.cyan}33`,
                        background: t.cyan + "08", color: t.cyan, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: font,
                      }}>Match Pitchside</button>
                      <button onClick={() => setDashboardKeepers(keepers.map(k => k.id))} style={{
                        padding: "4px 10px", borderRadius: 5, border: `1px solid ${t.accent}33`,
                        background: t.accent + "08", color: t.accent, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: font,
                      }}>All</button>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {keepers.map(k => (
                      <KeeperCheckbox key={k.id} keeper={k} checked={dashboardKeepers.includes(k.id)}
                        onChange={() => toggleKeeper(dashboardKeepers, setDashboardKeepers, k.id)} />
                    ))}
                  </div>
                </div>
              )}

              {!dashboardAccess && (
                <div style={{ marginTop: 12, padding: "14px", background: t.bg, borderRadius: 10, border: `1px solid ${t.border}`, textAlign: "center" }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>📱</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: t.text, marginBottom: 4 }}>Pitchside Only</div>
                  <div style={{ fontSize: 10, color: t.dim, lineHeight: 1.5 }}>This person can log match data but won't see analytics.</div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: t.red + "12", border: `1px solid ${t.red}33`, borderRadius: 8, fontSize: 12, color: t.red }}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 20px", borderTop: `1px solid ${t.border}`, display: "flex", gap: 8 }}>
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} style={{
              padding: "10px 18px", borderRadius: 8, border: `1px solid ${t.border}`,
              background: t.bg, color: t.text, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font,
            }}>Back</button>
          )}
          <div style={{ flex: 1 }} />
          {step < 2 ? (
            <button onClick={() => canProceed() && setStep(step + 1)} disabled={!canProceed()} style={{
              padding: "10px 24px", borderRadius: 8, border: "none",
              background: canProceed() ? t.accent : t.border, color: canProceed() ? "#fff" : t.dim,
              fontSize: 12, fontWeight: 700, cursor: canProceed() ? "pointer" : "not-allowed", fontFamily: font,
            }}>Continue</button>
          ) : (
            <button onClick={handleSave} disabled={saving} style={{
              padding: "10px 24px", borderRadius: 8, border: "none",
              background: saving ? t.accentDim : t.accent, color: "#fff",
              fontSize: 12, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: font,
              opacity: saving ? 0.7 : 1,
            }}>{saving ? "Saving..." : isCreate ? "Create Account" : "Send Invite"}</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══ EDIT MODAL ═════════════════════════════════════════════════════════════

function EditModal({ delegate, keepers, onClose, onSave }) {
  const [role, setRole] = useState(delegate.role);
  const [pitchsideKeepers, setPitchsideKeepers] = useState([...(delegate.pitchside_keepers || [])]);
  const [dashboardAccess, setDashboardAccess] = useState(delegate.dashboard_access);
  const [dashboardKeepers, setDashboardKeepers] = useState([...(delegate.dashboard_keepers || [])]);
  const [saving, setSaving] = useState(false);

  const toggleKeeper = (list, setList, kid) => {
    setList(list.includes(kid) ? list.filter(k => k !== kid) : [...list, kid]);
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      id: delegate.id,
      role,
      pitchside_keepers: pitchsideKeepers,
      dashboard_keepers: dashboardAccess ? dashboardKeepers : [],
      dashboard_access: dashboardAccess,
    });
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.75)",
      zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        background: t.card, borderRadius: 16, border: `1px solid ${t.border}`,
        width: "100%", maxWidth: 440, maxHeight: "90vh", overflow: "auto",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.bright }}>Edit Access</div>
            <div style={{ fontSize: 11, color: t.dim, marginTop: 2 }}>{delegate.name || delegate.email}</div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8, border: `1px solid ${t.border}`,
            background: t.bg, color: t.dim, fontSize: 16, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font,
          }}>✕</button>
        </div>

        <div style={{ padding: 20 }}>
          {/* Role */}
          <div style={{ marginBottom: 16 }}>
            <Sec icon="🏷️">Role</Sec>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ROLES.map(r => (
                <button key={r.id} onClick={() => setRole(r.id)} style={{
                  padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontFamily: font,
                  background: role === r.id ? t.accent + "18" : t.bg,
                  border: `1px solid ${role === r.id ? t.accent + "55" : t.border}`,
                  color: role === r.id ? t.accent : t.dim, fontSize: 11, fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 5,
                }}>{r.icon} {r.label}</button>
              ))}
            </div>
          </div>

          {/* Pitchside */}
          <div style={{ marginBottom: 16 }}>
            <Sec icon="📱">Pitchside Keepers</Sec>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {keepers.map(k => (
                <KeeperCheckbox key={k.id} keeper={k} checked={pitchsideKeepers.includes(k.id)}
                  onChange={() => toggleKeeper(pitchsideKeepers, setPitchsideKeepers, k.id)} />
              ))}
            </div>
          </div>

          {/* Dashboard */}
          <Sec icon="📊">Dashboard Access</Sec>
          <Toggle on={dashboardAccess} label={dashboardAccess ? "Enabled" : "Disabled"}
            onToggle={() => { setDashboardAccess(!dashboardAccess); if (!dashboardAccess) setDashboardKeepers([...pitchsideKeepers]); }} />
          {dashboardAccess && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              {keepers.map(k => (
                <KeeperCheckbox key={k.id} keeper={k} checked={dashboardKeepers.includes(k.id)}
                  onChange={() => toggleKeeper(dashboardKeepers, setDashboardKeepers, k.id)} />
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: "14px 20px", borderTop: `1px solid ${t.border}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            padding: "10px 18px", borderRadius: 8, border: `1px solid ${t.border}`,
            background: t.bg, color: t.text, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font,
          }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: "10px 24px", borderRadius: 8, border: "none", background: t.accent, color: "#fff",
            fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: font, opacity: saving ? 0.7 : 1,
          }}>{saving ? "Saving..." : "Save Changes"}</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function StaffPage() {
  const { user, profile, club, supabase, loading } = useAuth();
  const router = useRouter();

  const [delegates, setDelegates] = useState([]);
  const [keepers, setKeepers] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [showModal, setShowModal] = useState(null); // "invite" | "create" | null
  const [editingDelegate, setEditingDelegate] = useState(null);
  const [toast, setToast] = useState(null);
  const [filter, setFilter] = useState("all");

  const primaryColor = club?.primary_color || t.accent;

  // ═══ AUTH GUARD ═══
  useEffect(() => {
    if (!loading && !user) router.push("/login");
    if (!loading && profile && !profile.onboarding_complete) router.push("/onboarding");
  }, [loading, user, profile]);

  // ═══ FETCH DATA ═══
  useEffect(() => {
    if (user && profile?.onboarding_complete) {
      fetchDelegates();
      fetchKeepers();
    }
  }, [user, profile]);

  const fetchDelegates = async () => {
    const { data } = await supabase
      .from("delegates")
      .select("*")
      .eq("coach_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setDelegates(data);
    setLoadingData(false);
  };

  const fetchKeepers = async () => {
    const { data } = await supabase
      .from("keepers")
      .select("*")
      .eq("coach_id", user.id)
      .eq("active", true)
      .order("created_at");
    if (data) setKeepers(data);
  };

  // ═══ ACTIONS ═══

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleInviteSave = async (data) => {
    if (data.createAccount) {
      // Call server-side API to create the auth account + delegate record
      const res = await fetch("/api/create-delegate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          name: data.name,
          role: data.role,
          pitchside_keepers: data.pitchside_keepers,
          dashboard_keepers: data.dashboard_keepers,
          dashboard_access: data.dashboard_access,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to create account.");

      await fetchDelegates();
      setShowModal(null);
      showToast(`Account created for ${data.name}. Share the temporary password securely.`);

    } else {
      // Email invite: just create the delegate record as "pending"
      const { error } = await supabase.from("delegates").insert({
        coach_id: user.id,
        email: data.email,
        name: data.name,
        role: data.role,
        pitchside_keepers: data.pitchside_keepers,
        dashboard_keepers: data.dashboard_keepers,
        dashboard_access: data.dashboard_access,
        status: "pending",
      });

      if (error) throw error;

      await fetchDelegates();
      setShowModal(null);
      showToast(`Invite recorded for ${data.email}. They'll see their access when they sign up.`);
    }
  };

  const handleEditSave = async (data) => {
    const { error } = await supabase.from("delegates").update({
      role: data.role,
      pitchside_keepers: data.pitchside_keepers,
      dashboard_keepers: data.dashboard_keepers,
      dashboard_access: data.dashboard_access,
    }).eq("id", data.id);

    if (!error) {
      await fetchDelegates();
      setEditingDelegate(null);
      showToast("Access updated.");
    }
  };

  const handleRevoke = async (id) => {
    const { error } = await supabase.from("delegates").update({ status: "revoked" }).eq("id", id);
    if (!error) {
      await fetchDelegates();
      showToast("Access revoked.", "warning");
    }
  };

  const handleReactivate = async (id) => {
    const { error } = await supabase.from("delegates").update({ status: "active" }).eq("id", id);
    if (!error) {
      await fetchDelegates();
      showToast("Access reactivated.");
    }
  };

  const filtered = filter === "all" ? delegates : delegates.filter(d => d.status === filter);
  const activeCount = delegates.filter(d => d.status === "active").length;
  const pendingCount = delegates.filter(d => d.status === "pending").length;

  if (loading || loadingData) {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font }}>
        <div style={{ color: t.dim, fontSize: 14 }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: t.bg, fontFamily: font }}>

      {/* ═══ HEADER ═══ */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 20px", borderBottom: `1px solid ${t.border}`, maxWidth: 800, margin: "0 auto",
      }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: t.bright }}>
            Stix<span style={{ color: t.accent }}>Analytix</span>
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link href="/dashboard" style={{
            padding: "8px 14px", borderRadius: 8, border: `1px solid ${t.border}`,
            background: "transparent", color: t.dim, fontSize: 12, textDecoration: "none", fontFamily: font,
          }}>📊 Dashboard</Link>
          <Link href="/pitchside" style={{
            padding: "8px 14px", borderRadius: 8, background: primaryColor, color: "#fff",
            fontSize: 12, fontWeight: 600, textDecoration: "none", display: "flex", alignItems: "center", gap: 4,
          }}>📱 Pitchside</Link>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "20px 16px 40px" }}>

        {/* Page title */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: t.bright, margin: "0 0 4px" }}>Staff & Access</h1>
          <p style={{ fontSize: 13, color: t.dim, margin: 0 }}>Manage who can log matches and view analytics for your keepers.</p>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
          <Card><div style={{ textAlign: "center" }}><div style={{ fontSize: 28, fontWeight: 800, color: t.accent }}>{activeCount}</div><div style={{ fontSize: 10, color: t.dim, marginTop: 2 }}>Active Staff</div></div></Card>
          <Card><div style={{ textAlign: "center" }}><div style={{ fontSize: 28, fontWeight: 800, color: t.yellow }}>{pendingCount}</div><div style={{ fontSize: 10, color: t.dim, marginTop: 2 }}>Pending Invites</div></div></Card>
          <Card><div style={{ textAlign: "center" }}><div style={{ fontSize: 28, fontWeight: 800, color: t.bright }}>{keepers.length}</div><div style={{ fontSize: 10, color: t.dim, marginTop: 2 }}>Keepers on Roster</div></div></Card>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button onClick={() => setShowModal("invite")} style={{
            flex: 1, padding: "14px 20px", borderRadius: 10, border: "none",
            background: t.accent, color: "#fff", fontSize: 13, fontWeight: 700,
            cursor: "pointer", fontFamily: font, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>✉️ Invite by Email</button>
          <button onClick={() => setShowModal("create")} style={{
            flex: 1, padding: "14px 20px", borderRadius: 10,
            border: `1px solid ${t.border}`, background: t.card,
            color: t.text, fontSize: 13, fontWeight: 700,
            cursor: "pointer", fontFamily: font, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>🔑 Create Account</button>
        </div>

        {/* How it works */}
        <Card s={{ marginBottom: 20 }}>
          <Sec icon="💡">How Staff Access Works</Sec>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ padding: 12, background: t.bg, borderRadius: 8, border: `1px solid ${t.border}` }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>📱</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.accent, marginBottom: 4 }}>Pitchside Access</div>
              <div style={{ fontSize: 10, color: t.dim, lineHeight: 1.6 }}>Staff log in and see only their assigned keepers in Pitchside. Match data flows into your dashboard.</div>
            </div>
            <div style={{ padding: 12, background: t.bg, borderRadius: 8, border: `1px solid ${t.border}` }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>📊</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.cyan, marginBottom: 4 }}>Dashboard Access</div>
              <div style={{ fontSize: 10, color: t.dim, lineHeight: 1.6 }}>Optionally let staff view analytics — same dashboard, filtered to their assigned keepers.</div>
            </div>
          </div>
        </Card>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 3, marginBottom: 14 }}>
          {[
            { id: "all", label: "All", count: delegates.length },
            { id: "active", label: "Active", count: activeCount },
            { id: "pending", label: "Pending", count: pendingCount },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: "6px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: font,
              fontSize: 11, fontWeight: 600,
              background: filter === f.id ? t.accent + "18" : "transparent",
              color: filter === f.id ? t.accent : t.dim,
            }}>{f.label} ({f.count})</button>
          ))}
        </div>

        {/* Delegate list */}
        {filtered.length === 0 ? (
          <Card s={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.bright, marginBottom: 4 }}>
              {filter === "all" ? "No staff members yet" : `No ${filter} staff`}
            </div>
            <div style={{ fontSize: 12, color: t.dim, lineHeight: 1.6, maxWidth: 300, margin: "0 auto" }}>
              Invite parents, assistants, or other coaches so they can log matches when you can't be there.
            </div>
          </Card>
        ) : (
          filtered.map(d => {
            const rm = roleMeta(d.role);
            const assignedKeepers = keepers.filter(k => (d.pitchside_keepers || []).includes(k.id));
            const dashKeepers = keepers.filter(k => (d.dashboard_keepers || []).includes(k.id));

            return (
              <Card key={d.id} s={{ marginBottom: 10, position: "relative", overflow: "hidden" }}>
                {d.status === "pending" && (
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${t.yellow}, ${t.gold})` }} />
                )}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  {/* Avatar */}
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                    background: d.status === "active" ? `${t.accent}22` : t.border,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                  }}>{rm.icon}</div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: t.bright }}>{d.name || d.email.split("@")[0]}</span>
                      <StatusBadge status={d.status} />
                    </div>
                    <div style={{ fontSize: 11, color: t.dim, marginBottom: 6 }}>{d.email}</div>

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                      <span style={{ padding: "3px 8px", borderRadius: 5, fontSize: 9, fontWeight: 600, background: t.accent + "15", color: t.accent }}>{rm.label}</span>
                      {d.dashboard_access && <span style={{ padding: "3px 8px", borderRadius: 5, fontSize: 9, fontWeight: 600, background: t.cyan + "15", color: t.cyan }}>📊 Dashboard</span>}
                      {assignedKeepers.length > 0 && <span style={{ padding: "3px 8px", borderRadius: 5, fontSize: 9, fontWeight: 600, background: t.purple + "15", color: t.purple }}>📱 Pitchside</span>}
                    </div>

                    {/* Assigned keepers */}
                    {assignedKeepers.length > 0 && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
                        {assignedKeepers.map(k => (
                          <span key={k.id} style={{ padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: t.bg, border: `1px solid ${t.border}`, color: t.text }}>
                            #{k.number} {k.name?.split(" ").pop()}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                    <button onClick={() => setEditingDelegate(d)} style={{
                      padding: "6px 12px", borderRadius: 6, border: `1px solid ${t.border}`,
                      background: t.bg, color: t.text, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: font,
                    }}>Edit</button>
                    {d.status === "active" && (
                      <button onClick={() => handleRevoke(d.id)} style={{
                        padding: "6px 12px", borderRadius: 6, border: `1px solid ${t.red}33`,
                        background: t.red + "08", color: t.red, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: font,
                      }}>Revoke</button>
                    )}
                    {d.status === "revoked" && (
                      <button onClick={() => handleReactivate(d.id)} style={{
                        padding: "6px 12px", borderRadius: 6, border: `1px solid ${t.green}33`,
                        background: t.green + "08", color: t.green, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: font,
                      }}>Restore</button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Modals */}
      {showModal && <InviteModal mode={showModal} keepers={keepers} onClose={() => setShowModal(null)} onSave={handleInviteSave} />}
      {editingDelegate && <EditModal delegate={editingDelegate} keepers={keepers} onClose={() => setEditingDelegate(null)} onSave={handleEditSave} />}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 2000,
          background: t.card, border: `1px solid ${toast.type === "warning" ? t.yellow + "44" : t.green + "44"}`,
          borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)", maxWidth: 360,
        }}>
          <span style={{ fontSize: 16, color: toast.type === "warning" ? t.yellow : t.green }}>{toast.type === "warning" ? "⚠" : "✓"}</span>
          <span style={{ fontSize: 12, color: t.text, flex: 1 }}>{toast.message}</span>
          <button onClick={() => setToast(null)} style={{ background: "none", border: "none", color: t.dim, cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>
      )}
    </div>
  );
}

