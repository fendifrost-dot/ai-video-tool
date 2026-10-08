# GEO_04 — Entity Accuracy Audit

**Category:** GEO / AI · **Applies to:** All brands. **Highest priority for Fendi Frost** (name collision with a major fashion entity) and Modest (`Modest` vs `MOD#$T` tokenization). · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Measure whether AI platforms resolve the correct entity and state correct facts about it. Accuracy is upstream of visibility: being mentioned wrongly is worse than not being mentioned, and for these brands entity resolution is the actual problem.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.
- The brand context lock is the ground truth for this module. If a fact is `unknown` in the lock, it cannot be scored here — it is scored as `unverifiable`, never as wrong.

## Inputs

- GEO_01 panel transcripts
- Brand context lock (ground truth)
- Known confusable entities (Fendi the fashion house; other artists or brands sharing name strings)

## Procedure

1. For every brand claim made in every panel response, extract the claim and compare it to the context lock.
2. Classify each claim: `accurate` / `inaccurate` / `outdated` / `unverifiable` (not in the lock) / `conflated` (belongs to a different entity).
3. **Score entity resolution first and separately.** Did the platform resolve the intended entity at all? For Fendi Frost, any fashion-house content is a resolution failure and must never be counted as artist visibility.
4. Compute an accuracy rate: accurate claims / total verifiable claims, per platform. Report `unverifiable` counts separately rather than dropping them.
5. Catalogue every specific inaccuracy with its exact wording, platform, and date. Specific inaccuracies are actionable; an accuracy percentage alone is not.
6. For each inaccuracy, trace the plausible source using the `GEO_02` map — where would a model have gotten this? Inaccuracies usually have a findable origin, and correcting the origin is the only durable fix.
7. Flag inaccuracies with real-world risk: wrong hours, wrong contact details, wrong products, wrong personal attributions, or an incorrect notable-person association for Modest.

## Guards — known traps

- **Fendi Frost:** never report combined `Fendi` results as artist visibility. Resolution failure is its own category and is the primary metric for this brand.
- **Modest:** test `Modest`, `MOD#$T`, and `Modest Streetwear Apparel` as separate strings. They may resolve to different entities or to nothing.
- Never fill an `unknown` context-lock fact from the model's own answer to score it. That is circular and would launder a hallucination into the ground truth.
- A confidently-stated hallucination is not evidence about the brand — it is evidence about the model.
- Do not propose correcting an inaccuracy by publishing a rebuttal page. Correct the source data where it exists.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `CLAIM AS STATED (verbatim)`
- `PLATFORM / DATE`
- `GROUND TRUTH (from context lock)`
- `VERDICT (accurate/inaccurate/outdated/unverifiable/conflated)`
- `ENTITY RESOLVED CORRECTLY? (yes/no)`
- `PLAUSIBLE SOURCE OF ERROR`
- `REAL-WORLD RISK`

## Default next measurement

Per platform, monthly: entity resolution rate and accuracy rate, with the `unverifiable` count reported alongside rather than folded in.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `GEO_04`.
