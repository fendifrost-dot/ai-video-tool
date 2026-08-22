# ARTIST_04 — Profile Consistency Audit

**Category:** Artist / Entity · **Applies to:** Fendi Frost. Adaptable to any brand with multiple platform profiles. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Audit every artist profile for consistency of name, biography, imagery, links, and role presentation. Profile consistency is the artist-entity equivalent of NAP consistency, and it is the mechanism by which platforms and models link profiles into one entity.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.
- The canonical profile hierarchy is currently `unknown` (open question 2). Establishing which profile is the authority target is part of this module's job.

## Inputs

- Complete profile inventory across streaming, social, video, database, and any owned site
- Canonical entity data from the context lock
- Current bio text, imagery, and outbound links per profile

## Procedure

1. Build the complete profile inventory. Include profiles the artist does not control (auto-generated database and aggregator pages) and mark control status for each.
2. Establish the intended canonical hierarchy with the owner: which profile is the authority, and what the others should point to.
3. Audit name presentation across profiles — exact string, capitalization, and any variant. Inconsistent name strings fragment the entity.
4. Audit biography text: is it consistent, accurate, and does it present the role hierarchy in the artist-approved order (artist → producer → engineer)?
5. Audit imagery consistency. A consistent primary image is a strong human and machine signal of a single entity.
6. Audit outbound and cross-links between profiles (`sameAs` relationships). Profiles that do not reference each other are harder for systems to unify — this is usually the most actionable finding here.
7. Identify abandoned, duplicate, or impostor profiles, and record the reclaim or removal route for each.
8. Check that the legal name appears where appropriate (credits, databases) without over-exposing it beyond the artist's intent — confirm with the owner rather than assuming.

## Guards — known traps

- **Role hierarchy is artist-approved intent.** Never reorder it for retrieval reasons; report inconsistency, do not optimize it away.
- Legal-name exposure is a personal decision. Confirm with the owner before recommending it anywhere it is not already public.
- Do not create new profiles to fill gaps without an owner decision — every profile is a maintenance obligation and a potential fragmentation source.
- Auto-generated profiles often cannot be edited directly; record the actual correction route rather than assuming access.
- Impostor profiles are a real risk for artists; flag them immediately regardless of SEO impact.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `PLATFORM / PROFILE URL`
- `CONTROLLED? (yes/no/claimable)`
- `NAME STRING USED`
- `BIO CONSISTENCY / ROLE ORDER CORRECT?`
- `IMAGERY CONSISTENT?`
- `CROSS-LINKS TO OTHER PROFILES`
- `STATUS (canonical/secondary/abandoned/duplicate/impostor)`

## Default next measurement

Count of profiles with consistent name, bio, imagery, and cross-links, plus outstanding duplicate/impostor count — monthly.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `ARTIST_04`.
