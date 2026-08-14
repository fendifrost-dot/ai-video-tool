# Grok 2026 Capability Re-Benchmark — Phase 0 + Phase 1 Preflight

**Research experiment:** `grok-recap-2026-08` **v1.0.0** (NEW — references Benchmark v2.0, does not modify it)
**Date:** 2026-08-12 · **Status:** Phase 0 complete, Phase 1 preflight complete · **Spend to date: $0.00**
**Gate:** Phases 2–4 BLOCKED pending Fendi's explicit spend approval.

This document does **not** change `docs/VIDEO_SWAP_ARCHITECTURE.md` (LOCKED), does not touch
Benchmark v2.0, does not merge PR #15, and does not abandon warp-worker research.

Evidence classes used throughout: **[V]** Verified · **[O]** Observed · **[H]** Hypothesis ·
**[D]** Decision · **[R]** Recommendation.

---

## 0. Bootstrap

| Check | Result |
|---|---|
| Origin | `https://github.com/fendifrost-dot/ai-video-tool.git` **[V]** |
| Clones in play | `/Users/gocrazyglobal/ai-video-tool` (`main` @ `97c2d8a`) and `/Users/gocrazyglobal/Projects/ai-video-tool` (`feat/video-preflight-compat-gate` @ `b3f9b4d`) — both sanctioned roots **[V]** |
| Archived / T7 clone | No. T7 used for benchmark media only **[V]** |
| T7 mounted | Yes, 931 GB, 545 GB free **[V]** |
| iCloud touched | No **[V]** |

---

# PHASE 0 — Current Capability Verification

## 0.1 What xAI documents today (provider claims — NOT AVT capability)

Source of record: `docs.x.ai` fetched 2026-08-12. Grok Imagine API GA announcement **2026-01-28** **[V]**.

| Capability | Endpoint | Model(s) | Limits | Class |
|---|---|---|---|---|
| Text-to-video | `POST /v1/videos/generations` | `grok-imagine-video`, `grok-imagine-video-1.5` | 1–15 s; up to **1080p** on 1.5 | Documented |
| Image-to-video (first frame locked) | `POST /v1/videos/generations` + `image` | same | 1–15 s; up to **1080p** on 1.5 | Documented |
| **Reference-to-video** | `POST /v1/videos/generations` + `reference_images` | `grok-imagine-video-1.5` | **≤3 reference images**; "specific people, objects, **clothing**"; **capped 720p**; ~10 s in examples | Documented |
| **Existing-video edit** | `POST /v1/videos/edits` | `grok-imagine-video` (1.5 support **not stated**) | input truncated at **8.7 s**; output **capped 720p**; output inherits input duration/AR | Documented |
| Video extension | `POST /v1/videos/extensions` | `grok-imagine-video` | continues from last frame | Documented |
| Multi-image image edit | `POST /v1/images/edits` | `grok-imagine-image-quality` | up to 3 source images | Documented **and Verified in AVT** (§0.3) |
| Poll | `GET /v1/videos/{request_id}` | — | `pending`/`done`/`expired`/`failed` | Documented |

**Input formats for video/reference inputs:** public HTTPS URL, base64 data URI, or Files API `file_id` **[V]**.

**Pricing (xAI docs, 2026-08-12) [V]:**

| Model | Price |
|---|---|
| `grok-imagine-video` | **$0.050 / second of output** |
| `grok-imagine-video-1.5` | **$0.080 / second of output** |
| `grok-imagine-image` | $0.02 / image |
| `grok-imagine-image-2.0` | $0.04 / image |
| `grok-imagine-image-quality` | $0.05 / image |

Rate limit `grok-imagine-video`: 10 req/s. Regions us-east-1 / us-west-2 / us-saltlake-2 **[V]**.

**Seed / determinism: NOT documented for any video endpoint. No `seed` parameter appears in any
video schema.** **[V]** — reproducibility for Phases 2–4 will have to rest on frozen inputs +
request IDs, not on seeds.

**Masks / regions: NOT documented for `/v1/videos/edits`.** The edit is prompt-only. **[V]**

### The single most important structural finding

`/v1/videos/edits` takes **`prompt` + `video_url` only**. It has **no `reference_images` field**
documented. **Reference-to-video** (which *does* take clothing references) is a **generation**
endpoint — it does not accept a source video.

> **[V]** As documented, current Grok exposes **either** "keep the real footage" (edit, prose-only
> garment) **or** "use the exact garment references" (reference-to-video, regenerates the scene) —
> **not both in one call.**

This is the crux of the Core Research Question, and it is visible before spending a cent.
Phase 2 exists to test whether the undocumented behaviour is better than the documented schema
(i.e. whether `/v1/videos/edits` silently accepts `reference_images`). That probe costs $0
(a schema rejection is not billed).

### Third-party route (Fal)

Grok Imagine is also published on Fal (`xai/grok-imagine-video/edit-video`,
`xai/grok-imagine-video/v1.5/image-to-video`, `xai/grok-imagine-image/edit`) **[V]**.
**The Fal edit route is strictly worse for us:** Fal documents input video *"truncated to 8 seconds"*
and *"resized to a maximum area of 854x480 pixels"* **[V]**. That resolution floor alone disqualifies
it for garment micro-detail (stripe width, logo legibility). Direct xAI is the only route worth testing.

## 0.2 What AVT can actually invoke today

| Path | Wiring | Class |
|---|---|---|
| xAI `/v1/images/edits` (multi-image garment edit) | **AVT-native edge fn** `grok-image-garment-proxy`, key `XAI_API_KEY` on AVT | **Verified callable** — the frozen Grok anchor `frame_00134` was produced by this exact function on 2026-08-01, artifact checksum re-verified today **[V]** |
| xAI `/v1/videos/generations` text-to-video | AVT `proxy-provider-call` → CC `video-providers-grok-generate` → xAI, key `Frost_Grok` on CC | **Wired, not reproduced this session** **[O]** |
| xAI `/v1/videos/generations` image-to-video | same; CC sends `image` when `mode==="image_to_video"` | **Wired, not reproduced this session** **[O]** |
| xAI `/v1/videos/generations` **reference-to-video** | **BROKEN END-TO-END** — see below | **NOT callable** **[V]** |
| xAI `/v1/videos/edits` | **Nothing exists.** Not in AVT, not in CC, not in the `proxy-provider-call` allowlist | **NOT callable** **[V]** |
| xAI `/v1/videos/extensions` | Nothing exists | **NOT callable** **[V]** |
| Grok Imagine via Fal | CC `switchx-restyle` `fal-run` ALLOWED set contains **no `xai/*` model** | **NOT callable** **[V]** |

### The reference-to-video break (new finding, contradicts our own docs)

`src/lib/providerJobs/api.ts` builds `mode: "reference_to_video"` and sends
`referenceImageUrls` (plural, up to `GROK_MAX_REFERENCE_IMAGES = 3`) when 2+ refs resolve.
Control Center's `video-providers-grok-generate/index.ts` **never reads `referenceImageUrls`** —
it reads only singular `parsed.referenceImageUrl`, and its xAI body is:

```ts
const xaiBody = { model, prompt, duration, aspect_ratio, resolution };
if (mode === "image_to_video" && parsed.referenceImageUrl) xaiBody.image = parsed.referenceImageUrl;
```

**[V]** Consequences:
1. Multi-reference requests are **silently degraded** to single-image-to-video (or text-to-video).
2. `reference_images` is never sent to xAI, so **AVT has never exercised clothing-reference conditioning on video**.
3. CC's `DEFAULT_MODEL` is `"grok-imagine-video"` — **not `-1.5`** — so unless the client overrides `modelVariant`, we are pinned to the older model. Duration is clamped 1–15 s.
4. AVT sends `seed`; xAI documents no video seed; CC drops it anyway.

**`docs/grok_api_status.md` line 33 claims reference-to-video is "yes (look + Character DNA refs)"
on the AVT client. That row is wrong at the transport layer and should be corrected [R].**

### Cost bookkeeping is also stale

CC hardcodes `GROK_CENTS_PER_GENERATION = 60` ($0.60 flat) **[V]**. Real xAI pricing is per-second
($0.05–$0.08/s), so a 5 s clip is $0.25–$0.40, and a 15 s clip is $0.75–$1.20. Every cost figure
AVT has surfaced from Grok video is wrong in both directions. **[R]** Fix at whatever point the
video lane is next touched — not part of this research run.

## 0.3 Capability classification summary

| Capability | Documented by provider | Verified callable by AVT |
|---|---|---|
| Existing-video edit | ✅ (prompt-only, 8.7 s, 720p) | ❌ nothing wired anywhere |
| Reference-to-video, ≤3 refs, clothing | ✅ (720p) | ❌ broken at CC transport |
| Image-to-video | ✅ (1080p on 1.5) | ⚠️ wired, unreproduced |
| Text-to-video | ✅ | ⚠️ wired, unreproduced |
| Video extension | ✅ | ❌ nothing wired |
| Multi-image **image** edit | ✅ | ✅ **verified by frozen artifact** |
| Seed / determinism | ❌ not documented | ❌ |
| Mask / region control on video edit | ❌ not documented | ❌ |
| Pose / ControlNet conditioning | ❌ (already established for images, `docs/grok_pose_conditioning.md`) | ❌ |

**[D]** Any Phase-2 test of video edit or reference-to-video requires **new code**. There is no
existing path to reuse.

---

## 0.4 Benchmark inputs — located, checksum-verified, and one naming correction

The handoff names "Benchmark v2.0", "Golden Frame Selection", frozen Grok/Kolors baselines and
flow/mask artifacts. All were located. **One correction: nothing in the repo is called
"wardrobe-swap-v2".** The canonical set is:

| Handoff term | Actual artifact | Status |
|---|---|---|
| Benchmark v2.0 canonical source | `avt_wardrobe_temporal` **v2.0.0** — `/Volumes/T7/AVT VIDEO CLIPS/benchmark_temporal_v2/` | **`Complete: False`** — see gaps below |
| Approved Golden Frame Selection | `benchmark_temporal_v2/golden_frozen_v2.0/` (Golden Frame Selection v1.0, frozen 2026-08-04) | ✅ **all 10 files `shasum -c` OK today** |
| Frozen Grok baseline | `benchmark_frozen_2026-08-01/grok_anchor_frame_00134.jpg` | ✅ checksum OK |
| Frozen Kolors baseline | `benchmark_frozen_2026-08-01/kolors_keyframe_00134.jpg` | ✅ checksum OK — **single frame only** |
| SL garment references | `character_features` row ("SL bomber") in Supabase `qoyxgnkvjukovkrvdaiq`; on-model refs consumed by `grok-image-garment-proxy` | ⚠️ **IDs + checksums not yet captured** |
| Flow / mask artifacts | `benchmark_temporal_v2/flow/` (fwd+bwd DIS flow, occlusion, confidence; 956 files w/ own SHA256SUMS) | ✅ present |
| Custom warp research prototype | PR **#15** `feat/warp-worker-prototype` — OPEN, research artifact, `workers/warp_worker/` | ✅ present, untouched |

**Golden frames = exactly the five Required Motion Cases** (this is a fortunate alignment — the
handoff's A–E map 1:1 onto the frozen set) **[V]**:

| Case | Frame | t (s) | Confidence | SHA-256 (16-bit canonical) |
|---|---|---|---|---|
| **A** frontal fidelity | `frame_00066.png` | 76.113 | Low (interchangeable w/ 69) | `40ce859f847fae23…c06f655a` |
| **B** torso rotation | `frame_00130.png` | 77.180 | High | `b0b62b7ebe03e192…fa2de4d7` |
| **C** max arm/hand occlusion | `frame_00238.png` | 78.982 | High | `7668cd1acd4777fe…7d786c75c` |
| **D** lighting/shadow transition | `frame_00209.png` | 78.498 | Medium | `ff2ade5d189b7baa…6ae897bb` |
| **E** max garment deformation | `frame_00202.png` | 78.382 | High | `d43dcd5afd6ac1a6…fbdb76c81` |

**Source clip for Test A (checksum-verified + re-probed today) [V]:**
`benchmark_frozen_2026-08-01/benchmark_1080p_clip.mp4`
· SHA-256 `509ef6f5c7780c5c8236532d1347cdad1e3cc45444acf5932f89540973a85e20`
· 3,325,641 bytes · **1080×1920 portrait, H.264 yuv420p, 59.94 fps, 241 frames, 4.0207 s**
· Cloud copy: `project-clips/832fa0bc…/764a63d2…/benchmark/resladder/IMG_5633_t75p0_d4p0_1080x1920_h264.mp4`, asset `76fe7438-671d-4428-a7f6-17a45e98c16f`

Ultimate origin: `/Volumes/T7/AVT VIDEO CLIPS/YSL VIDEO FILES/IMG_5633.mov` (HEVC Main10 / HLG BT.2020
+ Dolby Vision, 2,160×3,840 display, 1,975,591,193 bytes). Canonical 240-frame proxy SHA-256
`81559a2ce8109115f11ab9ce82be16ec53093d04dd388a2dea13c145cbcd8fde`.

### Benchmark v2.0 gaps that constrain what Phase 2 can conclude **[V]**

1. **`kolors_sequence` — PENDING.** There is **no per-frame Kolors sequence**. The "Frozen Kolors
   Baseline" is **one frame (00134)**, plus a 121-frame `warp_worker_out/stage_a_kolors/composite/`
   which is *warp-worker output derived from* Kolors, not a raw Kolors baseline.
2. **`sam_mask_sequence` — PENDING.** No per-frame SAM-3 region masks for the clip.
3. **Garment reference asset IDs/checksums not captured** — the SL bomber refs live in Supabase,
   not on T7. Capturable at $0 through the app before Phase 2.
4. The handoff says *"navy-stripe track jacket"*; the frozen record consistently says *"SL bomber"*.
   Treating these as the same garment; flagging in case they are not. **[O]**

**Consequence [D]:** Phases 2–4 can score current Grok against the **frozen single-frame** Grok and
Kolors baselines and against the golden-frame motion cases. They **cannot** produce a full
sequence-vs-sequence Kolors comparison, because that baseline does not exist. Any verdict must say so
rather than imply a comparison that was not run.

**Immutability caveat already recorded in the v2.0 manifest [V]:** T7 is FUSE/exFAT-class and does not
persist Unix permission bits, so `chmod 444` did not stick. The SHA256SUMS files are the real lock —
and they all verify today.

---

# PHASE 1 — Experiment & Cost Preflight

## 1.1 Engineering required before any test can run

**[D] Smallest isolated Research adapter: ONE new AVT edge function,
`grok-video-research-proxy`. Nothing else.**

Rationale: AVT already holds `XAI_API_KEY` as an edge secret and already calls `api.x.ai` directly
from `grok-image-garment-proxy` — verified working. The adapter clones that pattern for video.

| Property | Value |
|---|---|
| Repo path | `supabase/functions/grok-video-research-proxy/index.ts` (+ reuse `_shared/xaiApiKey.ts`) |
| Calls | `POST /v1/videos/edits`, `POST /v1/videos/generations`, `GET /v1/videos/{id}` |
| Modes | `edit_video` · `reference_to_video` · `image_to_video` — one function, one `mode` field |
| Inputs | signed Supabase URLs (already how `grok-image-garment-proxy` feeds xAI) |
| Outputs | download to `project-exports/research/grok-recap-2026-08/…`; persist request_id, model, params, prompt, cost, runtime |
| Wiring | **Research-only. Not referenced by any production path, no UI, no provider registry entry.** |
| Deploy | GitHub `main` → Lovable Edge Functions redeploy of **this one function only**. No SQL, no Publish, no CC change. |

Explicitly **NOT** built: generalized xAI provider infrastructure, a CC mirror, a Fal `xai/*`
allowlist entry, changes to `video-providers-grok-generate`, or any change to `proxy-provider-call`.

Estimated engineering: ~1 file, ~250 lines, 1 redeploy.

## 1.2 The tests

Every call uses the frozen inputs in §0.4. Ordered so the cheapest, highest-information probes run first.

### Step 0 — $0 schema probes (gate; run before any billed call)

| # | Probe | Cost | Answers |
|---|---|---|---|
| P1 | `/v1/videos/edits` with bad body | $0 (400 vs 401) | Is `XAI_API_KEY` live for video on AVT? |
| P2 | `/v1/videos/edits` + `reference_images` alongside `video_url` | **$0 if rejected** | **The crux: can garment refs and source video be combined at all?** |
| P3 | `/v1/videos/edits` with `model: grok-imagine-video-1.5` | $0 if rejected | Is the newer model available on edits? |

**If P2 is rejected, the Core Research Question is largely answered before we spend anything**, and
Fendi may want to stop there. **[R]**

### Test A — Existing-Video Edit (highest priority)

| Run | Input | Prompt strategy | Model | Dur | Est. cost |
|---|---|---|---|---|---|
| A1 | `benchmark_1080p_clip.mp4` (4.02 s) | prose SL-bomber description, explicit preserve-everything-else | `grok-imagine-video` | 4.02 s | $0.20 |
| A2 | same | terse garment-only edit instruction (minimal prose) | `grok-imagine-video` | 4.02 s | $0.20 |
| A3 | same | **only if P2 accepted** — same + garment `reference_images` | best available | 4.02 s | $0.20 |

Scores identity, face, body geometry, pose, performance motion, camera, background, lighting
continuity across golden cases A–E (all five fall inside this 4.02 s window — that is why this clip
was frozen). **If it substantially regenerates rather than modifies → MAJOR FAILURE recorded
regardless of how good it looks.**

### Test B — Reference-to-Video

| Run | References (≤3) | Model | Dur | Est. cost |
|---|---|---|---|---|
| B1 | source frame 00134 (person) + 2 SL bomber refs | `grok-imagine-video-1.5` | 5 s | $0.40 |
| B2 | frozen Grok anchor 00134 + 2 SL bomber refs | `grok-imagine-video-1.5` | 5 s | $0.40 |

Expectation **[H]**: identity/pose/camera will fail by construction (no source video is supplied);
the informative output is whether garment construction + stripe + logo hold through motion.

### Test C — Approved-Keyframe Propagation

| Run | First frame | Model | Dur | Est. cost |
|---|---|---|---|---|
| C1 | frozen Grok anchor `frame_00134` (garment-correct) | `grok-imagine-video-1.5` i2v | 5 s | $0.40 |
| C2 | golden frame **A** (`frame_00066`) garment-swapped still | `grok-imagine-video-1.5` i2v | 5 s | $0.40 |

Tests whether an approved garment-correct keyframe survives real motion without logo mutation,
stripe drift, garment morphing, hand/arm failure, shimmer or texture swimming.

### Budget table

| Line | Calls | Est. |
|---|---|---|
| Step 0 probes | 3 | **$0.00** |
| Test A | 2–3 | $0.40 – $0.60 |
| Test B | 2 | $0.80 |
| Test C | 2 | $0.80 |
| **Subtotal** | **6–7 billed** | **$2.00 – $2.20** |
| Retry allowance (max 1 retry/call, transient failures only) | ≤7 | ≤ $2.20 |
| **Total expected** | | **$2.00 – $4.40** |

> **[R] Proposed hard spend ceiling: $6.00 USD.** Stop and report at the ceiling even if incomplete.
> No auto-retry on content/policy rejection. Sequential execution, concurrency = 1 (xAI allows 10 req/s;
> we do not need it, and serial runs keep per-call attribution clean).

**Expected runtime:** ~1–5 min per clip (xAI default poll timeout 10 min). Total wall clock
including adapter deploy: **45–90 min**.

**Resolution reality check [V]:** every mode relevant to us caps at **720p** (edits and
reference-to-video both). Portrait 720p = 720×1280 against a 1080×1920 source and a 2160×3840 master.
Even a perfect result is a **downscale**, which independently caps stripe-width and logo-legibility
fidelity. This is a structural ceiling to weigh in the verdict, not a tuning problem.

## 1.3 Preliminary economics sketch (order of magnitude, **[H]** — not a Phase-4 result)

4-minute finished video = 240 s.

| Path | Per-pass provider cost | Notes |
|---|---|---|
| Grok edit `grok-imagine-video` @ $0.05/s | **~$12** | but 8.7 s cap → ~28 segments; segment seams unaddressed |
| Grok `-1.5` @ $0.08/s | **~$19** | 720p ceiling |
| With 3× retry/selection | **~$36 – $58** | realistic creative iteration |
| Per-frame Kolors @ ~$0.07/frame, 59.94 fps | **~$1,007** | 14,386 frames |
| Per-frame Kolors decimated to 24 fps | **~$403** | 5,760 frames |

**[H]** A viable Grok video path would be roughly **20–50× cheaper per pass** than per-frame Kolors.
That is large enough that it must not be allowed to bias the technical verdict — validity first,
cost second, exactly as the handoff instructs.

## 1.4 Reproducibility freeze (recorded now, before any run)

Frozen for `grok-recap-2026-08` v1.0.0: benchmark v2.0 reference + Golden Frame Selection v1.0;
source clip checksum `509ef6f5…973a85e20`; golden frame checksums (§0.4); frozen Grok/Kolors baseline
checksums (`cfd19f4d…23b48aa`, `25abbacb…f5fd7994`); provider `xai`; endpoints
`/v1/videos/{edits,generations,{id}}`; docs snapshot date 2026-08-12; pricing snapshot $0.050 /
$0.080 per second. Per-run capture will add: exact model string, full request body, prompt, request_id,
input/output resolution, runtime, billed cost, raw output URL, scorecard.
**Seeds are unavailable** — reruns will not be bit-reproducible, only parameter-reproducible. **[V]**

---

## 2. STOP — awaiting approval

Phases 2–4 not started. $0.00 spent. Nothing merged, nothing redeployed, Benchmark v2.0 untouched,
PR #15 untouched, LOCKED architecture untouched.

**Approval requested for exactly:** (a) create + redeploy the single research edge function
`grok-video-research-proxy`; (b) run Step 0 probes ($0) and Tests A/B/C under a **$6.00 hard ceiling**.
