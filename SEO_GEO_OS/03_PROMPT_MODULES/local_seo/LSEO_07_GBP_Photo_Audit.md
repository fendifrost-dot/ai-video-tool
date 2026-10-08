# LSEO_07 — GBP Photo Audit

**Category:** Local SEO · **Applies to:** Boltz (primary). Modest only if a physical presence is confirmed. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Audit photo inventory, coverage, recency, and quality against what a prospect needs to see — and resolve, mechanically, whether EXIF geotagging survives upload at all before anyone spends effort on it.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.

## Inputs

- Full photo inventory by category (exterior, interior, team, work performed, equipment)
- Upload dates and owner-vs-customer attribution
- Photo view data if available
- One test image with known EXIF, for the stripping check

## Procedure

1. Inventory photos by category and count, and record the date of the most recent owner upload.
2. Identify coverage gaps against what a prospect for the primary service would want to see — for Boltz, evidence of engine work and the facility, not stock imagery.
3. Assess quality: resolution, lighting, and whether images are genuine or generic stock. Stock imagery on a local profile is a credibility finding.
4. Compare the ratio of owner photos to customer photos, and the recency of both.
5. **Resolve `UC-03` mechanically before any geotagging work:** upload one test image with known EXIF GPS, re-download it from the profile, and inspect whether the EXIF survived. If it is stripped, geotagging is mechanically dead — record it as `REJECT` with the evidence and close the question permanently.
6. Record photo view counts where available as the only directly measurable photo outcome.

## Guards — known traps

- `UC-03` — geotagging is a hypothesis with a weak prior. Do the stripping test first; it costs minutes and can close the question outright.
- Never propose fabricated, stock, or AI-generated imagery presented as the real facility or real work.
- Photo *view* counts are a visibility proxy, not a ranking metric. Do not conflate them.
- Customer photos cannot be controlled; do not build recommendations that depend on them.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `CATEGORY`
- `COUNT`
- `MOST RECENT UPLOAD`
- `COVERAGE GAP`
- `EXIF SURVIVES UPLOAD? (confirmed yes / confirmed no / untested)`

## Default next measurement

Photo count by category, most-recent-upload date, and photo views — monthly. The EXIF question is measured once and then closed.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `LSEO_07`.
