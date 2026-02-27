"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";

const t = {
  bg: "#070b0e", card: "#0f1419", cardAlt: "#151c22", border: "#1e2a32",
  accent: "#10b981", accentDim: "#065f46", accentGlow: "#10b98133",
  gold: "#d4a853",
  red: "#ef4444", green: "#22c55e", yellow: "#eab308",
  text: "#d1d9e0", dim: "#5c6b77", bright: "#f0f4f7",
};
const font = "'DM Sans', -apple-system, sans-serif";

export default function DashboardPage() {
  const { user, profile, club, loading, signOut, supabase } = useAuth();
  const router = useRouter();
  const [keepers, setKeepers] = useState([]);
  const [loadingKeepers, setLoadingKeepers] = useState(true);

  useEffect(() => {
    if (!loading && profile && !profile.onboarding_complete) {
      router.push("/onboarding");
    }
  }, [loading, profile]);

  // Fetch keepers
  useEffect(() => {
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

    if (user && profile?.onboarding_complete) {
      fetchKeepers();
    }
  }, [user, profile]);

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
            padding: "8px 18px", borderRadius: 8,
            background: primaryColor, color: "#fff",
            fontSize: 13, fontWeight: 600, textDecoration: "none",
          }}>
            📱 Pitchside
          </Link>
          <button onClick={signOut} style={{
            padding: "8px 14px", borderRadius: 8,
            border: `1px solid ${t.border}`, background: "transparent",
            color: t.dim, fontSize: 12, fontFamily: font, cursor: "pointer",
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
            { phase: "Phase 3", label: "Pitchside → Database", done: false, next: true },
            { phase: "Phase 4", label: "Full Analytics Dashboard", done: false },
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
          <h2 style={{ fontSize: 16, fontWeight: 700, color: t.bright, margin: "0 0 16px" }}>
            Your Goalkeepers ({keepers.length})
          </h2>

          {loadingKeepers ? (
            <div style={{ color: t.dim, fontSize: 13, padding: "20px 0", textAlign: "center" }}>Loading roster...</div>
          ) : keepers.length === 0 ? (
            <div style={{ color: t.dim, fontSize: 13, padding: "20px 0", textAlign: "center" }}>
              No keepers added yet. They'll appear here after onboarding.
            </div>
          ) : (
            keepers.map((k, i) => (
              <div key={k.id} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "12px 0",
                borderTop: i > 0 ? `1px solid ${t.border}22` : "none",
              }}>
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
                <div style={{
                  padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                  background: k.role === "Starter" ? t.accent + "22" : t.border + "44",
                  color: k.role === "Starter" ? t.accent : t.dim,
                }}>
                  {k.role || "—"}
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
            <div style={{ fontSize: 28, marginBottom: 8 }}>📱</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.bright }}>Log a Match</div>
            <div style={{ fontSize: 11, color: t.dim, marginTop: 4 }}>Coming in Phase 3</div>
          </Link>
          <Link href="/pitchside" style={{
            flex: 1, minWidth: 200, padding: "20px 16px", borderRadius: 14,
            background: t.card, border: `1px solid ${t.border}`,
            textDecoration: "none", textAlign: "center",
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🏋️</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.bright }}>Log Training</div>
            <div style={{ fontSize: 11, color: t.dim, marginTop: 4 }}>Coming in Phase 3</div>
          </Link>
        </div>
      </div>
    </div>
  );
}

