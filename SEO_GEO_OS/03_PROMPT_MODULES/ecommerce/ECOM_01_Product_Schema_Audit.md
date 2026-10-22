# ECOM_01 — Product Schema Audit

**Category:** Ecommerce · **Applies to:** Modest (primary). Any brand selling products. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Audit structured data across product, category, and organization surfaces for presence, validity, and — most importantly — factual accuracy against live page content. Schema is how machines read a catalog, and wrong schema is worse than none.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.
- **Blocked until the canonical brand string is settled** (`Modest` vs `MOD#$T` vs `Modest Streetwear Apparel Inc.`) — see the Modest context lock's next decision point. Schema hard-codes the entity name, and redoing it later is expensive.

## Inputs

- Crawl data from WEB_01 including extracted structured data
- Live product pages for spot verification
- Canonical entity data from the context lock
- Structured data validation output (name the validator)

## Procedure

1. Inventory which schema types exist on which templates: `Product`, `Offer`, `AggregateRating`, `BreadcrumbList`, `Organization`, `ItemList` on category pages.
2. Validate syntax and required/recommended properties, and record errors separately from warnings.
3. **Verify accuracy against the rendered page, field by field.** Price, availability, currency, SKU, brand, and image must match what the customer sees. A mismatch is both an SEO defect and a trust/compliance problem — this step is the core of the module.
4. Check `Organization`/`Brand` markup for entity consistency: the exact name string, `sameAs` links to official profiles, logo, and contact. **Modest: no phone — omit the property entirely rather than inventing one.**
5. Check whether `AggregateRating` is present and whether it reflects genuine collected reviews. Never mark up ratings that do not exist on the page.
6. Check `availability` accuracy against real stock state, and how it updates. Stale availability markup is a common and damaging defect.
7. Verify schema is present in the raw HTML rather than injected only after JavaScript execution — retrievers that do not run JS will miss it entirely (cross-reference `WEB_01`).
8. Check category pages for appropriate list markup and breadcrumbs.

## Guards — known traps

- **Never mark up data that is not on the page or not true.** Fabricated ratings, fake availability, or invented prices are policy violations and a legal exposure, not an SEO tactic.
- **Modest:** never emit a `telephone` property. The absence is a fact.
- Schema validity is not schema accuracy. A perfectly valid `Product` block with a wrong price is worse than no block.
- `UC-07` — schema increasing AI citation is a hypothesis. Justify schema on eligibility and machine-readability, not on a promised citation lift.
- Do not add schema types that do not apply. Type sprawl creates maintenance cost and error surface.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `TEMPLATE / URL`
- `SCHEMA TYPES PRESENT`
- `VALIDATION ERRORS / WARNINGS (separate)`
- `ACCURACY VS RENDERED PAGE (field-level)`
- `IN RAW HTML OR JS-INJECTED?`
- `ENTITY NAME STRING USED`
- `MISSING RECOMMENDED PROPERTIES`

## Default next measurement

Valid + accurate schema coverage as a percentage of product URLs, plus rich-result eligibility in GSC, re-checked 28 days after an approved batch.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `ECOM_01`.
