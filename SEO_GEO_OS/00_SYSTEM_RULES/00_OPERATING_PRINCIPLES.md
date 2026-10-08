# 00 — Operating Principles

**Status:** ACTIVE · **Last updated:** 2026-08-22 · **Applies to:** every module, every brand, every session.

This file is loaded before any SEO/GEO work. If a module contradicts this file, this file wins.

---

## 1. This is a research layer, not a deployment layer

The OS produces **findings and proposals**. It does not produce live changes.

Running a module NEVER authorizes changing a website, Google Business Profile, streaming/artist profile,
schema markup, backlink placement, press outreach, product copy, or category structure. Deployment is a
separate, explicitly approved step (see `06_DEPLOYMENT_FREEZE.md`).

## 2. Never jump from observation to action

The forbidden reasoning chain is:

> "Competitor does X" → "therefore we should do X"

The required chain is:

> "Competitor does X" (OBSERVATION) → "here is the evidence" (SOURCE) → "here is what we can and cannot
> conclude" (CLASSIFICATION + CONFIDENCE) → "here is the proposed action and what it would cost"
> (RECOMMENDED ACTION) → "here is how we would know it worked" (NEXT MEASUREMENT) → decision queue.

A competitor's configuration is evidence of that competitor's *choice*, not evidence of what *works*.

## 3. Evidence is derived, never recalled

Every claim carries a classification from `01_EVIDENCE_TAXONOMY.md`. A claim with no cited source is
`unknown` or `hypothesis` — never `confirmed`. Do not certify a benchmark, baseline, or reference set
because it "seems right." Derive it, show the derivation, get approval, then freeze it.

This mirrors the repo-wide rule in `CLAUDE.md`: **benchmarks are derived from evidence, never recalled
from memory.**

## 4. Active experiments are sacred

An active experiment means a surface is under observation with a fixed baseline. Touching that surface
destroys the read. Every module output must answer **EXPERIMENT CONFLICT? yes/no** by checking
`../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv` — not from memory.

If a finding conflicts with a live experiment, its action class is `HOLD FOR EXPERIMENT`. It stays in the
queue; it does not get quietly dropped, and it does not get quietly shipped.

## 5. Count information origins, not URLs

Five sites republishing one press release is **one** informational origin, not five. Source diversity is
measured after collapsing derivatives (see `../06_SOURCE_PROVENANCE/`). Inflated source counts are the
most common way an authority audit lies to itself.

## 6. Commercial weight is not uniform

Rankings are not the product; revenue and qualified demand are. Keywords, queries, and surfaces are
scored by `04_OPPORTUNITY_SCORING.md`, which weights commercial intent explicitly per brand.

## 7. Tactics are hypotheses until measured

Widely repeated SEO/GEO advice is inherited as `hypothesis`, not `confirmed` — see
`05_UNVERIFIED_CLAIMS_REGISTER.md`. A tactic graduates to `confirmed` only via a registered experiment
with a baseline, a checkpoint, and a stated failure criterion.

## 8. No manufactured signals

Never propose, script, or encourage: keyword-stuffed review solicitation, incentivized or templated
customer reviews, fabricated testimonials, fake local citations, synthetic press, or any tactic whose
value depends on a platform not noticing it. This is a hard stop, not a risk trade-off.

## 9. State what you did not check

Coverage gaps are findings. A module that inspected 12 of 40 product pages says so in `SOURCE`. Silent
sampling reads as full coverage and corrupts every downstream decision.

## 10. One writer per artifact

Modules append to the decision queue, provenance ledger, and experiment registry — they do not rewrite
prior rows. Historical rows are immutable; corrections are new rows referencing the superseded row's id.
