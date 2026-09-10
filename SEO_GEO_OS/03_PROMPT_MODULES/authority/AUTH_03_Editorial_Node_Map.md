# AUTH_03 — Editorial Node Map

**Category:** Authority · **Applies to:** All brands. Most relevant to Fendi Frost (music/culture press) and Modest (fashion/streetwear press). · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Map the genuine editorial outlets, writers, and curators covering the brand's category — the nodes whose coverage is both independently produced and retrieved by AI systems. This is the qualified target list for legitimate earned coverage.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.

## Inputs

- Category coverage: who writes about this space
- GEO_02 retrieval source map (which outlets are actually cited)
- AUTH_02 ancestry data (which outlets produce originals vs. republish)
- Competitor coverage history

## Procedure

1. Identify outlets covering the category, with the discovery method recorded (SERP, AI citations, competitor coverage, category knowledge).
2. For each outlet, determine from `AUTH_02` whether it produces original reporting or primarily republishes. Originators are worth far more.
3. Cross-reference `GEO_02`: which outlets are actually cited by AI platforms? An outlet with prestige but no retrieval presence is a different kind of target than one that is cited constantly.
4. Identify individual writers or curators who cover this space, and what they specifically cover. Coverage is granted by people, not by domains.
5. Record what each outlet has covered for competitors, and what angle it took. This reveals what the outlet finds newsworthy.
6. Assess fit honestly: does the brand have anything genuinely newsworthy for this outlet? If not, record that — a target list built on nothing to say is a waste of effort.
7. Rank nodes by: originality, AI retrieval presence, category fit, and realistic access.
8. Note outlets that are pay-to-play, and mark them excluded rather than listing them as opportunities.

## Guards — known traps

- **Never propose paid placement presented as editorial**, or any arrangement where payment is undisclosed. Hard stop.
- Prestige and retrieval presence are different axes. Map both; do not assume they correlate.
- An outlet target list without a genuine story is not a plan. Fit is a required field.
- Do not build outreach that misrepresents the brand's significance or fabricates a hook.
- **Fendi Frost:** verify any outlet's coverage is about the artist, not the fashion house, before recording it.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `OUTLET / WRITER`
- `ORIGINATOR OR REPUBLISHER`
- `AI RETRIEVAL PRESENCE (from GEO_02)`
- `COVERS COMPETITORS? (which, what angle)`
- `CATEGORY FIT`
- `GENUINE HOOK AVAILABLE? (yes/no/unknown)`
- `PAY-TO-PLAY? (excluded if yes)`

## Default next measurement

Count of independent editorial originations gained, quarterly, plus whether newly-gained nodes appear in the `GEO_02` citation map.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `AUTH_03`.
