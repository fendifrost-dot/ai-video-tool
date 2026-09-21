# Canonical Look propagation — capability check and design (2026-09-21)

**Author:** Claude · **Ruling:** ChatGPT 2026-09-21 §2 ("Investigate whether the current xAI video-edit contract can condition source video on an approved canonical Look-on-artist hero frame in addition to garment references. Verify capability before redesigning AVT around it. If unavailable, evaluate Architecture C temporal propagation as the mechanism for carrying canonical garment state across the real performance.") · **Spend:** $0 (documentary check only; the two experiments below are costed and NOT run).

## 1. What the provider contract actually offers (documentary, 2026-09-21)

| Endpoint | Documented inputs | Conditioning on a canonical Look-on-artist frame? | Notes |
|---|---|---|---|
| `POST /v1/videos/edits` (`grok-imagine-video`) | `model`, `prompt`, `video` (URL / data-URL / `file_id`, ≤ 8.7 s). `duration`, `aspect_ratio`, `resolution` "not supported for video editing"; output keeps the input's duration/aspect, capped at 720p. | **Not documented.** No `image`, `first_frame`, `keyframe`, `mask` or `strength` field. `reference_images` is **not in the public docs** for this endpoint either — yet AVT has been sending `reference_images: [{url}]` (`_shared/grokVideoEditRequest.ts`) since R4 and the outputs demonstrably follow them (flat ref → one narrow stripe, on-model ref → shirt/tie/trousers). So the field is accepted and used, but its semantics (subject vs garment vs style) are undocumented. | This is the lane the section was built on. |
| `POST /v1/videos/generations` (`grok-imagine-video-1.5`) | `prompt`, `image` (pinned first frame), `reference_images` ("guided by reference images"), `reference_audios`, `last_frame`, `duration` 1–15 s, aspect ratios, up to 1080p (720p with references). "image combined with reference_images … is reference-to-video with a pinned first frame." | **Yes for a GENERATED video** — but there is no `video` input, so the real performance is not preserved. Output is a synthesis from the first frame, not an edit of Fendi's footage. | Fails the product lane's first rule (real performance is the spine) exactly like the grok.com Build experiment did on 2026-09-04. |
| `POST /v1/videos/extensions` | `prompt`, `video`, `duration` | No | Continuation, not conditioning. |
| `POST /v1/images/edits` (`grok-imagine-image-2.0`) | `prompt`, `images[]` (≤ 5: URLs / data-URLs / `file_id`), `aspect_ratio` | **Yes for a STILL**: this is the API form of the grok.com `imagine_reference_to_image` step that produced the closest-to-zero-deviation construction seen in this project (2026-09-04, `GROK_BUILD_CONSUMER_EXPERIMENT`). Up to five images: a source performance frame + the approved Look hero + product/detail refs. | The hero-frame generator. |

**Conclusion.** The xAI video-edit contract does **not** offer first-frame or canonical-appearance conditioning of a source video. Two things remain possible on xAI: (a) an undocumented experiment — put the approved Look-on-artist hero frame FIRST in `/videos/edits` `reference_images` and see whether construction follows it better than product references do; (b) generate per-shot hero **stills** with `/images/edits` conditioned on one approved Look hero, and carry them across the real footage ourselves. (b) is exactly the locked Architecture C lane (`docs/VIDEO_SWAP_ARCHITECTURE.md` §3: approve hero keyframes → propagate → re-anchor on flow break → composite onto original → deterministic brand layer).

`_shared/providerCapabilities.ts` now records `firstFrameConditioning: null` for `xai:videos/edits` (unverified) — flip it to `true`/`false` from the experiment result via `PROVIDER_CAPABILITIES_JSON`, no deploy.

## 2. Two costed experiments (need Fendi's spend approval; not run)

| # | What | Cost | What it decides |
|---|---|---|---|
| E1 | `/videos/edits` on S08 and S12 (the two hook slots whose construction drifts most) with `reference_images = [approved hero frame from S06 v5, flat, detail×2]`, prompt v4c unchanged; compare cuffs/hem/collar/wordmark against the S06 hero at matched poses. | ≈ $1.10 (2 × 6.9 s) | Whether the video editor treats a Look-on-artist frame as appearance truth. If yes, cross-shot consistency can come from one approved hero per Look at zero architecture change. |
| E2 | `/images/edits` hero stills for S08 and S12: `images = [source frame @ slot mid, S06 hero crop, flat, detail collar, detail sleeve]`, prompt = the Look constraints + spec. | ≈ $0.15 per still (image-edit pricing; confirm on the console) | Whether the still editor holds construction across shots when conditioned on the same hero — the input the propagation lane needs. |

Both are single-digit dollars. Neither is worth running before Fendi rules on the section 5 escalations, because the answer only matters if the hook Look direction is approved.

## 3. Architecture C temporal propagation — what exists and what it needs

`supabase/functions/_shared/propagation.ts` is an **engine abstraction**, not an engine: it makes the propagation step env-selectable (`fal-flow` / `fal-v2v` / `nearest-keyframe` diagnostic) and blocks honestly when nothing real is configured. The repo's own finding (2026-07-28, `docs/LANE_C_LUCY_VIDEO_VTON.md` JOB 2): Fal hosts no dense-flow / warp / EbSynth-style propagation model; "the propagation worker must be CUSTOM (RAFT/GMFlow + warp, or EbSynth) OUTSIDE Fal." The edge runtime cannot run it.

Claude's sandbox is that "outside" worker. It already runs RobustVideoMatting on CPU for the environment composite; OpenCV's DIS dense optical flow is available today (RAFT via torchvision is a one-line install when quality demands it). So the lane can be built and evaluated at $0 on the existing v5 edits before any new generation is bought:

```
per shot:  hero keyframe(s)  ──►  garment mask on the hero (RVM person matte ∩ non-skin ∩ Look region)
                                    │
           original master frames ──►  dense flow  frame_k → frame_k±1 (DIS now, RAFT later)
                                    │
                             warp the hero garment forward/backward with flow chaining
                             confidence = forward–backward consistency; re-anchor when it collapses
                                    │
                             composite: original footage  ⊕  propagated garment (mask ∩ confidence)
                             deterministic brand layer on top (garment_graphic_track.py)
                                    │
                             temporal QA: garment-region SSIM between consecutive frames,
                             flow-warped residual, re-anchor count, % frames below confidence
```

The kill criterion is unchanged from `VIDEO_SWAP_ARCHITECTURE.md` §7: identity, exact construction, stripe/logo placement, natural occlusion, no flicker or morphing — on a 2–4 s test first.

**Where the hero comes from today, at $0:** the v5 xAI edits already contain usable hero frames (S06 was "excellent" in review #1; S03/S04 for the pre-hook Look). The first propagation test therefore needs no purchase: take one hero frame from the S06 edit, propagate its garment across the S06 master, and compare the result against the S06 edit itself frame by frame. If propagation holds construction where the edit drifts (Astra: `S08-HEM-CONSTRUCTION-DRIFT` is the same failure inside one shot), the lane has its evidence and E2 becomes the way to mint heroes for the other slots.

**What the lane will not solve on its own:** large rotations and self-occlusion (arm across chest) break flow — that is the re-anchor rule, and it is also exactly where the deterministic graphic layer needs its occlusion mask. Both share one tracking core (`scripts/edit/garment_track.py`).

## 4. Decision requested from ChatGPT (next review)

Confirm the order: (1) $0 propagation test on S06 as described; (2) E1 (≈ $1.10) only if (1) is inconclusive; (3) E2 heroes for the remaining slots only after the hook Look direction is approved by Fendi. Claude's position: build (1) now.
