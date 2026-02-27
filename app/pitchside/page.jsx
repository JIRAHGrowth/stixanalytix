"use client";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";

const t = {
  bg: "#070b0e", card: "#0f1419", border: "#1e2a32",
  accent: "#10b981", text: "#d1d9e0", dim: "#5c6b77", bright: "#f0f4f7",
};
const font = "'DM Sans', -apple-system, sans-serif";

export default function PitchsidePage() {
  const { profile, loading } = useAuth();

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

  return (
    <div style={{
      minHeight: "100vh", background: t.bg, display: "flex",
      alignItems: "center", justifyContent: "center", fontFamily: font,
      padding: 24,
    }}>
      <div style={{ maxWidth: 400, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 20 }}>📱</div>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: t.bright, marginBottom: 12 }}>
          Pitchside
        </h1>
        <p style={{ color: t.dim, fontSize: 15, lineHeight: 1.6, marginBottom: 32 }}>
          The mobile matchday data capture screen is coming in Phase 3.
          This is where you'll track shots, saves, crosses, distribution, and more — all from your phone on the touchline.
        </p>
        <Link href="/dashboard" style={{
          display: "inline-block", padding: "12px 28px", borderRadius: 10,
          border: `1px solid ${t.border}`, background: "transparent",
          color: t.text, fontSize: 14, fontWeight: 500, textDecoration: "none",
        }}>
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
