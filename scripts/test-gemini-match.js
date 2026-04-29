require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const { GoogleAIFileManager, FileState } = require('@google/generative-ai/server');

// Resolve test videos from STIXANALYTIX_DATA_ROOT (set in .env.local).
// Match Library lives at [STIXANALYTIX_DATA_ROOT]/05 - Match Library/Raw Recordings/[Year]/.
const DATA_ROOT = process.env.STIXANALYTIX_DATA_ROOT;
if (!DATA_ROOT) {
  console.error('STIXANALYTIX_DATA_ROOT is not set. Configure it in .env.local — see .env.example.');
  process.exit(1);
}
const MATCH_2024 = path.join(DATA_ROOT, '05 - Match Library', 'Raw Recordings', '2024');
const VIDEOS = {
  half1: path.join(MATCH_2024, 'american_vs_virginia_2024_half1_small.mp4'),
  half2: path.join(MATCH_2024, 'american_vs_virginia_2024_half2_small.mp4'),
  wylie1: path.join(MATCH_2024, 'wylie_vs_cooper_2024_half1.mp4'),
  wylie2: path.join(MATCH_2024, 'wylie_vs_cooper_2024_half2.mp4'),
};

const arg = process.argv[2];
if (!arg) {
  console.error(`Usage: node scripts/test-gemini-match.js <${Object.keys(VIDEOS).join('|')}|absolute/path/to/video.mp4>`);
  process.exit(1);
}
let VIDEO_PATH;
let key;
if (VIDEOS[arg]) {
  key = arg;
  VIDEO_PATH = VIDEOS[arg];
} else if (fs.existsSync(arg)) {
  VIDEO_PATH = path.resolve(arg);
  key = path.basename(VIDEO_PATH, path.extname(VIDEO_PATH));
} else {
  console.error(`Not a known key and not an existing file: ${arg}`);
  console.error(`Known keys: ${Object.keys(VIDEOS).join(', ')}`);
  process.exit(1);
}

// Prompt loaded from prompts/goals.md — single source of truth.
// See prompts/README.md for editing rules.
const PROMPT = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'goals.md'), 'utf8');

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    goals: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          timestamp_seconds: { type: SchemaType.INTEGER },
          match_clock: { type: SchemaType.STRING },
          scoring_team: { type: SchemaType.STRING },
          conceding_team: { type: SchemaType.STRING },
          scoreboard_before: { type: SchemaType.STRING },
          scoreboard_after: { type: SchemaType.STRING },
          attack_type: { type: SchemaType.STRING },
          buildup: { type: SchemaType.STRING },
          shot_type: { type: SchemaType.STRING },
          shot_location: { type: SchemaType.STRING },
          goal_placement_height: { type: SchemaType.STRING },
          goal_placement_side: { type: SchemaType.STRING },
          gk_observations: { type: SchemaType.STRING },
          confidence: { type: SchemaType.STRING },
        },
        required: ['timestamp_seconds', 'match_clock', 'scoring_team', 'conceding_team', 'scoreboard_before', 'scoreboard_after', 'attack_type', 'buildup', 'shot_type', 'shot_location', 'goal_placement_height', 'goal_placement_side', 'gk_observations', 'confidence'],
      },
    },
  },
  required: ['goals'],
};

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY missing');
    process.exit(1);
  }

  const fileSizeGb = (fs.statSync(VIDEO_PATH).size / 1024 / 1024 / 1024).toFixed(2);
  console.log(`Target: ${key} (${fileSizeGb} GB)`);
  console.log('Expect 5-20 min upload + 5-15 min Gemini processing. Be patient.\n');

  const fileManager = new GoogleAIFileManager(apiKey);

  console.log('Uploading to Gemini File API...');
  const uploadStart = Date.now();
  const uploadResult = await fileManager.uploadFile(VIDEO_PATH, {
    mimeType: 'video/mp4',
    displayName: `stix match ${key}`,
  });
  console.log(`Uploaded in ${((Date.now() - uploadStart) / 60000).toFixed(1)} min`);

  console.log('Waiting for Gemini video processing...');
  let file = await fileManager.getFile(uploadResult.file.name);
  const processStart = Date.now();
  while (file.state === FileState.PROCESSING) {
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 15000));
    file = await fileManager.getFile(uploadResult.file.name);
  }
  console.log(`\nProcessed in ${((Date.now() - processStart) / 60000).toFixed(1)} min`);
  if (file.state !== FileState.ACTIVE) {
    throw new Error(`File state: ${file.state}`);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const contents = [
    { fileData: { mimeType: 'video/mp4', fileUri: file.uri } },
    { text: PROMPT },
  ];
  const generationConfig = {
    responseMimeType: 'application/json',
    responseSchema: RESPONSE_SCHEMA,
  };

  const modelsToTry = ['gemini-2.5-pro'];
  const maxAttempts = 3;
  let result = null;
  let lastError = null;
  let modelUsed = null;

  outer: for (const modelName of modelsToTry) {
    const model = genAI.getGenerativeModel({ model: modelName, generationConfig });
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`Asking ${modelName} (attempt ${attempt}/${maxAttempts})...`);
        const genStart = Date.now();
        result = await model.generateContent(contents);
        modelUsed = modelName;
        console.log(`Generated in ${((Date.now() - genStart) / 60000).toFixed(1)} min`);
        break outer;
      } catch (e) {
        lastError = e;
        const msg = e.message || String(e);
        if (msg.includes('404')) {
          console.log(`  ${modelName} unavailable. Next.`);
          break;
        }
        if (msg.includes('429')) {
          console.log(`  Rate limit / quota. Stopping.`);
          throw e;
        }
        if (!msg.includes('503')) throw e;
        const waitMs = attempt * 30000;
        console.log(`  503. Waiting ${waitMs / 1000}s...`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }

  if (!result) throw lastError || new Error('All models failed');

  const text = result.response.text();
  const parsed = JSON.parse(text);

  console.log(`\n=== Results from ${modelUsed} on ${key} ===\n`);
  console.log(`Goals detected: ${parsed.goals.length}`);
  parsed.goals.forEach((g, i) => {
    console.log(`\n  ${i + 1}. video ${fmtTime(g.timestamp_seconds)}  match clock ${g.match_clock}  confidence: ${g.confidence}`);
    console.log(`     ${g.scoring_team} scored vs ${g.conceding_team}`);
    console.log(`     scoreboard: ${g.scoreboard_before} -> ${g.scoreboard_after}`);
    console.log(`     attack_type: ${g.attack_type}`);
    console.log(`     buildup: ${g.buildup}`);
    console.log(`     shot: ${g.shot_type} from ${g.shot_location}`);
    console.log(`     placement: ${g.goal_placement_height} / ${g.goal_placement_side}`);
    console.log(`     GK: ${g.gk_observations}`);
  });

  const usage = result.response.usageMetadata;
  if (usage) {
    console.log(`\nTokens: ${usage.totalTokenCount.toLocaleString()} total (prompt ${usage.promptTokenCount.toLocaleString()}, output ${usage.candidatesTokenCount.toLocaleString()})`);
  }

  const outDir = path.join(__dirname, 'results');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  const outPath = path.join(outDir, `match-${key}-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ modelUsed, key, usage, parsed, rawText: text }, null, 2));
  console.log(`\nFull output saved to ${path.relative(process.cwd(), outPath)}`);
}

main().catch((err) => {
  console.error('\nFailed:', err.message || err);
  process.exit(1);
});
