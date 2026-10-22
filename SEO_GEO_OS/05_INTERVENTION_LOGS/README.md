# 05 — Intervention Logs

What was actually changed, when, and what happened. Without this, no measurement can be attributed and
every experiment is retrospectively unreadable.

## Contents

| File | Purpose |
|---|---|
| `EXPERIMENT_REGISTRY.csv` | Every registered experiment and standing hold, across all brands |
| `INTERVENTION_LOG_TEMPLATE.md` | Per-change log template |
| `boltz/` `fendi_frost/` `modest/` | Per-brand intervention logs, one file per deployment batch |

## The registry is checked before every module run

Every module output must answer `EXPERIMENT CONFLICT? yes/no` **by reading this file**, not from memory.
A module that skips this check produces findings that cannot be safely acted on.

## Registry state (2026-08-22)

Five rows. Three carry **blocking gaps**: `BOLTZ-BATCH1` and `FF-I1a` have no recorded intervention set or
baseline date, and `MODEST-BATCH1-PROPOSED` has no recorded contents.

Until those are imported, **every module for those brands must answer `EXPERIMENT CONFLICT?` as
`yes-by-default`** and classify findings `HOLD FOR EXPERIMENT`. This is the intended conservative failure
mode — it is not a reason to guess.

## Logging rule

Log every change at the time it is made, including changes that turn out to be mistakes and changes made
by someone else. A change absent from this log will silently corrupt the next measurement, and the
corruption will not be discoverable later.
