# AVT Wardrobe-Swap — Full Build & Issues Handoff (for Grok / ChatGPT review)

**Date:** 2026-06-30
**Author:** Claude (with Fendi)
**Audience:** External strategy review (Grok, ChatGPT). This document is self-contained — it assumes no prior context — and asks for a recommended path on the ONE unresolved problem stated in Section 8.

---

## 1. The goal (what we're building)

Fendi is a musician making a performance music video. We want to take **real footage of him performing** and **swap his outfit for a designer Saint Laurent "Track Jacket"** (cream/off-white body, navy shoulder stripe, "Saint Laurent" chest script), while keeping three things absolutely intact:

1. **His identity** — face and eyeglasses must remain **pixel-identical to the real footage**. This is a pass/fail gate, not a "close enough." The glasses are thin wire-frame; the face is bearded; both must be his true pixels, not an AI re-render or faceswap.
2. **His original motion / pose** — for a performance clip, the body has to move exactly as shot. If original motion can't be preserved, the fallback is tool-driven motion using generated hero shots as B-roll only.
3. **The scene** — his room, grey cap, and (in the source) orange trousers, hands, framing.

**Only the jacket should change. Everything else is his real footage.**

### Critical clarification on "quality" (this corrects an earlier misframing)
The goal is **NOT native 4K output from the swap step.** The goal is **quality parity**: the swapped jacket should look like it belongs in the same frame as his face and background — no sharp-face-on-soft-jacket (or vice-versa) mismatch. The accepted workflow is:

- Work the whole composite at a **common HD resolution** so face, jacket, and background all match and blend.
- Then run a **separate final enhancement/upscale pass** on the finished video (Runway ML, Grok video-enhance, Topaz, etc.) to bring the entire thing up to 4K **together**.
- Principle: **minimize the number of "touches" to the real face/background.** Fewer transformations = better preservation and a simpler pipeline.

So "the jacket is only 720p" is **not** a blocker by itself — as long as the whole frame is unified at a working resolution and enhanced at the end. What IS a blocker is anything that alters his face, glasses, pose, or scene.

### Sequencing
We are proving **ONE believable hero still first** as a hard gate before building any video/motion pipeline. Most cost and risk is downstream; we don't pay it until a single still passes.

---

## 2. The system / build (AVT = "AI Video Tool")

**AVT** is a custom web app (built on Lovable Cloud / managed Supabase; project ref `qoyxgnkvjukovkrvdaiq`, live at aivideotool.lovable.app). Relevant surface:

- **Hero Frame Studio:** upload a source video → scrub the timeline → **capture a hero frame** → **generate candidate wardrobe swaps** → **Compare & Approve** view.
- **Product catalog:** holds the Saint Laurent garment reference(s) used to drive the swap (on-model SL product images).
- **Capture:** `captureFrame` grabs the selected frame at the video's **native resolution** (verified — not downscaled at capture time).

### The swap "lanes" (candidate generators), with MEASURED native output resolutions
All four were run and their true output sizes measured from the actual image outputs (not upscaled figures):

| Lane | Native output | Behavior |
|---|---|---|
| **Grok Image-Edit · Garment-Truth** (xAI `/v1/images/edits`, `grok-imagine-image-quality`, multi-reference) | **720×1280** | Best *jacket* fidelity. But re-renders the WHOLE frame — reinvents pose and can restyle the outfit. Does not preserve identity. Stochastic. |
| **Grok · + Identity** (Grok garment → neural faceswap) | 720×1280 | Restyled the outfit, changed pose/framing; face is a neural swap. Excluded. |
| **IDM-VTON** | 768×1024 | PRESERVES his real pose/scene/cap/orange-pants. Weakness: softens/warps the face (~768px), and introduced a vertical crop **translation** offset (not an angle change). |
| **CatVTON** (full-look) | 768×1024 | Full-look garment transfer. |

**Key measured fact: NO lane outputs natively 4K.** The jacket is fundamentally an HD-scale render in every lane. (Per Section 1, that's acceptable if unified + enhanced at the end.)

### Identity restore (deterministic, non-AI)
Separately from the lanes, we have a **deterministic face/glasses restore**: take his **real captured pixels** and composite them back over the swapped image through an **ellipse-masked periocular/full-face region** (perspective warp + feathered alpha + color-match). Because it copies real pixels, it can produce a **pixel-identical** face/glasses — but ONLY if the base image holds his pose/angle, so the real face can seat correctly without warping.

---

## 3. Source footage

- `IMG_5508.mov` — iPhone **4K portrait, 2160×3840**, HEVC, ~1.67 GB master.
- Hero moment: Fendi in his room, **grey cap, thin wire-frame glasses, 3/4-turned to his right, chin up, mouth open**, wearing a cream varsity/letterman jacket in the source (the garment we're REPLACING with the SL Track Jacket). Orange trousers, rings on hands.

---

## 4. Environment constraints (unusual — these shape everything)

1. **The browser environment running AVT CANNOT decode 4K video — at all.** Proven: a `<video>` element hangs at `readyState 0` with no error for 4K H.264 AND 4K VP9 (so it's a 4K-decode limit, not a codec problem). Consequence: you **cannot** load a 4K clip and scrub/capture natively in-app. Workaround used: extract the exact frame with ffmpeg and inject the real pixels into AVT's capture path.
2. **The browser CAN decode HD.** A 1080×1920 H.264 clip loads and the **native in-app scrub→capture works** — no ffmpeg hack needed.
3. **HEVC doesn't decode** in this Chrome (`canPlayType('hvc1')` returns empty). Clips must be H.264.
4. **Supabase Pico (Free) tier hard-caps global storage upload at 50 MB.** The 1.67 GB 4K master cannot be ingested without a paid backend upgrade. A short clip under 50 MB is fine for a single hero frame. (Per-bucket limits were raised to 4 GB and resumable TUS added, but the 50 MB **global** cap overrides them on Free.)

---

## 5. Everything we tried, in order (with the specific failure each time)

1. **Original ingestion degraded the 4K to a ~406px proxy.** The captured face came out heavily pixelated while the AI-generated clothing looked cleaner — a jarring quality mismatch. Root cause: ingestion downscaling + the 50 MB cap + a low-res proxy path. (This is what first surfaced the "why is 4K footage being degraded" problem.)

2. **Trimmed a short 4K clip to dodge the 50 MB cap — but it was HEVC** and wouldn't decode in-browser. Re-encoded to **H.264**. Then discovered constraint #1: the browser can't decode **any** 4K video, so in-app capture was still impossible.

3. **Workaround: ffmpeg-extracted the exact hero frame at native 2160×3840** and injected it into AVT's capture. This produced a genuine sharp 4K frame with **pixel-perfect face/glasses** — but that frame is the *source*, not a swap.

4. **Measured all four lanes' resolutions** (table in §2). Confirmed none are 4K; the jacket is HD in every lane.

5. **REGRESSION — wrong base.** We composited his real face onto the **IDM-VTON** candidate. IDM had shifted his head ~191 px (a crop/translation), so the restore forced a large realignment, which **distorted the neck and a hand**, on top of a **soft 768px jacket**. Net result read as: *wrong jacket, distorted face, distorted neck, distorted hand, not sharp.* A clear regression. Root cause: **wrong candidate chosen as the base** — IDM's softness + forced realignment.

6. **Corrected strategy → HD working source.** Downscaled the 4K master **once**, cleanly (Lanczos, exact 0.5) to **1080×1920 H.264**, and uploaded THAT as the working source, so face + background + jacket all live at one resolution and blend, with the 4K enhancement deferred to a final pass. Bonus: 1080p decodes in-browser, so the **native in-app capture now works** (dropped the ffmpeg hack). Verified the stored capture is 1080×1920.

7. **LATEST RUN — Grok drift.** On the HD base, ran **Grok garment-truth**. It got the **jacket right** but:
   - **Changed his pose/head ANGLE:** source is 3/4-turned, chin up, mouth open; Grok re-rendered him **more front-facing, head level, mouth closed.** This is an orientation change, not a translation.
   - **Restyled the whole outfit:** added a **blue striped shirt and a striped tie**, put him in **dark dress trousers**, and **dropped the orange pants**.
   - Output **720×1280** (lower than the 1080p input; any 1080p version is an upscale).
   - We **stopped and did NOT composite**, because seating his real chin-up 3/4 face onto Grok's level frontal head would require exactly the forced warp/realignment that caused the neck/hand distortion in step 5.

---

## 6. What works vs. what breaks (distilled)

- **Grok garment-truth** → best JACKET, but **reinvents pose + restyles the outfit + doesn't preserve identity**, and it's **stochastic** (drifts run-to-run). Unreliable as a base for identity-preservation.
- **IDM-VTON** → **preserves the exact pose/scene** (cap, orange pants, 3/4 chin-up); weakness is a **soft face** and a **translation** offset (both more tractable than an angle change).
- **Deterministic real-pixel face restore** → can deliver **pixel-identical** face/glasses, but **only if the base holds his pose/angle** so the real face seats without warping.
- **The clean, native 4K source frame** is the only image where face+glasses are perfect — because it *is* the real frame (no swap on it).

---

## 7. The core unresolved problem

**No available lane does the ideal operation:** keep the **entire real frame** — his face, glasses, pose, hands, background, orange pants — and **change ONLY the jacket pixels**. Grok re-renders the whole person (pose + styling drift). IDM-VTON preserves the person but softens the face and only outputs 768px. We need a **reliable, pose-preserving, jacket-only swap** at a working HD resolution, on top of which the deterministic real-pixel face/glasses restore can seat cleanly.

---

## 8. The question for Grok / ChatGPT

Given the goal (Section 1), the build/lanes (Section 2), the hard environment constraints (Section 4), and the failure history (Section 5): **what is the most reliable path to a jacket-only swap that preserves his exact face, glasses, pose, and scene by construction — changing only the jacket — at a unified HD working resolution, with 4K enhancement deferred to a final pass?**

Specifically, please weigh in on:

1. **Garment-only inpainting / masked diffusion:** segment the jacket region (e.g., SAM/SAM-3 mask of the jacket only) and inpaint the SL Track Jacket into just that region, leaving all other pixels untouched. Is this the cleanest route? What model/stack (fal/Replicate/ComfyUI, specific inpaint or VTON-inpaint models) would hold garment fidelity to the real SL product while respecting a tight mask and not leaking into face/hands/background?
2. **IDM-VTON as the pose-preserving base + deterministic real-pixel face restore:** given IDM preserves pose and its offset is a clean translation (not an angle change), is "accept IDM's jacket (soft, 768px) + correct the translation offset precisely + restore real face/glasses + unify at HD + enhance at the end" a more dependable path than chasing a better generator? What's the correct way to compute/apply the translation alignment so the face seats without the neck/hand distortion we hit?
3. **Reference-conditioning for garment fidelity:** best way to force the inpainted jacket to match the *real* SL product geometry (stripe width/placement, collar, sleeve panels, chest script) rather than a diffusion approximation — IP-Adapter / reference image, ControlNet (pose/depth/edge), or deterministic overlay of real garment detail pixels?
4. **Reliability vs. stochasticity:** how to make the swap deterministic/repeatable enough that pose and identity survive every run (not just lucky rolls)?
5. **Handoff to motion (later, not now):** once a still passes, the most robust way to carry the approved look across the clip while holding identity + garment (reference-conditioned video-to-video, image-to-video from the approved hero, optical-flow + ControlNet propagation, or per-keyframe with temporal smoothing) — with an explicit kill criterion.

**Constraints to respect in any proposal:** face + glasses must end up as his real pixels (deterministic restore, not neural faceswap); do not force a large realignment/warp of the face; work at a unified HD resolution and defer 4K to a final enhancement pass; the browser can't decode 4K (HD in-app capture only); the Free-tier backend caps uploads at 50 MB (short clips only) until a paid upgrade.

---

## 9. Current status

All generation is **paused** pending this review. We have: a verified clean **1080×1920 HD working clip** and a **pixel-perfect native-4K source hero frame** in hand; four measured candidate lanes; and a working in-app HD capture path. Nothing will be regenerated until we pick a direction from this review.
