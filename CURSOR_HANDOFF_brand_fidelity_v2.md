# Cursor Handoff — Brand Fidelity Layer v2 (synthesized from outside review)

**Date:** 2026-06-20
**To:** Cursor — evaluate, optimize if needed, then execute.
**From:** Fendi + Claude, incorporating review from ChatGPT, Grok, and Gemini.
**Supersedes:** the v1 logo-composite handoff for forward architecture (history there is still valid).

---

## 0. How to use this doc
The single-frame deterministic logo composite is **working** (legible, on the diagonal stripe, single mark, identity/bg preserved) down to a final boldness+smudge tweak landing now. Three independent reviewers converged on the same next architecture. This doc locks the decisions they agreed on and lays out the build order. **Evaluate it, push back where you disagree on engineering grounds, then execute in the phase order below.** Respect the hard rules in §9.

---

## 1. LOCKED decisions — do not reopen

These are settled. Do not spend cycles re-litigating them (per ChatGPT: stop leaving room to reopen solved questions).

1. **Deterministic composite is the strategy.** Diffusion will not render brand truth reliably. Brand truth = real pixels, never AI-redrawn. LOCKED.
2. **Responsibility split:** VTON = garment geometry/fit; **Brand Composite = all brand truth (logos, wordmarks, prints, hardware, labels)**; SwitchX = temporal/relight polish ONLY; FFmpeg = assembly. **SwitchX does NOT own or propagate logos.**
3. **Manual placement is the SOURCE OF TRUTH.** Auto-detection is NOT the primary mechanism — it only: (a) accelerates initial placement, (b) validates propagated placements, (c) flags drift, (d) recovers from tracking failure. Detection *assists* placement; it does not *find* it. (Our data proved this: stripe auto-confidence = 0.21 on a turned pose; manual quad succeeds consistently.)
4. **Propagate GEOMETRY, not pixels.** Never paste a logo once and hope a downstream model preserves it. Every frame gets its own deterministic composite using tracked geometry.
5. **Transparent assets are REQUIRED for production** (logo PNG, zipper-pull PNG, patch PNG, embroidery PNG). Keying the wordmark out of a product photo is a temporary interim workaround, not the long-term source.

---

## 2. Unified data model — `product_details[]`

Collapse the per-feature JSON blobs (`logo_placement_json`, `zipper_color_profile_json`, …) into ONE array. Everything is a "detail," one engine, different config.

```json
{
  "product_details": [
    {
      "detail_type": "logo | wordmark | zipper_pull | zipper_teeth | button | patch | sleeve_stripe | label | embroidery",
      "asset_id": "transparent-png-asset-uuid",        // required for composite types
      "anchor_type": "stripe | placket | collar | sleeve | freeform",
      "placement": {
        "manual_keyframe": { "<keyframe_id|default>": { "target_quad_norm": [[x,y],[x,y],[x,y],[x,y]] } },
        "source_bbox_norm": [x,y,w,h],
        "warp_mode": "affine | perspective | tps | mesh"
      },
      "render": { "blend_mode": "normal | luminance_preserve", "feather_px": 3 },
      "color_profile": { "finish": "tonal_mastic", "reflectivity": 0.15, "delta_e_max": 8 },  // for recolor types
      "tracking_mode": "optical_flow | feature | static",
      "occlusion_priority": 10
    }
  ]
}
```

Migrate existing logo_placement / zipper_color_profile into this shape; keep a back-compat reader during transition.

---

## 3. The missing layer — placement TRACKING & per-frame composite

This is the #1 build priority for video and the biggest gap today. Current pipeline jumps keyframe-composite → SwitchX. Insert an explicit tracking/propagation stage:

```
Frame 1 (keyframe):  manual quad (human sets/confirms)
Frames 2..N:         track the quad  (optical flow / feature tracking / SAM-2 mask contour)
Each frame:          warp asset (per §4) → composite → render
Then:                SwitchX temporal polish (style/relight) — NOT logo work
```

- Propagate the QUAD (geometry), composite per frame. Do not paste once.
- Detection runs each frame only to *validate* the propagated quad and *flag drift* (re-prompt for a new manual keyframe if drift exceeds threshold).
- Keyframe strategy: human sets a quad on sparse keyframes (e.g. every N frames or at pose changes); propagation fills between; detection flags when a new keyframe is needed.

---

## 4. Realism upgrades (so it reads "printed on fabric," not "sticker/watermark")

Gemini's strongest points — these are real and needed before video looks credible.

**4a. Non-planar warp (the "flat sticker" flaw).** A 4-corner perspective warp assumes a flat plane; a real torso curves over pecs/ribs and wrinkles. Upgrade `warp_mode`:
- `affine`/`perspective` = current (fine for near-flat/frontal).
- `tps` (Thin Plate Spline) or `mesh` = drive the warp with an 8–12 point grid, or with the **top/bottom contour curves of the segmented stripe** (SAM-2), so type follows the fabric's organic curvature and wrinkles. Escalate to TPS when the anchor region is non-planar.

**4b. Luminance / lighting pass-through.** Don't stomp pixels with flat hex color. Before compositing, extract the underlying **luminance/shadow map** of the target region from the VTON frame and overlay it back onto the composited asset (`blend_mode: luminance_preserve`) so folds, gradients, and shadows show *through* the typography.

**4c. Deterministic degradation / camera match.** Match the frame's motion blur, grain, and noise: apply a matching Gaussian blur (~0.5–1.5px) and micro-grain to the asset before flatten, so a pristine vector logo doesn't pop as a digital watermark.

---

## 5. Occlusion handling

A propagated quad will blindly paste over arms, straps, mics, folds, or a 90° turn. Add an **occlusion mask pass** inside the placement engine:
- Extract a foreground person/object mask (SAM / human-parsing) for the target region each frame.
- `Final composite mask = Placement mask − Occlusion mask`.
- If occlusion removes > ~60% of the detail region → **deterministic full-drop** (skip rendering that detail for those frames) rather than drawing a floating artifact.
- Also: the deterministic "cover the old VTON mark" step must respect the occlusion mask so it doesn't erase pixels under an arm.

Document depth-ordering as a follow-on if simple foreground masks prove insufficient.

---

## 6. Zipper strategy (explicit)

- **Composite (real transparent asset):** zipper PULL tab + hardware ornaments.
- **Recolor (deterministic, not composite):** zipper TEETH + tape + reflective highlights → tonal mastic, kill specular. Do NOT composite a teeth strip (too hard to warp per pose).
- Target: `delta_e < 8` vs the product reference; reflectivity ≈ 0.15; never "gold/luxury/metallic."

---

## 7. Infra — video pipeline must leave the Edge Functions

Current path (Lovable → Supabase Edge Fn → separate Compose project → poll fal queue) works for ONE frame but will collapse on a 10s/30fps = 300-frame clip (edge timeouts, network overhead, DB pool exhaustion from 300 polls).

- Keep Edge Functions for **orchestration only** (metadata, job kickoff, UI status).
- Move the full video pipeline — frame extraction → IDM-VTON → SAM-2 tracking → composite → FFmpeg — onto a **dedicated long-running GPU worker** (Modal / RunPod / GPU EC2 running the compose code in a Docker image). Worker pulls metadata once, processes all frames locally in a tensor/FFmpeg pipeline, uploads one finished video to storage. Linear cost, no polling death-loop.
- Single-frame/still path can stay on the current edge path; don't block still progress on the worker.

---

## 8. Success metrics (end subjective tuning)

**Stills:** logo legible at 100% crop; placement error < 5px; no duplicate branding; hardware ΔE < 8; no halo/bleed/bulge.
**Video:** average placement drift < 3px; zero visible flicker; frame-to-frame logo scale variance < 2%; no identity/background drift.

These are the acceptance gates — automate them where possible (but keep human visual sign-off as final ground truth; threshold-only pixel checks have repeatedly missed faint mid-tone smudges a human caught).

---

## 9. Hard rules (carry over)
- All processing through AVT/CC or the new worker — no ad-hoc Claude/Cursor-side garment edits as the source of truth.
- No AI-regeneration of brand/garment truth pixels.
- VTON-first; SwitchX = temporal only; Kling v2v disqualified.
- Audit reference-vs-output with explicit deltas before declaring wins.
- No CC code changes for this work unless explicitly scoped.

---

## 10. Build order (recommended)

**Phase 1 — finish the still (in flight):** land the boldness-restore + interior-smudge cover fix; confirm against the metrics in §8. (Already nearly done.)
**Phase 2 — data model:** migrate to `product_details[]` with back-compat. Make transparent `asset_id` the preferred logo source; treat keying as fallback. Stand up the requirement to supply transparent assets (logo, zipper pull).
**Phase 3 — per-frame compositing + tracking:** manual quad → optical-flow/feature/SAM-2 propagation → per-frame composite; detection demoted to validate/flag-drift. Build on a multi-frame test clip from the real source video.
**Phase 4 — realism:** add `luminance_preserve` blend + degradation match (4b/4c); add TPS/mesh warp for non-planar anchors (4a).
**Phase 5 — occlusion:** foreground-mask subtraction + full-drop rule (§5).
**Phase 6 — zipper detail:** pull composite + teeth recolor (§6) on the same engine.
**Phase 7 — infra:** move the video batch to the dedicated GPU worker (§7); edge functions orchestrate only.

Each phase: keep tests green, audit against §8 metrics, human sign-off, then proceed.

---

## 11. Current proven state (context for Cursor)
- Single-frame IDM-VTON transfers the SL mastic jacket correctly (garment, identity, background).
- High-res real logo asset + manual quad + perspective warp = legible "SAINT LAURENT" on the diagonal stripe, right-of-center, single mark. `placement_source=manual_keyframe, warp_mode=perspective, confidence=1`.
- Engine (`placeDetail`) exists with a detail registry, HSV detection, confidence/fallback, debug overlay; logo path consumes it; zipper types stubbed.
- Final still tweaks (glyph boldness back to the original solid weight + cover-through-interior-light to kill a ~5px tan smudge) are landing now.
- Repo: github.com/fendifrost-dot/ai-video-tool (`main`). Lovable builds from main; **Publish ≠ edge-function redeploy — force the function redeploy each time.**

---

## 12. Review focus for Cursor (not architecture re-litigation)
Per the reviewers, evaluate/optimize on: placement **propagation/tracking** reliability, **occlusion** handling, **non-planar warp** realism, **video scaling/infra**, and the **metrics**. Do NOT reopen the deterministic-composite decision or the manual-first placement philosophy. If you see a cleaner principled approach (e.g. SAM-2 stripe-mask-driven warp replacing several of our iterative geometry fixes), propose it — that's welcome.
