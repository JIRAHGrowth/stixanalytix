#!/usr/bin/env bash
# One-off driver — runs the 5-match bench against the v3 prompts.
# Pinned to commit 33ada57; outputs tagged `v3-prompts`.
set -uo pipefail

VARIANT="v3-prompts"
MODEL="gemini-2.5-flash"
VIDEOS_DIR="scripts/.bench-videos"
RESULTS_DIR="scripts/bench-results"
GT_DIR="scripts/ground-truth"

declare -a MATCHES=(
  "judah-2026-04-25:60cfa445-6364-4147-9830-0d1ddeffcb37"
  "judah-2026-05-02:bc00c75c-ffe8-4584-85e2-29f9aa492fa9"
  "judah-2026-05-16-oufc:a0877aa3-b47c-4077-84a7-8f3bced97ac4"
  "judah-2026-05-16-oufc-sosc:cf939885-f9ff-4d7b-bc2e-3d0815f40cb5"
  "judah-2026-05-23-pfc:573c54fc-38f3-4a9e-9341-ef821e91405e"
)

START=$(date +%s)
for entry in "${MATCHES[@]}"; do
  key="${entry%%:*}"; job="${entry##*:}"
  video="${VIDEOS_DIR}/${job}.mp4"
  truth="${GT_DIR}/${key}.json"
  out="${RESULTS_DIR}/${key}/${MODEL}.${VARIANT}.json"
  echo ""
  echo "============================================================"
  echo "BENCH ${key} (${job})"
  echo "============================================================"
  if [[ -f "${out}" ]]; then
    echo "  [skip] output already exists: ${out}"
    continue
  fi
  python scripts/run-bench-job-v2.py \
    --video "${video}" \
    --model "${MODEL}" \
    --out "${out}" \
    --vars-json "${truth}" \
    --media-resolution MEDIUM \
    --chunk-duration-sec 300 \
    --use-vertex \
    --enable-caching \
    --cache-ttl-sec 600 \
    2>&1 | tail -20
  echo "  --- eval ---"
  node scripts/eval-match.js \
    --truth "${truth}" \
    --gemini-output-file "${out}" \
    --tolerance 10 \
    2>&1 | tail -25
done
ELAPSED=$(( $(date +%s) - START ))
echo ""
echo "============================================================"
echo "BENCH COMPLETE in $((ELAPSED / 60))m $((ELAPSED % 60))s"
echo "============================================================"
