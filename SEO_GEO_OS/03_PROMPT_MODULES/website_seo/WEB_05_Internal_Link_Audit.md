# WEB_05 — Internal Link Audit

**Category:** Website SEO · **Applies to:** All brands with an owned website. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Map how internal linking distributes crawl access and topical signal, and whether the money pages are actually well-connected. Internal linking is the cheapest, most reversible, most under-used lever on most small sites.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.

## Inputs

- Crawl link graph from WEB_01
- Money-page list from WEB_03
- Navigation, footer, and in-body link inventories, kept separate

## Procedure

1. Build the internal link graph and compute inbound internal links per URL, **separating template links (nav/footer) from in-body contextual links.** Pooling them makes every page look equally linked and hides the real finding.
2. Identify money pages with few or no contextual inbound links. This is the most common high-value finding in this module.
3. Identify orphan pages (no internal links) and near-orphans (reachable only from the sitemap or deep pagination).
4. Compute click depth from the homepage to each money page. Depth greater than three on a small site usually indicates a structural problem.
5. Audit anchor text on contextual links into money pages: is it descriptive of the destination, or generic (here, read more)?
6. Identify pages with high inbound authority but no onward links to money pages — these are the cheapest wins available.
7. Flag over-linking: pages with very large in-body link counts, where each link's value is diluted and the page reads as a hub with no editorial judgment.

## Guards — known traps

- Separate template links from contextual links, always.
- Internal linking is reversible and low-risk, which makes it the right first lever — but it is not a substitute for a page that does not deserve to rank.
- Do not recommend exact-match anchor text at scale. Descriptive and varied is the standard.
- Adding links to navigation is a structural change affecting every page; treat it as higher risk than in-body links.
- On an ecommerce site, faceted navigation can generate enormous link volume. Exclude parameter URLs from the graph or the analysis is noise.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `TARGET PAGE`
- `CONTEXTUAL INBOUND LINKS (count)`
- `TEMPLATE INBOUND LINKS (count)`
- `CLICK DEPTH`
- `ANCHOR TEXT QUALITY`
- `PROPOSED SOURCE PAGES FOR NEW LINKS`

## Default next measurement

Contextual inbound link count and click depth for each money page, plus that page's impressions/position, 28 days after an approved linking batch.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `WEB_05`.
