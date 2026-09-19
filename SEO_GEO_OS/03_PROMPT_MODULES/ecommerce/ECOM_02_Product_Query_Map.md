# ECOM_02 — Product Query Map

**Category:** Ecommerce · **Applies to:** Modest (primary). · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Map each product and category to the queries real buyers use, and find products with genuine demand that no page currently serves well. Weighted hard toward purchase intent per the brand rule.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.

## Inputs

- Full product and category inventory
- GSC query data segmented to product/category URLs
- On-site search data if available — the highest-signal source available and routinely ignored
- Customer language from reviews, email, and social

## Procedure

1. Inventory every product and category page with its current target query, if one was ever defined.
2. Pull GSC data segmented to these URLs and record what each page actually receives.
3. **Mine on-site search data.** What visitors type into the site's own search is direct evidence of demand and vocabulary mismatch, and it usually reveals products people expect but cannot find.
4. Build the buyer vocabulary set: what customers call these items, which frequently differs from internal or design-led naming (a `rabbit-fur patch hoodie` may be searched by garment type, not by signature element).
5. Map queries to pages, and flag: products with demand but no dedicated page, products with a page that ranks for nothing, and queries where multiple pages compete.
6. Apply the brand weighting: purchase-intent product and category queries score `BusinessValue` 5; vanity fashion and trend terms score 1-2 regardless of volume.
7. Identify category-level demand that no category page serves — usually higher value than any single SKU page.
8. Flag naming mismatches where product titles use internal language a buyer would never search.

## Guards — known traps

- **Brand rule:** purchase intent outranks volume. A high-volume trend term with no path to a product page is `low` commercial relevance.
- Do not create a page per keyword variant. One page per product or per genuine category.
- On-site search data reflects people already on the site; it shows vocabulary and gaps, not total market demand. Use it for language, not for sizing.
- Do not rename products purely for search if the name carries brand meaning — flag the tension and let the owner decide.
- Check stock and lifecycle before recommending investment in a page for a product being discontinued.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `PRODUCT / CATEGORY`
- `CURRENT PAGE (or none)`
- `QUERIES RECEIVED (GSC)`
- `BUYER VOCABULARY OBSERVED (source)`
- `ON-SITE SEARCH SIGNAL`
- `GAP TYPE (no page / weak page / naming mismatch / competing pages)`
- `PURCHASE INTENT (per brand weighting)`

## Default next measurement

Per mapped page: non-branded impressions, clicks, and add-to-cart rate for the named query cluster, at 56 days.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `ECOM_02`.
