/**
 * Convert the source GK Encyclopedia .docx → clean markdown → prompts/gk_techniques.md.
 *
 * This is the alternative to scripts/build-gk-encyclopedia.js (which extracts
 * from videos). When we have a structured prose reference like the
 * "Goalkeeper Encyclopedia of Save Technique," importing the doc directly is
 * faster and produces higher-quality reference text than any video extraction.
 *
 * Usage:
 *   node scripts/import-gk-encyclopedia-docx.js "<path-to-.docx>"
 *
 * Output: prompts/gk_techniques.md (overwrites — back up first if you've made
 * manual edits).
 */

const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');

function cleanMarkdown(md) {
  // Mammoth escapes every period, comma, parens, hyphen etc. with a backslash.
  // Strip those to make the output readable. We keep escapes inside actual
  // markdown syntax (e.g. \[ in a literal bracket) by being conservative.
  return md
    // Remove backslash before common punctuation that doesn't need escaping
    .replace(/\\([.,;:!?()'"\-—–])/g, '$1')
    // Remove leading underscores on bold (mammoth uses __ for bold; standardise to **)
    .replace(/__([^_]+)__/g, '**$1**')
    // Collapse 3+ newlines into 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function main() {
  const src = process.argv[2];
  if (!src) {
    console.error('Usage: node scripts/import-gk-encyclopedia-docx.js <path-to-docx>');
    process.exit(1);
  }
  const srcPath = path.resolve(src);
  if (!fs.existsSync(srcPath)) {
    console.error(`File not found: ${srcPath}`);
    process.exit(1);
  }

  console.log(`Reading: ${srcPath}`);
  const result = await mammoth.convertToMarkdown({ path: srcPath });
  const cleaned = cleanMarkdown(result.value);
  console.log(`  raw chars: ${result.value.length}`);
  console.log(`  cleaned chars: ${cleaned.length}`);
  if (result.messages.length) {
    console.log(`  conversion warnings: ${result.messages.length} (first: ${result.messages[0].message})`);
  }

  const outPath = path.join(__dirname, '..', 'prompts', 'gk_techniques.md');

  const header = [
    '# STIX Goalkeeper Technique Reference',
    '',
    `_Imported from: ${path.basename(srcPath)}_  `,
    `_Last imported: ${new Date().toISOString()}_  `,
    `_Source: scripts/import-gk-encyclopedia-docx.js — re-run to refresh from the .docx_`,
    '',
    'This file is **reference material the live Gemini pipeline reads at runtime**. When analysing a match, the pipeline includes selected sections of this file as calibration context so the model uses the same technique names and visual indicators a STIX-trained coach would.',
    '',
    'Editing rule: edit the source .docx in OneDrive, then re-run the import script. Hand-edits to this file will be overwritten.',
    '',
    '---',
    '',
  ].join('\n');

  fs.writeFileSync(outPath, header + cleaned + '\n');
  const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`\nWrote ${path.relative(process.cwd(), outPath)} (${sizeKb} KB)`);

  // Quick estimate of token cost for including in every Gemini prompt
  // (~4 chars per token, very rough)
  const tokens = Math.round(cleaned.length / 4);
  console.log(`\nEstimated token count: ~${tokens.toLocaleString()} tokens`);
  console.log(`At Gemini 2.5 Pro ($1.25 per 1M input tokens), this adds ~$${(tokens / 1_000_000 * 1.25).toFixed(4)} per analysis if included verbatim.`);
}

main().catch(e => { console.error(e); process.exit(1); });
