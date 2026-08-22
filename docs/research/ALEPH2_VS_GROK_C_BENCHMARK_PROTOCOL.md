# AVT — Aleph 2.0 vs Grok C · Benchmark Protocol

**Status:** PRE-REGISTERED / PROVISIONAL — protocol frozen, **not yet run**.
**Protocol version:** `aleph2-vs-grok-c-v1.0.0`
**Date:** 2026-08-21 (inbound) · verification pass 2026-08-22
**Class:** **A** (this file is documentation). **Executing** the matrix, promoting a winner, or wiring any engine is **Class C** (benchmarks + providers + rendering) and is **out of scope for this PR**.
**Companion:** inbound `AVT_MCP_CAPABILITY_SWEEP.md` — **not present in this checkout** (searched `main` @ `36e955a`). This protocol stands alone until that file lands.
**Governing spec:** [`docs/REPRODUCIBLE_BENCHMARK_SYSTEM.md`](../REPRODUCIBLE_BENCHMARK_SYSTEM.md) v1.0.
**Locked architecture:** [`docs/VIDEO_SWAP_ARCHITECTURE.md`](../VIDEO_SWAP_ARCHITECTURE.md) — **untouched**. This document does not reopen or supersede it.

**This is a benchmark, not a build.** No production wiring. No architecture decision until scores exist. Outputs are evidence, not production truth.

Evidence classes used throughout: **[V]** Verified · **[O]** Observed · **[H]** Hypothesis · **[D]** Decision · **[R]** Recommendation.

---

## LINEAGE

```
benchmark version:      aleph2-vs-grok-c-v1.0.0   (PROTOCOL — no scores yet)
derived-from:           inbound brief 2026-08-21 + wardrobe-swap-v1 + grok-recap-2026-08
algorithm version:      13-axis 0–3 rubric (§4), pre-registered before any render
source SHA-256:         benchmark_1080p_clip  509ef6f5c7780c5c8236532d1347cdad1e3cc45444acf5932f89540973a85e20
                        (cited from docs/research/GROK_RECAP_2026-08_PHASE0_PHASE1.md §0.4; T7 bytes not re-hashed this session)
per-item SHA-256:       none — no outputs exist
created date:           2026-08-22
purpose:                answer whether Aleph 2 reads garment truth from a keyframe while holding identity+motion from the source video
```

Until a human approves a scored round and a Frozen Provenance Package is assembled, this benchmark is **PROVISIONAL**. The **protocol** (arms, rubric, decision rules) is frozen as of this version. Changing arms, rubric, or decision rules **after the first paid run** invalidates the round.

---

## 0. Bootstrap (this session)

| Check | Result | Class |
|---|---|---|
| Repository | `github.com/fendifrost-dot/ai-video-tool` | **[V]** `git remote` |
| Branch / tip | protocol registered from `main` @ `36e955a` (PR #20 merged) | **[V]** |
| Deployment / DB | Lovable-managed; project ref `qoyxgnkvjukovkrvdaiq` | **[V]** `.deployment/manifest.yml` |
| Compatibility-gate trigger | **Stopping point reached.** PR #19 merged 2026-08-18 (`b964c67`) | **[V]** |
| PR #17 (identity) | Still DRAFT / PARKED. Remains release-critical and **above** this protocol | **[V]** `gh pr list` |
| `AVT_MCP_CAPABILITY_SWEEP.md` | **Absent** from this checkout | **[V]** repo search |
| Runway / Replicate credential | **None in this repo.** `RUNWAY_API_KEY` appears only as the CC "not configured" banner. No `RUNWAYML_API_SECRET`, no Replicate token | **[V]** |
| T7 media | **Not mounted** in this cloud workspace. Fixture claims below are from committed manifests + grok-recap, not a re-probe of bytes | **[O]** |
| Paid runs this session | **$0.00. None.** | **[V]** |

---

# 0. Verification pass on the inbound claims

## 0.1 The `gen4_aleph` line stands — correction not accepted

Inbound claim: the July 30th, 2026 Runway API changelog retires **two** identifiers in one sentence — `gen3a_turbo` and `gen4_aleph`.

**[V]** Releasebot's curated quote of that changelog entry (fetched 2026-08-22):

> "July 30th, 2026 - Gen-3 Alpha Turbo (`gen3a_turbo`) and Gen-4 Aleph (`gen4_aleph`) are no longer available via the Runway API. Requests that use these model identifiers will fail. Upgrade from Gen-3 Alpha Turbo to Gen-4.5 (best quality) or Gen-4 Turbo (fastest), and from Gen-4 Aleph to Aleph 2.0 (`aleph2`)."

Source: https://releasebot.io/updates/runwayai (aggregator of the official Runway API changelog). The live `docs.dev.runwayml.com/api-details/api_changelog/` page is JS-rendered and returned nav-only through fetch — same limitation the inbound brief reported.

Related, **[O]** from secondary reports + official SDK history, **[V]** from `runwayml/sdk-python` CHANGELOG:

- Aleph 2.0 **product** launch: May 21, 2026 (runwayml.com/news/introducing-aleph-2-and-edit-studio).
- Aleph 2.0 **API** identifier `aleph2`: SDK 4.16.0 dated **2026-06-02** (`Aleph2` commit `b36110b`). Matches the inbound "June 2nd, 2026" API introduction.
- `aleph2_alpha` as a deprecated alias was **not independently retrieved** this session. **[H]** — confirm on first schema contact.

**[D]** The sweep line stands. Reading either half of the July 30 sentence alone is a half-true answer.

## 0.2 Roster — models exist; endpoint binding is now schema-verified, still live-unverified

Inbound correction adopted: a catalog "video to video" column is **not** an endpoint binding. Rule unchanged: **no pre-registered paid arm against a model we have not confirmed is callable at the exact path we intend to call.**

This session **tightened** that statement using the official Stainless-generated SDK types, which are generated from Runway's OpenAPI spec:

**File:** `https://raw.githubusercontent.com/runwayml/sdk-python/main/src/runwayml/types/video_to_video_create_params.py` (fetched 2026-08-22)

`VideoToVideoCreateParams` is a **union**. Same `POST /v1/video_to_video` client method, **different required fields per model**:

| Model | In the VTV union? | Required video field | Keyframes / refs | `seed` in this variant? |
|---|---|---|---|---|
| `aleph2` | **yes** (`Variant0`) | `videoUri` | `keyframes` ≤ 5 | **yes** (`int`) |
| `hailuo3` | **yes** | `promptVideo` + `promptText` | `references` ≤ 9 images; video/audio refs | **no** |
| `seedance2` | **yes** | `promptVideo` | `references` ≤ 9 | **no** |
| `seedance2_fast` / `seedance2_mini` | **yes** | `promptVideo` | same family | **no** |
| `gemini_omni_flash` | **yes** | `videoUri` + `promptText` | `references` images | **no** |
| `seedance2_5` | **yes** | `promptVideo` | `references` ≤ 30 images; `mode` `reference` \| `extend` | **no** |
| `gen4_aleph` | **absent** from this file | — | — | — |

**[V]** Schema-level: `hailuo3` and `seedance2_5` **are** bound to `/v1/video_to_video` in the current official SDK types. The inbound "not established" clause is **narrowed**: it is no longer "maybe a different endpoint"; it is "schema-bound, live-POST unconfirmed."

**[V]** They are **not** a `model` string swap. `aleph2` takes `videoUri` + `keyframes` + `seed`. `hailuo3` / `seedance2_5` take `promptVideo` and have **no keyframe list**. Treating them as drop-in Aleph substitutes would be the same over-read the inbound brief already walked back.

**[V]** Official Runway agent skills (`runwayml/skills` `rw-api-reference` + `rw-integrate-video`, fetched 2026-08-22) are **stale**: they still list `gen4_aleph` as the VTV model and do not mention `aleph2`, `hailuo3`, or `seedance2_5`. Do not use those skills as the current contract.

Changelog corroboration (Releasebot quotes of the official API changelog) **[O]**:

- Aug 5, 2026 — "MiniMax H3 (`hailuo3`) is now available… text-to-video, image-to-video, and video-to-video… durations from **5–15 seconds**."
- Aug 7, 2026 — "`seedance2_5` is now available… durations from **4–30 seconds**."
- Aug 15, 2026 — `seedance2_5` adds 1080p (`1080:1920` is in the SDK ratio enum).

**[D]** Arms 5 (`seedance2`) and 6 (`gemini_omni_flash`) are schema-bound and may be designed against the typed request shape. Arms 7 (`hailuo3` / `seedance2_5`) stay **conditional** until the §7 live POST. A 400 that names the unsupported model, or a queued task that is cancelled immediately, is the definitive answer.

**[H]** `hailuo3`'s documented 5–15 s duration band may **reject our 4 s clip**. Name the test: §7 live POST with the 4 s fixture. If rejected, either skip the arm or recut — **do not silently pad**. Recutting would force a Grok re-run on the new window (§2).

## 0.3 Seed — inbound caveat is now schema-falsified on native Runway

Inbound claim: seed is "provider-dependent, and not confirmed on Runway's own endpoint."

**Correction, this session [V]:** the official `aleph2` VTV variant **does** expose `seed`:

```
seed: int
"""If unspecified, a random number is chosen.
Varying the seed integer is a way to get different results for the same other
request parameters. Using the same seed integer for an identical request will
produce similar results."""
```

Cite: `video_to_video_create_params.py` `Variant0.seed` (OpenAPI → Stainless → SDK). This is **schema evidence**, not a live repeated-seed test. The docstring says "**similar** results," not bit-identical — axis 13 still has to prove the seed is doing what we think.

Other doors, unchanged:

| Door | Seed? | Class | Use for this benchmark? |
|---|---|---|---|
| Runway native `/v1/video_to_video` `aleph2` | **yes** (schema) | **[V]** SDK types | **Primary.** |
| Replicate `runwayml/aleph-2` | **yes** — "Optional seed for reproducible results." | **[V]** replicate.com/runwayml/aleph-2/readme | Backup / instrument only. |
| Runware `runway:aleph@2.0` | **no** — `model` / `inputs` / `positivePrompt` / `numberResults` (+ optional `frameImages`) | **[V]** runware.ai Aleph 2.0 editing guide | Not used. |
| OpenRouter `runway/aleph-2` | optional `seed`; "determinism is not guaranteed for every provider" | **[V]** openrouter.ai/runway/aleph-2 | Not used (wrong tool; router-shaped). |

**[D] Access path, decided before the first run:** provision `RUNWAYML_API_SECRET` and call Runway native. Replicate is **not** required to obtain seed. If a repeated native seed fails axis 13, **then** Replicate may be used as an experimental instrument — never a production path.

Why this still matters: the stated reason to prefer Aleph over Grok on epistemics is that seed lets us separate architectural capability from sampling variance (R4b vanishing improvement, R7 band regression — those run labels are **inbound**, not re-derived this session). A seed that does not reproduce is n=1 again.

## 0.4 Hard constraints that shape the test

| Constraint | Value | Source | Class | Consequence |
|---|---|---|---|---|
| Input duration (Aleph) | 2–30 s | Replicate readme + Runware guide + SDK | **[V]** | 4 s clip fits |
| Input resolution | up to 1080p | Runware + secondary API reports | **[O]** | Matches the existing 1080p preflight ceiling |
| Max file size (data-URI / Replicate) | 16 MB | Replicate readme; SDK `videoUri` "up to 16MB" for data URI | **[V]** | Use `benchmark_1080p_clip.mp4` (~3.3 MB). The 15.8 MB 4K proxy is under 16 MB but **over 1080p** — do not send it |
| Keyframes | max 5 | SDK `Variant0.keyframes` + Replicate + Runware | **[V]** | Caps arm 3 |
| Keyframe positioning (native) | `seconds` (absolute) **or** `at` (0–1 fraction); optional `range` | SDK `Variant0Keyframe*` | **[V]** | Place the Grok anchor at **2.235 s** |
| Keyframe positioning (Replicate) | `first` / `last` / timestamp; parallel `keyframe_images` + `keyframe_positions` | Replicate readme | **[V]** | Only if we fall back |
| Keyframe positioning (Runware) | `frameImages[].frame` or `timestamp` (0.01 precision) | Runware guide | **[V]** | Not used |
| Price (Aleph via OpenRouter listing) | **$0.28 / second** | openrouter.ai/provider/runway (2026-08-22) | **[V]** listing | 4 s ≈ **$1.12 / generation** |
| Native credit price | not retrieved this session | — | — | Price native credits before tranche 1 if we are not paying OpenRouter |

**Cost reality [D]:** full matrix with n=2 ≈ **$15–25**. Tranche 1 only (§6). Do not commit the matrix up front.

The 1080p / 16 MB envelope matches the preflight ceiling derived from Fal's 4K failures (long edge 1920, H.264, yuv420p, 8-bit). **No new preflight work.**

## 0.5 Prerequisite gap — the actual blocker

**[V]** No Runway API key appears in this repo. Control Center is documented as holding the Fal key; AVT's Runway generate path already has a fail-clean `PROVIDER_KEY_NOT_CONFIGURED` / `RUNWAY_API_KEY not set` banner (`docs/control_center_provider_proxy.md`, `src/lib/providerJobs/api.test.ts`).

**[D]** Provisioning `RUNWAYML_API_SECRET` (Runway developer portal) is the gating item, not the protocol. Do **not** put that secret in AVT production secrets for this benchmark. Hold it as a local / research credential. Do **not** ask for keys in chat.

This protocol **does not run** until that credential exists **and** §7 live checks are recorded.

---

# 1. The question this benchmark actually answers

Not "is Aleph better than Grok." The question that decides whether the warp worker gets built:

> **Does Aleph 2 take garment truth from a keyframe while taking identity and motion from the source video?**

Everything else is secondary because of an asymmetry already claimed on `frame_00134`:

| Axis | Inbound Grok anchor result | Class in this checkout |
|---|---|---|
| Garment construction | cream body, navy stand collar, chest stripe, full zip, ribbed cuffs, legible SAINT LAURENT logo | **[O]** inbound; frozen file cited in grok-recap as `grok_anchor_frame_00134.jpg` (checksum re-verified 2026-08-12, **not** re-hashed here) |
| Identity | different person; added sunglasses | **[O]** inbound — **not independently re-scored this session** |
| Pose / motion | re-posed upright; occlusion discarded | **[O]** inbound — same |

**[D]** Treat the contamination as the measurement. Do not clean the keyframe first.

- **If Aleph inherits identity from the keyframe** → keyframes must be identity-preserving → the anchor+warp worker stays on the roadmap. Aleph is a propagation engine, not a replacement.
- **If Aleph reads only garment/appearance from the keyframe and holds identity+motion from the source video** → the warp worker is *unnecessary* and Architecture C's justification weakens. That is the outcome that would most change the project.

Arms 2 / 3 **deliberately** feed the known-identity-broken keyframe.

---

# 2. Frozen fixture

One clip, one garment, one difficult occlusion. No substitutions mid-run.

| Item | Value | Class |
|---|---|---|
| Source clip (preferred) | `benchmark_frozen_2026-08-01/benchmark_1080p_clip.mp4` · SHA-256 `509ef6f5c7780c5c8236532d1347cdad1e3cc45444acf5932f89540973a85e20` · 3,325,641 bytes · **1080×1920** portrait, H.264 yuv420p, 59.94 fps, 241 frames, 4.0207 s | **[V]** grok-recap §0.4 (2026-08-12 re-probe). **Not** re-probed this session |
| Cloud copy | `project-clips/832fa0bc…/764a63d2…/benchmark/resladder/IMG_5633_t75p0_d4p0_1080x1920_h264.mp4` · asset `76fe7438-671d-4428-a7f6-17a45e98c16f` | **[V]** grok-recap + `docs/research/run_grok_recap.sh` |
| 4K proxy (do **not** send to Aleph) | wardrobe-swap-v1 `IMG_5633_t75p0_d4p0_h264.mp4` · 2160×3840 · 15,792,250 bytes · 240 frames · 4.004 s | **[V]** `docs/benchmark/wardrobe-swap-v1/manifest.json` |
| Fallback 720p | inbound `bench_720p.mp4` · asset `bd039cda-bf2c-4ee5-9840-6b23671936bc` | **[H]** — that asset id is **not** in this checkout. Confirm before using |
| Garment | SL bomber, `wardrobeFeatureId` `0feb028f-dc4d-45dc-82ac-e4bbd16054b0` | **[V]** multiple docs + `run_grok_recap.sh` |
| Artist | `8d4a4d22-41c0-43ab-ba99-92750f81e335` | **[V]** look path below |
| Hard-occlusion frame | `frame_00134` | see §2.1 |
| Existing Grok anchor | look `1347d0fc-71cc-4b18-92b8-91b100c26b28` · storage `…/8d4a4d22-…/1347d0fc-….jpg` · local T7 `benchmark_frozen_2026-08-01/grok_anchor_frame_00134.jpg` | **[V]** grok-recap + `run_grok_recap.sh` |

Inbound names `bench_1080p.mp4`. The frozen record calls it `benchmark_1080p_clip.mp4`. **[D]** Same bytes — use the checksum, not the nickname.

### 2.1 Open decision, resolved: the 4 s clip **does** contain `frame_00134`

**[V]** `docs/benchmark/wardrobe-swap-v1/manifest.json`:

| Field | Value |
|---|---|
| Window | source 75.0 → 79.0 s, 240 frames |
| `frame_00134.png` | `index` 134 · `sourceTimestamp` **77.246667** · `offsetFromStart` **2.235** |

No recut. No Grok re-run on a different window. Occlusion scoring is on the **same** moment as the Grok baseline.

Golden-frame alignment (from grok-recap; useful for arm 3 placement, **not** substitutions):

| Case | Frame | t (s) | offset ≈ | Notes |
|---|---|---|---|---|
| A frontal | `frame_00066` | 76.113 | 1.10 | clean-pose candidate |
| B torso rotation | `frame_00130` | 77.180 | 2.17 | 4 frames before 134 |
| **occlusion (this protocol)** | **`frame_00134`** | **77.247** | **2.235** | Grok anchor lives here |
| E deformation | `frame_00202` | 78.382 | 3.37 | |
| C max arm/hand occlusion | `frame_00238` | 78.982 | 3.97 | golden "max occlusion" ≠ 134 |

**[D]** Axis 7 (occlusion recovery) is scored at **frame 134 / t=2.235 s**, because that is where the contaminated Grok keyframe is. Do not silently move the score to golden-C (`frame_00238`).

---

# 3. Arms — cheapest-signal-first

**[V]** Product Swap is a first-party Recipe, not the "Reshoot Product" app.

Official SDK `recipe_product_swap_params.py` (fetched 2026-08-22) — `POST /v1/recipes/product_swap` via `client.recipes.product_swap`:

| Field | Required | Notes |
|---|---|---|
| `newProductImages` | yes | 1–10 images of the **new** product; optional `view` `front` \| `side` \| `back` |
| `originalProductImage` | yes | image of the product being swapped **out** |
| `referenceVideo` | yes | 1.8–15 s, data-URI up to 16 MB |
| `version` | yes | pin **`2026-06`** (not `unsafe-latest`) |
| `audio` | no | |
| `duration` | no | **4–15, default 10** — must set **`4`** or the output will not match the 4 s source |
| `resolution` | no | `720p` \| `1080p`, default **720p** — set **`1080p`** |
| `seed` | **absent** | axis 13 for this arm is n=2 same-settings only |

**[D]** Do not confuse with `app.runwayml.com?app=product-reshoot` (images only, app-only, replaces background/lighting). Different product, same words.

**[O]** Runway's Recipe copy says "Swap a product in a reference video." "Product" in their framing is placed/held objects. Worn clothing that deforms with the body may be outside the intended domain. That is why this arm goes first: cheapest test of a purpose-built primitive. A clean failure is as informative as a success.

| # | Arm | Engine | Conditioning | Tranche |
|---|---|---|---|---|
| **0** | **control** | Grok C, current best config | Existing best edit configuration, **unchanged**. No new prompt ladder. | scored from existing artifacts if they already exist; do not re-spend to "refresh" |
| **1** | **Product Swap** | `POST /v1/recipes/product_swap` | Source video + `originalProductImage` (current camo/shirt still) + `newProductImages` (SL bomber refs from `0feb028f…`) · `version=2026-06` · `duration=4` · `resolution=1080p` | **1** |
| **2** | **Aleph +1 kf** | `aleph2` `POST /v1/video_to_video` | Source + **the identity-broken Grok anchor** at **`seconds: 2.235`** + frozen prompt §3.1 | **1** |
| **3** | **Aleph +3–5 kf** | `aleph2` | Source + 3–5 keyframes at clean pose / occlusion / recovery. **Blocked on additional identity-broken Grok stills we do not have.** See §3.2 | **2** |
| **4** | Aleph prompt-only | `aleph2` | Source + same prompt, **no** keyframes. Attribution baseline for 2/3 | **2**, only if 2 or 3 show signal |
| **5** | Seedance 2 | `seedance2` | `promptVideo` + `promptText` + image `references` (SL bomber). **No keyframe list** | **2** |
| **6** | Gemini Omni Flash | `gemini_omni_flash` | `videoUri` + `promptText` + up to 5 image refs | **2** |
| **7** | *conditional* | `hailuo3` / `seedance2_5` | Only after §7 live POST. Different request shape; `hailuo3` may reject 4 s | **2**, gated |

Inbound arm-2 wording said "1 approved garment-correct keyframe on a **clean-pose** frame." That conflicts with §1 (feed the contaminated occlusion keyframe).

**[D]** Arm 2 places look `1347d0fc` at **t = 2.235 s** (frame 134). We do **not** move it to a clean-pose first/last frame. The hinge measurement is "does Aleph pick up the broken identity from this still?" Putting a clean-pose still in would answer a different question.

### 3.1 Frozen prompt (arms 2–4) — locked before any render

Derived from `docs/research/run_grok_recap.sh` `EDIT_PROMPT_LONG` and the construction language in `GROK_GARMENT_TRUTH_PROMPT`. Held **constant** across arms 2–4. Only the keyframe set varies.

```
Replace only the clothing he is wearing with the Saint Laurent cream bomber shown in the keyframe: cream body, navy stand collar, navy chest stripe, full front zip, ribbed cuffs, SAINT LAURENT chest logo. Change NOTHING else: keep his exact face, beard, his own glasses, skin tone, hair, body proportions, hands and arms, the exact same pose and movement, the exact same camera framing and motion, the exact same background, and the exact same lighting and shadows. Do not regenerate the person. Do not restyle the scene. Do not add sunglasses. Do not re-pose. Do not invent lapels.
```

Arm 4 uses this prompt with **no** keyframes (the "shown in the keyframe" clause then refers to the garment description alone — do not rewrite the sentence after seeing outputs).

Arm 1 does **not** use this prompt. It uses the Recipe image fields.

Arm 0 does **not** use this prompt. It uses the existing Grok best config as-is.

### 3.2 Arm 3 cannot run from the current frozen set

We have **one** garment-correct, identity-broken Grok still (`frame_00134`). Arm 3 wants 3–5 keyframes. Generating more Grok stills would **unfreeze Grok prompting** and spend outside this protocol.

**[D]** Arm 3 stays in tranche 2 and additionally requires either (a) already-existing identity-broken Grok stills at clean-pose and recovery frames, checksummed into this protocol as a v1.1 **before** that arm is paid, or (b) an explicit human decision to reuse the single still at multiple timestamps (likely invalid — record as such if chosen). Do not improvise mid-run.

---

# 4. Scoring — pre-registered before looking at any output

Score every arm on all 13 axes, **0–3** (0 = fails, 1 = partial, 2 = good, 3 = indistinguishable from ground truth). Fill the rubric from these definitions **before** the first render is viewed. Empty scorecard: [`ALEPH2_VS_GROK_C_SCORECARD.md`](ALEPH2_VS_GROK_C_SCORECARD.md).

| # | Axis | 0 (fails) | 3 (ground truth) |
|---|---|---|---|
| 1 | Identity | Different person; added/removed features (sunglasses failure) | Same face, beard, glasses, head as source |
| 2 | Original motion | Re-posed, re-timed, or motion discarded | Source motion held, including the bend and arm-cross |
| 3 | Collar geometry | Lapels instead of stand collar | Navy stand collar, construction held |
| 4 | Chest-band geometry | Band width/placement wrong or discontinuous | Continuous navy chest stripe, correct placement |
| 5 | Sleeve panels | Panel topology lost | Sleeve construction held through motion |
| 6 | Open-jacket construction | Layering/interior wrong | Closure/interior match the SL bomber (closed, as the Grok garment-truth prompt requires) |
| 7 | Occlusion recovery | Construction breaks where the arm crosses the chest **at t≈2.235 s / frame 134** | Construction survives the arm-cross |
| 8 | Temporal consistency | Flicker, boundary pops, garment identity drifting | Stable garment across the 4 s |
| 9 | Typography | SAINT LAURENT illegible or misplaced | Legible, placed |
| 10 | Scene preservation | Unrelated-pixel regeneration; background changed | Background/lighting held |
| 11 | Resolution | Output below input, or soft | ≥ 1080×1920, not softened past the source |
| 12 | Timing / truncation | Output duration ≠ input; clipped ending | Duration matches ~4.02 s |
| 13 | Reproducibility | Second run disagrees, or repeated seed does not reproduce | n=2 agrees; repeated seed (Aleph) agrees |

Ground-truth reference: wardrobe-swap-v1 16-bit PNG sequence (T7) for identity/motion/scene; SL bomber refs for garment/typography; Grok anchor **only** as the *contaminated keyframe input*, never as identity ground truth.

### Axis 13 is not optional and is not scored from a single run

- **n=2 minimum on every paid arm.** Same settings, second execution.
- On the best Aleph arm, if seed is accepted (schema says yes): **two different seeds** + **one repeated seed**. A repeated seed that does not reproduce means the seed is not doing what we think, and every downstream conclusion is n=1 again.
- An arm that wins on run 1 and loses on run 2 is **unresolved**, not a win.
- Product Swap has no seed: n=2 same-settings is the whole axis-13 test for arm 1.

---

# 5. Pre-registered decision rules

Written now so the result cannot be rationalized later.

1. **Arm 2/3 preserve source identity while adopting keyframe garment truth** → the anchor+warp worker is *not* required. Escalate Aleph 2 to primary **candidate** (still not production-wired) and re-open Verdict C as a **discussion**, not a merge. **This is the outcome that would most change the project.**
2. **Arm 2/3 inherit the keyframe's broken identity** → keyframes must be identity-preserving. The warp worker stays on the roadmap. Aleph is a propagation engine, not a replacement for the locked architecture.
3. **Arm 4 ≥ arm 2/3** → keyframes add nothing; Aleph is a prompt-driven editor and the anchor strategy is orthogonal to it.
4. **Arm 3 beats arm 2 only on occlusion recovery (axis 7)** → dense anchoring is an *escalation* technique, not a default.
5. **Any scored arm fails axis 13** → no verdict recorded from this round, full stop. Do not promote an n=1 result.
6. **Arm 1 succeeds on identity + garment + motion** → record it; it still does not authorize production wiring. It does authorize a Class-C design review of whether a Recipe belongs in the research lane.
7. **Tranche 1 (arms 1 and 2) both reproduce the Grok failure modes** (garment topology breaks, identity drifts, occlusion unrecovered) → **stop**. Do not buy tranche 2. Verdict: Runway is a different flavour of the same failure.

Inbound rule numbers used B1/B2/B3 for prompt-only / +1 kf / +3–5 kf. This version maps **B1 → arm 4**, **B2 → arm 2**, **B3 → arm 3**.

---

# 6. Spend gate — tranche before matrix

**Do not commit the $15–25 matrix up front.**

**Tranche 1 — ~$3–5.** Arm 1 (Product Swap) + arm 2 (Aleph + 1 kf), each n=2.

| Line | Est. |
|---|---|
| Aleph 4 s × 2 @ $0.28/s | $2.24 |
| Product Swap × 2 | **unknown — price before running** |
| Buffer | to ~$5 |

Price Product Swap from the live `GET /v1/organization` credit balance + a dry schema read, or the first task's `estimatedCost` (SDK 5.14.0 exposes `estimatedCost` on retrieve). Do not guess.

This buys the two answers that gate everything:

1. Does Runway already have a purpose-built primitive that does this? (arm 1)
2. Does Aleph inherit the contaminated keyframe's identity, or read only garment truth from it? (arm 2)

**Stop and reassess after tranche 1.** Rule 7 applies.

**Tranche 2** only if tranche 1 shows signal worth attributing.

**[R]** Hard ceiling for tranche 1: **$6.00**. Stop and report at the ceiling even if incomplete.

---

# 7. Live capability verification (do this before any spend)

Cheap, and it settles remaining schema/live gaps. **Not run this session — no credential.**

Record all three results in this protocol (amend as a dated §7.2 block) before the first paid run. A §7 amendment is a **schema/live check**, not a change to arms/rubric/decision rules, and does not invalidate the round.

1. Provision the credential (§7.1). Then:
   - `POST /v1/video_to_video` with `model: "hailuo3"` and a **deliberately invalid** tiny payload (or the 4 s clip if we accept a possible queue). A schema-validation rejection naming the unsupported model, **or** a queued task that is **cancelled immediately**, is definitive.
   - Same for `model: "seedance2_5"`.
2. Confirm `POST /v1/recipes/product_swap` accepts the §3 field set (a 400 naming a missing/extra field is the answer; do not let a valid job run).
3. Confirm `seed` is accepted on native `aleph2` (400 vs queued). This is a schema/live read, not an experiment. **[V]** schema already says yes; this step is the live confirmation.

### 7.1 Access path

| Door | Status | Use? |
|---|---|---|
| **Direct `RUNWAYML_API_SECRET`** | Assumed by this protocol. Full model + endpoint control. Seed on `aleph2`. Recipes. | **Yes — the door we knock on.** |
| Runway official Claude agent skills (`runwayml/recipe-full-setup`, `rw-check-compatibility`, `integrate-video`, …) | Assist setup; still require **your** key. Current skills are **stale** on VTV models (§0.2) | Setup only |
| **`runwayml/runway-api-mcp-server`** | Exposes `runway_editVideo(videoUri, referenceImages, promptText)` with **no `model` parameter** | **Ruled out.** Cannot pin `aleph2`, cannot reach Product Swap |
| **Runway Media Router `/v1/routers`** | **[V]** SDK 5.11.0+ (2026-07-21) added Model Router CRUD + routed video. Releasebot quotes the official July 23, 2026 changelog: live, `configId`, cost/quality/latency scoring, third parties including Seedance / GPT Image 2 / ElevenLabs | **Wrong tool for this benchmark** (it picks the model). Interesting as a production discovery signal later — not in scope |

Correction to the original sweep, worth flagging: a first-party generative-media router **does** exist. One secondary outlet called it "planned"; the official SDK + changelog treat it as live. **[V]** SDK / **[O]** announcement vs secondary discrepancy. Verify on first contact; do not use it here.

### 7.2 Live results (empty — fill before tranche 1)

| Check | HTTP / task | Result | Date | Class |
|---|---|---|---|---|
| `hailuo3` on `/v1/video_to_video` | — | **not run** | — | — |
| `seedance2_5` on `/v1/video_to_video` | — | **not run** | — | — |
| `product_swap` schema accept/reject | — | **not run** (schema read from SDK only) | 2026-08-22 | schema **[V]** / live — |
| `aleph2` `seed` accepted | — | **not run** (schema says yes) | 2026-08-22 | schema **[V]** / live — |
| Product Swap unit price | — | **unknown** | — | — |

---

# 8. Sequencing and boundaries

- Runs **after** the compatibility-gate stopping point. **[V]** PR #19 is merged. Identity / PR #17 remains release-critical and **above** this.
- This does **not** unfreeze Grok prompting. Arm 0 uses the existing best config as-is.
- **No production integration.** Not for Aleph, not for Product Swap, not for the Router. Not an AVT edge function. Not a CC allowlist change. Not a provider-registry change. The production path — AVT → Control Center → fal — is untouched.
- Outputs are **evidence, not production truth**, until imported through the benchmark/evidence process ([`docs/REPRODUCIBLE_BENCHMARK_SYSTEM.md`](../REPRODUCIBLE_BENCHMARK_SYSTEM.md)). Same rule as Grok Build.
- Protocol is **frozen** as of `aleph2-vs-grok-c-v1.0.0`. Changes to arms, rubric, or decision rules after the first paid run invalidate the round. Pre-run corrections in this file (seed on native; schema-bound VTV union; frame 134 containment; Product Swap field set) are part of v1.0.0 because **no paid run has happened**.

### What this PR does **not** do

- Does not add a Runway client, Recipe caller, or research proxy.
- Does not modify `src/lib/providers/runway.ts` (today: text/image-to-video via CC; **no** `video_to_video` capability).
- Does not touch PR #15 (`feat/warp-worker-prototype`).
- Does not certify a winner, freeze scores, or write `SHA256SUMS` for outputs.

---

# 9. Reproducible-benchmark checklist (this protocol)

```
[x] Full candidate set of ARMS loaded and counted (no silent truncation) — 8 arms, 2 conditional
[x] Scoring METHOD documented per criterion (§4)
[ ] Every candidate scored — NOT YET RUN
[ ] Winner+runner-up+margin — NOT YET RUN
[ ] Confidence from margin — NOT YET RUN
[x] Labeled review artifact template produced (scorecard)
[ ] STOPPED for human approval of SCORES — N/A until runs exist
[ ] Frozen Provenance Package for OUTPUTS — N/A
[x] LINEAGE block filled (protocol)
[ ] Representation note — add if we score proxies rather than T7 16-bit frames
[ ] Full score table + review artifact preserved — empty template only
[ ] Items chmod 444 + SHA256SUMS — N/A (no outputs)
[x] Every claim in this protocol labeled
[x] Benchmark labeled PROVISIONAL (protocol frozen; scores absent)
```

---

## Sources (retrieved 2026-08-22 unless noted)

- Runway API changelog via Releasebot (Jul 30 `gen4_aleph`+`gen3a_turbo`; Aug 5 `hailuo3`; Aug 7/15 `seedance2_5`; Jul 23 Model Router) · https://releasebot.io/updates/runwayai · official page JS-nav-only: https://docs.dev.runwayml.com/api-details/api_changelog/
- Runway official SDK types (VTV union + Product Swap params) · https://github.com/runwayml/sdk-python · `video_to_video_create_params.py`, `recipe_product_swap_params.py`, `CHANGELOG.md`
- Runway official agent skills (stale on VTV roster) · https://github.com/runwayml/skills
- Replicate Runway Aleph 2 · https://replicate.com/runwayml/aleph-2/readme
- Runware Runway Aleph 2.0 editing guide · https://runware.ai/docs/models/runway-aleph-2-0/guides/editing-video
- OpenRouter Aleph 2 listing $0.28/s · https://openrouter.ai/provider/runway
- Aleph 2.0 product announcement (May 21, 2026) · https://runwayml.com/news/introducing-aleph-2-and-edit-studio
- In-repo fixtures · `docs/benchmark/wardrobe-swap-v1/manifest.json` · `docs/research/GROK_RECAP_2026-08_PHASE0_PHASE1.md` · `docs/research/run_grok_recap.sh`
- Compatibility gate · PR #19 · `docs/VIDEO_SWAP_ARCHITECTURE.md` §9
