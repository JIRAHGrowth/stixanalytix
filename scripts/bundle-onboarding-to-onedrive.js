/**
 * Bundle the branded onboarding docs to OneDrive Training Materials.
 *
 * The branded HTML files in onboarding/branded/ reference the canonical CSS
 * at onboarding/_design/template/stixanalytix-doc.css via a relative path.
 * That works inside the repo but breaks if you copy a single HTML elsewhere.
 *
 * This script reads each branded HTML, replaces the <link rel="stylesheet">
 * tag with an inline <style> block containing the full CSS, and writes the
 * self-contained file to OneDrive Training Materials.
 *
 * Repo is source of truth. OneDrive copies are for sharing/distribution.
 * Re-run whenever you update either the CSS or any of the docs.
 *
 * Usage:
 *   node scripts/bundle-onboarding-to-onedrive.js
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT       = path.resolve(__dirname, '..');
const BRANDED_DIR     = path.join(REPO_ROOT, 'onboarding', 'branded');
const CSS_PATH        = path.join(REPO_ROOT, 'onboarding', '_design', 'template', 'stixanalytix-doc.css');
const ONEDRIVE_TARGET = 'C:/Users/joshu/OneDrive/Stixanalytix/04 - Methodology & Templates/Training Materials/Onboarding Package';

const STYLESHEET_LINK_RE = /<link\s+rel="stylesheet"\s+href="[^"]*stixanalytix-doc\.css"\s*\/?>/i;

function bundleOne(htmlPath, css, outDir) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  if (!STYLESHEET_LINK_RE.test(html)) {
    console.warn(`  ⚠  no stylesheet link found in ${path.basename(htmlPath)} — skipping`);
    return null;
  }

  // Replace the <link> with an inline <style> block.
  // The CSS contains @import for Google Fonts — keep that as the first line
  // of the style block so it still loads.
  const inlined = html.replace(
    STYLESHEET_LINK_RE,
    `<style>\n${css}\n</style>`
  );

  const outPath = path.join(outDir, path.basename(htmlPath));
  fs.writeFileSync(outPath, inlined, 'utf8');
  return outPath;
}

function main() {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  console.log(`Read canonical CSS (${css.length} bytes) from ${path.relative(REPO_ROOT, CSS_PATH)}`);

  fs.mkdirSync(ONEDRIVE_TARGET, { recursive: true });
  console.log(`Target: ${ONEDRIVE_TARGET}`);

  const docs = fs.readdirSync(BRANDED_DIR)
    .filter(f => f.endsWith('.html'))
    .sort();

  console.log(`\nBundling ${docs.length} documents:`);
  let count = 0;
  for (const doc of docs) {
    const srcPath = path.join(BRANDED_DIR, doc);
    const outPath = bundleOne(srcPath, css, ONEDRIVE_TARGET);
    if (outPath) {
      const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);
      console.log(`  ✓  ${doc}  →  ${sizeKB} KB`);
      count++;
    }
  }
  console.log(`\nDone. ${count} self-contained HTML files written to OneDrive.`);
  console.log(`These can be emailed, attached, or opened anywhere — no sibling CSS folder needed.`);
}

main();
