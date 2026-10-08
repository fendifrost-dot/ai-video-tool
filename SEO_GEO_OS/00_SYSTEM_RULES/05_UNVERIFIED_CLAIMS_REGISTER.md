# 05 — Unverified Claims Register

**Status:** ACTIVE · **Last updated:** 2026-08-22

Widely repeated SEO/GEO tactics enter this OS as **hypotheses with named tests**, never as facts. This
register exists so that inherited advice — including the useful tactical concepts imported from external
briefs — cannot silently harden into "known."

A claim leaves this register in one of two directions: promoted to `confirmed` by a registered experiment
that met its success criterion, or rejected with the failing evidence recorded. Nothing leaves by
consensus or repetition.

---

| ID | Claim | Status | Named test that would settle it | Falsifier |
|---|---|---|---|---|
| `UC-01` | GBP posting frequency directly boosts local ranking | `hypothesis` | Single-brand interrupted time series: fixed posting cadence for 8 weeks with all other GBP fields frozen; measure non-branded map-pack impressions + discovery searches vs. pre-period baseline | No change beyond baseline variance, or change tracks a confounder (seasonality, review influx, competitor churn) |
| `UC-02` | Keyword-rich *owner responses* to reviews improve rankings | `hypothesis` | Split by review cohort: respond to one cohort with service-term-bearing responses, one with plain responses, over 8+ weeks; compare category-query visibility | No divergence between cohorts |
| `UC-03` | Geotagging photo EXIF is a meaningful local ranking factor | `hypothesis` | Upload matched photo sets, one geotagged, one stripped, over 6+ weeks; measure photo views + local visibility | No divergence. **Prior: weak** — platforms are widely reported to strip EXIF on upload; verify stripping *first*, and if EXIF is stripped the claim is mechanically dead and becomes `REJECT` |
| `UC-04` | A competitor's GBP categories should be copied | `hypothesis` | Never test by blind copying. Test one *justified* secondary category matching an actual service, hold others fixed, measure category-query visibility for 8 weeks | Visibility flat or down, or the category misdescribes the business (an automatic reject regardless of measurement) |
| `UC-05` | Review *velocity* outweighs total review count | `hypothesis` | Observational across a competitor set: correlate rank position against velocity and against total count separately; requires ≥15 competitors before it means anything | Total count explains position at least as well as velocity |
| `UC-06` | Being cited in AI answers requires being in the top organic results | `hypothesis` | For 30 tracked prompts, record cited sources and their organic positions; measure overlap | Frequent citation of sources outside the top organic set |
| `UC-07` | Adding schema markup increases AI answer citation rate | `hypothesis` | Add schema to a matched subset of pages, hold a control subset unchanged, track citation rate across platforms for 6+ weeks | No divergence between subsets |
| `UC-08` | More citations/directory listings improve local ranking beyond consistency | `hypothesis` | Distinguish *consistency* (NAP matching) from *count*. Fix inconsistencies first, measure; only then add net-new listings and measure separately | Consistency fixes move the metric and net-new listings do not |

## Hard stops — not testable, not proposed, ever

These are excluded on principle, not pending evidence:

- Encouraging, scripting, or incentivizing customers to include keywords in reviews.
- Any fabricated, templated, or purchased review or testimonial.
- Fake or misdescriptive GBP categories, service areas, or business names.
- Synthetic press, PBN links, or paid links presented as editorial.
- Any tactic whose value depends on a platform failing to detect it.

## Rules

1. **Citing this register is mandatory** when a module output touches one of these claims. The module
   states the UC id and carries `CONFIDENCE: low`.
2. **No stacking.** Do not deploy several `hypothesis` tactics at once and attribute the result to one —
   that produces an unreadable experiment and is the most common way local SEO fools itself.
3. **Promotion requires a registered experiment** in `EXPERIMENT_REGISTRY.csv` with a pre-registered
   success criterion. Post-hoc reinterpretation of a failed test does not promote a claim.
