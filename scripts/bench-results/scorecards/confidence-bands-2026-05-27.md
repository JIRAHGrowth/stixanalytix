# Confidence-band precision — gemini-2.5-flash.v3-prompts.reconciled.json

Bench files: 5 · Tolerance: ±10s

Goal: empirically test whether the model's `confidence` label correlates with TP rate. If `high` precision >> `medium` >> `low`, confidence becomes a usable filter. If precision is flat across bands, the field is misleading and should be either dropped or re-defined.

---

## Roll-up across all matches

### goals

| Confidence | Events | TP | FP | Precision | % of total |
|---|---|---|---|---|---|
| `high` | 32 | 3 | 29 | 9.4% | 100.0% |

### saves

| Confidence | Events | TP | FP | Precision | % of total |
|---|---|---|---|---|---|
| `high` | 106 | 4 | 102 | 3.8% | 100.0% |

### distribution

| Confidence | Events | TP | FP | Precision | % of total |
|---|---|---|---|---|---|
| `high` | 405 | 40 | 365 | 9.9% | 100.0% |

---

## Per-match

| Match | Section | Band | TP | FP | Precision |
|---|---|---|---|---|---|
| judah-2026-04-25 | goals | `high` | 1 | 5 | 16.7% |
| judah-2026-04-25 | saves | `high` | 2 | 16 | 11.1% |
| judah-2026-04-25 | distribution | `high` | 11 | 79 | 12.2% |
| judah-2026-05-02 | goals | `high` | 0 | 10 | 0.0% |
| judah-2026-05-02 | saves | `high` | 2 | 16 | 11.1% |
| judah-2026-05-02 | distribution | `high` | 19 | 99 | 16.1% |
| judah-2026-05-16-oufc | goals | `high` | 1 | 4 | 20.0% |
| judah-2026-05-16-oufc | saves | `high` | 0 | 21 | 0.0% |
| judah-2026-05-16-oufc | distribution | `high` | 5 | 67 | 6.9% |
| judah-2026-05-16-oufc-sosc | goals | `high` | 1 | 10 | 9.1% |
| judah-2026-05-16-oufc-sosc | saves | `high` | 0 | 42 | 0.0% |
| judah-2026-05-16-oufc-sosc | distribution | `high` | 2 | 63 | 3.1% |
| judah-2026-05-23-pfc | saves | `high` | 0 | 7 | 0.0% |
| judah-2026-05-23-pfc | distribution | `high` | 3 | 57 | 5.0% |

---

## Verdict

- **goals**: **DEGENERATE — 100% of events labeled `high`.** Precision at `high` is 9.4%. The model is not using `medium`/`low` at all; the field is structurally meaningless. Implications: (1) drop `confidence` from the schema OR redefine its semantics, (2) Rule A (drops low-conf dist) is a no-op in current state, (3) self-awareness of uncertainty is a known training gap that SFT can address.
- **saves**: **DEGENERATE — 100% of events labeled `high`.** Precision at `high` is 3.8%. The model is not using `medium`/`low` at all; the field is structurally meaningless. Implications: (1) drop `confidence` from the schema OR redefine its semantics, (2) Rule A (drops low-conf dist) is a no-op in current state, (3) self-awareness of uncertainty is a known training gap that SFT can address.
- **distribution**: **DEGENERATE — 100% of events labeled `high`.** Precision at `high` is 9.9%. The model is not using `medium`/`low` at all; the field is structurally meaningless. Implications: (1) drop `confidence` from the schema OR redefine its semantics, (2) Rule A (drops low-conf dist) is a no-op in current state, (3) self-awareness of uncertainty is a known training gap that SFT can address.
