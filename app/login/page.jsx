"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const t = {
  bg: "#070b0e", card: "#0f1419", cardAlt: "#151c22", border: "#1e2a32",
  accent: "#10b981", accentDim: "#065f46", accentGlow: "#10b98133",
  red: "#ef4444", text: "#d1d9e0", dim: "#5c6b77", bright: "#f0f4f7",
};
const font = "'DM Sans', -apple-system, sans-serif";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/dashboard";
  const justSignedUp = searchParams.get("registered") === "true";

  const supabase = createClient();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message === "Invalid login credentials"
        ? "Incorrect email or password. Please try again."
        : authError.message
      );
      setLoading(false);
      return;
    }

    // Check if onboarding is complete
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_complete")
      .eq("id", data.user.id)
      .single();

    router.push(profile?.onboarding_complete ? redirect : "/onboarding");
    router.refresh();
  };

  return (
    <div style={{
      minHeight: "100vh", background: t.bg, display: "flex",
      alignItems: "center", justifyContent: "center", padding: 24,
      fontFamily: font,
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <span style={{
              fontSize: 28, fontWeight: 700, color: t.bright,
              letterSpacing: "-0.02em",
            }}>
              Stix<span style={{ color: t.accent }}>Analytix</span>
            </span>
          </Link>
          <p style={{ color: t.dim, fontSize: 14, marginTop: 8 }}>
            Goalkeeper Coaching Intelligence
          </p>
        </div>

        {/* Success message after signup */}
        {justSignedUp && (
          <div style={{
            background: "#065f4620", border: `1px solid ${t.accent}40`,
            borderRadius: 10, padding: "14px 18px", marginBottom: 20,
            color: t.accent, fontSize: 14, textAlign: "center",
          }}>
            Account created. Sign in to get started.
          </div>
        )}

        {/* Card */}
        <div style={{
          background: t.card, borderRadius: 16,
          border: `1px solid ${t.border}`, padding: "36px 32px",
        }}>
          <h1 style={{
            fontSize: 22, fontWeight: 600, color: t.bright,
            marginBottom: 8, marginTop: 0,
          }}>
            Welcome back
          </h1>
          <p style={{ color: t.dim, fontSize: 14, marginTop: 0, marginBottom: 28 }}>
            Sign in to your account
          </p>

          <form onSubmit={handleLogin}>
            {/* Email */}
            <div style={{ marginBottom: 18 }}>
              <label style={{
                display: "block", color: t.text, fontSize: 13,
                fontWeight: 500, marginBottom: 6,
              }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="coach@example.com"
                style={{
                  width: "100%", padding: "12px 14px", borderRadius: 10,
                  border: `1px solid ${t.border}`, background: t.bg,
                  color: t.bright, fontSize: 15, fontFamily: font,
                  outline: "none", boxSizing: "border-box",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => e.target.style.borderColor = t.accent}
                onBlur={(e) => e.target.style.borderColor = t.border}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 24 }}>
              <div style={{
                display: "flex", justifyContent: "space-between",
                alignItems: "center", marginBottom: 6,
              }}>
                <label style={{
                  color: t.text, fontSize: 13, fontWeight: 500,
                }}>
                  Password
                </label>
                <Link href="/forgot-password" style={{
                  color: t.accent, fontSize: 12, textDecoration: "none",
                }}>
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  width: "100%", padding: "12px 14px", borderRadius: 10,
                  border: `1px solid ${t.border}`, background: t.bg,
                  color: t.bright, fontSize: 15, fontFamily: font,
                  outline: "none", boxSizing: "border-box",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => e.target.style.borderColor = t.accent}
                onBlur={(e) => e.target.style.borderColor = t.border}
              />
            </div>

            {/* Error */}
            {error && (
              <div style={{
                background: "#ef444415", border: `1px solid ${t.red}30`,
                borderRadius: 8, padding: "10px 14px", marginBottom: 18,
                color: t.red, fontSize: 13,
              }}>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%", padding: "14px 0", borderRadius: 10,
                border: "none", background: loading ? t.accentDim : t.accent,
                color: "#fff", fontSize: 15, fontWeight: 600,
                fontFamily: font, cursor: loading ? "not-allowed" : "pointer",
                transition: "background 0.2s", opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>

        {/* Signup link */}
        <p style={{
          textAlign: "center", marginTop: 24, color: t.dim, fontSize: 14,
        }}>
          New to StixAnalytix?{" "}
          <Link href="/signup" style={{ color: t.accent, textDecoration: "none", fontWeight: 500 }}>
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
