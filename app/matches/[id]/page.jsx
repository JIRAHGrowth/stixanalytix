"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const t = {
  bg: "#070b0e", card: "#0f1419", cardAlt: "#151c22", border: "#1e2a32",
  accent: "#10b981", accentDim: "#065f46", red: "#ef4444",
  green: "#22c55e", yellow: "#eab308", orange: "#f97316",
  text: "#d1d9e0", dim: "#5c6b77", bright: "#f0f4f7",
};
const font = "'DM Sans', -apple-system, sans-serif";

const ZONE_LABELS = {
  "High L": "Top Left", "High C": "Top Centre", "High R": "Top Right",
  "Mid L": "Mid Left", "Mid C": "Mid Centre", "Mid R": "Mid Right",
  "Low L": "Low Left", "Low C": "Low Centre", "Low R": "Low Right",
};
const ORIGIN_LABELS = {
  "6yard": "6-Yard Box", "boxL": "Left Channel", "boxC": "Central Box",
  "boxR": "Right Channel", "outL": "Wide Left", "outC": "Central Distance",
  "outR": "Wide Right", "cornerL": "Corner Left", "cornerR": "Corner Right",
  "crossL": "Cross Left", "crossR": "Cross Right",
};
const ACTION_COLORS = {
  Catch: t.green, Block: t.green, Parry: t.accent, Deflect: t.accent,
  Punch: t.accent, Missed: t.red, Goal: t.red, unclear: t.dim,
};

function fmtTs(s) {
  if (s == null) return null;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export default function MatchDetailPage() {
  const { user, supabase, loading: authLoading } = useAuth();
  const { id } = useParams();
  const [match, setMatch] = useState(null);
  const [goalsConceded, setGoalsConceded] = useState([]);
  const [goalsScored, setGoalsScored] = useState([]);
  const [saves, setSaves] = useState([]);
  const [keeper, setKeeper] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user || !id) return;
    let mounted = true;
    (async () => {
      const matchRes = await supabase.from("matches").select("*").eq("id", id).maybeSingle();
      if (!mounted) return;
      if (matchRes.error || !matchRes.data) {
        setError(matchRes.error?.message || "Match not found");
        setLoading(false);
        return;
      }
      setMatch(matchRes.data);

      const [gcRes, gsRes, seRes, kRes] = await Promise.all([
        supabase.from("goals_conceded").select("*").eq("match_id", id).order("timestamp_seconds", { ascending: true, nullsFirst: false }),
        supabase.from("goals_scored").select("*").eq("match_id", id).order("timestamp_seconds", { ascending: true, nullsFirst: false }),
        supabase.from("shot_events").select("*").eq("match_id", id).order("timestamp_seconds", { ascending: true, nullsFirst: false }),
        matchRes.data.keeper_id ? supabase.from("keepers").select("*").eq("id", matchRes.data.keeper_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (!mounted) return;
      setGoalsConceded(gcRes.data || []);
      setGoalsScored(gsRes.data || []);
      setSaves(seRes.data || []);
      setKeeper(kRes.data);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [user, id, supabase]);

  const onTargetCount = useMemo(() => saves.filter(s => s.on_target === "yes").length, [saves]);
  const fullSavesCount = useMemo(() => saves.filter(s => ["Catch", "Block", "Parry", "Deflect", "Punch"].includes(s.gk_action)).length, [saves]);

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, color: t.dim, fontFamily: font, display: "grid", placeItems: "center" }}>
        Loading match…
      </div>
    );
  }
  if (error || !match) {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, color: t.red, fontFamily: font, padding: 40, textAlign: "center" }}>
        {error || "Match not found"}
        <div style={{ marginTop: 14 }}><Link href="/dashboard" style={{ color: t.accent }}>← Back to dashboard</Link></div>
      </div>
    );
  }

  const result = match.result;
  const resultColor = result === "Win" ? t.green : result === "Loss" ? t.red : t.dim;

  return (
    <div style={{ minHeight: "100vh", background: t.bg, fontFamily: font, color: t.text }}>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", borderBottom: `1px solid ${t.border}`, maxWidth: 1100, margin: "0 auto" }}>
        <Link href="/dashboard" style={{ textDecoration: "none", color: t.bright, fontWeight: 700, fontSize: 16 }}>← Dashboard</Link>
        <div style={{ fontSize: 12, color: t.dim }}>Match detail</div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px" }}>
        {/* MATCH HEADER */}
        <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 16, padding: 24, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: t.dim, letterSpacing: 0.4, marginBottom: 6, textTransform: "uppercase" }}>{match.session_type || "match"} · {match.match_date}</div>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: t.bright, margin: "0 0 6px" }}>
                {keeper?.name || "Keeper"} {match.opponent ? `vs ${match.opponent}` : ""}
              </h1>
              <div style={{ fontSize: 13, color: t.dim }}>
                {match.venue && <span style={{ textTransform: "capitalize", marginRight: 12 }}>{match.venue}</span>}
                {match.logged_via === "video" && <span style={{ padding: "2px 8px", borderRadius: 4, background: t.accent + "22", color: t.accent, fontSize: 11, fontWeight: 600 }}>📹 Video-tagged</span>}
                {match.source_url && <a href={match.source_url} target="_blank" rel="noreferrer" style={{ marginLeft: 10, color: t.dim, textDecoration: "underline" }}>source ↗</a>}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: t.dim, letterSpacing: 0.4, marginBottom: 4, textTransform: "uppercase" }}>Final</div>
              <div style={{ fontSize: 36, fontWeight: 700, color: t.bright, lineHeight: 1 }}>
                {match.goals_for ?? 0} <span style={{ color: t.dim, fontWeight: 400 }}>–</span> {match.goals_against ?? 0}
              </div>
              {result && <div style={{ fontSize: 13, fontWeight: 700, color: resultColor, marginTop: 4 }}>{result}</div>}
            </div>
          </div>

          {/* Top stats strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginTop: 24, paddingTop: 20, borderTop: `1px solid ${t.border}` }}>
            <Stat label="Shots faced" value={match.shots_on_target ?? saves.length} />
            <Stat label="Saves" value={match.saves ?? fullSavesCount} />
            <Stat label="Save %" value={match.save_percentage != null ? `${(match.save_percentage * 100).toFixed(0)}%` : "—"} />
            <Stat label="Clean sheet" value={(match.goals_against ?? 0) === 0 ? "✓" : "—"} />
          </div>
        </div>

        {/* GOALS SCORED */}
        {goalsScored.length > 0 && (
          <Section title={`Goals scored (${goalsScored.length})`}>
            {goalsScored.map(g => (
              <EventCard key={g.id} time={g.timestamp_seconds} accent={t.green}>
                <div style={{ fontSize: 13, color: t.bright, fontWeight: 600 }}>
                  {g.attack_type ? labelize(g.attack_type) : "Open play"}
                </div>
                {g.shot_description && <Para label="Play">{g.shot_description}</Para>}
                {g.coach_notes && <Para label="Coach">{g.coach_notes}</Para>}
              </EventCard>
            ))}
          </Section>
        )}

        {/* GOALS CONCEDED */}
        {goalsConceded.length > 0 && (
          <Section title={`Goals conceded (${goalsConceded.length})`} accent={t.red}>
            {goalsConceded.map(g => (
              <EventCard key={g.id} time={g.timestamp_seconds} accent={t.red}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {g.goal_source && <Pill color={t.red}>{g.goal_source}</Pill>}
                  {g.shot_origin && <Pill>{ORIGIN_LABELS[g.shot_origin] || g.shot_origin}</Pill>}
                  {g.shot_type && <Pill>{g.shot_type}</Pill>}
                  {g.goal_zone && <Pill>{ZONE_LABELS[g.goal_zone] || g.goal_zone}</Pill>}
                  {g.goal_rank && <Pill color={g.goal_rank === "Saveable" ? t.red : g.goal_rank === "Difficult" ? t.yellow : t.dim}>{g.goal_rank}</Pill>}
                </div>
                {g.shot_description && <Para label="Play">{g.shot_description}</Para>}
                {g.gk_observations && <Para label="GK">{g.gk_observations}</Para>}
                {g.coach_notes && <Para label="Coach">{g.coach_notes}</Para>}
              </EventCard>
            ))}
          </Section>
        )}

        {/* SAVES */}
        {saves.length > 0 && (
          <Section title={`Saves (${saves.length})`}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
              {saves.map(s => {
                const actionColor = ACTION_COLORS[s.gk_action] || t.dim;
                return (
                  <EventCard key={s.id} time={s.timestamp_seconds} accent={actionColor} compact>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                      {s.gk_action && <Pill color={actionColor}>{s.gk_action}</Pill>}
                      {s.shot_origin && <Pill>{ORIGIN_LABELS[s.shot_origin] || s.shot_origin}</Pill>}
                      {s.shot_type && <Pill>{s.shot_type}</Pill>}
                      {s.body_distance_zone && <Pill title={s.body_distance_zone === "A" ? "near body" : s.body_distance_zone === "B" ? "within 2yd" : s.body_distance_zone === "C" ? "full extension" : ""}>Zone {s.body_distance_zone}</Pill>}
                      {s.outcome && <Pill>{labelize(s.outcome)}</Pill>}
                      {s.coach_added && <Pill color={t.accent}>coach added</Pill>}
                    </div>
                    {s.shot_description && <Para label="Play">{s.shot_description}</Para>}
                    {s.gk_observations && <Para label="GK">{s.gk_observations}</Para>}
                    {s.coach_notes && <Para label="Coach">{s.coach_notes}</Para>}
                  </EventCard>
                );
              })}
            </div>
          </Section>
        )}

        {/* MATCH NOTES (compact summary now, not a wall of text) */}
        {match.notes && (
          <Section title="Match summary notes">
            <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, fontSize: 12, color: t.text, whiteSpace: "pre-wrap", fontFamily: "ui-monospace, monospace", lineHeight: 1.6 }}>
              {match.notes}
            </div>
          </Section>
        )}

        {!goalsScored.length && !goalsConceded.length && !saves.length && (
          <div style={{ background: t.card, border: `1px dashed ${t.border}`, borderRadius: 12, padding: 32, textAlign: "center", color: t.dim, fontSize: 13 }}>
            No structured event detail captured for this match yet.
            {match.logged_via === "pitchside" && " (Pitchside-logged matches use the legacy field-only schema; events will appear here for video-tagged matches.)"}
          </div>
        )}
      </div>
    </div>
  );
}

// — small primitives —

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: t.dim, letterSpacing: 0.4, marginBottom: 4, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: t.bright }}>{value}</div>
    </div>
  );
}

function Section({ title, accent, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 12, fontWeight: 700, color: accent || t.dim, letterSpacing: 0.6, margin: "20px 0 10px", textTransform: "uppercase" }}>{title}</h2>
      {children}
    </div>
  );
}

function EventCard({ time, accent, children, compact }) {
  return (
    <div style={{ background: t.card, border: `1px solid ${t.border}`, borderLeft: `3px solid ${accent || t.border}`, borderRadius: 10, padding: compact ? 12 : 14, marginBottom: compact ? 0 : 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: t.dim, letterSpacing: 0.4, fontWeight: 600 }}>{fmtTs(time) || "—"}</div>
      </div>
      {children}
    </div>
  );
}

function Pill({ children, color, title }) {
  const c = color || t.dim;
  return (
    <span title={title} style={{ padding: "2px 8px", fontSize: 10, fontWeight: 600, borderRadius: 4, background: c + "15", color: c, border: `1px solid ${c}33`, textTransform: "capitalize", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function Para({ label, children }) {
  return (
    <div style={{ fontSize: 12, color: t.text, lineHeight: 1.5, marginBottom: 4 }}>
      <span style={{ color: t.dim, fontWeight: 600 }}>{label}:</span> {children}
    </div>
  );
}

function labelize(s) {
  return String(s || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
