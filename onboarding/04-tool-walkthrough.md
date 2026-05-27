# 4 — Tool Walkthrough

**Read time: 20 minutes + 2 Loom videos (to be recorded). For active labelers.**

This document covers the mechanics — how to actually do the labeling work, end to end. The "what to label" lives in the [Rubric](03a-labeling-rubric.md); the "how to use the spreadsheet" lives here.

## What you'll need

- **The match video** (mp4 or shared link)
- **The match metadata** (jersey colours, opponent, date, video_job_id) — usually a single message from Joshua
- **A video player that supports frame-by-frame** — VLC works (`E` = next frame, `D` = previous frame); browser players usually do not
- **Excel** (or Google Sheets / LibreOffice — but Excel preserves the dropdowns best)
- **A local clone of the repo**, or at minimum read access to `scripts/ground-truth/_template.xlsx`
- **Node.js** installed locally if you'll run the converter yourself; otherwise hand the `.xlsx` to Joshua and he runs it

## The end-to-end workflow

### Step 1 — Set up the workbook

1. Copy [scripts/ground-truth/_template.xlsx](../scripts/ground-truth/_template.xlsx) to `scripts/ground-truth/<match-name>.xlsx`.
   - Naming: `<keeper>-vs-<opponent>-YYYY-MM-DD.xlsx` (e.g. `judah-vs-ofc-2026-04-25.xlsx`).
2. Open in Excel.
3. Fill the **Metadata sheet first**. Confirm colours match what was sent to the analyzer (ask if unclear).

### Step 2 — Blind pass on the video

The most important rule of labeling is: **do not look at the Gemini output before doing your own pass.** Why is covered in the rubric, but the short version is: if you read the model's output first, you'll anchor on it and miss its errors. We're not measuring agreement-with-Gemini — we're measuring ground truth.

1. Open the video. Note the duration in your Metadata sheet.
2. Play. When something happens that looks like an event, **pause and log it.**
3. Use frame-by-frame stepping (VLC: `E`/`D`) to confirm:
   - The exact strike timestamp (not the save)
   - The shooter's jersey colour at contact
   - The keeper's hand shape at contact (if visible)
4. Log the row, including the `Play description` (this forces you to be honest — if you can't describe the attack, you don't have a save).
5. Continue. After halftime, **explicitly check that you're still labeling.** A common failure is to lose attention in the second half and end up with all events in the first 15 minutes.

**Time budget:** A typical match takes 60-90 minutes of labeling for ~50 minutes of video. The first match you label will take longer — expect 2-3 hours. By match 10 you'll be at the typical rate.

### Step 3 — Compare against the Gemini output

Once your blind pass is complete, look at the Gemini output for the same match. (Joshua or the queue will provide it.) Do a side-by-side check:

- **Events Gemini found that you missed:** play back that timestamp. If you can verify the event happened by the rubric, ADD it. If not (it's a phantom — common on saves), leave it off your list.
- **Events you found that Gemini missed:** these are valuable. They're exactly the cases where the model needs training. No action needed beyond keeping your row.
- **Events you both found but classified differently:** if Gemini's classification is correct by the rubric, fix yours. If yours is correct, leave it. Note the disagreement in `Notes` if it's instructive.

**Do NOT just copy Gemini's labels.** The whole point is independent verification.

### Step 4 — Self-check

Run the checklist at the end of [03a-labeling-rubric.md](03a-labeling-rubric.md#self-check-before-you-submit). Don't skip it. Two minutes here prevents an hour of back-and-forth.

### Step 5 — Convert and submit

```bash
node scripts/excel-to-ground-truth.js scripts/ground-truth/<match-name>.xlsx
```

This produces `scripts/ground-truth/<match-name>.json`. Eyeball it briefly — does the goal count match? Does the saves array look right? Then commit both files (or hand off if you don't have repo write access).

---

## Known Gemini failure modes (so you can recognize them)

From the changelog of [prompts/README.md](../prompts/README.md), here are the model's documented mistakes. Knowing these lets you spot phantoms when comparing against the Gemini output:

### 1. Inventing saves on dominant-win matches
**Symptom:** Gemini reports 50+ saves for a match where the analyzed team won 15-0 and faced 4 actual shots.
**Cause:** The model used to be told "0 saves in a chunk means you missed something," which forced hallucinations on one-sided matches. The prompt was fixed in May 2026 but the behavior may still appear in older outputs.
**Your job:** Apply the antecedent-attack test. If Gemini's `preceding_attack` is vague or absent, the save is invented.

### 2. Flipping the scoring team
**Symptom:** Gemini attributes a goal to the wrong team. Historically wrong 100% of the time when it said "the analyzed team conceded," and 50% wrong when it said "the opposition conceded."
**Cause:** Anchoring on celebrations and kickoff identity rather than the shooter's jersey at contact. Also a model bias toward "this is a GK analysis, so the analyzed team must concede."
**Your job:** Always verify by the shooter's kit colour at the moment of strike. The `evidence_shooter_color` field in the model's output tells you what it thought it saw — if that doesn't match what you see on tape, the model was wrong.

### 3. Drifting timestamps
**Symptom:** Gemini reports an event at 18:42 but the actual strike is at 16:05 (or doesn't exist at all).
**Cause:** Multimodal models drift on temporal reasoning across long videos. The current prompt asks for both video-offset and match-clock OCR as cross-checks, but drift still happens.
**Your job:** Always use your own video-offset timestamp. Do NOT copy Gemini's. Step the video frame-by-frame to lock the strike timestamp.

### 4. Logging the opposition keeper's distributions
**Symptom:** Gemini reports a keeper distribution event but the keeper wore the wrong colour.
**Cause:** When the analyzed-team keeper isn't on camera but the opposition keeper is, the model sometimes logs the opposition keeper's release as if it were ours.
**Your job:** Colour-check every distribution event. The keeper kit colour at the moment of release is the test.

### 5. Conflating throw distance with kick type
**Symptom:** "GK Long Kick" labels on goal kicks; "Throw" labels on 40-yard balls.
**Your job:** Use the release-motion decision tree (rubric section). Ignore distance until step 3 of the tree.

---

## Loom video shot list (to record before the calibration cohort starts)

We don't have the videos yet. When recording, hit these beats:

### Video 1 — "Filling in a ground truth doc from scratch"
**Target length: 10-12 minutes**

1. (0:00) Open the template, save-as with the match slug
2. (1:00) Fill Metadata while talking through where each value comes from
3. (2:30) Open the video, note the duration on Metadata
4. (3:00) Walk through 3-4 events in real time:
   - One goal (with frame-stepping to confirm shooter colour)
   - One save (showing the antecedent-attack test)
   - One distribution (showing the release-motion decision)
   - One "I cannot tell — using Unclear" moment
5. (10:00) Run the converter, eyeball the JSON, commit

### Video 2 — "Reviewing the Gemini output as a second check"
**Target length: 10 minutes**

1. (0:00) Show the Gemini JSON side by side with your labeled JSON
2. (1:00) Walk through three disagreements:
   - One where Gemini was right and you missed it (recover the event)
   - One where Gemini was wrong (a phantom save) — show how to verify and skip
   - One where you both found the event but classified differently — show the rubric reasoning
3. (6:00) Show the known failure modes from this document with real examples
4. (9:00) Submit + final checklist

**Note for whoever records these:** Don't script them rigidly. Talking through real decisions on real tape is more useful than a polished script. Use a recent labeled match where you remember the gray areas.

---

## Tools and shortcuts that pay back fast

- **VLC frame-step** — `E` next frame, `D` previous frame. Set yourself a hotkey for `Pause` at the home row. You'll use this constantly.
- **VLC playback speed** — `+` faster, `-` slower. 1.5x is comfortable for review passes; 0.5x for save classification.
- **Excel "Fill down" for repeated values** — when 6 backpasses in a row are all `Pass / Short to defender / Defender`, drag the fill handle.
- **A dual monitor or wide screen** helps a lot — video on one side, Excel on the other. Single-monitor labelers tend to mis-timestamp.

## When you're stuck

If you've watched a moment three times and still can't classify it, **mark it `Unclear` and move on.** Don't burn 5 minutes on one event. The reviewer would rather see 10 `Unclear` rows than 5 confidently-wrong rows.

If you're stuck on something philosophical ("does this count as a save?"), **add it to [the Edge-Case Log](03b-edge-case-log.md)** with what you saw, what you ruled (best guess), and flag it for review. It gets resolved within the day and becomes canon for future labelers.

---

→ Next: [Calibration Process](05-calibration-process.md)
