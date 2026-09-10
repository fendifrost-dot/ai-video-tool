# GEO_01 — AI Visibility Panel

**Category:** GEO / AI · **Applies to:** All brands. This is the standing GEO measurement instrument — the other GEO modules depend on its prompt panel. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Establish and run a fixed, versioned panel of prompts across AI platforms to measure whether, how, and how accurately each brand appears. The panel is the instrument; if the panel changes, the measurement is not comparable, so panel discipline is the whole point of this module.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.
- The prompt panel is **versioned and frozen** once created. Adding prompts creates panel v2 and starts a new series — it does not extend the old one.
- Runs must record platform, date, and whether personalization/history was active. A logged-in, personalized session is not a measurement.

## Inputs

- The brand's frozen prompt panel (or this run creates v1)
- Platform list: the answer engines and assistants being tracked
- Clean sessions — no history, no personalization, consistent locale
- The brand context lock, for what a *correct* answer would even contain

## Procedure

1. If no panel exists, build v1: 20-40 prompts spanning entity prompts (who is X), category prompts (best X in Y), comparison prompts, and transactional prompts (where do I get X). Record the rationale for each prompt.
2. Freeze the panel with a version number and date. Store it in `../../04_MEASUREMENT/baselines/`.
3. Run every prompt on every tracked platform in a clean session. Record the **full response verbatim**, not a summary — later modules re-analyze these transcripts and a summary destroys them.
4. For each response record: is the brand mentioned, in what position, in what framing (recommended / listed / mentioned in passing / mentioned negatively), and which competitors appear.
5. Record every cited source per response, with URL. This is the raw input to `GEO_02` and must not be skipped even when the brand is absent.
6. Record factual accuracy of any brand claim made — routes to `GEO_04`.
7. Repeat each prompt at least twice per run to capture non-determinism, and record the variance. A single sample is an anecdote.
8. Store the run as a dated artifact. Never overwrite a prior run.

## Guards — known traps

- AI answers are **non-deterministic**. A single run is not a measurement. Always sample repeatedly and report variance explicitly.
- Personalization and chat history contaminate results silently. Use clean sessions and say which.
- Platforms change models and retrieval behavior without notice — a shift may be theirs, not yours. Note any known platform change alongside the run.
- Do not change the panel to chase better-looking numbers. Panel changes create a new series.
- Absence of a brand is a valid, important result. Do not re-prompt until it appears and then report that.
- Never paraphrase responses into the record. Store verbatim.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `PANEL VERSION`
- `PROMPT`
- `PLATFORM`
- `RUN DATE`
- `MENTIONED? (yes/no)`
- `POSITION / FRAMING`
- `COMPETITORS PRESENT`
- `SOURCES CITED`
- `VARIANCE ACROSS SAMPLES`

## Default next measurement

Re-run the full frozen panel monthly. Report mention rate, framing distribution, and variance — never a single-run number as a trend.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `GEO_01`.
