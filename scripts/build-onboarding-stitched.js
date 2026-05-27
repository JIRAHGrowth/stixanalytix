/**
 * Build two stitched onboarding-package documents from the 7 individual docs.
 *
 * Output:
 *   onboarding/branded/onboarding-package-screen.html  →  dark theme (is-screen)
 *   onboarding/branded/onboarding-package-print.html   →  white theme (is-print)
 *
 * Both contain every page from every doc concatenated in reading order
 * (00 → 01 → 02 → 03a → 03b → 04 → 05). Page breaks between sections are
 * handled automatically by the CSS @media print rule.
 *
 * Re-run after any change to the individual branded docs.
 *
 * Usage:
 *   node scripts/build-onboarding-stitched.js
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT   = path.resolve(__dirname, '..');
const BRANDED_DIR = path.join(REPO_ROOT, 'onboarding', 'branded');
const CSS_HREF    = '../_design/template/stixanalytix-doc.css';  // relative from branded/

// Order matches the reading order in the onboarding index.
const DOC_ORDER = [
  '00-index.html',
  '01-mission-and-why.html',
  '02-gk-domain-primer.html',
  '03a-labeling-rubric.html',
  '03b-edge-case-log.html',
  '04-tool-walkthrough.html',
  '05-calibration-process.html',
];

// Files we write (skip when reading inputs).
const OUTPUT_FILES = new Set([
  'onboarding-package-screen.html',
  'onboarding-package-print.html',
]);

const BODY_RE = /<body[^>]*>([\s\S]*?)<\/body>/i;

function extractBody(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const match = html.match(BODY_RE);
  if (!match) {
    throw new Error(`No <body> found in ${path.basename(htmlPath)}`);
  }
  return match[1].trim();
}

function buildShell(theme, bodyContent) {
  const themeClass = theme === 'screen' ? 'is-screen' : 'is-print';
  const themeLabel = theme === 'screen' ? 'Screen · Dark' : 'Print · White';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>StixAnalytix Onboarding Package · ${themeLabel}</title>
<link rel="stylesheet" href="${CSS_HREF}">
<style>
  /* Stitched-document additions — give each doc a small section divider
     for navigation when scrolling. Doesn't affect print. */
  .doc-separator {
    display: none;
  }
  @media screen {
    .doc-separator {
      display: block;
      margin: 0 auto;
      width: 1100px;
      padding: 24px 0;
      text-align: center;
      font-family: 'DM Sans', sans-serif;
      font-size: 9px;
      font-weight: 500;
      letter-spacing: 0.28em;
      text-transform: uppercase;
      color: var(--fg-dim);
    }
  }
</style>
</head>
<body class="${themeClass}">
${bodyContent}
</body>
</html>`;
}

function main() {
  console.log(`Reading 7 docs from ${path.relative(REPO_ROOT, BRANDED_DIR)}/`);

  const bodies = DOC_ORDER.map(filename => {
    const filepath = path.join(BRANDED_DIR, filename);
    if (!fs.existsSync(filepath)) {
      throw new Error(`Missing: ${filename}`);
    }
    const body = extractBody(filepath);
    console.log(`  ✓  ${filename}  (${body.length.toLocaleString()} chars)`);
    return { filename, body };
  });

  // Stitch with a small separator between docs (screen-only — invisible in print).
  const stitched = bodies
    .map((d, i) => {
      const sep = i === 0
        ? ''
        : `\n<div class="doc-separator">— end of ${bodies[i - 1].filename.replace('.html','')} — begin ${d.filename.replace('.html','')} —</div>\n`;
      return sep + d.body;
    })
    .join('\n');

  for (const theme of ['screen', 'print']) {
    const html = buildShell(theme, stitched);
    const outPath = path.join(BRANDED_DIR, `onboarding-package-${theme}.html`);
    fs.writeFileSync(outPath, html, 'utf8');
    const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);
    console.log(`\nWrote ${path.basename(outPath)} (${sizeKB} KB · theme: ${theme})`);
  }

  console.log(`\nDone. Stitched documents written to onboarding/branded/.`);
  console.log(`Next: run scripts/bundle-onboarding-to-onedrive.js to refresh the OneDrive copies.`);
}

// Re-export the output-file set so the bundler can include/exclude.
module.exports = { OUTPUT_FILES };

if (require.main === module) {
  main();
}
