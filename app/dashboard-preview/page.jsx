"use client";

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD-PREVIEW — Mock-up of the keeper-card landing concept.
// Hardcoded with Judah Marshall's real numbers as of 2026-06-09.
// Not wired to live data. Safe to delete / replace once design is settled.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import Link from "next/link";
import { tDark as t } from "@/lib/theme";
import { FONT } from "@/lib/constants";

const FONT_DISPLAY = FONT;
const FONT_BODY = FONT;

// ── Real numbers pulled 2026-06-09 ──────────────────────────────────────────
const KEEPER = {
  name: "Judah Marshall",
  number: 1,
  club: "Kelowna City FC",
  ageGroup: "U10",
  since: "Feb 2026",
  matches: 13,
};

const FORM = {
  value: 84,
  prev: 78,
  tier: "STRONG",
  // Last-5 inputs (real):
  save_pct: 91.2,
  win_rate: 90,
  dist_pct: 52.4,
  errors: 0,
};

const LATEST_MATCH = {
  date: "Sat · Jun 6",
  result: "W 3–2",
  opponent: "KYSA Lions",
  saves: 22,
  shots: 24,
  savePct: 91.7,
  matchId: "2af4a891-b88a-46b9-8650-b46e9dd6bc2f",
};

const PENDING_CLIPS = 3; // illustrative — would come from review_status

const TRENDING_UP = [
  { metric: "Save %", value: "91.2%", delta: "+4.1", spark: [83.3, 100, 91.7, 87.0, 91.7], context: "Last 5 vs. prior 5" },
  { metric: "Long distribution success", value: "47%", delta: "+12", spark: [25, 0, 0, 100, 38], context: "9 of 19 long passes found feet" },
  { metric: "Errors leading to goal", value: "0", delta: "0", spark: [0, 0, 0, 0, 0], context: "Five matches clean" },
];

const FOCUS_AREAS = [
  { metric: "Long-distribution under pressure", value: "38%", note: "vs KYSA 3/8 long balls — opponent press forced rushed kicks", clipTag: "Saturday · clip 4" },
  { metric: "Short-distribution sample", value: "n=3", note: "Coaches barely tracking the short option — likely under-credited", clipTag: "Log it next match" },
  { metric: "Cross claims", value: "n=0", note: "Zero crosses tracked all season — either no aerial threat faced or under-logged", clipTag: "Worth a coach review" },
];

const SEASON_STATS = [
  { label: "Matches", value: "13" },
  { label: "Win rate", value: "85%", sub: "11W · 1D · 1L" },
  { label: "Save %", value: "88%", sub: "Season avg" },
  { label: "GA / Match", value: "1.3" },
  { label: "Clean sheets", value: "3" },
  { label: "Saves logged", value: "82" },
];

const RECENT_FIVE = [
  { date: "Jun 6", opp: "KYSA Lions",        res: "W",  score: "3–2", saves: "22/24", pct: 91.7 },
  { date: "May 30", opp: "OUFC 2016",         res: "D",  score: "3–3", saves: "20/23", pct: 87.0 },
  { date: "May 23", opp: "PFC 2016",          res: "W",  score: "15–0", saves: "4/4",  pct: 100  },
  { date: "May 16", opp: "OUFC",              res: "W",  score: "2–1", saves: "5/6",   pct: 83.3 },
  { date: "May 2",  opp: "KCITY 2016 Gold",   res: "W",  score: "2–1", saves: "16/17", pct: 94.1 },
];

// ═══════════════════════════════════════════════════════════════════════════
// UI atoms
// ═══════════════════════════════════════════════════════════════════════════

function NetMotif({ opacity = 0.08, color = "#10b981" }) {
  // Brand rectangular-net motif (from stixanalytix-brand-r7.html).
  // Columns: 60w × rows: 28h, 1.1px stroke, intentional excel feel.
  return (
    <svg viewBox="0 0 600 280" preserveAspectRatio="xMidYMid slice"
         style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
      <g stroke={color} strokeWidth="1.1" opacity={opacity} strokeLinecap="square">
        {/* verticals every 60 */}
        {Array.from({ length: 11 }).map((_, i) => (
          <line key={`v${i}`} x1={i * 60} y1="0" x2={i * 60} y2="280" />
        ))}
        {/* horizontals every 28 */}
        {Array.from({ length: 11 }).map((_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 28} x2="600" y2={i * 28} />
        ))}
      </g>
    </svg>
  );
}

function MonogramAvatar({ initials, size = 88 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 16,
      background: `linear-gradient(140deg, ${t.accentDim} 0%, ${t.card} 100%)`,
      border: `1px solid ${t.border}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: size * 0.36, color: t.bright,
      letterSpacing: -0.5, flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

function Sparkline({ values, color, w = 80, h = 22 }) {
  if (!values?.length) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DeltaPill({ delta, suffix = "", inv = false }) {
  if (delta === 0 || delta === "0") {
    return (
      <span style={{
        fontSize: 10, fontWeight: 600, color: t.dim, letterSpacing: 0.5,
        textTransform: "uppercase",
      }}>flat</span>
    );
  }
  const n = typeof delta === "string" ? parseFloat(delta) : delta;
  const up = inv ? n < 0 : n > 0;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "2px 7px", borderRadius: 999,
      background: up ? `${t.green}1f` : `${t.red}1f`,
      color: up ? t.green : t.red,
      fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
    }}>
      {up ? "▲" : "▼"} {typeof delta === "string" ? delta.replace(/^[+-]/, "") : Math.abs(delta)}{suffix}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HERO — Keeper Card (the front of the app)
// ═══════════════════════════════════════════════════════════════════════════

function KeeperHero() {
  const delta = FORM.value - FORM.prev;

  return (
    <div style={{
      position: "relative", overflow: "hidden",
      background: `radial-gradient(ellipse at 70% 30%, ${t.accentDim}55 0%, ${t.card} 60%)`,
      border: `1px solid ${t.border}`,
      borderRadius: 20,
      padding: "36px 40px",
      display: "grid",
      gridTemplateColumns: "minmax(260px, 1fr) minmax(280px, 1.1fr) minmax(280px, 1fr)",
      gap: 40,
      alignItems: "center",
      minHeight: 280,
    }}>
      <NetMotif opacity={0.06} color={t.accent} />

      {/* ── LEFT: identity ─────────────────────────────────────────────── */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <MonogramAvatar initials="JM" size={84} />
          <div>
            <div style={{
              fontSize: 9, fontWeight: 500, letterSpacing: 2.4,
              color: t.dim, textTransform: "uppercase", marginBottom: 6,
            }}>
              Your goalkeeper
            </div>
            <div style={{
              fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 700, color: t.bright,
              letterSpacing: -0.4, lineHeight: 1.05,
            }}>
              {KEEPER.name}
            </div>
            <div style={{ fontSize: 12, color: t.text, marginTop: 4, fontWeight: 400 }}>
              <span style={{ color: t.accent, fontWeight: 600 }}>#{KEEPER.number}</span>
              <span style={{ color: t.dim, margin: "0 7px" }}>·</span>
              <span>{KEEPER.ageGroup}</span>
              <span style={{ color: t.dim, margin: "0 7px" }}>·</span>
              <span>{KEEPER.club}</span>
            </div>
          </div>
        </div>

        <div style={{
          display: "flex", gap: 18, paddingTop: 12,
          borderTop: `1px solid ${t.border}`,
        }}>
          <div>
            <div style={{ fontSize: 9, color: t.dim, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 3 }}>Matches</div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 700, color: t.bright }}>{KEEPER.matches}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: t.dim, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 3 }}>Season</div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 700, color: t.bright }}>2025–26</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: t.dim, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 3 }}>Tracked since</div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 700, color: t.bright }}>{KEEPER.since}</div>
          </div>
        </div>
      </div>

      {/* ── CENTER: form score ─────────────────────────────────────────── */}
      <div style={{
        position: "relative", zIndex: 1,
        display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
        padding: "0 20px",
      }}>
        <div style={{
          fontSize: 9, fontWeight: 500, letterSpacing: 2.6,
          color: t.dim, textTransform: "uppercase", marginBottom: 10,
        }}>
          Form Score · Last 5
        </div>

        <div style={{ position: "relative", display: "flex", alignItems: "baseline", gap: 6 }}>
          <div style={{
            fontFamily: FONT_DISPLAY, fontSize: 132, fontWeight: 700, color: t.bright,
            lineHeight: 0.9, letterSpacing: -4,
          }}>
            {FORM.value}
          </div>
          <div style={{ fontSize: 18, color: t.dim, fontWeight: 500 }}>/100</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
          <div style={{
            padding: "4px 12px",
            background: `${t.accent}1f`,
            color: t.accent,
            borderRadius: 999,
            fontSize: 10, fontWeight: 700, letterSpacing: 1.4,
          }}>{FORM.tier}</div>
          <DeltaPill delta={`+${delta}`} />
        </div>

        <div style={{
          marginTop: 14, fontSize: 11, color: t.text, fontWeight: 300, lineHeight: 1.5,
          maxWidth: 260,
        }}>
          Composite of save %, result quality, distribution, and errors.
          <span style={{ color: t.accent, marginLeft: 4, cursor: "pointer", fontWeight: 500 }}>How is this calculated?</span>
        </div>
      </div>

      {/* ── RIGHT: what's new + CTA ────────────────────────────────────── */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{
          fontSize: 9, fontWeight: 500, letterSpacing: 2.4,
          color: t.dim, textTransform: "uppercase", marginBottom: 4,
        }}>
          What's new
        </div>

        {/* Latest match pill */}
        <div style={{
          padding: "14px 16px",
          background: t.cardAlt,
          border: `1px solid ${t.border}`,
          borderRadius: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{
              padding: "2px 7px", borderRadius: 4,
              background: `${t.green}22`, color: t.green,
              fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
            }}>{LATEST_MATCH.result}</span>
            <span style={{ fontSize: 11, color: t.dim, fontWeight: 500 }}>{LATEST_MATCH.date}</span>
          </div>
          <div style={{ fontSize: 13, color: t.bright, fontWeight: 600, marginBottom: 3 }}>
            vs {LATEST_MATCH.opponent}
          </div>
          <div style={{ fontSize: 11, color: t.text, fontWeight: 300 }}>
            {LATEST_MATCH.saves} saves on {LATEST_MATCH.shots} shots ·
            <span style={{ color: t.accent, fontWeight: 600, marginLeft: 4 }}>{LATEST_MATCH.savePct}%</span>
          </div>
        </div>

        {/* Pending clips pill */}
        <div style={{
          padding: "12px 16px",
          background: t.cardAlt,
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: `${t.gold}22`, color: t.gold,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700,
          }}>{PENDING_CLIPS}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: t.bright, fontWeight: 600 }}>Clips ready to review</div>
            <div style={{ fontSize: 10, color: t.dim, fontWeight: 400 }}>From Saturday's match</div>
          </div>
        </div>

        {/* Primary CTA */}
        <Link href={`/review?matchId=${LATEST_MATCH.matchId}`} style={{ textDecoration: "none" }}>
          <button style={{
            width: "100%", padding: "14px 16px",
            background: t.accent,
            border: "none",
            borderRadius: 12,
            color: "#06251a",
            fontFamily: FONT_BODY, fontSize: 13, fontWeight: 700,
            letterSpacing: 0.3, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            transition: "transform 0.12s",
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-1px)"}
          onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}>
            <span>▶</span> Review Saturday's match
          </button>
        </Link>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SANDWICH — Trending up + Focus areas
// ═══════════════════════════════════════════════════════════════════════════

function SandwichCard({ title, accent, items, kind }) {
  return (
    <div style={{
      background: t.card, border: `1px solid ${t.border}`, borderRadius: 16,
      padding: "24px 24px 16px", height: "100%",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: accent,
          letterSpacing: 2, textTransform: "uppercase",
        }}>{title}</span>
        <div style={{ flex: 1, height: 1, background: t.border }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {items.map((it, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "flex-start", gap: 14,
            paddingBottom: 14,
            borderBottom: i === items.length - 1 ? "none" : `1px solid ${t.border}`,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: t.bright, fontWeight: 600 }}>{it.metric}</span>
                <span style={{ fontFamily: FONT_DISPLAY, fontSize: 16, color: accent, fontWeight: 700 }}>{it.value}</span>
                {kind === "up" && it.delta !== "0" && <DeltaPill delta={it.delta} />}
              </div>
              <div style={{ fontSize: 11, color: t.text, fontWeight: 300, lineHeight: 1.5 }}>
                {it.context || it.note}
              </div>
              {it.clipTag && (
                <div style={{
                  marginTop: 7,
                  display: "inline-flex", alignItems: "center", gap: 5,
                  fontSize: 10, color: t.accent, fontWeight: 600, cursor: "pointer",
                  letterSpacing: 0.3,
                }}>
                  <span>→</span> {it.clipTag}
                </div>
              )}
            </div>
            {kind === "up" && it.spark && (
              <div style={{ flexShrink: 0, marginTop: 2 }}>
                <Sparkline values={it.spark} color={accent} w={68} h={22} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STATS STRIP
// ═══════════════════════════════════════════════════════════════════════════

function StatsStrip() {
  return (
    <div style={{
      background: t.card, border: `1px solid ${t.border}`, borderRadius: 16,
      padding: "20px 8px",
      display: "grid",
      gridTemplateColumns: "repeat(6, 1fr)",
    }}>
      {SEASON_STATS.map((s, i) => (
        <div key={i} style={{
          padding: "4px 12px",
          textAlign: "center",
          borderRight: i === SEASON_STATS.length - 1 ? "none" : `1px solid ${t.border}`,
        }}>
          <div style={{ fontSize: 9, color: t.dim, letterSpacing: 1.6, textTransform: "uppercase", marginBottom: 6 }}>
            {s.label}
          </div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 700, color: t.bright, lineHeight: 1 }}>
            {s.value}
          </div>
          {s.sub && (
            <div style={{ fontSize: 9, color: t.dim, marginTop: 4 }}>{s.sub}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RECENT MATCHES
// ═══════════════════════════════════════════════════════════════════════════

function RecentMatches() {
  return (
    <div style={{
      background: t.card, border: `1px solid ${t.border}`, borderRadius: 16,
      padding: "20px 24px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: t.dim, letterSpacing: 2, textTransform: "uppercase" }}>
          Recent matches
        </span>
        <div style={{ flex: 1, height: 1, background: t.border }} />
        <Link href="/dashboard" style={{ fontSize: 10, color: t.accent, textDecoration: "none", fontWeight: 600, letterSpacing: 0.5 }}>
          ALL 13 →
        </Link>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {RECENT_FIVE.map((m, i) => {
          const resColor = m.res === "W" ? t.green : m.res === "D" ? t.gold : t.red;
          return (
            <div key={i} style={{
              display: "grid",
              gridTemplateColumns: "70px 28px 1fr 90px 70px 90px",
              alignItems: "center",
              gap: 14,
              padding: "10px 4px",
              borderBottom: i === RECENT_FIVE.length - 1 ? "none" : `1px solid ${t.border}`,
              fontSize: 12,
            }}>
              <span style={{ color: t.dim, fontWeight: 500 }}>{m.date}</span>
              <span style={{
                width: 22, height: 22, borderRadius: 6,
                background: `${resColor}22`, color: resColor,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700,
              }}>{m.res}</span>
              <span style={{ color: t.bright, fontWeight: 500 }}>{m.opp}</span>
              <span style={{ color: t.text, fontWeight: 400 }}>{m.score}</span>
              <span style={{ color: t.dim, fontWeight: 400 }}>{m.saves}</span>
              <span style={{ color: t.accent, fontWeight: 700, textAlign: "right" }}>
                {m.pct.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function DashboardPreview() {
  return (
    <div style={{
      minHeight: "100vh", background: t.bg, color: t.text,
      fontFamily: FONT_BODY,
    }}>
      {/* Top strip */}
      <div style={{
        padding: "16px 32px",
        borderBottom: `1px solid ${t.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: t.card,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{
            fontFamily: FONT_DISPLAY, fontSize: 14, fontWeight: 700, color: t.bright,
            letterSpacing: -0.2,
          }}>
            stix<span style={{ color: t.accent }}>analytix</span>
          </span>
          <span style={{ fontSize: 9, color: t.dim, letterSpacing: 1.8, textTransform: "uppercase", marginLeft: 8 }}>
            Preview · Landing concept
          </span>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          <Link href="/dashboard" style={{ fontSize: 11, color: t.dim, textDecoration: "none", letterSpacing: 0.4 }}>
            ← Back to live dashboard
          </Link>
        </div>
      </div>

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 28px 80px" }}>

        {/* Hero */}
        <KeeperHero />

        {/* Sandwich */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 20,
          marginTop: 20,
        }}>
          <SandwichCard title="Trending up · Last 5" accent={t.green} items={TRENDING_UP} kind="up" />
          <SandwichCard title="Focus for next session" accent={t.gold} items={FOCUS_AREAS} kind="focus" />
        </div>

        {/* Stats strip */}
        <div style={{ marginTop: 20 }}>
          <StatsStrip />
        </div>

        {/* Recent matches */}
        <div style={{ marginTop: 20 }}>
          <RecentMatches />
        </div>

        {/* Designer note */}
        <div style={{
          marginTop: 40, padding: "16px 20px",
          background: "transparent",
          border: `1px dashed ${t.border}`,
          borderRadius: 12,
          fontSize: 11, color: t.dim, lineHeight: 1.7, fontWeight: 300,
        }}>
          <strong style={{ color: t.text, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", fontSize: 9, display: "block", marginBottom: 6 }}>
            Designer notes
          </strong>
          Mock-up — numbers are Judah's real values as of {new Date().toLocaleDateString("en-CA", { dateStyle: "medium" })}.
          Multi-keeper coaches would see a horizontal tab/swipe across the top of the hero.
          The Form Score (84) is a composite proposal: save % (40), result quality (30), distribution (20), error penalty (10).
          The "trending up" sparklines use the last-5 sequence.
          The CTA on the hero is the load-bearing element — it's what coaches come back to the app for.
        </div>
      </main>
    </div>
  );
}
