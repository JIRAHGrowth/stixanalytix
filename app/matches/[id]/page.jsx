"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

import { tDark } from "@/lib/theme";
import { ZONE_LABELS, ORIGIN_LABELS, GK_ACTION_SEVERITY, FONT } from "@/lib/constants";
import { fetchMatchById, fetchMatchDetailBundle } from "@/lib/queries";
import VideoClip from "@/components/review/VideoClip";

const t = tDark;
const font = FONT;

const ACTION_COLORS = Object.fromEntries(
  Object.entries(GK_ACTION_SEVERITY).map(([k, v]) => [k, t[v]])
);

const SAVE_ACTIONS = ["Catch", "Block", "Parry", "Deflect", "Punch"];

function fmtTs(s) {
  if (s == null) return null;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
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
  // Per-event clips: indexed by timestamp_seconds → signed URL. Populated
  // from the source video_jobs.gemini_output for video-tagged matches.
  const [clipsByTs, setClipsByTs] = useState({});
  const [videoSourceUrl, setVideoSourceUrl] = useState(null);

  useEffect(() => {
    if (!user || !id) return;
    let mounted = true;
    (async () => {
      const { data: matchData, error: matchErr } = await fetchMatchById(supabase, id);
      if (!mounted) return;
      if (matchErr || !matchData) {
        setError(matchErr?.message || "Match not found");
        setLoading(false);
        return;
      }
      setMatch(matchData);

      const { goalsConceded: gc, goalsScored: gs, shotEvents: se, keeper: k } =
        await fetchMatchDetailBundle(supabase, id, matchData.keeper_id);
      if (!mounted) return;
      setGoalsConceded(gc);
      setGoalsScored(gs);
      setSaves(se);
      setKeeper(k);
      setLoading(false);

      // Load clips for video-tagged matches. The published match doesn't
      // carry clip references on shot_events / goals_conceded — those live
      // on the originating video_jobs.gemini_output. We look up the source
      // job by published_match_id, collect every clip_storage_path across
      // goals/saves/distribution, sign them in one batch, and index by
      // timestamp_seconds so each event card can pull its own clip.
      if (matchData.logged_via === "video") {
        const { data: jobs } = await supabase
          .from("video_jobs")
          .select("storage_path, gemini_output")
          .eq("published_match_id", id)
          .limit(1);
        const job = jobs?.[0];
        if (job && mounted) {
          const parsed = job.gemini_output || {};
          const allEvents = [
            ...(parsed.parsed?.goals || []),
            ...(parsed.saves?.parsed?.saves || []),
            ...(parsed.distribution?.parsed?.distribution || []),
          ];
          const paths = allEvents
            .map(e => e.clip_storage_path)
            .filter(Boolean);
          let urlByPath = {};
          if (paths.length) {
            const { data: signedList } = await supabase.storage
              .from("match-videos")
              .createSignedUrls(paths, 60 * 60 * 24);
            if (Array.isArray(signedList)) {
              signedList.forEach(s => {
                if (s?.path && s?.signedUrl) urlByPath[s.path] = s.signedUrl;
              });
            }
          }
          const byTs = {};
          allEvents.forEach(e => {
            if (e.timestamp_seconds == null) return;
            const url = e.clip_storage_path ? urlByPath[e.clip_storage_path] : null;
            if (!url) return;
            byTs[Math.round(e.timestamp_seconds)] = url;
          });
          if (mounted) setClipsByTs(byTs);

          // Source fallback for any event without a pre-cut clip.
          if (job.storage_path) {
            const { data: srcSigned } = await supabase.storage
              .from("match-videos")
              .createSignedUrl(job.storage_path, 60 * 60 * 24);
            if (mounted && srcSigned?.signedUrl) setVideoSourceUrl(srcSigned.signedUrl);
          }
        }
      }
    })();
    return () => { mounted = false; };
  }, [user, id, supabase]);

  // — LIVE STATS — Compute everything from the raw event tables. The stale
  // matches.{shots_faced, saves, save_percentage} columns are ignored on
  // display: they're written at publish-time and never updated when shot
  // events are edited, so they drift away from the source rows and the
  // three tiles stop reconciling (24 / 22 / 75% was the symptom).
  //
  // shot_events stores save attempts only (one row per shot the keeper
  // engaged with); goals_conceded stores the goals. To count "shots
  // faced" we union both. Save % uses the football-standard "on target"
  // denominator so the math is honest (off-target rockets that flew
  // wide aren't credited as saves).
  const onTargetSaveCount = useMemo(
    () => saves.filter(s => s.on_target === "yes" && SAVE_ACTIONS.includes(s.gk_action)).length,
    [saves]
  );
  const offTargetCount = useMemo(() => saves.filter(s => s.on_target === "no").length, [saves]);
  const goalsAgainstCount = useMemo(() => goalsConceded.length, [goalsConceded]);
  const shotsFaced = useMemo(() => saves.length + goalsAgainstCount, [saves, goalsAgainstCount]);
  const shotsOnTarget = useMemo(
    () => (saves.length - offTargetCount) + goalsAgainstCount,
    [saves, offTargetCount, goalsAgainstCount]
  );
  const savePct = shotsOnTarget > 0 ? onTargetSaveCount / shotsOnTarget : null;

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

  const clipForTs = (ts) => {
    if (ts == null) return null;
    return clipsByTs[Math.round(ts)] || null;
  };

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

          {/* Top stats strip — all live from raw events; no stale matches.* columns */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginTop: 24, paddingTop: 20, borderTop: `1px solid ${t.border}` }}>
            <Stat
              label="Shots faced"
              value={shotsFaced}
              sub={`${shotsOnTarget} on target · ${shotsFaced - shotsOnTarget} off`}
            />
            <Stat
              label="On target"
              value={shotsOnTarget}
              sub={`${shotsOnTarget - goalsAgainstCount} saved · ${goalsAgainstCount} goals`}
            />
            <Stat
              label="Saves"
              value={onTargetSaveCount}
              sub="On-target shots stopped"
            />
            <Stat
              label="Save %"
              value={savePct != null ? `${(savePct * 100).toFixed(0)}%` : "—"}
              sub="Saves / shots on target"
            />
            <Stat label="Clean sheet" value={goalsAgainstCount === 0 ? "✓" : "—"} />
          </div>
        </div>

        {/* GOALS SCORED */}
        {goalsScored.length > 0 && (
          <Section title={`Goals scored (${goalsScored.length})`}>
            {goalsScored.map(g => (
              <EventCard
                key={g.id}
                time={g.timestamp_seconds}
                accent={t.green}
                clipUrl={clipForTs(g.timestamp_seconds)}
                sourceUrl={videoSourceUrl}
              >
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
              <EventCard
                key={g.id}
                time={g.timestamp_seconds}
                accent={t.red}
                clipUrl={clipForTs(g.timestamp_seconds)}
                sourceUrl={videoSourceUrl}
              >
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
                  <EventCard
                    key={s.id}
                    time={s.timestamp_seconds}
                    accent={actionColor}
                    compact
                    clipUrl={clipForTs(s.timestamp_seconds)}
                    sourceUrl={videoSourceUrl}
                  >
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

function Stat({ label, value, sub }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: t.dim, letterSpacing: 0.4, marginBottom: 4, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: t.bright }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: t.dim, marginTop: 2, lineHeight: 1.3 }}>{sub}</div>}
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

function EventCard({ time, accent, children, compact, clipUrl, sourceUrl }) {
  const [showClip, setShowClip] = useState(false);
  const hasClip = Boolean(clipUrl) || (sourceUrl && time != null);
  return (
    <div style={{ background: t.card, border: `1px solid ${t.border}`, borderLeft: `3px solid ${accent || t.border}`, borderRadius: 10, padding: compact ? 12 : 14, marginBottom: compact ? 0 : 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: t.dim, letterSpacing: 0.4, fontWeight: 600 }}>{fmtTs(time) || "—"}</div>
        {hasClip && (
          <button
            type="button"
            onClick={() => setShowClip(s => !s)}
            style={{
              padding: "3px 9px", fontSize: 11, fontWeight: 600,
              background: showClip ? t.accent + "22" : "transparent",
              color: showClip ? t.accent : t.dim,
              border: `1px solid ${showClip ? t.accent + "55" : t.border}`,
              borderRadius: 5, cursor: "pointer", fontFamily: FONT,
            }}
          >
            {showClip ? "▾ Hide clip" : "▶ Play clip"}
          </button>
        )}
      </div>
      {children}
      {showClip && hasClip && (
        <div style={{ marginTop: 10 }}>
          <VideoClip
            clipUrl={clipUrl}
            sourceUrl={sourceUrl}
            timestampSeconds={time}
            theme={t}
          />
        </div>
      )}
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
