# LSEO_02 — GBP Attributes Audit

**Category:** Local SEO · **Applies to:** Boltz (primary). Modest only if a physical presence is confirmed. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Inventory which GBP attributes are available for the business's categories, which are set, which are unset, and which unset ones are both true and consumer-relevant. Attributes are among the lowest-risk, most under-completed local surfaces.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.

## Inputs

- Full attribute list available for the current categories
- Currently set attributes
- Owner confirmation of what is actually true (accessibility, payment, amenities, service options, appointment requirements)
- Competitor attribute visibility where exposed

## Procedure

1. Enumerate every attribute available for the current category set, and record which are currently set, unset, or explicitly negative.
2. For each unset attribute, mark it `true` / `false` / `unknown` from owner confirmation. Never guess.
3. Flag any attribute that is set but **not actually true** — this is a correctness finding and outranks every optimization finding in this module.
4. Identify unset-but-true attributes that appear as consumer filters or are surfaced in profile UI. These are the highest-value additions.
5. Note attributes that could plausibly affect qualification for filtered searches, and label the effect `hypothesis` unless a mechanism is documented.
6. Group findings into: correctness fixes, high-relevance completions, low-relevance completions.

## Guards — known traps

- Attribute availability is category-dependent. Re-run this module after any category change — the available set will have changed.
- An attribute set incorrectly is worse than an attribute unset. Correctness first.
- Do not assume attribute completeness is a ranking factor. Its defensible value is qualification for filtered searches and consumer clarity — say that rather than implying rank lift.
- Owner confirmation is required for anything that could mislead a customer on arrival (accessibility, payment, appointment policy).

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `ATTRIBUTE`
- `AVAILABLE FOR CURRENT CATEGORIES? (yes/no)`
- `CURRENT STATE (set / unset / set-incorrectly)`
- `TRUE? (owner-confirmed / unknown)`
- `CONSUMER-FILTER RELEVANT? (yes/no/unknown)`

## Default next measurement

Attribute completeness percentage and any filtered-search visibility proxy, re-checked 28 days after an approved batch.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `LSEO_02`.
