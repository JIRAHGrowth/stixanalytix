# 04b · Review keyboard shortcuts

A reference card for the in-app review surface (`/upload/<job_id>/review`). Pairs with [04 Tool Walkthrough](04-tool-walkthrough.md). Designed to be **printed and taped beside your keyboard** during the 200-match push.

A branded, print-friendly version is at [branded/04b-review-keyboard-shortcuts.html](branded/04b-review-keyboard-shortcuts.html). Open in browser, `Ctrl/⌘+P`, print or save-as-PDF.

---

## The four keys you'll actually use

These four cover ~95% of a typical review session. Learn these first; the rest is polish.

| Key | What it does |
|-----|---|
| `>` | Jump to the **next event in time** (across all sections — goals, saves, distribution combined). This is the video-following key. |
| `y` | **Keep** the focused event (it was real). |
| `n` | **Reject** the focused event (false positive). |
| `?` | Open the full shortcuts overlay in-app if you forget a key. |

The other shortcuts below are for power-users and bulk operations. Skip if you just want to get started.

---

## Navigation

| Key | What it does |
|-----|---|
| `>` | Next event in time (across all sections) |
| `<` | Previous event in time |
| `↓` or `j` | Next event within the current section |
| `↑` or `k` | Previous event within the current section |
| `Tab` | Switch to next section (goals → saves → distribution) |
| `Shift + Tab` | Switch to previous section |

**When to use `>` vs `↓`:** use `>` when you're following the match video — it jumps you to whatever happened next in time, regardless of category. Use `↓` when you want to scan within one category (e.g., review all distribution events back-to-back).

---

## Mark the focused event

| Key | What it does |
|-----|---|
| `y` | Keep (event was real) |
| `n` or `x` | Reject (false positive — Gemini was wrong) |
| `Space` | Toggle keep/reject |

---

## Bulk actions (apply to the current section only)

| Key | What it does |
|-----|---|
| `Shift + A` | **Accept all** events in the current section |
| `Shift + R` | **Reject all** events in the current section |
| `Shift + H` | Accept all **high-confidence** events |
| `Shift + L` | Reject all **low-confidence** events |

Bulk actions only affect the section you're currently focused on. To bulk-action a different section, `Tab` to it first.

---

## Misc

| Key | What it does |
|-----|---|
| `?` | Show or hide the shortcuts overlay |
| `Esc` | Close the overlay; or step out of a text field to re-enable shortcuts |

---

## How to practice (5 minutes)

1. Open any published match's review page in your browser.
2. Find the focus glow — the highlighted event row. Press `>` a few times and watch it jump across sections in time order.
3. Press `y` on one event, `n` on another. Watch the checkboxes tick on/off.
4. Press `?` to see the full shortcuts overlay any time you forget.
5. When you're typing in a notes field, shortcuts auto-pause. Press `Esc` to step out and re-enable them.

**The goal:** drive one match end-to-end using only the keyboard. The four starred keys above are 95% of what you'll actually press.

---

## Why this exists

The default review flow uses the mouse: click each checkbox, scroll, click again. For one match with 50-150 events, that's 30-60 minutes. With keyboard navigation, the same review takes 10-15 minutes. Across 200 matches, that's the difference between a sustainable pace and burnout.

The `>` key specifically solves the "scroll up and down between three sections while watching the video" problem. Goals, saves, and distribution events live in separate sections under the hood (different DB tables), but you watch the video in time order — `>` follows the time order across all of them.

---

→ Back to: [04 Tool Walkthrough](04-tool-walkthrough.md) · Next: [05 Calibration Process](05-calibration-process.md)
