#!/usr/bin/env node
/**
 * Download a match video from Supabase Storage to a local cache so the bench
 * harness can run it through multiple Gemini models without re-downloading.
 *
 * Usage:
 *   node scripts/fetch-bench-video.js --job <video_job_id> \
 *     [--out-dir scripts/.bench-videos] [--force]
 *
 *   node scripts/fetch-bench-video.js --truth <truth.json>   # reads video_job_id from truth file
 *
 * Prints the absolute local path on stdout (so it can be captured by a shell var).
 * Other diagnostics go to stderr.
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function parseArgs(argv) {
  const out = { force: false, outDir: null, job: null, truth: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i], n = argv[i + 1];
    switch (a) {
      case '--job': out.job = n; i++; break;
      case '--truth': out.truth = path.resolve(n); i++; break;
      case '--out-dir': out.outDir = path.resolve(n); i++; break;
      case '--force': out.force = true; break;
      case '--help': case '-h':
        console.error('Usage: --job <id> | --truth <truth.json>  [--out-dir <dir>] [--force]');
        process.exit(0);
    }
  }
  if (!out.job && out.truth) {
    const tj = JSON.parse(fs.readFileSync(out.truth, 'utf8'));
    out.job = tj.video_job_id;
    if (!out.job) {
      console.error(`Truth file ${out.truth} has no video_job_id`);
      process.exit(1);
    }
  }
  if (!out.job) { console.error('Need --job <id> or --truth <truth.json>'); process.exit(1); }
  if (!out.outDir) out.outDir = path.resolve(__dirname, '.bench-videos');
  return out;
}

async function streamToFile(url, dest) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} fetching video`);
  const total = parseInt(r.headers.get('content-length') || '0', 10);
  const fh = fs.createWriteStream(dest);
  let downloaded = 0;
  let lastLogged = 0;
  const reader = r.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fh.write(Buffer.from(value));
    downloaded += value.length;
    if (total && downloaded - lastLogged > 50 * 1024 * 1024) {
      const pct = ((downloaded / total) * 100).toFixed(0);
      process.stderr.write(`\r  downloaded ${(downloaded / 1024 / 1024).toFixed(0)} / ${(total / 1024 / 1024).toFixed(0)} MB (${pct}%)`);
      lastLogged = downloaded;
    }
  }
  await new Promise((resolve, reject) => fh.end(err => err ? reject(err) : resolve()));
  process.stderr.write('\n');
}

async function main() {
  const opts = parseArgs(process.argv);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Supabase env vars missing'); process.exit(1); }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.error(`Looking up job ${opts.job}...`);
  const { data: job, error } = await supabase
    .from('video_jobs')
    .select('id, storage_path, video_url, match_metadata')
    .eq('id', opts.job)
    .single();
  if (error || !job) { console.error(`Job lookup failed: ${error?.message || 'not found'}`); process.exit(1); }

  fs.mkdirSync(opts.outDir, { recursive: true });
  const dest = path.join(opts.outDir, `${opts.job}.mp4`);
  if (fs.existsSync(dest) && !opts.force) {
    console.error(`Cached: ${path.relative(process.cwd(), dest)} (use --force to re-download)`);
    process.stdout.write(dest + '\n');
    return;
  }

  let downloadUrl = job.video_url;
  if (job.storage_path) {
    console.error(`Signing storage_path: ${job.storage_path}`);
    const { data: signed, error: sErr } = await supabase
      .storage.from('match-videos').createSignedUrl(job.storage_path, 7200);
    if (sErr) { console.error(`Signing failed: ${sErr.message}`); process.exit(1); }
    downloadUrl = signed.signedUrl;
  } else if (!downloadUrl) {
    console.error(`Job ${opts.job} has no storage_path and no video_url`); process.exit(1);
  }

  console.error(`Downloading to ${path.relative(process.cwd(), dest)}...`);
  const tmp = dest + '.partial';
  try {
    await streamToFile(downloadUrl, tmp);
    fs.renameSync(tmp, dest);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    console.error(`Download failed: ${e.message}`);
    process.exit(1);
  }
  const mb = (fs.statSync(dest).size / 1024 / 1024).toFixed(0);
  console.error(`Done. ${mb} MB at ${path.relative(process.cwd(), dest)}`);
  process.stdout.write(dest + '\n');
}

main().catch(e => { console.error(e); process.exit(1); });
