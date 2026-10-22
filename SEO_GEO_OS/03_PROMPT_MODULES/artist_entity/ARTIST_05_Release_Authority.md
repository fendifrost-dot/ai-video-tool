# ARTIST_05 — Release Authority Audit

**Category:** Artist / Entity · **Applies to:** Fendi Frost. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Audit how releases are attributed, credited, and rights-registered — including how Runway Music is represented. Registration and credit data is upstream of a large share of what platforms and AI systems state about an artist.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.
- **Runway Music's formal nature is an open question** (label, imprint, collective, or positioning term). Correct treatment differs for each; resolve with the owner before recommending any registration or schema change.

## Inputs

- Release metadata as submitted at distribution
- Credit and rights database entries
- Label/imprint representation across platforms
- Owner clarification on Runway Music's formal status

## Procedure

1. Resolve with the owner what Runway Music formally is. This determines whether it should appear as a label, an imprint, an organization entity, or only as positioning language.
2. Audit how Runway Music currently appears across releases and platforms, and record inconsistencies.
3. Audit release-level credits: are the artist's roles (artist, producer, engineer) credited accurately and in line with the approved hierarchy?
4. Audit rights and credit database entries for accuracy and completeness. These feed many downstream profiles and AI answers.
5. Check identifier consistency across releases where identifiers exist, and record gaps.
6. Identify releases where attribution is wrong, incomplete, or split across profiles, and record the correction route for each.
7. Assess whether release metadata submitted at distribution matches what appears on platforms — divergence indicates either a submission error or platform-side transformation, and the two need different fixes.
8. Cross-reference `GEO_04`: which credit errors are already appearing in AI answers? Those are the priority corrections.

## Guards — known traps

- Do not recommend registering or representing Runway Music as a label if it is not one. Misrepresenting an entity in rights databases has consequences beyond SEO.
- Credit corrections in rights databases can be slow and hard to reverse. Verify with the owner before submitting.
- Never alter credit attribution to improve retrieval — credits are factual claims about who did the work.
- Distribution-side metadata is usually the controllable lever; platform-side display often is not. Say which is which.
- Do not assume identifier standards apply uniformly across release types.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `RELEASE`
- `LABEL/IMPRINT AS DISPLAYED`
- `CREDITS AS DISPLAYED vs ACTUAL`
- `ROLE ORDER CORRECT?`
- `DATABASE ENTRY STATE`
- `IDENTIFIER PRESENT?`
- `DIVERGENCE: SUBMITTED vs DISPLAYED`
- `APPEARING IN AI ANSWERS? (from GEO_04)`

## Default next measurement

Count of releases with fully accurate credits and consistent imprint representation, plus outstanding database corrections, quarterly.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `ARTIST_05`.
