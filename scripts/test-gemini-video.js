require('dotenv').config({ path: '.env.local' });
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager, FileState } = require('@google/generative-ai/server');

const VIDEO_PATH = 'C:\\Users\\joshu\\OneDrive\\Pictures\\Samsung Gallery\\DCIM\\Camera\\20260326_160354.mp4';

const PROMPT = `Describe what you see in this video in 3-4 sentences.
Focus on:
- What is happening overall
- Any people or movement you can identify
- Any sports-related activity if present
Keep it plain-English, no markdown.`;

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY is missing in .env.local');
    process.exit(1);
  }

  const fileManager = new GoogleAIFileManager(apiKey);

  console.log('Uploading video to Gemini... (this can take 30-60 seconds)');
  const uploadStart = Date.now();
  const uploadResult = await fileManager.uploadFile(VIDEO_PATH, {
    mimeType: 'video/mp4',
    displayName: 'stix test clip',
  });
  console.log(`Upload complete in ${((Date.now() - uploadStart) / 1000).toFixed(1)}s`);
  console.log(`File URI: ${uploadResult.file.uri}`);

  console.log('\nWaiting for Gemini to process the video...');
  let file = await fileManager.getFile(uploadResult.file.name);
  while (file.state === FileState.PROCESSING) {
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 5000));
    file = await fileManager.getFile(uploadResult.file.name);
  }
  console.log('');

  if (file.state !== FileState.ACTIVE) {
    throw new Error(`File did not reach ACTIVE state. Current state: ${file.state}`);
  }
  console.log('Video is ready. Asking Gemini what it sees...\n');

  const genAI = new GoogleGenerativeAI(apiKey);
  const contents = [
    { fileData: { mimeType: 'video/mp4', fileUri: file.uri } },
    { text: PROMPT },
  ];

  const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-pro'];
  const maxAttemptsPerModel = 3;
  const callStart = Date.now();
  let result = null;
  let lastError = null;

  outer: for (const modelName of modelsToTry) {
    const model = genAI.getGenerativeModel({ model: modelName });
    for (let attempt = 1; attempt <= maxAttemptsPerModel; attempt++) {
      try {
        console.log(`Trying ${modelName} (attempt ${attempt}/${maxAttemptsPerModel})...`);
        result = await model.generateContent(contents);
        console.log(`Got response from ${modelName}`);
        break outer;
      } catch (e) {
        lastError = e;
        const msg = e.message || String(e);
        const is503 = msg.includes('503');
        const is404 = msg.includes('404');
        if (is404) {
          console.log(`  ${modelName} not available. Trying next model.`);
          break;
        }
        if (!is503) throw e;
        const waitMs = attempt * 15000;
        console.log(`  503 from ${modelName}. Waiting ${waitMs / 1000}s before retry...`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }

  if (!result) throw lastError || new Error('All models failed');
  const callSeconds = ((Date.now() - callStart) / 1000).toFixed(1);

  console.log('--- Gemini response ---');
  console.log(result.response.text());
  console.log('--- End response ---\n');

  const usage = result.response.usageMetadata;
  if (usage) {
    console.log(`Tokens used: ${usage.totalTokenCount} (prompt: ${usage.promptTokenCount}, output: ${usage.candidatesTokenCount})`);
  }
  console.log(`Generation time: ${callSeconds}s`);
  console.log('\nSuccess. Gemini can see your video.');
}

main().catch((err) => {
  console.error('\nSomething went wrong:');
  console.error(err.message || err);
  process.exit(1);
});
