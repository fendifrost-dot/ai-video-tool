# GEO_02 — Retrieval Source Map

**Category:** GEO / AI · **Applies to:** All brands. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Map which sources AI platforms actually cite when answering the panel prompts — for the brand and for competitors. This converts GEO from guesswork into a targetable list: you cannot influence retrieval without knowing what is being retrieved.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.

## Inputs

- GEO_01 run transcripts with full citation lists
- Provenance taxonomy from `../../06_SOURCE_PROVENANCE/`
- Competitor dossiers

## Procedure

1. Extract every cited source across all panel responses and platforms into one table: URL, domain, which prompt, which platform, which entity it supported.
2. Classify each source by type using the provenance taxonomy (first-party, independent editorial, directory, database, syndication, derivative, UGC, marketplace, review, social).
3. **Collapse derivatives into information origins.** Five domains republishing one press release are one origin. Report both counts — raw citations and distinct origins — and lead with origins.
4. Identify which sources are cited for competitors but never for this brand. These are the concrete retrieval targets, and they are the main output of this module.
5. Identify which sources the brand appears on but that are never cited — presence without retrieval value, which prevents wasted effort.
6. Rank source targets by: citation frequency across platforms, independence, and whether inclusion is achievable through legitimate means.
7. Note platform-specific patterns: platforms differ sharply in whether they favor directories, editorial, or first-party sources. Report per-platform, not pooled.

## Guards — known traps

- Raw citation counts overstate diversity. Always collapse to information origins first — this is the core discipline of the module.
- A source being cited does not mean inclusion in it causes citation. That is `hypothesis` (`UC-06`, `UC-07`).
- Do not recommend acquiring placement on a source through payment presented as editorial, or through any manufactured route.
- Citations are volatile between runs. Aggregate across samples and runs before drawing target conclusions.
- Some platforms cite sources they did not actually use, and some use sources they do not cite. Treat citation lists as evidence, not ground truth.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `SOURCE URL / DOMAIN`
- `SOURCE TYPE`
- `INFORMATION ORIGIN ID`
- `CITED FOR (brand / competitor / both)`
- `PLATFORMS CITING IT`
- `CITATION FREQUENCY`
- `BRAND PRESENT ON IT? (yes/no)`
- `ACHIEVABLE LEGITIMATELY? (yes/no/unknown)`

## Default next measurement

Distinct-origin citation count for the brand, and count of competitor-cited origins where the brand is absent — monthly, from the panel runs.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `GEO_02`.
