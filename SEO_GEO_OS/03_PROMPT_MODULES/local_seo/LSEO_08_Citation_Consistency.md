# LSEO_08 — Citation Consistency Audit

**Category:** Local SEO · **Applies to:** Boltz (primary). Modest — with the no-public-phone rule strictly enforced. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Find every place the business's name, address, and phone appear across the web, and identify inconsistencies. Consistency is the defensible objective; raw citation count is not, and the two are routinely confused.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.

## Inputs

- Canonical NAP from the context lock — this is the reference, and it must be settled first
- Directory and aggregator listings
- Search results for the business name, phone, and address
- Any prior citation audit

## Procedure

1. Confirm the canonical NAP from the context lock. **If it is not settled, stop** — an audit against an unsettled reference produces false inconsistencies.
2. Search for each NAP element independently. Searching the phone number and the address separately surfaces listings that a name search misses.
3. Record every listing found: source, exact name/address/phone as displayed, and whether each matches canonical.
4. Classify each mismatch: outdated (a real former value), typo, formatting-only, or a duplicate/merged listing. These need different fixes and have different severity.
5. Flag duplicate listings for the same location — duplicates are typically more damaging than a formatting variance and are harder to remove.
6. Trace where inconsistent data propagates from. One wrong aggregator record can feed dozens of downstream listings; fixing the origin is worth more than fixing the copies (cross-reference `../../06_SOURCE_PROVENANCE/`).
7. Separate findings into: correctness fixes (high value) and net-new listing opportunities (unproven value, per `UC-08`).

## Guards — known traps

- **Modest:** no public phone exists. Never generate a placeholder, and treat any listing showing a phone for Modest as an error to investigate, not a field to fill.
- `UC-08` — do not conflate consistency with count. Fix consistency first and measure it before adding listings.
- Formatting-only variance (Ste vs Suite) is real but low severity. Do not report it at the same weight as a wrong phone number.
- Fix the propagation origin, not just the visible copies, or the inconsistency returns.
- Some directories are low-quality or spam; adding listings there is not a neutral act.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `SOURCE / DIRECTORY`
- `NAME AS LISTED`
- `ADDRESS AS LISTED`
- `PHONE AS LISTED`
- `MISMATCH TYPE (outdated/typo/format/duplicate/none)`
- `PROPAGATION ORIGIN (if known)`
- `SEVERITY`

## Default next measurement

Count of inconsistent listings and count of duplicate listings, re-checked 60 days after an approved correction batch — aggregator propagation is slow, so a 28-day check reads as failure regardless of outcome.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `LSEO_08`.
