"use client";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";

const t = {
  bg: "#070b0e", card: "#0f1419", border: "#1e2a32",
  accent: "#10b981", accentDim: "#065f46",
  text: "#d1d9e0", dim: "#5c6b77", bright: "#f0f4f7",
};
const font = "'DM Sans', -apple-system, sans-serif";

export default function DashboardPage() {
  const { user, profile, club, loading, signOut } = useAuth();
  const router = useRouter();

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", background: t.bg, display: "flex",
        alignItems: "center", justifyContent: "center", fontFamily: font,
      }}>
        <div style={{ color: t.dim, fontSize: 16 }}>Loading...</div>
      </div>
    );
  }

  // Redirect to onboarding if not complete
  if (profile && !profile.onboarding_complete) {
    router.push("/onboarding");
    return null;
  }

  return (
    <div style={{
      minHeight: "100vh", background: t.bg, fontFamily: font, padding: 24,
    }}>
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        maxWidth: 800, margin: "0 auto", marginBottom: 48,
      }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: t.bright }}>
          Stix<span style={{ color: t.accent }}>Analytix</span>
        </span>
        <button onClick={signOut} style={{
          padding: "8px 18px", borderRadius: 8,
          border: `1px solid ${t.border}`, background: "transparent",
          color: t.dim, fontSize: 13, fontFamily: font, cursor: "pointer",
        }}>
          Sign Out
        </button>
      </div>

      {/* Content */}
      <div style={{
        maxWidth: 600, margin: "0 auto", textAlign: "center",
        paddingTop: 60,
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: 20,
          background: `${t.accent}15`, border: `2px solid ${t.accent}30`,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 24px", fontSize: 36,
        }}>
          ✓
        </div>

        <h1 style={{
          fontSize: 28, fontWeight: 700, color: t.bright, marginBottom: 12,
        }}>
          You're in, {profile?.full_name?.split(" ")[0] || "Coach"}
        </h1>

        <p style={{
          color: t.dim, fontSize: 16, lineHeight: 1.6, marginBottom: 40,
          maxWidth: 460, margin: "0 auto 40px",
        }}>
          Auth is working. Your account is connected to the database.
          {club && (
            <span> Club: <strong style={{ color: t.text }}>{club.name}</strong>.</span>
          )}
          {" "}The full analytics dashboard is coming in the next build phase.
        </p>

        <div style={{
          background: t.card, borderRadius: 14,
          border: `1px solid ${t.border}`, padding: 28,
          textAlign: "left", maxWidth: 400, margin: "0 auto",
        }}>
          <div style={{ fontSize: 13, color: t.dim, marginBottom: 16, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Your Account
          </div>
          <div style={{ marginBottom: 12 }}>
            <span style={{ color: t.dim, fontSize: 13 }}>Name: </span>
            <span style={{ color: t.text, fontSize: 14 }}>{profile?.full_name || "—"}</span>
          </div>
          <div style={{ marginBottom: 12 }}>
            <span style={{ color: t.dim, fontSize: 13 }}>Email: </span>
            <span style={{ color: t.text, fontSize: 14 }}>{profile?.email || "—"}</span>
          </div>
          <div style={{ marginBottom: 12 }}>
            <span style={{ color: t.dim, fontSize: 13 }}>Role: </span>
            <span style={{ color: t.text, fontSize: 14 }}>{profile?.role || "—"}</span>
          </div>
          <div style={{ marginBottom: 12 }}>
            <span style={{ color: t.dim, fontSize: 13 }}>Tier: </span>
            <span style={{ color: t.accent, fontSize: 14, fontWeight: 500 }}>{profile?.tier || "grassroots"}</span>
          </div>
          {club && (
            <div>
              <span style={{ color: t.dim, fontSize: 13 }}>Club: </span>
              <span style={{ color: t.text, fontSize: 14 }}>{club.name}</span>
              <span style={{
                display: "inline-block", width: 12, height: 12,
                borderRadius: 3, background: club.primary_color,
                marginLeft: 8, verticalAlign: "middle",
              }} />
            </div>
          )}
        </div>

        {!profile?.onboarding_complete && (
          <Link href="/onboarding" style={{
            display: "inline-block", marginTop: 32, padding: "14px 32px",
            borderRadius: 10, background: t.accent, color: "#fff",
            fontSize: 15, fontWeight: 600, textDecoration: "none",
          }}>
            Complete Onboarding →
          </Link>
        )}
      </div>
    </div>
  );
}
