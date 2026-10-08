# Intervention Log — <BRAND> — <BATCH ID>

**Deployment date:** YYYY-MM-DD
**Deployed by:**
**Decision queue rows:** DQ-xxx, DQ-xxx
**Experiment ID (if part of one):**
**Approved by / when:**

---

## What changed

| Surface | Before | After | DQ row |
|---|---|---|---|
| | | | |

Record the *before* state precisely. Reconstructing it later is usually impossible, and without it the
change cannot be reversed or interpreted.

## What deliberately did not change

Surfaces held constant to keep the measurement readable. Being explicit here is what makes the batch
interpretable later.

## Baseline

- **Baseline artifact:** (path in `../04_MEASUREMENT/baselines/`)
- **Baseline date:**
- **Metrics captured:**

## Measurement plan

| Checkpoint | Date | Metric | Success | Failure |
|---|---|---|---|---|
| CP1 | | | | |
| CP2 | | | | |

Success and failure criteria are written **before** deployment. Filling them in afterward produces a
post-hoc story, not a result.

## Confounders known at deployment

Other changes, seasonality, campaigns, platform updates, competitor activity.

## Outcome

**CP1 result:**
**CP2 result:**
**Verdict:** success / failure / inconclusive
**Evidence classification:** (per `../00_SYSTEM_RULES/01_EVIDENCE_TAXONOMY.md`)
**Unverified claims affected:** (any UC-xx promoted or rejected)

`inconclusive` is a legitimate and common verdict. Record it rather than reaching for a story.
