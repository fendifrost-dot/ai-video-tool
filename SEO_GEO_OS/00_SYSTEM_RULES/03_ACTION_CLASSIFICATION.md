# 03 — Action Classification

**Status:** ACTIVE · **Last updated:** 2026-08-22

Every finding gets exactly one action class. This is the control that separates *useful research* from
*permission to change something*.

| Class | Means | Allowed now | Blocked until |
|---|---|---|---|
| `RESEARCH NOW` | Needs more evidence before it can even be proposed | Investigation, crawling, retrieval testing, export analysis | — |
| `PREPARE NOW` | Understood and ready to build, but not to publish | Draft copy, draft schema, staged files, written test plan | Approval + deployment window |
| `DEPLOY NOW` | Approved for a live change | Nothing, by default (see below) | Explicit per-item owner approval |
| `HOLD FOR EXPERIMENT` | Would contaminate a live experiment | Nothing on that surface | Named experiment reaches its checkpoint |
| `REJECT` | Not worth doing, or fails a hard rule | Nothing — record the reason and stop | — |

## Rules

1. **`DEPLOY NOW` is never self-assigned by a module.** A module may propose it; only the owner promotes
   a row to `DEPLOY NOW` in the decision queue (`Approved?` = `yes`). While the deployment freeze in
   `06_DEPLOYMENT_FREEZE.md` is active, even an approved row waits for a named batch.
2. **`PREPARE NOW` work is staged, never published.** Draft artifacts live in the repo or a doc — not on
   a live surface. Preparing a GBP post is fine; posting it is not.
3. **`HOLD FOR EXPERIMENT` requires a cited experiment ID** from `EXPERIMENT_REGISTRY.csv` and the
   checkpoint date that releases it. A hold with no release date is a `REJECT` in disguise.
4. **`REJECT` requires a stated reason** from: fails a hard rule (§8 of operating principles) · effort
   exceeds value · unfalsifiable · duplicate of an existing row · superseded.
5. **Reclassification is a new row**, referencing the superseded finding id. Rows are append-only.

## Default

When a module is unsure between two classes, take the more conservative one. The ordering, most to least
conservative: `HOLD FOR EXPERIMENT` > `RESEARCH NOW` > `PREPARE NOW` > `DEPLOY NOW`.
