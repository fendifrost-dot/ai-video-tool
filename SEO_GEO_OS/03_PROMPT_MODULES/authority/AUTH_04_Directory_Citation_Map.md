# AUTH_04 — Directory & Citation Map

**Category:** Authority · **Applies to:** All brands. Boltz: local directories. Modest: retail/brand directories. Fendi Frost: music platforms and artist databases. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Map the structured directories, databases, and platforms relevant to each brand, recording presence, accuracy, and — critically — whether each is actually retrieved by AI systems, so effort goes to directories that matter rather than to volume.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.

## Inputs

- Category-appropriate directory and database list
- Current presence and listing accuracy
- GEO_02 retrieval data
- Canonical entity data from the context lock

## Procedure

1. Build the directory list appropriate to the brand type. For Fendi Frost this includes music databases and rights/credit registries, where accuracy has downstream effects on many derived profiles.
2. Record current presence on each: listed / not listed / listed incorrectly / duplicate listings.
3. For each listing, verify accuracy against the context lock. **Accuracy outranks presence** — an incorrect listing actively propagates errors into AI answers.
4. Cross-reference `GEO_02`: mark which directories are actually cited by AI platforms. Split the list into retrieved and not-retrieved.
5. Identify which directories feed others. Upstream databases propagate to many downstream listings, and fixing upstream is worth many downstream fixes.
6. Prioritize: (1) fix incorrect listings on retrieved directories, (2) fix incorrect listings on upstream feeders, (3) add missing listings on retrieved directories, (4) everything else, which is usually not worth doing.
7. Flag low-quality or spam directories and exclude them explicitly.

## Guards — known traps

- `UC-08` — listing count is not a proven ranking lever. Consistency and accuracy are the defensible objectives.
- **Modest:** no public phone. Never enter a placeholder; leave the field empty and note when a directory requires one, since that may make the listing infeasible.
- **Modest:** the canonical brand string is an open decision. Do not create listings under an inconsistent string before it is settled — that manufactures the exact inconsistency this module exists to prevent.
- **Fendi Frost:** music database entries feed many downstream profiles. Errors there are expensive and slow to correct; verify before submitting anything.
- Do not submit to directories that exist only to sell listings.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `DIRECTORY / DATABASE`
- `PRESENT? (listed/not/incorrect/duplicate)`
- `ACCURACY VS CONTEXT LOCK`
- `RETRIEVED BY AI? (from GEO_02)`
- `FEEDS OTHER DIRECTORIES? (which)`
- `PRIORITY TIER (1-4)`
- `REQUIRES A FIELD WE DO NOT HAVE? (e.g. phone)`

## Default next measurement

Count of accurate listings on retrieved directories, and count of known-incorrect listings outstanding — quarterly, with a 60-day recheck after corrections, since propagation is slow.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `AUTH_04`.
