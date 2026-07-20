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

## Guarded Grok — Grok's garment, this lane's guarantee

Fendi wants Grok rendering the garment: it beats flux-lora's text-only jacket
and the VTON lanes on fidelity. The problem is that Grok cannot be trusted with
structure. `/v1/images/edits` has **no mask parameter, no seed, no strength and
no pose/depth conditioning** (enumerated schema — see `grok_pose_conditioning.md`),
so it repaints all 2M pixels and routinely re-poses the subject. Its output is
therefore frequently **not spatially aligned** to the hero frame.

Three ways to reconcile that were on the table:

| | Approach | Verdict |
|---|---|---|
| (a) | Detect pose drift, reject/realign the run | **No.** Needs a pose estimator this repo does not wire, and even a "passing" run is a full VAE re-render — no pixel is truly original. The gate would reject most runs, and the ones it passed would still seam badly at sleeve and shoulder boundaries. It converts a fidelity win into a coin flip. |
| (b) | Warp Grok's output onto the source pose, then composite | **No.** Needs dense correspondence (optical flow or keypoint TPS) implemented in pure TS inside a 400s edge isolate, and warping the garment to fit a mask cut from a *different* body pose distorts exactly the construction detail Grok was chosen for. High cost, uncertain output. |
| (c) | **Grok's render as the IP-Adapter reference into the in-place masked inpaint** | **Yes. Shipped.** |

**Why (c) is not a compromise but the right shape.** IP-Adapter conditions on
CLIP *image embeddings*, not pixel positions. Grok's pose drift — fatal for (a)
and (b) — is **irrelevant here by construction**, because nothing positional is
ever read from the render. Meanwhile flux inpaints **in place**, so alignment to
the real frame is structural rather than estimated, and the deterministic
recomposite guarantee is completely unchanged: `out = source·(1−α) + inpaint·α`,
so no Grok pixel ever reaches the output. We get Grok's garment *appearance*
with zero exposure to Grok's geometry.

It is also a strictly better reference than the flat product still: Grok renders
the garment **on him, in this frame's lighting**, which is closer to what flux
must paint than a catalogue shot on a white sweep.

Flow (`lane: "guarded_grok"`, `GUARDED_GROK_PLAN` in `heroFrame/types.ts`):

1. `grok-image-garment-proxy` → full-frame Grok render. Geometry discarded.
2. `jacket-inpaint-proxy` with `ipAdapterImagePath` = that render's storage path,
   `inpaintModelKey: "flux-general"`. Ordinary masked pipeline from there.
3. Deterministic head restore last, as on every lane.

> ⚠️ **Gated on the flux-general hang.** `ip_adapters` exists only on
> `fal-ai/flux-general/inpainting`, so this lane cannot run on flux-lora. Rather
> than silently degrade to a text-only garment — which would look like the lane
> worked — `flux_submit` **fails loudly** with
> `ip_adapter_reference_requires_flux_general`. Until flux-general returns
> reliably, expect this candidate to burn the 15-minute flux cap and fail. Each
> candidate has its own try/catch, so the other lanes are unaffected.

## Prompts derive from the selected garment

`_shared/maskedGarmentPrompt.ts` is now the **single source of truth** and a
builder, not a set of constants. The `src/` twin is deleted — two copies of a
prompt is how the lane ended up painting a Saint Laurent track jacket on a run
whose selected garment was camouflage.

**The two prompts describe different garments. Never derive one from the other.**

- `maskPrompt` grounds evf-sam on what he is **wearing in the frame right now** —
  the region to replace. Derived from the wardrobe feature's **body region**,
  never its label, and naming no colour, brand or material. evf-sam is
  text-grounded, so every adjective is a chance to ground on nothing.
- `prompt` describes the **target** garment. Built per-run from the wardrobe
  row's `label` (NOT NULL, so always available) plus optional
  `metadata_json.garment_description` / `garment_prompt` / `negative_prompt`
  overrides. `DEFAULTS.prompt` is `""` and `flux_submit` refuses to run without
  one — there is no safe default for "which garment".

The client sends no prompts at all now; `jacket-inpaint-proxy` derives them from
the wardrobe row it already loads and records the resolved values (plus
`garment_prompt_source` / `mask_prompt_source`) on the recipe, so provenance
survives without a hardcoded string on the client.

## No-op guards — a swap that didn't happen must not report success

Two checks, because an empty mask used to complete cleanly with a byte-copy of
the source, which is indistinguishable from a finished swap in the UI.

- **`pad_upload`** — measures coverage of the *guarded* mask (what flux actually
  gets) and throws `mask_coverage_too_low` below `minMaskCoverage` (default
  `0.005` = 0.5% of frame; a real jacket is 8–20%).
- **`recomposite`** — backstop on the *result*: throws `recomposite_no_op` if
  `mask_coverage` or `changed_fraction` says nothing moved.

## Resolution

Unified HD (1080×1920) end to end; flux runs at 768×1344 because the padded
2.1MP inpaint hangs. **4K is a FINAL pass after the video edit is locked** — see
`TODO(4k-final-pass)` in the recomposite step. Upscaling per-frame before the
models would give them more pixels to hallucinate across and would shimmer
across the sequence. `upscaled_to_4k: false` in the look metadata is the marker
the final pass reads.

## Candidate matrix (`src/lib/heroFrame/types.ts`)

1. **Masked Inpaint · Garment-only** — primary
2. **Guarded Grok** — Grok garment fidelity + this lane's identity guarantee
   (gated on flux-general; see above)
3. **Full-look · IDM-VTON** — declared fallback, pose-preserving, same restore
4. **Grok Image-Edit** — comparison only
5. **Full-look · CatVTON**

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

**Functions to deploy:** `jacket-inpaint-proxy` (picks up the changed
`_shared/jacketInpaintPipeline.ts` and `_shared/maskedGarmentPrompt.ts`).
`grok-image-garment-proxy` is **unchanged** — the guarded-Grok lane calls it
exactly as the comparison lane does — but it must already be deployed, since the
new lane depends on it.

**No new Fal model ids, no new secrets, no CC allowlist change.** Guarded Grok
reuses `fal-ai/flux-general/inpainting`'s existing `ip_adapters` field with a
different reference image; nothing about the payload shape is new.

⚠️ **`JACKET_INPAINT_MODEL` must NOT be set to `flux-lora`** if the guarded-Grok
lane is expected to run — that engine has no `ip_adapters` field and the run will
fail with `ip_adapter_reference_requires_flux_general` rather than silently
discard the Grok reference. (The client pins `flux-general` per-request, which
takes precedence over the env, so this only bites direct callers.)

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
5. **Garment derivation (do this on a NON-Saint-Laurent item — that is the whole
   point).** Pick the camo jacket. On the completed row check
   `generation_metadata.garment_prompt` names the camo item, not Saint Laurent,
   and `garment_prompt_source: "derived_from_wardrobe"`. Then check
   `mask_prompt` is still the generic body-region phrase — it describes what he
   is WEARING, so it must NOT have changed with the selection.
6. **No-op guard.** `mask_coverage` should be ~0.08–0.20. If a run fails with
   `mask_coverage_too_low`, that is the guard working: evf-sam matched nothing,
   and previously this would have completed with an unchanged image. Inspect
   `*_mask.png` and set `metadata_json.mask_prompt` on the wardrobe row.
7. **Guarded Grok (candidate 2).** Expect `pipeline_used:
   "guarded_grok_masked_inpaint"` and
   `generation_metadata.ip_adapter_reference_source: "grok_render"`. A failure of
   `ip_adapter_reference_requires_flux_general` means the engine resolved to
   flux-lora — check `JACKET_INPAINT_MODEL`. A 15-minute
   `fal_timeout_fal-ai/flux-general/inpainting` is the known flux-general hang,
   not this change.
8. Confirm the `· real face` child look exists (the deterministic head restore).
   If it's missing, check `faceRestoreError` on the candidate — detection
   refusing is expected behaviour, not a crash, and the un-restored candidate is
   still usable.
