# LSEO_01 — GBP Category Audit

**Category:** Local SEO · **Applies to:** Boltz (primary). Modest only if a physical/retail presence is confirmed — see open question 7 in its context lock. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Establish what the business's Google Business Profile primary and secondary categories actually are, what categories the competitor set uses, and which category gaps correspond to services the business genuinely performs. Produces category *candidates with justification*, never a copy list.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.
- Category changes are among the highest-risk local edits — a primary category change resets category association. This module proposes; it never changes.

## Inputs

- Current GBP primary + secondary categories (from the profile itself, not from a third-party scrape)
- Confirmed service list from the brand context lock
- Competitor set (5-10), with the basis for inclusion stated: proximity, service overlap, or SERP occupancy
- Category-query SERP samples for the target service terms

## Procedure

1. Record the current primary and all secondary categories verbatim, with the date observed.
2. For each competitor, record primary + visible secondary categories. Note the retrieval method, since secondary categories are not always fully exposed.
3. Build a category frequency table across the competitor set, separating the *primary* column from the *secondary* column — they behave differently and should never be pooled.
4. For each category the business does not hold, answer one question in writing: **does the business actually perform this service?** If no, it is rejected here and does not proceed, regardless of competitor frequency.
5. For surviving candidates, check whether the category is the best available match for a service the business performs, or merely an adjacent one. Prefer precision over breadth.
6. Check whether the current primary category is the best match for the brand's *primary growth target* (for Boltz: engine replacement). A mismatch here is the single highest-impact finding this module can produce.
7. For each candidate, state the expected mechanism (which queries it could make the business eligible for) and the risk (what association it could dilute).

## Guards — known traps

- `UC-04` — competitor category frequency is evidence of competitor choice, not of effectiveness. Never recommend a category because competitors hold it.
- Never recommend a category describing a service the business does not perform. This is a hard stop, not a trade-off — it is misrepresentation.
- Do not pool primary and secondary categories in the frequency table.
- Category lists change over time; an undated observation is worthless. Date everything.
- One category change at a time. Simultaneous changes make the result unreadable and are unwindable only in theory.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `CURRENT PRIMARY CATEGORY`
- `PROPOSED CHANGE (primary / add secondary / remove secondary / none)`
- `SERVICE JUSTIFICATION (the actual service this reflects)`
- `COMPETITOR FREQUENCY (n of N, primary vs secondary)`
- `DILUTION RISK`

## Default next measurement

Category-query map-pack visibility and GBP discovery-search count, re-checked 28 and 56 days after any approved change, against the pre-change baseline.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `LSEO_01`.
