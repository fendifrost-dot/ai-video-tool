# GEO_03 — Source-to-Mention Conversion

**Category:** GEO / AI · **Applies to:** All brands. Run only after GEO_02 has at least two dated runs. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Measure whether being present on a source actually converts into being mentioned in AI answers. This is the module that tests the central GEO assumption instead of assuming it, and it is what stops the whole program from becoming faith-based.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.

## Inputs

- At least two dated GEO_02 source maps
- Record of where the brand gained or lost presence between runs
- Panel results across the same runs

## Procedure

1. Build the brand's presence set at time T1: which retrieved sources did the brand appear on?
2. Build the mention set at T1: which prompts mentioned the brand, on which platforms?
3. Repeat for T2. Identify sources where brand presence changed between T1 and T2 — through a fix, a new listing, coverage, or loss.
4. For each presence change, examine whether mention rate changed on prompts where that source is cited. Report the observation and, explicitly, **whether the design can support a causal claim** — usually it cannot without a control.
5. Compute a conversion indicator: of sources where the brand is present and which are cited for a prompt, what share of those prompts mention the brand? Track this over time.
6. Identify high-citation sources where the brand is present but still never mentioned — the presence is not converting, and something else is the constraint.
7. Flag confounders: platform model updates, competitor changes, seasonality, other concurrent interventions.

## Guards — known traps

- **This is correlational by default.** Never report a causal claim without a registered experiment with a control. Label it `observed`, not `confirmed`.
- Platform model updates can move everything at once. Always check for a platform change before attributing a shift to your work.
- Two runs is a trend of two points. Three is barely a trend. Say so.
- Presence without mention is a real finding worth reporting, not a failed measurement.
- Do not deploy multiple source changes at once and then attribute the result to one — that is the stacking error from `UC` rules.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `SOURCE / ORIGIN`
- `PRESENCE AT T1 / T2`
- `MENTION RATE AT T1 / T2 (on prompts citing that source)`
- `CONVERSION INDICATOR`
- `CAUSAL CLAIM SUPPORTED? (yes/no — usually no)`
- `CONFOUNDERS PRESENT`

## Default next measurement

Conversion indicator recomputed each monthly panel run; report as a series with sample counts, never as a single figure.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `GEO_03`.
