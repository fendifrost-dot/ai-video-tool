# <ID> — <TITLE>

**Category:** · **Applies to:** · **Version:** 1.0 · **Last updated:** YYYY-MM-DD

## Purpose
What this module establishes, in two or three sentences. Be specific about what question it answers.

## Preconditions
- Load `../../00_SYSTEM_RULES/00_OPERATING_PRINCIPLES.md` and the brand's context lock.
- Check `../../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` for active experiments on these surfaces.
- State whether the module is read-only (it should be) and any module it depends on.

## Inputs
What data is required, and where it comes from. Name tools — different tools disagree.

## Procedure
Numbered steps. Each step should produce something recordable. Put the step that most often gets skipped
early, not last.

## Guards — known traps
The failure modes specific to this module: what makes its output wrong, what would be a hard-stop
recommendation, and which `UC-xx` unverified claims it touches.

## Output
Findings use `../../00_SYSTEM_RULES/02_MODULE_OUTPUT_CONTRACT.md`, plus module-specific fields listed here.

## Default next measurement
The metric, the surface, and the interval. Be realistic about time-to-signal — a 28-day check on a slow
surface reads as failure regardless of outcome.

## Handoff
Append one row per finding to `../../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv`.
