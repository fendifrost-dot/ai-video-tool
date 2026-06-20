# AVT Product Truth Layer — Logo Composite Progress Handoff (for outside review)

**Date:** 2026-06-20
**Purpose:** Summarize what we're building and testing, the progress and dead-ends so far, and the open questions — so an outside reviewer (ChatGPT) can sanity-check the approach and suggest improvements.

---

## 1. Goal & locked architecture

We do AI virtual try-on for a creator's own fashion content. The core problem is **deterministic brand fidelity** — getting a specific garment's branding (logo/wordmark, stripe, hardware) onto the subject *exactly*, repeatably, not "a plausible jacket."

We concluded (and this is locked) that **diffusion try-on cannot guarantee logo/text fidelity** — it hits a ceiling on small typography. So branding is handled by a **deterministic composite layer**, not the diffusion model.

**Pipeline:**
```
Source video → extract keyframes → IDM-VTON (garment shape/color/fit)
            → deterministic Logo/Detail Composite (real brand pixels)
            → SwitchX temporal propagation (video; later)
            → FFmpeg reassembly
```

**Responsibility split:**
- **VTON (fal-ai/idm-vton)** owns garment silhouette, fit, color, stripe placement, removal of the old garment.
- **Logo/Detail Composite** owns brand typography & hardware — real pixels, never AI-redrawn.
- **SwitchX (Beeble)** owns temporal consistency for video (not yet wired).
- Rejected: SwitchX "custom" inpainting as the garment engine (produces plausible-not-exact), Kling v2v (destroys identity).

**Product Truth Layer (the data model):** each SKU is a canonical asset with `front_flat_asset_id`, `logo_asset_id`, `logo_placement_json` (`source_bbox_norm`, `target_region`, `placement_hint`, `warp_mode`, optional `manual_keyframe` quad), `zipper_color_profile_json`, `fit_profile_json`. Store once per SKU, reuse everywhere.

**Placement priority (locked):** 1) manual keyframe placement, 2) product placement metadata, 3) detection refinement (HSV / chest-band / SAM), 4) fallback. If detection confidence is low → do **not** guess → require manual keyframe override → store for propagation.

**Engine:** a shared "Product Detail Placement Engine" (`placeDetail`) with a detail-type registry (`logo_zone`, `chest_band`, `zipper_line`, `zipper_pull`, `sleeve_panel`, `button`, `patch`). Inputs: VTON frame, product refs, product_truth_json, optional manual quad, optional HSV/SAM detection. Outputs: target quad/path, confidence, fallback_reason, quality_warning, debug overlay.

---

## 2. Test case

**Garment:** Saint Laurent mastic (tan) cotton jacket — exterior navy horizontal chest stripe with a cursive gold "Saint Laurent" wordmark (right-of-center), navy sleeve stripes, **tonal mastic zipper (NOT metallic gold)**, navy collar lining.

**Frame:** a single keyframe extracted from the creator's real source video — a **turned pose**, so the chest stripe runs **diagonally** and is partly foreshortened. (This hard pose is deliberate — it's where automation breaks.)

**Infra:** Lovable-managed Supabase + edge functions (`wardrobe-vton-proxy` calls a separate Compose project's `vton-frame` action; polled via a fal-queue proxy). Code is on GitHub `main`; Lovable builds from `main`. Gotcha learned: Lovable "Publish" syncs the frontend but does **not** redeploy edge functions — must force a function redeploy each time.

---

## 3. What's proven / working

- **Single-frame IDM-VTON transfers the garment correctly** — mastic body, navy stripe, identity (face/cap/glasses), background, and lower body all preserved.
- **Legibility solved deterministically** — a low-res logo source produced garbled text; switching to a **high-res real logo asset** (2608×3260 from the brand's image server, ingested server-side) + bilinear resampling makes the wordmark crisp.
- **Manual keyframe placement (4-corner quad) + perspective warp** lands the wordmark **on the diagonal stripe, right-of-center**, following the slope — `placement_source = manual_keyframe`, `warp_mode = perspective`, `confidence = 1`.
- **Deterministic cover step** erases the VTON's own garbled wordmark so only the clean composited one remains.
- **Confidence-gated fallback works & is observable** — auto stripe-detection scored ~0.21 on this turned pose (below the 0.5 trust threshold), correctly refused to guess, fell back to manual placement, and surfaced `placement_fallback / quality_warning` in the recipe. **Conclusion: manual placement is the reliable path; auto-detection is refinement only.**
- Full audit trail persisted (parent VTON raw + composite + placement source + confidence + quad + warp_mode + debug overlay).

**Net:** "Product ID + manual placement → deterministic, correct branded frame" is essentially demonstrated on a still.

---

## 4. The debugging journey (logo composite, iterative — each fix exposed the next)

| Artifact | Root cause | Fix |
|---|---|---|
| Garbled "SAINT LAURENT" | low-res source + nearest-neighbor upscale of ~20px text | high-res asset + bilinear resample |
| Logo on tan above the stripe | auto band-detection merged collar+stripe, targeted upper chest | manual quad + perspective warp onto the stripe |
| Two logos | VTON renders its own mushy wordmark on the stripe | deterministic navy cover over the VTON mark |
| Tan vertical line right of logo | source crop bbox ran into tan; warp pasted the whole crop opaquely | key the source to **glyphs only** (drop navy + tan background) |
| Clarity regression (thin/gappy letters) | glyph key discarded anti-aliased edge pixels (~1px/stroke) | **dilate the kept-glyph mask** ~1px to rebuild edges (restored ~94% of bold weight) |
| Mastic bleed below the wordmark | cover only filled inside the quad; VTON descender + stripe transition uncovered | cover snaps to the local navy band |
| Navy rectangle bulge below | cover extended to a **flat** bottom, but stripe bottom is **diagonal** | per-column cover follows the diagonal stripe bottom |
| **(current, in flight)** persistent ~5px tan smudge inside the band, just below baseline | the per-column cover fill **stops at the first light pixel**, and the VTON's own faint mark *is* a light pixel — so the "solid" fill quits above the smudge and leaves it exposed | fill navy **through interior light pixels** down to the true outer stripe boundary (tan body), without painting below the stripe |

**Meta-lesson:** automated pixel checks that threshold only for *bright* remnants repeatedly under-reported faint mid-tone smudges the human eye caught. Human visual judgment is the ground truth for "done."

---

## 5. Open issues / not yet built

1. **Tan smudge fix is in flight** (fill through interior light pixels to the outer stripe edge). Not yet re-verified.
2. **Durable clarity:** we're keying the wordmark out of a product photo (`front_crop`). A dedicated **high-res transparent logo PNG** (`logo_asset_id`) would remove the key-vs-background tradeoff entirely (full boldness, no background ever). We don't have a clean transparent asset yet.
3. **No manual-placement UI yet** — quads are set via metadata; the "draw the quad on a keyframe" UI is a follow-on.
4. **No placement propagation** across frames/keyframes.
5. **Full-video pipeline NOT wired** — only single-frame proof exists. Frame-by-frame VTON → per-keyframe composite → SwitchX temporal → FFmpeg reassembly is unbuilt.
6. **Auto-detection unreliable on turned/diagonal/occluded poses** (confidence 0.21). Manual is the fallback.
7. **Zipper Product Truth:** the real zipper is tonal mastic, not gold; VTON hallucinates a reflective gold zipper. Engine has `zipper_line` / `zipper_pull` detail types stubbed; the recolor (gold→tonal) + pull-asset composite layer is not built.

---

## 6. Questions for outside review

1. **Is the deterministic composite the right strategy** vs alternatives — e.g., ControlNet/IP-Adapter region conditioning, a per-garment LoRA, or segmentation-driven texture transfer — for guaranteed logo fidelity?
2. **Robust per-frame placement without per-frame manual quads:** best approach to locate the stripe/logo region on arbitrary poses? Options on the table: anchor on the **VTON output's own rendered stripe** (pose-following), **SAM-3 segmentation** of the stripe, or **optical-flow propagation** of one manual keyframe quad across the clip. Which is most robust/cheapest?
3. **Logo source for crispness:** transparent high-res PNG asset vs glyph-keying from a product photo — any better deterministic options for brand-accurate, anti-aliased type at small sizes?
4. **Video:** with keyframe placement + SwitchX temporal propagation, will the composited logo stay locked through motion, or must the composite run **every frame** with the placement propagated? What are the failure modes (drift, flicker, occlusion)?
5. **Zipper hardware:** is "detect zipper line → recolor gold→tonal + kill specular, and composite a real pull asset" the right deterministic approach, or is there a cleaner method?
6. **Are we over- or under-engineering anything?** The composite has needed ~8 iterative geometry/keying fixes on one frame — is there a more principled single approach (e.g., segment the navy stripe mask via SAM and composite within that mask with alpha-from-glyphs) that would have avoided the whack-a-mole?

---

## 7. One-line summary

Garment transfer is solved; we're solving **deterministic branding** via a real-pixel composite layer with manual-first placement and perspective warp. It works on a still frame (legible, on-stripe, correct) down to a final ~5px smudge fix in progress. The big unbuilt pieces are the **placement UI**, **frame-to-frame propagation**, the **full video pipeline**, and the **zipper hardware layer**.
