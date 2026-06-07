"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

import { tDark } from "@/lib/theme";
import {
  GOAL_ZONES, SHOT_ORIGINS, SHOT_TYPES, GOAL_SOURCES, GK_POSITIONING,
  GOAL_RANKS, GK_ACTIONS_VIDEO, ON_TARGET_OPTIONS, GK_VISIBLE_OPTIONS,
  OUTCOMES, BODY_ZONES, GMH_OPTIONS, GMS_OPTIONS, FONT,
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

export default function ReviewPage() {
  const { user, supabase, loading: authLoading } = useAuth();
  const router = useRouter();
  const { jobId } = useParams();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishedMatchId, setPublishedMatchId] = useState(null);

  // For each Gemini candidate: keep + scored_by_us toggle + editable fields if concession
  const [candidates, setCandidates] = useState([]);
  const [extraGoals, setExtraGoals] = useState([]); // goals Gemini missed (either team)
  const [scoreOverride, setScoreOverride] = useState(null); // {goals_for, goals_against} or null = derive

  // Phase 2.1 — saves review state
  const [saveRows, setSaveRows] = useState([]);
  // Phase 2.2 — distribution review state
  const [distRows, setDistRows] = useState([]);

  // Auto-save status indicator
  const [savedAt, setSavedAt] = useState(null);
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

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    (async () => {
      const res = await authedFetch(supabase, `/api/video-jobs/${jobId}`);
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
        // raw Gemini context preserved for review-diff and reference
        gemini: s,
        });
      });

      // Restore from localStorage if a draft exists for this job. Drafts are
      // tied to the job_id and the gemini_output count so we don't restore an
      // out-of-date draft against a re-analyzed job.
      let restoredFromDraft = false;
      try {
        const raw = typeof window !== "undefined" ? window.localStorage.getItem(draftKey) : null;
        if (raw) {
          const draft = JSON.parse(raw);
          // Sanity check the draft matches the current job (same candidate / save / dist counts).
          if (
            draft.candidates?.length === cands.length &&
            draft.saveRows?.length === initialSaves.length &&
            (draft.distRows?.length ?? 0) === initialDist.length &&
            draft._jobId === jobId
          ) {
            setCandidates(draft.candidates);
            setSaveRows(draft.saveRows);
            setDistRows(draft.distRows || initialDist);
            setExtraGoals(draft.extraGoals || []);
            setScoreOverride(draft.scoreOverride || null);
            setSavedAt(draft._savedAt || null);
            restoredFromDraft = true;
          }
        }
      } catch (e) {
        // ignore parse errors — proceed with fresh state
      }
      if (!restoredFromDraft) {
        setCandidates(cands);
        setSaveRows(initialSaves);
        setDistRows(initialDist);
      }

      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [user, jobId, draftKey]);

  // Auto-save: any state change writes to localStorage, debounced 400ms.
  useEffect(() => {
    if (loading || !job) return;
    if (typeof window === "undefined") return;
    const handle = setTimeout(() => {
      try {
        const now = new Date().toISOString();
        const draft = {
          _jobId: jobId,
          _savedAt: now,
          candidates, extraGoals, scoreOverride, saveRows, distRows,
        };
        window.localStorage.setItem(draftKey, JSON.stringify(draft));
        setSavedAt(now);
      } catch (e) {
        // localStorage quota or disabled — silent fail; we tried
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [loading, job, jobId, draftKey, candidates, extraGoals, scoreOverride, saveRows, distRows]);

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
  const updateSave = (id, patch) => setSaveRows(rs => rs.map(r => r._id === id ? { ...r, ...patch } : r));
  const updateDist = (id, patch) => setDistRows(rs => rs.map(r => r._id === id ? { ...r, ...patch } : r));

  // Generalized reclassification: move an event from one section to another.
  // The clip + timestamp follow the event; type-specific fields are blank on
  // the new row so the coach enters them fresh in the destination section's UI.
  // _reclassified_from is preserved so the publish handler can log a
  // coach_correction (reclassified_<from>_to_<to>) that feeds the calibration
  // preamble on the NEXT match.
  const reclassifyEvent = (sourceType, id, targetType) => {
    if (sourceType === targetType) return;
    const sourceRows =
      sourceType === "goal" ? candidates :
      sourceType === "save" ? saveRows :
      sourceType === "distribution" ? distRows : null;
    if (!sourceRows) return;
    const row = sourceRows.find(r => r._id === id);
    if (!row) return;
    const g = row.gemini || {};
    const clipBundle = {
      timestamp_seconds: g.timestamp_seconds ?? row.timestamp_seconds,
      match_clock: g.match_clock ?? row.match_clock,
      clip_storage_path: g.clip_storage_path,
      clip_url: g.clip_url,
    };
    const provenance = {
      source: sourceType,
      gemini_value: sourceType === "goal" ? g : row,
    };

    if (targetType === "distribution") {
      const newRow = {
        _id: `d-reclass-${id}`,
        keep: true,
        timestamp_seconds: clipBundle.timestamp_seconds,
        match_clock: clipBundle.match_clock,
        trigger: "", type: "", successful: "", press_state: "",
        pass_selection: "", direction: "", receiver: "",
        first_touch: "", target_zone: "", notes: "",
        gemini: clipBundle,
        _reclassified_from: provenance,
      };
      setDistRows(rs => sortByTs([...rs, newRow]));
    } else if (targetType === "save") {
      const newRow = {
        _id: `s-reclass-${id}`,
        keep: true,
        timestamp_seconds: clipBundle.timestamp_seconds,
        match_clock: clipBundle.match_clock,
        shot_origin: "", shot_type: "", on_target: "", gk_action: "",
        gk_visible: "", outcome: "", body_distance_zone: "",
        goal_placement_height: "", goal_placement_side: "",
        technique: "", dive_family: "", notes: "",
        gemini: clipBundle,
        _reclassified_from: provenance,
      };
      setSaveRows(rs => sortByTs([...rs, newRow]));
    } else if (targetType === "goal") {
      // Reclassifying TO a goal candidate goes into extraGoals (coach-added),
      // since `candidates` is reserved for AI-detected goal candidates with
      // their original gemini context.
      const tsSecs = clipBundle.timestamp_seconds;
      const mm = Math.floor((tsSecs || 0) / 60);
      const ss = String(Math.floor((tsSecs || 0) % 60)).padStart(2, "0");
      const newRow = {
        _id: `g-reclass-${id}`,
        coach_added: true,
        keep: true,
        scored_by_us: null,
        timestamp_str: `${mm}:${ss}`,
        timestamp_seconds: tsSecs,
        goal_zone: "", shot_origin: "", goal_source: "",
        shot_type: "", gk_positioning: "", goal_rank: "",
        half: null, notes: "",
        clip_storage_path: clipBundle.clip_storage_path,
        clip_url: clipBundle.clip_url,
        _reclassified_from: provenance,
      };
      setExtraGoals(arr => [...arr, newRow]);
    }

    // Remove from the source section
    if (sourceType === "goal") setCandidates(cs => cs.filter(c => c._id !== id));
    else if (sourceType === "save") setSaveRows(rs => rs.filter(r => r._id !== id));
    else if (sourceType === "distribution") setDistRows(rs => rs.filter(r => r._id !== id));
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
    };

    // Phase 2.1 — saves payload. Only kept rows go to shot_events. Coach-added
    // rows convert their MM:SS string into seconds; Gemini-detected rows already
    // have timestamp_seconds.
    const savesPayload = saveRows.filter(r => r.keep).map(r => ({
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
    const distPayload = distRows.filter(r => r.keep).map(r => ({
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
      // v3 focus-card addition (schema 2026-06-01):
      target_zone: r.target_zone || null,
      notes: r.notes || null,
      confidence: r.gemini?.confidence || null,
    }));

    setPublishing(true);
    try {
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
          review_diff: reviewDiff,
          notes: notesFromGemini(job, candidates, extraGoals, saveRows),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Publish failed");
      // Published successfully — clear the draft so it doesn't override on next load.
      try { if (typeof window !== "undefined") window.localStorage.removeItem(draftKey); } catch {}
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
