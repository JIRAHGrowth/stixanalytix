"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
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

// Must stay in lockstep with lib/constants.js GK_ACTION_TO_COL — every action
// that counts toward `matches.saves` in the publish route must count here too.
// Missing "Smother", "Starfish", "K-Barrier" caused matches/[id] page to
// under-report save count vs the matches row (2026-07-15 incident: Fusion 4
// saves in DB but page showed 3 because ts 6378 was a Smother).
const SAVE_ACTIONS = ["Catch", "Block", "Parry", "Deflect", "Punch", "Smother", "Starfish", "K-Barrier"];

function fmtTs(s) {
  if (s == null) return null;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

export default function MatchDetailPage() {
  const { user, supabase, loading: authLoading } = useAuth();
  const { id } = useParams();
  // ?keeper=<uuid> — the dashboard passes the active keeper (Amalie vs
  // GK2 Unknown, for two-keeper matches) so this page shows only that
  // keeper's events. Absent → default to the match's primary keeper.
  // Per-event keeper_id is set at publish time via
  // attributeEventToKeeper(match, event.timestamp_seconds), so filtering
  // by keeper_id gives us H1-only or H2-only cleanly.
  const searchParams = useSearchParams();
  const queryKeeperId = searchParams?.get("keeper") || null;
  const [match, setMatch] = useState(null);
  const [goalsConceded, setGoalsConceded] = useState([]);
  const [goalsScored, setGoalsScored] = useState([]);
  const [saves, setSaves] = useState([]);
  const [dists, setDists] = useState([]);
  const [crosses, setCrosses] = useState([]);
  const [sweeps, setSweeps] = useState([]);
  const [oneVones, setOneVones] = useState([]);
  const [keeper, setKeeper] = useState(null);
  const [secondaryKeeper, setSecondaryKeeper] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Per-event clips: indexed by DB event id → signed URL. Populated from
  // clip_storage_path on each event row (written by publish route +
  // backfill_clips_from_events). Previously read from
  // video_jobs.gemini_output and keyed by rounded timestamp — that broke
  // (a) coach-added events (never in gemini_output), (b) coach-edited
  // timestamps (rounded-second collisions returned wrong clips), and
  // (c) crosses/sweeper/1v1 (never indexed at all). Keyed by event.id
  // makes lookups exact and independent of ordering.
  const [clipsByEventId, setClipsByEventId] = useState({});
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

      const bundle = await fetchMatchDetailBundle(
        supabase, id, matchData.keeper_id, matchData.secondary_keeper_id
      );
      if (!mounted) return;
      setGoalsConceded(bundle.goalsConceded);
      setGoalsScored(bundle.goalsScored);
      setSaves(bundle.shotEvents);
      setDists(bundle.distEvents);
      setCrosses(bundle.crossEvents);
      setSweeps(bundle.sweeperEvents);
      setOneVones(bundle.oneVOneEvents);
      setKeeper(bundle.keeper);
      setSecondaryKeeper(bundle.secondaryKeeper);
      setLoading(false);

      // Batch-sign every event row's clip_storage_path across all 6 tables,
      // then index by event.id so each card can pull its clip by row id.
      // clip_storage_path is written at publish time and refreshed by the
      // post-publish backfill_clips_from_events Modal function — the value
      // on the row IS the truth. No more gemini_output round-tripping.
      const allEventRows = [
        ...bundle.goalsConceded, ...bundle.goalsScored, ...bundle.shotEvents,
        ...bundle.distEvents, ...bundle.crossEvents, ...bundle.sweeperEvents,
        ...bundle.oneVOneEvents,
      ];
      const paths = [...new Set(allEventRows.map(r => r.clip_storage_path).filter(Boolean))];
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
      const byId = {};
      for (const r of allEventRows) {
        if (r.clip_storage_path && urlByPath[r.clip_storage_path]) {
          byId[r.id] = urlByPath[r.clip_storage_path];
        }
      }
      if (mounted) setClipsByEventId(byId);

      // Source-video fallback: for the small number of events without a
      // pre-cut clip (mostly coach-added events on pitchside matches, or
      // events where the ffmpeg slice failed) we can still seek the source
      // video to the event timestamp — provided the source is still in
      // Supabase Storage (video-uploaded jobs) OR reachable via video_url
      // (VEO / direct URLs). Look up the video_job either way.
      if (matchData.logged_via === "video") {
        const { data: jobs } = await supabase
          .from("video_jobs")
          .select("storage_path, video_url")
          .eq("published_match_id", id)
          .limit(1);
        const job = jobs?.[0];
        if (job && mounted) {
          if (job.storage_path) {
            const { data: srcSigned } = await supabase.storage
              .from("match-videos")
              .createSignedUrl(job.storage_path, 60 * 60 * 24);
            if (mounted && srcSigned?.signedUrl) setVideoSourceUrl(srcSigned.signedUrl);
          } else if (job.video_url) {
            if (mounted) setVideoSourceUrl(job.video_url);
          }
        }
      }
    })();
    return () => { mounted = false; };
  }, [user, id, supabase]);

  // Per-keeper view. Which keeper are we showing events for?
  //   1. ?keeper=<uuid> if the URL carries one (dashboard passes activeKeeperId)
  //   2. else match.keeper_id (the primary — Amalie for BC Soccer matches)
  // If the URL asks for a keeper that's neither primary nor secondary,
  // fall back to the primary (defensive — nothing legitimate should send
  // a stranger's keeper_id here).
  const activeKeeperId = useMemo(() => {
    if (!match) return null;
    if (queryKeeperId && (
      queryKeeperId === match.keeper_id
      || queryKeeperId === match.secondary_keeper_id
    )) return queryKeeperId;
    return match.keeper_id;
  }, [match, queryKeeperId]);

  const activeKeeper = useMemo(() => {
    if (!activeKeeperId) return null;
    if (activeKeeperId === match?.keeper_id) return keeper;
    if (activeKeeperId === match?.secondary_keeper_id) return secondaryKeeper;
    return keeper;
  }, [activeKeeperId, match, keeper, secondaryKeeper]);

  // Half-of-match label for the active keeper on subbed matches.
  // Primary keeper played H1 (up to sub_minute); secondary played H2.
  const activeHalfLabel = useMemo(() => {
    if (!match?.was_subbed) return null;
    if (activeKeeperId === match.keeper_id) return `H1 · until ${match.sub_minute}′`;
    if (activeKeeperId === match.secondary_keeper_id) return `H2 · from ${match.sub_minute}′`;
    return null;
  }, [match, activeKeeperId]);

  // Filter every event array to just the active keeper's events. Per-event
  // keeper_id was written at publish time by attributeEventToKeeper() based
  // on the event timestamp vs sub_minute, so this is exact — no rounding
  // or window logic here.
  const filterK = (rows) => rows.filter(r => r.keeper_id === activeKeeperId);
  const goalsConcededView = useMemo(() => filterK(goalsConceded), [goalsConceded, activeKeeperId]);
  const goalsScoredView   = useMemo(() => filterK(goalsScored),   [goalsScored,   activeKeeperId]);
  const savesView         = useMemo(() => filterK(saves),         [saves,         activeKeeperId]);
  const distsView         = useMemo(() => filterK(dists),         [dists,         activeKeeperId]);
  const crossesView       = useMemo(() => filterK(crosses),       [crosses,       activeKeeperId]);
  const sweepsView        = useMemo(() => filterK(sweeps),        [sweeps,        activeKeeperId]);
  const oneVonesView      = useMemo(() => filterK(oneVones),      [oneVones,      activeKeeperId]);

  // — LIVE STATS — Compute everything from the raw event tables scoped to
  // the ACTIVE KEEPER. The stale matches.{shots_faced, saves, save_
  // percentage} columns are ignored on display: they're written at
  // publish-time for the whole match and never updated for per-keeper
  // views, so they'd overstate a keeper who only played one half.
  //
  // shot_events stores save attempts only (one row per shot the keeper
  // engaged with); goals_conceded stores the goals. To count "shots
  // faced" we union both. Save % uses the football-standard "on target"
  // denominator so the math is honest.
  const onTargetSaveCount = useMemo(
    () => savesView.filter(s => s.on_target === "yes" && SAVE_ACTIONS.includes(s.gk_action)).length,
    [savesView]
  );
  const offTargetCount = useMemo(() => savesView.filter(s => s.on_target === "no").length, [savesView]);
  const goalsAgainstCount = useMemo(() => goalsConcededView.length, [goalsConcededView]);
  const shotsFaced = useMemo(() => savesView.length + goalsAgainstCount, [savesView, goalsAgainstCount]);
  const shotsOnTarget = useMemo(
    () => (savesView.length - offTargetCount) + goalsAgainstCount,
    [savesView, offTargetCount, goalsAgainstCount]
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

  const clipForEvent = (row) => clipsByEventId[row?.id] || null;

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
                {activeKeeper?.name || keeper?.name || "Keeper"} {match.opponent ? `vs ${match.opponent}` : ""}
              </h1>
              <div style={{ fontSize: 13, color: t.dim, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                {match.venue && <span style={{ textTransform: "capitalize" }}>{match.venue}</span>}
                {match.logged_via === "video" && <span style={{ padding: "2px 8px", borderRadius: 4, background: t.accent + "22", color: t.accent, fontSize: 11, fontWeight: 600 }}>📹 Video-tagged</span>}
                {activeHalfLabel && (
                  <span style={{ padding: "2px 8px", borderRadius: 4, background: t.accent + "22", color: t.accent, fontSize: 11, fontWeight: 700 }}>
                    {activeHalfLabel}
                  </span>
                )}
                {match.was_subbed && match.secondary_keeper_id && secondaryKeeper && (
                  <Link
                    href={`/matches/${match.id}?keeper=${
                      activeKeeperId === match.keeper_id ? match.secondary_keeper_id : match.keeper_id
                    }`}
                    style={{ padding: "2px 8px", borderRadius: 4, border: `1px solid ${t.border}`, color: t.dim, fontSize: 11, fontWeight: 600, textDecoration: "none" }}
                  >
                    ↔ switch to {activeKeeperId === match.keeper_id ? (secondaryKeeper.name || "GK2") : (keeper?.name || "GK1")}
                  </Link>
                )}
                {match.source_url && <a href={match.source_url} target="_blank" rel="noreferrer" style={{ color: t.dim, textDecoration: "underline" }}>source ↗</a>}
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
        {goalsScoredView.length > 0 && (
          <Section title={`Goals scored (${goalsScoredView.length})`}>
            {goalsScoredView.map(g => (
              <EventCard
                key={g.id}
                time={g.timestamp_seconds}
                accent={t.green}
                clipUrl={clipForEvent(g)}
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
        {goalsConcededView.length > 0 && (
          <Section title={`Goals conceded (${goalsConcededView.length})`} accent={t.red}>
            {goalsConcededView.map(g => (
              <EventCard
                key={g.id}
                time={g.timestamp_seconds}
                accent={t.red}
                clipUrl={clipForEvent(g)}
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
        {savesView.length > 0 && (
          <Section title={`Saves (${savesView.length})`}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
              {savesView.map(s => {
                const actionColor = ACTION_COLORS[s.gk_action] || t.dim;
                return (
                  <EventCard
                    key={s.id}
                    time={s.timestamp_seconds}
                    accent={actionColor}
                    compact
                    clipUrl={clipForEvent(s)}
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

        {/* DISTRIBUTION */}
        {distsView.length > 0 && (
          <Section title={`Distribution (${distsView.length})`}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
              {distsView.map(d => (
                <EventCard
                  key={d.id}
                  time={d.timestamp_seconds}
                  accent={d.successful === true ? t.green : d.successful === false ? t.red : t.dim}
                  compact
                  clipUrl={clipForEvent(d)}
                  sourceUrl={videoSourceUrl}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {d.type && <Pill>{labelize(d.type)}</Pill>}
                    {d.trigger && <Pill>{labelize(d.trigger)}</Pill>}
                    {d.successful === true && <Pill color={t.green}>successful</Pill>}
                    {d.successful === false && <Pill color={t.red}>unsuccessful</Pill>}
                    {d.under_pressure === true && <Pill color={t.yellow}>pressed</Pill>}
                    {d.pass_selection && <Pill>{labelize(d.pass_selection)}</Pill>}
                    {d.direction && <Pill>{labelize(d.direction)}</Pill>}
                    {d.target_zone && <Pill>{d.target_zone}</Pill>}
                    {d.coach_added && <Pill color={t.accent}>coach added</Pill>}
                  </div>
                  {d.receiver && <Para label="Receiver">{d.receiver}</Para>}
                  {d.first_touch && <Para label="1st touch">{d.first_touch}</Para>}
                  {d.notes && <Para label="Notes">{d.notes}</Para>}
                </EventCard>
              ))}
            </div>
          </Section>
        )}

        {/* CROSSES */}
        {crossesView.length > 0 && (
          <Section title={`Crosses (${crossesView.length})`}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
              {crossesView.map(c => (
                <EventCard
                  key={c.id}
                  time={c.timestamp_seconds}
                  accent={c.outcome === "claimed" ? t.green : c.outcome === "conceded" ? t.red : t.dim}
                  compact
                  clipUrl={clipForEvent(c)}
                  sourceUrl={videoSourceUrl}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {c.side && <Pill>{labelize(c.side)}</Pill>}
                    {c.cross_type && <Pill>{labelize(c.cross_type)}</Pill>}
                    {c.destination && <Pill>{labelize(c.destination)}</Pill>}
                    {c.gk_action && <Pill>{labelize(c.gk_action)}</Pill>}
                    {c.outcome && <Pill color={c.outcome === "claimed" ? t.green : t.dim}>{labelize(c.outcome)}</Pill>}
                    {c.coach_added && <Pill color={t.accent}>coach added</Pill>}
                  </div>
                  {c.gk_starting_pos && <Para label="GK start">{labelize(c.gk_starting_pos)}</Para>}
                  {c.gk_observations && <Para label="GK">{c.gk_observations}</Para>}
                  {c.notes && <Para label="Notes">{c.notes}</Para>}
                </EventCard>
              ))}
            </div>
          </Section>
        )}

        {/* SWEEPER */}
        {sweepsView.length > 0 && (
          <Section title={`Sweeper (${sweepsView.length})`}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
              {sweepsView.map(s => (
                <EventCard
                  key={s.id}
                  time={s.timestamp_seconds}
                  accent={s.result === "success" ? t.green : s.result === "conceded_chance" || s.result === "goal" ? t.red : t.dim}
                  compact
                  clipUrl={clipForEvent(s)}
                  sourceUrl={videoSourceUrl}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {s.trigger && <Pill>{labelize(s.trigger)}</Pill>}
                    {s.action && <Pill>{labelize(s.action)}</Pill>}
                    {s.timing && <Pill>{labelize(s.timing)}</Pill>}
                    {s.sweep_zone && <Pill>{labelize(s.sweep_zone)}</Pill>}
                    {s.pressure && <Pill>{labelize(s.pressure)}</Pill>}
                    {s.risk_grade && <Pill color={s.risk_grade === "high" ? t.red : s.risk_grade === "medium" ? t.yellow : t.green}>{labelize(s.risk_grade)}</Pill>}
                    {s.result && <Pill color={s.result === "success" ? t.green : t.red}>{labelize(s.result)}</Pill>}
                    {s.coach_added && <Pill color={t.accent}>coach added</Pill>}
                  </div>
                  {s.gk_starting_depth && <Para label="Start depth">{labelize(s.gk_starting_depth)}</Para>}
                  {s.action_description && <Para label="Action">{s.action_description}</Para>}
                  {s.gk_observations && <Para label="GK">{s.gk_observations}</Para>}
                  {s.notes && <Para label="Notes">{s.notes}</Para>}
                </EventCard>
              ))}
            </div>
          </Section>
        )}

        {/* 1v1 */}
        {oneVonesView.length > 0 && (
          <Section title={`1v1 (${oneVonesView.length})`}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
              {oneVonesView.map(o => (
                <EventCard
                  key={o.id}
                  time={o.timestamp_seconds}
                  accent={o.result === "saved" || o.result === "won" ? t.green : o.result === "goal" ? t.red : t.dim}
                  compact
                  clipUrl={clipForEvent(o)}
                  sourceUrl={videoSourceUrl}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {o.situation_type && <Pill>{labelize(o.situation_type)}</Pill>}
                    {o.approach_corridor && <Pill>{labelize(o.approach_corridor)}</Pill>}
                    {o.set_position && <Pill>{labelize(o.set_position)}</Pill>}
                    {o.body_shape && <Pill>{labelize(o.body_shape)}</Pill>}
                    {o.engagement_depth && <Pill>{labelize(o.engagement_depth)}</Pill>}
                    {o.decision && <Pill>{labelize(o.decision)}</Pill>}
                    {o.timing && <Pill>{labelize(o.timing)}</Pill>}
                    {o.result && <Pill color={o.result === "saved" || o.result === "won" ? t.green : o.result === "goal" ? t.red : t.dim}>{labelize(o.result)}</Pill>}
                    {o.coach_added && <Pill color={t.accent}>coach added</Pill>}
                  </div>
                  {o.shot_description && <Para label="Shot">{o.shot_description}</Para>}
                  {o.gk_observations && <Para label="GK">{o.gk_observations}</Para>}
                  {o.notes && <Para label="Notes">{o.notes}</Para>}
                </EventCard>
              ))}
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

        {!goalsScoredView.length && !goalsConcededView.length && !savesView.length
          && !distsView.length && !crossesView.length && !sweepsView.length && !oneVonesView.length && (
          <div style={{ background: t.card, border: `1px dashed ${t.border}`, borderRadius: 12, padding: 32, textAlign: "center", color: t.dim, fontSize: 13 }}>
            {match.was_subbed
              ? <>No events for {activeKeeper?.name || "this keeper"} in this match.{" "}
                  {match.secondary_keeper_id && (
                    <Link href={`/matches/${match.id}?keeper=${
                      activeKeeperId === match.keeper_id ? match.secondary_keeper_id : match.keeper_id
                    }`} style={{ color: t.accent }}>
                      View {activeKeeperId === match.keeper_id ? (secondaryKeeper?.name || "the other keeper") : (keeper?.name || "the primary keeper")}
                    </Link>
                  )}
                </>
              : <>No structured event detail captured for this match yet.
                  {match.logged_via === "pitchside" && " (Pitchside-logged matches use the legacy field-only schema; events will appear here for video-tagged matches.)"}
                </>
            }
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
