"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

const t = {
  bg: "#070b0e", card: "#0f1419", cardAlt: "#151c22", border: "#1e2a32",
  accent: "#10b981", accentDim: "#065f46", red: "#ef4444",
  green: "#22c55e", yellow: "#eab308", orange: "#f97316",
  text: "#d1d9e0", dim: "#5c6b77", bright: "#f0f4f7",
};
const font = "'DM Sans', -apple-system, sans-serif";

const GOAL_ZONES = ["High L","High C","High R","Mid L","Mid C","Mid R","Low L","Low C","Low R"];
const SHOT_ORIGINS = [
  { id: "6yard", label: "6-Yard Box" },
  { id: "boxL", label: "Left Channel" },
  { id: "boxC", label: "Central Box" },
  { id: "boxR", label: "Right Channel" },
  { id: "outL", label: "Wide Left" },
  { id: "outC", label: "Central Distance" },
  { id: "outR", label: "Wide Right" },
  { id: "cornerL", label: "Corner Left" },
  { id: "cornerR", label: "Corner Right" },
];
const SHOT_TYPES = ["Foot", "Header", "Deflection", "Own Goal"];
const GOAL_SOURCES = ["Open Play", "Corner", "Penalty"];
const POSITIONING = ["Set", "Moving"];
const RANKS = ["Saveable", "Difficult", "Unsaveable"];
const GK_ACTIONS = ["Catch", "Block", "Parry", "Deflect", "Punch", "Missed", "Goal", "unclear"];
const ON_TARGET_OPTIONS = ["yes", "no", "unclear"];
const GK_VISIBLE_OPTIONS = ["yes", "partial", "no"];
const OUTCOMES = ["held", "rebound_safe", "rebound_dangerous", "corner", "out_of_play", "goal"];
const BODY_ZONES = ["A", "B", "C", "unclear"];
const GMH_OPTIONS = ["top", "mid", "low", "unclear"];
const GMS_OPTIONS = ["left_third", "centre", "right_third", "unclear"];

const inputStyle = {
  width: "100%", padding: "8px 10px", fontSize: 12, borderRadius: 6,
  background: t.cardAlt, border: `1px solid ${t.border}`, color: t.bright,
  fontFamily: font,
};

function fmtTs(s) {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function tsStrToSeconds(str) {
  if (!str) return null;
  const m = /^(\d+):(\d{1,2})$/.exec(String(str).trim());
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

// Map Gemini's free-form fields onto the pitchside vocabulary as defaults.
function mapHeight(h) {
  const v = String(h || "").toLowerCase();
  if (v.startsWith("top")) return "High";
  if (v.startsWith("mid")) return "Mid";
  if (v.startsWith("low")) return "Low";
  return "";
}
function mapSide(s) {
  const v = String(s || "").toLowerCase();
  if (v === "centre" || v === "center") return "C";
  return "";
}
function defaultZone(g) {
  const h = mapHeight(g.goal_placement_height);
  const s = mapSide(g.goal_placement_side);
  if (!h || !s) return "";
  return `${h} ${s}`;
}
function defaultSource(g) {
  const v = String(g.attack_type || "").toLowerCase();
  if (v === "corner") return "Corner";
  if (v === "penalty") return "Penalty";
  if (v === "open_play" || v === "counter_attack") return "Open Play";
  return "";
}
function defaultShotType(g) {
  const v = String(g.shot_type || "").toLowerCase();
  if (v.includes("header")) return "Header";
  if (v.includes("deflection")) return "Deflection";
  return "Foot";
}

export default function ReviewPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { jobId } = useParams();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [publishing, setPublishing] = useState(false);

  // For each Gemini candidate: keep + scored_by_us toggle + editable fields if concession
  const [candidates, setCandidates] = useState([]);
  const [extraGoals, setExtraGoals] = useState([]); // goals Gemini missed (either team)
  const [scoreOverride, setScoreOverride] = useState(null); // {goals_for, goals_against} or null = derive

  // Phase 2.1 — saves review state
  const [saveRows, setSaveRows] = useState([]);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    (async () => {
      const res = await fetch(`/api/video-jobs/${jobId}`);
      const json = await res.json();
      if (!mounted) return;
      if (!res.ok) { setError(json.error || "Failed to load"); setLoading(false); return; }
      setJob(json.job);

      const out = json.job?.gemini_output?.parsed || { goals: [] };
      const meta = json.job?.match_metadata || {};
      const myColor = String(meta.my_team_color || "").toLowerCase();
      const oppColor = String(meta.opponent_color || "").toLowerCase();

      const cands = (out.goals || []).map((g, i) => {
        const scorer = String(g.scoring_team || "").toLowerCase();
        const scoredByUs = scorer && myColor && scorer.includes(myColor);
        const scoredByOpp = scorer && oppColor && scorer.includes(oppColor);
        return {
          _id: `g${i}`,
          keep: true,
          scored_by_us: scoredByUs ? true : scoredByOpp ? false : null,
          // Editable concession fields (only used if scored_by_us === false)
          goal_zone: defaultZone(g),
          shot_origin: "",
          goal_source: defaultSource(g),
          shot_type: defaultShotType(g),
          gk_positioning: "",
          goal_rank: "",
          half: null, // coach fills in
          notes: "",  // coach observations to attach to this goal
          // Read-only context from Gemini
          gemini: g,
        };
      });
      setCandidates(cands);

      // Phase 2.1 — load save events from gemini_output.saves.parsed.saves
      const savesParsed = json.job?.gemini_output?.saves?.parsed || null;
      const initialSaves = (savesParsed?.saves || []).map((s, i) => ({
        _id: `s${i}`,
        keep: true,
        timestamp_seconds: s.timestamp_seconds,
        match_clock: s.match_clock,
        shot_origin: s.shot_origin || "",
        shot_type: s.shot_type || "Foot",
        on_target: s.on_target || "unclear",
        gk_action: s.gk_action || "unclear",
        gk_visible: s.gk_visible || "yes",
        outcome: s.outcome || "",
        body_distance_zone: s.body_distance_zone || "",
        goal_placement_height: s.goal_placement_height || "",
        goal_placement_side: s.goal_placement_side || "",
        notes: "",
        // raw Gemini context preserved for review-diff and reference
        gemini: s,
      }));
      setSaveRows(initialSaves);

      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [user, jobId]);

  const counts = useMemo(() => {
    let kept = 0, gf = 0, ga = 0;
    candidates.forEach(c => {
      if (!c.keep) return;
      kept++;
      if (c.scored_by_us === true) gf++;
      else if (c.scored_by_us === false) ga++;
    });
    extraGoals.forEach(g => {
      if (g.scored_by_us === true) gf++;
      else if (g.scored_by_us === false) ga++;
    });
    return { kept, gf, ga };
  }, [candidates, extraGoals]);

  const finalScore = scoreOverride || { goals_for: counts.gf, goals_against: counts.ga };

  const updateCand = (id, patch) => setCandidates(cs => cs.map(c => c._id === id ? { ...c, ...patch } : c));

  const publish = async () => {
    setError("");

    // Concessions = opponent goals (kept candidates + extras flagged as opponent)
    const concessions = [
      ...candidates.filter(c => c.keep && c.scored_by_us === false).map(c => ({
        timestamp_seconds: c.gemini.timestamp_seconds,
        goal_zone: c.goal_zone || null,
        shot_origin: c.shot_origin || null,
        goal_source: c.goal_source || null,
        shot_type: c.shot_type || null,
        gk_positioning: c.gk_positioning || null,
        goal_rank: c.goal_rank || null,
        half: c.half || null,
        notes: c.notes || null,
      })),
      ...extraGoals.filter(g => g.scored_by_us === false).map(g => ({
        timestamp_seconds: tsStrToSeconds(g.timestamp_str),
        goal_zone: g.goal_zone || null,
        shot_origin: g.shot_origin || null,
        goal_source: g.goal_source || null,
        shot_type: g.shot_type || null,
        gk_positioning: g.gk_positioning || null,
        goal_rank: g.goal_rank || null,
        half: g.half || null,
        notes: g.notes || null,
      })),
    ];

    // Team-scored extras: count toward goals_for. We don't write per-goal rows
    // for our own goals (no goals_scored table — goals_for is just an int on
    // matches). But we keep the descriptions so they can land in match notes.
    const teamScored = [
      ...extraGoals.filter(g => g.scored_by_us === true).map(g => ({
        timestamp_seconds: tsStrToSeconds(g.timestamp_str),
        notes: g.notes || null,
      })),
    ];

    if (concessions.length !== finalScore.goals_against) {
      setError(`Concession rows (${concessions.length}) must equal goals_against (${finalScore.goals_against}). ` +
        `Add or remove opponent goals, or override the score.`);
      return;
    }

    // Review diff — feeds D11 (per-coach correction feedback loop).
    // The publish endpoint diffs this against Gemini's original output and
    // writes per-correction rows to coach_corrections.
    const reviewDiff = {
      candidates: candidates.map(c => ({
        gemini_index: parseInt(c._id.replace('g', ''), 10),
        keep: !!c.keep,
        scored_by_us: c.scored_by_us,
        edited_fields: c.scored_by_us === false ? {
          goal_zone: c.goal_zone || null,
          shot_origin: c.shot_origin || null,
          goal_source: c.goal_source || null,
          shot_type: c.shot_type || null,
          gk_positioning: c.gk_positioning || null,
          goal_rank: c.goal_rank || null,
        } : null,
        notes: c.notes || null,
      })),
      extras: extraGoals.map(g => ({
        scored_by_us: g.scored_by_us,
        timestamp_seconds: tsStrToSeconds(g.timestamp_str),
        timestamp_str: g.timestamp_str || null,
        notes: g.notes || null,
        fields: g.scored_by_us === false ? {
          goal_zone: g.goal_zone || null,
          shot_origin: g.shot_origin || null,
          goal_source: g.goal_source || null,
          shot_type: g.shot_type || null,
          gk_positioning: g.gk_positioning || null,
          goal_rank: g.goal_rank || null,
        } : null,
      })),
    };

    // Phase 2.1 — saves payload. Only kept rows go to shot_events.
    const savesPayload = saveRows.filter(r => r.keep).map(r => ({
      timestamp_seconds: r.timestamp_seconds,
      shot_origin: r.shot_origin || null,
      shot_type: r.shot_type || null,
      on_target: r.on_target || null,
      gk_action: r.gk_action || null,
      gk_visible: r.gk_visible || null,
      outcome: r.outcome || null,
      body_distance_zone: r.body_distance_zone || null,
      goal_placement_height: r.goal_placement_height || null,
      goal_placement_side: r.goal_placement_side || null,
    }));

    setPublishing(true);
    try {
      const res = await fetch(`/api/video-jobs/${jobId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goals_for: finalScore.goals_for,
          goals_against: finalScore.goals_against,
          concessions,
          team_scored: teamScored,
          saves: savesPayload,
          review_diff: reviewDiff,
          notes: notesFromGemini(job, candidates, extraGoals),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Publish failed");
      router.push("/dashboard");
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setPublishing(false);
    }
  };

  const addExtraGoal = (defaultTeam) => {
    setExtraGoals(arr => [...arr, {
      _id: `extra${arr.length}_${Date.now()}`,
      scored_by_us: defaultTeam,        // true = our team, false = opponent
      timestamp_str: "",                // MM:SS
      notes: "",
      goal_zone: "", shot_origin: "", goal_source: "Open Play",
      shot_type: "Foot", gk_positioning: "", goal_rank: "", half: null,
    }]);
  };
  const updateExtra = (id, patch) => setExtraGoals(arr => arr.map(c => c._id === id ? { ...c, ...patch } : c));
  const removeExtra = (id) => setExtraGoals(arr => arr.filter(c => c._id !== id));

  if (authLoading || loading) {
    return <div style={{ minHeight: "100vh", background: t.bg, color: t.dim, fontFamily: font, display: "grid", placeItems: "center" }}>Loading…</div>;
  }
  if (error && !job) {
    return <div style={{ minHeight: "100vh", background: t.bg, color: t.red, fontFamily: font, padding: 40, textAlign: "center" }}>{error}</div>;
  }

  const meta = job.match_metadata || {};
  return (
    <div style={{ minHeight: "100vh", background: t.bg, fontFamily: font, color: t.text }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", borderBottom: `1px solid ${t.border}`, maxWidth: 1100, margin: "0 auto" }}>
        <Link href="/upload" style={{ textDecoration: "none", color: t.bright, fontWeight: 700, fontSize: 16 }}>← Back to uploads</Link>
        <div style={{ fontSize: 12, color: t.dim }}>Review &amp; publish</div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px" }}>
        {/* MATCH SUMMARY */}
        <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13 }}>
            <div><span style={{ color: t.dim }}>Date:</span> <strong style={{ color: t.bright }}>{meta.match_date}</strong></div>
            <div><span style={{ color: t.dim }}>Type:</span> <strong style={{ color: t.bright }}>{meta.session_type}</strong></div>
            {meta.opponent && <div><span style={{ color: t.dim }}>Opponent:</span> <strong style={{ color: t.bright }}>{meta.opponent}</strong></div>}
            {meta.venue && <div><span style={{ color: t.dim }}>Venue:</span> <strong style={{ color: t.bright }}>{meta.venue}</strong></div>}
            <div><span style={{ color: t.dim }}>Kits:</span> <strong style={{ color: t.bright }}>{meta.my_team_color}</strong> vs <strong style={{ color: t.bright }}>{meta.opponent_color}</strong> · GK <strong style={{ color: t.bright }}>{meta.my_keeper_color}</strong></div>
          </div>
        </div>

        {/* SCORE */}
        <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: t.dim, letterSpacing: 0.4, marginBottom: 4 }}>FINAL SCORE</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <ScoreInput label="Us" value={finalScore.goals_for} onChange={v => setScoreOverride({ ...finalScore, goals_for: v })} />
                <span style={{ fontSize: 22, color: t.dim }}>–</span>
                <ScoreInput label="Them" value={finalScore.goals_against} onChange={v => setScoreOverride({ ...finalScore, goals_against: v })} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: t.dim, lineHeight: 1.5 }}>
              Gemini detected {candidates.length} candidate{candidates.length === 1 ? "" : "s"} ({counts.gf} ours, {counts.ga} concession{counts.ga === 1 ? "" : "s"})<br/>
              Toggle each candidate below as real / not real / wrong team.
              {scoreOverride && <button onClick={() => setScoreOverride(null)} style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 4, fontSize: 10, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, cursor: "pointer", fontFamily: font }}>reset to derived</button>}
            </div>
          </div>
        </div>

        {/* CANDIDATES */}
        <h3 style={{ fontSize: 13, fontWeight: 700, color: t.bright, letterSpacing: 0.4, margin: "16px 0 10px" }}>CANDIDATE GOALS</h3>
        {candidates.length === 0 && (
          <div style={{ background: t.card, border: `1px dashed ${t.border}`, borderRadius: 12, padding: 24, textAlign: "center", color: t.dim, fontSize: 13 }}>
            Gemini found no goal candidates. Use "+ Add a missed concession" below for any goals it should have caught.
          </div>
        )}
        {candidates.map((c) => (
          <div key={c._id} style={{ background: t.card, border: `1px solid ${c.keep ? t.border : t.border + "44"}`, opacity: c.keep ? 1 : 0.55, borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: t.bright, fontWeight: 600 }}>
                  Video {fmtTs(c.gemini.timestamp_seconds)} · clock {c.gemini.match_clock} · confidence {c.gemini.confidence}
                </div>
                <div style={{ fontSize: 12, color: t.text, marginTop: 4 }}>
                  <strong>{c.gemini.scoring_team}</strong> scored. {c.gemini.attack_type} · {c.gemini.shot_type} from {c.gemini.shot_location} · {c.gemini.goal_placement_height} / {c.gemini.goal_placement_side}
                </div>
                <div style={{ fontSize: 11, color: t.dim, marginTop: 4, fontStyle: "italic" }}>{c.gemini.buildup}</div>
                <div style={{ fontSize: 11, color: t.dim, marginTop: 4 }}>GK: {c.gemini.gk_observations}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 140 }}>
                <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" checked={c.keep} onChange={e => updateCand(c._id, { keep: e.target.checked })} />
                  Real goal
                </label>
                <select disabled={!c.keep} value={c.scored_by_us == null ? "" : c.scored_by_us ? "us" : "them"} onChange={e => updateCand(c._id, { scored_by_us: e.target.value === "us" ? true : e.target.value === "them" ? false : null })} style={{ ...inputStyle, padding: "6px 8px" }}>
                  <option value="">— who scored?</option>
                  <option value="us">Our team ({meta.my_team_color})</option>
                  <option value="them">Opponent ({meta.opponent_color})</option>
                </select>
              </div>
            </div>

            {c.keep && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${t.border}` }}>
                <textarea
                  value={c.notes || ""}
                  onChange={e => updateCand(c._id, { notes: e.target.value })}
                  placeholder={c.scored_by_us === false ? "Your notes for this concession (optional)" : "Your notes for this goal (optional)"}
                  rows={2}
                  style={{ ...inputStyle, resize: "vertical", marginBottom: c.scored_by_us === false ? 10 : 0 }}
                />
                {c.scored_by_us === false && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                    <ConcessionField label="Zone" value={c.goal_zone} options={GOAL_ZONES} onChange={v => updateCand(c._id, { goal_zone: v })} />
                    <ConcessionField label="Origin" value={c.shot_origin} options={SHOT_ORIGINS.map(o => o.id)} optionLabels={SHOT_ORIGINS.reduce((m, o) => ({ ...m, [o.id]: o.label }), {})} onChange={v => updateCand(c._id, { shot_origin: v })} />
                    <ConcessionField label="Source" value={c.goal_source} options={GOAL_SOURCES} onChange={v => updateCand(c._id, { goal_source: v })} />
                    <ConcessionField label="Shot type" value={c.shot_type} options={SHOT_TYPES} onChange={v => updateCand(c._id, { shot_type: v })} />
                    <ConcessionField label="Positioning" value={c.gk_positioning} options={POSITIONING} onChange={v => updateCand(c._id, { gk_positioning: v })} />
                    <ConcessionField label="Rank" value={c.goal_rank} options={RANKS} onChange={v => updateCand(c._id, { goal_rank: v })} />
                    <ConcessionField label="Half" value={c.half ? String(c.half) : ""} options={["1", "2"]} onChange={v => updateCand(c._id, { half: v ? parseInt(v, 10) : null })} />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* EXTRA GOALS — coach-added, either team */}
        {extraGoals.length > 0 && (
          <>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: t.bright, letterSpacing: 0.4, margin: "20px 0 10px" }}>MISSED GOALS (added by you)</h3>
            {extraGoals.map((c) => (
              <div key={c._id} style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, alignItems: "end", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, color: t.dim, marginBottom: 4 }}>Scoring team</div>
                    <select value={c.scored_by_us == null ? "" : c.scored_by_us ? "us" : "them"} onChange={e => updateExtra(c._id, { scored_by_us: e.target.value === "us" ? true : e.target.value === "them" ? false : null })} style={inputStyle}>
                      <option value="">— who scored?</option>
                      <option value="us">Our team ({meta.my_team_color})</option>
                      <option value="them">Opponent ({meta.opponent_color})</option>
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: t.dim, marginBottom: 4 }}>Timestamp (MM:SS)</div>
                    <input type="text" value={c.timestamp_str} onChange={e => updateExtra(c._id, { timestamp_str: e.target.value })} placeholder="e.g. 12:24" style={inputStyle} />
                  </div>
                  <button onClick={() => removeExtra(c._id)} style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 11, fontFamily: font, cursor: "pointer", height: 34 }}>Remove</button>
                </div>
                <textarea
                  value={c.notes || ""}
                  onChange={e => updateExtra(c._id, { notes: e.target.value })}
                  placeholder="Describe the goal — buildup, shot, GK action. Your words become part of the match notes."
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical", marginBottom: c.scored_by_us === false ? 10 : 0 }}
                />
                {c.scored_by_us === false && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                    <ConcessionField label="Zone" value={c.goal_zone} options={GOAL_ZONES} onChange={v => updateExtra(c._id, { goal_zone: v })} />
                    <ConcessionField label="Origin" value={c.shot_origin} options={SHOT_ORIGINS.map(o => o.id)} optionLabels={SHOT_ORIGINS.reduce((m, o) => ({ ...m, [o.id]: o.label }), {})} onChange={v => updateExtra(c._id, { shot_origin: v })} />
                    <ConcessionField label="Source" value={c.goal_source} options={GOAL_SOURCES} onChange={v => updateExtra(c._id, { goal_source: v })} />
                    <ConcessionField label="Shot type" value={c.shot_type} options={SHOT_TYPES} onChange={v => updateExtra(c._id, { shot_type: v })} />
                    <ConcessionField label="Positioning" value={c.gk_positioning} options={POSITIONING} onChange={v => updateExtra(c._id, { gk_positioning: v })} />
                    <ConcessionField label="Rank" value={c.goal_rank} options={RANKS} onChange={v => updateExtra(c._id, { goal_rank: v })} />
                    <ConcessionField label="Half" value={c.half ? String(c.half) : ""} options={["1", "2"]} onChange={v => updateExtra(c._id, { half: v ? parseInt(v, 10) : null })} />
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          <button onClick={() => addExtraGoal(true)} style={{ padding: "8px 14px", borderRadius: 8, border: `1px dashed ${t.accent}66`, background: "transparent", color: t.accent, fontSize: 12, fontFamily: font, cursor: "pointer" }}>+ Add a goal we scored</button>
          <button onClick={() => addExtraGoal(false)} style={{ padding: "8px 14px", borderRadius: 8, border: `1px dashed ${t.red}66`, background: "transparent", color: t.red, fontSize: 12, fontFamily: font, cursor: "pointer" }}>+ Add a goal opponent scored</button>
        </div>

        {/* SAVES TABLE — Phase 2.1 */}
        <SavesTable rows={saveRows} onChange={setSaveRows} t={t} font={font} />

        {/* PUBLISH */}
        {error && <div style={{ color: t.red, fontSize: 12, marginBottom: 12 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", padding: "16px 0", borderTop: `1px solid ${t.border}` }}>
          <Link href="/upload" style={{ padding: "10px 18px", borderRadius: 8, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontFamily: font, textDecoration: "none", fontSize: 13 }}>Back without saving</Link>
          <button onClick={publish} disabled={publishing} style={{ padding: "10px 22px", borderRadius: 8, background: t.accent, color: "#fff", border: "none", fontWeight: 700, fontSize: 13, fontFamily: font, cursor: publishing ? "default" : "pointer", opacity: publishing ? 0.6 : 1 }}>
            {publishing ? "Publishing…" : `Save & Publish (${finalScore.goals_for}–${finalScore.goals_against})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScoreInput({ label, value, onChange }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 10, color: t.dim, marginBottom: 2 }}>{label}</div>
      <input type="number" min={0} max={50} value={value} onChange={e => onChange(parseInt(e.target.value || 0, 10))}
        style={{ width: 60, padding: "8px 10px", fontSize: 22, fontWeight: 700, textAlign: "center", borderRadius: 8, background: t.cardAlt, border: `1px solid ${t.border}`, color: t.bright, fontFamily: font }} />
    </div>
  );
}

function ConcessionField({ label, value, options, optionLabels, onChange }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: t.dim, marginBottom: 4 }}>{label}</div>
      <select value={value || ""} onChange={e => onChange(e.target.value)} style={inputStyle}>
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{optionLabels?.[o] || o}</option>)}
      </select>
    </div>
  );
}

function SavesTable({ rows, onChange, t, font }) {
  if (!rows || rows.length === 0) {
    return (
      <>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: t.bright, letterSpacing: 0.4, margin: "20px 0 10px" }}>SAVES</h3>
        <div style={{ background: t.card, border: `1px dashed ${t.border}`, borderRadius: 12, padding: 24, textAlign: "center", color: t.dim, fontSize: 13, marginBottom: 24 }}>
          Gemini didn't tag any save events for this match. (This is normal if the analysis only ran the goals prompt — the saves prompt was added in Phase 2.1 and only runs on jobs uploaded after the worker redeploy.)
        </div>
      </>
    );
  }

  const update = (id, patch) => onChange(rows.map(r => r._id === id ? { ...r, ...patch } : r));

  // Compact dropdown styling
  const sel = {
    width: "100%", padding: "5px 4px", fontSize: 11, borderRadius: 4,
    background: t.cardAlt, border: `1px solid ${t.border}`, color: t.bright,
    fontFamily: font,
  };
  const cellStyle = { padding: "8px 6px", borderTop: `1px solid ${t.border}`, verticalAlign: "top" };
  const headStyle = { padding: "8px 6px", fontSize: 10, color: t.dim, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600, textAlign: "left", borderBottom: `1px solid ${t.border}` };

  const fmtTs = (s) => {
    if (s == null) return "—";
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  };

  // Bulk-accept high-confidence rows
  const acceptHighConfidence = () => {
    onChange(rows.map(r => ({ ...r, keep: r.gemini?.confidence === "high" ? true : r.keep })));
  };
  const rejectLowConfidence = () => {
    onChange(rows.map(r => ({ ...r, keep: r.gemini?.confidence === "low" ? false : r.keep })));
  };
  const acceptAll = () => onChange(rows.map(r => ({ ...r, keep: true })));
  const rejectAll = () => onChange(rows.map(r => ({ ...r, keep: false })));

  const counts = { high: 0, medium: 0, low: 0, kept: 0 };
  for (const r of rows) {
    counts[r.gemini?.confidence || "medium"]++;
    if (r.keep) counts.kept++;
  }

  return (
    <>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: t.bright, letterSpacing: 0.4, margin: "20px 0 10px" }}>SAVES — {rows.length} candidate{rows.length === 1 ? "" : "s"}</h3>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center", flexWrap: "wrap", fontSize: 11, color: t.dim }}>
        <span>Confidence: {counts.high} high / {counts.medium} medium / {counts.low} low · Keeping {counts.kept}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button type="button" onClick={acceptHighConfidence} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 11, fontFamily: font, cursor: "pointer" }}>Accept high</button>
          <button type="button" onClick={rejectLowConfidence} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 11, fontFamily: font, cursor: "pointer" }}>Reject low</button>
          <button type="button" onClick={acceptAll} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 11, fontFamily: font, cursor: "pointer" }}>Accept all</button>
          <button type="button" onClick={rejectAll} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 11, fontFamily: font, cursor: "pointer" }}>Reject all</button>
        </span>
      </div>
      <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: 8, marginBottom: 24, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, color: t.text }}>
          <thead>
            <tr>
              <th style={{ ...headStyle, width: 40 }}>Keep</th>
              <th style={{ ...headStyle, width: 60 }}>Time</th>
              <th style={headStyle}>Origin</th>
              <th style={headStyle}>Type</th>
              <th style={headStyle}>On Tgt</th>
              <th style={headStyle}>GK Action</th>
              <th style={headStyle}>Visible</th>
              <th style={headStyle}>Outcome</th>
              <th style={headStyle}>Body</th>
              <th style={headStyle}>Height</th>
              <th style={headStyle}>Side</th>
              <th style={headStyle}>Conf</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const dim = !r.keep;
              const confColor = r.gemini?.confidence === "high" ? t.green : r.gemini?.confidence === "low" ? t.red : t.yellow;
              return (
                <tr key={r._id} style={{ opacity: dim ? 0.4 : 1 }}>
                  <td style={cellStyle}><input type="checkbox" checked={r.keep} onChange={e => update(r._id, { keep: e.target.checked })} /></td>
                  <td style={{ ...cellStyle, fontWeight: 600, color: t.bright, whiteSpace: "nowrap" }}>{fmtTs(r.timestamp_seconds)}</td>
                  <td style={cellStyle}>
                    <select value={r.shot_origin} onChange={e => update(r._id, { shot_origin: e.target.value })} style={sel}>
                      <option value="">—</option>
                      <option value="6yard">6yd</option>
                      <option value="boxL">box L</option>
                      <option value="boxC">box C</option>
                      <option value="boxR">box R</option>
                      <option value="outL">out L</option>
                      <option value="outC">out C</option>
                      <option value="outR">out R</option>
                      <option value="cornerL">corner L</option>
                      <option value="cornerR">corner R</option>
                      <option value="unclear">unclear</option>
                    </select>
                  </td>
                  <td style={cellStyle}>
                    <select value={r.shot_type} onChange={e => update(r._id, { shot_type: e.target.value })} style={sel}>
                      {["Foot", "Header", "Deflection"].map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td style={cellStyle}>
                    <select value={r.on_target} onChange={e => update(r._id, { on_target: e.target.value })} style={sel}>
                      {["yes", "no", "unclear"].map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td style={cellStyle}>
                    <select value={r.gk_action} onChange={e => update(r._id, { gk_action: e.target.value })} style={sel}>
                      {["Catch", "Block", "Parry", "Deflect", "Punch", "Missed", "Goal", "unclear"].map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td style={cellStyle}>
                    <select value={r.gk_visible} onChange={e => update(r._id, { gk_visible: e.target.value })} style={sel}>
                      {["yes", "partial", "no"].map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td style={cellStyle}>
                    <select value={r.outcome} onChange={e => update(r._id, { outcome: e.target.value })} style={sel}>
                      <option value="">—</option>
                      {["held", "rebound_safe", "rebound_dangerous", "corner", "out_of_play", "goal"].map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td style={cellStyle}>
                    <select value={r.body_distance_zone} onChange={e => update(r._id, { body_distance_zone: e.target.value })} style={sel} title="A = near body, B = within 2yd, C = full extension">
                      <option value="">—</option>
                      {["A", "B", "C", "unclear"].map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td style={cellStyle}>
                    <select value={r.goal_placement_height} onChange={e => update(r._id, { goal_placement_height: e.target.value })} style={sel}>
                      <option value="">—</option>
                      {["top", "mid", "low", "unclear"].map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td style={cellStyle}>
                    <select value={r.goal_placement_side} onChange={e => update(r._id, { goal_placement_side: e.target.value })} style={sel}>
                      <option value="">—</option>
                      <option value="left_third">L</option>
                      <option value="centre">C</option>
                      <option value="right_third">R</option>
                      <option value="unclear">?</option>
                    </select>
                  </td>
                  <td style={{ ...cellStyle, color: confColor, fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>{r.gemini?.confidence || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function notesFromGemini(job, candidates, extraGoals) {
  const out = job?.gemini_output;
  const lines = [];

  // Coach's own observations come first — they're the most important.
  const coachLines = [];
  (candidates || []).filter(c => c.keep && c.notes).forEach(c => {
    const team = c.scored_by_us ? "us" : "opponent";
    coachLines.push(`[${fmtTs(c.gemini.timestamp_seconds)}] ${team}: ${c.notes}`);
  });
  (extraGoals || []).filter(g => g.notes).forEach(g => {
    const team = g.scored_by_us ? "us" : "opponent";
    const ts = g.timestamp_str || "?";
    coachLines.push(`[${ts}] ${team}: ${g.notes}`);
  });

  if (coachLines.length) {
    lines.push("Coach observations:");
    coachLines.forEach(l => lines.push("  " + l));
    lines.push("");
  }

  if (out) {
    lines.push(`Auto-tagged from Gemini (${out.model || "unknown model"}).`);
    lines.push(`Source video: ${job.video_url}`);
    lines.push("");
    lines.push("Original Gemini analysis (for reference — coach review applied above):");
    lines.push("");
    (out.parsed?.goals || []).forEach((g, i) => {
      lines.push(`Candidate ${i + 1} · video ${fmtTs(g.timestamp_seconds)} · clock ${g.match_clock} · confidence ${g.confidence}`);
      lines.push(`  ${g.scoring_team} vs ${g.conceding_team} · ${g.attack_type}`);
      lines.push(`  Shot: ${g.shot_type} from ${g.shot_location} · placement ${g.goal_placement_height}/${g.goal_placement_side}`);
      lines.push(`  Buildup: ${g.buildup}`);
      lines.push(`  GK: ${g.gk_observations}`);
      lines.push("");
    });
  }
  return lines.join("\n");
}
