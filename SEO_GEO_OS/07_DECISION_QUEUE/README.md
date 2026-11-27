# 07 — Decision Queue

`MASTER_DECISION_QUEUE.csv` is the master backlog. Every finding from every module lands here as one row.
Nothing gets deployed that is not a completed, approved row in this file.

## Schema

`decision_id` · `Brand` · `Finding` · `Module` · `Date discovered` · `Evidence source` · `Impact` ·
`Commercial relevance` · `SEO relevance` · `GEO relevance` · `Confidence` · `Estimated effort` ·
`Estimated time-to-signal` · `Experiment contamination risk` · `Reversible?` · `Proposed action` ·
`Action class` · `Opportunity score` · `Score inputs (R/I/BV/C/E)` · `Status` · `Approved?` ·
`Deployment batch` · `Deployment date` · `Measurement date` · `Outcome`

## Rules

1. **Append-only.** A changed assessment is a new row referencing the superseded `decision_id`.
2. **`Approved?` is set by the owner, never by a module.** A module may propose; it may not approve.
3. **`Measurement date` is set before deployment, not after.** A change with no pre-registered measurement
   date produces an unfalsifiable result.
4. **`Action class`** comes from `../00_SYSTEM_RULES/03_ACTION_CLASSIFICATION.md`.
5. **`Opportunity score`** comes from `../00_SYSTEM_RULES/04_OPPORTUNITY_SCORING.md`, and the five inputs
   are recorded alongside it — a bare score is not auditable.
6. **Sort within a brand, not across brands.** The commercial weighting is deliberately brand-specific.

## Current state (2026-08-22)

18 rows, all from the OS bootstrap. **No external research has been imported yet** — these rows are the
blocking gaps and structural decisions identified while building the context locks, not findings from
prior SEO research. Rows from earlier Boltz, Fendi Frost, and Modest work still need importing.

Sixteen rows are `RESEARCH NOW`; two are `HOLD FOR EXPERIMENT` (`DQ-011` GBP category, `DQ-018`
cross-entity work). **Zero rows are approved for deployment**, consistent with the active freeze.
