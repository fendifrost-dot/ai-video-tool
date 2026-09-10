# LSEO_03 — Review Velocity & Language Analysis

**Category:** Local SEO · **Applies to:** Boltz (primary). Any brand with a public review surface. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Measure review count, rating, velocity, and recency against the competitor set, and analyze what customers actually say — specifically whether the brand's primary growth service appears in customer language at all. This is a listening module, not a solicitation module.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.

## Inputs

- Review count, average rating, and full review dates for the business
- Same for each competitor in the set
- Review text for the trailing 12 months (business only, unless competitor text is needed for language comparison)
- Current review-request process, if any (owner-stated)

## Procedure

1. Build a monthly review-count series for the business and each competitor for at least 12 months. Report count, velocity (reviews/month), and recency (days since last review) as **three separate metrics** — they are routinely conflated.
2. Compute the gap to the competitor set on each metric separately. Note which metric the business is actually behind on; the answer is often not the one assumed.
3. Extract service terms customers use unprompted. Tag each review for which service it describes.
4. Compute the share of reviews mentioning the primary growth service (for Boltz: engine work). A large gap between revenue mix and review mix is a real finding — it means the highest-value work is invisible on the profile.
5. Identify recurring complaint themes. Operational findings are legitimate output of this module and should be reported even though they are not SEO.
6. Assess review recency distribution — a high count with nothing recent reads differently to a consumer than a low count that is current.

## Guards — known traps

- **Hard stop:** never propose scripting, incentivizing, or steering customers to include keywords in reviews. Not a risk trade-off — excluded on principle.
- `UC-05` — do not assert velocity outweighs total count. Report them separately and let the data speak.
- Review gating (soliciting only happy customers) is excluded on the same principle as keyword steering.
- Rating average is a lagging, heavily-anchored metric; a fractional change requires large volume. Do not propose interventions targeting it directly.
- Competitor review counts can include reviews for other locations or merged entities. Verify before comparing.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `METRIC (count / velocity / recency / rating)`
- `BUSINESS VALUE vs COMPETITOR MEDIAN`
- `PRIMARY-SERVICE MENTION SHARE`
- `UNPROMPTED SERVICE TERMS OBSERVED`
- `OPERATIONAL THEME (if any)`

## Default next measurement

Monthly review count, velocity, recency, and primary-service mention share — tracked monthly regardless of intervention, since this is a standing monitor.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `LSEO_03`.
