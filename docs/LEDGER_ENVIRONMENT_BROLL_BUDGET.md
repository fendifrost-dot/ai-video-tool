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
| 15 | 10-01 | xAI | world clip: the artist's arctic-room exemplar, `grok-imagine-video` text-to-video 10 s (stopgap; request `eed968bf…`) | $0.70 | — | $10.307 |
| 16 | 10-01 | OpenAI | judge on the Grok arctic room ($0.1069) and the Runway arctic room ($0.1017) | $0.209 | — | $10.516 |
| 17 | 10-01 | Runway | arctic room on gen4.5 text-to-video 5 s (CC envelope estimate 75 credits) and the rims-street performance plate 10 s (150 credits) — billed to the Runway account behind Control Center | not read | ≈ $0.75 + $1.50 | $12.766 |
| 18 | 10-01 | Higgsfield | Kling 2.5 turbo pro text-to-video ×2 (arctic room, rims plate; 10 s each) through the new CC catalogue function — queued at Higgsfield for > 45 min at the time of writing | balance-billed when they complete | ≈ 2 × $0.70 | $14.166 |
| 19 | 10-01 | xAI | `lyric-visualizer-proxy` v2 at the artist's bar: grok-4.6 attempts timed out at the gateway (8 line-calls + 8 chunk-calls, billing unknown — carried as an estimate); grok-4-fast runs: 16 lines / 48 scenes $0.694 + probe $0.044 | $0.738 | ≈ $1.50 possible for the timed-out grok-4.6 calls | $16.404 |
| 20 | 10-01 | OpenAI | judge on the two Kling 2.5 catalogue clips (arctic room $0.0586, rims-street plate $0.0405) — both jobs completed after ≈ 4.5 h in the Higgsfield queue | $0.099 | — | $16.503 |
| 21 | 10-01 | OpenAI | judge on Fendi's four reference reels (the realism bar; all PASS 0.04–0.10) | $0.199 | — | $16.702 |
| 22 | 10-01 | xAI | **world stills to the bar** (`world-still-proxy`, grok-imagine-image-quality 2k, 9:16, `film_bar_v1` preamble): 9 shots × 2 candidates = 18 images, the nearer-the-bank candidate picked; two moderated attempts on the hallway shot returned `billed:false` | $1.26 | ≈ $0.28 if xAI billed the moderated attempts | $17.962 |
| 23 | 10-01 | Runway | world batch 1 (`run_world_batch.py`): 7 stills → gen4_turbo image-to-video 5 s ($0.25 each) + 4 plates on gen4.5 text-to-video 5 s ($0.75 each); the account behind CC then reported **no credits** (3 gen4.5 shootout submits refused, unbilled) | not read | $4.75 list | $22.712 |
| 24 | 10-01 | Higgsfield | motion shootout on 3 stills: DoP turbo ×3 (≈ $0.42) + Kling 2.5 turbo pro image-to-video ×3 ($0.35); world batch 2: Kling i2v ×6 + Kling text-to-video plates ×3 ($0.35 each) | balance-billed | ≈ $5.45 list | $28.162 |
| 25 | 10-01 | OpenAI | judge on 26 generated clips (11 + 6 + 9) | $2.220 | — | $30.382 |
| 26 | 10-01 | Runway + OpenAI | shootout gen4.5 image-to-video ×3 after Fendi's top-up (all REJECT 0.30–0.93) + judge ×3 | $0.25 judge | $2.25 Runway list | $32.882 |
| 27 | 10-02 | Higgsfield + OpenAI | **Seedance 2.5 reference-to-video T1**: S11 performance (4 s, 720p) + Bentley plate still → same performance from a new angle inside the street, 5 s 720p 9:16 (request `3c23e12d…`, judge PASS 0.06) + judge | $0.08 judge | $4.16 list ((4 in + 5 out) s × $0.4622; CC estimate showed $2.31 for the output seconds only) | $37.122 |
| 28 | 10-02 | Higgsfield + OpenAI | Seedance 2.5 **T2 angle-only** (no image): same 4 s source → second camera in the same room, 4 s, lip-sync emphasised in the prompt (request `f7cab370…`) + judge | $0.08 judge | $3.70 list (8 s × $0.4622) | $40.902 |
| 29 | 10-02 | Higgsfield | **Seedance 2.5 reference-to-video ×4** from the app's Runs page (run `run-20261002-1320`): `S06c_low_hero`, `S08a_side_tight`, `S11c_low_hero`, `S12b_side_tight`, each a 4 s 720p source → 4 s result (requests `71167480…`, `ecda36b3…`, `ab4048f5…`, `1b54b141…`) | balance-billed | 4 × $3.698 = $14.79 list | $55.694 |
| 30 | 10-02 | xAI | stoop plate: two world stills (`world-still-proxy` via the Runs page) | $0.14 | — | $55.834 |
| 31 | 10-02 | Runway | stoop plate motion, gen4.5 image-to-video 5 s (the Kling submit before it was refused by Higgsfield, `403 not_enough_credits`, unbilled; the saved still was reused) | not read | $0.75 list | $56.584 |
| 32 | 10-02 | xAI | `lyric-visualizer-proxy` single-scene regenerations on the live storyboard, three passes (8 calls, grok-4-fast) | ≈ $0.32 | — | $56.904 |
| 33 | 10-02 | Higgsfield | round 2 (`run-20261002-r2`, after Fendi's $50 API top-up): Seedance 2.5 ×2 — `S06c_high_wide` (request `173eab1d…`), `S08a_over_shoulder` (`62922383…`) | balance-billed | 2 × $3.698 = $7.40 list | $64.300 |
| 34 | 10-02 | xAI + Higgsfield | five world shots, each two stills ($0.14) + Kling 2.5 turbo pro image-to-video 5 s ($0.35): `P_stoop_wall` (stills came back as stacked panels — wasted), `P_stoop_wall2`, `P_stoop_close`, storyboard card `c006` as first compiled (two scenes in one still — wasted) and `c006` after the compile fix | $0.70 xAI | $1.75 Kling list | $66.750 |
| 35 | 10-02 | xAI | `lyric-visualizer-proxy` single-scene regenerations ×2 | ≈ $0.08 | — | $66.830 |
| 36 | 10-03 | xAI | storyboard redesign validation on YSL: shot 09 "Generate image" from the new storyboard (`world-still-proxy`, two 2k 9:16 stills, job `2f25b5fe…`) | $0.14 | — | $66.970 |
| 37 | 10-03 | Higgsfield | shot 09 "Generate clip": Kling 2.5 turbo pro image-to-video 5 s from that still (request `fd7714a7…`, job `76c8c88b…`) — landed on shot 09 only | balance-billed | $0.35 list | $67.320 |
| 38 | 10-03 | xAI | `lyric-visualizer-proxy` per-shot rewrites with the treatment and neighbours ×2 (shots 09 and 12) | ≈ $0.08 | — | $67.400 |
| 39 | 10-03 | OpenAI | lyric timing test runs on YSL through `lyric-align-proxy` (`whisper-1`, 0.6 ¢ per minute of audio sent): six runs, previewed and discarded, nothing saved | ≈ $0.42 list | — | $67.820 |
| 40 | 10-03 | xAI | frontend production test on YSL (shots 13–25): `treatment-writer-proxy` ×2 (grok-4-fast, concept + chunks) and one "Regenerate scene" on shot 16 | ≈ $0.06 | — | $67.880 |
| 41 | 10-03 | xAI | the section's stills from the storyboard: 27 presses of "Generate image" / "Generate the place" (`world-still-proxy`, two 2k 9:16 stills each) — 11 first pass, 16 over three repair rounds | $3.78 | — | $71.660 |
| 42 | 10-03 | Higgsfield | the section's cutaway clips: Kling 2.5 turbo pro image-to-video ×20 (seven shots: 7 first pass, 13 over three repair rounds) | balance-billed | $7.00 list | $78.660 |
| 43 | 10-03 | Higgsfield | "Restage the take": Seedance 2.5 reference-to-video 720p ×12 over six performance shots, 4 s of the take in and 4 s out each ($3.698 list) — 6 first pass, 6 repairs (three put aside: two drew legs in shorts, one drew the runway's line through him) | balance-billed | $44.37 list | $123.030 |
| 44 | 10-03 | OpenAI | "Ask Astra" on shots 13–25 from Review ×4 (39 frames each): $0.33, $0.30, $0.32, $0.31 | $1.26 | — | $124.290 |

**Used ≈ $124.29 against the $50 line — past it on Fendi's word (2026-10-02: "Disregard the $50 limit for testing"; he then added $50 to the Higgsfield API balance the same night; 2026-10-03, for the frontend production test: only already-authorized capacity, no purchases).** Of that, ≈ $95.11 Higgsfield list estimate, $10.00 Runway list estimate and $1.78 possible unbilled xAI calls are carried, not billed figures. **Higgsfield API balance — read the console before the next paid round.** $50 was added on 2026-10-02. At list rates ≈ $60.87 has gone since (≈ $9.50 before the production test, $51.37 in it), which is more than was added — and the provider accepted every job, the last at 12:19 UTC on 10-03. So list overstates what is billed (most likely the Seedance input seconds, which this ledger counts and the Control Center estimate does not: counted once, the twelve restagings are ≈ $22.19, not $44.37), and what is left is unknown from here: somewhere between nothing and ≈ $11. No job was refused for credit. Higgsfield spend is visible as "Spend today" on open.higgsfield.ai; Runway spend on the Runway account; replace the estimates with the billed figures when read.

## Price facts learned

- Lyric timing (`lyric-align-proxy`, OpenAI `whisper-1`): $0.006 per minute of audio sent. A 3:22 song is ≈ $0.03 for the first pass and ≈ $0.08 with retries and the second listen.
- `grok-imagine-video` image-to-video, 6 s at 720p 9:16, bills **$0.422** and 10 s bills **$0.702** (= $0.0703 per generated second, linear), not the $0.05/s list rate; the proxy's `maxCostUsd` gate prices at the measured rate so the gate fails safe.
- Submit-time 4xx errors at xAI are unbilled (the first 422 above).
- Realism judge (gpt-6-astra, 10 frames at 540x960, medium reasoning): **$0.08–0.11 per clip** — cheap enough to run on every generated clip.
- `lyric-visualizer-proxy`: grok-4.6 ≈ $0.02 per line but > 150 s per line at the v2 schema (gateway idle timeout); **grok-4-fast ≈ $0.04 per line in ≈ 18 s** — the default now.
- Runway gen4.5 text-to-video: 15 ¢/s (5 s = $0.75, 10 s = $1.50). Kling 2.5 turbo pro via Higgsfield: ≈ 7 ¢/s list.
- Seedance 2.5 reference-to-video via Higgsfield: $0.2468 / $0.4622 / $1.1372 per second at 480p / 720p / 1080p, input video seconds billed too — so a 4 s source feeding a 5 s result at 720p is ≈ $4.16, not $2.31. Trim the source to the sung bar before sending.
