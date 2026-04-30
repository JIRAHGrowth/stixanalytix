/**
 * Build the STIX GK Technique Encyclopedia from local reference videos.
 *
 * Workflow (offline, run once per batch of new videos):
 *   1. You drop T1TAN (or other coaching) MP4s into a folder.
 *   2. This script uploads each to Gemini, runs the extraction prompt,
 *      saves the per-video JSON to `prompts/gk_techniques/raw/<filename>.json`.
 *   3. After all videos process, an aggregate is written to
 *      `prompts/gk_techniques.md` — that's the file the live pipeline reads
 *      as reference context.
 *
 * The aggregate step is intentionally separate so you can review individual
 * extractions before they roll into the encyclopedia.
 *
 * Usage:
 *   node scripts/build-gk-encyclopedia.js <folder-of-mp4s> [--model gemini-2.5-pro|gemini-2.5-flash] [--limit 1]
 *
 * Defaults to gemini-2.5-flash for cheap iteration. Use --model gemini-2.5-pro
 * for the final pass once the prompt is proven.
 *
 * Cost estimate: Flash ≈ $0.50–2 per video, Pro ≈ $2–5 per video.
 *
 * Idempotent: skips videos whose extraction JSON already exists. Delete a JSON
 * to force re-extraction of that video.
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[key] = val;
    } else {
      out._.push(a);
    }
  }
  return out;
}

async function extractFromVideo(videoPath, model, promptText) {
  // Lazy import — Python script does the actual work since the Node SDK chokes
  // on big resumable uploads. We reuse the same pattern as scripts/run-gemini-match.py.
  // Here, we shell out to a small Python helper to keep one upload mechanism.
  // For simplicity, do the whole thing in JS using the @google/generative-ai
  // package. Videos are short (coaching clips), so single-POST upload should
  // work — typical T1TAN clip is 50-300 MB.
  const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
  const { GoogleAIFileManager, FileState } = require('@google/generative-ai/server');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');

  const fileSizeMb = (fs.statSync(videoPath).size / 1024 / 1024).toFixed(1);
  console.log(`  uploading (${fileSizeMb} MB)...`);
  const fileManager = new GoogleAIFileManager(apiKey);
  const uploadStart = Date.now();
  const upload = await fileManager.uploadFile(videoPath, {
    mimeType: 'video/mp4',
    displayName: path.basename(videoPath),
  });
  console.log(`  uploaded in ${((Date.now() - uploadStart) / 1000).toFixed(0)}s`);

  let file = await fileManager.getFile(upload.file.name);
  while (file.state === FileState.PROCESSING) {
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 5000));
    file = await fileManager.getFile(upload.file.name);
  }
  if (file.state !== FileState.ACTIVE) {
    throw new Error(`Gemini file ended in state ${file.state}`);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const m = genAI.getGenerativeModel({
    model,
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });
  console.log(`  asking ${model}...`);
  const filenameNote = `\n\nThe video filename is "${path.basename(videoPath)}" — use this as source.video_filename in your output.`;
  const result = await m.generateContent([
    { fileData: { mimeType: 'video/mp4', fileUri: file.uri } },
    { text: promptText + filenameNote },
  ]);
  const text = result.response.text();
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (e) {
    return { _raw: text, _parse_error: e.message };
  }
  parsed._meta = {
    model,
    usage: result.response.usageMetadata,
    extracted_at: new Date().toISOString(),
  };
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv);
  const folder = args._[0];
  if (!folder) {
    console.error('Usage: node scripts/build-gk-encyclopedia.js <folder-of-mp4s> [--model gemini-2.5-flash|pro] [--limit N]');
    process.exit(1);
  }
  const folderPath = path.resolve(folder);
  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    console.error(`Not a directory: ${folderPath}`);
    process.exit(1);
  }

  const model = args.model || 'gemini-2.5-flash';
  const limit = args.limit ? parseInt(args.limit, 10) : Infinity;

  const promptPath = path.join(__dirname, '..', 'prompts', 'gk_techniques_extraction.md');
  const promptText = fs.readFileSync(promptPath, 'utf8');

  const rawDir = path.join(__dirname, '..', 'prompts', 'gk_techniques', 'raw');
  fs.mkdirSync(rawDir, { recursive: true });

  const videos = fs.readdirSync(folderPath)
    .filter(f => /\.(mp4|mov|webm|mkv)$/i.test(f))
    .sort();
  console.log(`Found ${videos.length} video(s) in ${folderPath}`);
  if (!videos.length) return;

  let processed = 0, skipped = 0, failed = 0;
  for (const v of videos) {
    if (processed + skipped >= limit) break;
    const outPath = path.join(rawDir, v.replace(/\.[^.]+$/, '.json'));
    if (fs.existsSync(outPath)) {
      console.log(`[skip] ${v} — extraction already exists`);
      skipped++;
      continue;
    }
    console.log(`[${processed + 1}] ${v}`);
    try {
      const result = await extractFromVideo(path.join(folderPath, v), model, promptText);
      fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
      console.log(`  saved ${path.relative(process.cwd(), outPath)}`);
      processed++;
    } catch (e) {
      console.error(`  FAILED: ${e.message || e}`);
      failed++;
    }
  }

  console.log(`\nDone. processed=${processed} skipped=${skipped} failed=${failed}`);
  console.log(`\nNext: review the JSON in ${path.relative(process.cwd(), rawDir)},`);
  console.log(`then run: node scripts/aggregate-gk-encyclopedia.js  (still to be built)`);
}

main().catch(e => {
  console.error('Fatal:', e.message || e);
  process.exit(1);
});
