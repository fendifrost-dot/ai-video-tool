# 04 — Measurement

Baselines, metric definitions, and monthly reporting templates.

| Path | Purpose |
|---|---|
| `METRIC_DEFINITIONS.md` | What each metric means and how it is computed — the anti-drift file |
| `templates/` | One monthly report template per brand |
| `baselines/` | Dated, immutable baseline artifacts (crawls, panel runs, exports) |

## Baseline rules

1. **Baselines are immutable.** A baseline is never edited or re-derived. A superseding baseline is a new
   dated artifact, and both are kept.
2. **Every baseline is dated and self-describing** — what was captured, how, with what tool, and what was
   excluded.
3. **Never compare across different capture methods** without saying so explicitly.

**Currently empty.** Three baselines are known to exist outside this OS and need importing:
the Modest 2026-08-19 immutable baseline (`DQ-006`), the Boltz Batch 1 baseline (`DQ-004`), and the
Fendi Frost I1a baseline (`DQ-005`). Until they are here, no measurement in this OS can be diffed against
anything.
