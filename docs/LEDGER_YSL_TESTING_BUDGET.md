# YSL testing budget — authoritative spend ledger

Reconciled 2026-09-24 by Claude (executive authority, ChatGPT reconciliation directive). This file is the single ledger for the **$50 YSL testing budget** Fendi set on 2026-09-21 (handoff rev 24: "make the best decision … otherwise we decide at the threshold"). Every later paid call is a row here; the handoff header's "spend this takeover" figures are cumulative across funding sources and are **not** the budget figure.

## Answer to the reconciliation question

The rev 29 header ("≈ $23.4 xAI + ≈ $26.4 OpenAI + ≈ $1.96 Runway") is **C with a dose of B and D**: it reports cumulative spend of the whole takeover (since rev 19, 2026-09-20) across two funding sources that predate the $50 budget — an xAI API credit and Fendi's $30 OpenAI top-up (rev 20) — and several of its numbers are estimates rather than billed amounts. Only spend after the budget was set counts against the $50. That spend is **≈ $10.9 (conservative), leaving ≈ $39.1**. The "well inside $50" statement was correct in substance and wrong in presentation: the header mixed scopes.

Two figures were also found to be overstated in the results doc and are corrected here: the S09 repair round was "$1.28 for four rolls incl. two unbilled 400s" — two of the four rolls were unbilled 400s, so the billed amount is 2 × $0.32 = **$0.64** (rev 25 already said "$0.64 billed"); and the E1 anchored re-roll "≈ $4.6" is an estimate — the per-shot rates on record sum to **$4.00** (8 slots + one S09 retry). The ledger carries the higher figure until the xAI console confirms.

## Scope 0 — before the $50 budget (separate authorizations; not counted)

| Provider | Call / purpose | Billed | Scope |
|---|---|---|---|
| xAI | v1–v5 wardrobe edits (43 billed `/videos/edits` runs across pass 1, v2, v3b, v3c, v4, v4b, v4c) | $16.40 (results doc, "xAI $16.40 total this takeover" at v5) | xAI API credit, takeover authorization 2026-09-20 |
| OpenAI | Astra full reviews #1–#3 (v1, v2, v5) + one incomplete part + one 504-sunk attempt | ≈ $24.00 (results doc at v5: "≈ $24 of the $30 credit") | Fendi's $30 OpenAI top-up, 2026-09-21 |

## Scope 1 — the $50 YSL testing budget (set 2026-09-21, rev 24)

| # | Date | Provider | Call / purpose | Actual billed | Estimated / unverified | Running YSL total |
|---|---|---|---|---|---|---|
| 1 | 09-21 | xAI | E2: 14 anchored hero stills on S06 (`grok-image-garment-proxy`) | $1.68 | — | $1.68 |
| 2 | 09-21 | xAI | E1: anchored re-roll of all 8 wardrobe slots + S09 retry (`v4c-anchor-e1`, `-e1b`) | per-shot rates sum to $4.00 | carried as $4.60 (handoff estimate) | $6.28 |
| 3 | 09-22 | xAI | S09 repair rolls e1c #1, #2 (two further attempts were unbilled 400s) | $0.64 | — | $6.92 |
| 4 | 09-22 | OpenAI | Astra targeted review of v7 (one `mechanisms` part) | $1.09 | — | $8.01 |
| 5 | 09-22 | OpenAI | Astra targeted review of v8 | $0.76 | — | $8.77 |
| 6 | 09-23 | Runway (via Control Center) | Aleph 2.0 on S08, task `985fe022…`, completed | $1.68 (Runway `cost.credits` = 168: 28 credits/s × 6 s — Runway bills the floored duration; AVT estimated $1.96) | — | $10.45 |
| 7 | 09-23 | OpenAI | Astra targeted A/B, Aleph vs E1 on S08 | $0.4562 | — | $10.91 |
| – | 09-23/24 | Runway | Gemini Omni Flash 1.1 on S08 ×2, `THIRD_PARTY.TIMEOUT` | $0 (0 credits) | not counted | $10.91 |
| 8 | 09-24 | xAI | S08 E1 best-of-2 (`v4c-anchor-e1-bestof-1/-2`); neither beat the accepted roll | $1.12 (2 × $0.56, `actualCostUsd`) | — | $12.03 |
| 9 | 09-24 | OpenAI | Astra project-level review of v10, `sequence` part only (43 frames @ 1 s + 5 refs) | $0.8794 | — | $12.91 |
| 10 | 09-24 | OpenAI | Astra re-review of v11, `sequence` part | $0.9063 | — | $13.82 |

**YSL testing budget used: ≈ $13.82 · remaining: ≈ $36.18 of $50.** Row 2 is the only unverified amount and is carried at its upper estimate.

## Second constraint: the OpenAI credit balance

Fendi's $30 OpenAI top-up funds every Astra call regardless of which budget it is booked to. Spent: ≈ $24.00 (scope 0) + $1.09 + $0.76 + $0.46 + $0.88 + $0.91 (v10, v11 sequence reviews) = **≈ $28.10 → ≈ $1.90 left** — one more single-part review at most; a top-up is needed before any further Astra pass. A three-level full Astra review has cost ≈ $8; a single-part review of ~30 frames has cost $0.76–1.09. So the project-level review of the assembled section must be designed as **one part** (≈ $1.5) until the OpenAI balance is topped up. This is a resource limit, not a budget breach; it does not stop $0 work.

## Rules applied

- Failed, unbilled provider calls ($0) are listed for provenance and never counted.
- Where a billed amount is unverified, the higher of the estimate and the computed figure is carried.
- Every future paid call appends a row here in the same commit as its result.
