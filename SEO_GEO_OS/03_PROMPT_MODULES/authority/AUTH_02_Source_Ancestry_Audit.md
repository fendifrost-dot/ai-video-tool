# AUTH_02 — Source Ancestry Audit

**Category:** Authority · **Applies to:** All brands. Run before any authority claim is made in any report. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Trace every source mentioning the brand back to its original informational origin, so that apparent breadth is not mistaken for independent corroboration. This is the module that prevents the single most common authority self-deception.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.

## Inputs

- All known sources mentioning the brand (from AUTH_01, AUTH_04, GEO_02, and manual search)
- Publication dates and, where available, bylines
- `../../06_SOURCE_PROVENANCE/SOURCE_PROVENANCE_LEDGER.csv`

## Procedure

1. Compile every known source mentioning the brand into one list.
2. For each, retrieve the publication date and the substance of what it says.
3. Cluster sources by content: near-identical wording, identical facts in identical order, or shared distinctive phrasing indicates a shared origin.
4. For each cluster, identify the **earliest** source, and mark it the information origin. Everything else in the cluster is a derivative and must be linked to it.
5. Classify each source: `original` (independently produced), `derivative` (restates an origin), `syndicated` (formally republished), or `unknown ancestry`.
6. Count distinct information origins. **This number, not the raw source count, is the brand's real corroboration base.** Report both, with the origins number leading.
7. Flag clusters where a single origin has produced very wide apparent coverage — high fragility, since a correction or removal at the origin propagates.
8. Record each finding in the provenance ledger with its `information_origin_id`.

## Guards — known traps

- **Raw source count is not authority.** Never report it without the collapsed origin count beside it.
- Earliest publication date is strong but not conclusive evidence of origin — dates can be backfilled or missing. Mark `unknown ancestry` rather than guessing.
- A press release distributed to many outlets is one origin, even if it produces fifty URLs.
- First-party sources (the brand's own site and profiles) are never independent corroboration. Count them separately.
- **Modest:** notable-wearer claims must be traced this way. A claim repeated across many sites with one unverified origin remains `unknown`, and repetition is not corroboration.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `SOURCE URL`
- `PUBLICATION DATE`
- `CLUSTER ID`
- `INFORMATION ORIGIN ID`
- `RELATIONSHIP (original/derivative/syndicated/unknown)`
- `INDEPENDENT? (yes/no)`
- `FIRST-PARTY? (yes/no)`

## Default next measurement

Distinct independent information origin count, quarterly. This is the headline authority metric for all three brands.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `AUTH_02`.
