# Per-keeper performance — 2026-05-27

Tolerance ±10s. Bench: 5 files.

This breakdown answers: 'is the model's performance consistent across keepers, or is it Judah-specific?' Critical for detecting overfit after the first SFT pass.

**Current state: N=1 keeper in the corpus.** The harness is in place — when keeper #2 onboards and has reviewed matches, this report will surface any cross-keeper performance gap.

## Per-keeper breakdown

### Judah Marshall (`3bb9c12b`) — 5 match(es)

| Section | TP | FP | FN | Precision | Recall |
|---|---|---|---|---|---|
| goals | 3 | 29 | 25 | 9.4% | 10.7% |
| saves | 4 | 102 | 32 | 3.8% | 11.1% |
| distribution | 40 | 365 | 33 | 9.9% | 54.8% |

## Cross-keeper comparison

(needs ≥2 keepers in the corpus; not yet applicable)
