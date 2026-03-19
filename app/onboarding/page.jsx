"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

const t = {
  bg: "#070b0e", card: "#0f1419", cardAlt: "#151c22", border: "#1e2a32",
  accent: "#10b981", accentDim: "#065f46", accentGlow: "#10b98133",
  gold: "#d4a853", goldDim: "#d4a85322",
  red: "#ef4444", green: "#22c55e", yellow: "#eab308", orange: "#f97316",
  teal: "#14b8a6", cyan: "#06b6d4", purple: "#a78bfa",
  text: "#d1d9e0", dim: "#5c6b77", bright: "#f0f4f7",
};
const font = "'DM Sans', -apple-system, sans-serif";

const ROLES = ["GK Coach", "Director of Goalkeeping", "Head of Academy GK", "Scout", "Technical Director", "Individual Keeper", "Parent"];
const DEPTHS = ["Starter", "Backup", "Third", "Development"];
const CATCHING = ["Left", "Right", "Ambidextrous"];

// ═══ UI COMPONENTS ═══════════════════════════════════════════════════════════

function Input({ label, value, onChange, placeholder, type = "text", required, hint }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 11, color: t.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>
        {label}{required && <span style={{ color: t.red, marginLeft: 3 }}>*</span>}
      </label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{
        width: "100%", padding: "14px 16px", borderRadius: 10, border: `1px solid ${t.border}`,
        background: t.bg, color: t.bright, fontSize: 15, fontFamily: font, outline: "none",
        boxSizing: "border-box", transition: "border-color 0.2s",
      }}
        onFocus={e => e.target.style.borderColor = t.accent}
        onBlur={e => e.target.style.borderColor = t.border}
      />
      {hint && <div style={{ fontSize: 10, color: t.dim, marginTop: 4, paddingLeft: 4 }}>{hint}</div>}
    </div>
  );
}

function Select({ label, value, onChange, options, placeholder, required }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 11, color: t.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>
        {label}{required && <span style={{ color: t.red, marginLeft: 3 }}>*</span>}
      </label>
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        width: "100%", padding: "14px 16px", borderRadius: 10, border: `1px solid ${t.border}`,
        background: t.bg, color: value ? t.bright : t.dim, fontSize: 15, fontFamily: font,
        outline: "none", cursor: "pointer", boxSizing: "border-box", appearance: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%235c6b77' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat", backgroundPosition: "right 16px center",
      }}>
        <option value="" disabled>{placeholder || "Select..."}</option>
        {options.map(o => typeof o === "string"
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>
        )}
      </select>
    </div>
  );
}

function Chip({ label, selected, onClick, accent, small }) {
  const ac = accent || t.accent;
  return (
    <button onClick={onClick} style={{
      padding: small ? "10px 12px" : "14px 18px", borderRadius: 10,
      border: `1px solid ${selected ? ac : t.border}`,
      background: selected ? ac + "18" : t.bg,
      color: selected ? ac : t.text,
      fontSize: small ? 12 : 14, fontWeight: selected ? 700 : 500, cursor: "pointer",
      transition: "all 0.15s", textAlign: "center", width: "100%", fontFamily: font,
    }}>
      {selected ? "✓ " : ""}{label}
    </button>
  );
}

function StepDots({ current, total }) {
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 32 }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{
          width: i === current ? 28 : 8, height: 8, borderRadius: 4,
          background: i <= current ? t.accent : t.border,
          transition: "all 0.3s",
        }} />
      ))}
    </div>
  );
}

function ColorSwatch({ colors, size = 24 }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {colors.map((c, i) => (
        <div key={i} style={{ width: size, height: size, borderRadius: 6, background: c, border: `1px solid ${t.border}` }} />
      ))}
    </div>
  );
}

// ═══ KEEPER EDITOR MODAL ════════════════════════════════════════════════════
function KeeperEditor({ keeper, onSave, onCancel, accent }) {
  const [k, setK] = useState({ ...keeper });
  const u = (key, val) => setK({ ...k, [key]: val });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: t.card, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, maxHeight: "90vh", overflow: "auto", padding: "24px 24px 36px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: t.bright }}>🧤 Keeper Profile</h3>
          <button onClick={onCancel} style={{ background: "none", border: "none", color: t.dim, fontSize: 24, cursor: "pointer" }}>✕</button>
        </div>

        <Input label="Full Name" value={k.name || ""} onChange={v => u("name", v)} placeholder="e.g. Martinez Emiliano" required />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Input label="Jersey Number" value={k.number || ""} onChange={v => u("number", v)} placeholder="#" type="number" />
          <Input label="Date of Birth" value={k.dob || ""} onChange={v => u("dob", v)} placeholder="" type="date" />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: t.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 8 }}>Footed</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {CATCHING.map(c => <Chip key={c} label={c} selected={k.catch_hand === c} onClick={() => u("catch_hand", c)} accent={accent} small />)}
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 11, color: t.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 8 }}>Depth Chart</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {DEPTHS.map(d => <Chip key={d} label={d} selected={k.role === d} onClick={() => u("role", d)} accent={accent} small />)}
          </div>
        </div>

        <button onClick={() => k.name && onSave(k)} disabled={!k.name} style={{
          width: "100%", padding: 16, borderRadius: 12, border: "none",
          background: k.name ? (accent || t.accent) : t.border,
          color: k.name ? "#fff" : t.dim,
          fontSize: 16, fontWeight: 700, cursor: k.name ? "pointer" : "not-allowed",
          fontFamily: font,
        }}>Save Keeper</button>
      </div>
    </div>
  );
}

// ═══ MAIN ONBOARDING FLOW ═══════════════════════════════════════════════════
export default function OnboardingPage() {
  const { user, profile, supabase, refreshProfile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Step 0: Coach + Club
  const [role, setRole] = useState("");
  const [clubName, setClubName] = useState("");
  const [clubColors, setClubColors] = useState(["#10b981", "#065f46", "#ffffff"]);

  // Step 1: Keepers
  const [keepers, setKeepers] = useState([]);
  const [editingKeeper, setEditingKeeper] = useState(null);
  const [editingKeeperIndex, setEditingKeeperIndex] = useState(-1);

  const totalSteps = 3; // 0: Club, 1: Keepers, 2: Review

  // Redirect if already onboarded
  useEffect(() => {
    if (!authLoading && profile?.onboarding_complete) {
      router.push("/dashboard");
    }
  }, [authLoading, profile]);

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font }}>
        <div style={{ color: t.dim, fontSize: 16 }}>Loading...</div>
      </div>
    );
  }

  // Save keeper in local state
  const handleSaveKeeper = (k) => {
    if (editingKeeperIndex >= 0) {
      const nk = [...keepers]; nk[editingKeeperIndex] = k; setKeepers(nk);
    } else {
      setKeepers([...keepers, k]);
    }
    setEditingKeeper(null);
    setEditingKeeperIndex(-1);
  };

  const removeKeeper = (index) => {
    setKeepers(keepers.filter((_, i) => i !== index));
  };

  // ═══ SAVE EVERYTHING TO SUPABASE ═══════════════════════════════════════════
  const handleLaunch = async () => {
    setSaving(true);
    setError("");

    try {
      // 1. Update profile with role
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          role: role,
          onboarding_complete: true,
        })
        .eq("id", user.id);

      if (profileError) throw profileError;

      // 2. Create club
      const { data: clubData, error: clubError } = await supabase
        .from("clubs")
        .insert({
          coach_id: user.id,
          name: clubName,
          primary_color: clubColors[0],
          secondary_color: clubColors[1],
        })
        .select()
        .single();

      if (clubError) throw clubError;

      // 3. Create keepers
      if (keepers.length > 0) {
        const keeperRows = keepers.map(k => ({
          club_id: clubData.id,
          coach_id: user.id,
          name: k.name,
          number: k.number ? parseInt(k.number) : null,
          catch_hand: k.catch_hand || null,
          role: k.role || "Development",
          date_of_birth: k.dob || null,
        }));

        const { error: keeperError } = await supabase
          .from("keepers")
          .insert(keeperRows);

        if (keeperError) throw keeperError;
      }

      // Refresh auth context and redirect
      await refreshProfile();
      router.push("/dashboard");
      router.refresh();

    } catch (err) {
      console.error("Onboarding save error:", err);
      setError(err.message || "Something went wrong. Please try again.");
      setSaving(false);
    }
  };

  // ═══ COMPLETION SCREEN ═════════════════════════════════════════════════════
  // (handled by redirect to dashboard after save)

  // ═══ RENDER ═════════════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight: "100vh", background: t.bg, fontFamily: font, color: t.text }}>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "40px 20px 140px" }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: `linear-gradient(135deg, ${t.accent}, ${t.accentDim})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, boxShadow: `0 2px 12px ${t.accentGlow}`,
            }}>⚽</div>
            <img src="/logo.svg" alt="StixAnalytix" style={{ height: 48, marginBottom: 8 }} />
          </div>
        </div>

        <StepDots current={step} total={totalSteps} />

        {/* ═══ STEP 0: COACH PROFILE + CLUB SETUP ═══ */}
        {step === 0 && <>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: t.bright, margin: "0 0 8px" }}>
              Welcome, {profile?.full_name?.split(" ")[0] || "Coach"}
            </h1>
            <p style={{ fontSize: 14, color: t.dim }}>Set up your club. Takes about 2 minutes.</p>
          </div>

          <div style={{ background: t.card, borderRadius: 16, padding: 24, border: `1px solid ${t.border}`, marginBottom: 20 }}>
            <Select label="Your Role" value={role} onChange={setRole} options={ROLES} placeholder="What best describes you?" required />
            <Input label="Club / Team Name" value={clubName} onChange={setClubName} placeholder="e.g. Ajax Academy U-18" required />

            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 11, color: t.dim, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 8 }}>
                Club Colors
              </label>
              <p style={{ fontSize: 12, color: t.dim, marginTop: 0, marginBottom: 12 }}>
                These will theme your dashboard and reports.
              </p>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                {["Primary", "Secondary", "Accent"].map((label, i) => (
                  <div key={label} style={{ textAlign: "center" }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 12, cursor: "pointer",
                      background: clubColors[i], border: `2px solid ${t.border}`,
                    }} onClick={() => document.getElementById(`club-color-${i}`)?.click()} />
                    <input id={`club-color-${i}`} type="color" value={clubColors[i]}
                      onChange={e => { const nc = [...clubColors]; nc[i] = e.target.value; setClubColors(nc); }}
                      style={{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
                    <div style={{ fontSize: 9, color: t.dim, marginTop: 4 }}>{label}</div>
                  </div>
                ))}
                <div style={{ marginLeft: 8 }}><ColorSwatch colors={clubColors} size={28} /></div>
              </div>
            </div>
          </div>

          {/* Preview card */}
          {clubName && (
            <div style={{ background: t.card, borderRadius: 12, padding: 16, border: `1px solid ${clubColors[0]}33` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <ColorSwatch colors={clubColors} size={22} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: t.bright }}>{clubName}</div>
                  <div style={{ fontSize: 11, color: t.dim }}>Dashboard will use your club colors</div>
                </div>
              </div>
            </div>
          )}
        </>}

        {/* ═══ STEP 1: ADD KEEPERS ═══ */}
        {step === 1 && <>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: t.bright, margin: "0 0 8px" }}>Add your goalkeepers</h1>
            <p style={{ fontSize: 14, color: t.dim }}>You can always add more later from the dashboard.</p>
          </div>

          {/* Keeper list */}
          {keepers.map((k, i) => (
            <div key={i} style={{
              background: t.card, borderRadius: 14, padding: "16px 20px",
              border: `1px solid ${t.border}`, marginBottom: 10,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: `linear-gradient(135deg, ${clubColors[0]}, ${clubColors[1]})`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 900, color: "#fff",
                }}>#{k.number || "?"}</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: t.bright }}>{k.name}</div>
                  <div style={{ fontSize: 11, color: t.dim }}>
                    {[k.role, k.catch_hand ? `${k.catch_hand} footed` : null].filter(Boolean).join(" · ") || "No details yet"}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => {
                  setEditingKeeper(k);
                  setEditingKeeperIndex(i);
                }} style={{
                  background: t.accent + "22", border: "none", color: t.accent,
                  borderRadius: 8, padding: "6px 12px", fontSize: 11, cursor: "pointer",
                  fontWeight: 600, fontFamily: font,
                }}>Edit</button>
                <button onClick={() => removeKeeper(i)} style={{
                  background: t.red + "22", border: "none", color: t.red,
                  borderRadius: 8, padding: "6px 12px", fontSize: 11, cursor: "pointer",
                  fontWeight: 600, fontFamily: font,
                }}>✕</button>
              </div>
            </div>
          ))}

          {/* Add keeper button */}
          <button onClick={() => {
            setEditingKeeper({ name: "", number: "", catch_hand: "", dob: "", role: "" });
            setEditingKeeperIndex(-1);
          }} style={{
            width: "100%", padding: 16, borderRadius: 12, border: `2px dashed ${t.accent}44`,
            background: t.accent + "08", color: t.accent, fontSize: 14, fontWeight: 700,
            cursor: "pointer", fontFamily: font, marginTop: 4,
          }}>+ Add Goalkeeper</button>

          {keepers.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 0", color: t.dim, fontSize: 13 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🧤</div>
              Add your first keeper to get started
            </div>
          )}

          {keepers.length > 0 && (
            <div style={{ padding: "10px 14px", background: t.accent + "11", borderRadius: 8, fontSize: 12, color: t.dim, marginTop: 12 }}>
              {keepers.filter(k => k.role === "Starter").length === 0 && "⚠️ No starter designated yet. "}
              {keepers.filter(k => k.role === "Starter").length > 1 && "⚠️ Multiple starters — consider assigning one. "}
              {keepers.length} keeper{keepers.length !== 1 ? "s" : ""} on roster
            </div>
          )}
        </>}

        {/* ═══ STEP 2: REVIEW & LAUNCH ═══ */}
        {step === 2 && <>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: t.bright, margin: "0 0 8px" }}>Ready to launch</h1>
            <p style={{ fontSize: 14, color: t.dim }}>Review your setup. You can change anything later.</p>
          </div>

          {/* Account summary */}
          <div style={{ background: t.card, borderRadius: 14, padding: 20, border: `1px solid ${t.border}`, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.bright, marginBottom: 12 }}>Your Account</div>
            {[
              ["Name", profile?.full_name],
              ["Email", profile?.email],
              ["Role", role],
              ["Plan", "Beta — Full Access (Free)"],
            ].map(([l, v]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${t.border}11`, fontSize: 13 }}>
                <span style={{ color: t.dim }}>{l}</span>
                <span style={{ color: t.bright, fontWeight: 500 }}>{v || "—"}</span>
              </div>
            ))}
          </div>

          {/* Club + keepers summary */}
          <div style={{ background: t.card, borderRadius: 14, padding: 20, border: `1px solid ${t.border}`, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <ColorSwatch colors={clubColors} size={20} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.bright }}>{clubName || "No club set"}</div>
                <div style={{ fontSize: 11, color: t.dim }}>
                  {keepers.length} keeper{keepers.length !== 1 ? "s" : ""} on roster
                </div>
              </div>
            </div>

            {keepers.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: t.dim, marginBottom: 8 }}>Roster</div>
                {keepers.map((k, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderTop: `1px solid ${t.border}11` }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 6,
                      background: `linear-gradient(135deg, ${clubColors[0]}, ${clubColors[1]})`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, fontWeight: 900, color: "#fff",
                    }}>#{k.number || "?"}</div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: t.bright }}>{k.name}</div>
                      <div style={{ fontSize: 10, color: t.dim }}>{[k.role, k.catch_hand ? `${k.catch_hand} footed` : null].filter(Boolean).join(" · ")}</div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: "#ef444415", border: `1px solid ${t.red}30`,
              borderRadius: 8, padding: "12px 16px", marginBottom: 14,
              color: t.red, fontSize: 13,
            }}>
              {error}
            </div>
          )}

          {/* Launch button */}
          <button onClick={handleLaunch} disabled={saving} style={{
            width: "100%", padding: 20, borderRadius: 14, border: "none",
            background: saving ? t.accentDim : `linear-gradient(135deg, ${t.accent}, ${t.teal})`,
            color: "#fff", fontSize: 18, fontWeight: 800,
            cursor: saving ? "not-allowed" : "pointer", fontFamily: font,
            boxShadow: `0 4px 20px ${t.accentGlow}`,
            marginTop: 8, opacity: saving ? 0.7 : 1,
          }}>
            {saving ? "Setting up your dashboard..." : "🚀 Launch My Dashboard"}
          </button>
        </>}
      </div>

      {/* ═══ BOTTOM NAVIGATION ═══ */}
      {step < 2 && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: t.card, borderTop: `1px solid ${t.border}`, padding: "14px 16px", zIndex: 50 }}>
          <div style={{ display: "flex", gap: 10, maxWidth: 520, margin: "0 auto" }}>
            {step > 0 && (
              <button onClick={() => setStep(step - 1)} style={{
                flex: 1, padding: 14, borderRadius: 10, border: `1px solid ${t.border}`,
                background: t.bg, color: t.text, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: font,
              }}>← Back</button>
            )}
            <button onClick={() => {
              if (step === 0 && (!role || !clubName)) return;
              setStep(step + 1);
            }} disabled={
              (step === 0 && (!role || !clubName))
            } style={{
              flex: 2, padding: 14, borderRadius: 10, border: "none",
              background: (step === 0 && (!role || !clubName)) ? t.border : t.accent,
              color: (step === 0 && (!role || !clubName)) ? t.dim : "#fff",
              fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: font,
            }}>Next →</button>
          </div>
        </div>
      )}

      {/* ═══ KEEPER EDITOR MODAL ═══ */}
      {editingKeeper && (
        <KeeperEditor
          keeper={editingKeeper}
          accent={clubColors[0]}
          onSave={handleSaveKeeper}
          onCancel={() => { setEditingKeeper(null); setEditingKeeperIndex(-1); }}
        />
      )}
    </div>
  );
}

