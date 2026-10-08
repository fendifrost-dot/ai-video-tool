# WEB_01 — Technical Crawl Audit

**Category:** Website SEO · **Applies to:** All brands with an owned website (Boltz, Modest; Fendi Frost only if an owned site exists — see its open question 5). · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Establish the site's actual technical state from a full crawl: what exists, what is reachable, what is indexable, and what is broken. Every other website module depends on this being current, and on it being a crawl rather than a recollection.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.
- Crawling is read-only but not zero-impact. Use a reasonable rate limit and identify the crawler.
- Crawl output is a dated artifact. Store it under `../../04_MEASUREMENT/baselines/` — later modules diff against it.

## Inputs

- Full site crawl (all templates, not a sample)
- XML sitemap(s) and robots.txt
- Index coverage report if GSC access exists
- Render-mode check: does key content require JavaScript?

## Procedure

1. Crawl the full site and record the URL inventory: status codes, titles, meta descriptions, canonicals, headings, word counts, and internal link counts.
2. Diff the crawl inventory against the sitemap. Both directions matter: sitemap URLs that do not exist, and live URLs absent from the sitemap.
3. Record every non-200: 404s, redirect chains and loops, 5xx, and soft-404s.
4. Check indexability directives — robots.txt rules, meta robots, canonical targets — and flag any page blocked or canonicalized away that should be indexed. **Also flag the reverse**: pages indexable that should not be (staging, filters, parameter duplicates, internal search).
5. Test render mode: fetch key templates with JavaScript disabled and record what content disappears. Content that only exists after JS is a retrieval risk for AI crawlers that do not execute it — this is often the highest-value finding on modern ecommerce stacks.
6. Record duplicate and near-duplicate titles, meta descriptions, and H1s at template level, not just page level.
7. Check Core Web Vitals / field data if available, and page weight on the money templates.
8. Verify HTTPS, redirect consistency (www/non-www, trailing slash), and that one canonical host serves everything.

## Guards — known traps

- Crawl the full site. A partial crawl reported as a site audit is the most common quiet lie in this discipline — if you sample, state the sample in `SCOPE INSPECTED`.
- A crawler is not a browser. Confirm JS-rendered content separately rather than assuming the crawl saw everything.
- Do not report every technical nit at equal weight. Separate *blocking* (indexability, broken money pages) from *hygiene* (a long meta description).
- Do not propose a site-wide structural change from this module alone — redirects and URL changes invalidate every baseline at once.
- Third-party crawl tools disagree on soft-404 and duplicate detection. Cite the tool.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `ISSUE TYPE (indexability / availability / duplication / render / performance / hygiene)`
- `URLS AFFECTED (count + examples)`
- `BLOCKING OR HYGIENE?`
- `TEMPLATE-LEVEL OR PAGE-LEVEL?`
- `AI-CRAWLER IMPACT (does it change what a non-JS retriever sees?)`

## Default next measurement

Re-crawl 28 days after any approved fix batch; diff URL inventory, status-code distribution, and indexable-page count against the stored baseline crawl.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `WEB_01`.
