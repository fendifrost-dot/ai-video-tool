# WEB_03 — Money Page Audit

**Category:** Website SEO · **Applies to:** All brands with an owned website. Highest priority for Boltz (engine replacement) and Modest (product/category pages). · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Deep-audit the small set of pages that actually carry revenue intent, against both search relevance and conversion clarity. Most sites have fewer than ten of these, and they are routinely audited as if they were ordinary pages.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.

## Inputs

- The money-page list, confirmed with the owner — not inferred from traffic
- Crawl data for those pages from WEB_01
- GSC query data for those pages
- The pages as a prospect sees them, on mobile

## Procedure

1. Confirm the money-page list with the owner. For Boltz this must include the engine-replacement page(s); for Modest, top category and top SKU pages.
2. For each page, record what query intent it is actually built to satisfy, and whether that matches the queries it receives in GSC.
3. Audit the conversion path: is the primary action visible without scrolling on mobile, is it functional, and how many steps to complete it? A broken or buried CTA outranks every SEO finding on the page.
4. Audit content sufficiency for the intent: does the page answer what a buyer at that stage needs (for engine replacement: cost drivers, timeline, warranty, process, alternatives)? Gaps here are usually the real ranking constraint.
5. Check trust signals present on the page: reviews, credentials, guarantees, real photography, contact clarity.
6. Check the page's technical state from WEB_01 — a money page with an indexability or render problem is a critical finding.
7. Record internal links *into* the page and their anchor text (feeds `WEB_05`).
8. Check whether the page is retrievable without JavaScript, since these are the pages most worth citing in AI answers.

## Guards — known traps

- Do not infer the money-page list from traffic. The highest-value page may currently have almost none — that is often the finding.
- Conversion problems outrank ranking problems on these pages. Report them even though they are not strictly SEO.
- Do not recommend adding volume to a page for its own sake. Sufficiency for the intent is the standard.
- Audit on mobile first. Desktop review of a mobile-majority page systematically misses the real experience.
- Money pages are usually inside an active experiment. Check the registry before proposing changes.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `PAGE URL`
- `INTENT IT SERVES`
- `QUERIES IT ACTUALLY RECEIVES`
- `CONVERSION PATH ISSUE`
- `CONTENT SUFFICIENCY GAP`
- `TRUST SIGNALS PRESENT`
- `TECHNICAL STATE (from WEB_01)`

## Default next measurement

Per-page: non-branded impressions, clicks, position for target queries, and the conversion event rate — 28 and 56 days after approved changes.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `WEB_03`.
