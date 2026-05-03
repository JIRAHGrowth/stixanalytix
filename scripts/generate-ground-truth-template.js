/**
 * Generate the ground-truth tagging Excel template.
 *
 * One workbook with 7 sheets — Metadata, Goals, Saves, Distribution, Crosses,
 * Sweeper, 1v1s — each with proper data-validation dropdowns, a sample row,
 * frozen header, and a colour-coded tab.
 *
 * The schema lives here as data so we can regenerate the template any time
 * the categories change. The companion converter (scripts/excel-to-ground-truth.js)
 * reads back .xlsx files in this exact shape.
 *
 * Output: scripts/ground-truth/_template.xlsx
 *
 * Usage:
 *   node scripts/generate-ground-truth-template.js
 *   cp scripts/ground-truth/_template.xlsx scripts/ground-truth/<match-name>.xlsx
 *   # fill in while watching the match
 *   node scripts/excel-to-ground-truth.js scripts/ground-truth/<match-name>.xlsx
 */

const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

// ─── Schema ──────────────────────────────────────────────────────────────────

const HALF = ['1', '2'];
const YN = ['Yes', 'No'];
const YN_UNCLEAR = ['Yes', 'No', 'Unclear'];
const SHOT_LOCATIONS = [
  '6-Yard Box', 'Left Channel', 'Central Box', 'Right Channel',
  'Wide Left', 'Central Distance', 'Wide Right',
  'Corner Left', 'Corner Right',
];
const PLACEMENT_HEIGHT = ['Top', 'Mid', 'Low', 'Unclear'];
const PLACEMENT_SIDE_GK = ['GK Left', 'Centre', 'GK Right', 'Unclear'];
const PLACEMENT_SIDE_ATTACKER = ['Left', 'Centre', 'Right', 'Unclear'];

const SHEETS = {
  Metadata: {
    tabColor: '666666',
    fields: [
      { key: 'match_name',       label: 'Match name',       type: 'text', sample: 'judah-vs-ofc-2026-04-25', help: 'Short slug for the match (used as filename and id)' },
      { key: 'match_date',       label: 'Date',             type: 'text', sample: '2026-04-25',              help: 'YYYY-MM-DD' },
      { key: 'opponent',         label: 'Opponent',         type: 'text', sample: 'OFC 2016',                help: 'Opposition team name' },
      { key: 'venue',            label: 'Venue',            type: 'dropdown', options: ['Home', 'Away', 'Neutral'], sample: 'Home' },
      { key: 'session_type',     label: 'Session type',     type: 'dropdown', options: ['Match', 'Friendly', 'Training'], sample: 'Match' },
      { key: 'my_team_color',    label: 'My team color',    type: 'text', sample: 'black',     help: 'Outfield jersey colour, lowercase' },
      { key: 'opponent_color',   label: 'Opponent color',   type: 'text', sample: 'light blue' },
      { key: 'my_keeper_color',  label: 'My GK color',      type: 'text', sample: 'orange' },
      { key: 'age_group',        label: 'Age group',        type: 'dropdown', options: ['U6','U7','U8','U9','U10','U11','U12','U13','U14','U15','U16','U17','U18','Senior'], sample: 'U10' },
      { key: 'duration',         label: 'Video duration (MM:SS)', type: 'text', sample: '52:23' },
      { key: 'final_score_us',   label: 'Final score — us',  type: 'number', sample: 4 },
      { key: 'final_score_them', label: 'Final score — them',type: 'number', sample: 1 },
      { key: 'video_job_id',     label: 'video_job_id',     type: 'text', sample: '', help: 'Fill in after upload — needed for eval' },
    ],
  },

  Goals: {
    tabColor: 'EF4444',
    columns: [
      { key: 'time',           header: 'Time (MM:SS)',  type: 'text',     width: 12 },
      { key: 'half',           header: 'Half',          type: 'dropdown', options: HALF, width: 8 },
      { key: 'scoring_team',   header: 'Scoring team',  type: 'dropdown', options: ['Us', 'Opponent'], width: 14 },
      { key: 'attack_type',    header: 'Attack type',   type: 'dropdown', options: ['Open play','Counter attack','Corner','Free kick','Penalty','Throw-in','Set piece other','Other'], width: 16 },
      { key: 'shot_type',      header: 'Shot type',     type: 'dropdown', options: ['Header','Driven','Tap-in','Volley','Half-volley','Curled','Chip','One-v-one finish','Rebound','Deflection','Penalty','Free-kick','Own goal','Other'], width: 16 },
      { key: 'shot_location',  header: 'Shot location', type: 'dropdown', options: SHOT_LOCATIONS, width: 18 },
      { key: 'placement_height', header: 'Placement — height', type: 'dropdown', options: PLACEMENT_HEIGHT, width: 16 },
      { key: 'placement_side', header: 'Placement — side',   type: 'dropdown', options: PLACEMENT_SIDE_GK, width: 16 },
      { key: 'play_description', header: 'Play description', type: 'text', width: 50 },
      { key: 'gk_observations',  header: 'GK observations',  type: 'text', width: 50 },
      { key: 'notes',          header: 'Notes',         type: 'text', width: 40 },
    ],
    sampleRow: {
      time: '4:05', half: '1', scoring_team: 'Us', attack_type: 'Open play', shot_type: 'Rebound',
      shot_location: '6-Yard Box', placement_height: 'Low', placement_side: 'Centre',
      play_description: 'Right-side initial shot saved by opp GK, follow-up tap-in central.',
      gk_observations: 'Opp GK was on ground from initial save, could not recover for the rebound.',
      notes: '',
    },
  },

  Saves: {
    tabColor: '10B981',
    columns: [
      { key: 'time',           header: 'Time (MM:SS)',  type: 'text', width: 12 },
      { key: 'half',           header: 'Half',          type: 'dropdown', options: HALF, width: 8 },
      { key: 'shot_origin',    header: 'Shot origin',   type: 'dropdown', options: SHOT_LOCATIONS, width: 18 },
      { key: 'shot_type',      header: 'Shot type',     type: 'dropdown', options: ['Foot','Header','Deflection'], width: 14 },
      { key: 'on_target',      header: 'On target',     type: 'dropdown', options: YN_UNCLEAR, width: 12 },
      { key: 'gk_action',      header: 'GK action',     type: 'dropdown', options: ['Catch','Block','Parry','Deflect','Punch','Smother','Starfish','K-Barrier','Missed','Goal','Unclear'], width: 14 },
      { key: 'gk_visible',     header: 'GK visible?',   type: 'dropdown', options: ['Yes','Partial','No'], width: 12 },
      { key: 'outcome',        header: 'Outcome',       type: 'dropdown', options: ['Held','Rebound (safe)','Rebound (dangerous)','Corner','Out of play','Goal'], width: 18 },
      { key: 'body_zone',      header: 'Body zone (A/B/C)', type: 'dropdown', options: ['A','B','C','Unclear'], width: 16 },
      { key: 'placement_height', header: 'Placement — height', type: 'dropdown', options: PLACEMENT_HEIGHT, width: 16 },
      { key: 'placement_side', header: 'Placement — side',  type: 'dropdown', options: PLACEMENT_SIDE_GK, width: 16 },
      { key: 'play_description', header: 'Play description', type: 'text', width: 50 },
      { key: 'gk_observations',  header: 'GK observations',  type: 'text', width: 50 },
      { key: 'notes',          header: 'Notes',         type: 'text', width: 40 },
    ],
    sampleRow: {
      time: '24:47', half: '1', shot_origin: 'Central Distance', shot_type: 'Foot',
      on_target: 'Yes', gk_action: 'Parry', gk_visible: 'Yes', outcome: 'Corner',
      body_zone: 'C', placement_height: 'Low', placement_side: 'GK Right',
      play_description: 'Driven shot from outside the box, central, aimed at the bottom-right corner.',
      gk_observations: 'Strong parry — full extension dive to the right, palm strike, ball deflected wide for a corner.',
      notes: '',
    },
  },

  Distribution: {
    tabColor: '3B82F6',
    summaryBlockHeader: [
      'QUICK TOTALS — fill these IN PLACE OF logging every event if you do not want to tag row-by-row.',
      'If you log events below, leave these blank (the converter will compute totals from rows).',
    ],
    summaryFields: [
      ['GK Short — attempts',    'gk_short_att'],
      ['GK Short — successful',  'gk_short_suc'],
      ['GK Long — attempts',     'gk_long_att'],
      ['GK Long — successful',   'gk_long_suc'],
      ['Throws — attempts',      'throws_att'],
      ['Throws — successful',    'throws_suc'],
      ['Passes — attempts',      'passes_att'],
      ['Passes — successful',    'passes_suc'],
      ['Under pressure — attempts',   'pressure_att'],
      ['Under pressure — successful', 'pressure_suc'],
    ],
    columns: [
      { key: 'time',           header: 'Time (MM:SS)',  type: 'text', width: 12 },
      { key: 'half',           header: 'Half',          type: 'dropdown', options: HALF, width: 8 },
      { key: 'trigger',        header: 'Trigger',       type: 'dropdown', options: ['Goal kick','After save','Backpass','Loose ball in box','Throw-in to GK','Free kick to GK'], width: 18 },
      { key: 'type',           header: 'Type',          type: 'dropdown', options: ['GK Short Kick','GK Long Kick','Throw','Pass','Drop-kick'], width: 16 },
      { key: 'successful',     header: 'Successful',    type: 'dropdown', options: YN, width: 12 },
      { key: 'under_pressure', header: 'Under pressure',type: 'dropdown', options: YN, width: 14 },
      { key: 'pass_selection', header: 'Pass selection',type: 'dropdown', options: ['Short to defender','Sideways across back','Long to forward','Switch wide','Backwards under pressure','Clearance under pressure','Drilled into channel'], width: 26 },
      { key: 'direction',      header: 'Direction',     type: 'dropdown', options: ['Left','Centre','Right','Backwards'], width: 12 },
      { key: 'receiver',       header: 'Receiver',      type: 'dropdown', options: ['Defender','Midfielder','Forward','Out of play','Opponent (turnover)'], width: 18 },
      { key: 'first_touch',    header: 'First touch',   type: 'dropdown', options: ['Clean','Heavy','Two touches','Mishit'], width: 14 },
      { key: 'notes',          header: 'Notes',         type: 'text', width: 40 },
    ],
    sampleRow: {
      time: '14:32', half: '1', trigger: 'Backpass', type: 'Pass', successful: 'Yes',
      under_pressure: 'Yes', pass_selection: 'Switch wide', direction: 'Left', receiver: 'Defender',
      first_touch: 'Clean',
      notes: 'Recycled possession to LCB under high press; built out from the back successfully.',
    },
  },

  Crosses: {
    tabColor: 'F97316',
    columns: [
      { key: 'time',            header: 'Time (MM:SS)', type: 'text', width: 12 },
      { key: 'half',            header: 'Half',         type: 'dropdown', options: HALF, width: 8 },
      { key: 'side',            header: 'Side',         type: 'dropdown', options: ['Left','Right','Corner Left','Corner Right'], width: 14 },
      { key: 'cross_type',      header: 'Cross type',   type: 'dropdown', options: ['Whipped','Floated','Driven','Cut-back','Looped'], width: 14 },
      { key: 'destination',     header: 'Destination',  type: 'dropdown', options: ['Near post','6yd','Penalty spot','Far post','Out of box'], width: 16 },
      { key: 'gk_action',       header: 'GK action',    type: 'dropdown', options: ['Catch','Punch','Tip-over','Stayed on line','Missed/Misjudged','Defender cleared'], width: 18 },
      { key: 'gk_position',     header: 'GK starting pos', type: 'dropdown', options: ['On line','Edge of 6yd','Edge of 18yd','Outside box'], width: 18 },
      { key: 'outcome',         header: 'Outcome',      type: 'dropdown', options: ['Held','Punched away','Tipped over','Conceded','Cleared by defender','Shot from rebound'], width: 22 },
      { key: 'notes',           header: 'Notes',        type: 'text', width: 40 },
    ],
    sampleRow: {
      time: '36:18', half: '2', side: 'Corner Right', cross_type: 'Whipped', destination: 'Near post',
      gk_action: 'Punch', gk_position: 'Edge of 6yd', outcome: 'Punched away',
      notes: 'Two-fisted punch under pressure from two attackers; cleared 25 yards.',
    },
  },

  Sweeper: {
    tabColor: 'A78BFA',
    columns: [
      { key: 'time',           header: 'Time (MM:SS)',  type: 'text', width: 12 },
      { key: 'half',           header: 'Half',          type: 'dropdown', options: HALF, width: 8 },
      { key: 'action',         header: 'Action',        type: 'dropdown', options: ['Clearance','Interception','Tackle','Header'], width: 14 },
      { key: 'distance',       header: 'Distance from goal', type: 'dropdown', options: ['In box','Edge of box','5–15 yards out','15+ yards out'], width: 22 },
      { key: 'successful',     header: 'Successful',    type: 'dropdown', options: YN, width: 12 },
      { key: 'pressure',       header: 'Pressure',      type: 'dropdown', options: ['None','1 attacker','2+ attackers'], width: 16 },
      { key: 'outcome',        header: 'Outcome',       type: 'dropdown', options: ['Possession retained','Cleared safely','Conceded turnover','Goal conceded'], width: 22 },
      { key: 'notes',          header: 'Notes',         type: 'text', width: 40 },
    ],
    sampleRow: {
      time: '28:15', half: '1', action: 'Clearance', distance: '5–15 yards out',
      successful: 'Yes', pressure: '1 attacker', outcome: 'Cleared safely',
      notes: 'Read the through ball early; one-touch clearance to the right wing.',
    },
  },

  '1v1s': {
    tabColor: 'D4A853',
    columns: [
      { key: 'time',     header: 'Time (MM:SS)', type: 'text', width: 12 },
      { key: 'half',     header: 'Half',         type: 'dropdown', options: HALF, width: 8 },
      { key: 'event',    header: 'Event type',   type: 'dropdown', options: ['1v1 faced','Recovery save','Error leading to goal','Big moment (other)'], width: 24 },
      { key: 'outcome',  header: 'Outcome',      type: 'dropdown', options: ['Won','Conceded','Saved','Cleared'], width: 14 },
      { key: 'notes',    header: 'Notes',        type: 'text', width: 70 },
    ],
    sampleRow: {
      time: '52:17', half: '2', event: '1v1 faced', outcome: 'Conceded',
      notes: 'Through ball over the top, GK rushed off line, attacker rounded him to score into empty net. Sweeper-keeper action with poor angle.',
    },
  },
};

// ─── Workbook builder ────────────────────────────────────────────────────────

function dropdownFormula(options) {
  // Excel data-validation list with comma-separated values must be quoted.
  // Watch for commas inside option strings — escape if needed.
  const safe = options.map(o => String(o).replace(/"/g, '""'));
  return [`"${safe.join(',')}"`];
}

function applyDataValidation(sheet, colLetter, options, firstRow, lastRow) {
  for (let row = firstRow; row <= lastRow; row++) {
    sheet.getCell(`${colLetter}${row}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: dropdownFormula(options),
      showErrorMessage: false,
    };
  }
}

function styleHeader(cell) {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E2A32' } };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
  cell.border = { bottom: { style: 'thin', color: { argb: 'FF555555' } } };
}

function styleSampleCell(cell) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
  cell.font = { italic: true, color: { argb: 'FF666666' } };
}

function colLetter(idx) {
  // 0 → A, 1 → B, …, 25 → Z, 26 → AA
  let s = '';
  let n = idx;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function buildMetadataSheet(workbook) {
  const def = SHEETS.Metadata;
  const sheet = workbook.addWorksheet('Metadata', { properties: { tabColor: { argb: 'FF' + def.tabColor } } });
  sheet.getColumn(1).width = 26;
  sheet.getColumn(2).width = 36;
  sheet.getColumn(3).width = 50;

  sheet.getCell('A1').value = 'Field';
  sheet.getCell('B1').value = 'Value';
  sheet.getCell('C1').value = 'Notes';
  ['A1', 'B1', 'C1'].forEach(c => styleHeader(sheet.getCell(c)));

  def.fields.forEach((f, i) => {
    const row = i + 2;
    sheet.getCell(`A${row}`).value = f.label;
    sheet.getCell(`B${row}`).value = f.sample;
    if (f.help) sheet.getCell(`C${row}`).value = f.help;
    if (f.type === 'dropdown') {
      sheet.getCell(`B${row}`).dataValidation = {
        type: 'list', allowBlank: true,
        formulae: dropdownFormula(f.options), showErrorMessage: false,
      };
    }
  });

  sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
}

function buildEventSheet(workbook, name, def) {
  const sheet = workbook.addWorksheet(name, { properties: { tabColor: { argb: 'FF' + def.tabColor } } });
  let row = 1;

  // Optional summary block at top (Distribution)
  if (def.summaryBlockHeader && def.summaryFields) {
    def.summaryBlockHeader.forEach(line => {
      sheet.getCell(`A${row}`).value = line;
      sheet.getCell(`A${row}`).font = { italic: true, color: { argb: 'FF666666' } };
      sheet.mergeCells(`A${row}:F${row}`);
      row++;
    });
    row++;
    def.summaryFields.forEach(([label, key]) => {
      sheet.getCell(`A${row}`).value = label;
      sheet.getCell(`B${row}`).value = '';  // user fills
      sheet.getCell(`A${row}`).font = { bold: true };
      row++;
    });
    row += 2; // gap before event table
  }

  const headerRow = row;
  // Event-table headers
  def.columns.forEach((col, i) => {
    const letter = colLetter(i);
    sheet.getColumn(letter).width = col.width || 16;
    const cell = sheet.getCell(`${letter}${headerRow}`);
    cell.value = col.header;
    styleHeader(cell);
  });
  sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: headerRow }];

  // Sample row
  const sampleRowNum = headerRow + 1;
  def.columns.forEach((col, i) => {
    const letter = colLetter(i);
    const cell = sheet.getCell(`${letter}${sampleRowNum}`);
    if (def.sampleRow && def.sampleRow[col.key] !== undefined) cell.value = def.sampleRow[col.key];
    styleSampleCell(cell);
  });

  // Apply dropdown validation to the sample row + ~200 empty rows beneath
  const lastRow = sampleRowNum + 200;
  def.columns.forEach((col, i) => {
    const letter = colLetter(i);
    if (col.type === 'dropdown') {
      applyDataValidation(sheet, letter, col.options, sampleRowNum, lastRow);
    }
    // Force time columns to TEXT format so Excel doesn't auto-convert MM:SS
    // input into time-of-day Date values. Caused timestamps to round-trip
    // as 1899 dates and required ugly fallback parsing in the converter.
    if (col.key === 'time' || col.key === 'timestamp') {
      for (let r = sampleRowNum; r <= lastRow; r++) {
        sheet.getCell(`${letter}${r}`).numFmt = '@';
      }
    }
  });
}

async function main() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'StixAnalytix ground-truth template';
  workbook.created = new Date();

  // README sheet at the start (instructional)
  const readme = workbook.addWorksheet('README', { properties: { tabColor: { argb: 'FF888888' } } });
  readme.getColumn(1).width = 110;
  const readmeLines = [
    'STIX Match Ground-Truth Tagger',
    '',
    'How to use this workbook:',
    '1. Save a copy of this file as scripts/ground-truth/<match-name>.xlsx (e.g. judah-2026-05-02.xlsx).',
    '2. Fill in the Metadata sheet first — this is the match context.',
    '3. While watching the recording, log events on the relevant sheet:',
    '     • Goals — every goal in the match (either team)',
    '     • Saves — every shot the analyzed GK faced (on or off target)',
    '     • Distribution — how the GK distributed the ball (you can use the QUICK TOTALS at top instead of logging every event)',
    '     • Crosses — every cross the GK was responsible for handling',
    '     • Sweeper — keeper outfield work (clearances, interceptions, tackles, headers)',
    '     • 1v1s — high-value moments worth a dedicated row',
    '4. The first row beneath the header on each sheet is a SAMPLE — overwrite or delete it.',
    '5. Save the file. Run:  node scripts/excel-to-ground-truth.js scripts/ground-truth/<match-name>.xlsx',
    '6. The converter writes a JSON file alongside that the eval harness can read.',
    '',
    'Tips:',
    ' • Time format is MM:SS (e.g. 12:24). The first column on every event sheet is Time.',
    ' • Dropdowns appear as you click into a cell — pick from the list rather than typing free text.',
    ' • If you are unsure of a field, leave it blank. The converter handles missing values cleanly.',
    ' • Notes are always optional but valuable — they become part of the match record on publish.',
    '',
    'Tab colours: red=Goals, green=Saves, blue=Distribution, orange=Crosses, purple=Sweeper, gold=1v1s, grey=metadata/this README.',
  ];
  readmeLines.forEach((line, i) => {
    const cell = readme.getCell(`A${i + 1}`);
    cell.value = line;
    if (i === 0) cell.font = { bold: true, size: 16 };
    else if (line.startsWith('How to use') || line.startsWith('Tips:') || line.startsWith('Tab colours')) cell.font = { bold: true };
    else cell.font = { color: { argb: 'FF333333' } };
  });

  buildMetadataSheet(workbook);
  buildEventSheet(workbook, 'Goals', SHEETS.Goals);
  buildEventSheet(workbook, 'Saves', SHEETS.Saves);
  buildEventSheet(workbook, 'Distribution', SHEETS.Distribution);
  buildEventSheet(workbook, 'Crosses', SHEETS.Crosses);
  buildEventSheet(workbook, 'Sweeper', SHEETS.Sweeper);
  buildEventSheet(workbook, '1v1s', SHEETS['1v1s']);

  const outDir = path.join(__dirname, 'ground-truth');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, '_template.xlsx');
  await workbook.xlsx.writeFile(outPath);
  const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`Wrote ${path.relative(process.cwd(), outPath)} (${sizeKb} KB, ${workbook.worksheets.length} sheets)`);
  console.log(`Tabs: ${workbook.worksheets.map(s => s.name).join(', ')}`);
}

main().catch(e => { console.error(e); process.exit(1); });
