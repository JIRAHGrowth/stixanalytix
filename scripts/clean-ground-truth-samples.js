/**
 * Strip leftover sample rows from a ground-truth xlsx file.
 *
 * The old template had pre-filled sample rows (greyed-out italic text) on
 * every event sheet meant to be overwritten or deleted by the coach. When
 * coaches missed the "delete me" cue, the converter mistakenly counted the
 * sample as a real event. The new template (post-2026-05-03) doesn't include
 * sample rows, but existing files copied from the old template still have
 * them embedded.
 *
 * This script removes them in place. It identifies sample rows by their
 * known signature data (the exact values the generator wrote) and removes
 * any matching row at row 2 of each event sheet.
 *
 * Usage:
 *   node scripts/clean-ground-truth-samples.js <path-to-xlsx>
 *
 * The original is overwritten; back up if you've made unrelated edits to
 * those rows.
 */

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

// Sample-row signatures from the original template generator. We match on
// the timestamp + scoring/event-type field to reduce risk of nuking real
// rows that happen to share other values.
const SAMPLE_SIGNATURES = {
  Goals:        { col: 'A', timeMatches: ['4:05'] },
  Saves:        { col: 'A', timeMatches: ['24:47'] },
  Distribution: { col: 'A', timeMatches: ['14:32'] },
  Crosses:      { col: 'A', timeMatches: ['36:18'] },
  Sweeper:      { col: 'A', timeMatches: ['28:15'] },
  '1v1s':       { col: 'A', timeMatches: ['52:17'] },
};

// Known sample-row content per sheet (what the generator wrote). If row 2
// matches the sample on its time AND another sample-only field, treat as
// a leftover sample. If the user has overwritten ANY field with their own
// data, skip.
const SAMPLE_FULL_MATCH = {
  Goals: { row: 2, expect: { A: '4:05', B: '1', C: 'Us', D: 'Open play', E: 'Rebound', F: '6-Yard Box', G: 'Low', H: 'Centre' } },
  Saves: { row: 2, expect: { A: '24:47', B: '1', C: 'Central Distance', D: 'Foot', E: 'Yes', F: 'Parry', G: 'Yes', H: 'Corner', I: 'C' } },
  Distribution: null, // Distribution sample lives below the summary block; row varies. Handle separately.
  Crosses: { row: 2, expect: { A: '36:18', B: '2', C: 'Corner Right', D: 'Whipped', E: 'Near post', F: 'Punch' } },
  Sweeper: { row: 2, expect: { A: '28:15', B: '1', C: 'Clearance', D: '5–15 yards out', E: 'Yes', F: '1 attacker' } },
  '1v1s':  { row: 2, expect: { A: '52:17', B: '2', C: '1v1 faced', D: 'Conceded' } },
};

function readCellText(cell) {
  if (!cell) return '';
  let v = cell.value;
  if (v == null) {
    return (cell.text || '').toString().trim();
  }
  if (v instanceof Date) return (cell.text || '').toString().trim();
  if (typeof v === 'object') {
    if (v.text) v = v.text;
    else if (v.richText) v = v.richText.map(t => t.text).join('');
    else v = String(v);
  }
  return String(v).trim();
}

async function main() {
  const xlsx = process.argv[2];
  if (!xlsx) {
    console.error('Usage: node scripts/clean-ground-truth-samples.js <path-to-xlsx>');
    process.exit(1);
  }
  const abs = path.resolve(xlsx);
  if (!fs.existsSync(abs)) { console.error('Not found: ' + abs); process.exit(1); }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(abs);

  let removed = 0;
  for (const [name, sig] of Object.entries(SAMPLE_FULL_MATCH)) {
    if (!sig) continue;
    const sheet = wb.getWorksheet(name);
    if (!sheet) continue;
    const row = sheet.getRow(sig.row);
    let allMatch = true;
    for (const [col, expected] of Object.entries(sig.expect)) {
      const actual = readCellText(row.getCell(col));
      if (actual !== expected) { allMatch = false; break; }
    }
    if (allMatch) {
      sheet.spliceRows(sig.row, 1);
      console.log(`✓ Removed sample row from "${name}" (was: ${Object.values(sig.expect).join(' / ')})`);
      removed++;
    } else {
      const firstVal = readCellText(row.getCell('A'));
      console.log(`— "${name}" row ${sig.row} doesn't match the sample signature (first cell: ${JSON.stringify(firstVal)}) — leaving alone`);
    }
  }

  // Distribution sample is below the summary block — find by signature in any
  // row whose A cell is "14:32" AND C cell is "Backpass"
  const distSheet = wb.getWorksheet('Distribution');
  if (distSheet) {
    let foundRow = null;
    for (let r = 1; r <= distSheet.actualRowCount; r++) {
      const a = readCellText(distSheet.getCell('A' + r));
      const c = readCellText(distSheet.getCell('C' + r));
      if (a === '14:32' && c === 'Backpass') { foundRow = r; break; }
    }
    if (foundRow) {
      distSheet.spliceRows(foundRow, 1);
      console.log(`✓ Removed sample row from "Distribution" at row ${foundRow}`);
      removed++;
    } else {
      console.log(`— Distribution sample row not found (already cleaned, or replaced with real data)`);
    }
  }

  // Pass 2 — strip persistent sample STYLING (grey fill + italic) from any row
  // on the event sheets. The original template grey-styled the sample row to
  // visually mark it; when coaches typed real data in those cells, the styling
  // persisted. Result: rows look "greyed out" even though they hold real data.
  let restyled = 0;
  for (const name of Object.keys(SAMPLE_FULL_MATCH).concat(['Distribution'])) {
    const sheet = wb.getWorksheet(name);
    if (!sheet) continue;
    const lastRow = sheet.actualRowCount;
    const lastCol = Math.max(...(sheet.columns || []).map(c => c.number || 0), 14);
    for (let r = 1; r <= lastRow; r++) {
      const row = sheet.getRow(r);
      for (let c = 1; c <= lastCol; c++) {
        const cell = row.getCell(c);
        // Skip header row — keep header styling intact
        if (r === 1) continue;
        // Reset fill if it's grey-ish (pattern with light grey fgColor) and
        // italic font. Header is dark blue so won't be touched.
        const fill = cell.fill;
        const isGreyFill = fill && fill.type === 'pattern' && fill.fgColor &&
          (fill.fgColor.argb === 'FFEEEEEE' || (fill.fgColor.argb || '').toLowerCase() === 'ffeeeeee');
        if (isGreyFill) {
          cell.fill = null;
          restyled++;
        }
        if (cell.font && cell.font.italic) {
          // Preserve other font properties; just remove italic + grey colour
          cell.font = { ...cell.font, italic: false, color: undefined };
        }
      }
    }
  }

  if (removed === 0 && restyled === 0) {
    console.log('\nNo sample rows found and no grey styling to clean — file is already clean.');
    return;
  }
  if (restyled > 0) {
    console.log(`✓ Stripped grey/italic formatting from ${restyled} cell(s) on event sheets`);
  }

  await wb.xlsx.writeFile(abs);
  console.log(`\nCleaned ${removed} sample row(s) and reformatted ${restyled} cell(s). File saved.`);
}

main().catch(e => { console.error(e); process.exit(1); });
