# StixAnalytix · Document System

Canonical template for branded long-form documents — training manuals, internal briefs, partner-facing playbooks, technical references. Based on **Variant 2 — Brief with Marginalia** from the [design exploration](../index.html).

## Files

| File | Purpose |
|------|---------|
| [stixanalytix-doc.css](stixanalytix-doc.css) | The canonical stylesheet. Theme toggle via `<body class="is-screen">` vs `<body class="is-print">`. |
| [template.html](template.html) | Minimal skeleton. Copy this when starting a new document. Inline comments explain each block. |
| [example-screen.html](example-screen.html) | Full 5-page example — Domain Primer content, dark theme. |
| [example-print.html](example-print.html) | Same content, white theme. Identical to screen except for `<body class="is-print">`. |

Open `example-screen.html` and `example-print.html` side-by-side in your browser to see the two themes.

## Two themes, one stylesheet

```html
<!-- Online viewing (dark, warm near-black) -->
<body class="is-screen">

<!-- Print / PDF (white paper, deep emerald) -->
<body class="is-print">
```

Both themes use the same component classes. Custom-property tokens in [stixanalytix-doc.css](stixanalytix-doc.css) flip based on the body class. Switch themes by changing one attribute.

**Auto-print:** when you actually print (Ctrl/Cmd-P), the print theme is forced regardless of which class is set. So you can keep `is-screen` on a document and still get a correctly-themed PDF when you print it. The `@media print` rule and `@page { size: letter; margin: 0; }` handle the rest.

## Starting a new document

1. **Copy the template:**
   ```bash
   cp template.html ../../docs/06-eval-process.html
   ```
   (or wherever the new doc lives — typically `onboarding/` for training docs)

2. **Find-and-replace the placeholders:**
   - `##` → your document number (e.g. `06`)
   - `Document Title Here` → your title
   - `[Doc Name]`, `[Series Name]`, `[Subtitle]` → real values
   - Update the `<title>` tag

3. **Update the CSS link path** if your file is in a different directory:
   ```html
   <link rel="stylesheet" href="../onboarding/_design/template/stixanalytix-doc.css">
   ```

4. **Duplicate the inner-page block** for each additional page. Each block is a `<section class="page">` containing `<aside class="rail">` + `<main class="main">`.

5. **Replace cover SVG title text** by editing the two `<text>` elements inside the cover frame SVG. Keep the net geometry — that's the brand.

## Component reference

### Page layouts

```html
<!-- Cover -->
<section class="page cover">
  <div class="cover-rail">...</div>           <!-- top metadata row -->
  <div class="cover-doc-id">02</div>          <!-- big document number -->
  <div class="cover-frame-wrap">...</div>     <!-- net goalframe with title -->
  <div class="cover-subtitle">...</div>
  <div class="cover-foot">                    <!-- 3-column footer -->
    <div class="cover-foot-block">...</div>
  </div>
</section>

<!-- Inner page -->
<section class="page">
  <div class="inner">
    <aside class="rail">...</aside>          <!-- left marginalia (200px) -->
    <main class="main">...</main>            <!-- right body -->
  </div>
</section>
```

### Type hierarchy

| Class | Element | Style |
|-------|---------|-------|
| `.h-chapter` | Chapter title | Outfit 800 · 38px · -1.2px tracking |
| `.h-deck` | Sub-title under chapter | Outfit 500 · 16px · 1.4 leading |
| `.h-section` | Section heading | Outfit 700 · 19px · -0.4px tracking |
| `.h-subsection` | Subsection heading | Outfit 700 · 13px |
| `p`, `li` | Body copy | DM Sans 300 · 14.5px · 1.75 leading |

### The net motif

The horizontal net strip appears once per page as the section divider. Don't add it elsewhere — its rarity is what makes it work. The strip SVG is ~80 lines; copy from any page in [example-screen.html](example-screen.html). The strokes use CSS custom properties (`var(--net-stroke)`, `var(--net-opacity)`) so they auto-flip between themes.

The cover-page goalframe is larger and contains the document title. Same pattern — copy from the example, change only the `<text>` children.

### Components

**Side callout** — two-column body with sidebar aside:
```html
<div class="body-cols">
  <div class="col-main">
    <p>Main body copy.</p>
  </div>
  <div class="col-side">
    <div class="side-label">Aside title</div>
    <div class="side-body">Aside body.</div>
  </div>
</div>
```

**Stat row** — three big numbers in a deep emerald grid:
```html
<div class="stat-row">
  <div class="stat">
    <div class="num">50+</div>
    <div class="lbl">Data points per match</div>
  </div>
  <!-- × 3 -->
</div>
```

**Data table** — styled as a cropped goal-net:
```html
<table class="gktable">
  <thead><tr><th>Column</th><th>Column</th></tr></thead>
  <tbody>
    <tr><td>Cell</td><td><span class="lbl">Emerald label</span></td></tr>
  </tbody>
</table>
```

**Bar chart** — small horizontal chart:
```html
<div class="bar-chart-mini">
  <span class="bar-label">Category</span>
  <div class="bar-track"><div class="bar-fill" style="width:62%"></div></div>
  <span class="bar-value">31</span>
</div>
```

**Inline `<code>`** — for category labels, file paths, field values. Auto-coloured emerald on a 10%-opacity fill.

## Pitch diagram — FIFA proportions

For any diagram that shows a pitch, penalty area, goal area, or goal, use these proportions from FIFA Law 1. The audience for these documents is goalkeeping professionals — incorrect ratios create immediate visual friction and distract from the content.

| Feature | Real dimension | At 10 px / m |
|---------|----------------|---------------|
| Pitch width (sideline to sideline) | 68 m | 680 px |
| Visible attacking third (depth) | ~32 m | 320 px |
| Penalty area (18-yard box) | 40.32 m × 16.5 m | 403 × 165 px |
| Goal area (6-yard box) | 18.32 m × 5.5 m | 183 × 55 px |
| Goal mouth | 7.32 m wide × 2.44 m tall | 73 × ~8 px (visual stripe) |
| Penalty spot | 11 m from goal line | y-offset 110 px |
| Penalty arc (D) | radius 9.15 m from penalty spot | radius 91.5 px |

**Internal checks that catch errors fast:**
- Goal area depth is **exactly 1/3** of penalty area depth (5.5 / 16.5).
- Goal area width is **~45%** of penalty area width (18.32 / 40.32 = 0.454).
- Penalty spot sits at **2/3** of the way into the box from the goal line (11 / 16.5 = 0.667).
- Penalty arc intersects the top edge of the penalty area at **±73.1 px** from centre (when using 10 px / m scale).

Reference implementation is in [example-screen.html](example-screen.html) and [example-print.html](example-print.html), page 5, Figure 05.1.

## Brand fidelity rules

1. **Colours come from custom properties.** Never hardcode `#10b981` or `#EDEAE1` in document HTML. Use `var(--accent)`, `var(--fg)`, etc. so theme switching works.
2. **The net motif belongs on covers and section dividers. Nowhere else.** Don't decorate body content with net strips — it's load-bearing brand, not wallpaper.
3. **Use the type scale.** Don't write custom `font-size` values. If you need a heading the scale doesn't have, the scale has the wrong gap and we should fix it — not work around it.
4. **`em` for emphasis (italic 300), `strong` for weight (500, NOT 700).** The brand sheet's italic 300 is one of its signatures.
5. **Section labels and metadata in UPPERCASE 8-10px with 0.22-0.28em letter-spacing.** Always.
6. **Section labels use only number + name.** Format: `04 · Reference · Cheat sheet`. No section sign (`§`), no other typographic ornaments before the number — they read as out-of-place against the rest of the system.
7. **Nav rail items use body-text colour, not dim.** Side-rail navigation must remain legible on both screen and print backgrounds. Use `var(--fg)` on `.rail-nav-item` (already set in the CSS); never override to a dim/ghost token.
8. **Pitch diagrams use FIFA Law 1 proportions, exactly.** The audience is GK professionals — wrong ratios are immediate visual friction. Use the table below. Scale freely (10px/m is convenient) but never distort the ratios.

## Printing to PDF

1. Open `example-print.html` (or any document with `is-screen` — print rule auto-flips).
2. Ctrl-P (Cmd-P on Mac).
3. Settings:
   - **Destination:** Save as PDF
   - **Paper size:** Letter
   - **Margins:** None (CSS controls margins inside `.page`)
   - **Scale:** Fit to page width — or 70% if the design overflows
   - **Background graphics:** ON (required — otherwise net strips and table headers disappear)
4. Save.

The PDFs are intentionally print-ready: the net strokes, table headers, and section dividers all render with the deep-emerald accent on white.

## Future improvements (not done yet)

- [ ] Markdown-to-template script that ingests the existing `onboarding/0X-*.md` files and emits branded HTML against this template.
- [ ] Native `@page` CSS sizing at Letter dimensions (currently the design width is 1100px and browsers scale on print — works but not pixel-perfect).
- [ ] Page-number auto-increment via CSS counters (currently `##/##` placeholders are filled by hand).
- [ ] A vector / SVG version of the wordmark to drop into headers as a clickable home link in the screen theme.

## Provenance

Built 2026-05-27. Source design: [Variant 2 — Brief with Marginalia](../variant-2-brief-marginalia.html). Brand guidelines: `OneDrive / Stixanalytix / 03 - Marketing & Brand / Brand Assets / 6_Color & Typography / stixanalytix-brand-r7.html`.

## Changelog

- **2026-05-27 · r1** — Three refinements after first print review:
  - **Nav rail readability.** Rail navigation items moved from `var(--fg-dim)` to `var(--fg)` so they read at full body-text weight on both themes. Also bumped print theme tokens (`--fg-mid`, `--fg-dim`, `--fg-ghost`) up one tier — the original print values were calibrated for screen contrast and read as too faint on white. Codified as rule 7.
  - **Removed `§` from section labels.** The section sign was deemed out-of-place against the rest of the typographic system. New format: `04 · Reference · Cheat sheet` (number + middle dot + name, no leading symbol). Codified as rule 6.
  - **Pitch diagram proportions corrected to FIFA Law 1.** Earlier draft had penalty area, goal area, and penalty-spot positions visibly off. Rewrote Figure 05.1 at 10 px / m scale with the exact ratios from Law 1. Added the penalty arc (the D), which is what GK coaches will check first. Codified as rule 8 plus the proportions reference table above.
- **2026-05-27 · r0** — Initial template extracted from Variant 2 of the design exploration.
