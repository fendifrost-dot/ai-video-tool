# ECOM_06 — Shopping & Feed Visibility Audit

**Category:** Ecommerce · **Applies to:** Modest (primary). Requires knowing the ecommerce platform and feed setup — both currently `unknown`. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Audit product feed health and shopping-surface visibility, including free listings. Feed data is a primary machine-readable representation of the catalog and frequently disagrees with both the site and its schema.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.
- Blocked until the platform and whether a Merchant Center (or equivalent) feed exists are confirmed — Modest open questions 5 and 6.

## Inputs

- Product feed export, if one exists
- Merchant Center account status, disapprovals, and warnings
- Site product data and schema for cross-checking
- Shopping-surface presence for key products

## Procedure

1. Confirm whether a feed exists, how it is generated (platform-native, app, or manual), and how often it updates. A manually maintained feed drifts and the drift rate is the finding.
2. Pull the full feed export and audit required attributes: id, title, description, link, image link, availability, price, brand, condition, and identifiers (GTIN/MPN) or their explicit absence.
3. **Diff feed data against live site data and against schema (`ECOM_01`).** Three-way disagreement on price or availability is a critical finding — it can suppress listings and mislead buyers.
4. Record all disapprovals and warnings, grouped by cause rather than by product. Causes are fixable; individual product errors are symptoms.
5. Audit feed titles: they are the primary matching surface and often carry unedited internal naming. Compare to buyer vocabulary from `ECOM_02`.
6. Check free-listing eligibility and opt-in status — free listings are frequently unconfigured and cost nothing to enable.
7. Check policy compliance areas relevant to apparel: sizing, materials, and any restricted-material considerations for fur-derived elements. Flag for owner review rather than deciding unilaterally.
8. Sample shopping-surface presence for key products and record whether they appear.

## Guards — known traps

- Feed, site, and schema must agree. Never fix one in isolation.
- **Never misstate availability, price, or condition in a feed.** It is a policy violation and a customer harm.
- Fur-derived materials may face platform policy restrictions and disclosure requirements. Flag for owner and, where relevant, legal review — do not make the call inside this module.
- Feed titles are not a keyword field. Accuracy and buyer vocabulary, not stuffing.
- Missing GTINs are common for independent brands; document the actual requirement for the category rather than assuming the listing is doomed.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `FEED EXISTS? / GENERATION METHOD / UPDATE FREQUENCY`
- `REQUIRED ATTRIBUTE COVERAGE`
- `FEED vs SITE vs SCHEMA DISAGREEMENT (field-level)`
- `DISAPPROVALS BY CAUSE`
- `TITLE QUALITY vs BUYER VOCABULARY`
- `FREE LISTINGS ENABLED?`
- `POLICY FLAG (materials/disclosure)`

## Default next measurement

Approved-product count, disapproval count by cause, and free-listing impressions/clicks — 28 days after an approved feed fix, since feed changes propagate faster than site changes.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `ECOM_06`.
