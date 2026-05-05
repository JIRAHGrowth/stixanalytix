"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import Link from "next/link";

const t = {
  bg: "#070b0e", card: "#0f1419", cardAlt: "#151c22", border: "#1e2a32",
  accent: "#10b981", accentDim: "#065f46", accentGlow: "#10b98133",
  red: "#ef4444", text: "#d1d9e0", dim: "#5c6b77", bright: "#f0f4f7",
};
const font = "'DM Sans', -apple-system, sans-serif";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");

    // Validation
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (!fullName.trim()) {
      setError("Please enter your name.");
      return;
    }

    setLoading(true);

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName.trim(),
        },
      },
    });

    if (authError) {
      if (authError.message.includes("already registered")) {
        setError("An account with this email already exists. Try signing in instead.");
      } else {
        setError(authError.message);
      }
      setLoading(false);
      return;
    }

    // If email confirmation is disabled (recommended for MVP), sign in directly
    if (data.session) {
      window.location.href = "/onboarding";
    } else {
      // Email confirmation is enabled — redirect to login with success message
      window.location.href = "/login?registered=true";
    }
  };

  const inputStyle = {
    width: "100%", padding: "12px 14px", borderRadius: 10,
    border: `1px solid ${t.border}`, background: t.bg,
    color: t.bright, fontSize: 15, fontFamily: font,
    outline: "none", boxSizing: "border-box",
    transition: "border-color 0.2s",
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
            <img src="/logo.svg" alt="StixAnalytix" style={{ height: 48, marginBottom: 8 }} />
          </Link>
          <p style={{ color: t.dim, fontSize: 14, marginTop: 8 }}>
            Start tracking your goalkeepers today
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: t.card, borderRadius: 16,
          border: `1px solid ${t.border}`, padding: "36px 32px",
        }}>
          <h1 style={{
            fontSize: 22, fontWeight: 600, color: t.bright,
            marginBottom: 8, marginTop: 0,
          }}>
            Create your account
          </h1>
          <p style={{ color: t.dim, fontSize: 14, marginTop: 0, marginBottom: 28 }}>
            Free to start — no credit card required
          </p>

          <form onSubmit={handleSignup}>
            {/* Full Name */}
            <div style={{ marginBottom: 18 }}>
              <label style={{
                display: "block", color: t.text, fontSize: 13,
                fontWeight: 500, marginBottom: 6,
              }}>
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                placeholder="Your name"
                style={inputStyle}
                onFocus={(e) => e.target.style.borderColor = t.accent}
                onBlur={(e) => e.target.style.borderColor = t.border}
              />
            </div>

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
                style={inputStyle}
                onFocus={(e) => e.target.style.borderColor = t.accent}
                onBlur={(e) => e.target.style.borderColor = t.border}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 18 }}>
              <label style={{
                display: "block", color: t.text, fontSize: 13,
                fontWeight: 500, marginBottom: 6,
              }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="At least 8 characters"
                style={inputStyle}
                onFocus={(e) => e.target.style.borderColor = t.accent}
                onBlur={(e) => e.target.style.borderColor = t.border}
              />
            </div>

            {/* Confirm Password */}
            <div style={{ marginBottom: 24 }}>
              <label style={{
                display: "block", color: t.text, fontSize: 13,
                fontWeight: 500, marginBottom: 6,
              }}>
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={inputStyle}
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
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>
        </div>

        {/* Login link */}
        <p style={{
          textAlign: "center", marginTop: 24, color: t.dim, fontSize: 14,
        }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: t.accent, textDecoration: "none", fontWeight: 500 }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

