# WEB_02 — Search Console Opportunity Mining

**Category:** Website SEO · **Applies to:** All brands with GSC access. **Confirm access before running** — Boltz open question 2. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Mine Search Console for queries and pages where a small movement produces disproportionate return: striking-distance positions, high-impression low-CTR pages, and queries the site ranks for on the wrong page. Weighted by commercial intent, not by volume.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.

## Inputs

- GSC performance export: query x page x impressions x clicks x CTR x position, longest window available
- Site URL inventory from WEB_01
- Brand commercial weighting from `../../00_SYSTEM_RULES/04_OPPORTUNITY_SCORING.md`

## Procedure

1. Export query-level and page-level data for the longest available window, and record the window explicitly — comparisons across different windows are meaningless.
2. Segment branded from non-branded queries before any analysis. Branded performance masks everything and inflates every aggregate.
3. Find striking-distance queries (roughly positions 5-20) with meaningful impressions, and rank them by commercial intent per the brand weighting — **not** by impression count.
4. Find high-impression, low-CTR pages where position does not explain the CTR. These route to `WEB_06`.
5. Find query cannibalization: one query where the ranking URL fluctuates between pages, or where the ranking page is not the best page. This is common and frequently fixable without new content.
6. Identify queries with impressions but effectively zero clicks across a long window — often a relevance or intent mismatch rather than a ranking problem.
7. For Boltz specifically, isolate engine-replacement and engine-adjacent queries and report them as their own segment regardless of their aggregate size.
8. Cross-reference the top opportunities against WEB_01 to check that the target page is technically sound before recommending content work.

## Guards — known traps

- GSC position is an average across many contexts; it is not a rank. Do not report averaged position as if it were a stable ranking.
- Impressions inflate for queries the site barely appears on. Filter to meaningful impression floors and state the floor.
- Segment branded vs non-branded, or every conclusion is wrong.
- GSC data is sampled and truncated for long tails. Absence in GSC is not absence of demand.
- Do not rank opportunities by volume. The brand weighting exists precisely to stop that.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `QUERY OR PAGE`
- `CURRENT POSITION / IMPRESSIONS / CTR`
- `OPPORTUNITY TYPE (striking-distance / low-CTR / cannibalization / intent-mismatch)`
- `COMMERCIAL INTENT (per brand weighting)`
- `TARGET PAGE (existing or needed)`
- `DATA WINDOW`

## Default next measurement

Position, impressions, clicks, and CTR for the specific named queries, re-checked 28 and 56 days after any approved change, using the same window length as the baseline.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `WEB_02`.
