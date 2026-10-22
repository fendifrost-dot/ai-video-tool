# WEB_06 — CTR & Snippet Audit

**Category:** Website SEO · **Applies to:** All brands with GSC access. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Find pages earning impressions but not clicks, and diagnose whether the cause is the snippet, the SERP environment, or an intent mismatch. Only the first is fixable by editing the page.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.

## Inputs

- GSC page and query CTR data with position
- Current titles and meta descriptions from WEB_01
- Live SERP screenshots for the affected queries

## Procedure

1. Identify pages and queries where CTR is materially below what their average position would predict. State the expectation basis you are using rather than an unnamed industry curve.
2. **Look at the live SERP for each case before diagnosing.** A low CTR at position 3 under an AI overview, a large ad block, or a rich-result cluster is an environment effect, not a snippet defect — and no title rewrite fixes it.
3. For genuine snippet problems, assess the title: is the primary intent term present, is it truncated, is it duplicated across pages, does it say what the page is?
4. Assess the meta description: present, unique, accurate, and does it give a reason to click? Note that it is frequently rewritten by the search engine — do not overstate control.
5. Check for intent mismatch: the page ranks but does not match what the searcher wants. That routes back to `WEB_03`/`WEB_04`, not to a snippet rewrite.
6. Check whether rich results are available and being earned for these pages (review, product, FAQ, breadcrumb) — a missing eligible rich result is a snippet finding.
7. Prioritize by clicks-at-stake, not by CTR delta. A large percentage gap on 40 impressions is not worth an hour.

## Guards — known traps

- Never diagnose CTR without looking at the actual SERP. This is the single most common error in CTR work.
- Meta descriptions are advisory; engines rewrite them often. Do not promise CTR gains from a description rewrite.
- Averaged position hides variance — a page averaging position 8 may be alternating between 3 and 15.
- Do not write clickbait titles that misdescribe the page. Short-term CTR at the cost of trust and bounce is a bad trade.
- Seasonality and query mix shift CTR independently of anything you do. Use a long enough window.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `PAGE / QUERY`
- `IMPRESSIONS / CTR / POSITION`
- `DIAGNOSIS (snippet / SERP environment / intent mismatch)`
- `SERP FEATURES PRESENT (observed, dated)`
- `CLICKS AT STAKE (estimate + basis)`
- `PROPOSED TITLE OR DESCRIPTION`

## Default next measurement

CTR at held-constant position for the named query/page pairs, 28 and 56 days after an approved snippet change. If position moved materially, the CTR read is confounded — say so rather than claiming the win.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `WEB_06`.
