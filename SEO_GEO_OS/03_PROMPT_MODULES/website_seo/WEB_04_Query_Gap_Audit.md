# WEB_04 — Query Gap Audit

**Category:** Website SEO · **Applies to:** All brands. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Find demand the site is not eligible for at all — queries with real commercial intent where no page exists or no page is appropriate. Distinct from WEB_07, which addresses topical coverage; this is about eligibility for specific transactional demand.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.

## Inputs

- GSC query data (what the site is already eligible for)
- Competitor page inventories from the dossiers
- SERP samples for target service/product terms
- Customer language evidence from LSEO_03 or support/email

## Procedure

1. Build the list of queries the site currently receives impressions for. This defines current eligibility.
2. Build the target demand list from: confirmed services/products, customer phrasing, and competitor page inventories. Keep the source of each term.
3. Diff the two. Queries with commercial intent and zero impressions are gaps.
4. For each gap, determine whether an existing page could plausibly serve it (a relevance/optimization fix) or no page exists (a content gap). These have very different costs and should never be merged.
5. Score each gap by the brand weighting. For Boltz, engine-related gaps carry the highest business value; for Modest, purchase-intent product and category gaps outrank trend terms regardless of volume.
6. Check the SERP for each high-value gap: what page *type* ranks? If the SERP is dominated by marketplaces, directories, or national brands, note the realistic ceiling before recommending a page.
7. Flag gaps where the honest answer is that the site cannot realistically compete — recommending a page that cannot rank is a cost with no return.

## Guards — known traps

- Do not build the gap list from keyword-tool volume alone. Volume without intent is the classic trap and is exactly what the brand weighting exists to counter.
- A gap is only real if the business actually serves that demand.
- Check SERP composition before recommending content. Some SERPs are structurally closed to a single-location business or a small brand.
- Do not propose a page per keyword variant. One page per intent.
- Modest: vanity fashion terms are `low` commercial relevance by brand rule, even at high volume.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `QUERY / DEMAND CLUSTER`
- `INTENT (transactional / comparison / informational)`
- `CURRENT ELIGIBILITY (impressions or none)`
- `GAP TYPE (no page / wrong page / weak page)`
- `SERP COMPOSITION + REALISTIC CEILING`
- `BRAND COMMERCIAL WEIGHT`

## Default next measurement

Eligibility check: does the site now receive impressions for the named query cluster? 56 days after any approved page ships — new pages need longer than 28 days to register.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `WEB_04`.
