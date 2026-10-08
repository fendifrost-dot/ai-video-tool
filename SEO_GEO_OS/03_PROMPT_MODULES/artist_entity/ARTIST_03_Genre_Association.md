# ARTIST_03 — Genre & Sound Association Audit

**Category:** Artist / Entity · **Applies to:** Fendi Frost. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Measure which genres, scenes, and sonic descriptors are associated with the artist across platforms and AI systems, against the intended associations (house/electronic, Chicago). Genre association drives algorithmic placement and discovery far more than keyword presence does.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.

## Inputs

- Target genre and scene associations from the context lock
- Platform genre tags on artist and release pages
- AI association responses (from GEO_06)
- Comparable-artist associations returned by platforms

## Procedure

1. Record target associations from the context lock, treating them as *intent*, not as current state.
2. Audit platform genre tags on each artist profile and each release. Tags frequently differ across platforms and across releases for the same artist.
3. Record which genres AI platforms associate with the artist, verbatim, and whether the intended ones appear at all.
4. Record comparable/similar artists returned by platforms and AI. This reveals the scene the systems have placed the artist in, which is often more informative than the genre label itself.
5. Identify mismatches between intended and observed association, and check whether any retrieved source actually states the intended genre. If no source states it, the gap is upstream and no amount of measurement will close it.
6. Check whether release metadata carries consistent genre information at the point of distribution — this is usually the controllable upstream lever.
7. Track association drift over time; genre association shifts with new releases and with platform reclassification.

## Guards — known traps

- Never propose claiming a genre association that does not reflect the actual work. Fabricated positioning is both dishonest and self-defeating.
- Genre tags are partly assigned by distributors and partly by platform classifiers — separate what is controllable from what is not.
- Comparable-artist lists are algorithmic and volatile; sample repeatedly.
- Do not conflate genre association with the Chicago geographic association — track them separately (`GEO_06`).
- An association absent from all sources cannot be fixed downstream. Route it to `AUTH_03`/`AUTH_04`.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `TARGET ASSOCIATION`
- `OBSERVED ON PLATFORM (tags, verbatim)`
- `OBSERVED IN AI ANSWERS (verbatim)`
- `COMPARABLE ARTISTS RETURNED`
- `SOURCE STATES IT? (from GEO_02)`
- `CONTROLLABLE UPSTREAM? (distribution metadata vs classifier)`

## Default next measurement

Per-association presence rate across platforms and AI, monthly, alongside the comparable-artist set as a qualitative series.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `ARTIST_03`.
