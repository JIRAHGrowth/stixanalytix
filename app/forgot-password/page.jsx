"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import Link from "next/link";

const t = {
  bg: "#070b0e", card: "#0f1419", border: "#1e2a32",
  accent: "#10b981", accentDim: "#065f46",
  red: "#ef4444", text: "#d1d9e0", dim: "#5c6b77", bright: "#f0f4f7",
};
const font = "'DM Sans', -apple-system, sans-serif";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  const handleReset = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });

    if (resetError) {
      setError(resetError.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh", background: t.bg, display: "flex",
      alignItems: "center", justifyContent: "center", padding: 24,
      fontFamily: font,
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <span style={{
              fontSize: 28, fontWeight: 700, color: t.bright,
              letterSpacing: "-0.02em",
            }}>
              Stix<span style={{ color: t.accent }}>Analytix</span>
            </span>
          </Link>
        </div>

        <div style={{
          background: t.card, borderRadius: 16,
          border: `1px solid ${t.border}`, padding: "36px 32px",
        }}>
          {sent ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📧</div>
              <h1 style={{ fontSize: 22, fontWeight: 600, color: t.bright, marginTop: 0, marginBottom: 12 }}>
                Check your email
              </h1>
              <p style={{ color: t.dim, fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
                We sent a password reset link to <strong style={{ color: t.text }}>{email}</strong>.
                Click the link in the email to reset your password.
              </p>
              <Link href="/login" style={{
                color: t.accent, textDecoration: "none", fontSize: 14, fontWeight: 500,
              }}>
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 600, color: t.bright, marginBottom: 8, marginTop: 0 }}>
                Reset your password
              </h1>
              <p style={{ color: t.dim, fontSize: 14, marginTop: 0, marginBottom: 28 }}>
                Enter your email and we'll send you a reset link
              </p>

              <form onSubmit={handleReset}>
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: "block", color: t.text, fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
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
                    }}
                    onFocus={(e) => e.target.style.borderColor = t.accent}
                    onBlur={(e) => e.target.style.borderColor = t.border}
                  />
                </div>

                {error && (
                  <div style={{
                    background: "#ef444415", border: `1px solid ${t.red}30`,
                    borderRadius: 8, padding: "10px 14px", marginBottom: 18,
                    color: t.red, fontSize: 13,
                  }}>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading} style={{
                  width: "100%", padding: "14px 0", borderRadius: 10,
                  border: "none", background: loading ? t.accentDim : t.accent,
                  color: "#fff", fontSize: 15, fontWeight: 600,
                  fontFamily: font, cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1,
                }}>
                  {loading ? "Sending..." : "Send Reset Link"}
                </button>
              </form>
            </>
          )}
        </div>

        <p style={{ textAlign: "center", marginTop: 24, color: t.dim, fontSize: 14 }}>
          <Link href="/login" style={{ color: t.accent, textDecoration: "none", fontWeight: 500 }}>
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
