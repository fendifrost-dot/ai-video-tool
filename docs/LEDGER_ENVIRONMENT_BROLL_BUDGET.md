# Environment / camera / B-roll budget — authoritative spend ledger

Opened 2026-10-01 by Claude when Fendi parked the garment lane ("give it another 6 months") and set a **separate $50 ceiling** for the environment phase: amazing environments with moving pieces, camera distance and angle changes, repeatable camera/lens functions, and Grok image-to-video B-roll of the artist in the garments (no rapping). This ledger is separate from `docs/LEDGER_YSL_TESTING_BUDGET.md` (the garment lane, $21.57 used / $28.43 remaining at rev 38, frozen while that lane is parked). Crossing $50 here is CODE RED.

Rules (same as the YSL ledger): every paid call is a row; the "Actual billed" column carries what the provider reported (xAI `usage.cost_in_usd_ticks` via `grok-broll-proxy`, OpenAI billed usage via `astra-visual-review-proxy`); estimates are carried only until a billed figure exists; unbilled provider errors (4xx before generation) are noted but add $0. Deterministic work (camera engine, matting, compositing, QA) is $0 and is not listed.

## Scope — the $50 environment/B-roll ceiling (set 2026-10-01)

| # | Date | Provider | Call / purpose | Actual billed | Estimated / unverified | Running total |
|---|---|---|---|---|---|---|
| — | 10-01 | xAI | B-roll submit #0 from the raw closet anchor — **422 at xAI** (`image` must be an `ImageUrl` struct, proxy sent a bare string); not generated | $0 | — | $0 |
| 1 | 10-01 | xAI | B-roll test 1 (`grok-imagine-video`, 6 s, 720p, 9:16) from the raw closet anchor `heroes/S06/anchor_hook_s11_f0080.jpg`, request `b129f167…`, asset `11a23812…` | $0.422 | gate estimated $0.30 at the $0.05/s list rate | $0.422 |
| 2 | 10-01 | xAI | B-roll test 2, same model/duration, from the anchor **composited onto the stage plate** `heroes/S06/anchor_hook_s11_f0080_onstage.jpg`, request `519ac36d…`, asset `c1176226…` | $0.422 | gate now prices at the measured $0.0703/s ($0.4218) | $0.844 |

**Used $0.844 · remaining $49.156 of $50.**

## Price facts learned

- `grok-imagine-video` image-to-video, 6 s at 720p 9:16, bills **$0.422** (= $0.0703 per generated second), not the $0.05/s list rate; the proxy's `maxCostUsd` gate prices at the measured rate so the gate fails safe.
- Submit-time 4xx errors at xAI are unbilled (the first 422 above).
