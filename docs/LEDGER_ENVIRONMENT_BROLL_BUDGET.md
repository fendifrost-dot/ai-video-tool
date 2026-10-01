# Environment / camera / B-roll budget — authoritative spend ledger

Opened 2026-10-01 by Claude when Fendi parked the garment lane ("give it another 6 months") and set a **separate $50 ceiling** for the environment phase: amazing environments with moving pieces, camera distance and angle changes, repeatable camera/lens functions, and Grok image-to-video B-roll of the artist in the garments (no rapping). This ledger is separate from `docs/LEDGER_YSL_TESTING_BUDGET.md` (the garment lane, $21.57 used / $28.43 remaining at rev 38, frozen while that lane is parked). Crossing $50 here is CODE RED.

Rules (same as the YSL ledger): every paid call is a row; the "Actual billed" column carries what the provider reported (xAI `usage.cost_in_usd_ticks` via `grok-broll-proxy`, OpenAI billed usage via `astra-visual-review-proxy`); estimates are carried only until a billed figure exists; unbilled provider errors (4xx before generation) are noted but add $0. Deterministic work (camera engine, matting, compositing, QA) is $0 and is not listed.

## Scope — the $50 environment/B-roll ceiling (set 2026-10-01)

| # | Date | Provider | Call / purpose | Actual billed | Estimated / unverified | Running total |
|---|---|---|---|---|---|---|
| — | 10-01 | xAI | B-roll submit #0 from the raw closet anchor — **422 at xAI** (`image` must be an `ImageUrl` struct, proxy sent a bare string); not generated | $0 | — | $0 |
| 1 | 10-01 | xAI | B-roll test 1 (`grok-imagine-video`, 6 s, 720p, 9:16) from the raw closet anchor `heroes/S06/anchor_hook_s11_f0080.jpg`, request `b129f167…`, asset `11a23812…` | $0.422 | gate estimated $0.30 at the $0.05/s list rate | $0.422 |
| 2 | 10-01 | xAI | B-roll test 2, same model/duration, from the anchor **composited onto the stage plate** `heroes/S06/anchor_hook_s11_f0080_onstage.jpg`, request `519ac36d…`, asset `c1176226…` | $0.422 | gate now prices at the measured $0.0703/s ($0.4218) | $0.844 |
| 3 | 10-01 | xAI | B-roll test 3, same model, **10 s** 720p 9:16 from the composited anchor — crane wide-to-close distance/angle change, request `fb2fa54a…`, asset `d68c4100…` | $0.702 | gate $0.703 | $1.546 |
| 4 | 10-01 | xAI | `lyric-visualizer-proxy` (grok-4.6): 8 hook lines → 24 concepts, 12 726 in / 8 742 out tokens | $0.169 | — | $1.715 |
| — | 10-01 | xAI | first visualiser call (all 8 lines in one chat call) died at the gateway's 150 s idle timeout — whether xAI billed the abandoned completion is unknown; carried as $0 until the console says otherwise | $0 | possibly ≈ $0.17 | $1.715 |
| 5 | 10-01 | OpenAI | realism gate tier 2 (gpt-6-astra judge, 10 frames): real S11 cut $0.0799, B-roll test 3 $0.0996, test 1 $0.0993 | $0.279 | — | $1.994 |
| 6 | 10-01 | xAI | B-roll test 4: lyric H6 literal "Black Ice Spreads", 8 s 720p from the v2 composited anchor, request `5c6840e5…`, asset `184de925…` | $0.562 | — | $2.556 |
| 7 | 10-01 | OpenAI | realism gate tier 2 on test 4 ($0.1109) and test 2 ($0.1043) | $0.215 | — | $2.771 |
| 8 | 10-01 | Higgsfield | B-roll test 5: DoP turbo orbit from the v2 composited anchor through CC `video-providers-higgsfield-generate` (job `62825072…`), 5.4 s 720p — billed to the Higgsfield organisation balance, not the xAI/OpenAI keys | not yet read from the Higgsfield dashboard | ≈ $0.42 (dop-turbo 5 s list) | $3.191 |
| 9 | 10-01 | OpenAI | realism gate tier 2 on test 5 | $0.095 | — | $3.286 |
| 10 | 10-01 | xAI | `lyric-visualizer-proxy`: 8 verse lines of the v20 section → 24 concepts | $0.168 | — | $3.454 |
| 11 | 10-01 | Higgsfield | tests 6–7: DoP **preview** and **turbo** from the hard-matte v3 still, same prompt/seed (jobs `5f944064…`, `94a54eaa…`) | balance-billed | ≈ $0.573 + $0.416 list | $4.443 |
| 12 | 10-01 | OpenAI | judge on tests 6–7 | $0.204 | — | $4.647 |
| 13 | 10-01 | Higgsfield | **B-roll batch 1**: 8 lyric concepts (V1–V8) × DoP turbo from the v3 still, seed 4242 (`broll_batch1/manifest.json`) | balance-billed | ≈ 8 × $0.416 = $3.328 list | $7.975 |
| 14 | 10-01 | OpenAI | judge on batch 1 untrimmed (8 clips, $0.821) and head-trimmed (8 clips, $0.811) | $1.632 | — | $9.607 |

**Used $9.607 (of which $4.737 is carried Higgsfield list-price estimate, billed to the Higgsfield organisation balance) · remaining $40.393 of $50.** Higgsfield spend is visible as "Spend today" on open.higgsfield.ai; replace the estimate with the billed figure when read.

## Price facts learned

- `grok-imagine-video` image-to-video, 6 s at 720p 9:16, bills **$0.422** and 10 s bills **$0.702** (= $0.0703 per generated second, linear), not the $0.05/s list rate; the proxy's `maxCostUsd` gate prices at the measured rate so the gate fails safe.
- Submit-time 4xx errors at xAI are unbilled (the first 422 above).
- Realism judge (gpt-6-astra, 10 frames at 540x960, medium reasoning): **$0.08–0.11 per clip** — cheap enough to run on every generated clip.
- `lyric-visualizer-proxy` (grok-4.6): ≈ $0.02 per lyric line (three concepts with prompts).
