# Gemini GK Analysis — Scripts

## What this does
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
