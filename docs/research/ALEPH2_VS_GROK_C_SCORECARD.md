# Aleph 2.0 vs Grok C — scorecard

**Protocol:** [`ALEPH2_VS_GROK_C_BENCHMARK_PROTOCOL.md`](ALEPH2_VS_GROK_C_BENCHMARK_PROTOCOL.md) `aleph2-vs-grok-c-v1.0.2`
**Status:** EMPTY — pre-registered. Do not fill any cell after looking at a render until the axis definitions in protocol §4 have been read again.
**Scale:** 0 = fails · 1 = partial · 2 = good · 3 = indistinguishable from ground truth
**Rule:** Product Swap n=2 is two independent observations. Aleph 42/42 is a **reproducibility check**, not a second independent hinge reading. Do not write "arm 2, n=2" off 42/42 alone. Axis 13 ≤ 1 **pauses** Aleph spend (rule 8) and is recorded as an unstable hinge reading — not as "seed does not work."

Scorer: _______________ · Date viewed: _______________ · Spend this round: $________

---

## Run log (fill at submit time, not at score time)

| Arm | Run | Task / request id | Model | Seed | Prompt hash / note | Cost | Duration in / out | Output SHA-256 | Stored path |
|---|---|---|---|---|---|---|---|---|---|
| 0 control (Grok C) | existing | | | n/a | existing best config — do not re-prompt | | | | |
| 1 Product Swap | 1 | | recipe `2026-06` | n/a | image fields, not §3.1 | | | | |
| 1 Product Swap | 2 | | recipe `2026-06` | n/a | same | | | | |
| 2 Aleph +1 kf @ 2.235 s | 1 | | `aleph2` | **42** | §3.1 frozen prompt | | | | |
| 2 Aleph +1 kf @ 2.235 s | 2 | | `aleph2` | **42** (repeat) | reproducibility check — **not** a second independent draw | | | | |
| 2 Aleph +1 kf @ 2.235 s | 3 | | `aleph2` | **43** | buy **only if** 42/42 axis 13 = 3; this is the independent observation | | | | |
| 4 Aleph prompt-only | 1 | | `aleph2` | | §3.1, no keyframes | | | | |
| 4 Aleph prompt-only | 2 | | `aleph2` | | same | | | | |

Add rows for arms 3 / 5 / 6 / 7 only if tranche 2 is authorized after tranche 1.

---

## Scores

Leave cells blank until that run exists. Use `U` for unresolved (run 1 and run 2 disagree by ≥ 2 points on that axis).

| Axis | 0 Grok C | 1 PS r1 | 1 PS r2 | 1 verdict | 2 Aleph 42 | 2 Aleph 42rpt | 2 Aleph 43 (iff 13=3) | 2 hinge claim |
|---|---|---|---|---|---|---|---|---|
| 1 Identity | | | | | | | | |
| 2 Original motion | | | | | | | | |
| 3 Collar geometry | | | | | | | | |
| 4 Chest-band geometry | | | | | | | | |
| 5 Sleeve panels | | | | | | | | |
| 6 Open-jacket construction | | | | | | | | |
| 7 Occlusion recovery (t≈2.235 s / frame 134) | | | | | | | | |
| 8 Temporal consistency | | | | | | | | |
| 9 Typography | | | | | | | | |
| 10 Scene preservation | | | | | | | | |
| 11 Resolution | | | | | | | | |
| 12 Timing / truncation | | | | | | | | |
| 13 Reproducibility | n/a (existing n=1 — say so) | | | | 42 vs 42rpt | — | n/a until bought | |
| **Sum (1–12)** | | | | | | | | |

---

## Decision-rule application (protocol §5)

Tick **after** scores exist. Do not pre-tick.

- [ ] Rule 1 — arm 2/3 preserve source identity **and** adopt keyframe garment truth → warp worker not required; Aleph is a candidate; Verdict C may be re-opened as discussion
- [ ] Rule 2 — arm 2/3 inherit the keyframe's broken identity → warp worker stays; Aleph is propagation, not replacement
- [ ] Rule 3 — arm 4 ≥ arm 2/3 → keyframes add nothing
- [ ] Rule 4 — arm 3 beats arm 2 only on axis 7 → dense anchoring is escalation-only
- [ ] Rule 5 — any scored arm fails axis 13 → **no verdict this round**
- [ ] Rule 6 — arm 1 succeeds on identity + garment + motion → record; still no production wiring
- [ ] Rule 7 — tranche 1 both reproduce Grok failure modes → **stop; do not buy tranche 2**
- [ ] Rule 8 — Aleph 42/42 axis 13 ≤ 1 → **PAUSE** Aleph spend. Record: *seed 42 did not produce a stable hinge reading on one comparison.* Do **not** write "seed does not work."
- [ ] Rule 9 — arm 3 stills missing → **do not** generate new Grok stills mid-round

**Hinge claim allowed this round (circle one, protocol §4.1):**
- 42/42 ≤ 1 → unstable on this input; no Aleph verdict; cause among (ignored seed / residual stochasticity / this-clip instability) **not identified**
- 42/42 = 2 → hinge n=1, OBSERVED only; seed 43 not bought
- 42/42 = 3, no 43 yet → hinge is **n=1** (pair is a seed check). Do not write n=2.
- 42/42 = 3 and 43 agrees on axes 1, 2, 7 → honest n=2 + seed check
- 42/42 = 3 and 43 disagrees on axes 1, 2, or 7 → seed held; hinge seed-dependent; **unresolved**

**Verdict this round:** ______________________________
**Class of verdict:** OBSERVED / VERIFIED (circle). A VERIFIED Aleph hinge requires 42/42 = 3 **and** seed 43 agreeing on axes 1, 2, 7 **and** cited output checksums.

---

## Notes (observations only — do not rewrite the rubric here)

-
