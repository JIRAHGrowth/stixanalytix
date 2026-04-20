require('dotenv').config({ path: '.env.local' });
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'PASTE_YOUR_KEY_HERE') {
    console.error('GEMINI_API_KEY is missing or still a placeholder in .env.local');
    process.exit(1);
  }

  console.log('Key loaded. Calling Gemini...');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const result = await model.generateContent(
    'Say hello in one short sentence and tell me you are Gemini.'
  );

  console.log('\nGemini responded:');
  console.log(result.response.text());
  console.log('\nSuccess. Your API key works.');
}

main().catch((err) => {
  console.error('\nSomething went wrong:');
  console.error(err.message || err);
  process.exit(1);
});
