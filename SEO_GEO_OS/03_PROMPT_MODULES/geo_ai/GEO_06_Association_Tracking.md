# GEO_06 — Association Tracking

**Category:** GEO / AI · **Applies to:** All brands. Designed primarily for Fendi Frost (role, genre, geography, cultural association) and adaptable to Boltz (service association) and Modest (category association). · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Track which attributes AI systems associate with the entity — role, genre, geography, category, specialty — against the associations the brand intends. Visibility without the right associations is retrieval for the wrong queries.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.

## Inputs

- Target association set from the context lock (intent)
- GEO_01 panel transcripts
- Open-ended association prompts (describe X, what is X known for, who is similar to X)

## Procedure

1. Record the target associations from the context lock. For Fendi Frost: artist → producer → engineer ordering, Chicago, house/electronic, Runway Music, Fabric Series, fashion adjacency. For Boltz: engine replacement. For Modest: streetwear, Chicago, the rabbit-fur patch signature.
2. Run open-ended association prompts on each platform in clean sessions.
3. Extract every attribute the platform associates with the entity, verbatim, and tag each as: target association present / target association absent / unintended association present / incorrect association.
4. **For Fendi Frost, check the role ordering explicitly.** If the platform leads with producer or engineer rather than artist, that is a specific finding against artist-approved intent — not a general accuracy issue.
5. For each absent target association, check `GEO_02` for whether any retrieved source states it. An association absent from every source cannot be expected in an answer, which converts the finding from a GEO problem into a source problem.
6. Track unintended associations, and separate the harmless from the actively wrong.
7. Report as a per-association time series rather than a single score — associations move independently.

## Guards — known traps

- Associations reflect source content. If no source states the association, the fix is upstream, not prompt-side.
- **Never propose stating an association that is not true** to influence models. Aspirational association is fabrication.
- Fendi Frost: distinguish association failure from entity resolution failure. A fashion-house answer is resolution failure (`GEO_04`), not a wrong association.
- Role hierarchy is artist-approved intent, not an optimization variable — never propose reordering it for retrieval reasons.
- Open-ended prompts vary more than structured ones. Sample more, not less.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `TARGET ASSOCIATION`
- `PRESENT? (yes/no)`
- `PLATFORM / DATE`
- `VERBATIM ATTRIBUTION`
- `UNINTENDED ASSOCIATIONS OBSERVED`
- `SOURCE STATES IT? (from GEO_02)`
- `ROLE ORDERING CORRECT? (Fendi Frost only)`

## Default next measurement

Monthly per-association presence rate per platform, reported as a series with the source-coverage check alongside.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `GEO_06`.
