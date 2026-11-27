# BOLTZ AUTOMOTIVE — CONTEXT LOCK

> Authoritative context for all Boltz SEO/GEO work. Load before any module run.
> Every fact carries a classification per `../00_SYSTEM_RULES/01_EVIDENCE_TAXONOMY.md`.
> **Facts marked `unknown` must be filled from primary sources or owner confirmation before the modules
> that depend on them can run.** Do not infer them, and do not fill them from model memory.

**LAST UPDATED:** 2026-08-22
**CURRENT PHASE:** OS bootstrap — context capture. No deployment.
**ACTIVE EXPERIMENT:** `BOLTZ-BATCH1` — observation state (see `../05_INTERVENTION_LOGS/EXPERIMENT_REGISTRY.csv`)

---

## DO NOT CHANGE

| Item | Reason | Released when |
|---|---|---|
| Any surface touched by Batch 1 | Under active observation; changes destroy the read | Batch 1 checkpoint reached and recorded |
| GBP primary category | A category change resets local category association and confounds Batch 1 | Batch 1 readout + explicit approval |
| Site URL structure / redirects | Structural churn invalidates every baseline simultaneously | Post-Batch 1, with a migration plan |
| Business name, address, phone as listed anywhere | NAP consistency is the one local factor with a clean mechanism; churn is pure downside | Never, absent a real business change |

## KNOWN FACTS

### Identity & entity
| Fact | Value | Class | Source |
|---|---|---|---|
| Business name (exact legal) | `unknown` | unknown | — |
| Business name (as listed on GBP) | `unknown` | unknown | — |
| Address | `unknown` | unknown | — |
| Phone | `unknown` | unknown | — |
| Website domain | `unknown` | unknown | — |
| Hours | `unknown` | unknown | — |
| Service area | `unknown` | unknown | — |
| Legacy / history / founding | `unknown` | unknown | — |
| Ownership & key people | `unknown` | unknown | — |

### Commercial priorities
| Fact | Value | Class | Source |
|---|---|---|---|
| Primary growth target | **Engine replacement** | owner-confirmed | Owner directive, 2026-08-22 |
| Current posture | Capacity growth | owner-confirmed | Owner directive, 2026-08-22 |
| Full service list | `unknown` | unknown | — |
| Average ticket by service | `unknown` | unknown | — |
| Lead → booked → approved → completed funnel rates | `unknown` | unknown | — |

> **Scoring consequence:** engine-replacement demand carries `BusinessValue` 5 in
> `../00_SYSTEM_RULES/04_OPPORTUNITY_SCORING.md`. Engine-adjacent diagnostic demand that feeds it carries 4.
> Capacity-growth posture means lead volume is genuinely wanted — this is not a brand-defense engagement.

### Surfaces
| Surface | State | Class |
|---|---|---|
| Website structure (live page inventory) | `unknown` — needs crawl | unknown |
| GBP profile completeness | `unknown` | unknown |
| Review count / rating / velocity | `unknown` | unknown |
| Citation footprint | `unknown` | unknown |
| GSC / GA access | `unknown` — access status must be confirmed before WEB_02 can run | unknown |

### Baselines
| Baseline | Date | State |
|---|---|---|
| Batch 1 pre-deployment baseline | `unknown` | Referenced as existing; needs import from prior research |
| Map-pack visibility baseline | `unknown` | Not established in this OS |
| AI visibility baseline | `unknown` | Not established in this OS |

## PROHIBITED ASSUMPTIONS

1. **Do not assume competitor GBP categories are correct to copy** (`UC-04`). Categories are copied only
   when they describe a service Boltz actually performs.
2. **Do not assume posting cadence, geotagged photos, or keyword-bearing review replies affect ranking**
   (`UC-01`, `UC-02`, `UC-03`). They are hypotheses.
3. **Do not assume national keyword volume equals local opportunity.** For a single-location service
   business, a high-volume query with no local intent caps at `Reach` 2.
4. **Do not assume "more reviews" is the lever** without separating count, velocity, recency, and
   response rate (`UC-05`).
5. **Do not treat organic traffic as the KPI.** The KPI chain ends at completed engine jobs.
6. **Do not assume the site is technically healthy** — no crawl has been run inside this OS.

## OPEN QUESTIONS

1. What exactly is in Batch 1 — which surfaces changed, on what date, against which baseline?
   *Resolves via:* prior research handoff. *Blocks:* nearly every Boltz module (contamination checks).
2. Are GSC and GA available, and for what history window? *Resolves via:* owner. *Blocks:* `WEB_02`, `WEB_04`, `WEB_06`.
3. What is the real funnel instrumentation — how is a "lead" recorded, and can leads be attributed to
   engine work? *Resolves via:* owner. *Blocks:* monthly reporting and all `BusinessValue` scoring.
4. Canonical NAP, hours, and service list. *Resolves via:* owner + GBP export. *Blocks:* `LSEO_01`–`LSEO_08`.
5. Who is the competitor set — by proximity, by service overlap, or by current SERP occupancy?
   *Resolves via:* owner + SERP sampling. *Blocks:* `AUTH_01`, competitor dossiers.
6. Is there paid search running that would confound organic lead attribution? *Resolves via:* owner.

## NEXT DECISION POINT

**Import the Batch 1 definition and baseline into the experiment registry.** Until Batch 1's changed
surfaces and baseline date are recorded, no Boltz finding can honestly answer `EXPERIMENT CONFLICT?`,
which blocks promotion of any finding past `RESEARCH NOW`.
