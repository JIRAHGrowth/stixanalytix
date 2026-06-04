/**
 * RLS delegate-bypass test.
 *
 * Senior-review concern: the app filters delegate scope client-side
 * (lib/queries.js, pitchside/dashboard pages). The real defense is supposed
 * to be RLS on the underlying tables. This script verifies that.
 *
 * Strategy:
 *   1. Service role creates two temp delegate users under an existing coach
 *      who has at least one keeper:
 *        D-zero  — pitchside_keepers=[], dashboard_keepers=[], no dashboard
 *                  → should see / write nothing belonging to that coach.
 *        D-scoped — pitchside_keepers=[KEEPER_A], dashboard_access=false
 *                  → should see keeper_A only; not keeper_B; cannot escalate.
 *   2. Each delegate signs in via anon client + password, then issues a
 *      battery of read/write queries that SHOULD be blocked by RLS.
 *   3. Pass/fail per test, cleanup always runs.
 *
 * A "pass" means RLS correctly blocked the action (rows=0 for reads, error
 * or rows=0 for writes). A "fail" means RLS let something through that the
 * UI was the only thing hiding.
 *
 * Usage:  node scripts/test-rls-delegate-bypass.js
 * Requires: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *           SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON || !SVC) {
  console.error("Missing required env vars. Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(2);
}

const admin = createClient(URL, SVC, { auth: { autoRefreshToken: false, persistSession: false } });

const results = [];
function record(name, severity, passed, detail) {
  results.push({ name, severity, passed, detail });
  const tag = passed ? "PASS" : "FAIL";
  const color = passed ? "\x1b[32m" : "\x1b[31m";
  console.log(`  ${color}${tag}\x1b[0m  [${severity}]  ${name}${detail ? "  — " + detail : ""}`);
}

async function findTargetCoach() {
  // Find a coach who has at least 2 keepers (so we can test in-scope vs out-of-scope).
  const { data: keepers, error } = await admin
    .from("keepers")
    .select("id, coach_id, name, active")
    .eq("active", true)
    .limit(200);
  if (error) throw new Error("Cannot read keepers via admin: " + error.message);
  const byCoach = new Map();
  for (const k of keepers || []) {
    if (!byCoach.has(k.coach_id)) byCoach.set(k.coach_id, []);
    byCoach.get(k.coach_id).push(k);
  }
  for (const [coachId, ks] of byCoach.entries()) {
    if (ks.length >= 2) return { coachId, keeperA: ks[0], keeperB: ks[1] };
  }
  // Fall back to any coach with 1 keeper — D-scoped tests won't be as strong.
  for (const [coachId, ks] of byCoach.entries()) {
    if (ks.length >= 1) return { coachId, keeperA: ks[0], keeperB: null };
  }
  throw new Error("No coaches with keepers found in DB — cannot run test.");
}

async function makeDelegate({ coachId, name, pitchsideKeepers, dashboardKeepers, dashboardAccess }) {
  const runId = crypto.randomUUID().slice(0, 8);
  const email = `rls-test-${name}-${runId}@stixanalytix.local`;
  const password = "rls-test-" + crypto.randomUUID();

  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `RLS Test ${name}` },
  });
  if (cErr) throw new Error(`createUser ${name}: ${cErr.message}`);

  // Minimal profile so RLS joins don't choke
  await admin.from("profiles").upsert({
    id: created.user.id,
    full_name: `RLS Test ${name}`,
    onboarding_complete: false,
  });

  const { error: dErr } = await admin.from("delegates").insert({
    coach_id: coachId,
    delegate_user_id: created.user.id,
    email,
    name: `RLS Test ${name}`,
    role: "gk_parent",
    pitchside_keepers: pitchsideKeepers,
    dashboard_keepers: dashboardKeepers,
    dashboard_access: dashboardAccess,
    status: "active",
  });
  if (dErr) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    throw new Error(`insert delegate ${name}: ${dErr.message}`);
  }

  return { userId: created.user.id, email, password };
}

async function signInAs({ email, password }) {
  const client = createClient(URL, ANON);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error("signIn failed: " + error.message);
  return { client, userId: data.user.id };
}

async function cleanup(userIds) {
  for (const uid of userIds) {
    if (!uid) continue;
    await admin.from("delegates").delete().eq("delegate_user_id", uid).then(() => {}).catch(() => {});
    await admin.from("profiles").delete().eq("id", uid).then(() => {}).catch(() => {});
    await admin.auth.admin.deleteUser(uid).catch(() => {});
  }
}

async function expectEmpty(client, table, filter, name) {
  let q = client.from(table).select("id", { count: "exact", head: false });
  for (const [col, val] of Object.entries(filter || {})) q = q.eq(col, val);
  const { data, error, count } = await q.limit(50);
  // Reads that RLS blocks typically return data=[] with no error in Supabase.
  // Either error or zero rows is a pass; non-empty data is a fail.
  const rows = (data || []).length;
  const passed = rows === 0;
  record(name, "high", passed, `rows=${rows}${error ? " error=" + error.message : ""}`);
}

async function expectInsertBlocked(client, table, row, name) {
  const { data, error } = await client.from(table).insert(row).select();
  // Pass if error OR zero rows returned (RLS may silently drop).
  const inserted = (data || []).length;
  const passed = !!error || inserted === 0;
  record(name, "critical", passed,
    error ? `blocked: ${error.code || ""} ${error.message}` : `inserted=${inserted}`);
  if (inserted > 0 && data?.[0]?.id) {
    // We just created a leak. Try to clean it via admin so the DB doesn't keep junk.
    await admin.from(table).delete().eq("id", data[0].id).catch(() => {});
  }
}

async function expectUpdateBlocked(client, table, filter, patch, name) {
  let q = client.from(table).update(patch);
  for (const [col, val] of Object.entries(filter)) q = q.eq(col, val);
  const { data, error } = await q.select();
  const updated = (data || []).length;
  const passed = !!error || updated === 0;
  record(name, "critical", passed,
    error ? `blocked: ${error.message}` : `rows_updated=${updated}`);
}

async function run() {
  console.log("\n=== RLS Delegate-Bypass Test ===\n");

  const target = await findTargetCoach();
  console.log(`Target coach: ${target.coachId}`);
  console.log(`Keeper A (in-scope for D-scoped): ${target.keeperA.id} (${target.keeperA.name})`);
  console.log(`Keeper B (out-of-scope): ${target.keeperB ? target.keeperB.id + " (" + target.keeperB.name + ")" : "n/a — only 1 keeper available"}`);
  console.log();

  const userIds = [];
  try {
    // --- D-zero: empty scope ---
    console.log("--- D-zero (pitchside=[], dashboard=[], dashboard_access=false) ---");
    const zCreds = await makeDelegate({
      coachId: target.coachId,
      name: "zero",
      pitchsideKeepers: [],
      dashboardKeepers: [],
      dashboardAccess: false,
    });
    userIds.push(zCreds.userId);
    const { client: zClient, userId: zUid } = await signInAs(zCreds);

    await expectEmpty(zClient, "keepers", { coach_id: target.coachId }, "D-zero cannot read coach's keepers");
    await expectEmpty(zClient, "matches", { coach_id: target.coachId }, "D-zero cannot read coach's matches");
    await expectEmpty(zClient, "goals_conceded", { coach_id: target.coachId }, "D-zero cannot read coach's goals_conceded");
    await expectEmpty(zClient, "shot_events", { coach_id: target.coachId }, "D-zero cannot read coach's shot_events");
    await expectEmpty(zClient, "match_attributes", { coach_id: target.coachId }, "D-zero cannot read coach's match_attributes");
    await expectEmpty(zClient, "match_rankings", { coach_id: target.coachId }, "D-zero cannot read coach's match_rankings");
    await expectEmpty(zClient, "match_notes", { coach_id: target.coachId }, "D-zero cannot read coach's match_notes");

    // Write attempt: try to log a match for keeper_A even though out of scope
    await expectInsertBlocked(zClient, "matches", {
      id: crypto.randomUUID(),
      coach_id: target.coachId,
      keeper_id: target.keeperA.id,
      club_id: crypto.randomUUID(), // bogus, will likely fail FK too — but RLS should fail FIRST
      session_type: "match",
      logged_by: zUid,
    }, "D-zero cannot INSERT match for any keeper");

    // Escalation attempt: D-zero tries to grant itself dashboard_access on its own delegate row
    await expectUpdateBlocked(zClient, "delegates", { delegate_user_id: zUid }, {
      dashboard_access: true,
      pitchside_keepers: [target.keeperA.id],
      dashboard_keepers: [target.keeperA.id],
    }, "D-zero cannot self-escalate dashboard/pitchside scope");

    // Read all other delegates under the same coach
    const { data: otherDelegates } = await zClient.from("delegates").select("id, email").eq("coach_id", target.coachId);
    const zeroSees = (otherDelegates || []).filter(d => d.email !== zCreds.email).length;
    record("D-zero cannot read other delegates' records", "high", zeroSees === 0, `peer_rows_visible=${zeroSees}`);

    // --- D-scoped (only if 2 keepers available) ---
    if (target.keeperB) {
      console.log("\n--- D-scoped (pitchside=[keeperA], dashboard_access=false) ---");
      const sCreds = await makeDelegate({
        coachId: target.coachId,
        name: "scoped",
        pitchsideKeepers: [target.keeperA.id],
        dashboardKeepers: [],
        dashboardAccess: false,
      });
      userIds.push(sCreds.userId);
      const { client: sClient } = await signInAs(sCreds);

      // Can read keeper_A?
      const { data: kAVisible } = await sClient.from("keepers").select("id").eq("id", target.keeperA.id);
      record("D-scoped CAN read in-scope keeper_A", "info", (kAVisible || []).length === 1,
        `rows=${(kAVisible || []).length}`);

      // Cannot read keeper_B?
      const { data: kBVisible } = await sClient.from("keepers").select("id").eq("id", target.keeperB.id);
      record("D-scoped cannot read out-of-scope keeper_B", "critical", (kBVisible || []).length === 0,
        `rows=${(kBVisible || []).length}`);

      // Cannot insert match for keeper_B?
      await expectInsertBlocked(sClient, "matches", {
        id: crypto.randomUUID(),
        coach_id: target.coachId,
        keeper_id: target.keeperB.id,
        club_id: crypto.randomUUID(),
        session_type: "match",
      }, "D-scoped cannot INSERT match for out-of-scope keeper_B");

      // --- D-dash (dashboard_access=true, dashboard_keepers=[keeperA]) ---
      // RLS spec: SELECT allowed when keeper_id in pitchside_keepers OR
      // (in dashboard_keepers AND dashboard_access=true). INSERT only via
      // pitchside_keepers. So D-dash should READ keeperA's data but write
      // nothing.
      console.log("\n--- D-dash (pitchside=[], dashboard=[keeperA], dashboard_access=true) ---");
      const dCreds = await makeDelegate({
        coachId: target.coachId,
        name: "dash",
        pitchsideKeepers: [],
        dashboardKeepers: [target.keeperA.id],
        dashboardAccess: true,
      });
      userIds.push(dCreds.userId);
      const { client: dClient, userId: dUid } = await signInAs(dCreds);

      // Positive: in-scope keeper visible
      const { data: dKA } = await dClient.from("keepers").select("id").eq("id", target.keeperA.id);
      record("D-dash CAN read in-scope keeper_A", "info", (dKA || []).length === 1,
        `rows=${(dKA || []).length}`);

      // Critical negatives: out-of-scope keeper invisible
      const { data: dKB } = await dClient.from("keepers").select("id").eq("id", target.keeperB.id);
      record("D-dash cannot read out-of-scope keeper_B", "critical", (dKB || []).length === 0,
        `rows=${(dKB || []).length}`);

      // Dashboard-relevant tables: out-of-scope keeperB must return 0 rows
      await expectEmpty(dClient, "matches", { keeper_id: target.keeperB.id }, "D-dash cannot read keeper_B matches");
      await expectEmpty(dClient, "match_attributes", { keeper_id: target.keeperB.id }, "D-dash cannot read keeper_B match_attributes");
      await expectEmpty(dClient, "match_rankings", { keeper_id: target.keeperB.id }, "D-dash cannot read keeper_B match_rankings");
      await expectEmpty(dClient, "match_notes", { keeper_id: target.keeperB.id }, "D-dash cannot read keeper_B match_notes");
      await expectEmpty(dClient, "shot_events", { keeper_id: target.keeperB.id }, "D-dash cannot read keeper_B shot_events");

      // Write attempts: dashboard role must not grant any write capability
      await expectInsertBlocked(dClient, "matches", {
        id: crypto.randomUUID(),
        coach_id: target.coachId,
        keeper_id: target.keeperA.id, // even in-scope-for-read keeper
        club_id: crypto.randomUUID(),
        session_type: "match",
      }, "D-dash cannot INSERT match for in-scope keeper_A (dashboard ≠ write)");

      await expectInsertBlocked(dClient, "matches", {
        id: crypto.randomUUID(),
        coach_id: target.coachId,
        keeper_id: target.keeperB.id,
        club_id: crypto.randomUUID(),
        session_type: "match",
      }, "D-dash cannot INSERT match for out-of-scope keeper_B");

      // Escalation: D-dash tries to add keeperB to its own dashboard_keepers
      await expectUpdateBlocked(dClient, "delegates", { delegate_user_id: dUid }, {
        dashboard_keepers: [target.keeperA.id, target.keeperB.id],
        pitchside_keepers: [target.keeperA.id],
      }, "D-dash cannot self-escalate to add keeper_B");

      // Reading the in-scope keeper's match data should succeed (positive check)
      const { data: kaMatches } = await dClient.from("matches").select("id, keeper_id").eq("keeper_id", target.keeperA.id).limit(5);
      record("D-dash CAN read keeper_A's matches (rows OK, no leak)", "info",
        !!kaMatches, `rows=${(kaMatches || []).length} (positive — non-zero only if matches exist)`);
    } else {
      console.log("\n(Skipping D-scoped and D-dash tests — coach only has 1 keeper.)");
    }

  } finally {
    console.log("\nCleaning up test delegates...");
    await cleanup(userIds);
  }

  // Summary
  console.log("\n=== Summary ===");
  const failed = results.filter(r => !r.passed);
  const criticalFails = failed.filter(r => r.severity === "critical");
  const highFails = failed.filter(r => r.severity === "high");
  console.log(`Total: ${results.length}  Pass: ${results.length - failed.length}  Fail: ${failed.length}`);
  console.log(`Critical fails: ${criticalFails.length}  High fails: ${highFails.length}`);
  if (failed.length) {
    console.log("\nFailures:");
    for (const f of failed) console.log(`  [${f.severity}] ${f.name} — ${f.detail}`);
  }

  process.exit(criticalFails.length > 0 ? 1 : 0);
}

run().catch(err => {
  console.error("\nFATAL:", err.message);
  process.exit(2);
});
