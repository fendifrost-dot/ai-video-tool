# ARTIST_01 — Entity Resolution Audit

**Category:** Artist / Entity · **Applies to:** Fendi Frost (primary). Adaptable to any brand with a name collision — including Modest. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Determine whether search engines, knowledge graphs, and AI systems resolve the artist name to the correct entity at all. This is upstream of every other artist metric: if resolution fails, visibility numbers measure someone else.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.
- **Run this before any other ARTIST module.** All downstream metrics are uninterpretable until resolution is measured.
- The name collides with a globally dominant fashion entity. Treat collision handling as the module's central task, not a caveat.

## Inputs

- Name variants to test: `Fendi Frost`, `Fendi Frost music`, `Fendi Frost artist`, `Terrence Cleveland`, and combinations with Chicago, house, producer
- Search results and knowledge-panel state per variant
- AI platform responses per variant (from GEO_01)
- Context lock ground truth

## Procedure

1. Test each name variant on each surface (search, knowledge panel, AI platforms) in clean sessions, and record what entity is returned.
2. Classify each result: `correct entity` / `fashion-house collision` / `different person entirely` / `no entity resolved` / `conflated` (attributes of two entities merged). Conflation is the most damaging outcome and the easiest to miss.
3. Record whether a knowledge panel or entity card exists for the artist, on which surfaces, and what it contains.
4. Test the legal name (`Terrence Cleveland`) separately, and record whether the two names are linked to one entity anywhere. An unlinked legal name is a common gap.
5. Identify which sources appear to anchor correct resolution where it occurs, using `GEO_02` — these are the entity's load-bearing sources.
6. Identify the minimum bare query (`Fendi Frost` alone) resolution rate — this is the headline metric, since it reflects how a real person searches.
7. Record how much disambiguating context is required before resolution succeeds. Needing `Fendi Frost house music producer Chicago` to resolve is a measurable, reportable weakness.
8. Check whether structured data and profile `sameAs` links connect the entity's profiles to one another.

## Guards — known traps

- **Never count fashion-house results as artist visibility.** This is the primary failure mode this module prevents.
- Conflation (artist attributes mixed with fashion-house attributes) must be its own category — it is not partial success.
- Do not assume a knowledge panel is achievable or is a goal; measure its state, and treat obtaining one as an outcome of corroboration (`AUTH_05`), not a task.
- Never fabricate entity facts to force resolution.
- Test in clean sessions — personalization will resolve correctly for the operator and incorrectly for everyone else, which is exactly the wrong read.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `NAME VARIANT TESTED`
- `SURFACE / PLATFORM / DATE`
- `RESOLUTION RESULT (correct/collision/other-person/none/conflated)`
- `KNOWLEDGE PANEL PRESENT? / CONTENTS`
- `DISAMBIGUATION REQUIRED (how much context)`
- `ANCHORING SOURCES (from GEO_02)`
- `LEGAL NAME LINKED? (yes/no)`

## Default next measurement

Bare-name resolution rate per surface, monthly. This is the single headline metric for Fendi Frost until it is consistently correct.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `ARTIST_01`.
