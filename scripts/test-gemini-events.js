require('dotenv').config({ path: '.env.local' });
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const { GoogleAIFileManager, FileState } = require('@google/generative-ai/server');

const VIDEO_PATH = 'C:\\Users\\joshu\\OneDrive\\Pictures\\Samsung Gallery\\DCIM\\Camera\\20260326_160354.mp4';

const PROMPT = `You are analysing a goalkeeper training video.
Return a list of every goalkeeper action you can see, in order.
Only include events you are confident about. Do not invent anything.

For each event, report:
- timestamp_seconds: when the action starts, in seconds from video start (integer)
- event_type: one of "dive_left", "dive_right", "dive_forward", "hurdle_clearance", "cone_footwork", "other"
- description: one short plain-English sentence (max 15 words) describing what happened

If you see nothing that fits these categories, return an empty list.`;

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    events: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          timestamp_seconds: { type: SchemaType.INTEGER },
          event_type: { type: SchemaType.STRING },
          description: { type: SchemaType.STRING },
        },
        required: ['timestamp_seconds', 'event_type', 'description'],
      },
    },
  },
  required: ['events'],
};

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY is missing in .env.local');
    process.exit(1);
  }

  const fileManager = new GoogleAIFileManager(apiKey);

  console.log('Uploading video...');
  const uploadStart = Date.now();
  const uploadResult = await fileManager.uploadFile(VIDEO_PATH, {
    mimeType: 'video/mp4',
    displayName: 'stix event test',
  });
  console.log(`Upload: ${((Date.now() - uploadStart) / 1000).toFixed(1)}s`);

  console.log('Waiting for processing...');
  let file = await fileManager.getFile(uploadResult.file.name);
  while (file.state === FileState.PROCESSING) {
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 5000));
    file = await fileManager.getFile(uploadResult.file.name);
  }
  console.log('');
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

  const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-pro'];
  const maxAttemptsPerModel = 3;
  let result = null;
  let lastError = null;
  let modelUsed = null;

  outer: for (const modelName of modelsToTry) {
    const model = genAI.getGenerativeModel({ model: modelName, generationConfig });
    for (let attempt = 1; attempt <= maxAttemptsPerModel; attempt++) {
      try {
        console.log(`Trying ${modelName} (attempt ${attempt}/${maxAttemptsPerModel})...`);
        result = await model.generateContent(contents);
        modelUsed = modelName;
        break outer;
      } catch (e) {
        lastError = e;
        const msg = e.message || String(e);
        if (msg.includes('404')) {
          console.log(`  ${modelName} not available. Next model.`);
          break;
        }
        if (!msg.includes('503')) throw e;
        const waitMs = attempt * 15000;
        console.log(`  503 from ${modelName}. Waiting ${waitMs / 1000}s...`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }

  if (!result) throw lastError || new Error('All models failed');

  const text = result.response.text();
  console.log(`\n--- Raw response from ${modelUsed} ---`);
  console.log(text);
  console.log('--- End raw ---\n');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    console.error('Response was not valid JSON. That is a problem to fix.');
    process.exit(1);
  }

  console.log(`Parsed ${parsed.events.length} event(s):`);
  parsed.events.forEach((e, i) => {
    console.log(`  ${i + 1}. [${e.timestamp_seconds}s] ${e.event_type} — ${e.description}`);
  });

  const usage = result.response.usageMetadata;
  if (usage) {
    console.log(`\nTokens: ${usage.totalTokenCount} total (prompt ${usage.promptTokenCount}, output ${usage.candidatesTokenCount})`);
  }
}

main().catch((err) => {
  console.error('\nSomething went wrong:');
  console.error(err.message || err);
  process.exit(1);
});
