# LSEO_05 — GBP Services Audit

**Category:** Local SEO · **Applies to:** Boltz (primary). Modest only if a physical/service presence is confirmed. · **Version:** 1.0 · **Last updated:** 2026-08-22

## Purpose

Audit the GBP services list against the business's actual service list and against the way customers phrase demand — with explicit attention to whether the primary growth service is present, correctly named, and described.

## Preconditions

- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock in `../../01_CONTEXT_LOADERS/`.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for an active experiment on the surfaces below. If one exists, findings are `HOLD FOR EXPERIMENT` and the module still runs — observation does not contaminate, only changes do.
- This module is **read-only**. It never modifies a live surface.

## Inputs

- Current GBP services list, with descriptions
- Confirmed service list from the context lock
- Predefined (category-supplied) vs custom service options available
- Customer phrasing evidence from LSEO_03 and any query data

## Procedure

1. Record every currently listed service, whether it is predefined or custom, and whether it has a description.
2. Diff against the confirmed service list: find services performed but not listed, and services listed but not performed (the latter is a correctness finding and takes priority).
3. Verify the primary growth service is listed, uses the phrasing customers actually use, and has a description.
4. Identify predefined services available for the current categories that map to real services and are unlisted.
5. For custom services, check the naming against observed customer phrasing rather than internal or trade terminology.
6. Flag any service whose description is empty, since descriptions are consumer-facing surface area that is nearly always left blank.

## Guards — known traps

- Never list a service the business does not perform.
- Available predefined services depend on categories — re-run after any category change.
- Do not stuff service names with modifiers. The name should be what a customer would say.
- Services are a consumer-facing surface; the primary defensible benefit is clarity and qualification, not rank. Do not overstate the mechanism.

## Output

Findings use the shape in `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus these module-specific fields:

- `SERVICE`
- `LISTED? (yes/no)`
- `TYPE (predefined/custom)`
- `DESCRIPTION PRESENT? (yes/no)`
- `PERFORMED? (owner-confirmed)`
- `CUSTOMER PHRASING MATCH`

## Default next measurement

Service-list completeness against the confirmed service list, plus service-query visibility for the primary growth service, 28 days after an approved batch.

## Handoff

Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with `Module` = `LSEO_05`.
