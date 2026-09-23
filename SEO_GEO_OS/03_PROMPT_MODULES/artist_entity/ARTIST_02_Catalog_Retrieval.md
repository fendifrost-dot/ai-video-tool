# ARTIST_02 — Catalog Retrieval Audit

**Category:** Artist / Entity · **Applies to:** Fendi Frost. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Verify the catalog as it exists across platforms and databases, and measure whether search and AI systems retrieve it correctly and completely. Catalog data is the factual core of an artist entity, and errors propagate widely and persistently.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.
- **The verified catalog is currently `unknown` in the context lock.** This module's first job is to establish it from primary sources. Until then no catalog accuracy claim can be made.
- **Never state catalog facts from model memory.** Retrieve from primary sources or record `unknown`. A hallucinated release entered as ground truth would corrupt every downstream measurement permanently.

## Inputs

- Primary catalog sources: distributor records, official artist profiles, rights and credit databases
- Streaming platform artist pages
- AI platform responses about the catalog (from GEO_01)
- Fabric Series structure from the owner

## Procedure

1. Build the verified catalog from primary sources: title, release date, type, credits, and the source for each. Record any item that cannot be verified as `unverified` rather than including or excluding it silently.
2. Confirm the Fabric Series structure with the owner — what it is and which releases belong to it. This is currently an open question and it shapes how the catalog should be presented.
3. Audit each streaming and database profile for completeness against the verified catalog: missing releases, duplicates, wrong dates, wrong credits, and releases attributed to the wrong artist.
4. Check for split or duplicate artist profiles across platforms — releases attributed to two profiles is a common and damaging fragmentation.
5. Test AI and search retrieval of the catalog and compare against ground truth. Record: correct items retrieved, items omitted, and **items fabricated**. Fabricated releases are a specific, reportable failure and should be tracked as their own metric.
6. Verify credits reflect the artist-approved role hierarchy where the artist is credited in multiple capacities.
7. Identify which sources AI platforms use for catalog claims (`GEO_02`), since correcting those is the only durable fix.
8. Record correctable errors per platform, with the correction route where one exists.

## Guards — known traps

- **Never fill catalog gaps from memory or from an AI answer.** Circular sourcing would launder a hallucination into the ground truth — the highest-severity error available in this system.
- Distinguish `not retrieved` from `does not exist`. Both look identical in an answer and mean opposite things.
- Fabricated releases in AI answers are evidence about the model, not the artist — but they are worth tracking and, where a source is feeding them, correcting.
- Split profiles must be resolved through platform processes; never create additional profiles to work around one.
- Credit databases feed many downstream profiles. Verify carefully before submitting corrections; errors there are slow and expensive to undo.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `RELEASE / ITEM`
- `VERIFIED? (primary source cited)`
- `PRESENT ON WHICH PLATFORMS`
- `ERRORS FOUND (missing/duplicate/wrong date/wrong credit/misattributed)`
- `AI RETRIEVAL RESULT (correct/omitted/fabricated)`
- `CORRECTION ROUTE`
- `SOURCE FEEDING THE ERROR`

## Default next measurement

Catalog completeness rate per platform, and AI catalog accuracy (correct / omitted / fabricated counts), monthly.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `ARTIST_02`.
