# Cursor Handoff — Pivot to Hero-Frame Full-Look Transfer + Temporal Propagation

**Date:** 2026-06-21
**To:** Cursor — execute. Claude tests/verifies each phase gate.
**From:** Fendi + Claude, synthesizing ChatGPT + Grok strategy reviews.
**Why now:** The jacket-only IDM-VTON still approach produces a garment that reads as a **knockoff** — stripe too thick/misplaced, sleeve panels too wide, collar wrong, proportions off. This is a **garment-construction-fidelity** failure that logo polish cannot fix. We are pivoting. (See attached IMG_5540 = bad VTON output, IMG_5541 = real SL product reference.)

---

## Evaluation of the two reviews (for context)
Both ChatGPT and Grok agree on the core and they're right: **stop per-frame independent VTON + post-hoc logo repair; move to approved hero-frame → propagation, with full-look transfer, deterministic brand layer, identity lock, and temporal QA.**

- **ChatGPT** = the stronger *structure* (pipeline, test matrix A–E, pass/fail, priority order, phases). Take its architecture wholesale.
- **Grok** = the better *pragmatics*. Adopt its three refinements: **(1) hybrid** — full-look for the hero frame, fall back to jacket-only VTON + deterministic overlays where full-look hurts identity or imports unwanted styling (pants/shoes/pose); **(2) human approval gate** on the hero frame (interactive selection/approval in AVT); **(3) propagation ranking** — reference-conditioned video-to-video first, optical-flow + ControlNet/IP-Adapter second, per-keyframe VTON last.

**Claude's added engineering judgment (the part both reviews under-weight):**
- **Hard gate: prove ONE believable hero still before building ANY video pipeline.** Do not let the video propagation work start until a hero frame reads as the real jacket with identity intact. Most of the risk and cost is downstream; don't pay it on an unproven base.
- **Temporal propagation is frontier/research, not a guaranteed win.** v2v that holds *both* identity and exact garment is unreliable today (we already proved Kling v2v destroys identity). Treat Phase 2 as an experiment with a kill criterion, and seriously evaluate **image-to-video from the approved hero** (regenerates motion but sidesteps identity drift) as a parallel option.
- **The existing deterministic brand work is REUSED, not discarded** — the placement engine + perspective-warp composite + high-res asset + anti-aliasing all become the **tracked brand-detail layer** on top of the new, correctly-shaped base.

---

## Locked principles
1. **Hero frame first, approved, then propagate.** Hard human-approval gate.
2. **Full-look transfer** (use the on-model SL reference for correct geometry) — hybrid fallback to jacket-only + overlays per Grok.
3. **Deterministic brand truth** for logo / stripes / zipper / collar — real pixels, tracked, never trusted to diffusion.
4. **Identity is immutable** (face, skin, glasses, beard, build). Garment changes; Fendi does not. Use AVT's existing faceswap/identity step.
5. **Prove still before video.** No video pipeline until a hero frame passes.
6. Use the **best tool for each stage** (fal/Replicate/Runway/Kling, etc.) — not locked to the current toolchain.

---

## Pipeline
```
source video → extract frames → select HERO frame
   → FULL-LOOK transfer onto hero (fallback: jacket-only VTON)   [Phase 1]
   → IDENTITY LOCK (faceswap back to Fendi)                       [Phase 1]
   → HUMAN APPROVE hero look (garment fidelity + identity)        [Phase 1 GATE]
   → optional hero-frame BRAND CORRECTION on the still           [Phase 3a]
   → TEMPORAL propagation through the clip                         [Phase 2]
   → tracked PER-FRAME BRAND CORRECTION (logo/stripe/zipper/collar) [Phase 3b]
   → temporal QA + human review                                   [Phase 4]
   → FFmpeg reassembly (preserve audio/timing)                    [Phase 4]
```
**Note (per ChatGPT):** brand correction happens TWICE — (3a) optionally on the approved hero still, then (3b) tracked per-frame AFTER propagation. Don't conflate them.

---

## Build order for Cursor (each phase is a Claude-verified gate)

### Phase 1 — HERO FRAME (build + validate first; everything gates on this)
Build the capability to produce candidate hero frames and approve one.
- Integrate a **full-look / reference-conditioned transfer** for the hero frame. Candidates to wire & A/B (fal/Replicate): full-body VTON (IDM-VTON full outfit, OOTDiffusion, CatVTON), or **IP-Adapter / reference-image diffusion** conditioned on the SL on-model image (IMG_5541) + Fendi's frame + pose/depth control. Goal: correct collar, stripe height/width, sleeve-stripe angle, drape.
- **Identity lock:** run AVT's existing faceswap/identity step after transfer; verify Fendi stays recognizable.
- **Hero-frame UI in AVT:** select source frame, generate 3–5 candidates, view side-by-side vs the product photo, approve one.
- **GATE (Claude tests):** approved hero reads as the *real* SL jacket — correct stripe width + placement, collar, sleeve panels, drape — with Fendi's identity intact. **Do not proceed to Phase 2 until this passes.**

### Phase 2 — SHORT-CLIP PROPAGATION (only after Phase 1 passes)
- Propagate the approved hero look over a **2–4s** clip first. Evaluate, in priority order: (1) reference-conditioned **video-to-video** (Runway/Kling with hero + identity reference), (2) **optical-flow + ControlNet/IP-Adapter** propagation, (3) per-keyframe VTON + temporal smoothing (last resort). Also test **image-to-video from the hero** as a parallel path.
- **Core rule:** never regenerate the garment from scratch per frame; propagate the approved look.
- **Kill criterion:** if no method holds identity + garment over 2–4s without obvious flicker/morph, stop and report rather than scaling up.

### Phase 3 — DETERMINISTIC BRAND LAYER (tracked)
- Reuse the existing placement engine + perspective-warp composite. Extend to **multi-detail** (logo + chest stripe + sleeve stripes + zipper + collar). Track each region across frames (same propagation/optical-flow) and composite the real assets per frame.
- Decide per region: generated vs tracked-deterministic — luxury details lean deterministic.

### Phase 4 — TEMPORAL QA + WORKFLOW
- Automated frame-to-frame **drift metrics**: logo position/scale, stripe width/angle, collar height, zipper line, garment mask boundary, face identity, hand/arm occlusion, fabric flicker. Reject clips that swim/mutate.
- Hero-frame selector + approval UI, frame extraction/reassembly (FFmpeg, preserve audio/timing), rerender controls.

---

## DISCARD
- Jacket-only IDM-VTON as the primary garment method.
- Per-frame independent VTON for video.
- Any further **logo-in-isolation** optimization (the still-logo iteration is stopped).

## REUSE (do not rebuild)
- The deterministic brand composite + Product Detail Placement Engine + perspective warp + high-res asset + anti-aliasing → becomes the **tracked brand-detail layer** (Phase 3).
- AVT's existing **faceswap/identity** step → Phase 1 identity lock.
- The AVT catalog/`product_details` schema and the manual-quad UI → placement metadata for the brand layer.

## Priority order (when trade-offs collide)
1. Full garment geometry  2. **Identity preservation**  3. Temporal consistency  4. Natural motion/occlusion  5. Brand-detail accuracy  6. Logo sharpness.
(Per ChatGPT review — identity moved ABOVE temporal consistency: a perfectly stable clip where Fendi no longer looks like himself is still a failed clip. Identity is a pass/fail gate, not a tunable.)

## Success criteria (final clip)
Fendi recognizable; original motion preserved; outfit stable (no morph/flicker/drift); jacket reads as the *real* SL jacket; stripe width + sleeve angle + collar consistent; logo no flicker/swim/scale-change; zipper stable; hands/arms occlude naturally; feels like real footage with a costume change.

## Answers to the reviews' 10 questions (condensed)
1. **First tool:** reference/full-body transfer (IP-Adapter or full-body VTON via fal/Replicate) for the hero frame; image-to-video or reference-v2v for propagation. 2. **Full-look vs jacket-only:** full-look for geometry, hybrid fallback. 3. **Identity:** AVT faceswap + identity reference, tested with lock on. 4. **Propagation ranking:** ref-v2v > optical-flow+ControlNet > per-keyframe. 5. **Brand regions:** track + deterministically composite. 6. **Occlusion:** person/hand segmentation; drop the overlay where >~60% occluded. 7. **Brand overlays:** yes, required. 8. **QA:** automated frame-diff drift metrics + human gate. 9. **Cursor first:** Phase 1 (hero-frame transfer + identity lock + approval UI). 10. **Discard:** per-frame VTON main path + logo-in-isolation.

## Constraint
Prove the hero frame before the video. Do not build the full video pipeline first. Claude verifies each phase gate before the next begins.
