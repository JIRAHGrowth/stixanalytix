"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";
import Link from "next/link";

const t = {
  bg: "#070b0e", card: "#0f1419", border: "#1e2a32",
  accent: "#10b981", accentDim: "#065f46",
  red: "#ef4444", green: "#22c55e",
  text: "#d1d9e0", dim: "#5c6b77", bright: "#f0f4f7",
};
const font = "'DM Sans', -apple-system, sans-serif";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
    setTimeout(() => router.push("/dashboard"), 2000);
  };

  const inputStyle = {
    width: "100%", padding: "12px 14px", borderRadius: 10,
    border: "1px solid " + t.border, background: t.bg,
    color: t.bright, fontSize: 15, fontFamily: font,
    outline: "none", boxSizing: "border-box",
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
            <img src="/logo.svg" alt="StixAnalytix" style={{ height: 48, marginBottom: 8 }} />
          </Link>
        </div>

        <div style={{
          background: t.card, borderRadius: 16,
          border: "1px solid " + t.border, padding: "36px 32px",
        }}>
          {success ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>\u2705</div>
              <h1 style={{ fontSize: 22, fontWeight: 600, color: t.bright, marginTop: 0, marginBottom: 12 }}>
                Password Updated
              </h1>
              <p style={{ color: t.dim, fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
                Your password has been reset. Redirecting to dashboard...
              </p>
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 600, color: t.bright, marginBottom: 8, marginTop: 0 }}>
                Set new password
              </h1>
              <p style={{ color: t.dim, fontSize: 14, marginTop: 0, marginBottom: 28 }}>
                Enter your new password below
              </p>

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: "block", color: t.text, fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                    New Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="Minimum 8 characters"
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: "block", color: t.text, fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    placeholder="Re-enter your password"
                    style={inputStyle}
                  />
                </div>

                {error && (
                  <div style={{
                    background: "#ef444415", border: "1px solid " + t.red + "30",
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
                  {loading ? "Updating..." : "Update Password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
