/**
 * Shared Supabase query functions.
 *
 * Every function takes a Supabase client as its first argument so both
 * browser-side pages ("use client") and API routes can reuse the same logic.
 */

// ── Keepers ──────────────────────────────────────────────────────────────────

/**
 * Fetch active keepers for a coach, with optional delegate scoping.
 *
 * @param {object}  supabase          Supabase client instance
 * @param {string}  coachId           The coach's user ID
 * @param {object}  [opts]
 * @param {string[]} [opts.scopeToIds]  Limit to these keeper IDs (delegate mode)
 * @param {string}  [opts.orderBy]     Column to order by (default "created_at")
 * @returns {Promise<object[]>}       Array of keeper rows
 */
export async function fetchActiveKeepers(supabase, coachId, opts = {}) {
  const { scopeToIds = null, orderBy = "created_at" } = opts;
  let q = supabase
    .from("keepers").select("*")
    .eq("coach_id", coachId).eq("active", true);
  if (scopeToIds && scopeToIds.length > 0) {
    q = q.in("id", scopeToIds);
  }
  q = q.order(orderBy, { ascending: true });
  const { data, error } = await q;
  if (error) console.error("fetchActiveKeepers:", error.message);
  return data || [];
}

/**
 * Fetch a single keeper by ID.
 */
export async function fetchKeeperById(supabase, keeperId) {
  const { data, error } = await supabase
    .from("keepers").select("*")
    .eq("id", keeperId).maybeSingle();
  if (error) console.error("fetchKeeperById:", error.message);
  return data;
}

// ── Dashboard analytics bulk load ────────────────────────────────────────────

/**
 * Fetch the four core tables needed by the dashboard in a single parallel call.
 *
 * Returns { matches, goals, attrs, shotEvents }.
 */
export async function fetchAnalyticsBundle(supabase, coachId) {
  const [matchRes, goalRes, attrRes, shotRes] = await Promise.all([
    supabase.from("matches").select("*").eq("coach_id", coachId)
      .order("match_date", { ascending: true }),
    supabase.from("goals_conceded").select("*").eq("coach_id", coachId),
    supabase.from("match_attributes").select("*").eq("coach_id", coachId),
    supabase.from("shot_events").select("*").eq("coach_id", coachId),
  ]);
  return {
    matches: matchRes.data || [],
    goals: goalRes.data || [],
    attrs: attrRes.data || [],
    shotEvents: shotRes.data || [],
  };
}

/**
 * Fetch notes + rankings submission status for a coach.
 *
 * Returns { notesStatus, rankingsStatus } — each is an object keyed by
 * match_id → { coach: timestamp, keeper: timestamp }.
 */
export async function fetchReviewStatus(supabase, coachId) {
  const [nRes, rRes] = await Promise.all([
    supabase.from("match_notes")
      .select("match_id, author_role, submitted_at").eq("coach_id", coachId),
    supabase.from("match_rankings")
      .select("match_id, author_role, submitted_at").eq("coach_id", coachId),
  ]);
  const notesStatus = {};
  if (nRes.data) nRes.data.forEach(n => {
    if (!notesStatus[n.match_id]) notesStatus[n.match_id] = {};
    notesStatus[n.match_id][n.author_role] = n.submitted_at;
  });
  const rankingsStatus = {};
  if (rRes.data) rRes.data.forEach(r => {
    if (!rankingsStatus[r.match_id]) rankingsStatus[r.match_id] = {};
    rankingsStatus[r.match_id][r.author_role] = r.submitted_at;
  });
  return { notesStatus, rankingsStatus };
}

// ── Match detail ─────────────────────────────────────────────────────────────

/**
 * Fetch a single match by ID.
 */
export async function fetchMatchById(supabase, matchId) {
  const { data, error } = await supabase
    .from("matches").select("*").eq("id", matchId).maybeSingle();
  if (error) console.error("fetchMatchById:", error.message);
  return { data, error };
}

/**
 * Fetch all related data for a match detail view.
 *
 * Returns { goalsConceded, goalsScored, shotEvents, keeper }.
 */
export async function fetchMatchDetailBundle(supabase, matchId, keeperId) {
  const timeOrder = { ascending: true, nullsFirst: false };
  const [gcRes, gsRes, seRes, kRes] = await Promise.all([
    supabase.from("goals_conceded").select("*")
      .eq("match_id", matchId).order("timestamp_seconds", timeOrder),
    supabase.from("goals_scored").select("*")
      .eq("match_id", matchId).order("timestamp_seconds", timeOrder),
    supabase.from("shot_events").select("*")
      .eq("match_id", matchId).order("timestamp_seconds", timeOrder),
    keeperId
      ? supabase.from("keepers").select("*").eq("id", keeperId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    goalsConceded: gcRes.data || [],
    goalsScored: gsRes.data || [],
    shotEvents: seRes.data || [],
    keeper: kRes.data,
  };
}

// ── Match mutations ──────────────────────────────────────────────────────────

/**
 * Delete a match and cascade-delete its goals, attributes, and shot events.
 */
export async function deleteMatchCascade(supabase, matchId) {
  await supabase.from("goals_conceded").delete().eq("match_id", matchId);
  await supabase.from("match_attributes").delete().eq("match_id", matchId);
  await supabase.from("shot_events").delete().eq("match_id", matchId);
  const { error } = await supabase.from("matches").delete().eq("id", matchId);
  if (error) throw error;
}

// ── Notes & Rankings ─────────────────────────────────────────────────────────

/**
 * Fetch full note content for a match + keeper.
 *
 * Returns object keyed by author_role → note row.
 */
export async function fetchNoteContent(supabase, matchId, keeperId) {
  const { data } = await supabase.from("match_notes").select("*")
    .eq("match_id", matchId).eq("keeper_id", keeperId);
  const result = {};
  if (data) data.forEach(n => { result[n.author_role] = n; });
  return result;
}

/**
 * Fetch full ranking content for a match + keeper.
 *
 * Returns object keyed by author_role → ranking row.
 */
export async function fetchRankingContent(supabase, matchId, keeperId) {
  const { data } = await supabase.from("match_rankings").select("*")
    .eq("match_id", matchId).eq("keeper_id", keeperId);
  const result = {};
  if (data) data.forEach(x => { result[x.author_role] = x; });
  return result;
}

// ── Delegates ────────────────────────────────────────────────────────────────

/**
 * Fetch all delegates for a coach.
 */
export async function fetchDelegates(supabase, coachId) {
  const { data, error } = await supabase
    .from("delegates").select("*")
    .eq("coach_id", coachId)
    .order("created_at", { ascending: false });
  if (error) console.error("fetchDelegates:", error.message);
  return data || [];
}
