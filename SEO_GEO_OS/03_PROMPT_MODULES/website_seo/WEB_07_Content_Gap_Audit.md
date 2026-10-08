# WEB_07 — Content Gap Audit

**Category:** Website SEO · **Applies to:** All brands. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Identify topical coverage gaps relative to what buyers need to know and what competitors cover — with a hard filter for commercial relevance and a hard filter against content that exists only to exist.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.

## Inputs

- Site content inventory from WEB_01
- Competitor content inventories from the dossiers
- Query gaps from WEB_04
- Real customer questions from reviews, email, and sales conversations

## Procedure

1. Inventory existing content by topic and by buyer stage, not by URL count.
2. Build the buyer-question list from real sources — reviews (`LSEO_03`), support email, sales conversations. Real questions beat inferred topics every time.
3. Map competitor topical coverage from the dossiers, recording what they cover and, where visible, whether it performs.
4. Diff to find gaps, then apply two filters in order: (a) does answering this help a buyer of a service or product we sell? (b) does it plausibly influence a purchase decision? Anything failing both is `REJECT`.
5. For surviving gaps, decide whether the answer belongs on an existing money page (usually better) or needs its own page. Strengthening a money page beats a new thin page in most cases.
6. For each proposed piece, state the specific query cluster and buyer stage it serves, and how it will be measured.
7. Check whether the gap is better served by a non-content fix — a clearer product description, an FAQ block on the money page, a photo.

## Guards — known traps

- Content volume is not a goal. Every proposed piece needs a named query cluster and a measurement plan, or it is `REJECT`.
- Competitor coverage is not proof of value — a competitor's blog may be a cost center. `UC-04` reasoning applies here too.
- Prefer strengthening an existing money page over creating a new page. New thin pages dilute and add maintenance cost.
- Do not propose AI-generated content at volume to fill gaps; it fails the sufficiency test and creates a durable liability.
- Modest: fashion-trend content with no path to a product page is `low` commercial relevance by brand rule.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `TOPIC / QUESTION`
- `EVIDENCE IT IS ASKED (source)`
- `BUYER STAGE`
- `COMMERCIAL FILTER RESULT (pass/fail)`
- `PLACEMENT (existing money page / new page / non-content fix)`
- `QUERY CLUSTER SERVED`

## Default next measurement

For each shipped piece: impressions and clicks for its named query cluster, plus assisted conversions where measurable, at 56 and 90 days.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `WEB_07`.
