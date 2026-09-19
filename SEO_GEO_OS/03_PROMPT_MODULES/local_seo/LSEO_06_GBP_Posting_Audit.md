# LSEO_06 — GBP Posting Audit

**Category:** Local SEO · **Applies to:** Boltz (primary). · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Record current and competitor posting behavior as an observational baseline, and — critically — hold the line that posting frequency is an unproven ranking lever. Output is a baseline and a possible experiment design, not a posting schedule justified by ranking claims.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.

## Inputs

- Post history: dates, types, content, CTAs
- Competitor post history where visible
- Any available post view/interaction data

## Procedure

1. Record the business's post history: cadence, types, and whether posts carry a working CTA.
2. Record competitor cadence where visible. Note that post visibility decays, so historical competitor data is systematically incomplete — say so.
3. Assess whether existing posts communicate anything a prospect needs (offers, capacity, turnaround, service availability) or are filler.
4. If any interaction data exists, record it as the only directly measurable outcome of posting.
5. If posting is to be pursued, design it as a registered experiment under `UC-01`: fixed cadence, all other GBP fields frozen, a pre-period baseline, and a stated failure criterion.
6. Report the cost side honestly: posting is recurring human effort with an unproven ranking return and a modest direct-visibility return.

## Guards — known traps

- `UC-01` — posting frequency boosting ranking is a **hypothesis**. Never present a posting cadence as a ranking recommendation.
- Posts expire and competitor history is incomplete by construction. Do not present competitor cadence as reliably measured.
- Do not recommend high-volume posting to manufacture activity signals.
- If posting proceeds, it must be a registered experiment or it will produce another year of unfalsifiable belief.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `CURRENT CADENCE (posts/month, trailing 6mo)`
- `POST TYPES USED`
- `CTA PRESENT / FUNCTIONAL`
- `COMPETITOR CADENCE (with visibility caveat)`
- `EXPERIMENT DESIGN PROPOSED? (yes/no)`

## Default next measurement

Post interaction counts and, only under a registered `UC-01` experiment, non-branded map-pack impressions against the frozen-field baseline.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `LSEO_06`.
