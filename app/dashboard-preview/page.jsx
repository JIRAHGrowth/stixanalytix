"use client";

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD-PREVIEW — Keeper-card landing, wired to live data.
// All 5 design decisions from 2026-06-15 are honoured via lib/keeper-form.js.
// Lives at /dashboard-preview until route swap; current /dashboard untouched.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { tDark as t } from "@/lib/theme";
import { FONT } from "@/lib/constants";
import { fetchActiveKeepers } from "@/lib/queries";
import { aggregateMatches } from "@/lib/stats";
import {
  buildKeeperCardData,
  METRIC_LABEL,
} from "@/lib/keeper-form";

const FONT_DISPLAY = FONT;
const FONT_BODY = FONT;

// ─── Formatters ─────────────────────────────────────────────────────────────
function fmtMetricValue(metric, v) {
  if (v == null) return "—";
  // Counts
  if (metric === "errors_leading_to_goal") return String(Math.round(v));
  // Decimals (goals/match, attributes)
  if (metric === "goals_against_per_match") return v.toFixed(2);
  if (isAttribute(metric)) return v.toFixed(1);
  // Default: ratio → %
  return `${(v * 100).toFixed(1)}%`;
}
function fmtMetricDelta(metric, d) {
  if (d == null) return "";
  const sign = d > 0 ? "+" : "";
  if (metric === "errors_leading_to_goal") return `${sign}${Math.round(d)}`;
  if (metric === "goals_against_per_match") return `${sign}${d.toFixed(2)}`;
  if (isAttribute(metric)) return `${sign}${d.toFixed(1)}`;
  // ratio → pp
  return `${sign}${(d * 100).toFixed(1)}pp`;
}
const ATTR_METRICS = new Set([
  "shot_stopping","handling","positioning","aerial_dominance","distribution",
  "footwork_agility","reaction_speed","set_piece_org","command_of_box",
  "sweeper_play","decision_making","composure","compete_level","communication",
]);
function isAttribute(m) { return ATTR_METRICS.has(m); }

function fmtMatchDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function fmtInitials(name) {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).slice(0, 2).map(s => s[0]).join("").toUpperCase();
}

// ─── UI atoms (carried over from the mockup) ────────────────────────────────
function NetMotif({ opacity = 0.08, color = "#10b981" }) {
  return (
    <svg viewBox="0 0 600 280" preserveAspectRatio="xMidYMid slice"
         style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
      <g stroke={color} strokeWidth="1.1" opacity={opacity} strokeLinecap="square">
        {Array.from({ length: 11 }).map((_, i) => (
          <line key={`v${i}`} x1={i * 60} y1="0" x2={i * 60} y2="280" />
        ))}
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
    }}>{initials}</div>
  );
}

function Sparkline({ values, color, w = 80, h = 22 }) {
  if (!values?.length || values.length < 2) return null;
  const finite = values.filter(v => v != null && Number.isFinite(v));
  if (finite.length < 2) return null;
  const min = Math.min(...finite), max = Math.max(...finite);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const val = v ?? min;
    const y = h - ((val - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DeltaPill({ delta, suffix = "" }) {
  if (delta == null || delta === 0) {
    return (
      <span style={{
        fontSize: 10, fontWeight: 600, color: t.dim, letterSpacing: 0.5,
        textTransform: "uppercase",
      }}>flat</span>
    );
  }
  const up = delta > 0;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "2px 7px", borderRadius: 999,
      background: up ? `${t.green}1f` : `${t.red}1f`,
      color: up ? t.green : t.red,
      fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
    }}>
      {up ? "▲" : "▼"} {Math.abs(delta)}{suffix}
    </span>
  );
}

function ModalityBadge({ modality }) {
  const map = {
    watch: { label: "▶ Watch", color: t.accent },
    reel:  { label: "▶ Reel · 3 clips", color: t.cyan },
    talk:  { label: "💬 Talk", color: t.gold },
  };
  const m = map[modality] || map.watch;
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, letterSpacing: 0.4,
      color: m.color, textTransform: "uppercase",
    }}>{m.label}</span>
  );
}

// ─── HERO ───────────────────────────────────────────────────────────────────
function KeeperHero({ keeper, club, formScore, latestMatch, pendingClipCount, totalMatches, since }) {
  const delta = formScore.delta;
  const initials = fmtInitials(keeper?.name);
  const ageGroup = keeper?.age_group || keeper?.depth || "—";

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

      {/* LEFT: identity */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <MonogramAvatar initials={initials} size={84} />
          <div>
            <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: 2.4, color: t.dim, textTransform: "uppercase", marginBottom: 6 }}>
              Your goalkeeper
            </div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 700, color: t.bright, letterSpacing: -0.4, lineHeight: 1.05 }}>
              {keeper?.name || "—"}
            </div>
            <div style={{ fontSize: 12, color: t.text, marginTop: 4, fontWeight: 400 }}>
              {keeper?.number != null && (
                <>
                  <span style={{ color: t.accent, fontWeight: 600 }}>#{keeper.number}</span>
                  <span style={{ color: t.dim, margin: "0 7px" }}>·</span>
                </>
              )}
              <span>{ageGroup}</span>
              {club?.name && (
                <>
                  <span style={{ color: t.dim, margin: "0 7px" }}>·</span>
                  <span>{club.name}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 18, paddingTop: 12, borderTop: `1px solid ${t.border}` }}>
          <div>
            <div style={{ fontSize: 9, color: t.dim, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 3 }}>Matches</div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 700, color: t.bright }}>{totalMatches}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: t.dim, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 3 }}>Season</div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 700, color: t.bright }}>2025–26</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: t.dim, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 3 }}>Tracked since</div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 700, color: t.bright }}>{since || "—"}</div>
          </div>
        </div>
      </div>

      {/* CENTER: form score */}
      <div style={{
        position: "relative", zIndex: 1,
        display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
        padding: "0 20px",
      }}>
        <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: 2.6, color: t.dim, textTransform: "uppercase", marginBottom: 10 }}>
          Form Score · Last 5
        </div>

        <div style={{ position: "relative", display: "flex", alignItems: "baseline", gap: 6 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 132, fontWeight: 700, color: t.bright, lineHeight: 0.9, letterSpacing: -4 }}>
            {formScore.value ?? "—"}
          </div>
          <div style={{ fontSize: 18, color: t.dim, fontWeight: 500 }}>/100</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
          {formScore.tier && (
            <div style={{
              padding: "4px 12px",
              background: `${t.accent}1f`, color: t.accent, borderRadius: 999,
              fontSize: 10, fontWeight: 700, letterSpacing: 1.4,
            }}>{formScore.tier}</div>
          )}
          {delta != null && delta !== 0 && (
            <DeltaPill delta={delta} />
          )}
        </div>

        <div style={{
          marginTop: 14, fontSize: 11, color: t.text, fontWeight: 300, lineHeight: 1.5,
          maxWidth: 260,
        }}>
          Composite of save %, result quality, distribution, and errors.
          <br/>
          {formScore.components && (
            <span style={{ color: t.dim, fontSize: 10 }}>
              save {formScore.components.save_pct} · result {formScore.components.result_quality}
              · dist {formScore.components.dist_success} · err {formScore.components.error_penalty}
            </span>
          )}
        </div>
      </div>

      {/* RIGHT: what's new + CTA */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: 2.4, color: t.dim, textTransform: "uppercase", marginBottom: 4 }}>
          What's new
        </div>

        {latestMatch ? (
          <div style={{
            padding: "14px 16px",
            background: t.cardAlt, border: `1px solid ${t.border}`, borderRadius: 12,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{
                padding: "2px 7px", borderRadius: 4,
                background: `${resultColor(latestMatch.result)}22`,
                color: resultColor(latestMatch.result),
                fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
              }}>
                {latestMatch.result || "—"} {latestMatch.goals_for}–{latestMatch.goals_against}
              </span>
              <span style={{ fontSize: 11, color: t.dim, fontWeight: 500 }}>{fmtMatchDate(latestMatch.match_date)}</span>
            </div>
            <div style={{ fontSize: 13, color: t.bright, fontWeight: 600, marginBottom: 3 }}>
              vs {latestMatch.opponent || "—"}
            </div>
            <div style={{ fontSize: 11, color: t.text, fontWeight: 300 }}>
              {latestMatch.saves ?? 0} saves on {latestMatch.shots_on_target ?? 0} shots
              {latestMatch.shots_on_target > 0 && (
                <>
                  {" · "}
                  <span style={{ color: t.accent, fontWeight: 600 }}>
                    {((latestMatch.saves / latestMatch.shots_on_target) * 100).toFixed(1)}%
                  </span>
                </>
              )}
            </div>
          </div>
        ) : (
          <div style={{
            padding: "14px 16px",
            background: t.cardAlt, border: `1px solid ${t.border}`, borderRadius: 12,
            fontSize: 11, color: t.dim,
          }}>
            No matches yet — log one in pitchside or upload a video.
          </div>
        )}

        {pendingClipCount > 0 && (
          <div style={{
            padding: "12px 16px",
            background: t.cardAlt, border: `1px solid ${t.border}`, borderRadius: 12,
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: `${t.gold}22`, color: t.gold,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 700,
            }}>{pendingClipCount}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: t.bright, fontWeight: 600 }}>Videos waiting to review</div>
              <div style={{ fontSize: 10, color: t.dim, fontWeight: 400 }}>From your /upload queue</div>
            </div>
          </div>
        )}

        {latestMatch && (
          <Link href={`/matches/${latestMatch.id}`} style={{ textDecoration: "none" }}>
            <button style={{
              width: "100%", padding: "14px 16px",
              background: t.accent, border: "none", borderRadius: 12,
              color: "#06251a",
              fontFamily: FONT_BODY, fontSize: 13, fontWeight: 700, letterSpacing: 0.3,
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "transform 0.12s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-1px)"}
            onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}>
              <span>▶</span> Review latest match
            </button>
          </Link>
        )}
      </div>
    </div>
  );
}

function resultColor(r) {
  return r === "W" ? t.green : r === "D" ? t.gold : r === "L" ? t.red : t.dim;
}

// ─── Sandwich card ─────────────────────────────────────────────────────────
function SandwichCard({ title, accent, items, kind, emptyHint }) {
  return (
    <div style={{
      background: t.card, border: `1px solid ${t.border}`, borderRadius: 16,
      padding: "24px 24px 16px", height: "100%",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: accent, letterSpacing: 2, textTransform: "uppercase" }}>{title}</span>
        <div style={{ flex: 1, height: 1, background: t.border }} />
      </div>

      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: t.dim, fontWeight: 300, lineHeight: 1.5, padding: "20px 0" }}>
          {emptyHint}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {items.map((it, i) => (
            <div key={it.metric} style={{
              display: "flex", alignItems: "flex-start", gap: 14,
              paddingBottom: 14,
              borderBottom: i === items.length - 1 ? "none" : `1px solid ${t.border}`,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, color: t.bright, fontWeight: 600 }}>{it.label}</span>
                  <span style={{ fontFamily: FONT_DISPLAY, fontSize: 16, color: accent, fontWeight: 700 }}>
                    {fmtMetricValue(it.metric, it.current)}
                  </span>
                  <DeltaPill delta={parseFloat(fmtMetricDelta(it.metric, it.delta).replace(/[+pp]/g, ""))} suffix={isAttribute(it.metric) ? "" : "pp"} />
                </div>
                <div style={{ fontSize: 11, color: t.text, fontWeight: 300, lineHeight: 1.5 }}>
                  {kind === "up" ? "L5 vs prior 5" : "Watch the trend"} ·
                  prev {fmtMetricValue(it.metric, it.previous)} · n={it.n_current}
                </div>
                <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 10 }}>
                  <ModalityBadge modality={it.modality} />
                  {it.bestClip && (
                    <span style={{ fontSize: 10, color: t.dim, fontFamily: "monospace" }}>
                      clip ready
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Stats strip + Recent matches ─────────────────────────────────────────
function StatsStrip({ seasonAgg, totalMatches }) {
  if (!seasonAgg) {
    return (
      <div style={{
        background: t.card, border: `1px solid ${t.border}`, borderRadius: 16,
        padding: 20, textAlign: "center", color: t.dim, fontSize: 12,
      }}>No season stats yet.</div>
    );
  }
  const winRate = seasonAgg.gp > 0 ? ((seasonAgg.w / seasonAgg.gp) * 100).toFixed(0) : "0";
  const stats = [
    { label: "Matches", value: String(totalMatches) },
    { label: "Win rate", value: `${winRate}%`, sub: `${seasonAgg.w}W · ${seasonAgg.d}D · ${seasonAgg.l}L` },
    { label: "Save %", value: `${(seasonAgg.svPct * 100).toFixed(0)}%`, sub: "Season avg" },
    { label: "GA / Match", value: seasonAgg.gaa.toFixed(2) },
    { label: "Clean sheets", value: String(seasonAgg.cs) },
    { label: "Saves logged", value: String(seasonAgg.saves) },
  ];
  return (
    <div style={{
      background: t.card, border: `1px solid ${t.border}`, borderRadius: 16,
      padding: "20px 8px",
      display: "grid", gridTemplateColumns: "repeat(6, 1fr)",
    }}>
      {stats.map((s, i) => (
        <div key={s.label} style={{
          padding: "4px 12px",
          textAlign: "center",
          borderRight: i === stats.length - 1 ? "none" : `1px solid ${t.border}`,
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

function RecentMatches({ matches }) {
  const recent = useMemo(() => {
    return [...matches]
      .filter(m => m.session_type === "match")
      .sort((a, b) => new Date(b.match_date) - new Date(a.match_date))
      .slice(0, 5);
  }, [matches]);

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
          ALL {matches.filter(m => m.session_type === "match").length} →
        </Link>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {recent.map((m, i) => {
          const rc = resultColor(m.result);
          const sotPct = m.shots_on_target > 0 ? (m.saves / m.shots_on_target) * 100 : null;
          return (
            <Link key={m.id} href={`/matches/${m.id}`} style={{ textDecoration: "none" }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "70px 28px 1fr 90px 70px 90px",
                alignItems: "center", gap: 14,
                padding: "10px 4px",
                borderBottom: i === recent.length - 1 ? "none" : `1px solid ${t.border}`,
                fontSize: 12,
                cursor: "pointer",
              }}>
                <span style={{ color: t.dim, fontWeight: 500 }}>{fmtMatchDate(m.match_date).replace(/^[A-Z][a-z]+ /, "")}</span>
                <span style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: `${rc}22`, color: rc,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700,
                }}>{m.result || "—"}</span>
                <span style={{ color: t.bright, fontWeight: 500 }}>{m.opponent || "—"}</span>
                <span style={{ color: t.text, fontWeight: 400 }}>{m.goals_for ?? 0}–{m.goals_against ?? 0}</span>
                <span style={{ color: t.dim, fontWeight: 400 }}>{m.saves ?? 0}/{m.shots_on_target ?? 0}</span>
                <span style={{ color: t.accent, fontWeight: 700, textAlign: "right" }}>
                  {sotPct != null ? `${sotPct.toFixed(1)}%` : "—"}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── PAGE ──────────────────────────────────────────────────────────────────
export default function DashboardPreview() {
  const { user, supabase, profile, club, loading: authLoading } = useAuth();
  const router = useRouter();

  const [keepers, setKeepers] = useState([]);
  const [activeKeeperId, setActiveKeeperId] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 1) Load active keepers once auth is ready
  useEffect(() => {
    if (authLoading || !user || !supabase) return;
    let mounted = true;
    (async () => {
      const ks = await fetchActiveKeepers(supabase, user.id);
      if (!mounted) return;
      setKeepers(ks);
      if (ks.length > 0 && !activeKeeperId) {
        setActiveKeeperId(ks[0].id);
      }
      if (ks.length === 0) {
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [authLoading, user, supabase]);

  // 2) Once a keeper is selected, fetch their data + compute card data
  useEffect(() => {
    if (!activeKeeperId || !user || !supabase) return;
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        const [matchRes, attrRes, seRes, vjRes] = await Promise.all([
          supabase.from("matches").select("*").eq("coach_id", user.id).eq("keeper_id", activeKeeperId)
            .order("match_date", { ascending: true }),
          supabase.from("match_attributes").select("*").eq("keeper_id", activeKeeperId),
          supabase.from("shot_events").select("*").eq("keeper_id", activeKeeperId)
            .or("keeper_team.is.null,keeper_team.neq.opp"),
          supabase.from("video_jobs").select("id", { count: "exact", head: true })
            .eq("coach_id", user.id).eq("status", "review_needed"),
        ]);
        if (!mounted) return;
        const matches = matchRes.data || [];
        const matchIds = matches.map(m => m.id);
        // goals_conceded carries coach_id but not keeper_id — fetch by match_id
        // to scope cleanly to this keeper only.
        const gcRes = matchIds.length
          ? await supabase.from("goals_conceded").select("*").in("match_id", matchIds)
          : { data: [] };
        if (!mounted) return;
        const attrs = attrRes.data || [];
        const shotEvents = seRes.data || [];
        const goalsConceded = gcRes.data || [];
        const card = buildKeeperCardData({ matches, attrs, shotEvents, goalsConceded });
        setData({
          matches, attrs, shotEvents, goalsConceded,
          card,
          pendingClipCount: vjRes.count ?? 0,
        });
        setLoading(false);
      } catch (e) {
        if (mounted) {
          setError(e.message || "Failed to load keeper data");
          setLoading(false);
        }
      }
    })();
    return () => { mounted = false; };
  }, [activeKeeperId, user, supabase]);

  // Season aggregate (for the stats strip) — computed on demand
  const seasonAgg = useMemo(() => {
    if (!data?.matches?.length) return null;
    const matchOnly = data.matches.filter(m => m.session_type === "match");
    if (!matchOnly.length) return null;
    return aggregateMatches(matchOnly);
  }, [data?.matches]);

  const activeKeeper = keepers.find(k => k.id === activeKeeperId);
  const latestMatch = data?.matches?.length
    ? [...data.matches].filter(m => m.session_type === "match").sort((a, b) => new Date(b.match_date) - new Date(a.match_date))[0]
    : null;
  const since = activeKeeper?.created_at
    ? new Date(activeKeeper.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : null;
  const totalMatches = data?.matches?.filter(m => m.session_type === "match").length ?? 0;

  // ── Render ─────────────────────────────────────────────────────────────
  if (authLoading) {
    return <FullPageMessage>Loading…</FullPageMessage>;
  }
  if (!user) {
    router.replace("/login?redirect=/dashboard-preview");
    return null;
  }

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: FONT_BODY }}>
      <TopBar keepers={keepers} activeKeeperId={activeKeeperId} setActiveKeeperId={setActiveKeeperId} />

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 28px 80px" }}>
        {loading ? (
          <FullPageMessage>Loading {activeKeeper?.name || "keeper"}…</FullPageMessage>
        ) : error ? (
          <FullPageMessage color={t.red}>{error}</FullPageMessage>
        ) : !activeKeeper ? (
          <FullPageMessage>No active keepers. Add one in Roster.</FullPageMessage>
        ) : !data?.matches?.length ? (
          <FullPageMessage>
            No matches yet for {activeKeeper.name}.<br/>
            <Link href="/pitchside" style={{ color: t.accent }}>Log one in pitchside</Link>{" "}
            or <Link href="/upload" style={{ color: t.accent }}>upload a video</Link>.
          </FullPageMessage>
        ) : (
          <>
            <KeeperHero
              keeper={activeKeeper}
              club={club}
              formScore={data.card.formScore}
              latestMatch={latestMatch}
              pendingClipCount={data.pendingClipCount}
              totalMatches={totalMatches}
              since={since}
            />

            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr",
              gap: 20, marginTop: 20,
            }}>
              <SandwichCard
                title="Trending up · Last 5 vs Prior 5"
                accent={t.green}
                items={data.card.trendingUp}
                kind="up"
                emptyHint="No significant gains yet — needs n≥8 events or n≥3 rated matches with a meaningful delta."
              />
              <SandwichCard
                title="Focus for next session"
                accent={t.gold}
                items={data.card.focusAreas}
                kind="focus"
                emptyHint="Nothing meaningful trending down. Stay the course."
              />
            </div>

            <div style={{ marginTop: 20 }}>
              <StatsStrip seasonAgg={seasonAgg} totalMatches={totalMatches} />
            </div>

            <div style={{ marginTop: 20 }}>
              <RecentMatches matches={data.matches} />
            </div>

            <DesignerNotes />
          </>
        )}
      </main>
    </div>
  );
}

function TopBar({ keepers, activeKeeperId, setActiveKeeperId }) {
  return (
    <div style={{
      padding: "16px 32px",
      borderBottom: `1px solid ${t.border}`,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: t.card,
      gap: 16, flexWrap: "wrap",
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

      {keepers.length > 1 && (
        <div style={{ display: "flex", gap: 4, background: t.bg, borderRadius: 8, padding: 3, border: `1px solid ${t.border}` }}>
          {keepers.map(k => (
            <button key={k.id} onClick={() => setActiveKeeperId(k.id)} style={{
              padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer",
              fontFamily: FONT_BODY, fontSize: 11,
              background: k.id === activeKeeperId ? t.accent + "22" : "transparent",
              color: k.id === activeKeeperId ? t.accent : t.dim,
              fontWeight: k.id === activeKeeperId ? 700 : 500,
            }}>{k.name}</button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 14 }}>
        <Link href="/dashboard" style={{ fontSize: 11, color: t.dim, textDecoration: "none", letterSpacing: 0.4 }}>
          ← Back to live dashboard
        </Link>
      </div>
    </div>
  );
}

function FullPageMessage({ children, color }) {
  return (
    <div style={{
      minHeight: "60vh", display: "grid", placeItems: "center",
      fontSize: 14, color: color || t.dim, fontWeight: 300, textAlign: "center",
      padding: "40px 20px",
    }}>{children}</div>
  );
}

function DesignerNotes() {
  return (
    <div style={{
      marginTop: 40, padding: "16px 20px",
      background: "transparent", border: `1px dashed ${t.border}`, borderRadius: 12,
      fontSize: 11, color: t.dim, lineHeight: 1.7, fontWeight: 300,
    }}>
      <strong style={{ color: t.text, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", fontSize: 9, display: "block", marginBottom: 6 }}>
        Designer notes
      </strong>
      Wired to live data via lib/keeper-form.js · Last 5 vs prior 5 window · stability check on
      median-of-3 · n≥8 ratios / n≥3 attrs · |Δ|≥8pp ratios / |Δ|≥0.5 attrs.
      Decision-making routes to Talk. Watch items carry their best clip already.
    </div>
  );
}
