# 02 — Module Output Contract

**Status:** ACTIVE · **Last updated:** 2026-08-22

Every module in `../03_PROMPT_MODULES/` returns findings in this exact shape. Uniform output is what makes
the decision queue mergeable across brands and modules.

One finding = one block. A module run returns N blocks plus a coverage statement.

---

## Required fields

```
FINDING ID:            <MODULE>-<BRAND>-<YYYYMMDD>-<n>
OBSERVATION:           What was found. Specific and falsifiable. No adjectives doing load-bearing work.
SOURCE:                Where the evidence came from — URL / export / tool + date observed + sampling limits.
CLASSIFICATION:        confirmed | observed | owner-confirmed | hypothesis | unknown
IMPACT:                high | medium | low
COMMERCIAL RELEVANCE:  high | medium | low
AI/RETRIEVAL RELEVANCE:high | medium | low
CONFIDENCE:            high | medium | low
RECOMMENDED ACTION:    What to do. If the honest answer is "nothing yet," say that.
DEPLOYMENT REQUIRED?:  yes | no
EXPERIMENT CONFLICT?:  yes | no   (checked against EXPERIMENT_REGISTRY.csv — cite the experiment ID)
CAN RESEARCH NOW?:     yes | no
NEXT MEASUREMENT:      The metric, the surface, and the date it should be re-checked.
ACTION CLASS:          RESEARCH NOW | PREPARE NOW | DEPLOY NOW | HOLD FOR EXPERIMENT | REJECT
OPPORTUNITY SCORE:     <number>  (per 04_OPPORTUNITY_SCORING.md; show the inputs)
```

## Coverage statement (once per run, not per finding)

```
MODULE:            <id>
BRAND:             <brand>
RUN DATE:          <YYYY-MM-DD>
SCOPE INSPECTED:   e.g. "18 of 42 product URLs (sitemap-ordered, first 18)"
NOT INSPECTED:     What was skipped and why
TOOLS USED:        crawler / GSC export / manual retrieval / etc.
BLOCKERS:          Access, rate limits, missing exports
```

## Field discipline

- **IMPACT** = size of the effect on the surface if the recommendation is right.
- **COMMERCIAL RELEVANCE** = closeness to revenue for *this* brand. Weighted per brand in
  `04_OPPORTUNITY_SCORING.md` — vanity reach is `low` even at high volume.
- **AI/RETRIEVAL RELEVANCE** = whether it changes what an LLM/answer engine can retrieve or state.
  These diverge often: a robots.txt rule can be `low` SEO impact and `high` retrieval impact.
- **CONFIDENCE** is about the *inference*, not the observation. You can be `confirmed` on the fact and
  `low` on what it implies. This pairing is expected and should not be smoothed over.
- **DEPLOYMENT REQUIRED?** `yes` means it changes a live surface — which means it is frozen by default
  (`06_DEPLOYMENT_FREEZE.md`).
- **CAN RESEARCH NOW?** `no` only when blocked by access, a missing baseline, or experiment
  contamination. Say which.

## Handoff

Every finding is appended as one row to `../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv`.
A module run is not complete until the queue is updated.
