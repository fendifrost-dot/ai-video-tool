# AUTH_05 — Independent Corroboration Score

**Category:** Authority · **Applies to:** All brands. Headline authority metric, especially for Fendi Frost. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Produce a single defensible measure of how well the brand's key facts are independently corroborated across the web — the durable basis for both AI retrieval accuracy and earned authority. Built on origins, never on URL counts.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.
- Requires `AUTH_02` ancestry data. Without collapsed origins this score is meaningless and must not be produced.

## Inputs

- AUTH_02 ancestry clusters and origin IDs
- The brand's key fact list from the context lock
- Provenance ledger

## Procedure

1. Define the key fact set from the context lock — the facts that must be corroborated for the entity to be correctly understood. For Fendi Frost: identity, roles, catalog, imprint, geography. For Modest: legal entity, location, category, signature design. For Boltz: NAP, services, primary specialty.
2. For each key fact, list every source stating it.
3. Collapse those sources to distinct information origins using `AUTH_02`.
4. Exclude first-party sources from the corroboration count, but record them separately — first-party sources matter for accuracy, just not for independence.
5. Score each fact: `0` = only first-party, `1` = one independent origin, `2` = two to three, `3` = four or more. Report the raw origin count alongside the band, never the band alone.
6. Compute the brand's corroboration profile across facts, and identify the weakest — the facts with no independent origin are the ones AI systems will get wrong or omit.
7. Cross-reference `GEO_04`: facts with low corroboration should correlate with observed inaccuracies. Where they do, that is a mechanism worth stating (as `observed`, not proven).
8. Track the profile over time; growth in independent origins for weak facts is the durable authority objective.

## Guards — known traps

- **Never count derivatives as independent.** This is the whole point of the score.
- Never count first-party sources toward independence.
- **Modest:** an uncorroborated notable-wearer claim scores `0` no matter how many sites repeat it, and must not be published while it does.
- The score is an internal instrument, not a public claim. Do not present it as an industry metric.
- Do not attempt to raise the score through manufactured coverage — that is fabricated corroboration and defeats the entire purpose.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `KEY FACT`
- `INDEPENDENT ORIGINS (count, listed)`
- `FIRST-PARTY SOURCES (count, separate)`
- `CORROBORATION BAND (0-3)`
- `OBSERVED AI ACCURACY ON THIS FACT (from GEO_04)`
- `WEAKEST-LINK FLAG`

## Default next measurement

Quarterly corroboration profile per key fact, tracked as independent-origin counts with the GEO_04 accuracy rate alongside.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `AUTH_05`.
