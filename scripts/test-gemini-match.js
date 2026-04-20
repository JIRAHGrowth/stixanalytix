require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const { GoogleAIFileManager, FileState } = require('@google/generative-ai/server');

const HALVES = {
  half1: 'C:\\Users\\joshu\\Downloads\\american_vs_virginia_2024_half1_small.mp4',
  half2: 'C:\\Users\\joshu\\Downloads\\american_vs_virginia_2024_half2_small.mp4',
};

const half = process.argv[2];
if (!half || !HALVES[half]) {
  console.error('Usage: node scripts/test-gemini-match.js half1|half2');
  process.exit(1);
}
const VIDEO_PATH = HALVES[half];

const PROMPT = `You are analysing video of a live soccer match recorded from a TV broadcast. Your only job right now is to find goals.

CRITICAL — this is a TV broadcast, not raw stadium footage:
- It contains REPLAYS (tighter zoom, slower motion, different camera angle, sometimes split-screen).
  Replays show events that already happened. They are NOT new goals.
- It shows a PERSISTENT SCOREBOARD with the current score. A goal only counts if the scoreboard
  number for one team increases after the event. Use the scoreboard as ground truth.
- If you see what looks like a goal but the scoreboard does not change, it is a replay, a disallowed
  goal (offside/foul), or not a goal at all — do NOT include it.

Definition of a goal: the ball fully crosses the goal line between the posts and under the crossbar
AND the scoreboard updates to reflect this.

For each confirmed goal, report:
- timestamp_seconds: integer seconds from the start of THIS video, at the moment the ball crosses the line (not the replay timestamp)
- scoring_team: describe the scoring team by jersey colour (e.g. "white jerseys", "dark navy jerseys")
- conceding_team: describe the goalkeeper's team by jersey colour
- shot_description: one short sentence (max 20 words): shot type, approximate distance, where it entered the net
- scoreboard_before: the scoreline shown on screen just before the goal (e.g. "0-0" or "1-2")
- scoreboard_after: the scoreline shown on screen just after the goal (should differ from before by exactly one)
- confidence: "high", "medium", or "low"

Rules:
- Do not include replays, disallowed goals, or near-misses.
- Count each goal exactly once (based on the scoreboard increment), using the LIVE timestamp, not the replay timestamp.
- If you cannot verify a goal against the scoreboard, do not include it.

Return an empty list if you see no verified goals.`;

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    goals: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          timestamp_seconds: { type: SchemaType.INTEGER },
          scoring_team: { type: SchemaType.STRING },
          conceding_team: { type: SchemaType.STRING },
          shot_description: { type: SchemaType.STRING },
          scoreboard_before: { type: SchemaType.STRING },
          scoreboard_after: { type: SchemaType.STRING },
          confidence: { type: SchemaType.STRING },
        },
        required: ['timestamp_seconds', 'scoring_team', 'conceding_team', 'shot_description', 'scoreboard_before', 'scoreboard_after', 'confidence'],
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
  console.log(`Target: ${half} (${fileSizeGb} GB)`);
  console.log('Expect 5-20 min upload + 5-15 min Gemini processing. Be patient.\n');

  const fileManager = new GoogleAIFileManager(apiKey);

  console.log('Uploading to Gemini File API...');
  const uploadStart = Date.now();
  const uploadResult = await fileManager.uploadFile(VIDEO_PATH, {
    mimeType: 'video/mp4',
    displayName: `stix match ${half}`,
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

  const modelsToTry = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'];
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

  console.log(`\n=== Results from ${modelUsed} on ${half} ===\n`);
  console.log(`Goals detected: ${parsed.goals.length}`);
  parsed.goals.forEach((g, i) => {
    console.log(`\n  ${i + 1}. [${fmtTime(g.timestamp_seconds)}] confidence: ${g.confidence}`);
    console.log(`     ${g.scoring_team} scored vs ${g.conceding_team}`);
    console.log(`     scoreboard: ${g.scoreboard_before} -> ${g.scoreboard_after}`);
    console.log(`     ${g.shot_description}`);
  });

  const usage = result.response.usageMetadata;
  if (usage) {
    console.log(`\nTokens: ${usage.totalTokenCount.toLocaleString()} total (prompt ${usage.promptTokenCount.toLocaleString()}, output ${usage.candidatesTokenCount.toLocaleString()})`);
  }

  const outDir = path.join(__dirname, 'results');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  const outPath = path.join(outDir, `match-${half}-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ modelUsed, half, usage, parsed, rawText: text }, null, 2));
  console.log(`\nFull output saved to ${path.relative(process.cwd(), outPath)}`);
}

main().catch((err) => {
  console.error('\nFailed:', err.message || err);
  process.exit(1);
});
