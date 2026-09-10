# ECOM_05 — Image Retrieval Audit

**Category:** Ecommerce · **Applies to:** Modest (primary). · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Audit product imagery for discoverability and machine-readability: whether images are indexable, described, fast, and whether the facts they carry also exist in text — since a retrieval system cannot read a photograph.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.

## Inputs

- Image inventory from the WEB_01 crawl
- Alt text, filenames, and image sitemap presence
- Image loading and format implementation
- Product attribute list from ECOM_04

## Procedure

1. Inventory product images per page: count, dimensions, format, and file size.
2. Audit alt text: present, descriptive, and accurate — or missing, generic, or keyword-stuffed. Alt text is an accessibility requirement first and a discovery input second; treat it in that order.
3. Check that images are crawlable: not blocked, not lazy-loaded in a way that hides the `src` from non-JS retrievers, and present in an image sitemap where one exists.
4. Check filenames — descriptive rather than `IMG_4821` — while noting the effect is modest and renaming carries redirect cost on an existing catalog.
5. **Identify facts carried only by images.** If the rabbit-fur patch, a construction detail, or a colorway is visible only in a photo and stated nowhere in text, it is invisible to text retrieval. Route these to `ECOM_04`.
6. Check image coverage against buyer needs: multiple angles, scale reference, detail shots of signature elements, and on-model context.
7. Check performance: oversized images on product and category templates, and whether modern formats and responsive sizing are used.
8. Verify the schema `image` property points to the real primary product image (`ECOM_01`).

## Guards — known traps

- Alt text is an accessibility requirement. Never stuff it with keywords — that degrades the experience for screen-reader users and is the wrong trade regardless of any search effect.
- Never write alt text describing something not in the image.
- Renaming files on a live catalog requires redirects and can lose accumulated image-search history — weigh the cost.
- Lazy-loading implementations vary; verify what a non-JS retriever actually sees rather than assuming.
- Image-only facts are a retrieval blind spot — this is the module's highest-value finding and the easiest to overlook.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `PRODUCT / IMAGE`
- `ALT TEXT STATE (present/missing/generic/stuffed)`
- `CRAWLABLE? (incl. non-JS visibility)`
- `FILENAME QUALITY`
- `IMAGE-ONLY FACTS (route to ECOM_04)`
- `COVERAGE GAP (angles/detail/scale)`
- `FILE SIZE / FORMAT`

## Default next measurement

Alt-text coverage rate, image-only-fact count outstanding, and image-search impressions in GSC at 56 days.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `ECOM_05`.
