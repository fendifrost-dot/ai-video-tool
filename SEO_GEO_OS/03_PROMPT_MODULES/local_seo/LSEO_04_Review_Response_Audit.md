# LSEO_04 — Review Response Audit

**Category:** Local SEO · **Applies to:** Boltz (primary). Any brand with a public review surface. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Measure response rate, response latency, and response quality — with response quality defined as *usefulness to a prospective customer reading it*, not keyword density.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.

## Inputs

- All reviews with response status and response timestamps
- Response text
- Owner's current response process and who owns it

## Procedure

1. Compute response rate overall, and split by rating band (negative reviews unanswered is a materially different finding than positive ones unanswered).
2. Compute median response latency, split by rating band.
3. Assess each negative-review response for whether it addresses the specific complaint, and whether it would reassure a prospect reading it later. This is the highest-value part of this module.
4. Flag responses that are templated to the point of visible repetition — a reader scanning ten responses notices.
5. Compare response rate and latency to the competitor set.
6. Record whether responses contain service terms, but classify any ranking effect as `hypothesis` per `UC-02`. Report it as a *neutral observation*, not a recommendation.

## Guards — known traps

- `UC-02` — keyword-bearing responses are unproven for ranking. Never recommend writing responses *for* keywords. The defensible reason to respond well is that prospects read them.
- Never propose a response that disputes facts publicly, discloses customer information, or reads as defensive. Reputational downside exceeds any SEO upside.
- Do not recommend responding to every review with generated text at volume — visible templating is worse than silence.
- Latency matters most on negative reviews; do not average it away.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `RESPONSE RATE (overall / by rating band)`
- `MEDIAN LATENCY (overall / by rating band)`
- `UNANSWERED NEGATIVE COUNT`
- `RESPONSE QUALITY ISSUE (specific)`
- `COMPETITOR COMPARISON`

## Default next measurement

Response rate and median latency by rating band, monthly. Any ranking claim requires the `UC-02` experiment, not this module.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `LSEO_04`.
