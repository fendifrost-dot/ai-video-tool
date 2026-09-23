# MODEST / MOD#$T — CONTEXT LOCK

> Authoritative context for all Modest SEO/GEO work. Load before any module run.
> Every fact carries a classification per `../00_SYSTEM_RULES/01_EVIDENCE_TAXONOMY.md`.

**LAST UPDATED:** 2026-08-22
**CURRENT PHASE:** Baseline complete (2026-08-19), **no deployment yet.** Batch 1 proposed, not approved.
**ACTIVE EXPERIMENT:** `MODEST-BASELINE-0819` — immutable baseline recorded 2026-08-19; no intervention deployed

---

## DO NOT CHANGE

| Item | Reason | Released when |
|---|---|---|
| **The 2026-08-19 baseline** | **Immutable.** It is the reference point for every Modest measurement that follows. It is never edited, re-derived, or "corrected" — a superseding baseline is a new dated baseline | Never |
| Any surface in proposed Batch 1 | Batch 1 is proposed, **not approved**. Touching these surfaces pre-approval both breaks the freeze and burns the baseline | Owner approves Batch 1 + a measurement date is set |
| Fendi Frost ↔ Modest bridge | **Explicitly held** — see `FENDI_FROST_CONTEXT_LOCK.md` | I1a readout + explicit approval |
| Brand name presentation rules | Naming is an entity-resolution variable here, not a style preference (below) | Owner decision only |

## KNOWN FACTS

### Identity & entity
| Fact | Value | Class | Source |
|---|---|---|---|
| Brand names in use | **Modest** and **MOD#$T** | owner-confirmed | Owner directive, 2026-08-22 |
| Legal entity | Modest Streetwear Apparel Inc. | owner-confirmed | Owner directive, 2026-08-22 |
| Leadership | Founder / CEO / Lead Designer (single person holding all three roles) | owner-confirmed | Owner directive, 2026-08-22 |
| Founder name | `unknown` — role stated, name not yet recorded here | unknown | — |
| Location | Chicago | owner-confirmed | Owner directive, 2026-08-22 |
| Public phone | **None.** No public phone number exists | owner-confirmed | Owner directive, 2026-08-22 |
| Public contact | info@bemoremodest.com | owner-confirmed | Owner directive, 2026-08-22 |
| Signature design element | Rabbit-fur patch | owner-confirmed | Owner directive, 2026-08-22 |
| Product categories | `unknown` — categories exist, inventory not recorded here | unknown | — |
| Relationship to Fendi Frost | Related entity — **bridge is held** | owner-confirmed / decision | Owner directive, 2026-08-22 |
| Notable-wearer evidence | **Status unresolved** — claims exist, corroboration not established | unknown | — |

> **Naming rules — treat as an entity-resolution constraint.** `MOD#$T` contains characters that many
> systems tokenize badly, strip, or refuse to index; `Modest` is a common English adjective with enormous
> ambiguous-query volume. Both fail in opposite directions. Which string is canonical for structured data,
> schema, and citations is an **open decision**, not a style call — and it must be settled before any
> entity or schema work. Never silently normalize one to the other in any output.

> **Notable-wearer evidence — handle with care.** Claims that a named public figure wore the brand are
> `unknown` until corroborated by primary evidence (dated image with attribution, editorial coverage, or
> first-party documentation). Do **not** publish, imply, or feed such a claim into schema, copy, or press
> until classified `confirmed`. An unverified association claim about a real person is a factual and legal
> risk, not just an SEO risk.

### Commercial priorities
| Fact | Value | Class | Source |
|---|---|---|---|
| Scoring rule | Product/category queries with purchase intent **outrank vanity fashion terms**, regardless of volume | owner-confirmed | Owner directive, 2026-08-22 |
| Revenue model | Ecommerce (direct) | owner-confirmed | Owner directive, 2026-08-22 |
| Platform / stack | `unknown` | unknown | — |
| Current revenue / AOV / conversion rate | `unknown` | unknown | — |

### Baselines
| Baseline | Date | State |
|---|---|---|
| **Immutable technical + visibility baseline** | **2026-08-19** | Complete. Referenced as existing; **needs import into `../04_MEASUREMENT/baselines/`** |
| Current technical findings | 2026-08-19 | Referenced as existing; needs import |
| Proposed Batch 1 | — | Proposed, **not approved, not deployed** |

## PROHIBITED ASSUMPTIONS

1. **Do not assume a phone number exists.** Never generate a placeholder phone for schema, citations, or
   directory listings. Absence is the fact.
2. **Do not assume `Modest` and `MOD#$T` are interchangeable** in any structured or machine-read context.
3. **Do not treat notable-wearer claims as confirmed.** See above.
4. **Do not assume high-volume fashion terms are valuable.** Explicit brand rule: purchase intent wins.
5. **Do not re-derive or "fix" the 2026-08-19 baseline.** It is immutable.
6. **Do not assume Batch 1 is approved.** It is proposed.
7. **Do not assume products in the catalog are currently in stock** — schema and copy claims about
   availability need live verification.

## OPEN QUESTIONS

1. Which brand string is canonical for schema, `Organization`/`Brand` markup, and citations —
   `Modest`, `MOD#$T`, or `Modest Streetwear Apparel Inc.`? *Blocks:* `ECOM_01`, `AUTH_04`, all entity work.
2. What exactly is in proposed Batch 1? *Blocks:* contamination checks on every Modest module.
3. Where is the 2026-08-19 baseline stored, and can it be imported verbatim? *Blocks:* all measurement.
4. What are the product categories and the live SKU inventory? *Blocks:* `ECOM_01`–`ECOM_06`.
5. What is the ecommerce platform? Determines what schema/feed control actually exists. *Blocks:* `ECOM_01`, `ECOM_06`.
6. Is there a Google Merchant Center feed, and is it healthy? *Blocks:* `ECOM_06`.
7. Is there a physical/retail presence in Chicago, or is it ecommerce-only? Determines whether local
   modules (`LSEO_*`) apply to Modest at all.
8. What is the notable-wearer corroboration status, item by item?

## NEXT DECISION POINT

**Settle the canonical brand string (`Modest` vs `MOD#$T`).** It is upstream of schema, entity resolution,
citations, and product markup — and every one of those is expensive to redo. This decision blocks more
Modest work than any other open item.
