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

## 5. Result of step (1): the $0 propagation test on S06 (2026-09-21, after the ruling)

`scripts/edit/propagate_keyframe.py` (new) on `S06_master` (720×1280 @ 24, 161 frames) with the hero garment taken from the v5 S06 edit at frame 72 (garment region = what the edit changed, found automatically). DIS dense flow chained frame to frame, forward–backward error accumulated as a drift estimate and gated into confidence, occluders detected on the real footage (master now vs master at the hero, warped), hero garment re-lit from the master's own low-frequency luminance, composite = edit frame with the hero garment wherever propagation is trustworthy. Nothing invented.

| Measure | One hero (f72) | Seven heroes every 24 frames | xAI edit (reference) |
|---|---|---|---|
| Garment carried from the hero, within ±10 frames | 78 % (occluded 4 %) | — | — |
| Reach at ≥ 80 % coverage | 6 frames back / 3 forward | 2–4 per hero | — |
| Coverage, whole shot | 20 % (one hero cannot cover 6.7 s of dance) | 64 % | — |
| Flow-compensated temporal residual in the garment (flicker; lower is better) | 8.66 mean / 15.3 p95 | 8.37 mean / 18.8 p95 | 9.62 mean / 17.0 p95 (single run) · 11.14 mean / 18.4 p95 (multi-hero run's masks) |
| Generator drift (edit garment vs the carried hero garment, same frame, 0–255) | 18.9 within ±10 frames; 35.8 whole shot | 22.3 | — |

What this establishes:

1. **The mechanism works where the flow holds**: within ±8 frames the propagated frames read as one garment (same lettering, same construction) and flicker is 10–25 % lower than the edit. See `S06_propagation_qa_sheet.jpg` and the half-speed clip sent to Fendi.
2. **The limiter is the motion, not the flow engine.** Fendi moves ~5 px/frame median in this shot. DIS chained, DIS direct and RAFT-small direct (torchvision, CPU, half resolution) all lose forward–backward consistency at the same rate (≈ 78 % of the garment within 2 px at 3 frames, ≈ 55 % at 12, ≈ 10 % at 24). So the **re-anchor cadence on dance footage is ≈ 12–16 frames**, inside the range `VIDEO_SWAP_ARCHITECTURE.md` §3 predicted (12–24).
3. **Cost of the lane per shot**: a 6.9 s slot needs ≈ 10–14 heroes. With E2 (`/images/edits`, ≈ $0.15 per still, each conditioned on ONE approved hero so construction is shared) that is ≈ $1.5–2.1 per shot — about the same as one xAI video edit ($0.55) × 3, but with one garment realisation instead of one per cut.
4. **Multi-hero from the edit itself is not the answer** (the seven heroes above are seven different xAI samples, so switch points show construction jumps — p95 residual rises). The heroes must come from the still lane conditioned on one approved hero, or from that hero warped forward as the reference for the next.
5. **Occlusion** is handled honestly: the arm crossing S06 at frames 90+ is detected on the real footage and the edit is used there; nothing is painted over the arm.

Kill criterion (§7): identity — real face pixels throughout (pass by construction); exact construction and stripe/logo placement — inherited from the hero where carried (pass within reach); natural occlusion — pass (detected, not painted over); no flicker/morphing — better than the edit within reach, not yet over a whole 6.9 s shot with one hero. **Verdict: the lane is viable at a 12–16-frame re-anchor cadence; it is not viable with one hero per shot.** Next: E2 heroes (needs Fendi's spend approval, ≈ $2 for one shot) → full-shot propagation → the deterministic brand layer on top → assemble → then a targeted Astra shot review is justified (ruling §10).
