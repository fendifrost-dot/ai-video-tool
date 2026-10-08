# 06 — Deployment Freeze

**Status:** ACTIVE — FREEZE ON · **Last updated:** 2026-08-22

## Current state

**All live-surface changes for Boltz, Fendi Frost, and Modest are frozen for the duration of the SEO/GEO
OS build.** This OS was commissioned as an internal operating layer only.

Frozen surfaces, all three brands:

- Website content, structure, internal linking, redirects, robots/sitemap
- Schema / structured data
- Google Business Profile: categories, attributes, services, hours, description, posts, photos, replies
- Artist, streaming, and social profiles
- Product listings, category architecture, product copy
- Backlink acquisition, press outreach, directory submissions
- Email and paid campaigns that would change measured traffic mix

## What is not frozen

- Reading, crawling, exporting, and retrieval testing (non-mutating)
- Writing findings, drafts, and staged artifacts inside this repo
- Updating the decision queue, provenance ledger, and experiment registry
- Recording baselines and measurements

Reading a surface is always allowed. Writing to one is not.

## Lifting the freeze

The freeze lifts per-item, not globally:

1. The finding is in `../07_DECISION_QUEUE/MASTER_DECISION_QUEUE.csv` with a completed row.
2. `EXPERIMENT CONFLICT?` = `no`, verified against the experiment registry on the day of deployment.
3. The owner sets `Approved?` = `yes` and assigns a `Deployment batch`.
4. A `Measurement date` is set **before** deployment, not after.
5. The change is logged in `../05_INTERVENTION_LOGS/<brand>/`.

Batching matters: deploying several changes to one surface in one window means the measurement reads the
batch, not any single change. That is an acceptable trade for speed, but it must be a *decision*, recorded
as one — never an accident.

## Escalation

If a finding appears urgent enough to bypass the freeze (live misinformation, an outage, a security or
legal issue), it does not get deployed silently. Raise it to the owner with: what is wrong, what it costs
per day, the smallest reversible fix, and which experiments it would contaminate.
