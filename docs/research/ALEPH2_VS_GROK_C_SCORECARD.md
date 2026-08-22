# Aleph 2.0 vs Grok C — scorecard

**Protocol:** [`ALEPH2_VS_GROK_C_BENCHMARK_PROTOCOL.md`](ALEPH2_VS_GROK_C_BENCHMARK_PROTOCOL.md) `aleph2-vs-grok-c-v1.0.0`
**Status:** EMPTY — pre-registered. Do not fill any cell after looking at a render until the axis definitions in protocol §4 have been read again.
**Scale:** 0 = fails · 1 = partial · 2 = good · 3 = indistinguishable from ground truth
**Rule:** n=2 per paid arm. An arm that wins on run 1 and loses on run 2 is **unresolved**, not a win. Axis 13 is not optional.

Scorer: _______________ · Date viewed: _______________ · Spend this round: $________

---

## Run log (fill at submit time, not at score time)

| Arm | Run | Task / request id | Model | Seed | Prompt hash / note | Cost | Duration in / out | Output SHA-256 | Stored path |
|---|---|---|---|---|---|---|---|---|---|
| 0 control (Grok C) | existing | | | n/a | existing best config — do not re-prompt | | | | |
| 1 Product Swap | 1 | | recipe `2026-06` | n/a | image fields, not §3.1 | | | | |
| 1 Product Swap | 2 | | recipe `2026-06` | n/a | same | | | | |
| 2 Aleph +1 kf @ 2.235 s | 1 | | `aleph2` | | §3.1 frozen prompt | | | | |
| 2 Aleph +1 kf @ 2.235 s | 2 | | `aleph2` | | same | | | | |
| 2 best-arm seed B (tranche 2 / if promoted) | 1 | | `aleph2` | different | same | | | | |
| 2 best-arm repeated seed | 2 | | `aleph2` | repeat of run 1 | same | | | | |
| 4 Aleph prompt-only | 1 | | `aleph2` | | §3.1, no keyframes | | | | |
| 4 Aleph prompt-only | 2 | | `aleph2` | | same | | | | |

Add rows for arms 3 / 5 / 6 / 7 only if tranche 2 is authorized after tranche 1.

---

## Scores

Leave cells blank until that run exists. Use `U` for unresolved (run 1 and run 2 disagree by ≥ 2 points on that axis).

| Axis | 0 Grok C | 1 Product Swap r1 | 1 r2 | 1 verdict | 2 Aleph+1kf r1 | 2 r2 | 2 verdict |
|---|---|---|---|---|---|---|---|
| 1 Identity | | | | | | | |
| 2 Original motion | | | | | | | |
| 3 Collar geometry | | | | | | | |
| 4 Chest-band geometry | | | | | | | |
| 5 Sleeve panels | | | | | | | |
| 6 Open-jacket construction | | | | | | | |
| 7 Occlusion recovery (t≈2.235 s / frame 134) | | | | | | | |
| 8 Temporal consistency | | | | | | | |
| 9 Typography | | | | | | | |
| 10 Scene preservation | | | | | | | |
| 11 Resolution | | | | | | | |
| 12 Timing / truncation | | | | | | | |
| 13 Reproducibility | n/a (existing n=1 artifacts — say so) | | | | | | |
| **Sum (1–12)** | | | | | | | |

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

**Verdict this round:** ______________________________
**Class of verdict:** OBSERVED / VERIFIED (circle). A VERIFIED verdict requires axis 13 pass + cited output checksums.

---

## Notes (observations only — do not rewrite the rubric here)

-
