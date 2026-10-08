# GEO_05 — Platform Share of Voice

**Category:** GEO / AI · **Applies to:** All brands. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Measure the brand's share of AI mentions relative to a defined competitor set, per platform and per prompt category — so that visibility is tracked against the field rather than in isolation.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.

## Inputs

- GEO_01 panel transcripts
- Defined competitor set, with the inclusion basis stated
- Consistent prompt categorization

## Procedure

1. Fix the competitor set and record why each is included. Changing the set mid-series invalidates the trend, exactly like changing the panel.
2. For each prompt and platform, record every brand mentioned, in order of appearance.
3. Compute share of voice: brand mentions / total brand mentions, per platform and per prompt category. Report the denominator every time.
4. Weight by framing where useful — being recommended is not the same as being listed as an also-ran. If you weight, publish the weighting.
5. Report per platform separately. Pooled share-of-voice across platforms with different behavior is a misleading average.
6. Identify prompt categories where the brand is strong and weak, and cross-reference the weak ones to `GEO_02` to see which sources drive them.
7. Track the series over time with sample counts and variance.

## Guards — known traps

- The competitor set determines the number. Publish the set alongside the number, every time.
- Share of voice is not market share and does not imply revenue. Do not let it become a vanity KPI.
- Prompt panel composition determines the result — a panel skewed to prompts the brand wins produces a flattering, useless number.
- Non-determinism applies; report variance.
- For Fendi Frost, exclude resolution failures from share-of-voice entirely. Counting a fashion-house mention as artist voice is the failure mode this whole system exists to prevent.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `PLATFORM`
- `PROMPT CATEGORY`
- `BRAND MENTIONS / TOTAL MENTIONS (with denominator)`
- `SHARE OF VOICE %`
- `FRAMING-WEIGHTED SHARE (if used, with weighting published)`
- `COMPETITOR SET VERSION`
- `VARIANCE`

## Default next measurement

Monthly share of voice per platform and prompt category, reported with the competitor set version and sample counts.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `GEO_05`.
