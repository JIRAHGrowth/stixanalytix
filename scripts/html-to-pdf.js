#!/usr/bin/env node
/**
 * Render an HTML file to a single-page PDF at the design's natural
 * dimensions. Chrome's command-line --print-to-pdf forces Letter size
 * and ignores CSS @page rules. The DevTools Protocol via puppeteer-core
 * exposes the printToPDF method with arbitrary width/height, which is
 * what we actually want for branded one-pagers like the BC Soccer brief.
 *
 * Usage: node scripts/html-to-pdf.js <input.html> <output.pdf> [widthPx] [heightPx]
 * Defaults: 1100 × 1400 px (matches the stixanalytix-doc.css .page block).
 */

const path = require("path");
const fs = require("fs");
const puppeteer = require("puppeteer-core");

const [inputArg, outputArg, widthArg, heightArg] = process.argv.slice(2);
if (!inputArg || !outputArg) {
  console.error("Usage: node scripts/html-to-pdf.js <input.html> <output.pdf> [widthPx] [heightPx]");
  process.exit(1);
}

const inputPath = path.resolve(inputArg);
const outputPath = path.resolve(outputArg);
const widthPx = parseInt(widthArg || "1100", 10);
const heightPx = parseInt(heightArg || "1400", 10);

if (!fs.existsSync(inputPath)) {
  console.error(`Input not found: ${inputPath}`);
  process.exit(1);
}

// Locate Chrome — prefer Edge-managed Chrome on Windows, fall back to
// a typical install path. puppeteer-core needs an explicit binary.
const candidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = candidates.find(p => fs.existsSync(p));
if (!executablePath) {
  console.error("Could not find Chrome or Edge — install one and retry.");
  process.exit(1);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath,
    headless: "new",
    args: ["--disable-gpu", "--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: widthPx, height: heightPx, deviceScaleFactor: 2 });
    const url = "file:///" + inputPath.replace(/\\/g, "/");
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
    // Use screen media — the master CSS's @media print block forces
    // size: letter on @page, which conflicts with our custom dimensions.
    await page.emulateMediaType("screen");

    // Measure the actual rendered height of the .page element so the PDF
    // is one page at exact content size. If unspecified on CLI, we let the
    // measurement drive the height. If a heightArg was passed, we honor it.
    // Measure several candidate heights so we can diagnose pagination.
    const measured = await page.evaluate(() => {
      const pageEl = document.querySelector(".page");
      const innerEl = document.querySelector(".inner");
      const mainEl = document.querySelector(".main");
      const pageH = pageEl ? pageEl.getBoundingClientRect().height : 0;
      const innerH = innerEl ? innerEl.getBoundingClientRect().height : 0;
      const mainH = mainEl ? mainEl.getBoundingClientRect().height : 0;
      const docH = document.documentElement.scrollHeight;
      const bodyH = document.body.scrollHeight;
      return {
        pageH: Math.ceil(pageH), innerH: Math.ceil(innerH),
        mainH: Math.ceil(mainH), docH: Math.ceil(docH), bodyH: Math.ceil(bodyH),
      };
    });
    console.log("measured:", measured);
    const measuredHeight = Math.max(measured.pageH, measured.docH, measured.bodyH);
    const finalHeight = heightArg ? heightPx : measuredHeight + 4;

    await page.pdf({
      path: outputPath,
      width: `${widthPx}px`,
      height: `${finalHeight}px`,
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    const size = fs.statSync(outputPath).size;
    console.log(`OK · ${outputPath} · ${(size / 1024).toFixed(1)} KB · ${widthPx}×${finalHeight}px (measured: ${measuredHeight}px)`);
  } finally {
    await browser.close();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
