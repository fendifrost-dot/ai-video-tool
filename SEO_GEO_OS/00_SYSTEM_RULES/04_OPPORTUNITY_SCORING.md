# 04 — Opportunity Scoring

**Status:** ACTIVE · **Last updated:** 2026-08-22

Not all findings are equal, and not all keywords are equal. This produces a single comparable number so
the decision queue can be sorted honestly across brands and modules.

## Formula

```
Opportunity Score = (Reach × Intent × BusinessValue × Confidence) / Effort
```

All inputs are 1–5 integers. Score range: 0.2 – 625. Record the five inputs alongside the score — a bare
score is not auditable.

| Input | 1 | 3 | 5 |
|---|---|---|---|
| **Reach** | Negligible volume / one surface | Moderate demand or a few surfaces | High demand or a category-wide surface |
| **Intent** | Informational, no purchase signal | Comparison / research stage | Ready to transact or contact |
| **BusinessValue** | Low-margin or non-revenue | Contributes to revenue indirectly | Directly tied to the brand's primary growth target |
| **Confidence** | Hypothesis, untested | Observed, plausible mechanism | Confirmed, with a known mechanism |
| **Effort** | Under an hour | Half a day to a day | Multi-day or cross-functional |

`Confidence` maps from the evidence taxonomy: `confirmed` = 5, `owner-confirmed` = 4 (business facts
only), `observed` = 3, `hypothesis` = 2, `unknown` = 1.

## Per-brand commercial weighting

The formula is uniform; **`BusinessValue` is where each brand's economics enter.** Apply these:

### Boltz Automotive
- **Engine replacement demand = 5.** It is the stated primary growth target and carries the highest
  ticket value. Engine-adjacent diagnostic demand that feeds it = 4.
- General repair/maintenance queries = 2–3.
- Brand-name queries = 2 (already captured; defending, not growing).
- Informational car-advice content with no local intent = 1.
- **Local proximity is a multiplier on Reach, not a separate term** — a high-volume national query with
  no local intent scores `Reach` 2 at most for a single-location service business.

### Modest / MOD#$T
- Product and category queries with purchase intent = 5. Ready-to-buy SKU queries = 5.
- Category-discovery queries ("streetwear brands chicago") = 3–4.
- Vanity fashion / trend terms with no path to a product page = 1–2, **regardless of volume.**
- Retrieval accuracy on product facts = 4 (an AI misstating a product blocks a sale).

### Fendi Frost
- Entity/identity accuracy = 5. If answer engines resolve the wrong entity, everything else is wasted.
- Cultural and catalog discovery value = 4–5, **even with no direct ecommerce conversion.**
- Direct-conversion framing does not apply; do not down-score a finding for lacking a purchase path.
- Independent corroboration growth = 4 (it is the input that makes the rest durable).

## Rules

1. **Never compare raw scores across brands to allocate budget** without saying so — the weighting is
   intentionally brand-specific. Sort *within* a brand; compare *across* brands only with judgment.
2. **A score is not an approval.** High scores enter the decision queue like everything else.
3. **Re-score when confidence changes.** A hypothesis that graduates to confirmed more than doubles its
   score; that is the intended behavior, and it means research has compounding value.
4. **Effort is honest effort**, including review, QA, and measurement setup — not just the edit.
