// One-off: download a specific clip from Supabase Storage into public/samples/
// Usage: node scripts/download-clip.mjs
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const envRaw = fs.readFileSync('.env.local', 'utf8');
const env = Object.fromEntries(
  envRaw.split(/\r?\n/).filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => {
    const idx = l.indexOf('=');
    return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^"(.*)"$/, '$1')];
  })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(url, key);

const BUCKET = 'match-videos';
const PATH = 'clips/d173e102-f0d7-4259-84c2-afa23550442a/save_043.mp4';
const OUT = 'public/samples/rio-save.mp4';

const { data, error } = await supabase.storage.from(BUCKET).download(PATH);
if (error) {
  console.error('DOWNLOAD_ERROR', error);
  process.exit(1);
}
const buffer = Buffer.from(await data.arrayBuffer());
fs.mkdirSync('public/samples', { recursive: true });
fs.writeFileSync(OUT, buffer);
console.log(`OK ${buffer.length} bytes -> ${OUT}`);
