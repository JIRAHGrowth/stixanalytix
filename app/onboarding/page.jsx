"use client";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

const t = {
  bg: "#070b0e", card: "#0f1419", border: "#1e2a32",
  accent: "#10b981", accentDim: "#065f46",
  text: "#d1d9e0", dim: "#5c6b77", bright: "#f0f4f7",
};
const font = "'DM Sans', -apple-system, sans-serif";

export default function OnboardingPage() {
  const { profile, loading } = useAuth();
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

  // If onboarding already complete, go to dashboard
  if (profile?.onboarding_complete) {
    router.push("/dashboard");
    return null;
  }

  return (
    <div style={{
      minHeight: "100vh", background: t.bg, display: "flex",
      alignItems: "center", justifyContent: "center", fontFamily: font,
      padding: 24,
    }}>
      <div style={{
        maxWidth: 500, width: "100%", textAlign: "center",
      }}>
        <span style={{ fontSize: 24, fontWeight: 700, color: t.bright }}>
          Stix<span style={{ color: t.accent }}>Analytix</span>
        </span>

        <div style={{
          background: t.card, borderRadius: 16,
          border: `1px solid ${t.border}`, padding: "40px 32px",
          marginTop: 32,
        }}>
          <div style={{ fontSize: 48, marginBottom: 20 }}>🧤</div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: t.bright, marginBottom: 12 }}>
            Welcome, {profile?.full_name?.split(" ")[0] || "Coach"}
          </h1>
          <p style={{
            color: t.dim, fontSize: 15, lineHeight: 1.6, marginBottom: 32,
          }}>
            Auth is connected. The full onboarding wizard (club setup, team colors, keeper roster)
            is coming in the next build phase. For now, your account is created and protected.
          </p>

          <div style={{
            background: `${t.accent}10`, borderRadius: 10,
            padding: "16px 20px", border: `1px solid ${t.accent}20`,
            textAlign: "left",
          }}>
            <div style={{ color: t.accent, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              Phase 1 Complete ✓
            </div>
            <div style={{ color: t.dim, fontSize: 13, lineHeight: 1.5 }}>
              Account created → Database connected → Routes protected
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
