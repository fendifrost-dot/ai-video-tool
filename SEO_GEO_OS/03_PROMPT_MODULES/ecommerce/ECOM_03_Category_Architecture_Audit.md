# ECOM_03 — Category Architecture Audit

**Category:** Ecommerce · **Applies to:** Modest (primary). · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Audit how the catalog is organized — categories, collections, facets, and their URLs — against how buyers actually navigate and search. Architecture is the highest-leverage and highest-risk ecommerce lever, so this module proposes carefully and never casually.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.
- Architecture changes mean URL changes, which invalidate every baseline at once and are only partly reversible. Nothing here is a small change; treat every proposal as Class-C-equivalent review.

## Inputs

- Full category, collection, and facet structure
- Crawl data from WEB_01, including parameter URL behavior
- Query mapping from ECOM_02
- Competitor category structures from the dossiers

## Procedure

1. Map the current architecture: categories, subcategories, collections, and how products are assigned. Note products in no category and products in many.
2. Map facet and parameter behavior: which facets generate crawlable URLs, whether they are indexable, and whether they duplicate category content. Uncontrolled faceted URLs are the most common serious ecommerce technical problem.
3. Compare the structure to the demand map from `ECOM_02`: is there a category page for each real demand cluster, and does each category correspond to something buyers actually search for?
4. Identify categories that exist for internal or merchandising reasons but match no external demand — not necessarily wrong, but they should not be treated as SEO surfaces.
5. Assess category page content: does each have unique introductory content and a reason to rank, or is it a bare product grid?
6. Check depth: how many clicks from home to a product, and are important categories buried?
7. Review competitor architecture for demand clusters they serve that the catalog does not — filtered by `UC-04` reasoning, since their structure is their choice.
8. For any proposed change, specify the URL impact, the redirect plan, and what baselines it would reset. **No architecture proposal is complete without this.**

## Guards — known traps

- Architecture changes reset baselines and break links. Never propose one casually or as a bundle of small edits.
- Faceted navigation can generate effectively unlimited URLs. Audit it before proposing anything else here.
- A category page with no unique content rarely deserves to rank; adding categories without content adds thin pages.
- `UC-04` — competitor structure is not proof.
- Merchandising and SEO can legitimately conflict. Surface the conflict for an owner decision rather than resolving it unilaterally.
- Small catalogs do not need deep hierarchies. Over-structuring a small catalog creates thin pages and dilutes signal.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `CATEGORY / FACET`
- `MATCHES A DEMAND CLUSTER? (from ECOM_02)`
- `UNIQUE CONTENT PRESENT?`
- `URL / PARAMETER BEHAVIOR`
- `INDEXABLE? (should it be?)`
- `CLICK DEPTH`
- `PROPOSED CHANGE + URL IMPACT + REDIRECT PLAN + BASELINES RESET`

## Default next measurement

Category-level impressions, clicks, and revenue per category, at 56 and 90 days — architecture changes take longer to settle than content changes and an early read will look like a loss.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `ECOM_03`.
