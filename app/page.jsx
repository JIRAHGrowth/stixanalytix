"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";

const t = {
  bg: "#070b0e", card: "#0f1419", cardAlt: "#151c22", border: "#1e2a32",
  accent: "#10b981", accentDim: "#065f46", accentGlow: "#10b98133",
  gold: "#d4a853", goldDim: "#d4a85322",
  red: "#ef4444", green: "#22c55e", yellow: "#eab308",
  text: "#d1d9e0", dim: "#5c6b77", bright: "#f0f4f7",
};
const font = "'DM Sans', -apple-system, sans-serif";

function FeatureCard({ icon, title, desc }) {
  return (
    <div style={{
      background: t.card, borderRadius: 14, border: `1px solid ${t.border}`,
      padding: "28px 24px", flex: 1, minWidth: 260,
    }}>
      <div style={{ fontSize: 32, marginBottom: 14 }}>{icon}</div>
      <h3 style={{ fontSize: 17, fontWeight: 600, color: t.bright, marginBottom: 8 }}>{title}</h3>
      <p style={{ fontSize: 14, color: t.dim, lineHeight: 1.6, margin: 0 }}>{desc}</p>
    </div>
  );
}

function PricingCard({ name, price, desc, features, accent, cta }) {
  const router = useRouter();
  return (
    <div style={{
      background: t.card, borderRadius: 14,
      border: `1px solid ${accent ? t.accent + "40" : t.border}`,
      padding: "32px 24px", flex: 1, minWidth: 260,
      position: "relative",
    }}>
      {accent && (
        <div style={{
          position: "absolute", top: -1, left: 40, right: 40, height: 3,
          background: t.accent, borderRadius: "0 0 3px 3px",
        }} />
      )}
      <h3 style={{ fontSize: 18, fontWeight: 600, color: t.bright, marginBottom: 4 }}>{name}</h3>
      <p style={{ fontSize: 13, color: t.dim, marginTop: 0, marginBottom: 16 }}>{desc}</p>
      <div style={{ marginBottom: 20 }}>
        <span style={{ fontSize: 36, fontWeight: 700, color: t.bright }}>{price}</span>
        {price !== "Free" && <span style={{ fontSize: 14, color: t.dim }}>/mo</span>}
      </div>
      <ul style={{ listStyle: "none", padding: 0, marginBottom: 24 }}>
        {features.map((f, i) => (
          <li key={i} style={{
            fontSize: 13, color: t.text, padding: "6px 0",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ color: t.accent, fontSize: 14 }}>✓</span> {f}
          </li>
        ))}
      </ul>
      <button onClick={() => router.push("/signup")} style={{
        width: "100%", padding: "12px 0", borderRadius: 10,
        border: accent ? "none" : `1px solid ${t.border}`,
        background: accent ? t.accent : "transparent",
        color: accent ? "#fff" : t.text,
        fontSize: 14, fontWeight: 600, fontFamily: font, cursor: "pointer",
      }}>
        {cta || "Start Free Trial"}
      </button>
    </div>
  );
}

export default function LandingPage() {
  const [user, setUser] = useState(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUser(data.user);
    });
  }, []);

  return (
    <div style={{ background: t.bg, minHeight: "100vh", fontFamily: font }}>
      {/* Nav */}
      <nav style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "18px 24px", maxWidth: 1200, margin: "0 auto",
      }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: t.bright }}>
          Stix<span style={{ color: t.accent }}>Analytix</span>
        </span>
        <div style={{ display: "flex", gap: 12 }}>
          {user ? (
            <Link href="/dashboard" style={{
              padding: "10px 22px", borderRadius: 10, background: t.accent,
              color: "#fff", fontSize: 14, fontWeight: 600, textDecoration: "none",
            }}>
              Go to Dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" style={{
                padding: "10px 22px", borderRadius: 10,
                border: `1px solid ${t.border}`, color: t.text,
                fontSize: 14, fontWeight: 500, textDecoration: "none",
              }}>
                Sign In
              </Link>
              <Link href="/signup" style={{
                padding: "10px 22px", borderRadius: 10, background: t.accent,
                color: "#fff", fontSize: 14, fontWeight: 600, textDecoration: "none",
              }}>
                Start Free
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        textAlign: "center", padding: "80px 24px 60px",
        maxWidth: 800, margin: "0 auto",
      }}>
        <div style={{
          display: "inline-block", padding: "6px 16px", borderRadius: 20,
          background: `${t.accent}15`, border: `1px solid ${t.accent}30`,
          color: t.accent, fontSize: 13, fontWeight: 500, marginBottom: 24,
        }}>
          Now in Beta — Free for Early Adopters
        </div>
        <h1 style={{
          fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 700,
          color: t.bright, lineHeight: 1.15, marginBottom: 20,
          letterSpacing: "-0.02em",
        }}>
          Coaching Intelligence<br />
          <span style={{ color: t.accent }}>for Goalkeepers</span>
        </h1>
        <p style={{
          fontSize: 18, color: t.dim, lineHeight: 1.6,
          maxWidth: 560, margin: "0 auto 36px",
        }}>
          Track every save, cross, and distribution from the touchline.
          See trends, spot declining performance, and make data-backed decisions
          — all from your phone.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/signup" style={{
            padding: "16px 36px", borderRadius: 12, background: t.accent,
            color: "#fff", fontSize: 16, fontWeight: 600, textDecoration: "none",
          }}>
            Start Tracking Free
          </Link>
          <Link href="#features" style={{
            padding: "16px 36px", borderRadius: 12,
            border: `1px solid ${t.border}`, color: t.text,
            fontSize: 16, fontWeight: 500, textDecoration: "none",
          }}>
            See How It Works
          </Link>
        </div>
      </section>

      {/* Stats bar */}
      <div style={{
        display: "flex", justifyContent: "center", gap: 48,
        padding: "28px 24px", borderTop: `1px solid ${t.border}`,
        borderBottom: `1px solid ${t.border}`, flexWrap: "wrap",
      }}>
        {[
          { n: "30+", l: "GK-specific metrics" },
          { n: "15", l: "Attribute ratings" },
          { n: "10", l: "Dashboard tabs" },
          { n: "5 sec", l: "Per-event tracking" },
        ].map((s, i) => (
          <div key={i} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: t.accent }}>{s.n}</div>
            <div style={{ fontSize: 13, color: t.dim, marginTop: 4 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Three Pillars */}
      <section id="features" style={{
        padding: "80px 24px", maxWidth: 1000, margin: "0 auto",
      }}>
        <h2 style={{
          fontSize: 28, fontWeight: 700, color: t.bright,
          textAlign: "center", marginBottom: 12,
        }}>
          Track. Analyze. Act.
        </h2>
        <p style={{
          color: t.dim, fontSize: 15, textAlign: "center",
          marginBottom: 48, maxWidth: 500, margin: "0 auto 48px",
        }}>
          Built for the goalkeeper coach who manages multiple keepers and needs data — not another spreadsheet.
        </p>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <FeatureCard
            icon="📱"
            title="Pitchside Capture"
            desc="Log saves, goals, crosses, distribution, and sweeper actions from the touchline. Designed for your phone, built for game speed."
          />
          <FeatureCard
            icon="📊"
            title="Automated Analytics"
            desc="Season stats, quarterly trends, radar profiles, and head-to-head comparisons — computed automatically from every match you log."
          />
          <FeatureCard
            icon="⚠️"
            title="Caution Alerts"
            desc="Automatically detects when a keeper's performance is trending down. Catches problems before they show up in match results."
          />
        </div>
      </section>

      {/* Who It's For */}
      <section style={{
        padding: "60px 24px 80px", maxWidth: 1000, margin: "0 auto",
      }}>
        <h2 style={{
          fontSize: 24, fontWeight: 700, color: t.bright,
          textAlign: "center", marginBottom: 40,
        }}>
          Built for Every Level
        </h2>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <FeatureCard
            icon="🧤"
            title="Academy Coaches"
            desc="Track 4-8 keepers across age groups. See who's developing, who's stalling, and make objective selection decisions."
          />
          <FeatureCard
            icon="🎓"
            title="University Programs"
            desc="Track match AND training sessions. Every keeper gets analytics, not just the starter who gets game time."
          />
          <FeatureCard
            icon="⚽"
            title="Professional Clubs"
            desc="Replace your Excel spreadsheets. Get coaching intelligence without hiring a data analyst."
          />
        </div>
      </section>

      {/* Pricing */}
      <section style={{
        padding: "80px 24px", maxWidth: 1000, margin: "0 auto",
        borderTop: `1px solid ${t.border}`,
      }}>
        <h2 style={{
          fontSize: 28, fontWeight: 700, color: t.bright,
          textAlign: "center", marginBottom: 12,
        }}>
          Simple Pricing
        </h2>
        <p style={{
          color: t.dim, fontSize: 15, textAlign: "center", marginBottom: 48,
        }}>
          Free during beta. Start tracking today.
        </p>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <PricingCard
            name="Grassroots"
            price="Free"
            desc="For individual coaches and parents"
            features={[
              "1 goalkeeper",
              "Match & training tracking",
              "Core dashboard analytics",
              "Season stats & trends",
            ]}
            cta="Get Started Free"
          />
          <PricingCard
            name="Academy"
            price="$19"
            desc="For serious coaches and academy staff"
            accent
            features={[
              "Up to 5 goalkeepers",
              "All dashboard tabs",
              "Caution alerts",
              "Head-to-head comparison",
              "PDF reports",
              "Club color branding",
            ]}
            cta="Start Free Trial"
          />
          <PricingCard
            name="Pro"
            price="$29"
            desc="For directors and multi-club tracking"
            features={[
              "Unlimited goalkeepers",
              "Everything in Academy",
              "Multi-club tracking",
              "Recruitment reports",
              "API access",
            ]}
            cta="Contact Us"
          />
        </div>
      </section>

      {/* Final CTA */}
      <section style={{
        padding: "80px 24px", textAlign: "center",
        borderTop: `1px solid ${t.border}`,
      }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: t.bright, marginBottom: 16 }}>
          Ready to track smarter?
        </h2>
        <p style={{ color: t.dim, fontSize: 16, marginBottom: 32 }}>
          Free during beta. No credit card required.
        </p>
        <Link href="/signup" style={{
          display: "inline-block", padding: "16px 40px", borderRadius: 12,
          background: t.accent, color: "#fff", fontSize: 16,
          fontWeight: 600, textDecoration: "none",
        }}>
          Create Your Free Account
        </Link>
      </section>

      {/* Footer */}
      <footer style={{
        padding: "24px", textAlign: "center",
        borderTop: `1px solid ${t.border}`, color: t.dim, fontSize: 13,
      }}>
        © 2026 StixAnalytix by JIRAH Growth Partners
      </footer>
    </div>
  );
}
