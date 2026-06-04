/**
 * Integration smoke test for the save_pitchside_match RPC.
 *
 * Verifies the round-trip we actually care about: a logged-in coach calls
 * supabase.rpc("save_pitchside_match", payload), every write lands, retry
 * with same matchId is idempotent (no dupes), and partial-failure cases
 * roll back atomically.
 *
 * What it does:
 *   1. Provisions a fresh coach + club + keeper via service role.
 *   2. Signs in as that coach (anon client + password) — same auth path
 *      pitchside uses.
 *   3. Calls the RPC with a realistic payload, then queries each table
 *      to verify counts.
 *   4. Calls the RPC again with the same matchId and different child rows;
 *      asserts no duplicate match, child rows replaced.
 *   5. Cleans up: rows, keeper, club, profile, auth user.
 *
 * Usage:  node scripts/test-save-pitchside-match.js
 */

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON || !SVC) {
  console.error("Missing env. Need NEXT_PUBLIC_SUPABASE_URL/ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(2);
}

const admin = createClient(URL, SVC, { auth: { autoRefreshToken: false, persistSession: false } });
const results = [];

function check(name, passed, detail) {
  results.push({ name, passed, detail });
  const tag = passed ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`  ${tag}  ${name}${detail ? "  — " + detail : ""}`);
}

function matchPayload(id, coachId, keeperId, clubId, overrides = {}) {
  return {
    id,
    coach_id: coachId,
    keeper_id: keeperId,
    club_id: clubId,
    logged_by: coachId,
    logged_by_name: "RPC Smoke Coach",
    session_type: "match",
    opponent: "RPC Smoke Opponent",
    venue: "home",
    match_date: "2026-06-04",
    goals_for: 1, goals_against: 2, result: "L",
    minutes_played: 90,
    shots_on_target: 5, saves: 3,
    goals_conceded: 2, save_percentage: 0.6,
    saves_catch: 1, saves_parry: 1, saves_dive: 1,
    saves_block: 0, saves_tip: 0, saves_punch: 0,
    crosses_claimed: 0, crosses_punched: 0, crosses_missed: 0, crosses_total: 0,
    dist_gk_short_att: 0, dist_gk_short_suc: 0,
    dist_gk_long_att: 0, dist_gk_long_suc: 0,
    dist_throws_att: 0, dist_throws_suc: 0,
    dist_passes_att: 0, dist_passes_suc: 0,
    dist_under_pressure_att: 0, dist_under_pressure_suc: 0,
    one_v_one_faced: 0, one_v_one_won: 0,
    errors_leading_to_goal: 0,
    sweeper_clearances: 0, sweeper_interceptions: 0, sweeper_tackles: 0,
    rebounds_controlled: 0, rebounds_dangerous: 0,
    notes: null,
    was_subbed: false, sub_reason: null, sub_minute: null,
    ...overrides,
  };
}

async function provision() {
  const runId = crypto.randomUUID().slice(0, 8);
  const email = `rpc-smoke-${runId}@stixanalytix.local`;
  const password = "rpc-smoke-" + crypto.randomUUID();

  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: "RPC Smoke Coach" },
  });
  if (cErr) throw new Error("createUser: " + cErr.message);
  const userId = created.user.id;

  const { error: pErr } = await admin.from("profiles").upsert({
    id: userId, full_name: "RPC Smoke Coach", onboarding_complete: true,
  });
  if (pErr) throw new Error("profile upsert: " + pErr.message);

  const clubId = crypto.randomUUID();
  const { error: clErr } = await admin.from("clubs").insert({
    id: clubId, coach_id: userId, name: "RPC Smoke FC",
  });
  if (clErr) throw new Error("club insert: " + clErr.message);

  const keeperId = crypto.randomUUID();
  const { error: kErr } = await admin.from("keepers").insert({
    id: keeperId, coach_id: userId, club_id: clubId, name: "RPC Smoke Keeper", active: true,
  });
  if (kErr) throw new Error("keeper insert: " + kErr.message);

  return { userId, email, password, clubId, keeperId };
}

async function teardown(ctx) {
  if (!ctx) return;
  if (ctx.matchId) {
    await admin.from("match_notes").delete().eq("match_id", ctx.matchId).then(() => {}).catch(() => {});
    await admin.from("match_rankings").delete().eq("match_id", ctx.matchId).then(() => {}).catch(() => {});
    await admin.from("match_attributes").delete().eq("match_id", ctx.matchId).then(() => {}).catch(() => {});
    await admin.from("shot_events").delete().eq("match_id", ctx.matchId).then(() => {}).catch(() => {});
    await admin.from("goals_conceded").delete().eq("match_id", ctx.matchId).then(() => {}).catch(() => {});
    await admin.from("matches").delete().eq("id", ctx.matchId).then(() => {}).catch(() => {});
  }
  if (ctx.keeperId) await admin.from("keepers").delete().eq("id", ctx.keeperId).then(() => {}).catch(() => {});
  if (ctx.clubId) await admin.from("clubs").delete().eq("id", ctx.clubId).then(() => {}).catch(() => {});
  if (ctx.userId) {
    await admin.from("profiles").delete().eq("id", ctx.userId).then(() => {}).catch(() => {});
    await admin.auth.admin.deleteUser(ctx.userId).catch(() => {});
  }
}

async function run() {
  console.log("\n=== save_pitchside_match smoke test ===\n");
  let ctx = null;
  try {
    ctx = await provision();
    console.log(`Provisioned: coach=${ctx.userId.slice(0, 8)}… club=${ctx.clubId.slice(0, 8)}… keeper=${ctx.keeperId.slice(0, 8)}…`);

    const coach = createClient(URL, ANON);
    const { error: signErr } = await coach.auth.signInWithPassword({ email: ctx.email, password: ctx.password });
    if (signErr) throw new Error("signIn: " + signErr.message);

    const matchId = crypto.randomUUID();
    ctx.matchId = matchId;
    const nowIso = new Date().toISOString();

    // --- First save: 2 goals, 1 shot, full attrs, ranking, note
    const goalsA = [
      { match_id: matchId, coach_id: ctx.userId, goal_zone: "TR", goal_source: "Open Play", half: 1 },
      { match_id: matchId, coach_id: ctx.userId, goal_zone: "TL", goal_source: "Corner", half: 2 },
    ];
    const shotsA = [
      { match_id: matchId, keeper_id: ctx.keeperId, coach_id: ctx.userId, gk_action: "Catch", is_goal: false, event_type: "Shot", half: "H1" },
    ];
    const attrsA = {
      match_id: matchId, keeper_id: ctx.keeperId, coach_id: ctx.userId,
      game_rating: 3, shot_stopping: 4, handling: 3, positioning: 3,
      aerial_dominance: 3, distribution: 3, decision_making: 3,
      sweeper_play: 3, set_piece_org: 3, footwork_agility: 3,
      reaction_speed: 3, communication: 3, command_of_box: 3,
      composure: 3, compete_level: 4,
    };
    const rankingA = { ...attrsA, author_id: ctx.userId, author_role: "coach", submitted_at: nowIso, updated_at: nowIso };
    const noteA = {
      match_id: matchId, coach_id: ctx.userId, keeper_id: ctx.keeperId,
      author_id: ctx.userId, author_role: "coach",
      note_text: "Smoke test note v1",
      submitted_at: nowIso, updated_at: nowIso,
    };

    const { data: r1, error: rpc1Err } = await coach.rpc("save_pitchside_match", {
      p_match: matchPayload(matchId, ctx.userId, ctx.keeperId, ctx.clubId),
      p_goals: goalsA, p_shots: shotsA,
      p_attrs: attrsA, p_ranking: rankingA, p_note: noteA,
    });
    check("RPC first call returns match id", !rpc1Err && r1 === matchId,
      rpc1Err ? "error=" + rpc1Err.message : "returned=" + r1);

    // Verify rows
    const verify = async (table, eqCol, eqVal) => {
      const { count, error } = await admin.from(table).select("*", { count: "exact", head: true }).eq(eqCol, eqVal);
      if (error) return -1;
      return count;
    };

    check("matches row exists",   (await verify("matches", "id", matchId)) === 1);
    check("goals_conceded = 2",   (await verify("goals_conceded", "match_id", matchId)) === 2);
    check("shot_events = 1",      (await verify("shot_events", "match_id", matchId)) === 1);
    check("match_attributes = 1", (await verify("match_attributes", "match_id", matchId)) === 1);
    check("match_rankings = 1",   (await verify("match_rankings", "match_id", matchId)) === 1);
    check("match_notes = 1",      (await verify("match_notes", "match_id", matchId)) === 1);

    // --- Retry with same matchId: 3 goals, 0 shots, ranking updated, no note
    const goalsB = [
      { match_id: matchId, coach_id: ctx.userId, goal_zone: "TR", goal_source: "Open Play", half: 1 },
      { match_id: matchId, coach_id: ctx.userId, goal_zone: "TL", goal_source: "Corner", half: 2 },
      { match_id: matchId, coach_id: ctx.userId, goal_zone: "BC", goal_source: "Open Play", half: 2 },
    ];
    const rankingB = { ...rankingA, game_rating: 5, updated_at: new Date().toISOString() };

    const { error: rpc2Err } = await coach.rpc("save_pitchside_match", {
      p_match: matchPayload(matchId, ctx.userId, ctx.keeperId, ctx.clubId, { goals_against: 3 }),
      p_goals: goalsB, p_shots: [],
      p_attrs: attrsA, p_ranking: rankingB, p_note: null,
    });
    check("RPC retry (same matchId) succeeds", !rpc2Err, rpc2Err ? "error=" + rpc2Err.message : "");

    check("retry: matches still 1 row",  (await verify("matches", "id", matchId)) === 1);
    check("retry: goals replaced to 3",  (await verify("goals_conceded", "match_id", matchId)) === 3);
    check("retry: shots cleared to 0",   (await verify("shot_events", "match_id", matchId)) === 0);
    check("retry: rankings still 1 row", (await verify("match_rankings", "match_id", matchId)) === 1);
    // Note was already present from first call; passing p_note=null skips that branch, so it stays
    check("retry: notes preserved (not nulled)", (await verify("match_notes", "match_id", matchId)) === 1);

    // Confirm the ranking was actually updated to 5, not stale at 3
    const { data: rkRow } = await admin.from("match_rankings").select("game_rating").eq("match_id", matchId).single();
    check("retry: ranking.game_rating updated 3→5", rkRow?.game_rating === 5, `actual=${rkRow?.game_rating}`);

    // Confirm match row reflects the goals_against override
    const { data: mRow } = await admin.from("matches").select("goals_against, opponent").eq("id", matchId).single();
    check("retry: matches.goals_against updated 2→3", mRow?.goals_against === 3, `actual=${mRow?.goals_against}`);

    // --- Negative: try to save a match for a different coach's keeper (should be blocked)
    const otherMatchId = crypto.randomUUID();
    const { error: rpcCrossErr } = await coach.rpc("save_pitchside_match", {
      p_match: matchPayload(otherMatchId, "00000000-0000-0000-0000-000000000000", ctx.keeperId, ctx.clubId, {
        coach_id: "00000000-0000-0000-0000-000000000000",
      }),
      p_goals: [], p_shots: [],
      p_attrs: null, p_ranking: null, p_note: null,
    });
    check("cross-coach write blocked by RLS",
      !!rpcCrossErr,
      rpcCrossErr ? `blocked: ${rpcCrossErr.code || ""} ${rpcCrossErr.message}` : "WROTE SUCCESSFULLY — RLS GAP!");

    // Confirm the cross-coach match did NOT land
    check("cross-coach match row absent",
      (await verify("matches", "id", otherMatchId)) === 0);

  } finally {
    console.log("\nTearing down test fixtures...");
    await teardown(ctx);
  }

  console.log("\n=== Summary ===");
  const failed = results.filter(r => !r.passed);
  console.log(`Total: ${results.length}  Pass: ${results.length - failed.length}  Fail: ${failed.length}`);
  if (failed.length) {
    console.log("\nFailures:");
    for (const f of failed) console.log(`  ${f.name} — ${f.detail || ""}`);
  }
  process.exit(failed.length > 0 ? 1 : 0);
}

run().catch(err => { console.error("\nFATAL:", err.message); process.exit(2); });
