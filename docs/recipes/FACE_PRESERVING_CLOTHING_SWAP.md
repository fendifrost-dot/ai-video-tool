# Face-preserving clothing swap: the CANONICAL method (approved 18 Oct 2026)

**This is the reference for changing Fendi's clothes on a real performance take while keeping his real face and mouth.**
Any wardrobe change on footage of Fendi goes through this method. Guidance elsewhere that treats a whole-frame Dress
output as final is **superseded** (see the list at the end).

Approval: **Fendi approved the c033 BODY-ONLY result on 18 Oct 2026** ("make it the canonical reference for preserving
my real facial performance during clothing swaps"). The limitations below still stand; they were not part of what was
approved away.

## What it does

1. **Swap.** Genjutsu object-swap dresses the whole frame. Its face is a redraw (shifted ~15 px, re-rendered).
2. **Put back.** The garment is composited over the ORIGINAL frames, and nothing else is taken from the swap:
   - the face from the eyebrows down (eyes, glasses, nose, mouth, beard);
   - face skin and hair below the brows;
   - skin wherever the swap also shows skin (hands, neck).

   These stay the original pixels. The mouth, its timing and every syllable are the take's own.

## Version

| | |
|---|---|
| Script | `scripts/edit/body_only_swap.py`, commit `a211451`, sha256 `7d92ecea700c00961eea50e348f52dfd0a149ea12c1f48032addcea26a6ea18d` |
| Reproduce | `scripts/edit/reproduce_body_only_c033.sh` (checks every input hash, reruns, compares decoded frames) |
| Segmenter | MediaPipe `selfie_multiclass_256x256.tflite`, sha256 `c6748b12…507e0e0` (copy in AVT storage, below) |
| Face shape | MediaPipe `face_landmarker.task`, sha256 `64184e22…4e0bc9ff` (copy in AVT storage) |
| Tested with | Python 3.13, OpenCV 5.0.0, MediaPipe 1.1.1, NumPy 2.5.4, ffmpeg 6.1.1 |

## Inputs and order

1. **Source cut of the real take** (the exact file sent to Genjutsu): 1080×1920, 59.94 fps, silent. It is cut from the hero take with handles, as Dress cuts it today.
2. **Genjutsu object-swap output** for that cut, **conformed** to the source's length.
   - **Conform:** container timescale. c033: the provider returned 89 frames / 3.708 s; ×1.078652 gives 4.000 s at 22.25 fps.
   - **Order:** the conformed file goes into the script; the raw output never does.
3. **Genjutsu reference order** (as Dress sends them; c033 job `c817d489`, outfit `YSL_JACKET` v2, prompt `dress-v1`):
   1. jacket
   2. cap
   3. jeans
   4. glasses

   The body-only step keeps his **own glasses**, because they sit inside the protected face. The outfit's glasses reference has no effect on the final, by design.

## Masks and settings (the script, in order, per original frame)

| Step | What | Setting |
|---|---|---|
| Time | Original frame at `t` takes the swap frame at `t` | nearest frame; the swap's clothes update at 22.25 fps |
| Align | Swap frame → original frame | ECC, `MOTION_AFFINE`, at ¼ scale, on the original's background mask; 200 iterations, eps 1e-5, Gaussian 5. Applied with `WARP_INVERSE_MAP` and `BORDER_REPLICATE`. One fit per swap frame. |
| Labels | Both frames | MediaPipe multiclass: 0 background, 1 hair, 2 body skin, 3 face skin, 4 clothes, 5 accessories |
| Face shape | Original frame | landmark face oval, dilated 9×9, cut at the brow line (brow landmarks minus 4 % of face height). Searched in x 10–95 %, y 5–65 % of the frame. Frames before the first detection reuse the first detection. |
| Taken from the swap | | clothes/accessories (4, 5) in either frame. Above the brow line: hair/accessory in either frame, and any non-background pixel in a box over the head (face width ± 0.35 × face height, up to 0.9 × face height above the brows). |
| Always original | | face shape; face skin (3) and hair (1) below the brows; body skin (2) where the swap also shows skin (2). |
| Blend | | taken mask, Gaussian σ 2 px, then forced to 0 on the protected pixels: no feather reaches the face or hands |
| Proof | printed | `max \|out − original\|` over the protected pixels. It must be 0, measured before encode. |
| Encode | | OpenCV mp4v intermediate, then libx264 CRF 16, yuv420p, faststart |

## Reproduce (no provider, $0)

```
IN=<folder with src.mp4 and swap.mp4 [and song.wav]>  MODELS=<folder with the two model files>  OUT=<folder> \
PY=<python with numpy/opencv/mediapipe>  scripts/edit/reproduce_body_only_c033.sh
```

The script fetches nothing itself: download the files below with the owner's sign-in, and never paste a signed URL.
It refuses any input whose sha256 differs. It prints the face proof (0) and compares the decoded frames with the approved final (`5f268d20fa6a440487ccfa8bbcab4dd4`).
**VERIFIED 18 Oct:** it reproduces the approved final bit for bit, starting from the AVT copies.

## Private AVT assets (project YSL `764a63d2`)

| Role | Asset | Storage | sha256 |
|---|---|---|---|
| Hero take (original 4K → 1080 trim, video only) | `70304981-d375-47a9-81df-aa062c62c6ec` | project-clips | — |
| Source cut sent to Genjutsu (take 56.056–60.056, song 56.9098 at frame 0) | `c45e30c6-1922-4ca2-8e61-ca3852f5741e` | project-clips `…/dress/storyboard_c033_1792225065163_src.mp4` | `a26da488…46b2bd63` |
| Genjutsu output, conformed (intermediate) | `5a81d308-948d-4884-954d-a486f1b8811a` (job `c817d489`) | project-clips `…/c817d489…/generated_higgsfield_f8f3d704-bd8.mp4` | `9b5b54a0…9d17a25f` |
| **Approved final, c033 BODY-ONLY** (1080×1920, 59.94, 240 frames, silent; `approval_status` approved) | **`5482b35b-a4e6-4ad6-90a2-852afa01d87c`** | project-exports `…/canonical/body_only_swap_c033_2026-10-18/` | `636cb1f9…4e789d2b` |
| Approved comparison (original \| Genjutsu \| body-only, song at 56.9098) | `b8887a31-a640-42dc-a39d-e7fe1ccee05a` | same folder | `4f87b2a5…2556829b` |
| Model files | storage only | same folder, `models/` | as above |
| Album master (comparison audio) | `067a4cbf-6fd0-4601-9111-df1119c52fa6` | — | — |

None of these is assigned to a shot. The board and the Cut are unchanged.

## Limitations (still true of the approved result)

- **Cap edge:** a faint navy fringe in a few frames, where the original cap is larger than the swapped one.
- **Clothing frame rate:** the clothes update at the swap's 22.25 fps (each swap frame held for ~2.7 source frames). Watch the sleeves at 1×.
- **Background:** where the new garment's outline differs from the original, the swap's regraded background shows. It disappears once the background is replaced.
- **Garment rebuild:** the garment itself is still Genjutsu's rebuild, so its construction holds as well as Genjutsu holds it. Judge stripes and logos per shot.
- **Framing:** works on full-body framing because the face search region is wide. A face that leaves the frame or turns fully away falls back to the last detection.
- **Not in the app** (see the next section).

## Integration gap: AVT's Dress workflow does NOT use this method (18 Oct 2026)

- **Dress** ("Dress this shot", `supabase/functions/dress-clip`, `docs/recipes/DRESS_AND_INSERT_WORKFLOW.md` step 5):
  - It files the **whole-frame Genjutsu output**, conformed, as the dressed take.
  - That file's face is Genjutsu's redraw.
- **Region swap** (`src/lib/regionSwap/*`, `RegionSwapPage`):
  - It swaps a user-drawn box and pastes the swapped box back over the original.
  - Anything inside the box, the face included, is the swap's. Nothing protects the face.
- **This method runs only as an offline script** today.
- **To close the gap** (not built):
  - add a "put back body-only" step after the Dress job is conformed;
  - run it on the AVT ffmpeg worker, or in the browser like the region swap's composite-back;
  - file the result as the dressed take, with the face proof recorded on the asset;
  - until then, run `scripts/edit/body_only_swap.py` by hand on each dressed take.

## Moving environment on the approved result (18 Oct 2026, first pass)

The approved body-only file is put into a moving AI location **without another generative pass over him**.

1. **Matte:** `matte-video-proxy` (Fal `veed/video-background-removal`, separate H.264 alpha) on the approved final, job `c107ccc4`.
2. **Moving plate:** "Animate the plate" (Kling 2.5 turbo pro i2v, 5 s, locked-off prompt `plate-motion-v5-2026-10-17`) from the showroom still `d4da62ba`, job `31d3113c`. Penguin, snow and a passing train; nobody in the centre foreground.
3. **Composite:** `scripts/edit/composite_over_plate.py`, an offline port of the app's composite recipe (`src/lib/composite/pixels.ts`, `plate-composite-v3-2026-10-16`). Settings: scale 0.9, bottom-anchored, matte centre at x 620, exposure 0.85, shared push-in 2 % on the finished frame, plate from 1.0 s, grain seed 33.

**Reproduce from existing assets, $0:**

```
IN=<folder with fg.mp4, alpha.mp4, plate.mp4 [and song.wav]>  OUT=<folder>  PY=<python with numpy/opencv> \
  scripts/edit/reproduce_c033_showroom.sh
```

It refuses any input whose sha256 differs and compares the decoded frames with the filed composite (`3143ac1fb70ce5c49c1f4796bbecc962`).

| Role | Asset | Storage | sha256 |
|---|---|---|---|
| Foreground = approved final | `5482b35b-a4e6-4ad6-90a2-852afa01d87c` | project-exports `…/canonical/body_only_swap_c033_2026-10-18/` | `636cb1f9…4e789d2b` |
| Matte alpha (job `c107ccc4`) | `b162d95d-c1da-4246-9098-283073e564a2` | same folder, `environment_showroom/` | `77d7cdb7…b224e375` |
| Matte colour (not used) | `4bd4674b-f4fd-4b3d-8aa7-31e85e54b4d4` | same | `8f7ad738…7a217eae` |
| Moving plate (job `31d3113c`, from still `d4da62ba`) | `21d1bc9c-0e0c-4ab5-a4a6-8cf4763d0c38` | project-clips `…/31d3113c…/generated_higgsfield_a2ef72a2-498.mp4` | `c17b3e8e…d1bfdc7f` |
| **Composite** (1080×1920, 59.94, 240 frames, silent) | **`8a527bab-8090-4347-af03-2f7a31127436`** | project-exports `…/environment_showroom/` | `a637e73f…d1ee672a` |
| Review: approved body-only \| composite, song at 56.9098 | `e96bb0bc-35ec-48be-98fc-77f8e675566e` | same | `2838029f…6cc420fa` |

None of these is assigned to a shot. The composite awaits Fendi's eye; the c033 BODY-ONLY approval is unchanged.

**What holds and what does not:**

- **VERIFIED:** the composite reproduces bit for bit (decoded MD5) in two renders, the second by the reproduce script starting from fresh downloads of the AVT copies.
- **DECISION:** his pixels come from the approved file. The recipe changes their **colour** (key gradient, grade, exposure 0.85, edge wrap, grain) and their **placement** (scale 0.9 and the shared push-in, for him and the plate together). It never redraws them, so mouth timing and identity are the approved take's. It is no longer pixel-identical to the approved file: the zero-difference face proof belongs to the body-only file, not to the composite.
- **OBSERVED:**
  - edges clean on the frames checked;
  - Kling's plate brightens and shifts hue during the shot (blue, then red from the car and the train); his light stays fixed, so he does not react to it;
  - he stands in front of the island, with no contact shadow on the floor;
  - his feet are out of frame, so there is no floor contact to judge.
- **Not in the app:** the app's "Composite over plate" press takes the shot's dressed take as its foreground. A body-only file that is not on a shot cannot be pressed there yet. It is the same integration gap as above.

## Superseded guidance

- **Any instruction that files or uses a whole-frame Dress output as the final performance picture.** That covers `WARDROBE_SWAP_RECIPE.md` ("The recipe" / "How to run it") and `DRESS_AND_INSERT_WORKFLOW.md` step 5. Dress output is now an **intermediate**; the final is its body-only put-back.
- **The 15 Oct recipe's open item, "face check on fast motion" / face softening.** It is resolved by keeping the original face.
- **"Face paste-back with alignment"** (Claudia's 18 Oct handoff, c028 test): replaced. The face is never moved or redrawn, so there is nothing to paste back.

Evidence: `docs/research/results/2026-10-18-body-only-swap/BODY_ONLY_SWAP_TEST_2026-10-18.md`.
