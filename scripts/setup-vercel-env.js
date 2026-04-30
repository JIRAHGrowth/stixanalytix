/**
 * One-shot: read VERCEL_TOKEN from the current shell, read the Modal trigger
 * URL + secret from .env.local, push them to Vercel as env vars on
 * production/preview/development.
 *
 * Run with the token in your shell, NOT on the command line:
 *   PowerShell: $env:VERCEL_TOKEN="<paste>"; node scripts/setup-vercel-env.js
 *
 * The script never logs the token or the secret values — only their lengths.
 * Idempotent: if a key already exists in Vercel, we update it rather than
 * erroring out.
 */

require('dotenv').config({ path: '.env.local' });

const PROJECT_NAME = 'stixanalytix';
const TARGETS = ['production', 'preview', 'development'];
const VARS_TO_PUSH = ['MODAL_TRIGGER_URL', 'MODAL_TRIGGER_SECRET'];

function die(msg) { console.error('ERROR: ' + msg); process.exit(1); }

async function vercel(method, path, body, token) {
  const url = `https://api.vercel.com${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, ok: res.ok, json };
}

async function findProject(token) {
  // Try personal account first
  let r = await vercel('GET', `/v9/projects/${PROJECT_NAME}`, null, token);
  if (r.ok) return { project: r.json, teamId: null };
  if (r.status !== 404) {
    // Token might be team-scoped; iterate teams.
    if (r.status === 403) {
      // fall through to team enumeration
    } else {
      die(`Project lookup failed (${r.status}): ${JSON.stringify(r.json).slice(0, 300)}`);
    }
  }
  const teams = await vercel('GET', '/v2/teams', null, token);
  if (!teams.ok) die(`Could not list teams (${teams.status}): ${JSON.stringify(teams.json).slice(0, 300)}`);
  for (const team of teams.json.teams || []) {
    const tr = await vercel('GET', `/v9/projects/${PROJECT_NAME}?teamId=${team.id}`, null, token);
    if (tr.ok) return { project: tr.json, teamId: team.id };
  }
  die(`Could not find project "${PROJECT_NAME}" in your account or any team you belong to.`);
}

async function listEnvs(projectId, teamId, token) {
  const q = teamId ? `?teamId=${teamId}` : '';
  const r = await vercel('GET', `/v9/projects/${projectId}/env${q}`, null, token);
  if (!r.ok) die(`List env failed (${r.status}): ${JSON.stringify(r.json).slice(0, 300)}`);
  return r.json.envs || [];
}

async function upsertEnv(projectId, teamId, token, key, value, existing) {
  const tQ = teamId ? `&teamId=${teamId}` : '';
  // Vercel allows multiple env rows per key (one per target). For simplicity
  // we delete any existing rows for this key first, then re-create one row
  // covering all three targets.
  const dupes = existing.filter(e => e.key === key);
  for (const d of dupes) {
    const r = await vercel('DELETE', `/v9/projects/${projectId}/env/${d.id}?` + (teamId ? `teamId=${teamId}` : ''), null, token);
    if (!r.ok && r.status !== 404) {
      die(`Delete existing ${key} (${d.id}) failed (${r.status}): ${JSON.stringify(r.json).slice(0, 300)}`);
    }
  }
  const r = await vercel('POST', `/v10/projects/${projectId}/env?upsert=true${tQ}`, {
    key, value, target: TARGETS, type: 'encrypted',
  }, token);
  if (!r.ok) die(`Add ${key} failed (${r.status}): ${JSON.stringify(r.json).slice(0, 300)}`);
}

async function triggerDeploy(projectId, teamId, token) {
  // Look up the latest production deployment so we can re-deploy the same git ref
  const tQ = teamId ? `&teamId=${teamId}` : '';
  const list = await vercel('GET', `/v6/deployments?projectId=${projectId}&target=production&limit=1${tQ}`, null, token);
  if (!list.ok || !list.json.deployments?.length) {
    console.warn('Could not find a recent production deployment to clone — skipping auto-redeploy. Push a commit or click Redeploy in the dashboard to apply env vars.');
    return null;
  }
  const last = list.json.deployments[0];
  const ref = last.meta?.githubCommitRef || 'main';
  const r = await vercel('POST', `/v13/deployments${teamId ? `?teamId=${teamId}` : ''}`, {
    name: PROJECT_NAME,
    target: 'production',
    gitSource: {
      type: 'github',
      org: last.meta?.githubCommitOrg,
      repo: last.meta?.githubCommitRepo,
      ref,
    },
  }, token);
  if (!r.ok) {
    console.warn(`Auto-redeploy failed (${r.status}): ${JSON.stringify(r.json).slice(0, 200)}`);
    console.warn('Env vars are saved; trigger a redeploy manually in the Vercel dashboard.');
    return null;
  }
  return r.json;
}

async function main() {
  const token = process.env.VERCEL_TOKEN;
  if (!token) die('VERCEL_TOKEN is not set in your shell. Set it with `$env:VERCEL_TOKEN="..."` in PowerShell, then re-run.');

  // Sanity-check the values we're about to push
  for (const k of VARS_TO_PUSH) {
    if (!process.env[k]) die(`${k} missing from .env.local`);
  }
  console.log('Local values:');
  VARS_TO_PUSH.forEach(k => console.log(`  ${k}: length ${process.env[k].length}, prefix "${process.env[k].substring(0, 10)}..."`));

  console.log('\nFinding Vercel project…');
  const { project, teamId } = await findProject(token);
  console.log(`  project: ${project.name} (id ${project.id}${teamId ? `, team ${teamId}` : ', personal'})`);

  const existing = await listEnvs(project.id, teamId, token);
  console.log(`  existing env vars on project: ${existing.length}`);

  for (const k of VARS_TO_PUSH) {
    process.stdout.write(`Pushing ${k}… `);
    await upsertEnv(project.id, teamId, token, k, process.env[k], existing);
    console.log('OK');
  }

  console.log('\nTriggering production redeploy…');
  const dep = await triggerDeploy(project.id, teamId, token);
  if (dep) {
    console.log(`  deployment created: ${dep.url || dep.id}`);
    console.log('  watch: https://vercel.com/' + (teamId ? '<team>' : '<personal>') + `/${PROJECT_NAME}/deployments`);
  }

  console.log('\nDone. Live site will be using the new env vars within ~30s of the deploy completing.');
}

main().catch(e => { console.error(e); process.exit(1); });
