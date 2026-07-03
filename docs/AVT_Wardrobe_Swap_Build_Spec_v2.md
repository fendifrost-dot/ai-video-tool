# AVT Wardrobe-Swap Build Spec v2 — Jacket-Only Masked Transfer + Deterministic Restore

**Date:** 2026-06-30
**Status:** AUTHORITATIVE — single source of truth. Merges the independent Grok + ChatGPT reviews (which converged) with Fendi's prior locked principles (SAM-3 masking, deterministic pixel transfer, "never regenerate the garment," SwitchX propagation). This supersedes earlier AVT handoffs for the wardrobe-swap approach.
**For:** Cursor / AVT implementation.

---

## 0. The one-sentence reframe

**Current lanes reconstruct garments rather than transferring product truth. The remaining work is to progressively replace generative reconstruction with deterministic garment transfer, reserving diffusion only for fabric integration and cleanup.**

Diffusion is demoted from *wardrobe engine* to *cleanup engine* (hide seams only). The jacket comes from masked, reference-conditioned transfer — not a full-frame redraw.

---

## 1. Goal (unchanged)

Prove **ONE believable hero still** first: the Saint Laurent Track Jacket swapped onto real footage while Fendi's **face, glasses, pose, grey cap, hands, orange pants, and background remain his real captured pixels.** Work at a unified HD resolution; defer 4K to a final enhancement pass. Repeatable (fixed seed).

**Do NOT build the video/motion pipeline until the still passes.**

---

## 2. Product Truth Hierarchy (non-negotiable)

- **Tier 1 — logo, hardware, zipper pulls, text/script, embroidery:** NEVER generated. Paste real pixels from the SL reference.
- **Tier 2 — seams, stripe geometry, panels, collar/sleeve/pocket construction:** Prefer deterministic transfer; diffusion only for minor cleanup.
- **Tier 3 — wrinkles, folds, drape, lighting, shadows, cloth tension:** Diffusion acceptable.
- **Acceptance criterion — GARMENT TOPOLOGY > logo:** every seam, panel, stripe, collar break, cuff, hem, pocket must sit in the correct place and proportion. You can paste a logo; you cannot paste construction. Topology fidelity is the gate; the logo can be overlaid deterministically afterward.

---

## 3. Hard rules (from both reviews + Fendi)

- **Only jacket pixels change.** Face, glasses, cap, hands, pants, background stay real.
- **No full-frame redraw.**
- **No neural faceswap** — identity comes from a deterministic real-pixel composite only.
- **No logo generation** — Tier 1 is pasted.
- **Fixed seed** for repeatability.
- **IDM-VTON remains the fallback** engine (pose-preserving).
- **Unified HD working resolution**; 4K is a separate final pass.

---

## 4. Primary lane — Jacket-Only Masked Inpainting (build this first)

### Input
- Clean **1080×1920 H.264 hero frame** (native AVT in-app capture — HD decodes fine).
- **2–4 high-res SL Track Jacket references** (cream/off-white body, navy shoulder stripe, "Saint Laurent" chest script; on-model + flat-lay for geometry). Store in the AVT product catalog with geometry-priority metadata.

### Pipeline
1. **Tight jacket mask (SAM-3 / GroundingDINO)**
   - Prompt: "cream/off-white track jacket, upper torso clothing, sleeves" — EXCLUDE face, neck, hands, grey cap, orange pants, rings, background.
   - Output: binary mask + feathered alpha (8–16 px feather).

2. **Inpaint the SL jacket into the masked region ONLY**
   - Engine: `fal-ai/flux-general/inpainting` (native IP-Adapter + ControlNet) — or a ComfyUI Flux/SDXL inpaint workflow.
   - Conditioning:
     - **IP-Adapter** (+ FaceID variant if useful) with the SL references, scale **0.8–1.0**, multiple refs for geometry/script.
     - **ControlNet:** OpenPose (exact body/pose lock from source) + Depth (or Canny/Edge) for structure preservation.
   - Prompt: "Saint Laurent Track Jacket, cream off-white body, navy shoulder stripe, precise 'Saint Laurent' chest script, matching collar, sleeve panels, fabric drape and lighting on the body, high garment fidelity."
   - Negative: "face, glasses, hands, cap, orange pants, background, deformation, extra clothing, wrong pose."
   - Params: **strength 0.75–0.9**, guidance **4–7**, steps **25–35**, **fixed seed**.
   - Output: 1080×1920 composite with jacket swapped; everything else untouched.

3. **Deterministic real-pixel face/glasses restore** (existing AVT capability)
   - Ellipse-masked periocular + full-face region from the original source pixels.
   - Minimal perspective warp (should be near-zero with a tight-mask inpaint that doesn't move the head) + feathered alpha + color/lighting match.
   - Guarantees pixel-identical face + thin wire-frame glasses. If a large warp is ever required, STOP — the base moved the head and that's a defect.

4. **Tier 1 product-truth overlay**
   - Composite the real logo / chest script / hardware pixels from the SL reference into their correct positions (tracked/warped to fit), rather than trusting diffusion for them.

5. **Unify & minor cleanup**
   - Low-strength diffusion ONLY on seam edges if needed. Color-grade match; optional grain.
   - Export unified 1080×1920 hero still.

6. **Final 4K pass (DEFERRED — not now)**
   - Run the approved composite through Runway / Topaz / Grok video-enhance for whole-frame 4K parity.

---

## 5. Fallback lane — IDM-VTON + refined restore

- Run IDM-VTON on the 1080p source (preserves pose/scene/cap/orange-pants).
- Measure and correct its translation offset precisely (feature matching / landmark alignment on shoulders+head — OpenCV/PIL, scriptable). It's a translation, not an angle change, so it corrects cleanly.
- Apply the deterministic face/glasses restore (minimal warp).
- Use when the primary inpaint's Tier 1/2 fidelity is insufficient. IDM's softness is fixable in the final enhancement pass.

---

## 6. Reliability & logging

- Fixed seed + identical mask + versioned SL reference set → repeatable runs.
- Log per run: mask coverage, IP-Adapter scale, ControlNet weights, guidance, seed.

---

## 7. Motion handoff (ONLY after the hero still passes)

- Approved hero still → **image-to-video** (Runway Gen-4 or Kling) with strong reference conditioning + OpenPose/ControlNet propagation from the original footage frames. Or keyframe + optical-flow + per-keyframe masked inpaint with temporal smoothing. SwitchX for temporal propagation of the approved look.
- **Kill criterion:** any visible identity drift, garment-topology shift, or face softening beyond a visual/PSNR-SSIM threshold → revert to B-roll hero shots or a hybrid (real footage with a tracked static swapped jacket).

---

## 8. AVT integration notes

- Add a new lane in Hero Frame Studio: **"Jacket-Only Inpaint (Masked IP-Adapter + ControlNet)."**
- Expose controls: IP-Adapter scale, ControlNet weights, mask feather, fixed-seed toggle.
- Keep the existing Grok / IDM-VTON / CatVTON lanes but mark them **deprecated for this use-case** (Grok = experimental benchmark only).
- Effort split: **80% deterministic product-truth + masking + restore + propagation, 20% new model wiring.**

---

## 9. Success gate

**One believable still where the SL jacket construction is correct (topology in place) and Fendi's real pose, face, glasses, and scene survive.** Nothing proceeds to video until this passes.
