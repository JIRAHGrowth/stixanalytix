# Scripts

Local utilities supporting the video pipeline. The live production flow runs through the Modal worker — these scripts are for offline experiments, ground-truth runs, and building reference material.

## Index

- `test-gemini-match.js` / `run-gemini-match.py` — analyse a match video locally with Gemini, write JSON to `scripts/results/`.
- `load-gemini-match.js` — one-shot loader: take a Gemini result JSON + manual metadata, insert into `matches` and `goals_conceded`. Used before the upload UI existed; kept for emergency reloads.
- `build-gk-encyclopedia.js` — extract GK technique knowledge from coaching videos (T1TAN academy, etc.) into per-video JSONs. See [GK Encyclopedia workflow](#gk-encyclopedia-workflow) below.
- `aggregate-gk-encyclopedia.js` — merge per-video JSONs into a single `prompts/gk_techniques.md` reference doc.
- `setup-vercel-env.js` — push `.env.local` Modal vars to Vercel via API. One-shot.
- `eval-match.js` — eval harness: compares Gemini's output for a match to coach-tagged ground truth, prints precision/recall per event type. See [Eval workflow](#eval-workflow) below.

---

## Gemini GK match analysis (legacy / local)

### What it does
Sends a match video to Google Gemini 2.5 with a goalkeeper-specific prompt. Returns structured JSON of every GK event Gemini can identify (saves, goals, distributions, sweeper actions). This is the prototype for the StixAnalytix AI video pipeline.

## One-time setup

### 1. Get a Gemini API key (free)
Visit https://aistudio.google.com/app/apikey and create an API key. Free tier is generous for testing.

### 2. Save the key
Two options:

**Option A — environment variable (PowerShell):**
```
$env:GEMINI_API_KEY = "your-key-here"
```
This only lasts for the current PowerShell session. Set it again in each new terminal.

**Option B — `.env.local` file (persistent, easier):**
Add to `.env.local` at the project root:
```
GEMINI_API_KEY=your-key-here
```
The script reads this automatically.

### 3. Verify dependencies
```
pip install google-generativeai python-dotenv
```

## Run the analysis

From the project root:
```
python scripts/gemini_gk_analysis.py "C:\Users\joshu\OneDrive\Stixanalytix\05 - Match Library\Raw Recordings\2024\american_vs_virginia_2024.mp4"
```

Match videos live under `STIXANALYTIX_DATA_ROOT/05 - Match Library/Raw Recordings/[Year]/`.

Optional flags:
- `--prompt prompts/gk_analysis_v1.txt` — use a different prompt
- `--model gemini-2.5-flash` — cheaper, faster, less accurate
- `--model gemini-2.5-pro` — default, best quality

## What you'll see
1. Upload phase (5–15 min for a 1.9 GB file depending on connection)
2. Gemini processing (1–5 min — Gemini extracts frames and indexes the video)
3. Analysis (1–5 min — actual GK event detection)
4. Summary printed to console
5. Two output files in `scripts/results/`:
   - `<timestamp>_raw.json` — exactly what Gemini returned
   - `<timestamp>_parsed.json` — pretty-printed for review

## Iterating on the prompt
The prompt lives in `prompts/gk_analysis_v1.txt`. To try variations, copy it to `gk_analysis_v2.txt`, edit, and pass `--prompt prompts/gk_analysis_v2.txt`. Keeps version history clean.

## Cost estimate
Gemini 2.5 Pro on a ~90-min video: ~$5–15 per run.
Gemini 2.5 Flash on the same: ~$0.50–2 per run.

Start with Flash to debug the prompt, then run Pro for the real evaluation.

---

## GK Encyclopedia workflow

Goal: turn coaching reference videos (T1TAN academy, etc.) into a structured technique reference (`prompts/gk_techniques.md`) that the live Gemini pipeline includes as calibration context.

### Why we don't fine-tune or send reference videos per analysis

- **Fine-tuning** isn't practical for Gemini 2.5 Pro and even if it were, requires text-to-text examples, not video.
- **Sending reference videos with every match analysis** would double or triple the cost per match. Not viable at scale.
- **Extracting reference text once, including it in every prompt** is cheap (text tokens are tiny) and works with Gemini's 2M-token context.

### One-time per video — extraction

```
node scripts/build-gk-encyclopedia.js <folder-of-mp4s> [--model gemini-2.5-flash|pro] [--limit N]
```

For each `.mp4`/`.mov`/`.webm`/`.mkv` in the folder:
1. Uploads to Gemini Files API
2. Runs the extraction prompt at [`prompts/gk_techniques_extraction.md`](../prompts/gk_techniques_extraction.md)
3. Writes per-video JSON to `prompts/gk_techniques/raw/<filename>.json`

Idempotent — skips files whose extraction JSON already exists. Delete a JSON to re-extract.

Default model is `gemini-2.5-flash` (cheap iteration). Use `--model gemini-2.5-pro` for the final pass.

### Source videos: get them locally first

Coaching platforms (T1TAN, etc.) gate videos behind login. Whisper / Gemini / any transcription tool can't navigate auth flows. **Download local copies first.** Folder structure suggestion:

```
C:\Users\joshu\OneDrive\Stixanalytix\GK Reference\
  T1TAN\
    01-smother-technique.mp4
    02-cross-handling-positioning.mp4
    ...
```

Then point the script at that folder.

### Aggregate — merge into the encyclopedia

After all extractions complete (or any time you want a fresh encyclopedia):

```
node scripts/aggregate-gk-encyclopedia.js
```

Reads every JSON in `prompts/gk_techniques/raw/`, groups by canonical name, deduplicates aliases / cues / indicators, writes `prompts/gk_techniques.md`.

The aggregator is conservative — if two videos use slightly different names for the same technique, you'll get two entries. Fix by editing the source JSON's `name` field and re-running. Markdown is regenerated each time; never edit it directly.

### Cost estimate

- Flash on a 5-minute coaching clip: ~$0.10–0.50
- Pro on the same: ~$0.50–2

Dozens of videos at Flash: well under $20 total. One-time cost.

---

## Eval workflow

Goal: every prompt change becomes **measurable** rather than vibes-based. Without this, "I tweaked the prompt and goals look better" is unfalsifiable.

The eval compares Gemini's output for a match against a coach-tagged ground-truth JSON file and prints:

- **Precision** — of what Gemini reported, what fraction was real
- **Recall** — of what really happened, what fraction did Gemini catch
- **Per-event matched pairs**, false negatives (missed by Gemini), false positives (Gemini reported but not real)
- **Action accuracy** for matched saves (did Gemini classify the gk_action correctly?)

### Step 1 — tag the ground truth while watching the match

Copy the template:

```
cp scripts/ground-truth/_template.json scripts/ground-truth/<match-name>.json
```

Open the file, fill in the metadata + `events.goals` + `events.saves` while watching the recording. Use MM:SS format for timestamps. Notes are optional but helpful for diagnosing prompt failures.

This is the time-consuming part — but it only needs to happen once per match, and the resulting ground-truth files become a permanent test set that survives every future prompt change.

### Step 2 — upload the same match through the normal pipeline

Use `/upload` as you normally would. Note the `video_job_id` (visible in the URL or in Supabase's `video_jobs` table).

### Step 3 — run the eval

```
node scripts/eval-match.js \
  --truth scripts/ground-truth/<match-name>.json \
  --job <video_job_id> \
  --tolerance 10 \
  --save-report
```

The `--tolerance 10` means events within ±10 seconds match each other. `--save-report` writes a dated report to `scripts/eval-reports/` so you can track accuracy over time.

### Step 4 — compare prompt versions

After tweaking a prompt, upload the same match again (cheap with caching), get a new `video_job_id`, and run:

```
node scripts/eval-match.js --job <new-id> --vs-job <old-id>
```

This compares two Gemini runs without needing ground truth — useful for "did this prompt change shift the output, and how?"

### Building the eval set over time

Aim for 5–10 ground-truth-tagged matches across different conditions:

- High-action match with many saves
- Low-action match (one team dominated)
- Match with a clear scoreboard / on-screen clock
- Match without any scoreboard
- Match with cross-heavy attacks
- Match with distance-shooting

Once the set has 5+ matches, you can run all of them after a prompt change and see the aggregate effect. Per-match accuracy varies; the aggregate is the signal.
