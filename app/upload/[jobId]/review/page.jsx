"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

import { fetchActiveKeepers } from "@/lib/queries";
import { tDark } from "@/lib/theme";
import {
  GOAL_ZONES, OFF_TARGET_ZONES, SHOT_ORIGINS, SHOT_TYPES, GOAL_SOURCES, GK_POSITIONING,
  GOAL_RANKS, GK_ACTIONS_VIDEO, ON_TARGET_OPTIONS, GK_VISIBLE_OPTIONS,
  OUTCOMES, BODY_ZONES, GMH_OPTIONS, GMS_OPTIONS, DIST_TARGET_ZONES, FONT,
} from "@/lib/constants";

const t = tDark;
const font = FONT;
const POSITIONING = GK_POSITIONING;
const RANKS = GOAL_RANKS;
const GK_ACTIONS = GK_ACTIONS_VIDEO;

const inputStyle = {
  width: "100%", padding: "8px 10px", fontSize: 12, borderRadius: 6,
  background: t.cardAlt, border: `1px solid ${t.border}`, color: t.bright,
  fontFamily: font,
};

import { defaultZone, defaultSource, defaultShotType, fmtTs, tsStrToSeconds } from "@/lib/mappings";
import { defaultKeepGoal, defaultKeepSave, defaultKeepDistribution } from "@/lib/default-keep";
import { authedFetch } from "@/lib/authed-fetch";
import FocusModeGoals from "@/components/review/FocusModeGoals";
import FocusModeSaves from "@/components/review/FocusModeSaves";
import FocusModeDistribution from "@/components/review/FocusModeDistribution";
import FocusModeCrosses from "@/components/review/FocusModeCrosses";
import FocusModeSweeper from "@/components/review/FocusModeSweeper";
import FocusMode1v1 from "@/components/review/FocusMode1v1";

// Save-state indicator. Always visible in the review header so the coach
// KNOWS when their work is durably on the server before walking away.
// The BC Soccer Amalie incident (2026-07-11) was in part a UX failure:
// the old badge said "Auto-saved locally" which sounded reassuring but
// meant nothing survived a re-mount. Now colours + wording map directly
// to durability guarantees.
function SaveStateBadge({ state, savedAt, theme, font, isPublished }) {
  if (isPublished) return null;
  const t = theme;
  const fmt = (iso) => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const map = {
    idle:    { color: t.dim,    bg: 'transparent',        icon: '•',  text: 'No changes yet' },
    saving:  { color: t.orange, bg: `${t.orange}18`,      icon: '⋯',  text: 'Saving to cloud…' },
    saved:   { color: t.green,  bg: `${t.green}18`,       icon: '✓',  text: savedAt ? `Saved to cloud · ${fmt(savedAt)}` : 'Saved to cloud' },
    error:   { color: t.red,    bg: `${t.red}18`,         icon: '⚠',  text: 'Save failed — work is buffered locally, retrying' },
    offline: { color: t.orange, bg: `${t.orange}18`,      icon: '⚠',  text: 'Offline — work is buffered locally' },
  };
  const s = map[state] || map.idle;
  return (
    <div
      title={state === 'saved' ? 'Your work is durably stored on the server. Safe to close the tab.' :
             state === 'error' ? 'The server write failed. Work is buffered in localStorage; we will retry automatically on your next edit.' :
             state === 'offline' ? 'No internet connection detected. Work is buffered in localStorage and will flush to the server when you reconnect.' :
             state === 'saving' ? 'Writing to the server now.' :
             'No changes yet.'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', borderRadius: 999,
        border: `1px solid ${s.color}55`, background: s.bg,
        color: s.color, fontSize: 11, fontWeight: 600,
        fontFamily: font, whiteSpace: 'nowrap',
      }}
    >
      <span>{s.icon}</span>
      <span>{s.text}</span>
    </div>
  );
}

// Accepts "MM:SS", "M:SS", "62", "62:30" — returns the integer minute (rounded
// down for MM:SS entries). Returns null for empty / invalid / negative input,
// which the publish handler reads as "no substitution declared".
function parseMinuteInput(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (s.includes(':')) {
    const [mStr, secStr] = s.split(':');
    const m = parseInt(mStr, 10);
    if (!Number.isFinite(m) || m < 0) return null;
    return m; // MM:SS entry → floor to whole minute for sub_minute column
  }
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export default function ReviewPage() {
  const { user, supabase, loading: authLoading } = useAuth();
  const router = useRouter();
  const { jobId } = useParams();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishedMatchId, setPublishedMatchId] = useState(null);

  // Substitution capture — for two-keeper matches (H1 GK1 → H2 GK2 style).
  // When populated, publish route writes matches.secondary_keeper_id +
  // sub_minute AND routes every event past sub_minute*60 to the secondary
  // keeper via lib/keeper-attribution.js. Empty by default; coach only fills
  // when a substitution actually happened.
  const [subMinuteStr, setSubMinuteStr] = useState(""); // MM:SS entry
  const [secondaryKeeperId, setSecondaryKeeperId] = useState("");
  const [subReason, setSubReason] = useState("");
  const [coachKeepers, setCoachKeepers] = useState([]); // for the dropdown

  // For each Gemini candidate: keep + scored_by_us toggle + editable fields if concession
  const [candidates, setCandidates] = useState([]);
  const [extraGoals, setExtraGoals] = useState([]); // goals Gemini missed (either team)
  const [scoreOverride, setScoreOverride] = useState(null); // {goals_for, goals_against} or null = derive

  // Phase 2.1 — saves review state (Gemini-detected candidates only)
  const [saveRows, setSaveRows] = useState([]);
  // Coach-added saves live here — mirrors the extraGoals pattern. Rendered
  // as their own inline card list with dropdowns, NOT shoved into Focus
  // mode which would try to load a non-existent video clip and fall back
  // to a "failed to load" empty state (BC Soccer bug, 2026-07-11).
  const [extraSaves, setExtraSaves] = useState([]);
  // Phase 2.2 — distribution review state (Gemini-detected candidates only)
  const [distRows, setDistRows] = useState([]);
  const [extraDist, setExtraDist] = useState([]);

  // Phase B — cross / sweeper / 1v1 review state. Gemini prompts don't exist
  // for these event types yet, so these arrays start empty. Coach adds via
  // "+ Add" buttons or reclassifies from saves/dists. Reclassifications from
  // other sections land here with _reclassified_from set so publish route
  // logs the appropriate coach_correction.
  const [crossRows, setCrossRows] = useState([]);
  const [sweeperRows, setSweeperRows] = useState([]);
  const [oneV1Rows, setOneV1Rows] = useState([]);

  // Auto-save status indicator.
  //
  // saveState is the truth for the UI banner:
  //   'idle'    — no changes since last successful save (or fresh page)
  //   'saving'  — a POST /draft is in flight
  //   'saved'   — server acknowledged the write; work is durable
  //   'error'   — server write failed; localStorage backup was written
  //   'offline' — client detected offline; only localStorage buffered
  //
  // savedAt is the server-authoritative timestamp of the last successful
  // draft POST. Displayed to the coach so they can visually confirm
  // work is durable before walking away.
  //
  // The old model wrote only to localStorage, which meant a background
  // JWT refresh could re-mount this effect and overwrite the local draft
  // with Gemini's raw output — losing 30+ min of coach edits (BC Soccer
  // Amalie incident, 2026-07-11). Fix: server is source of truth.
  // localStorage is only a fallback buffer for offline / server errors.
  const [savedAt, setSavedAt] = useState(null);
  const [saveState, setSaveState] = useState('idle');
  const draftKey = `stix-review-draft-${jobId}`;

  // Phase A2 — keyboard navigation. activeFocus tracks the currently
  // highlighted event so K/X/arrows can act on it. Section cycle:
  // goals -> saves -> distribution -> goals.
  const [activeFocus, setActiveFocus] = useState({ section: "goals", index: 0 });
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Phase B1 — goals review mode. "focus" shows one event at a time with
  // diagram-driven entry; "bulk" shows the legacy dropdown table. Preference
  // persists per browser.
  const [reviewMode, setReviewMode] = useState("focus");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("stix-review-mode");
    if (saved === "focus" || saved === "bulk") setReviewMode(saved);
  }, []);
  const switchMode = (m) => {
    setReviewMode(m);
    if (typeof window !== "undefined") window.localStorage.setItem("stix-review-mode", m);
  };

  // Fetch the coach's active keepers so the substitution panel dropdown has
  // options. Independent of the job load — we always need this list.
  useEffect(() => {
    if (!user || !supabase) return;
    let mounted = true;
    (async () => {
      const ks = await fetchActiveKeepers(supabase, user.id);
      if (mounted) setCoachKeepers(ks || []);
    })();
    return () => { mounted = false; };
  }, [user, supabase]);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    (async () => {
      const res = await authedFetch(supabase, `/api/video-jobs/${jobId}`);
      const json = await res.json();
      if (!mounted) return;
      if (!res.ok) { setError(json.error || "Failed to load"); setLoading(false); return; }
      setJob(json.job);

      // Hydrate substitution state from the draft (survives auto-save) or,
      // failing that, from match_metadata (in case the coach pre-filled it
      // in the upload flow). Empty string == "no sub".
      const draftSub = json.job?.review_draft?.substitution;
      const metaSub = json.job?.match_metadata;
      if (draftSub && (draftSub.sub_minute_str || draftSub.secondary_keeper_id)) {
        setSubMinuteStr(draftSub.sub_minute_str || "");
        setSecondaryKeeperId(draftSub.secondary_keeper_id || "");
        setSubReason(draftSub.sub_reason || "");
      } else if (metaSub?.sub_minute || metaSub?.secondary_keeper_id) {
        // Fall back to metadata if the draft doesn't have it yet.
        setSubMinuteStr(metaSub.sub_minute ? String(metaSub.sub_minute) : "");
        setSecondaryKeeperId(metaSub.secondary_keeper_id || "");
        setSubReason(metaSub.sub_reason || "");
      }

      const out = json.job?.gemini_output?.parsed || { goals: [] };
      const meta = json.job?.match_metadata || {};
      const myColor = String(meta.my_team_color || "").toLowerCase();
      const oppColor = String(meta.opponent_color || "").toLowerCase();

      const cands = (out.goals || []).map((g, i) => {
        const scorer = String(g.scoring_team || "").toLowerCase();
        const scoredByUs = scorer && myColor && scorer.includes(myColor);
        const scoredByOpp = scorer && oppColor && scorer.includes(oppColor);
        const auto = defaultKeepGoal(g);
        return {
          _id: `g${i}`,
          keep: auto.keep,
          _auto: auto,
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
      // Phase 2.2 — load distribution events from gemini_output.distribution.parsed.distribution
      const distParsed = json.job?.gemini_output?.distribution?.parsed || null;
      const initialDist = (distParsed?.distribution || []).map((d, i) => {
        // Phase 2.4 — accept new `press_state` enum or legacy `under_pressure`
        // boolean. UI normalizes both to a single press_state field for editing.
        let pressState = "";
        if (d.press_state) {
          pressState = String(d.press_state).trim().toLowerCase();
        } else if (d.under_pressure === true || String(d.under_pressure).toLowerCase() === "true") {
          pressState = "pressed";
        } else if (d.under_pressure === false || String(d.under_pressure).toLowerCase() === "false") {
          pressState = "unpressed";
        } else if (d.under_pressure != null) {
          pressState = "unclear";
        }
        const auto = defaultKeepDistribution(d);
        return {
          _id: `d${i}`,
          keep: auto.keep,
          _auto: auto,
          timestamp_seconds: d.timestamp_seconds,
          match_clock: d.match_clock,
          trigger: d.trigger || "",
          type: d.type || "",
          successful: d.successful ?? "",
          press_state: pressState,
          pass_selection: d.pass_selection || "",
          direction: d.direction || "",
          receiver: d.receiver || "",
          first_touch: d.first_touch || "",
          notes: d.notes || "",
          // 2026-06-06 — keeper-team attribution. Default to Gemini's call
          // when it gave us one; otherwise default to "us" since most
          // events should be the analyzed keeper's. "unclear" from Gemini
          // collapses to "us" so the coach starts from a reasonable guess.
          keeper_team: (d.keeper_team === 'us' || d.keeper_team === 'opp') ? d.keeper_team : 'us',
          gemini: d,
        };
      });

      // Phase 2.1 — load save events from gemini_output.saves.parsed.saves
      const savesParsed = json.job?.gemini_output?.saves?.parsed || null;
      const initialSaves = (savesParsed?.saves || []).map((s, i) => {
        const auto = defaultKeepSave(s);
        return ({
        _id: `s${i}`,
        keep: auto.keep,
        _auto: auto,
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
        // 2026-06-06 — keeper-team attribution. See distribution mapper above.
        keeper_team: (s.keeper_team === 'us' || s.keeper_team === 'opp') ? s.keeper_team : 'us',
        // raw Gemini context preserved for review-diff and reference
        gemini: s,
        });
      });

      // Build a fresh path → signed-URL map from THIS request's API response.
      // The draft we may restore below was serialized with whatever URLs were
      // live when it was saved, and signed-URL tokens expire (Supabase rejects
      // with "exp claim timestamp check failed" → browser sees a 400/JSON body
      // where it expected MP4 → SRC_NOT_SUPPORTED). We have to overwrite any
      // cached clip_url on restored events with the freshly-minted one.
      const freshClipUrlByPath = {};
      [...cands, ...initialSaves, ...initialDist].forEach(item => {
        const path = item.gemini?.clip_storage_path;
        const url = item.gemini?.clip_url;
        if (path && url) freshClipUrlByPath[path] = url;
      });
      const refreshClipUrls = (events) => events.map(e => {
        // AI-detected events keep clip_storage_path under .gemini
        if (e?.gemini?.clip_storage_path) {
          const fresh = freshClipUrlByPath[e.gemini.clip_storage_path];
          if (fresh && fresh !== e.gemini.clip_url) {
            return { ...e, gemini: { ...e.gemini, clip_url: fresh } };
          }
        }
        // Coach-added / reclassified rows carry clip_storage_path at top level
        if (e?.clip_storage_path) {
          const fresh = freshClipUrlByPath[e.clip_storage_path];
          if (fresh && fresh !== e.clip_url) {
            return { ...e, clip_url: fresh };
          }
        }
        return e;
      });

      // Restore priority: server draft > localStorage fallback > Gemini raw.
      //
      // Server draft is authoritative — it's the last state the coach
      // confirmed saved. localStorage is a fallback for the offline case
      // where a POST failed and the coach kept editing. Gemini raw is only
      // used when both are absent (first-ever load of this review).
      //
      // We deliberately DO NOT do the old count-based sanity check on the
      // server draft. That check caused the BC Soccer overwrite: if a
      // background JWT refresh re-mounted this effect and the count check
      // failed for any subtle reason, the entire draft was discarded and
      // the state was reset to Gemini's raw output — then the auto-save
      // effect immediately overwrote the localStorage backup with the
      // reset state, silently erasing coach work.
      //
      // Trust the server draft. If gemini_output has genuinely changed
      // shape (e.g. re-analysis), that's rare enough to handle by having
      // the coach click "Reset to Gemini output" manually — better than
      // silently losing hours of work.
      let restoredFromDraft = false;
      const serverDraft = json.job?.review_draft;
      const serverDraftAt = json.job?.review_draft_updated_at;

      // Split saveRows/distRows into Gemini rows + coach extras — either
      // reading them from a dedicated draft field (new format) OR migrating
      // any coach_added rows out of the saveRows/distRows arrays (old format
      // from before 2026-07-11 when Add-missed rows went into saveRows).
      const splitCoach = (rows, override) => {
        if (Array.isArray(override)) {
          return { gemini: rows, extras: override };
        }
        const gemini = [], extras = [];
        for (const r of rows) (r?.coach_added ? extras : gemini).push(r);
        return { gemini, extras };
      };

      if (serverDraft && typeof serverDraft === 'object' && serverDraft.candidates) {
        setCandidates(refreshClipUrls(serverDraft.candidates));
        const sSplit = splitCoach(refreshClipUrls(serverDraft.saveRows || initialSaves), serverDraft.extraSaves);
        const dSplit = splitCoach(refreshClipUrls(serverDraft.distRows || initialDist), serverDraft.extraDist);
        setSaveRows(sSplit.gemini);
        setExtraSaves(sSplit.extras);
        setDistRows(dSplit.gemini);
        setExtraDist(dSplit.extras);
        setExtraGoals(refreshClipUrls(serverDraft.extraGoals || []));
        // Phase B: restore cross/sweeper/1v1 rows (default to empty for older drafts).
        setCrossRows(refreshClipUrls(serverDraft.crossRows || []));
        setSweeperRows(refreshClipUrls(serverDraft.sweeperRows || []));
        setOneV1Rows(refreshClipUrls(serverDraft.oneV1Rows || []));
        if (serverDraft.scoreOverride) setScoreOverride(serverDraft.scoreOverride);
        setSavedAt(serverDraftAt || null);
        setSaveState('saved');
        restoredFromDraft = true;
      } else {
        // No server draft — check localStorage. This is both:
        //   (a) the offline-buffer fallback for the "server POST failed
        //       but coach kept editing" case, AND
        //   (b) the RECOVERY path for jobs that predate the server-draft
        //       column (Amalie BC Soccer, 2026-07-11). Trust localStorage
        //       when _jobId matches; don't second-guess with count
        //       checks. The old count-check guard is what caused the
        //       overwrite bug in the first place: if any subtle count
        //       mismatch fired, state was reset to Gemini raw and the
        //       auto-save immediately clobbered the localStorage backup.
        try {
          const raw = typeof window !== "undefined" ? window.localStorage.getItem(draftKey) : null;
          if (raw) {
            const draft = JSON.parse(raw);
            if (draft._jobId === jobId && draft.candidates) {
              if (draft.scoreOverride) setScoreOverride(draft.scoreOverride);
              setCandidates(refreshClipUrls(draft.candidates));
              const sSplit = splitCoach(refreshClipUrls(draft.saveRows || initialSaves), draft.extraSaves);
              const dSplit = splitCoach(refreshClipUrls(draft.distRows || initialDist), draft.extraDist);
              setSaveRows(sSplit.gemini);
              setExtraSaves(sSplit.extras);
              setDistRows(dSplit.gemini);
              setExtraDist(dSplit.extras);
              setExtraGoals(refreshClipUrls(draft.extraGoals || []));
              setCrossRows(refreshClipUrls(draft.crossRows || []));
              setSweeperRows(refreshClipUrls(draft.sweeperRows || []));
              setOneV1Rows(refreshClipUrls(draft.oneV1Rows || []));
              setSavedAt(draft._savedAt || null);
              setSaveState('saved');
              restoredFromDraft = true;
            }
          }
        } catch (e) {
          // ignore parse errors — proceed with fresh state
        }
      }
      if (!restoredFromDraft) {
        setCandidates(cands);
        setSaveRows(initialSaves);
        setDistRows(initialDist);
        setSaveState('idle');
      }

      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [user, jobId, draftKey]);

  // Auto-save: debounced 1500ms. Every edit POSTs to the server so the
  // draft is durable across tab close, browser restart, laptop sleep,
  // JWT refresh, and any other client-side state loss. localStorage is
  // written in parallel as an offline-buffer fallback only.
  //
  // Debounce is 1500ms (not 400ms) because server writes cost more than
  // local writes; longer debounce reduces load without materially
  // affecting the coach's sense of persistence — the "Saving…" indicator
  // fires the moment the coach edits so they see immediate feedback.
  //
  // Guard published/failed jobs so we don't overwrite a good draft
  // with a nearly-empty state during the brief window when the page
  // is transitioning to the published summary view.
  useEffect(() => {
    if (loading || !job) return;
    if (typeof window === "undefined") return;
    if (job.status === 'published' || publishedMatchId) return;

    setSaveState('saving');
    const handle = setTimeout(async () => {
      const draft = {
        candidates, extraGoals, scoreOverride, saveRows, distRows, extraSaves, extraDist,
        // Phase B: cross/sweeper/1v1 rows persist across auto-save too — coach
        // shouldn't lose reclassifications or additions if the tab closes.
        crossRows, sweeperRows, oneV1Rows,
        // Persist substitution across auto-save so a coach's H1/H2 split isn't
        // lost if they close the tab before publishing.
        substitution: {
          sub_minute_str: subMinuteStr,
          secondary_keeper_id: secondaryKeeperId,
          sub_reason: subReason,
        },
      };

      // Always update localStorage first — fastest, never fails on network.
      try {
        const now = new Date().toISOString();
        window.localStorage.setItem(draftKey, JSON.stringify({
          _jobId: jobId, _savedAt: now, ...draft,
        }));
      } catch { /* quota / disabled — proceed anyway; server is the real save */ }

      // Then POST to server — the durable write. On failure, keep the
      // localStorage backup and surface an 'error' state so the coach
      // knows their next 5 min of edits are only in the browser.
      try {
        const res = await authedFetch(supabase, `/api/video-jobs/${jobId}/draft`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draft }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setSavedAt(json.saved_at);
        setSaveState(navigator.onLine === false ? 'offline' : 'saved');
      } catch {
        setSaveState(navigator.onLine === false ? 'offline' : 'error');
      }
    }, 1500);
    return () => clearTimeout(handle);
    // Intentionally omit `supabase` from deps — it's stable within a
    // session and including it would make every JWT-refresh trigger a
    // spurious save cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, job, jobId, draftKey, candidates, extraGoals, scoreOverride, saveRows, distRows, extraSaves, extraDist, crossRows, sweeperRows, oneV1Rows, publishedMatchId, subMinuteStr, secondaryKeeperId, subReason]);

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

  const updateCand    = (id, patch) => setCandidates(cs => cs.map(c => c._id === id ? { ...c, ...patch } : c));
  const updateSave    = (id, patch) => setSaveRows(rs => rs.map(r => r._id === id ? { ...r, ...patch } : r));
  const updateDist    = (id, patch) => setDistRows(rs => rs.map(r => r._id === id ? { ...r, ...patch } : r));
  const updateCross   = (id, patch) => setCrossRows(rs => rs.map(r => r._id === id ? { ...r, ...patch } : r));
  const updateSweeper = (id, patch) => setSweeperRows(rs => rs.map(r => r._id === id ? { ...r, ...patch } : r));
  const update1v1     = (id, patch) => setOneV1Rows(rs => rs.map(r => r._id === id ? { ...r, ...patch } : r));

  // Phase B: coach-adds a new event of a type Gemini doesn't detect yet.
  // Blank row appended to the list; FocusMode* auto-jumps to the last card
  // when a coach_added row appears so the coach can start filling it in.
  const addCross = (keeperTeam = "us") => {
    const _id = `c-add-${Date.now()}`;
    setCrossRows(rs => [...rs, {
      _id, coach_added: true, keep: true, keeper_team: keeperTeam,
      timestamp_seconds: null, match_clock: "",
      side: "", cross_type: "", destination: "",
      gk_action: "", gk_starting_pos: "", outcome: "", notes: "",
      gemini: {},
    }]);
  };
  const addSweeper = (keeperTeam = "us") => {
    const _id = `w-add-${Date.now()}`;
    setSweeperRows(rs => [...rs, {
      _id, coach_added: true, keep: true, keeper_team: keeperTeam,
      timestamp_seconds: null, match_clock: "",
      trigger: "", gk_starting_depth: "", timing: "",
      action: "", pressure: "", risk_grade: "", result: "", notes: "",
      gemini: {},
    }]);
  };
  const add1v1 = (keeperTeam = "us") => {
    const _id = `o-add-${Date.now()}`;
    setOneV1Rows(rs => [...rs, {
      _id, coach_added: true, keep: true, keeper_team: keeperTeam,
      timestamp_seconds: null, match_clock: "",
      situation_type: "", approach_corridor: "", set_position: "",
      body_shape: "", engagement_depth: "", decision: "", timing: "",
      result: "", rebound_quality: "", notes: "",
      gemini: {},
    }]);
  };

  // Generalized reclassification: move an event from one section to another.
  // The clip + timestamp follow the event; type-specific fields are blank on
  // the new row so the coach enters them fresh in the destination section's UI.
  // _reclassified_from is preserved so the publish handler can log a
  // coach_correction (reclassified_<from>_to_<to>) that feeds the calibration
  // preamble on the NEXT match.
  const reclassifyEvent = (sourceType, id, targetType) => {
    if (sourceType === targetType) return;
    // Source lookup extended to 6 types. Any source can be reclassified to any
    // other; clip pointer + timestamp follow the row via clipBundle.
    const sourceRows =
      sourceType === "goal"         ? candidates :
      sourceType === "save"         ? saveRows :
      sourceType === "distribution" ? distRows :
      sourceType === "cross"        ? crossRows :
      sourceType === "sweeper"      ? sweeperRows :
      sourceType === "one_v_one"    ? oneV1Rows : null;
    if (!sourceRows) return;
    const row = sourceRows.find(r => r._id === id);
    if (!row) return;
    const g = row.gemini || {};
    const clipBundle = {
      timestamp_seconds: g.timestamp_seconds ?? row.timestamp_seconds,
      match_clock: g.match_clock ?? row.match_clock,
      clip_storage_path: g.clip_storage_path ?? row.clip_storage_path,
      clip_url: g.clip_url ?? row.clip_url,
    };
    const provenance = {
      source: sourceType,
      gemini_value: sourceType === "goal" ? g : row,
    };
    const commonNew = {
      keep: true,
      timestamp_seconds: clipBundle.timestamp_seconds,
      match_clock: clipBundle.match_clock,
      keeper_team: row.keeper_team || "us",
      gemini: clipBundle,
      _reclassified_from: provenance,
    };

    if (targetType === "distribution") {
      setDistRows(rs => sortByTs([...rs, {
        _id: `d-reclass-${id}`, ...commonNew,
        trigger: "", type: "", successful: "", press_state: "",
        pass_selection: "", direction: "", receiver: "",
        first_touch: "", target_zone: "", notes: "",
      }]));
    } else if (targetType === "save") {
      setSaveRows(rs => sortByTs([...rs, {
        _id: `s-reclass-${id}`, ...commonNew,
        shot_origin: "", shot_type: "", on_target: "", gk_action: "",
        gk_visible: "", outcome: "", body_distance_zone: "",
        goal_placement_height: "", goal_placement_side: "",
        technique: "", dive_family: "", notes: "",
      }]));
    } else if (targetType === "cross") {
      setCrossRows(rs => sortByTs([...rs, {
        _id: `c-reclass-${id}`, ...commonNew,
        side: "", cross_type: "", destination: "",
        gk_action: "", gk_starting_pos: "", outcome: "", notes: "",
      }]));
    } else if (targetType === "sweeper") {
      setSweeperRows(rs => sortByTs([...rs, {
        _id: `w-reclass-${id}`, ...commonNew,
        trigger: "", gk_starting_depth: "", timing: "",
        action: "", pressure: "", risk_grade: "", result: "", notes: "",
      }]));
    } else if (targetType === "one_v_one") {
      setOneV1Rows(rs => sortByTs([...rs, {
        _id: `o-reclass-${id}`, ...commonNew,
        situation_type: "", approach_corridor: "", set_position: "",
        body_shape: "", engagement_depth: "", decision: "", timing: "",
        result: "", rebound_quality: "", notes: "",
      }]));
    } else if (targetType === "goal") {
      // Reclassifying TO a goal candidate goes into extraGoals (coach-added),
      // since `candidates` is reserved for AI-detected goal candidates with
      // their original gemini context.
      const tsSecs = clipBundle.timestamp_seconds;
      const mm = Math.floor((tsSecs || 0) / 60);
      const ss = String(Math.floor((tsSecs || 0) % 60)).padStart(2, "0");
      setExtraGoals(arr => [...arr, {
        _id: `g-reclass-${id}`, coach_added: true, keep: true,
        scored_by_us: null,
        timestamp_str: `${mm}:${ss}`,
        timestamp_seconds: tsSecs,
        goal_zone: "", shot_origin: "", goal_source: "",
        shot_type: "", gk_positioning: "", goal_rank: "",
        half: null, notes: "",
        clip_storage_path: clipBundle.clip_storage_path,
        clip_url: clipBundle.clip_url,
        _reclassified_from: provenance,
      }]);
    }

    // Remove from the source section
    if (sourceType === "goal")               setCandidates(cs => cs.filter(c => c._id !== id));
    else if (sourceType === "save")          setSaveRows(rs => rs.filter(r => r._id !== id));
    else if (sourceType === "distribution")  setDistRows(rs => rs.filter(r => r._id !== id));
    else if (sourceType === "cross")         setCrossRows(rs => rs.filter(r => r._id !== id));
    else if (sourceType === "sweeper")       setSweeperRows(rs => rs.filter(r => r._id !== id));
    else if (sourceType === "one_v_one")     setOneV1Rows(rs => rs.filter(r => r._id !== id));
  };

  // Backwards-compat wrapper kept for FocusModeGoals which still calls the
  // old shape (id, targetType).
  const reclassifyCandidate = (id, targetType) => reclassifyEvent("goal", id, targetType);

  function sortByTs(rows) {
    return [...rows].sort((a, b) => (a.timestamp_seconds || 0) - (b.timestamp_seconds || 0));
  }

  // ---- Phase A2 keyboard navigation ----
  // Map sections to their current event list + setter so handlers can act
  // on whichever section is focused.
  const sectionRefs = useMemo(() => ({
    goals: { rows: candidates, setRows: setCandidates, count: candidates.length },
    saves: { rows: saveRows, setRows: setSaveRows, count: saveRows.length },
    distribution: { rows: distRows, setRows: setDistRows, count: distRows.length },
  }), [candidates, saveRows, distRows]);

  // Clamp activeFocus.index when its section count changes (events added/removed)
  useEffect(() => {
    const max = sectionRefs[activeFocus.section]?.count || 0;
    if (max === 0) return;
    if (activeFocus.index >= max) {
      setActiveFocus({ ...activeFocus, index: max - 1 });
    }
  }, [sectionRefs, activeFocus]);

  const activeId = useMemo(() => {
    const sec = sectionRefs[activeFocus.section];
    if (!sec || !sec.rows.length) return null;
    const row = sec.rows[Math.max(0, Math.min(activeFocus.index, sec.rows.length - 1))];
    return row?._id;
  }, [sectionRefs, activeFocus]);

  // Resolve the timestamp for any row regardless of section. Goal candidates
  // read from `gemini.timestamp_seconds` (Gemini-detected) or null (coach-added
  // extras live in extraGoals, not candidates). Saves/distribution rows have
  // `timestamp_seconds` directly, OR a coach-typed `timestamp_str` we parse.
  const getRowTimestamp = (section, row) => {
    if (!row) return null;
    if (section === "goals") {
      return row.gemini?.timestamp_seconds ?? null;
    }
    if (row.coach_added && row.timestamp_str) return tsStrToSeconds(row.timestamp_str);
    return row.timestamp_seconds ?? null;
  };

  // Build a single chronologically-sorted view across all 3 sections. Phase A2.1
  // (2026-05-27) — `>` and `<` use this to jump to the next/prev event in TIME,
  // not by section. Matches the way coaches actually watch the video: forward
  // through time, processing whatever event happened next.
  const chronological = useMemo(() => {
    const flat = [];
    for (const section of ["goals", "saves", "distribution"]) {
      const rows = sectionRefs[section]?.rows || [];
      rows.forEach((row, index) => {
        const ts = getRowTimestamp(section, row);
        if (typeof ts === "number" && !Number.isNaN(ts)) {
          flat.push({ section, index, ts, id: row._id });
        }
      });
    }
    flat.sort((a, b) => a.ts - b.ts);
    return flat;
  }, [sectionRefs]);

  const findChronological = (direction) => {
    if (!chronological.length) return null;
    const pos = chronological.findIndex(
      x => x.section === activeFocus.section && x.index === activeFocus.index
    );
    if (pos === -1) {
      // Current focus has no timestamp; jump to the first/last in time.
      return direction > 0 ? chronological[0] : chronological[chronological.length - 1];
    }
    const target = pos + direction;
    if (target < 0 || target >= chronological.length) return null; // at boundary, stay put
    return chronological[target];
  };

  useEffect(() => {
    if (loading || error || publishedMatchId) return;
    const onKey = (e) => {
      // Don't hijack typing in form fields
      const tag = (e.target?.tagName || "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) {
        if (e.key === "Escape") e.target?.blur();
        return;
      }
      const sectionOrder = ["goals", "saves", "distribution"];
      const sec = sectionRefs[activeFocus.section];
      if (!sec) return;

      // Help overlay
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setShowShortcuts(s => !s);
        return;
      }
      if (e.key === "Escape") {
        if (showShortcuts) setShowShortcuts(false);
        return;
      }

      // In focus mode, the focus card owns per-event keys (arrows, Enter, r,
      // numpad). We still handle Tab for cross-section navigation.
      if (reviewMode === "focus") {
        if (e.key !== "Tab") return;
      }

      // Navigation
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setActiveFocus(f => ({ ...f, index: Math.min((sectionRefs[f.section]?.count || 1) - 1, f.index + 1) }));
        return;
      }
      if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setActiveFocus(f => ({ ...f, index: Math.max(0, f.index - 1) }));
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const dir = e.shiftKey ? -1 : 1;
        const idx = sectionOrder.indexOf(activeFocus.section);
        const next = sectionOrder[(idx + dir + sectionOrder.length) % sectionOrder.length];
        setActiveFocus({ section: next, index: 0 });
        return;
      }

      // Phase A2.1: chronological navigation across all 3 sections.
      // > = next event in time, < = previous. Matches video-review flow.
      if (e.key === ">") {
        e.preventDefault();
        const next = findChronological(1);
        if (next) setActiveFocus({ section: next.section, index: next.index });
        return;
      }
      if (e.key === "<") {
        e.preventDefault();
        const prev = findChronological(-1);
        if (prev) setActiveFocus({ section: prev.section, index: prev.index });
        return;
      }

      // Toggle keep on focused event
      if (activeId && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        sec.setRows(rows => rows.map(r => r._id === activeId ? { ...r, keep: true } : r));
        return;
      }
      if (activeId && (e.key === "n" || e.key === "N" || e.key === "x" || e.key === "X")) {
        e.preventDefault();
        sec.setRows(rows => rows.map(r => r._id === activeId ? { ...r, keep: false } : r));
        return;
      }
      if (activeId && e.key === " ") {
        e.preventDefault();
        sec.setRows(rows => rows.map(r => r._id === activeId ? { ...r, keep: !r.keep } : r));
        return;
      }

      // Bulk actions on current section
      if (e.shiftKey && (e.key === "A" || e.key === "a")) {
        e.preventDefault();
        sec.setRows(rows => rows.map(r => ({ ...r, keep: true })));
        return;
      }
      if (e.shiftKey && (e.key === "R" || e.key === "r")) {
        e.preventDefault();
        sec.setRows(rows => rows.map(r => ({ ...r, keep: false })));
        return;
      }
      if (e.shiftKey && (e.key === "H" || e.key === "h")) {
        e.preventDefault();
        sec.setRows(rows => rows.map(r => (r.gemini?.confidence === "high" ? { ...r, keep: true } : r)));
        return;
      }
      if (e.shiftKey && (e.key === "L" || e.key === "l")) {
        e.preventDefault();
        sec.setRows(rows => rows.map(r => (r.gemini?.confidence === "low" ? { ...r, keep: false } : r)));
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loading, error, publishedMatchId, sectionRefs, activeFocus, activeId, showShortcuts, chronological, reviewMode]);

  // Scroll-into-view: whenever the active event changes (via any key — arrows,
  // Tab, > / <), bring the focused row into the viewport so the coach can
  // actually see it. Important when navigating across sections (the target
  // section may be far down the page).
  useEffect(() => {
    if (!activeId) return;
    const el = document.querySelector(`[data-row-id="${activeId}"]`);
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeId]);
  // ---- end Phase A2 keyboard navigation ----


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
      // Reclassifications — events the coach moved between sections. Each
      // becomes a coach_correction with type `reclassified_<from>_to_<to>` so
      // the calibration preamble on the NEXT match can learn the pattern.
      // The fields the coach actually entered for the new event type are
      // included so we know what the "right" answer was.
      reclassifications: [
        ...distRows
          .filter(r => r._reclassified_from)
          .map(r => ({
            from: r._reclassified_from.source,
            to: "distribution",
            gemini_value: r._reclassified_from.gemini_value,
            coach_value: {
              timestamp_seconds: r.timestamp_seconds,
              trigger: r.trigger || null,
              type: r.type || null,
              successful: r.successful || null,
              press_state: r.press_state || null,
              direction: r.direction || null,
              receiver: r.receiver || null,
              first_touch: r.first_touch || null,
              target_zone: r.target_zone || null,
              notes: r.notes || null,
            },
          })),
        ...saveRows
          .filter(r => r._reclassified_from)
          .map(r => ({
            from: r._reclassified_from.source,
            to: "save",
            gemini_value: r._reclassified_from.gemini_value,
            coach_value: {
              timestamp_seconds: r.timestamp_seconds,
              shot_origin: r.shot_origin || null,
              shot_type: r.shot_type || null,
              on_target: r.on_target || null,
              gk_action: r.gk_action || null,
              outcome: r.outcome || null,
              body_distance_zone: r.body_distance_zone || null,
              goal_placement_height: r.goal_placement_height || null,
              goal_placement_side: r.goal_placement_side || null,
              technique: r.technique || null,
              dive_family: r.dive_family || null,
              notes: r.notes || null,
            },
          })),
        ...extraGoals
          .filter(g => g._reclassified_from)
          .map(g => ({
            from: g._reclassified_from.source,
            to: "goal",
            gemini_value: g._reclassified_from.gemini_value,
            coach_value: {
              timestamp_seconds: g.timestamp_seconds,
              scored_by_us: g.scored_by_us,
              goal_zone: g.goal_zone || null,
              shot_origin: g.shot_origin || null,
              goal_source: g.goal_source || null,
              shot_type: g.shot_type || null,
              gk_positioning: g.gk_positioning || null,
              goal_rank: g.goal_rank || null,
              notes: g.notes || null,
            },
          })),
      ],
      // Save candidates — every Gemini-detected save (not coach-added, not
      // reclassified-in) with the coach's final field values. Publish route
      // diffs gemini_value vs coach_value to emit per-field corrections.
      save_candidates: saveRows
        .filter(r => !r.coach_added && !r._reclassified_from)
        .map(r => ({
          gemini_value: r.gemini || null,
          keep: !!r.keep,
          coach_value: r.keep ? {
            shot_origin: r.shot_origin || null,
            shot_type: r.shot_type || null,
            on_target: r.on_target || null,
            gk_action: r.gk_action || null,
            gk_visible: r.gk_visible || null,
            outcome: r.outcome || null,
            body_distance_zone: r.body_distance_zone || null,
            goal_placement_height: r.goal_placement_height || null,
            goal_placement_side: r.goal_placement_side || null,
            goal_zone: r.goal_zone || null,
            technique: r.technique || null,
            dive_family: r.dive_family || null,
            keeper_team: r.keeper_team || null,
            notes: r.notes || null,
          } : null,
        })),
      // Save extras — saves Gemini missed entirely. Two source arrays are
      // merged for backward compat: (a) coach_added rows still in saveRows
      // from before the 2026-07-11 split (older matches), (b) extraSaves
      // from the new dedicated inline-card UI. Excludes reclassifications.
      save_extras: [
        ...saveRows.filter(r => r.coach_added && !r._reclassified_from),
        ...extraSaves.filter(r => !r._reclassified_from),
      ]
        .map(r => ({
          timestamp_seconds: tsStrToSeconds(r.timestamp_str),
          timestamp_str: r.timestamp_str || null,
          fields: {
            shot_origin: r.shot_origin || null,
            shot_type: r.shot_type || null,
            on_target: r.on_target || null,
            gk_action: r.gk_action || null,
            gk_visible: r.gk_visible || null,
            outcome: r.outcome || null,
            body_distance_zone: r.body_distance_zone || null,
            goal_placement_height: r.goal_placement_height || null,
            goal_placement_side: r.goal_placement_side || null,
            goal_zone: r.goal_zone || null,
            technique: r.technique || null,
            dive_family: r.dive_family || null,
            keeper_team: r.keeper_team || null,
          },
          notes: r.notes || null,
        })),
      // Distribution candidates — every Gemini-detected distribution (not
      // coach-added, not reclassified-in) with coach's final field values.
      dist_candidates: distRows
        .filter(r => !r.coach_added && !r._reclassified_from)
        .map(r => ({
          gemini_value: r.gemini || null,
          keep: !!r.keep,
          coach_value: r.keep ? {
            trigger: r.trigger || null,
            type: r.type || null,
            successful: r.successful || null,
            press_state: r.press_state || null,
            pass_selection: r.pass_selection || null,
            direction: r.direction || null,
            receiver: r.receiver || null,
            first_touch: r.first_touch || null,
            target_zone: r.target_zone || null,
            keeper_team: r.keeper_team || null,
            notes: r.notes || null,
          } : null,
        })),
      // Distribution extras — distributions Gemini missed entirely. Two
      // source arrays merged for backward compat (see save_extras comment).
      dist_extras: [
        ...distRows.filter(r => r.coach_added && !r._reclassified_from),
        ...extraDist.filter(r => !r._reclassified_from),
      ]
        .map(r => ({
          timestamp_seconds: tsStrToSeconds(r.timestamp_str),
          timestamp_str: r.timestamp_str || null,
          fields: {
            trigger: r.trigger || null,
            type: r.type || null,
            successful: r.successful || null,
            press_state: r.press_state || null,
            pass_selection: r.pass_selection || null,
            direction: r.direction || null,
            receiver: r.receiver || null,
            first_touch: r.first_touch || null,
            target_zone: r.target_zone || null,
            keeper_team: r.keeper_team || null,
          },
          notes: r.notes || null,
        })),
    };

    // Phase 2.1 — saves payload. Only kept rows go to shot_events. Coach-added
    // rows convert their MM:SS string into seconds; Gemini-detected rows already
    // have timestamp_seconds.
    // Saves payload — feeds shot_events on the DB, which powers the dashboard
    // heatmap, save-count aggregates, and the scorecard. Merges Gemini-kept
    // rows (saveRows) with coach-added extras (extraSaves) so the dashboard
    // sees BOTH — otherwise extras only show up as coach_corrections (training
    // data) and never reach the analytics surface. keeper_team is preserved
    // so opposition-GK events are downstream-filterable per keeper.
    const savesPayload = [
      ...saveRows.filter(r => r.keep),
      ...extraSaves.filter(r => r.keep !== false),
    ].map(r => ({
      timestamp_seconds: r.coach_added ? tsStrToSeconds(r.timestamp_str) : r.timestamp_seconds,
      shot_origin: r.shot_origin || null,
      shot_type: r.shot_type || null,
      on_target: r.on_target || null,
      gk_action: r.gk_action || null,
      gk_visible: r.gk_visible || null,
      outcome: r.outcome || null,
      body_distance_zone: r.body_distance_zone || null,
      goal_placement_height: r.goal_placement_height || null,
      goal_placement_side: r.goal_placement_side || null,
      goal_zone: r.goal_zone || null,
      keeper_team: r.keeper_team || null,
      // v3 focus-card additions (schema 2026-06-01):
      technique: r.technique || null,
      dive_family: r.dive_family || null,
      coach_added: !!r.coach_added,
      shot_description: r.shot_description || null,
      gk_observations: r.gk_observations || null,
      notes: r.notes || null,
    }));

    // Phase 2.2 — distribution payload. Only kept rows persist to distribution_events.
    // Phase 2.4 — emit press_state (enum) so server's coercePressState resolves it
    // to the legacy under_pressure boolean. Older clients may still send under_pressure.
    // Distribution payload — feeds distribution_events on the DB (dashboard
    // distribution panel + scorecard). Same merge pattern as savesPayload:
    // Gemini-kept + coach-added extras. Otherwise extras only exist as
    // coach_corrections (training) and never reach the analytics surface.
    const distPayload = [
      ...distRows.filter(r => r.keep),
      ...extraDist.filter(r => r.keep !== false),
    ].map(r => ({
      timestamp_seconds: r.coach_added ? tsStrToSeconds(r.timestamp_str) : r.timestamp_seconds,
      match_clock: r.match_clock || null,
      trigger: r.trigger || null,
      type: r.type || null,
      successful: r.successful || null,         // server coerces "true"/"false"/"unclear" → bool|null
      press_state: r.press_state || null,
      pass_selection: r.pass_selection || null,
      direction: r.direction || null,
      receiver: r.receiver || null,
      first_touch: r.first_touch || null,
      keeper_team: r.keeper_team || null,
      // v3 focus-card addition (schema 2026-06-01):
      target_zone: r.target_zone || null,
      notes: r.notes || null,
      confidence: r.gemini?.confidence || null,
    }));

    // Phase B: crosses / sweeper / 1v1 payloads. Only kept rows go to the DB.
    // Reclassified-in rows are included (they inherit clip_storage_path via the
    // gemini bundle set by reclassifyEvent). Coach-added rows convert MM:SS to
    // seconds if the coach typed one; otherwise null (publish route skips inserts
    // with null timestamp for the ts-based keeper routing).
    const crossPayload = crossRows.filter(r => r.keep !== false).map(r => ({
      timestamp_seconds: r.coach_added && r.timestamp_str ? tsStrToSeconds(r.timestamp_str) : r.timestamp_seconds,
      match_clock: r.match_clock || null,
      side: r.side || null,
      cross_type: r.cross_type || null,
      destination: r.destination || null,
      gk_action: r.gk_action || null,
      gk_starting_pos: r.gk_starting_pos || null,
      outcome: r.outcome || null,
      notes: r.notes || null,
      keeper_team: r.keeper_team || null,
      coach_added: !!r.coach_added,
    }));
    const sweeperPayload = sweeperRows.filter(r => r.keep !== false).map(r => ({
      timestamp_seconds: r.coach_added && r.timestamp_str ? tsStrToSeconds(r.timestamp_str) : r.timestamp_seconds,
      match_clock: r.match_clock || null,
      trigger: r.trigger || null,
      gk_starting_depth: r.gk_starting_depth || null,
      timing: r.timing || null,
      action: r.action || null,
      pressure: r.pressure || null,
      risk_grade: r.risk_grade || null,
      result: r.result || null,
      notes: r.notes || null,
      keeper_team: r.keeper_team || null,
      coach_added: !!r.coach_added,
    }));
    const oneV1Payload = oneV1Rows.filter(r => r.keep !== false).map(r => ({
      timestamp_seconds: r.coach_added && r.timestamp_str ? tsStrToSeconds(r.timestamp_str) : r.timestamp_seconds,
      match_clock: r.match_clock || null,
      situation_type: r.situation_type || null,
      approach_corridor: r.approach_corridor || null,
      set_position: r.set_position || null,
      body_shape: r.body_shape || null,
      engagement_depth: r.engagement_depth || null,
      decision: r.decision || null,
      timing: r.timing || null,
      result: r.result || null,
      rebound_quality: r.rebound_quality || null,
      notes: r.notes || null,
      keeper_team: r.keeper_team || null,
      coach_added: !!r.coach_added,
    }));

    setPublishing(true);
    try {
      // Substitution payload — only send when the coach actually declared
      // both a sub_minute (MM:SS parsed to integer minute) AND a secondary
      // keeper. Half-configured subs would mis-attribute events; publish
      // route also validates this and drops half-configured ones.
      const subMinNum = parseMinuteInput(subMinuteStr);
      const substitution = (subMinNum != null && secondaryKeeperId)
        ? { sub_minute: subMinNum, secondary_keeper_id: secondaryKeeperId, sub_reason: subReason || null }
        : null;

      const res = await authedFetch(supabase, `/api/video-jobs/${jobId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goals_for: finalScore.goals_for,
          goals_against: finalScore.goals_against,
          concessions,
          team_scored: teamScored,
          saves: savesPayload,
          distribution: distPayload,
          // Phase B: three new event-type payloads. Publish route inserts
          // into cross_events / sweeper_events / one_v_one_events with
          // keeper_id routed by timestamp vs sub_minute (same helper Phase
          // A ships for saves + distribution).
          crosses: crossPayload,
          sweeper: sweeperPayload,
          one_v_one: oneV1Payload,
          substitution,
          review_diff: reviewDiff,
          notes: notesFromGemini(job, candidates, extraGoals, saveRows),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Publish failed");
      // Published successfully — clear both the server draft AND the
      // localStorage backup so a next-load doesn't restore stale review
      // state over the published output.
      try { if (typeof window !== "undefined") window.localStorage.removeItem(draftKey); } catch {}
      try {
        await authedFetch(supabase, `/api/video-jobs/${jobId}/draft`, { method: 'DELETE' });
      } catch { /* non-fatal — the published match takes precedence anyway */ }
      // Stay on this page — show the published summary so coach can revisit.
      setPublishedMatchId(json.match_id);
      // Refetch the job so the page re-renders with status='published' state
      const refreshed = await authedFetch(supabase, `/api/video-jobs/${jobId}`);
      const fresh = await refreshed.json();
      if (refreshed.ok) setJob(fresh.job);
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

  // Page-level Add-missed handlers — mirror the extraGoals pattern.
  //
  // Coach-added saves and distributions are STORED IN THEIR OWN STATE
  // ARRAYS (not saveRows / distRows) so they don't get pulled into
  // FocusModeSaves / FocusModeDistribution, which render each row via a
  // video-clip card that requires a Gemini-generated clip_storage_path.
  // Coach adds have no clip, so focus mode would show "failed to load"
  // and no editable fields (BC Soccer bug, 2026-07-11).
  //
  // Both keeper_team variants exposed ("us" / "opp") — opposition-GK
  // events are captured for training but filtered out of the analyzed
  // keeper's stats (saves.md L1, distribution.md L25).
  const addPageSave = (keeperTeam) => {
    setExtraSaves(arr => [...(arr || []), {
      _id: `coach_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      coach_added: true,
      keep: true,
      keeper_team: keeperTeam,
      timestamp_str: "",
      shot_origin: "",
      shot_type: "Foot",
      on_target: "yes",
      gk_action: "Catch",
      gk_visible: "yes",
      outcome: "held",
      body_distance_zone: "",
      goal_placement_height: "",
      goal_placement_side: "",
      shot_description: "",
      gk_observations: "",
      notes: "",
    }]);
  };
  const addPageDist = (keeperTeam) => {
    setExtraDist(arr => [...(arr || []), {
      _id: `dcoach_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      coach_added: true,
      keep: true,
      keeper_team: keeperTeam,
      timestamp_str: "",
      trigger: "goal_kick",
      type: "pass",
      successful: "true",
      press_state: "unpressed",
      pass_selection: "",
      direction: "",
      receiver: "defender",
      first_touch: "",
      notes: "",
    }]);
  };
  const updateExtraSave = (id, patch) => setExtraSaves(arr => arr.map(r => r._id === id ? { ...r, ...patch } : r));
  const removeExtraSave = (id) => setExtraSaves(arr => arr.filter(r => r._id !== id));
  const updateExtraDist = (id, patch) => setExtraDist(arr => arr.map(r => r._id === id ? { ...r, ...patch } : r));
  const removeExtraDist = (id) => setExtraDist(arr => arr.filter(r => r._id !== id));

  // Bulk unreview for Gemini candidates. Coach's added extras + save/dist
  // decisions are preserved. Uses a browser confirm because the operation is
  // deliberate but reversible (any individual candidate can be re-accepted).
  const resetCandidateGoalsToUnreviewed = () => {
    if (typeof window === "undefined") return;
    const kept = candidates.filter(c => c.keep).length;
    if (!window.confirm(
      `Reset all ${candidates.length} Gemini goal candidates to keep=false?\n\n` +
      `Currently ${kept} are marked keep. Your added extra goals stay untouched. ` +
      `Your save and distribution decisions stay untouched. You'll re-accept only the real goals.`
    )) return;
    setCandidates(cs => cs.map(c => ({ ...c, keep: false })));
  };

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
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <SaveStateBadge state={saveState} savedAt={savedAt} theme={t} font={font} isPublished={job?.status === 'published' || !!publishedMatchId} />
          <button
            type="button"
            onClick={() => setShowShortcuts(s => !s)}
            style={{ background: "transparent", border: `1px solid ${t.border}`, borderRadius: 6, color: t.dim, fontSize: 11, padding: "4px 8px", cursor: "pointer", fontFamily: font }}
            title="Show keyboard shortcuts (?)"
          >
            ⌨ shortcuts (?)
          </button>
          <div style={{ fontSize: 12, color: t.dim }}>Review &amp; publish</div>
        </div>
      </div>

      {/* Shortcuts overlay */}
      {showShortcuts && (
        <div onClick={() => setShowShortcuts(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: 24, maxWidth: 520, fontSize: 13, color: t.text }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: t.bright }}>Keyboard shortcuts</div>
              <button type="button" onClick={() => setShowShortcuts(false)} style={{ background: "transparent", border: "none", color: t.dim, fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "8px 14px", fontFamily: "monospace", fontSize: 12 }}>
              <div style={{ color: t.accent }}>↑ / ↓ / j / k</div><div>Navigate events in current section</div>
              <div style={{ color: t.accent, fontWeight: 700 }}>&gt;</div><div><strong>Jump to NEXT event in time</strong> (across all sections — matches video flow)</div>
              <div style={{ color: t.accent, fontWeight: 700 }}>&lt;</div><div><strong>Jump to PREVIOUS event in time</strong> (across all sections)</div>
              <div style={{ color: t.accent }}>Tab</div><div>Move to next section (goals → saves → distribution)</div>
              <div style={{ color: t.accent }}>Shift + Tab</div><div>Move to previous section</div>
              <div style={{ color: t.accent }}>y</div><div>Keep focused event</div>
              <div style={{ color: t.accent }}>n / x</div><div>Reject focused event</div>
              <div style={{ color: t.accent }}>Space</div><div>Toggle keep/reject on focused event</div>
              <div style={{ color: t.accent }}>Shift + A</div><div>Accept ALL in current section</div>
              <div style={{ color: t.accent }}>Shift + R</div><div>Reject ALL in current section</div>
              <div style={{ color: t.accent }}>Shift + H</div><div>Accept all high-confidence in current section</div>
              <div style={{ color: t.accent }}>Shift + L</div><div>Reject all low-confidence in current section</div>
              <div style={{ color: t.accent }}>?</div><div>Toggle this help</div>
              <div style={{ color: t.accent }}>Esc</div><div>Close help / blur a text field</div>
            </div>
            <div style={{ fontSize: 11, color: t.dim, marginTop: 14, fontStyle: "italic" }}>
              Shortcuts are disabled while typing in text fields. Press Esc inside a text field to blur it.
            </div>
          </div>
        </div>
      )}

      {/* Active-section indicator (sticky) */}
      {!loading && !error && !publishedMatchId && (
        <div style={{ position: "sticky", top: 0, zIndex: 50, background: t.bg, borderBottom: `1px solid ${t.border}`, padding: "6px 20px", maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: t.dim, fontFamily: "monospace" }}>
          <span>focus:</span>
          <span style={{ color: activeFocus.section === 'goals' ? t.accent : t.dim, fontWeight: activeFocus.section === 'goals' ? 700 : 400 }}>goals</span>
          <span>·</span>
          <span style={{ color: activeFocus.section === 'saves' ? t.accent : t.dim, fontWeight: activeFocus.section === 'saves' ? 700 : 400 }}>saves</span>
          <span>·</span>
          <span style={{ color: activeFocus.section === 'distribution' ? t.accent : t.dim, fontWeight: activeFocus.section === 'distribution' ? 700 : 400 }}>distribution</span>
          <span style={{ marginLeft: 12 }}>· event {sectionRefs[activeFocus.section]?.count > 0 ? `${activeFocus.index + 1}/${sectionRefs[activeFocus.section].count}` : '—'}</span>
          <span style={{ marginLeft: "auto", color: t.dim }}>↑↓ within · &gt; next-in-time · y/n keep/reject · Tab switch · ? full shortcuts</span>
        </div>
      )}

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px" }}>
        {/* PUBLISHED BANNER (if applicable) */}
        {(publishedMatchId || job?.status === "published") && (
          <div style={{ background: t.accent + "15", border: `1px solid ${t.accent}66`, borderRadius: 12, padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.accent }}>✓ Published to dashboard</div>
              <div style={{ fontSize: 12, color: t.text, marginTop: 2 }}>
                Your decisions and notes are saved. The match is now visible on the dashboard. You can keep this page open as a reference for what you tagged.
              </div>
            </div>
            <Link href="/dashboard" style={{ padding: "10px 18px", borderRadius: 8, background: t.accent, color: "#fff", border: "none", fontWeight: 700, fontSize: 13, fontFamily: font, textDecoration: "none", whiteSpace: "nowrap" }}>View on dashboard →</Link>
          </div>
        )}

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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "16px 0 10px", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: t.bright, letterSpacing: 0.4, margin: 0 }}>CANDIDATE GOALS</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={resetCandidateGoalsToUnreviewed}
              title="Set every Gemini candidate to keep=false. Coach-added goals + save/dist decisions stay. Use when Gemini's over-detection is easier to fix by re-accepting the real 1-2 goals than rejecting 15 wrong ones."
              style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 11, fontFamily: font, cursor: "pointer", fontWeight: 600 }}
            >
              ↺ Reset all to unreviewed
            </button>
            <div role="tablist" style={{ display: "inline-flex", border: `1px solid ${t.border}`, borderRadius: 6, overflow: "hidden", fontFamily: font, fontSize: 11 }}>
              <button role="tab" aria-selected={reviewMode === "focus"} type="button" onClick={() => switchMode("focus")}
                style={{ padding: "5px 12px", background: reviewMode === "focus" ? t.accent : "transparent", color: reviewMode === "focus" ? "#fff" : t.dim, border: "none", cursor: "pointer", fontWeight: reviewMode === "focus" ? 700 : 500 }}>
                Focus
              </button>
              <button role="tab" aria-selected={reviewMode === "bulk"} type="button" onClick={() => switchMode("bulk")}
                style={{ padding: "5px 12px", background: reviewMode === "bulk" ? t.accent : "transparent", color: reviewMode === "bulk" ? "#fff" : t.dim, border: "none", cursor: "pointer", fontWeight: reviewMode === "bulk" ? 700 : 500 }}>
                Bulk
              </button>
            </div>
          </div>
        </div>
        {reviewMode === "focus" ? (
          <div style={{ marginBottom: 16 }}>
            <FocusModeGoals
              candidates={candidates}
              onChange={updateCand}
              onReclassify={reclassifyCandidate}
              videoUrl={job?.video_url}
              meta={meta}
              theme={t}
              isActive={activeFocus.section === "goals"}
            />
          </div>
        ) : (<>
        {candidates.length === 0 && (
          <div style={{ background: t.card, border: `1px dashed ${t.border}`, borderRadius: 12, padding: 24, textAlign: "center", color: t.dim, fontSize: 13 }}>
            Gemini found no goal candidates. Use "+ Add a missed concession" below for any goals it should have caught.
          </div>
        )}
        {candidates.map((c) => (
          <div
            key={c._id}
            data-row-id={c._id}
            style={{
              background: t.card,
              border: `${activeId === c._id ? '2px' : '1px'} solid ${activeId === c._id ? t.accent : (c.keep ? t.border : t.border + '44')}`,
              opacity: c.keep ? 1 : 0.55,
              borderRadius: 12,
              padding: 14,
              marginBottom: 12,
              boxShadow: activeId === c._id ? `0 0 0 3px ${t.accent}22` : 'none',
            }}
          >
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
                {c._auto && (
                  <div title={c._auto.explain || ""} style={{ fontSize: 9, color: c._auto.keep ? t.green : (c._auto.reason === "skip-sb" ? t.red : t.dim), fontFamily: "monospace", textAlign: "right", letterSpacing: 0.3 }}>
                    auto: {c._auto.reason}
                  </div>
                )}
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
        </>)}

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

        {/* SAVES — Focus or Bulk */}
        <h3 style={{ fontSize: 13, fontWeight: 700, color: t.bright, letterSpacing: 0.4, margin: "24px 0 10px" }}>SAVES</h3>
        {reviewMode === "focus" ? (
          <div style={{ marginBottom: 24 }}>
            <FocusModeSaves
              rows={saveRows}
              onChange={updateSave}
              onReclassify={(id, target) => reclassifyEvent("save", id, target)}
              videoUrl={job?.video_url}
              theme={t}
              isActive={activeFocus.section === "saves"}
            />
          </div>
        ) : (
          <SavesTable rows={saveRows} onChange={setSaveRows} t={t} font={font} activeId={activeFocus.section === 'saves' ? activeId : null} />
        )}
        {extraSaves.length > 0 && (
          <>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: t.bright, letterSpacing: 0.4, margin: "20px 0 10px" }}>MISSED SAVES (added by you)</h3>
            {extraSaves.map((r) => (
              <ExtraSaveCard
                key={r._id}
                row={r}
                onChange={(patch) => updateExtraSave(r._id, patch)}
                onRemove={() => removeExtraSave(r._id)}
                t={t}
                font={font}
                inputStyle={inputStyle}
                meta={meta}
              />
            ))}
          </>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4, marginBottom: 8 }}>
          <button
            type="button"
            onClick={() => addPageSave('us')}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px dashed ${t.accent}66`, background: "transparent", color: t.accent, fontSize: 12, fontFamily: font, cursor: "pointer" }}
          >
            + Add a save (our GK)
          </button>
          <button
            type="button"
            onClick={() => addPageSave('opp')}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px dashed ${t.dim}66`, background: "transparent", color: t.dim, fontSize: 12, fontFamily: font, cursor: "pointer" }}
            title="Opposition-GK saves. Captured for model training; excluded from the analyzed keeper's stats."
          >
            + Add an opponent GK save
          </button>
        </div>

        {/* DISTRIBUTION — Focus or Bulk */}
        <h3 style={{ fontSize: 13, fontWeight: 700, color: t.bright, letterSpacing: 0.4, margin: "24px 0 10px" }}>DISTRIBUTION</h3>
        {reviewMode === "focus" ? (
          <div style={{ marginBottom: 24 }}>
            <FocusModeDistribution
              rows={distRows}
              onChange={updateDist}
              onReclassify={(id, target) => reclassifyEvent("distribution", id, target)}
              videoUrl={job?.video_url}
              theme={t}
              isActive={activeFocus.section === "distribution"}
            />
          </div>
        ) : (
          <DistributionTable rows={distRows} onChange={setDistRows} t={t} font={font} activeId={activeFocus.section === 'distribution' ? activeId : null} />
        )}
        {extraDist.length > 0 && (
          <>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: t.bright, letterSpacing: 0.4, margin: "20px 0 10px" }}>MISSED DISTRIBUTIONS (added by you)</h3>
            {extraDist.map((r) => (
              <ExtraDistCard
                key={r._id}
                row={r}
                onChange={(patch) => updateExtraDist(r._id, patch)}
                onRemove={() => removeExtraDist(r._id)}
                t={t}
                font={font}
                inputStyle={inputStyle}
              />
            ))}
          </>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4, marginBottom: 8 }}>
          <button
            type="button"
            onClick={() => addPageDist('us')}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px dashed ${t.accent}66`, background: "transparent", color: t.accent, fontSize: 12, fontFamily: font, cursor: "pointer" }}
          >
            + Add a distribution (our GK)
          </button>
          <button
            type="button"
            onClick={() => addPageDist('opp')}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px dashed ${t.dim}66`, background: "transparent", color: t.dim, fontSize: 12, fontFamily: font, cursor: "pointer" }}
            title="Opposition-GK distributions. Captured for model training; excluded from the analyzed keeper's stats."
          >
            + Add an opponent GK distribution
          </button>
        </div>

        {/* ── CROSSES ─────────────────────────────────────────────────
            Gemini doesn't detect crosses yet, so this section starts empty.
            Coach adds via + button or reclassifies from saves/dists. */}
        <h2 style={{ fontSize: 15, fontWeight: 700, color: t.bright, letterSpacing: 0.4, marginTop: 28, marginBottom: 12 }}>
          🎯 CROSSES <span style={{ fontSize: 11, color: t.dim, fontWeight: 400, marginLeft: 8 }}>({crossRows.length})</span>
        </h2>
        <FocusModeCrosses
          rows={crossRows}
          onChange={updateCross}
          onReclassify={(id, target) => reclassifyEvent("cross", id, target)}
          videoUrl={job?.video_url}
          theme={t}
          isActive={activeFocus.section === "crosses"}
        />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10, marginBottom: 8 }}>
          <button type="button" onClick={() => addCross('us')}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px dashed ${t.accent}66`, background: "transparent", color: t.accent, fontSize: 12, fontFamily: font, cursor: "pointer" }}>
            + Add a cross (our GK)
          </button>
          <button type="button" onClick={() => addCross('opp')}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px dashed ${t.dim}66`, background: "transparent", color: t.dim, fontSize: 12, fontFamily: font, cursor: "pointer" }}
            title="Opposition-GK crosses. Captured for training; excluded from the analyzed keeper's stats.">
            + Add an opponent GK cross
          </button>
        </div>

        {/* ── SWEEPER ─────────────────────────────────────────────── */}
        <h2 style={{ fontSize: 15, fontWeight: 700, color: t.bright, letterSpacing: 0.4, marginTop: 28, marginBottom: 12 }}>
          🧹 SWEEPER <span style={{ fontSize: 11, color: t.dim, fontWeight: 400, marginLeft: 8 }}>({sweeperRows.length})</span>
        </h2>
        <FocusModeSweeper
          rows={sweeperRows}
          onChange={updateSweeper}
          onReclassify={(id, target) => reclassifyEvent("sweeper", id, target)}
          videoUrl={job?.video_url}
          theme={t}
          isActive={activeFocus.section === "sweeper"}
        />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10, marginBottom: 8 }}>
          <button type="button" onClick={() => addSweeper('us')}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px dashed ${t.accent}66`, background: "transparent", color: t.accent, fontSize: 12, fontFamily: font, cursor: "pointer" }}>
            + Add a sweeper action (our GK)
          </button>
          <button type="button" onClick={() => addSweeper('opp')}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px dashed ${t.dim}66`, background: "transparent", color: t.dim, fontSize: 12, fontFamily: font, cursor: "pointer" }}>
            + Add an opponent GK sweeper action
          </button>
        </div>

        {/* ── 1V1S ────────────────────────────────────────────────── */}
        <h2 style={{ fontSize: 15, fontWeight: 700, color: t.bright, letterSpacing: 0.4, marginTop: 28, marginBottom: 12 }}>
          ⚔️ 1V1S <span style={{ fontSize: 11, color: t.dim, fontWeight: 400, marginLeft: 8 }}>({oneV1Rows.length})</span>
        </h2>
        <FocusMode1v1
          rows={oneV1Rows}
          onChange={update1v1}
          onReclassify={(id, target) => reclassifyEvent("one_v_one", id, target)}
          videoUrl={job?.video_url}
          theme={t}
          isActive={activeFocus.section === "one_v_one"}
        />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10, marginBottom: 8 }}>
          <button type="button" onClick={() => add1v1('us')}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px dashed ${t.accent}66`, background: "transparent", color: t.accent, fontSize: 12, fontFamily: font, cursor: "pointer" }}>
            + Add a 1v1 (our GK)
          </button>
          <button type="button" onClick={() => add1v1('opp')}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px dashed ${t.dim}66`, background: "transparent", color: t.dim, fontSize: 12, fontFamily: font, cursor: "pointer" }}>
            + Add an opponent GK 1v1
          </button>
        </div>

        {/* SUBSTITUTION PANEL — declare a two-keeper match. Publish route
            reads sub_minute + secondary_keeper_id from the payload and routes
            events past sub_minute*60 to the secondary keeper. Empty by default
            (single-keeper matches); coach only fills when a sub actually
            happened. Half-configured entries are ignored server-side. */}
        {job?.status !== "published" && !publishedMatchId && (
          <div style={{ marginTop: 24, marginBottom: 8, padding: 16, border: `1px solid ${t.border}`, borderRadius: 10, background: `${t.accent}08` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.bright, letterSpacing: 0.4, marginBottom: 4 }}>
              SUBSTITUTION (optional)
            </div>
            <div style={{ fontSize: 11, color: t.dim, marginBottom: 12 }}>
              Did a second keeper come in? Enter the sub minute + who came on. Events after that minute will be attributed to the second keeper.
              Leave blank if the same keeper played the whole match.
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: t.dim, fontFamily: font }}>
                Sub at (MM or MM:SS)
                <input
                  type="text"
                  value={subMinuteStr}
                  onChange={(e) => setSubMinuteStr(e.target.value)}
                  placeholder="e.g. 62 or 62:00"
                  style={{ padding: "8px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: t.card, color: t.bright, fontFamily: font, fontSize: 13, width: 140 }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: t.dim, fontFamily: font }}>
                Second keeper
                <select
                  value={secondaryKeeperId}
                  onChange={(e) => setSecondaryKeeperId(e.target.value)}
                  style={{ padding: "8px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: t.card, color: t.bright, fontFamily: font, fontSize: 13, minWidth: 220 }}
                >
                  <option value="">— none —</option>
                  {coachKeepers.filter(k => k.id !== job?.keeper_id).map(k => (
                    <option key={k.id} value={k.id}>{k.name}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: t.dim, fontFamily: font, flex: 1, minWidth: 200 }}>
                Reason (optional)
                <input
                  type="text"
                  value={subReason}
                  onChange={(e) => setSubReason(e.target.value)}
                  placeholder="e.g. half-time rotation, injury"
                  style={{ padding: "8px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: t.card, color: t.bright, fontFamily: font, fontSize: 13 }}
                />
              </label>
            </div>
            {(() => {
              const parsed = parseMinuteInput(subMinuteStr);
              const halfConfigured = (parsed != null) !== !!secondaryKeeperId;
              const primaryName = coachKeepers.find(k => k.id === job?.keeper_id)?.name || "primary keeper";
              const secondaryName = coachKeepers.find(k => k.id === secondaryKeeperId)?.name;
              if (halfConfigured) {
                return <div style={{ marginTop: 10, fontSize: 11, color: t.red || "#ef4444" }}>Both fields required — otherwise the substitution will be ignored on publish.</div>;
              }
              if (parsed != null && secondaryName) {
                return <div style={{ marginTop: 10, fontSize: 11, color: t.accent }}>✓ Events before {parsed}:00 → <b>{primaryName}</b>. Events at/after {parsed}:00 → <b>{secondaryName}</b>.</div>;
              }
              return null;
            })()}
          </div>
        )}

        {/* PUBLISH */}
        {error && <div style={{ color: t.red, fontSize: 12, marginBottom: 12 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderTop: `1px solid ${t.border}` }}>
          <div style={{ fontSize: 11, color: t.dim, fontFamily: font }}>
            {savedAt && job?.status !== "published" && !publishedMatchId ? (
              <>💾 Auto-saved locally at {new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} — your work survives a page reload.</>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Link href="/upload" style={{ padding: "10px 18px", borderRadius: 8, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontFamily: font, textDecoration: "none", fontSize: 13 }}>Back to uploads</Link>
            {job?.status !== "published" && !publishedMatchId && (
              <button onClick={publish} disabled={publishing} style={{ padding: "10px 22px", borderRadius: 8, background: t.accent, color: "#fff", border: "none", fontWeight: 700, fontSize: 13, fontFamily: font, cursor: publishing ? "default" : "pointer", opacity: publishing ? 0.6 : 1 }}>
                {publishing ? "Publishing…" : `Publish to dashboard (${finalScore.goals_for}–${finalScore.goals_against})`}
              </button>
            )}
          </div>
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

// Vocabulary for the extra-event cards — matches the ground-truth Excel
// template EXACTLY (see scripts/generate-ground-truth-template.js). Human
// labels are what the coach sees; the id is what gets stored on the row and
// flows through publish + eval. When the pipeline needs a canonical schema
// value, use the id; when a human sees it, use the label.
const OPT_SHOT_ORIGIN = [
  { id: "6yard",   label: "6-Yard Box" },
  { id: "boxL",    label: "Left Channel" },
  { id: "boxC",    label: "Central Box" },
  { id: "boxR",    label: "Right Channel" },
  { id: "outL",    label: "Wide Left" },
  { id: "outC",    label: "Central Distance" },
  { id: "outR",    label: "Wide Right" },
  { id: "cornerL", label: "Corner Left" },
  { id: "cornerR", label: "Corner Right" },
  { id: "unclear", label: "Unclear" },
];
const OPT_SHOT_TYPE = [
  { id: "Foot", label: "Foot" },
  { id: "Header", label: "Header" },
  { id: "Deflection", label: "Deflection" },
];
const OPT_YES_NO_UNCLEAR = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
  { id: "unclear", label: "Unclear" },
];
const OPT_GK_VISIBLE = [
  { id: "yes",     label: "Yes" },
  { id: "partial", label: "Partial" },
  { id: "no",      label: "No" },
];
// Matches ground-truth Excel exactly (adds Smother / Starfish / K-Barrier
// on top of the video-pipeline vocabulary). Storing the display string as
// the id keeps eval-match.js happy — the truth JSON stores these same
// canonical strings.
const OPT_GK_ACTION = [
  "Catch", "Block", "Parry", "Deflect", "Punch",
  "Smother", "Starfish", "K-Barrier",
  "Missed", "Goal", "Unclear",
].map(v => ({ id: v, label: v }));
const OPT_OUTCOME = [
  { id: "held",              label: "Held" },
  { id: "rebound_safe",      label: "Rebound (safe)" },
  { id: "rebound_dangerous", label: "Rebound (dangerous)" },
  { id: "corner",            label: "Corner" },
  { id: "out_of_play",       label: "Out of play" },
  { id: "goal",              label: "Goal" },
];
const OPT_BODY_ZONE = [
  { id: "A",       label: "A — At body" },
  { id: "B",       label: "B — Extended" },
  { id: "C",       label: "C — Full dive" },
  { id: "unclear", label: "Unclear" },
];
const OPT_DIST_TRIGGER = [
  { id: "goal_kick",         label: "Goal kick" },
  { id: "after_save",        label: "After save" },
  { id: "backpass",          label: "Backpass" },
  { id: "loose_ball",        label: "Loose ball in box" },
  { id: "throw_in_to_gk",    label: "Throw-in to GK" },
  { id: "free_kick_to_gk",   label: "Free kick to GK" },
];
const OPT_DIST_TYPE = [
  { id: "gk_short",  label: "GK Short Kick" },
  { id: "gk_long",   label: "GK Long Kick" },
  { id: "throw",     label: "Throw" },
  { id: "pass",      label: "Pass" },
  { id: "drop_kick", label: "Drop-kick" },
];
const OPT_PRESS_STATE = [
  { id: "unpressed", label: "Unpressed" },
  { id: "pressed",   label: "Pressed" },
  { id: "unclear",   label: "Unclear" },
];
const OPT_DIRECTION = [
  { id: "left",      label: "Left" },
  { id: "centre",    label: "Centre" },
  { id: "right",     label: "Right" },
  { id: "backwards", label: "Backwards" },
];
const OPT_RECEIVER = [
  { id: "defender",    label: "Defender" },
  { id: "midfielder",  label: "Midfielder" },
  { id: "forward",     label: "Forward" },
  { id: "out_of_play", label: "Out of play" },
  { id: "opponent",    label: "Opponent (turnover)" },
];
const OPT_FIRST_TOUCH = [
  { id: "clean",       label: "Clean" },
  { id: "heavy",       label: "Heavy" },
  { id: "two_touches", label: "Two touches" },
  { id: "mishit",      label: "Mishit" },
];
const OPT_PASS_SELECTION = [
  { id: "short_to_defender",       label: "Short to defender" },
  { id: "sideways_across_back",    label: "Sideways across back" },
  { id: "long_to_forward",         label: "Long to forward" },
  { id: "switch_wide",             label: "Switch wide" },
  { id: "backwards_under_pressure",label: "Backwards under pressure" },
  { id: "clearance_under_pressure",label: "Clearance under pressure" },
  { id: "drilled_into_channel",    label: "Drilled into channel" },
];

// "Where the shot went" — feeds the dashboard heatmap. On-target shots use
// one of the 9 GOAL_ZONES; off-target shots use OFF_TARGET_ZONES; Unclear
// for anything the coach can't localise.
const OPT_SHOT_DESTINATION = [
  ...GOAL_ZONES.map(z => ({ id: z, label: z })),
  ...OFF_TARGET_ZONES.map(z => ({ id: z, label: z })),
  { id: "Unclear", label: "Unclear" },
];

// "Where the ball went" for distributions — same 12-zone map used by
// DistributionFocusCard so coach-added and Gemini-detected distributions
// contribute to the same dashboard visualisation.
const OPT_DIST_TARGET = [
  ...DIST_TARGET_ZONES.map(z => ({
    id: z.id,
    label: `${z.label} (${z.band.toLowerCase()})`,
  })),
  { id: "unclear", label: "Unclear" },
];

// Shared dropdown-of-options helper. Options are {id,label} pairs — display
// shows the label, state stores the id.
function OptionSelect({ label, value, options, onValueChange, t, inputStyle }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: t.dim, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>{label}</div>
      <select value={value || ""} onChange={e => onValueChange(e.target.value)} style={inputStyle}>
        <option value="">—</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
}

// Coach-added save card. Uses the exact vocabulary of the ground-truth
// Excel template so the coach never sees a different option set here vs
// there. Display strings match human speech; underlying ids match the
// eval schema.
function ExtraSaveCard({ row, onChange, onRemove, t, font, inputStyle, meta }) {
  const teamLabel = row.keeper_team === 'us'
    ? `Our GK (${meta?.my_keeper_color || 'our keeper'})`
    : row.keeper_team === 'opp'
      ? `Opponent GK (${meta?.opponent_color || 'opposing keeper'})`
      : 'Unspecified GK';
  const teamColor = row.keeper_team === 'us' ? t.accent : t.dim;
  return (
    <div style={{ background: t.card, border: `1px solid ${teamColor}44`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 10px', borderRadius: 999, background: `${teamColor}18`, color: teamColor, fontSize: 11, fontWeight: 600 }}>
          <span>🥅</span><span>{teamLabel}</span>
        </div>
        <button type="button" onClick={onRemove} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${t.border}`, background: 'transparent', color: t.dim, fontSize: 11, fontFamily: font, cursor: 'pointer' }}>Remove</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '110px repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: t.dim, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>Time (MM:SS)</div>
          <input type="text" value={row.timestamp_str || ""} onChange={e => onChange({ timestamp_str: e.target.value })} placeholder="e.g. 12:24" style={inputStyle} />
        </div>
        <OptionSelect label="Shot origin" value={row.shot_origin} options={OPT_SHOT_ORIGIN} onValueChange={v => onChange({ shot_origin: v })} t={t} inputStyle={inputStyle} />
        <OptionSelect label="Shot type"   value={row.shot_type}   options={OPT_SHOT_TYPE}   onValueChange={v => onChange({ shot_type: v })}   t={t} inputStyle={inputStyle} />
        <OptionSelect label="On target"   value={row.on_target}   options={OPT_YES_NO_UNCLEAR} onValueChange={v => onChange({ on_target: v })} t={t} inputStyle={inputStyle} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
        <OptionSelect label="GK action"   value={row.gk_action}   options={OPT_GK_ACTION}   onValueChange={v => onChange({ gk_action: v })}   t={t} inputStyle={inputStyle} />
        <OptionSelect label="GK visible"  value={row.gk_visible}  options={OPT_GK_VISIBLE}  onValueChange={v => onChange({ gk_visible: v })}  t={t} inputStyle={inputStyle} />
        <OptionSelect label="Outcome"     value={row.outcome}     options={OPT_OUTCOME}     onValueChange={v => onChange({ outcome: v })}     t={t} inputStyle={inputStyle} />
        <OptionSelect label="Body zone"   value={row.body_distance_zone} options={OPT_BODY_ZONE} onValueChange={v => onChange({ body_distance_zone: v })} t={t} inputStyle={inputStyle} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <OptionSelect label="Where the shot went" value={row.goal_zone} options={OPT_SHOT_DESTINATION} onValueChange={v => onChange({ goal_zone: v })} t={t} inputStyle={inputStyle} />
      </div>
      <textarea
        value={row.notes || ""}
        onChange={e => onChange({ notes: e.target.value })}
        placeholder="What did the keeper do? Describe the shot origin, technique used, and outcome."
        rows={3}
        style={{ ...inputStyle, resize: 'vertical' }}
      />
    </div>
  );
}

// Coach-added distribution card. Same pattern as ExtraSaveCard — vocabulary
// mirrors the ground-truth Excel template.
function ExtraDistCard({ row, onChange, onRemove, t, font, inputStyle }) {
  const teamLabel = row.keeper_team === 'us' ? 'Our GK' : row.keeper_team === 'opp' ? 'Opponent GK' : 'Unspecified GK';
  const teamColor = row.keeper_team === 'us' ? t.accent : t.dim;
  return (
    <div style={{ background: t.card, border: `1px solid ${teamColor}44`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 10px', borderRadius: 999, background: `${teamColor}18`, color: teamColor, fontSize: 11, fontWeight: 600 }}>
          <span>⚽</span><span>{teamLabel}</span>
        </div>
        <button type="button" onClick={onRemove} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${t.border}`, background: 'transparent', color: t.dim, fontSize: 11, fontFamily: font, cursor: 'pointer' }}>Remove</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '110px repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: t.dim, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>Time (MM:SS)</div>
          <input type="text" value={row.timestamp_str || ""} onChange={e => onChange({ timestamp_str: e.target.value })} placeholder="e.g. 12:24" style={inputStyle} />
        </div>
        <OptionSelect label="Trigger"    value={row.trigger}    options={OPT_DIST_TRIGGER} onValueChange={v => onChange({ trigger: v })}    t={t} inputStyle={inputStyle} />
        <OptionSelect label="Type"       value={row.type}       options={OPT_DIST_TYPE}    onValueChange={v => onChange({ type: v })}       t={t} inputStyle={inputStyle} />
        <OptionSelect label="Successful" value={row.successful} options={OPT_YES_NO_UNCLEAR} onValueChange={v => onChange({ successful: v })} t={t} inputStyle={inputStyle} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
        <OptionSelect label="Press state"  value={row.press_state}  options={OPT_PRESS_STATE}  onValueChange={v => onChange({ press_state: v })}  t={t} inputStyle={inputStyle} />
        <OptionSelect label="Direction"    value={row.direction}    options={OPT_DIRECTION}    onValueChange={v => onChange({ direction: v })}    t={t} inputStyle={inputStyle} />
        <OptionSelect label="Receiver"     value={row.receiver}     options={OPT_RECEIVER}     onValueChange={v => onChange({ receiver: v })}     t={t} inputStyle={inputStyle} />
        <OptionSelect label="First touch"  value={row.first_touch}  options={OPT_FIRST_TOUCH}  onValueChange={v => onChange({ first_touch: v })}  t={t} inputStyle={inputStyle} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 10 }}>
        <OptionSelect label="Where the ball went"        value={row.target_zone}    options={OPT_DIST_TARGET}    onValueChange={v => onChange({ target_zone: v })}    t={t} inputStyle={inputStyle} />
        <OptionSelect label="Pass selection (optional)"  value={row.pass_selection} options={OPT_PASS_SELECTION} onValueChange={v => onChange({ pass_selection: v })} t={t} inputStyle={inputStyle} />
      </div>
      <textarea
        value={row.notes || ""}
        onChange={e => onChange({ notes: e.target.value })}
        placeholder="Any coaching-relevant observation for this distribution."
        rows={2}
        style={{ ...inputStyle, resize: 'vertical' }}
      />
    </div>
  );
}

function SavesTable({ rows, onChange, t, font, activeId }) {
  const [expanded, setExpanded] = useState({});
  const toggleExpanded = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  const update = (id, patch) => onChange(rows.map(r => r._id === id ? { ...r, ...patch } : r));
  const removeRow = (id) => {
    onChange(rows.filter(r => r._id !== id));
    setExpanded(prev => { const next = { ...prev }; delete next[id]; return next; });
  };
  const addMissedSave = () => {
    const newRow = {
      _id: `coach_${Date.now()}`,
      coach_added: true,
      keep: true,
      timestamp_str: "",
      shot_origin: "",
      shot_type: "Foot",
      on_target: "yes",
      gk_action: "Catch",
      gk_visible: "yes",
      outcome: "held",
      body_distance_zone: "",
      goal_placement_height: "",
      goal_placement_side: "",
      shot_description: "",
      gk_observations: "",
      notes: "",
      gemini: { confidence: "—" },
    };
    onChange([...(rows || []), newRow]);
  };

  if (!rows || rows.length === 0) {
    return (
      <>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: t.bright, letterSpacing: 0.4, margin: "20px 0 10px" }}>SAVES</h3>
        <div style={{ background: t.card, border: `1px dashed ${t.border}`, borderRadius: 12, padding: 24, textAlign: "center", color: t.dim, fontSize: 13, marginBottom: 12 }}>
          Gemini didn't tag any save events for this match. Add saves manually below.
        </div>
        <button type="button" onClick={addMissedSave} style={{ padding: "8px 14px", borderRadius: 8, border: `1px dashed ${t.accent}66`, background: "transparent", color: t.accent, fontSize: 12, fontFamily: font, cursor: "pointer", marginBottom: 24 }}>+ Add a save Gemini missed</button>
      </>
    );
  }

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

  // Coach-added rows store time as MM:SS string; convert for display
  const displayTime = (r) => r.coach_added ? (r.timestamp_str || "—") : fmtTs(r.timestamp_seconds);

  // Bulk actions only apply to Gemini-tagged rows (coach-added rows shouldn't be bulk-rejected)
  const acceptHighConfidence = () => {
    onChange(rows.map(r => ({ ...r, keep: !r.coach_added && r.gemini?.confidence === "high" ? true : r.keep })));
  };
  const rejectLowConfidence = () => {
    onChange(rows.map(r => ({ ...r, keep: !r.coach_added && r.gemini?.confidence === "low" ? false : r.keep })));
  };
  const acceptAll = () => onChange(rows.map(r => ({ ...r, keep: true })));
  const rejectAll = () => onChange(rows.map(r => r.coach_added ? r : { ...r, keep: false }));

  const counts = { high: 0, medium: 0, low: 0, kept: 0, coach: 0 };
  for (const r of rows) {
    if (r.coach_added) counts.coach++;
    else counts[r.gemini?.confidence || "medium"]++;
    if (r.keep) counts.kept++;
  }

  return (
    <>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: t.bright, letterSpacing: 0.4, margin: "20px 0 10px" }}>SAVES — {rows.length} candidate{rows.length === 1 ? "" : "s"}</h3>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center", flexWrap: "wrap", fontSize: 11, color: t.dim }}>
        <span>{counts.high} high / {counts.medium} medium / {counts.low} low · {counts.coach > 0 ? `${counts.coach} coach-added · ` : ""}Keeping {counts.kept}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button type="button" onClick={acceptHighConfidence} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 11, fontFamily: font, cursor: "pointer" }}>Accept high</button>
          <button type="button" onClick={rejectLowConfidence} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 11, fontFamily: font, cursor: "pointer" }}>Reject low</button>
          <button type="button" onClick={acceptAll} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 11, fontFamily: font, cursor: "pointer" }}>Accept all</button>
          <button type="button" onClick={rejectAll} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 11, fontFamily: font, cursor: "pointer" }}>Reject all</button>
          <button type="button" onClick={() => setExpanded(Object.fromEntries(rows.map(r => [r._id, true])))} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 11, fontFamily: font, cursor: "pointer" }}>Expand notes for all</button>
          <button type="button" onClick={() => setExpanded({})} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 11, fontFamily: font, cursor: "pointer" }}>Collapse all</button>
        </span>
      </div>
      <div style={{ fontSize: 11, color: t.dim, marginBottom: 10, lineHeight: 1.5 }}>
        Each row shows Gemini's read of the play and the GK action immediately below it. Click <span style={{ color: t.accent }}>✎</span> on any row to add your own coaching notes — they flow into the match record.
      </div>
      <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: 8, marginBottom: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, color: t.text }}>
          <thead>
            <tr>
              <th style={{ ...headStyle, width: 28 }}></th>
              <th style={{ ...headStyle, width: 40 }}>Keep</th>
              <th style={{ ...headStyle, width: 80 }}>Time</th>
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
              <th style={{ ...headStyle, width: 30 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const dim = !r.keep;
              const isExpanded = !!expanded[r._id];
              const confColor = r.coach_added ? t.accent
                : r.gemini?.confidence === "high" ? t.green
                : r.gemini?.confidence === "low" ? t.red
                : t.yellow;
              return (
                <Fragment key={r._id}>
                  <tr data-row-id={r._id} style={{ opacity: dim ? 0.45 : 1, background: activeId === r._id ? t.accent + "22" : (r.coach_added ? t.accent + "08" : "transparent"), boxShadow: activeId === r._id ? `inset 3px 0 0 ${t.accent}` : "none" }}>
                    <td style={{ ...cellStyle, textAlign: "center" }}>
                      <button type="button" onClick={() => toggleExpanded(r._id)} style={{ background: "none", border: "none", color: r.notes ? t.accent : t.dim, cursor: "pointer", fontSize: 12 }} title={isExpanded ? "Collapse notes" : "Add coach notes"}>
                        {isExpanded ? "▼" : (r.notes ? "✎" : "✎")}
                      </button>
                    </td>
                    <td style={cellStyle}><input type="checkbox" checked={r.keep} onChange={e => update(r._id, { keep: e.target.checked })} /></td>
                    <td style={{ ...cellStyle, fontWeight: 600, color: t.bright, whiteSpace: "nowrap" }}>
                      {r.coach_added ? (
                        <input type="text" value={r.timestamp_str} onChange={e => update(r._id, { timestamp_str: e.target.value })} placeholder="MM:SS" style={{ ...sel, fontWeight: 700, color: t.bright, width: 64 }} />
                      ) : (
                        displayTime(r)
                      )}
                    </td>
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
                    <td style={{ ...cellStyle, color: confColor, fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>
                      {r.coach_added ? "added" : (r.gemini?.confidence || "—")}
                      {r._auto && (
                        <div title={r._auto.explain || ""} style={{ fontSize: 8, color: r._auto.keep ? t.green : t.dim, fontWeight: 500, fontFamily: "monospace", textTransform: "lowercase", marginTop: 2, letterSpacing: 0.3 }}>
                          auto:{r._auto.reason}
                        </div>
                      )}
                    </td>
                    <td style={{ ...cellStyle, textAlign: "center" }}>
                      {r.coach_added && (
                        <button type="button" onClick={() => removeRow(r._id)} style={{ background: "none", border: "none", color: t.dim, cursor: "pointer", fontSize: 12 }} title="Remove">✕</button>
                      )}
                    </td>
                  </tr>
                  {/* Always-visible narrative row — Gemini's description + observations
                      so the coach can read context without clicking expand */}
                  {!r.coach_added && (r.gemini?.shot_description || r.gemini?.gk_observations) && (
                    <tr style={{ background: t.bg, opacity: dim ? 0.4 : 1 }}>
                      <td colSpan={2}></td>
                      <td colSpan={12} style={{ padding: "0 8px 10px", borderTop: "none" }}>
                        {r.gemini?.shot_description && (
                          <div style={{ fontSize: 11, color: t.dim, lineHeight: 1.4, marginBottom: 3 }}>
                            <span style={{ color: t.dim + "cc", fontWeight: 600 }}>Play:</span> {r.gemini.shot_description}
                          </div>
                        )}
                        {r.gemini?.gk_observations && (
                          <div style={{ fontSize: 11, color: t.text, lineHeight: 1.4 }}>
                            <span style={{ color: t.dim + "cc", fontWeight: 600 }}>GK:</span> {r.gemini.gk_observations}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  {/* Expand row — coach editable fields and notes */}
                  {isExpanded && (
                    <tr style={{ background: t.cardAlt }}>
                      <td colSpan={14} style={{ padding: "10px 16px", borderTop: `1px solid ${t.border}` }}>
                        <div style={{ display: "grid", gridTemplateColumns: r.coach_added ? "1fr 1fr 1fr" : "1fr", gap: 14 }}>
                          {r.coach_added && (
                            <>
                              <div>
                                <div style={{ fontSize: 10, color: t.dim, letterSpacing: 0.4, fontWeight: 600, marginBottom: 4, textTransform: "uppercase" }}>Play description</div>
                                <textarea value={r.shot_description || ""} onChange={e => update(r._id, { shot_description: e.target.value })} rows={3} placeholder="What was the shot? (origin, type, channel)" style={{ width: "100%", padding: "6px 8px", fontSize: 12, borderRadius: 6, background: t.bg, border: `1px solid ${t.border}`, color: t.bright, fontFamily: font, resize: "vertical" }} />
                              </div>
                              <div>
                                <div style={{ fontSize: 10, color: t.dim, letterSpacing: 0.4, fontWeight: 600, marginBottom: 4, textTransform: "uppercase" }}>GK observations</div>
                                <textarea value={r.gk_observations || ""} onChange={e => update(r._id, { gk_observations: e.target.value })} rows={3} placeholder="What did the keeper do? (positioning, technique, result)" style={{ width: "100%", padding: "6px 8px", fontSize: 12, borderRadius: 6, background: t.bg, border: `1px solid ${t.border}`, color: t.bright, fontFamily: font, resize: "vertical" }} />
                              </div>
                            </>
                          )}
                          <div>
                            <div style={{ fontSize: 10, color: t.dim, letterSpacing: 0.4, fontWeight: 600, marginBottom: 4, textTransform: "uppercase" }}>Your notes (flow into match record)</div>
                            <textarea value={r.notes || ""} onChange={e => update(r._id, { notes: e.target.value })} rows={3} placeholder="Anything you'd add — context Gemini missed, coaching point for the keeper, comparison to previous saves..." style={{ width: "100%", padding: "6px 8px", fontSize: 12, borderRadius: 6, background: t.bg, border: `1px solid ${t.border}`, color: t.bright, fontFamily: font, resize: "vertical" }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={addMissedSave} style={{ padding: "8px 14px", borderRadius: 8, border: `1px dashed ${t.accent}66`, background: "transparent", color: t.accent, fontSize: 12, fontFamily: font, cursor: "pointer", marginBottom: 24 }}>+ Add a save Gemini missed</button>
    </>
  );
}

// Phase 2.2 — distribution candidates review. Mirrors the SavesTable pattern:
// Gemini-tagged rows are accepted by default, coach can reject false positives,
// add missed events, and edit fields inline. Only kept rows persist.
function DistributionTable({ rows, onChange, t, font, activeId }) {
  const [expanded, setExpanded] = useState({});
  const toggleExpanded = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  const update = (id, patch) => onChange(rows.map(r => r._id === id ? { ...r, ...patch } : r));
  const removeRow = (id) => {
    onChange(rows.filter(r => r._id !== id));
    setExpanded(prev => { const next = { ...prev }; delete next[id]; return next; });
  };
  const addMissedDist = () => {
    onChange([...(rows || []), {
      _id: `dcoach_${Date.now()}`,
      coach_added: true,
      keep: true,
      timestamp_str: "",
      trigger: "goal_kick",
      type: "pass",
      successful: "true",
      press_state: "unpressed",
      pass_selection: "",
      direction: "",
      receiver: "defender",
      first_touch: "",
      notes: "",
      gemini: { confidence: "—" },
    }]);
  };

  const TRIGGERS = ["goal_kick", "after_save", "backpass", "loose_ball", "throw_in_to_gk", "free_kick_to_gk"];
  const TYPES = ["gk_short", "gk_long", "throw", "pass", "drop_kick"];
  const TRIBOOL = ["true", "false", "unclear"];
  const PRESS_STATES = ["unpressed", "pressed", "unclear"];
  const PASS_SEL = [
    "short_to_defender", "sideways_across_back", "long_to_forward",
    "switch_wide", "backwards_under_pressure", "clearance_under_pressure", "drilled_into_channel",
  ];
  const DIRECTIONS = ["left", "centre", "right", "backwards"];
  const RECEIVERS = ["defender", "midfielder", "forward", "out_of_play", "opponent"];
  const FIRST_TOUCH = ["clean", "heavy", "two_touches", "mishit"];

  const sel = {
    width: "100%", padding: "5px 4px", fontSize: 11, borderRadius: 4,
    background: t.cardAlt, border: `1px solid ${t.border}`, color: t.bright,
    fontFamily: font,
  };
  const cellStyle = { padding: "8px 6px", borderTop: `1px solid ${t.border}`, verticalAlign: "top" };
  const headStyle = { padding: "8px 6px", fontSize: 10, color: t.dim, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600, textAlign: "left", borderBottom: `1px solid ${t.border}` };

  const fmtTimeLocal = (s) => {
    if (s == null) return "—";
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  };
  const displayTime = (r) => r.coach_added ? (r.timestamp_str || "—") : fmtTimeLocal(r.timestamp_seconds);

  if (!rows || rows.length === 0) {
    return (
      <>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: t.bright, letterSpacing: 0.4, margin: "20px 0 10px" }}>DISTRIBUTION</h3>
        <div style={{ background: t.card, border: `1px dashed ${t.border}`, borderRadius: 12, padding: 24, textAlign: "center", color: t.dim, fontSize: 13, marginBottom: 12 }}>
          Gemini didn't tag any distribution events for this match. Add them manually below.
        </div>
        <button type="button" onClick={addMissedDist} style={{ padding: "8px 14px", borderRadius: 8, border: `1px dashed ${t.accent}66`, background: "transparent", color: t.accent, fontSize: 12, fontFamily: font, cursor: "pointer", marginBottom: 24 }}>+ Add a distribution Gemini missed</button>
      </>
    );
  }

  const acceptHighConfidence = () => onChange(rows.map(r => ({ ...r, keep: !r.coach_added && r.gemini?.confidence === "high" ? true : r.keep })));
  const rejectLowConfidence = () => onChange(rows.map(r => ({ ...r, keep: !r.coach_added && r.gemini?.confidence === "low" ? false : r.keep })));
  const acceptAll = () => onChange(rows.map(r => ({ ...r, keep: true })));
  const rejectAll = () => onChange(rows.map(r => r.coach_added ? r : { ...r, keep: false }));

  const counts = { high: 0, medium: 0, low: 0, kept: 0, coach: 0 };
  for (const r of rows) {
    if (r.coach_added) counts.coach++;
    else counts[r.gemini?.confidence || "medium"]++;
    if (r.keep) counts.kept++;
  }

  return (
    <>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: t.bright, letterSpacing: 0.4, margin: "20px 0 10px" }}>DISTRIBUTION — {rows.length} candidate{rows.length === 1 ? "" : "s"}</h3>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center", flexWrap: "wrap", fontSize: 11, color: t.dim }}>
        <span>{counts.high} high / {counts.medium} medium / {counts.low} low · {counts.coach > 0 ? `${counts.coach} coach-added · ` : ""}Keeping {counts.kept}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button type="button" onClick={acceptHighConfidence} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 11, fontFamily: font, cursor: "pointer" }}>Accept high</button>
          <button type="button" onClick={rejectLowConfidence} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 11, fontFamily: font, cursor: "pointer" }}>Reject low</button>
          <button type="button" onClick={acceptAll} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 11, fontFamily: font, cursor: "pointer" }}>Accept all</button>
          <button type="button" onClick={rejectAll} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 11, fontFamily: font, cursor: "pointer" }}>Reject all</button>
          <button type="button" onClick={() => setExpanded(Object.fromEntries(rows.map(r => [r._id, true])))} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 11, fontFamily: font, cursor: "pointer" }}>Expand all</button>
          <button type="button" onClick={() => setExpanded({})} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: "transparent", color: t.dim, fontSize: 11, fontFamily: font, cursor: "pointer" }}>Collapse all</button>
        </span>
      </div>
      <div style={{ fontSize: 11, color: t.dim, marginBottom: 10, lineHeight: 1.5 }}>
        Each row = one moment the GK released the ball. Click <span style={{ color: t.accent }}>✎</span> to add notes or use the Pass-selection / First-touch fields.
      </div>
      <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 12, padding: 8, marginBottom: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, color: t.text }}>
          <thead>
            <tr>
              <th style={{ ...headStyle, width: 28 }}></th>
              <th style={{ ...headStyle, width: 40 }}>Keep</th>
              <th style={{ ...headStyle, width: 80 }}>Time</th>
              <th style={headStyle}>Trigger</th>
              <th style={headStyle}>Type</th>
              <th style={headStyle}>OK?</th>
              <th style={headStyle}>Pressed</th>
              <th style={headStyle}>Direction</th>
              <th style={headStyle}>Receiver</th>
              <th style={headStyle}>Conf</th>
              <th style={{ ...headStyle, width: 30 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const dim = !r.keep;
              const isExpanded = !!expanded[r._id];
              const confColor = r.coach_added ? t.accent
                : r.gemini?.confidence === "high" ? t.green
                : r.gemini?.confidence === "low" ? t.red
                : t.yellow;
              return (
                <Fragment key={r._id}>
                  <tr data-row-id={r._id} style={{ opacity: dim ? 0.45 : 1, background: activeId === r._id ? t.accent + "22" : (r.coach_added ? t.accent + "08" : "transparent"), boxShadow: activeId === r._id ? `inset 3px 0 0 ${t.accent}` : "none" }}>
                    <td style={{ ...cellStyle, textAlign: "center" }}>
                      <button type="button" onClick={() => toggleExpanded(r._id)} style={{ background: "none", border: "none", color: r.notes ? t.accent : t.dim, cursor: "pointer", fontSize: 12 }} title={isExpanded ? "Collapse details" : "Edit details"}>
                        {isExpanded ? "▼" : "✎"}
                      </button>
                    </td>
                    <td style={cellStyle}><input type="checkbox" checked={r.keep} onChange={e => update(r._id, { keep: e.target.checked })} /></td>
                    <td style={{ ...cellStyle, fontWeight: 600, color: t.bright, whiteSpace: "nowrap" }}>
                      {r.coach_added ? (
                        <input type="text" value={r.timestamp_str || ""} onChange={e => update(r._id, { timestamp_str: e.target.value })} placeholder="MM:SS" style={{ ...sel, fontWeight: 700, color: t.bright, width: 64 }} />
                      ) : (
                        displayTime(r)
                      )}
                    </td>
                    <td style={cellStyle}>
                      <select value={r.trigger || ""} onChange={e => update(r._id, { trigger: e.target.value })} style={sel}>
                        <option value="">—</option>
                        {TRIGGERS.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                      </select>
                    </td>
                    <td style={cellStyle}>
                      <select value={r.type || ""} onChange={e => update(r._id, { type: e.target.value })} style={sel}>
                        <option value="">—</option>
                        {TYPES.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                      </select>
                    </td>
                    <td style={cellStyle}>
                      <select value={r.successful || ""} onChange={e => update(r._id, { successful: e.target.value })} style={sel}>
                        <option value="">—</option>
                        {TRIBOOL.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                    <td style={cellStyle}>
                      <select value={r.press_state || ""} onChange={e => update(r._id, { press_state: e.target.value })} style={sel}>
                        <option value="">—</option>
                        {PRESS_STATES.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                    <td style={cellStyle}>
                      <select value={r.direction || ""} onChange={e => update(r._id, { direction: e.target.value })} style={sel}>
                        <option value="">—</option>
                        {DIRECTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                    <td style={cellStyle}>
                      <select value={r.receiver || ""} onChange={e => update(r._id, { receiver: e.target.value })} style={sel}>
                        <option value="">—</option>
                        {RECEIVERS.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                      </select>
                    </td>
                    <td style={{ ...cellStyle, color: confColor, fontWeight: 600, textTransform: "lowercase" }}>
                      {r.coach_added ? "—" : (r.gemini?.confidence || "—")}
                      {r._auto && (
                        <div title={r._auto.explain || ""} style={{ fontSize: 8, color: r._auto.keep ? t.green : t.dim, fontWeight: 500, fontFamily: "monospace", textTransform: "lowercase", marginTop: 2, letterSpacing: 0.3 }}>
                          auto:{r._auto.reason}
                        </div>
                      )}
                    </td>
                    <td style={{ ...cellStyle, textAlign: "center" }}>
                      <button type="button" onClick={() => removeRow(r._id)} title="Remove row" style={{ background: "none", border: "none", color: t.dim, cursor: "pointer", fontSize: 12 }}>✕</button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr style={{ background: t.cardAlt }}>
                      <td colSpan={11} style={{ padding: "10px 16px", borderTop: `1px solid ${t.border}` }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                          <div>
                            <div style={{ fontSize: 10, color: t.dim, letterSpacing: 0.4, fontWeight: 600, marginBottom: 4, textTransform: "uppercase" }}>Pass selection</div>
                            <select value={r.pass_selection || ""} onChange={e => update(r._id, { pass_selection: e.target.value })} style={{ ...sel, width: "100%" }}>
                              <option value="">—</option>
                              {PASS_SEL.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                            </select>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: t.dim, letterSpacing: 0.4, fontWeight: 600, marginBottom: 4, textTransform: "uppercase" }}>First touch (optional)</div>
                            <select value={r.first_touch || ""} onChange={e => update(r._id, { first_touch: e.target.value })} style={{ ...sel, width: "100%" }}>
                              <option value="">—</option>
                              {FIRST_TOUCH.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                            </select>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: t.dim, letterSpacing: 0.4, fontWeight: 600, marginBottom: 4, textTransform: "uppercase" }}>Your notes (flow into match record)</div>
                            <textarea value={r.notes || ""} onChange={e => update(r._id, { notes: e.target.value })} rows={3} placeholder="Anything you'd add — context Gemini missed, coaching point on the choice..." style={{ width: "100%", padding: "6px 8px", fontSize: 12, borderRadius: 6, background: t.bg, border: `1px solid ${t.border}`, color: t.bright, fontFamily: font, resize: "vertical" }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={addMissedDist} style={{ padding: "8px 14px", borderRadius: 8, border: `1px dashed ${t.accent}66`, background: "transparent", color: t.accent, fontSize: 12, fontFamily: font, cursor: "pointer", marginBottom: 24 }}>+ Add a distribution Gemini missed</button>
    </>
  );
}

function notesFromGemini(job, candidates, extraGoals, saveRows) {
  // Per-event narrative is now stored as STRUCTURED data on goals_conceded /
  // goals_scored / shot_events. This summary is a compact human-readable
  // index — not a wall of text. The dashboard will render the structured
  // data directly; this is a fallback for places that show match.notes.
  const lines = [];
  const out = job?.gemini_output;

  const keptGoalsAgainst = [
    ...(candidates || []).filter(c => c.keep && c.scored_by_us === false).map(c => ({
      ts: fmtTs(c.gemini.timestamp_seconds),
      note: c.notes,
    })),
    ...(extraGoals || []).filter(g => g.scored_by_us === false).map(g => ({
      ts: g.timestamp_str || "?",
      note: g.notes,
    })),
  ];
  const keptGoalsFor = [
    ...(candidates || []).filter(c => c.keep && c.scored_by_us === true).map(c => ({
      ts: fmtTs(c.gemini.timestamp_seconds),
      note: c.notes,
    })),
    ...(extraGoals || []).filter(g => g.scored_by_us === true).map(g => ({
      ts: g.timestamp_str || "?",
      note: g.notes,
    })),
  ];
  const keptSaves = (saveRows || []).filter(s => s.keep).map(s => ({
    ts: s.coach_added ? (s.timestamp_str || "?") : fmtTs(s.timestamp_seconds),
    action: s.gk_action,
    note: s.notes,
  }));

  if (keptGoalsFor.length) {
    lines.push(`GOALS SCORED (${keptGoalsFor.length})`);
    keptGoalsFor.forEach(g => lines.push(`  [${g.ts}]${g.note ? ` — ${g.note}` : ""}`));
    lines.push("");
  }
  if (keptGoalsAgainst.length) {
    lines.push(`GOALS CONCEDED (${keptGoalsAgainst.length})`);
    keptGoalsAgainst.forEach(g => lines.push(`  [${g.ts}]${g.note ? ` — ${g.note}` : ""}`));
    lines.push("");
  }
  if (keptSaves.length) {
    lines.push(`SAVES (${keptSaves.length})`);
    keptSaves.forEach(s => lines.push(`  [${s.ts}] ${s.action || "?"}${s.note ? ` — ${s.note}` : ""}`));
    lines.push("");
  }

  // Provenance footer — thin, no Gemini reference dump.
  if (out) {
    lines.push(`— Auto-tagged from video (${out.model || "gemini"}). Per-event detail is in the structured records on this match.`);
  }
  return lines.join("\n").trim();
}
