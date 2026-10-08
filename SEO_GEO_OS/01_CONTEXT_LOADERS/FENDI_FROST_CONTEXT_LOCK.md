# FENDI FROST — CONTEXT LOCK

> Authoritative context for all Fendi Frost SEO/GEO work. Load before any module run.
> Every fact carries a classification per `../00_SYSTEM_RULES/01_EVIDENCE_TAXONOMY.md`.
> **Facts marked `unknown` must be filled from primary sources or owner confirmation before dependent
> modules run.** Catalog facts especially: never fill a discography from model memory — retrieve it.

**LAST UPDATED:** 2026-08-22
**CURRENT PHASE:** OS bootstrap — context capture. No deployment.
**ACTIVE EXPERIMENT:** `FF-I1a` — observation state (see `../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv`)

---

## DO NOT CHANGE

| Item | Reason | Released when |
|---|---|---|
| Any surface in the I1a intervention set | Under active observation | I1a checkpoint reached and recorded |
| Fendi Frost ↔ Modest cross-entity work | **Explicitly held.** Cross-linking two entities mid-experiment confounds both entities' retrieval reads simultaneously | I1a readout + Modest baseline stability + explicit approval |
| Artist name presentation across profiles | Entity resolution depends on a stable string; churn splits the entity | Never, absent an artist decision |
| Role hierarchy framing (artist → producer → engineer) | Artist-approved intent; not an SEO variable to optimize | Artist decision only |

## KNOWN FACTS

### Identity & entity
| Fact | Value | Class | Source |
|---|---|---|---|
| Artist name | Fendi Frost | owner-confirmed | Owner directive, 2026-08-22 |
| Legal / given name | Terrence Cleveland | owner-confirmed | Owner directive, 2026-08-22 |
| Role hierarchy (artist-approved) | **artist → producer → engineer**, in that order of precedence | owner-confirmed | Owner directive, 2026-08-22 |
| Imprint / positioning | Runway Music | owner-confirmed | Owner directive, 2026-08-22 |
| Body of work | Fabric Series | owner-confirmed | Owner directive, 2026-08-22 |
| Relationship to Modest | Related entity — **cross-entity work is held** | owner-confirmed / decision | Owner directive, 2026-08-22 |
| Geographic association | Chicago — *target* association; current retrieval state `unknown` | owner-confirmed (intent) | Owner directive, 2026-08-22 |
| Genre association | House / electronic — *target*; current retrieval state `unknown` | owner-confirmed (intent) | Owner directive, 2026-08-22 |
| Catalog (releases, dates, credits) | `unknown` — must be retrieved from primary sources | unknown | — |
| Profile inventory & hierarchy | `unknown` — which profiles exist, which is canonical | unknown | — |
| Official site / domain | `unknown` | unknown | — |

> **Disambiguation risk — treat as the central entity problem:** "Fendi" is a globally dominant fashion
> entity. Any retrieval test that returns fashion-house results is an **entity resolution failure**, not
> a ranking failure, and must be classified as such. Never report combined "Fendi" visibility as artist
> visibility.

### Commercial priorities
| Fact | Value | Class | Source |
|---|---|---|---|
| Primary value | Entity/cultural discovery, not direct ecommerce conversion | owner-confirmed | Owner directive, 2026-08-22 |
| Scoring consequence | Do **not** down-score findings for lacking a purchase path. Entity accuracy = `BusinessValue` 5 | decision | `../00_SYSTEM_RULES/04_OPPORTUNITY_SCORING.md` |

### Baselines
| Baseline | Date | State |
|---|---|---|
| I1a pre-intervention baseline | `unknown` | Referenced as existing; needs import |
| Entity accuracy baseline (per platform) | `unknown` | Not established in this OS |
| Independent corroboration count | `unknown` | Not established in this OS |

## PROHIBITED ASSUMPTIONS

1. **Never state catalog facts from memory.** Release titles, dates, credits, and collaborators are
   retrieved from primary sources (distributor, official profiles, rights databases) or they are `unknown`.
   A hallucinated discography entered as fact would corrupt every downstream entity-accuracy measurement —
   this is the single highest-risk failure mode for this brand.
2. **Do not assume artist-name queries resolve to this entity.** Verify resolution before measuring anything.
3. **Do not reorder or flatten the role hierarchy** to chase query volume. It is artist-approved intent.
4. **Do not propose Modest↔Fendi cross-linking.** It is held; proposing it repeatedly wastes review cycles.
5. **Do not treat streaming-platform metrics as retrieval metrics.** Plays are not citations.
6. **Do not count syndicated profile copies as independent corroboration** — most artist directory pages
   are derivative of a single distributor feed (see `../06_SOURCE_PROVENANCE/`).

## OPEN QUESTIONS

1. What exactly is I1a — intervention, surfaces, baseline date, checkpoints, success criteria?
   *Blocks:* every Fendi Frost module's contamination check.
2. What is the canonical profile hierarchy, and which profile is the intended authority target?
   *Blocks:* `ARTIST_04`, `ARTIST_05`.
3. What is the verified catalog? *Blocks:* `ARTIST_02`, and any entity-accuracy scoring.
4. What is Runway Music formally — label, imprint, collective, or positioning term? The correct schema
   and entity treatment differ for each. *Blocks:* `ARTIST_01`, `ARTIST_05`.
5. Is there an owned website, or is the footprint entirely platform profiles? *Blocks:* `WEB_*` applicability.
6. What is the Fabric Series' structure — a release series, a project, or a recurring format?

## NEXT DECISION POINT

**Define and record I1a in the experiment registry, and establish the entity-resolution baseline.**
Entity resolution is upstream of everything else here: until it is known whether answer engines resolve
"Fendi Frost" to this artist at all, no other Fendi Frost metric can be interpreted.
