# Cursor Handoff — Grok Image-Edit Garment-Truth Lane (AVT Hero Frame Studio) — CONSOLIDATED

**Date:** 2026-06-24
**Build:** Cursor. **Credential:** Fendi (Grok image key). **Test/verify:** Claude.
**Repos:** AVT = github.com/fendifrost-dot/ai-video-tool (main). CC (proxy functions) = github.com/fendifrost-dot/fendi-control-center.

---

## 1. Objective & locked workflow
Take a **real frame from Fendi's video** (his current outfit, exact pose, lighting, background) and swap a **complete designer outfit from a model reference onto him**, preserving his identity and motion, with background/lens/FX flexible downstream. Grok's image model is strongest at garment construction fidelity, so we add a **Grok Image-Edit garment-truth lane** to Hero Frame Studio to compete with IDM-VTON.

```
Fendi's real video frame (current outfit, pose, lighting, bg)
  → Grok Image-Edit garment-truth lane (or IDM-VTON / CatVTON)  [Phase 1 — this build]
  → identity restoration (if needed)
  → deterministic Product Truth Layer (logo, stripes, zipper, hardware)
  → human approve hero frame  [GATE]
  → temporal propagation (preserve motion/lip-sync)  [Phase 2, later]
  → flexible background / lens / FX swap (SwitchX or other)
  → FFmpeg reassembly
Priority when trade-offs collide: garment construction fidelity → identity → pose/background → temporal (later).
```

## 2. TARGET (critical — do not narrow)
Swap the model's **ENTIRE OUTFIT** onto Fendi: **jacket + shirt + tie + pants + every worn piece**, as one complete look — **EXCLUDING the model's glasses/eyewear**. The reference is the **on-model photo of the full look**, NOT a flat garment cutout and NOT the jacket alone. The output is **Fendi** wearing that full outfit, keeping **his own face and his own glasses** (do not copy the model's face or eyewear).

## 3. Why this is a build (verified code gap)
A live test confirmed the Grok garment-truth candidate **cannot run today**:
- `src/lib/providers/grok.ts` emits only `grok-imagine-video` (caps: text_to_video / image_to_video / extend). **No image model.**
- Routing: `providerJobs/api.ts → proxy-provider-call → CC video-providers-grok-generate → xAI POST /v1/videos/generations`. `proxy-provider-call` **whitelists only `video-providers-*`.**
- `docs/grok_api_status.md`: in-app Grok **image** generation is "Not yet wired."
- Only Grok-image path today = manual external upload (`LooksListPage.tsx:126`).
- The `Frost_Grok` credential on CC is the **same** xAI API key — it was only wired for video; image edit needed a new AVT edge function + `XAI_API_KEY` on AVT secrets.

## 4. Build requirements
1. **Grok Image-Edit provider** — extend `GrokProvider` to support image editing via xAI's image edit / reference-conditioned endpoint (e.g. `grok-imagine-image` / `/v1/images/...`), separate from `grok-imagine-video`. New capability `image_edit` with up to **3 reference images**.
2. **Proxy + CC function** — update `proxy-provider-call` to allow an image-edit endpoint (today only `video-providers-*`), and build the matching Control Center function (`image-providers-grok-edit` / `video-providers-grok-image-edit`) that calls xAI's image API.
3. **Inputs** — Base: Fendi's real hero frame (pose/lighting/background). References: the **on-model full-look photo (primary)** + optional detail shots, up to 3 total. Reuse the existing multi-ref signing in `providerJobs/api.ts` (`referenceImagePaths`, `GROK_MAX_REFERENCE_IMAGES=3`) — currently feeds `reference_to_video`; point it at the image-edit call.
4. **Output** — still saved to `look-composites` / `project_assets`, with metadata: `pipeline_used: "grok_image_edit_garment_truth"`, `candidate_type: "hero_frame"`, `garment_truth_lane: true`, `identity_restored: false`.
5. **Hero Frame Studio UI** — add a **"Grok Image-Edit Garment-Truth"** lane alongside IDM-VTON / CatVTON in the candidate matrix.
6. **Credential** — add `XAI_API_KEY` to AVT Edge Function secrets (same value as CC `Frost_Grok`; xAI uses one key for image + video). [Fendi]

## 5. Grok prompt (full-outfit, anchored on the real frame)
```
Photorealistic edit of the source frame: keep the exact pose, camera angle, lighting, and background, but dress Fendi Frost in the COMPLETE OUTFIT worn by the model in the reference — jacket, shirt, tie, pants, and every worn piece, as one full look. EXCLUDE the model's glasses/eyewear.

Priorities, in order:
1. Full-outfit construction fidelity — exact collar shape/stand, exact stripe width/position/angle, exact zipper/hardware/buttons/pockets/seams, exact shirt + tie, exact trouser cut, exact fabric wash and drape across the whole outfit. Do not invent or simplify any element.
2. Preserve Fendi's OWN identity — his face, beard, skin tone, head shape, body proportions, and his own glasses. Do NOT copy the model's face or eyewear onto him.
3. Preserve the original pose, background, and lighting.

Use the supplied on-model references for construction detail.
```

## 6. Optional enhancement
If supported, pass a **mask** so the edit only touches the clothing/body region while strongly preserving face/head/hands/background.

## 7. Acceptance test (Claude runs once built + key is in)
On the same real hero frame, with the **on-model full-look reference** (never the flat cutout):
1. IDM-VTON candidate (baseline — known ceiling: navy over-applies to a shoulder yoke, single-garment only).
2. **Grok Image-Edit garment-truth candidate.**
3. Grok candidate + identity restoration (fix the `identity_inpaint` canvas bug, or rely on Grok's native identity).
Compare, honestly and reviewed first-hand: **full-outfit construction fidelity** (jacket + shirt + tie + pants) → **identity** (still Fendi, his glasses) → **pose/background preservation**. Save all candidates + a labeled board to the MODEST folder.

## 8. Decision point
If Grok wins on garment fidelity when anchored on Fendi's real frame, make the Grok Image-Edit lane the **preferred** lane for complex designer pieces. IDM-VTON stays useful for simpler garments or maximum pose lock.

## 9. Reuse / don't lock
- Reuse the existing **identity lock** and **Product Truth Layer** (logo, stripes, zipper, hardware — the perspective-warp composite engine already built).
- Do **not** rigidly lock background — downstream background/lens/FX/animation swap (SwitchX or other) is explicitly supported.
- This lane is **image-only**; video/temporal propagation is Phase 2, later.

## 10. Separate still-open AVT items (not this build, but on the board)
- **Full-outfit VTON mode:** the IDM-VTON path only does one garment per pass (`vton_category` hardcoded upper_body/lower_body, no override/dresses) — needs a `full_outfit` mode if VTON is to do the whole look. (Grok image-edit sidesteps this by doing the full look in one pass.)
- **`identity_inpaint` bug:** it discards the canvas and returns a canned FENDIFROST portrait — fix canvas preservation.
- **CatVTON routing:** candidates log `idm_vton_frame` with no `vton_model` tag — CatVTON may be silently falling back to IDM-VTON; verify routing.

## 11. Roles
- **Cursor:** build §4 (the Grok image-edit lane) using the §5 prompt and §2 target.
- **Fendi:** provision the Grok image API key (§4.6).
- **Claude:** run the §7 acceptance test once built + key is in; review outputs first-hand; report honest fidelity/identity/pose verdict; then proceed to hero approval → identity → Product Truth → Phase 2.
