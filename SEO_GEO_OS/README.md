# SEO/GEO Operating System — v1

**Status:** Built, unpopulated. **Deployment freeze: ACTIVE.** · **Created:** 2026-08-22

An internal research and execution layer for three brands: **Boltz Automotive**, **Fendi Frost**, and
**Modest / MOD#$T**. It replaces one-off SEO handoffs with a standing system: persistent brand context,
reusable modules, a uniform output contract, and a single backlog.

The point is to be able to say *"Run GEO_02 + WEB_02 for Boltz and update the decision queue"* instead of
re-explaining context every few days.

---

## ⛔ This layer does not deploy

**No website, GBP, profile, schema, backlink, press, product, or content change is authorized by anything
in this repository.** Running a module produces findings, not permission. See
[`00_SYSTEM_RULES/06_DEPLOYMENT_FREEZE.md`](00_SYSTEM_RULES/06_DEPLOYMENT_FREEZE.md).

Reading a surface is always allowed. Writing to one is not.

---

## Structure

| Folder | Contents |
|---|---|
| [`00_SYSTEM_RULES/`](00_SYSTEM_RULES/) | Operating principles, evidence taxonomy, output contract, action classification, opportunity scoring, unverified-claims register, deployment freeze |
| [`01_CONTEXT_LOADERS/`](01_CONTEXT_LOADERS/) | One authoritative context lock per brand |
| [`02_COMPETITOR_DOSSIERS/`](02_COMPETITOR_DOSSIERS/) | Per-competitor records (descriptive, never action lists) |
| [`03_PROMPT_MODULES/`](03_PROMPT_MODULES/INDEX.md) | 38 modules across 6 families |
| [`04_MEASUREMENT/`](04_MEASUREMENT/) | Metric definitions, monthly report templates, baselines |
| [`05_INTERVENTION_LOGS/`](05_INTERVENTION_LOGS/) | Experiment registry + what actually changed, when |
| [`06_SOURCE_PROVENANCE/`](06_SOURCE_PROVENANCE/) | Source taxonomy + provenance ledger |
| [`07_DECISION_QUEUE/`](07_DECISION_QUEUE/) | The master backlog |

## The seven controls

1. **Research ≠ permission.** Every finding is classified `RESEARCH NOW` / `PREPARE NOW` / `DEPLOY NOW` /
   `HOLD FOR EXPERIMENT` / `REJECT`. Only the owner promotes to `DEPLOY NOW`.
2. **No observation→action shortcut.** "Competitor does X" never implies "we do X." It goes through
   evidence, classification, proposal, and measurement first.
3. **Evidence is labeled.** `confirmed` / `observed` / `owner-confirmed` / `hypothesis` / `decision` /
   `recommendation` / `unknown`. A hypothesis never reads as proof.
4. **Inherited tactics are hypotheses.** GBP posting frequency, keyword-bearing review replies, photo
   geotagging, category copying, velocity-over-count — all carry named tests in
   [`05_UNVERIFIED_CLAIMS_REGISTER.md`](00_SYSTEM_RULES/05_UNVERIFIED_CLAIMS_REGISTER.md), not assumed truth.
5. **Origins, not URLs.** Five sites republishing one press release is one informational origin. Raw
   source counts never appear without the collapsed count.
6. **Commercial weight is explicit.** Engine replacement for Boltz; purchase intent over vanity terms for
   Modest; entity and cultural discovery for Fendi Frost.
7. **Experiments are protected.** Every finding checks the experiment registry before it can move.

## Hard stops

Excluded on principle, not pending evidence: keyword-steered or incentivized reviews · review gating ·
fabricated testimonials · fake or misdescriptive GBP categories · manufactured citations or press · paid
links presented as editorial · schema marking up facts not on the page · invented product attributes ·
fabricated scene presence or association claims about real people.

## Current state — what is built vs. what is populated

**Built:** all 38 modules, the full rules layer, three context locks, three report templates, and the
three tracking artifacts with working schemas.

**Not populated — and this is the honest limitation of v1:** no prior research has been imported. The
context locks are built from owner-stated facts in the commissioning directive; **everything else is
explicitly marked `unknown` rather than filled from memory.** Three baselines are known to exist outside
this system and are not yet in it.

The decision queue's 18 rows are the blocking gaps found while building the context locks — not findings
from prior SEO work. Filling the `unknown` fields is the first real job.

| Brand | Phase | Active experiment | Headline blocker |
|---|---|---|---|
| Boltz | Batch 1 observation | `BOLTZ-BATCH1` — **definition not recorded** | Batch 1 contents + baseline (`DQ-004`) |
| Fendi Frost | I1a observation | `FF-I1a` — **definition not recorded** | I1a definition (`DQ-005`); entity resolution unmeasured (`DQ-003`) |
| Modest | Baseline complete 2026-08-19, nothing deployed | `MODEST-BASELINE-0819` | Baseline not imported (`DQ-006`); canonical brand string undecided (`DQ-001`) |

Until an experiment's intervention set and baseline are recorded, **every module for that brand answers
`EXPERIMENT CONFLICT?` as `yes-by-default`.** That is the intended conservative failure mode.

## Running a module

```
Run <MODULE_ID> for <BRAND> [against <input>] and update the decision queue.
```

The module carries its own procedure and guards. Each run loads the system rules and the brand context
lock, checks the experiment registry, executes read-only, returns findings in the contract shape, and
appends queue rows.

See [`03_PROMPT_MODULES/INDEX.md`](03_PROMPT_MODULES/INDEX.md) for the full list, the dependency order,
and which modules are currently blocked.
