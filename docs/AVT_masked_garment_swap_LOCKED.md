# LOCKED garment-swap architecture — masked inpaint (primary)

Supersedes the Grok `/v1/images/edits` full-re-render lane as the primary
wardrobe swap. Grok remains selectable for comparison.

**Core principle:** the face, glasses, pose and background are REAL captured
pixels preserved by construction — masking plus a deterministic restore — not
re-rendered and not talked out of a model by prompt.

## Why this is a guarantee and not a hope

`recomposite()` computes `out = source·(1−α) + inpaint·α`, where α is the
feathered garment mask. Where α is 0 — which is everything that is not jacket —
the output bytes equal the source bytes exactly. There is no path by which flux
can touch a pixel outside the mask, because flux's output is never used
directly. That is the whole architecture; everything else is refinement.

Contrast: xAI's `/v1/images/edits` has no mask parameter. It repaints the entire
frame and hands back a new image, so the only lever is the prompt. That is why
that lane shipped a reconstructed face, and why it cannot be the masked engine.

## Pipeline

Durable step state-machine in `_shared/jacketInpaintPipeline.ts`, driven by
`jacket-inpaint-proxy`. Each edge invocation runs one step then self-schedules,
so it survives the ~400s platform wall clock. A watchdog resumes stalled chains
and hard-fails dead ones.

| Step | Model | What it does |
|---|---|---|
| `evf_sam_submit/poll` | `fal-ai/evf-sam` | Garment mask from `MASKED_GARMENT_MASK_PROMPT`. Names only upper-body clothing — evf-sam is text-grounded, so naming the pants is what would mask them. |
| `face_guard_submit/poll` | `fal-ai/evf-sam` | **New.** Second pass over head/face/hair/cap/glasses/hands. Non-fatal: no guard degrades to the un-guarded mask. |
| `pad_upload` | — | Guard is dilated (10px @1080) and **subtracted** from the garment mask, then everything downstream derives from the guarded mask. Pads to ÷16, downscales to 768×1344 (~1MP). |
| `flux_submit/poll` | `fal-ai/flux-general/inpainting` | Inpaints the masked region only, conditioned on the garment reference via IP-Adapter. |
| `recomposite` | — | Feathered blend of the inpaint back over the real 1080×1920 capture, mask-limited. |

Then, client-side: **deterministic head restore** (`faceRestore` →
`compositePeriocular`) composites his real hero-frame head back over the result
— ellipse mask, perspective warp, feathered seam, Reinhard colour match. It
refuses rather than guesses when detection is weak, and a refusal is non-fatal.

## Why the face guard exists if the recomposite already guarantees it

Defence in depth. A garment mask that bleeds onto his jaw can only ever soften
*his own* jaw — it cannot import a stranger's. The guard means even that doesn't
happen, and it removes head pixels from the region flux sees, so flux has
nothing to anchor a second face on. It costs one extra Fal call (~5-10s).

## Resolution

Unified HD (1080×1920) end to end; flux runs at 768×1344 because the padded
2.1MP inpaint hangs. **4K is a FINAL pass after the video edit is locked** — see
`TODO(4k-final-pass)` in the recomposite step. Upscaling per-frame before the
models would give them more pixels to hallucinate across and would shimmer
across the sequence. `upscaled_to_4k: false` in the look metadata is the marker
the final pass reads.

## Candidate matrix (`src/lib/heroFrame/types.ts`)

1. **Masked Inpaint · Garment-only** — primary
2. **Full-look · IDM-VTON** — declared fallback, pose-preserving, same restore
3. **Grok Image-Edit** — comparison only
4. **Full-look · CatVTON**

`runIdentity` (generative face-swap, Grok only) and `runFaceRestore`
(deterministic, every lane) are now separate flags. Do not conflate them.

## Deploy checklist (Cowork / Lovable)

Deploy path is **GitHub → Lovable only**. Do not run `deno check` on edge
functions — it hangs.

**Fal model IDs — all four are ALREADY in Control Center's `fal-run` allowlist**
(`switchx-restyle/index.ts`, project 7fce9fc6). No CC change required:

- `fal-ai/evf-sam` — garment mask **and** the new face guard (same ID, different prompt)
- `fal-ai/flux-general/inpainting` — masked engine
- `fal-ai/flux-lora/inpainting` — text-only fallback engine
- `fal-ai/imageutils/depth` / `canny` — only if ControlNet is enabled (default `none`)

**Secrets — all existing, none new:** `COMPOSE_LOOK_CC_URL`,
`SWITCHX_PROXY_SECRET` (or `COMPOSE_LOOK_PROXY_SECRET`), `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` on AVT; `FAL_API_KEY` on CC.

**Optional env:** `JACKET_INPAINT_MODEL=flux-lora` on AVT flips the engine if
`flux-general/inpainting` starts 502-ing again. The run then degrades to a
text-only garment (no IP-Adapter, no negative prompt) — softer jacket, still
correctly masked. Per-request `inpaintModelKey` overrides the env.

**No SQL migration.** All new state lives inside the existing
`artist_looks.composition_recipe_json` JSONB.

**Functions to deploy:** `jacket-inpaint-proxy` (picks up both changed
`_shared/` modules and the new `_shared/maskedGarmentPrompt.ts`).

### Test

1. Hero Frame Studio → capture a frame → pick the Saint Laurent wardrobe item →
   **Generate hero candidates**. Candidate 1 is the masked lane.
2. Watch the look row's `composition_recipe_json.generation_metadata.phase`
   advance: `evf_sam_submit` → `face_guard_submit` → `pad_upload` →
   `flux_submit` → `recomposite` → complete. Expect a few minutes.
3. Verify on the completed row:
   - `mask_guard_stats.removed_fraction` > 0 — the guard actually clipped the mask.
   - `changed_fraction` ≈ `mask_coverage` — only the jacket region moved.
   - `face_guard_applied: true`.
4. Inspect the saved masks in `look-composites` (`*_mask.png`,
   `*_face_guard.png`) if the mask looks wrong — they are kept for exactly this.
5. Confirm the `· real face` child look exists (the deterministic head restore).
   If it's missing, check `faceRestoreError` on the candidate — detection
   refusing is expected behaviour, not a crash, and the un-restored candidate is
   still usable.
