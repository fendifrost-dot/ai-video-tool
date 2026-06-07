# Cursor Handoff — Style References Library + Personal Style LoRA v2

## Context (essential, please read)

We just empirically confirmed why prompt-side fixes keep hitting a ceiling: **the current Fendi LoRA is biased toward waist-up portraits.** Trained on face refs that are predominantly chest-up shots. So every Stage 1 generation produces a portrait crop, no matter what framing language we put in the prompt or how tall we make the image canvas. Verified by smoke test — even with `832×1216` image size + explicit "full body, head to toe, feet visible" prompt suffix, Stage 1 still emitted a shirtless waist-up torso. This kills `lora_segmented_inpaint` because SAM-3 has no lower body to mask.

The architectural fix is to train a **new LoRA on full-body photos of Fendi in varied outfits.** That LoRA's bias becomes "Fendi in clothes, full body" instead of "Fendi's face from the waist up." Then Stage 1 produces a proper full-body base, segmentation works, regional inpainting actually runs.

This handoff has two phases. Phase 1 ships the upload + library UI so Fendi can bulk-import photos from his phone. Phase 2 wires the LoRA training trigger that uses the uploaded set as training data.

## Repo state (just verified)

- AVT main: `8dd16cf` (auth/RLS open, signed URL fix). Only `main` branch.
- CC main: `97c64210d7` (Cursor's latest framing/skip commits on top of segmented_inpaint). Only `main` branch.
- Identity profile for artist `8d4a4d22-...` (Fendi) has the current LoRA URL at `identity_profile_json.lora` and a trigger word `FENDIFROST`. We want to OVERWRITE this with the new v2 LoRA once it's trained.

## Constraints (hard)

- **Lovable chat = deploy/redeploy/update/schema-migration ONLY.** Never ask Lovable to write code, mutate data, or fix anything. Lovable forks branches on code asks. Fendi has been burned by this multiple times.
- All code edits go via local commits + push to GitHub.
- HEIC support is shipped — call `normalizeImageForUpload(file)` from `src/lib/image-normalize.ts` on every upload. Returns a `.jpg` File if input was HEIC; passes through otherwise.
- RLS is fully open (no per-user isolation) — anon sessions can read/write everything. Keep consistent.
- Don't touch:
  - The compose-look pipeline code (separate diagnostic thread).
  - The existing wardrobe / accessories / locations / props uploads (extend, don't refactor).
  - The current LoRA training that produced `FENDIFROST` — leave the current LoRA URL as fallback in case v2 fails.

## Phase 1 — Photos library + bulk upload

### Schema

Extend the existing `character_features` table with a new `feature_type = 'style_reference'`. Each row = one photo. Same `file_url`, `storage_path`, `mime_type` columns as wardrobe rows.

Terse Lovable ask (AVT project at https://lovable.dev/projects/bd21b544-c7b8-4780-bdde-391ac9d4bfa8):

```
Schema-only ask: please add 'style_reference' to the allowed values of the feature_type CHECK constraint on the character_features table. Also please create a public storage bucket named 'style-references' with anon read/write access. Do not change any code or any other column. Just update the CHECK constraint and create the bucket.
```

Watch the response. If Lovable proposes code changes, abort and surface.

### Frontend

New tab "Style References" on the artist detail page (alongside Wardrobe / Accessories / Locations / Props). Same layout pattern. Look at `src/components/wardrobe/WardrobeTab.tsx` and `src/pages/LocationsLibraryPage.tsx` for the existing pattern.

The upload UI is a standard `<input type="file" multiple accept="image/*">` — on iPhone, tapping that opens the native Photos picker with multi-select. This is the simplest, most reliable mobile-web path.

Flow:
1. Big "Upload from Photos" button on the new tab
2. On select: show all chosen photos in a preview grid with thumbnails + per-photo deselect checkboxes
3. On commit: iterate files, run `normalizeImageForUpload(f)` on each (HEIC → JPG), upload to `style-references/{artistId}/{uuid}.jpg`, insert one `character_features` row per photo with `feature_type='style_reference'`
4. Show progress (X of Y uploaded) — at 100 photos × 1-5 MB each, the user is waiting 30-60 seconds; make it feel like progress, not a stall
5. After upload, the library grid populates with thumbnails

Library view:
- Grid of all `style_reference` rows for this artist
- Multi-select mode (checkbox UI like iOS Photos)
- Bulk delete
- "Train Style LoRA from Selected" button → kicks Phase 2 (or all if none selected)

Mobile-first sizing throughout — Fendi's primary use case is his phone. Tap targets >44px. Grid scrolls cleanly with 100+ thumbs (lazy load via `loading="lazy"`).

### Photo selection guidance (UI hint, optional)

Add a small helper note in the upload modal: "For best results: pick 25-50 photos showing your full body or three-quarter shots in varied outfits, poses, and lighting. Full body matters more than face — your existing face LoRA already has that covered. Different jackets, shirts, pants, shoes. Casual and dressed-up. Standing, walking, sitting."

This is critical context — without it Fendi might upload all chest-up selfies again and we'd just recreate the same LoRA bias.

Commit: `feat(library): add Style References tab with bulk photo upload and HEIC transcode`.

## Phase 2 — Personal style LoRA training trigger

When the user clicks "Train Style LoRA from Selected" (or "Train from All"):

1. Collect the selected photos' signed URLs (or public URLs since the bucket is public — your call)
2. Fire a Fal `flux-lora-fast-training` job. The pattern was used to train the original FENDIFROST LoRA — grep CC for `flux-lora-fast-training` or `fast-training` to find the existing call shape. The training endpoint takes a list of image URLs and a trigger word.
3. The training call is async — Fal returns a request_id, you poll until complete (similar to the look generation polling we already do). Training takes 2-3 minutes and costs ~$3.
4. On completion, Fal returns the LoRA URL (a `.safetensors` file).
5. UPDATE the artist row's `identity_profile_json.lora` with the new LoRA URL. Suggested: store both old and new — `identity_profile_json.lora_legacy_face` (the current face LoRA) and `identity_profile_json.lora` (the new v2). Easy rollback if v2 underperforms.
6. Update the trigger word too if it makes sense — suggest `FENDIFITS` for the new LoRA so the system can tell them apart in prompts. Or keep `FENDIFROST` for prompt consistency.
7. UI: show training progress in a card, link to the new LoRA's first preview image once training finishes.

The training job runs on CC since CC owns Fal calls. AVT proxy sends the training request to CC; CC fires Fal; result eventually gets written back to AVT's artist row (via the async callback pattern we shipped for compose-look — same shape).

If Phase 2 is too much for one commit, ship Phase 1 first and leave Phase 2 as a TODO. The upload UI is the bottleneck for Fendi anyway — he can't train without photos.

Commit: `feat(library): wire 'Train Style LoRA' button to Fal flux-lora-fast-training and persist new LoRA on artist row`.

## Cursor execution (2026-05-24)

**Repo:** `fendifrost-dot/ai-video-tool` (AVT) + `fendifrost-dot/fendi-control-center` (CC training)

### Before deploy (Lovable schema — user/Claude)

Run the terse schema ask in the AVT Lovable project (CHECK constraint + `style-references` bucket). Migration file also added: `supabase/migrations/20260524120000_style_references.sql`.

### AVT env to set

- `TRAIN_STYLE_LORA_CC_URL` = `https://wkzwcfmvnwolgrdpnygc.supabase.co/functions/v1/train-style-lora`

### SHAs

| Repo | Phase | SHA |
|------|-------|-----|
| **ai-video-tool** | 1 — Style References UI + upload | `60ceac5` |
| **ai-video-tool** | 2 — Train Style LoRA proxy/callback | `ac96089` |
| **fendi-control-center** | 2 — `train-style-lora` Fal worker | `9bc1916` |

## After push

Send me the SHAs and which commits represent which phase. I'll:
1. Trigger AVT Lovable redeploy + frontend publish
2. Verify the new tab appears on the live site
3. Hand back to Fendi to upload his photos
4. Once he's trained the new LoRA, re-run the failing case smoke test through `lora_segmented_inpaint` and report honestly whether the new LoRA produces a full-body Stage 1 image and whether the segmentation chain finally completes the layered outfit.

## Out of scope for this handoff

- Don't refactor or touch the compose-look pipeline (`lora_segmented_inpaint` still failing at the LoRA layer is the next-after-this thread).
- Don't ship the Instagram Graph API integration (we explicitly scrapped that direction).
- Don't change existing auth, RLS, or wardrobe/accessories/locations/props.
- Don't try to "fix" the existing face LoRA — we're training a new one alongside it.

## If anything in this brief is ambiguous

Ask me. Especially:
- Schema choice (extend `character_features` vs new table) — I went with extending; ask if you prefer a new table
- Whether to overwrite or preserve the current LoRA URL on training success
- The training trigger UI placement (in the new tab vs a separate "Train" page)

I'd rather you ask and pause than ship a half-resolution choice.
