# YSL testing budget — authoritative spend ledger

Reconciled 2026-09-24 by Claude (executive authority, ChatGPT reconciliation directive). This file is the single ledger for the **$50 YSL testing budget** Fendi set on 2026-09-21 (handoff rev 24: "make the best decision … otherwise we decide at the threshold"). Every later paid call is a row here; the handoff header's "spend this takeover" figures are cumulative across funding sources and are **not** the budget figure.

## Answer to the reconciliation question

The rev 29 header ("≈ $23.4 xAI + ≈ $26.4 OpenAI + ≈ $1.96 Runway") is **C with a dose of B and D**: it reports cumulative spend of the whole takeover (since rev 19, 2026-09-20) across two funding sources that predate the $50 budget — an xAI API credit and Fendi's $30 OpenAI top-up (rev 20) — and several of its numbers are estimates rather than billed amounts. Only spend after the budget was set counts against the $50. As of the last row below that spend is **$14.42 (conservative), leaving $35.58** — the table is authoritative and this sentence is updated with it. The "well inside $50" statement was correct in substance and wrong in presentation: the header mixed scopes.

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
| 11 | 09-25 | xAI | Pose-locked hero experiment, S08 f84: `grok-image-garment-proxy` ×3 (`pose-locked-hero-v1`, grok-imagine-image-quality, source + anchor + flat product) — all three failed the hero gate | $0.24 (xAI `cost_in_usd_ticks` 800000000 × 3; the proxy books 12 ¢ each) | — | $14.06 |
| 12 | 09-25 | fal (via Control Center) | Pose-locked hero experiment, S08 f84: `jacket-inpaint-proxy` ×3 (`fal-ai/flux-lora/inpainting` + evf-sam + face guard; runs 1–2 byte-identical at the default seed, run 3 seed 778) — all failed the hero gate | not readable from AVT (fal is billed on Control Center's key) | carried at the proxy's estimate 3 × $0.12 = $0.36 | $14.42 |

| 13 | 09-25 | xAI | Cross-shot Look consistency: the collar-facing constraint was added to the hook Look as DATA and S06/S09 were re-rolled through `grok-video-edit-proxy` (`v4d-anchor-e1-collar-1/-2-S06`, `-S09`; assets `9a3ab98b`, `dc46b133`, `4b58fb29`, `56768513`); collar-2 rolls selected for both shots | $1.76 (`actualCostUsd`: S06 2 × $0.56, S09 2 × $0.32) | — | $16.18 |

| 14 | 09-25 | OpenAI | Astra project-level review of v13, `sequence` part only (43 frames @ 1 s + 5 refs, previous defect ids + repair notes) — REPAIR_REQUIRED, one new defect (S06 collar interior tan, not navy) | $1.0626 | — | $17.24 |

| 15 | 09-25 | xAI | S06 collar-lining test: hook Look constraints strengthened as data (solid navy inner faces, plain shoulders), one `grok-video-edit-proxy` roll (`v4e-anchor-e1-lining-1-S06`, asset `7b6f7b0b`) — collar inside still tan (3/3 rolls against the anchor's own tan-inside collar), full-length outer sleeve stripes added; killed, S06 keeps collar-2 | $0.56 (`actualCostUsd`) | — | $17.80 |

| 16 | 09-25 | OpenAI | Astra TARGETED review of v15 (`mechanisms` part, 18 frames incl. 6 v13 before-frames, 4 refs): S11 approved roll IMPROVED 0.98, S08 hem v4 IMPROVED 0.9, hook one-garment UNCHANGED (S08 construction, S09 white ribbing, wordmark continuity S11 vs S06/S08) | $0.8439 | — | $18.64 |
| 17 | 09-26 | OpenAI | Astra project-level review of v17, `sequence` part, attempt 1 — INCOMPLETE (max_output_tokens 16000 hit: 9.7k reasoning + a cut JSON; billed usage 38,421 in / 16,000 out returned by the proxy after its fix) | $1.1842 | — | $19.82 |
| 18 | 09-26 | OpenAI | Astra project-level review of v17, `sequence` part, attempt 2 (maxOutputTokens 32000; 43 frames @ 1 s + 6 refs, v13 defect ids + repair notes) — REPAIR_REQUIRED; RESOLVED: SEQ-LOOK2-PRODUCT-TRUTH, S11-CHEST-BAND-INCOMPLETE, S09 waistband; top three remaining defects are all S08 | $1.1129 | — | $20.94 |
| 19 | 09-26 | OpenAI | Astra TARGETED review of v18 (`mechanisms` part, 24 frames incl. 8 v17 before-frames, 3 refs): S11-BAND-PATCH-INTEGRATION IMPROVED 0.94, S08-HEM-V5 IMPROVED 0.87 (hand-occluded ribbing and the split fronts remain), HOOK-WORDMARK-INTEGRATION UNCERTAIN 0.3 (possible S09 residue → chroma-led membership fix → v19) | $0.5797 | — | $21.52 |
| 20 | 09-26 | fal | Masked flux-general inpaint with the approved realisation as IP-Adapter image, S08 f84 (the registry's recorded gap): c0 rejected at the pose preprocessor (dwpose not allowlisted), c1 timed out after 948 s at fal (status 502) — no output; two evf-sam passes billed | $0.05 (upper estimate; fal shows no completed flux job) | — | $21.57 |
| 21 | 10-01 | Higgsfield | **Genjutsu object-swap smoke** (lane re-opened on Fendi's instruction before parking the garment swap): S06 real cut (6.97 s, 1080×1920) + 5 Look references (flat front, on-model, collar/zip, sleeve-inside worn and flat — UI chrome trimmed), 720p, through CC `video-providers-higgsfield-model` (`genjutsu-object-swap`, job `c6008c10…`) — billed to the Higgsfield organisation balance | not yet read from the Higgsfield dashboard | $4.77 list (68.1 ¢ × 7 source seconds) | $26.34 |
| 22 | 10-15 | xAI | Grok keyframes for the clothing-swap benchmark (take shot 19, frame 0: coat keyframe look `3bb1dafd`, Mastic keyframe look `5ef1bfe8`) | $0.24 (list; 2 × $0.12 as the proxy books them) | — | $26.58 |
| 23 | 10-15 | xAI | Grok video edit, swap benchmark roll 1 | $0.32 (list) | — | $26.90 |
| 24 | 10-15 | xAI | Grok video edit, swap benchmark roll 2 | $0.32 (list) | — | $27.22 |
| 25 | 10-15 | Higgsfield | Genjutsu object-swap, coat test, request `2fa69e06` (take shot 19, 4 s, 720p) | — | ≈ $2.72 list ($0.681 × 4 source seconds, rounded up) | $29.94 |
| 26 | 10-15 | Higgsfield | Genjutsu object-swap, Mastic track jacket, request `b21e4da6` (4 s, 720p) — the approved swap clip, cut from take 72.673–76.677 s | — | ≈ $2.72 list | $32.66 |
| 27 | 10-15 | Higgsfield | Genjutsu object-swap, khaki Cassandre cap, request `678a62a8` (4 s, 720p) | — | ≈ $2.72 list | $35.38 |
| 28 | 10-15 | Higgsfield | Genjutsu object-swap, beige Saint Laurent cap, request `71ff19f4` (4 s, 720p) | — | ≈ $2.72 list | $38.10 |
| – | 10-15 | Runway | aleph2 swap arm, refused at intake (59.94 fps source), task `c495048c…` | $0 | not counted | $38.10 |
| – | 10-15 | local CPU | Lyric re-time of the whole song with the repo's proven aligner (`scripts/lyrics/align_lyrics.py`, faster-whisper `small` on the build box, PyAV decoder swapped for ffmpeg): block 7 (“Freezin every season” ×1) re-timed, rows 95–101 written, rows 52–58 marked superseded | $0 | not counted | $38.10 |
| 29 | 10-15 | xAI (treatment-writer-proxy) | **Fast re-cut into candidate 6** (`358363e6`): 100 shots at the fast pace (drop 1.5 / high 1.5 / mid 2 / low 3 s), writer run `7d15638b` (grok-4-fast; the proxy call timed out client-side after 60 s, the run finished server-side and was recovered from `writer_runs` — called once, not re-run) | $0.0632 (`writer_runs.actual_cost_usd`) | $0.0502 estimated by the proxy | $38.16 |

**YSL testing budget used: ≈ $38.16 (rows 1–29; Phase 1 of 15 Oct added $0.0632, row 29 — report in `docs/review/production_2026-10-15/PHASE1_TREATMENT_AND_RECUT.md`). The $50 ceiling was lifted by the director on 15 Oct 2026 (production spend authorised with no cap); every paid call is still recorded here at its cost basis.** Earlier note, kept for the record: **YSL testing budget used: ≈ $26.34 · remaining: ≈ $23.66 of $50.** Rows 2, 12 and 21 are the unverified amounts and are carried at their upper estimates. The lane was parked on 2026-10-01 and re-opened the same day for the Genjutsu test (row 21); Genjutsu list prices per SOURCE second, rounded up: 480p $0.318 · 720p $0.681 · 1080p $1.632.

## OpenAI capacity: three different things (corrected 2026-09-26)

Earlier revisions of this file reconstructed a "remaining OpenAI balance" from the historical $30 top-up (rev 20) minus the estimated Astra spend and concluded ≈ $0 — and rev 35/36 handoffs declared Astra unavailable on that basis. That inference was wrong and is withdrawn. Fendi checked the OpenAI Platform Limits screen on 2026-09-26: **organization spend $29.52 of a $100.00 organization spend limit, reset in 6 days.** Three things are kept apart from here on:

1. **YSL project budget** — this file's table; the authoritative internal ceiling ($50 hard, CODE RED above it). Every YSL-related OpenAI/Astra call is a row here at its actual billed cost.
2. **OpenAI organization spend limit** — an account-level platform constraint ($29.52 / $100.00 at the last check). It is not the YSL budget and is not derived from this file.
3. **Actual API availability** — the OpenAI API is authoritative. Astra is treated as available unless an actual request returns a billing/quota/credit error; only then is the failure recorded here, and only if Astra is genuinely blocking further production does OpenAI capacity become a CODE RED.

The historical OpenAI spend above (scope 0 ≈ $24.00; rows 4, 5, 7, 9, 10, 14, 16) remains as provenance and is never used to infer present availability. Cost shape for planning: a three-level full Astra review has cost ≈ $8; a single-part review of ~30–45 frames $0.76–1.09.

## Rules applied

- Failed, unbilled provider calls ($0) are listed for provenance and never counted.
- Where a billed amount is unverified, the higher of the estimate and the computed figure is carried.
- Every future paid call appends a row here in the same commit as its result.

| 22 | 10-15 | xAI | Plate tests for c019 through `world-still-proxy`: `plate-v1` (2 stills, $0.14 reported `actualCostUsd`) + `plate-real-v2` (2 stills, $0.14) | $0.28 | — | — |
| 23 | 10-15 | Google (via CC) | Plate test for c019, `gemini-nano-banana-2.1`, job `80e33de0` | — | $0.270336 conditional estimate, invoice unknown | — |
| 24 | 10-15 | Runway (MCP connector account, not CC) | `remove_video_background` on the 4 s dressed clip, task `f1c58d20` | 4 credits (connector balance 6 → 2) | — | — |
