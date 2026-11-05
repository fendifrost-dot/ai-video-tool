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
   - **Frame rate (rule, 24 Oct 2026):** the script motion-interpolates the swap to the source's frame rate before anything else whenever the two differ (`scripts/edit/swap_rate.py`, ffmpeg `minterpolate` mci; the file is written to `<out_dir>/swap_at_source_rate.mp4`). VERIFIED on c044: a 22.2 fps swap paired frame-for-time inside a 59.94 fps source held the clothes still for two frames in three (torso frame-to-frame diff 0.3 / 0.4 / 13.4 …) while the face and hands moved every frame, and a model that copies the clip's motion copied that stutter as robotic movement; interpolated first, no near-zero-motion torso frames remain (67 → 0 of 239) and the face proof stays 0. `AVT_SWAP_INTERPOLATE=0` disables it for diagnosis only.
3. **Genjutsu reference order** (as Dress sends them; c033 job `c817d489`, outfit `YSL_JACKET` v2, prompt `dress-v1`):
   1. jacket
   2. cap
   3. jeans
   4. glasses

   The body-only step keeps his **own glasses**, because they sit inside the protected face. The outfit's glasses reference has no effect on the final, by design.

## Masks and settings (the script, in order, per original frame)

| Step | What | Setting |
|---|---|---|
| Time | Original frame at `t` takes the swap frame at `t` | nearest frame of the swap AFTER it is interpolated to the source's rate (swap_rate.py); the clothes update every source frame |
| Align | Swap frame → original frame | ECC, `MOTION_AFFINE`, at ¼ scale, on the original's background mask; 200 iterations, eps 1e-5, Gaussian 5. Applied with `WARP_INVERSE_MAP` and `BORDER_REPLICATE`. One fit per swap frame. |
| Labels | Both frames | MediaPipe multiclass: 0 background, 1 hair, 2 body skin, 3 face skin, 4 clothes, 5 accessories |
| Face shape | Original frame | landmark face oval, dilated 9×9, cut at the brow line (brow landmarks minus 4 % of face height). Searched in x 10–95 %, y 5–65 % of the frame and, with `AVT_HEAD_ZOOM`, on an enlarged crop around each of the three largest face-skin regions. **Per scene** (`scripts/edit/face_track.py`, 1 Nov 2026): the subject is the face whose clothes the swap changed (torso-box share of changed pixels), never the largest face; detections off the scene's median are dropped; frames without one take the nearest kept detection of the same scene with interpolated brow/eye rows; scenes never borrow from each other. |
| Taken from the swap | | clothes/accessories (4, 5) in either frame. Above the brow line: hair/accessory in either frame, and any non-background pixel in a box over the head (face width ± 0.35 × face height, up to 0.9 × face height above the brows). **The new hat** (1 Nov 2026): a swap pixel labelled hair/accessory/clothes inside the head box (face width ± 0.5 × face height, 0.9 × face height above the brows to 0.8 × below the eyelids) also wins in the brow-to-eyelid band and, below the eyelids, outside the face oval grown 6 % — a bucket brim over the temples and beside the ears, whatever the original shows there; the hat zone ends exactly where his protected face begins (no margin: a margin left a strip of scene between brim and cheek, 2 Nov 2026). Hat membership is by label (accessory/clothes; hair only when hat-coloured) or by hat chroma (|Δa|+|Δb| < 12 to the hat's median Lab, L below the hat's L + 50) and dark — with NO 'changed' gate (2 Nov 2026: over the forehead the old cap and the new brim are both dark and a per-pixel gate mixed the two blacks into a stepped patchwork); closed over 5 px. The cap box above the brows also takes any pixel differing from the swap by more than 20 (the old cap's rim). The painted pixel touching the protected face is mixed half with the face pixels beside it (the matte's anti-alias against his face). A scene opening under a flared brim where the swap shows its own jaw is legitimate and stays. The swap's skin outside the oval where the original is scene (its head drawn wider than his) is refilled from the hat and taken with it (2 Nov 2026). The overshoot band (strong change within 15 px of him) never applies within 30 % of the face height around the oval, and on a re-rendered scene (far background changed on >10 % of pixels) only where a segmenter sees him. |
| Head fit | OFF by default | `scripts/edit/head_fit.py` is opt-in (`AVT_HEAD_FIT=1`) and NOT recommended: measured on c041 v2 (2 Nov 2026) its per-row shift moved 2–6 px between consecutive frames with 8–11 px spikes and morphed the hat, and its driving edges were the brim's occlusion, not the face outline. The hat is Genjutsu's own, taken rigidly from the scene-aligned swap; the head-size mismatch is handled at the composite boundary only. Check every put-back with `scripts/edit/ring_flicker.py` (seam/flicker) AND `scripts/edit/hat_geometry.py` (hat shape per frame against the raw swap) before posting. |
| Always original | | face shape; face skin (3) and hair (1) below the brows; body skin (2) where the swap also shows skin (2) — the region's outer 4 px tightened to his real silhouette by colour (`scripts/edit/silhouette.py`, 2 Nov 2026: the labels overshoot by 1–3 px and kept a thread of scene beside the hat); the feather is computed with the face counted as covered so the hat's alpha is not diluted against it — none of it where the new-hat rule above applies, which never enters the face oval below the eyelids. |
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

### Second approved result: c041 TENTH, black leather bucket hat (approved 4 Nov 2026)

Fendi, 4 Nov 2026: "C041 can pass but there's still slight drift in the bucket hat but it's hardly noticeable we can
keep it." The drift is the raw Genjutsu swap's own geometry wobble on the wide shot (frames 41/49/51/52 of the 24 fps
master), not the put-back's; accepted as rendered. Script at `f92a169` (`AVT_HEAD_ZOOM=4`, head fit off).

| Role | Asset | Storage | sha256 |
|---|---|---|---|
| Take (recipe-F b-roll, song 72.33 at frame 0) | `7b89d99f-fcb5-4bbb-b93b-c0ba68ec5e59` | project-clips | `1c55946d…d57d8f03e` |
| Genjutsu object swap, conformed (intermediate) | `6f2e6dfb-f44e-44c3-bb80-4bb64352be6c` (job `ce147dcc`) | project-clips | `ab46e73f…fdb9b69a` |
| **Approved final, c041 TENTH** (720×1280, 24, 97 frames, song muxed at 72.33; `approval_status` approved; **primary on shot c041**) | **`6f4edd50-90e1-4d1b-a1d8-297c14b14698`** | project-exports `…/canonical/body_only_swap_c041_2026-11-03/` | `b7f2d177…3f5422e7` (video stream md5 `36dcc2283718`, = silent render `670734ed340d`) |

Evidence trail: `docs/handoffs/HANDOFF_BLENDER_SHOWROOM_2026-10-19.md`, rounds 8–11 (crown strand, front brim, hat
motion, temple, right underside, scope of the cap-box rule; eighth `85e632f` and ninth `a5e948a` reproducible).

## Run on a new take (the run-book, added 5 Nov 2026)

Everything above is the record of what was approved. This is the order of operations for the next shot. Two lanes:
**A** when he fills the frame (a 720p montage render, or a take cut where he is large), **B** when he is a small figure
in a wide 4K take (c044, 23 Oct: Genjutsu re-stages a small person ~2.5x larger, so the swap is made on an enlarged crop
and put back). Both end in the same put-back and the same checks. $0 after the one paid Genjutsu call.

Needs: ffmpeg; a Python with numpy, opencv-python, mediapipe (versions in the table above); the two model files in
`$AVT_MODELS` (`selfie_multiclass_256x256.tflite`, `face_landmarker.task`, copies in AVT storage at
`project-exports …/canonical/body_only_swap_c033_2026-10-18/models/`); the owner's sign-in for downloads
(`avt_signed_url` or the browser session, never pasted anywhere). Run the scripts with `python -I`.

### Lane A: he fills the frame

1. **Pick the original.** A performance take window on the shot (real footage, synced on the song) or a recipe-F
   render (`BROLL_WITH_HIM_STILL_MOUTH.md`). It is `original.mp4` from here on; its asset id is the lineage.
2. **Dress it in the tool** (the one paid step, Genjutsu object swap through Control Center, ~$0.68 per source second,
   billed in whole seconds): `avt_call` `dress-clip` with `{ "projectId", "assetId": "<original asset>", "pieceIds":
   ["<character_features ids of the garment pieces>"], "dryRun": true }`, then `false`. Pieces: the jacket or coat, the
   hat, the trousers; **leave the glasses piece out** (his own glasses sit inside the protected face and survive the
   put-back). Give each piece its picture and its construction words in positive terms (`MONTAGE_MUSIC_VIDEO_WORKFLOW.md`
   7b). The tick runner conforms the result to the original's length and files it on the shot unselected: that filed
   asset is `swap.mp4`. The raw provider file is never used.
3. **Download** `original.mp4` and `swap.mp4` with the owner's sign-in into an empty folder.
4. **Put back:**
   ```
   AVT_MODELS=<models> AVT_HEAD_ZOOM=4 python -I scripts/edit/body_only_swap.py original.mp4 swap.mp4 <out>
   ```
   It interpolates the swap to the original's frame rate first (`swap_at_source_rate.mp4`), aligns, tracks his face per
   scene, paints the garment and the new hat, and writes `<out>/c033_body_only_swap.mp4` (the output keeps that name
   on every take; rename on filing). Head fit stays OFF. `AVT_HEAD_ZOOM=4` is the setting of both approved results.
5. **Read the printout.** `max |out-original| on face/hair/skin: 0` is the proof; anything else is a failed run, never a
   result. `first face detection at frame N` should be 0 or close; per scene, the number of frames his face was found on.
6. **Measure before posting** (both $0): `scripts/edit/ring_flicker.py original.mp4 <out>/c033_body_only_swap.mp4 <a-b>`
   on the frames he is in (seam flicker: compare the candidate's number with the original's own), and, when a hat
   changed, `scripts/edit/hat_geometry.py <out>/c033_body_only_swap.mp4 <a-b>` (hat shape per frame; the approved TENTH
   reads 0.03–0.14). A face sheet (`face_check.py`, or frame tiles) is read before the clip is posted.
7. **Mux the song** at the shot's sync (`ffmpeg -i out.mp4 -ss <sync> -i song.wav -map 0:v -map 1:a -c:v copy -c:a aac
   -shortest`) and post the clip with the sheet. Fendi judges.
8. **File on his word** with `avt_upload_asset` to `project-exports …/canonical/body_only_swap_<shot>_<date>/`, then the
   `project_assets` row (`edited_clip`, `source_tool` `manual`, `metadata_json.derived_from` = method, original asset,
   swap asset, job, script commit, the proof) and the `shot_asset_assignments` primary, exactly as
   `MCP_UPLOAD_AND_FILE.md` lays out. Add the result to the approved-results table on this page with its hashes.

### Lane B: a small figure in a wide 4K take

1. **Crop.** Cut an enlarged crop around him from the 4K source for the take window (c044: 486×864 at (240, 778) on the
   2160×3840 frame), as an `.mp4` in the project's own folder in `project-clips`.
2. **Dress the crop:** `dress-clip` with `"crop": { "path": "<that .mp4>", "rect": { "x", "y", "w", "h" }, "window":
   [start, end] }` and the pieces as in lane A. The result is filed off the shot (a crop result never becomes the take).
3. **Paste back:** `python -I scripts/edit/paste_region_swap.py original_1080.mp4 crop_swap.mp4 x y w h pasted.mp4`
   (the box in 1080-scale pixels). `pasted.mp4` is lane A's `swap.mp4`.
4. **Put back** as lane A step 4, on the 1080 original.
5. **Lift to 4K:** `python -I scripts/edit/dressed_4k.py original_4k.mp4 original_1080.mp4 <out>/c033_body_only_swap.mp4
   dressed_4k.mp4` (the garment region from the dressed 1080, every other pixel the 4K original; it prints the changed
   area, 4.3 % on c044). Then lane A steps 5–8.

### Putting the dressed real him into a generated scene

When the shot is a montage with a generated him and Fendi wants his real take in its place (c044, 23 Oct: "just use my
leg on wall performance shot in place of seedance generated performance shot"): matte the montage and the dressed take
(Fal through CC, cents), then `scripts/edit/replace_him_in_clip.py clip.mp4 clip_alpha.mp4 take.mp4 take_alpha.mp4
segments.json out.mp4` with the segments (frame ranges and anchors) where he appears. Every cutaway stays the montage's
own. Record: ledger 164–175, result `21b9b341` on c044.

### Do not

- Do not take the whole-frame Dress output as the final: its face is a redraw.
- Do not run the put-back on the raw provider file: the conformed, filed asset only.
- Do not post a result whose proof is not 0, or whose ring flicker you have not read against the original.
- Do not switch `AVT_HEAD_FIT` on, or change the script, to make a shot pass: a shot that fails is a finding.

## Limitations (still true of the approved result)

- **Cap edge:** a faint navy fringe in a few frames, where the original cap is larger than the swapped one.
- **Clothing frame rate:** no longer a limitation since 24 Oct 2026 (the swap is interpolated to the source's rate first); the c033 result above (18 Oct) predates the rule and still updates its clothes at 22.25 fps.
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

## Physical placement in Blender (19 Oct 2026): the next step on the approved result

Fendi approved the 18 Oct showroom composite as the working baseline and asked for Blender placement.

**Full write-up:** [`docs/research/results/2026-10-19-blender-showroom/BLENDER_SHOWROOM_C033_2026-10-19.md`](../research/results/2026-10-19-blender-showroom/BLENDER_SHOWROOM_C033_2026-10-19.md)

- **The take is framed thighs-up.** So in a room shot something must hide him below the hips: here, the island.
- **Placement:**
  - He stands behind its far edge, about 0.2 m from the stone.
  - That is 4.42 m from the plate camera, which is measured from the picture: 29 mm equivalent, level, 1.65 m high.
  - The penguin is 1.5 m behind-left of him.
  - Scale: his stated height (6 ft 3 in) and a room scaled 0.95 (his direction; island 0.865 m, penguin 1.21 m).
- **His pixels** are the approved file's: rolled 1.23° level, scaled, colour-graded from measured light. Never redrawn.
- **Scripts:** `scripts/edit/blender/` (scene file `showroom_c033.json`); `scripts/edit/reproduce_c033_showroom_blender.sh` rebuilds any version from stored assets at $0.
- **The room moves without generative video (room v5, Fendi 19 Oct: the Kling room motion "looks AI generated and antithetical to our whole approach").**
  - The room is a frozen still split into layers.
  - Blender renders the snow; fixed, seeded curves move the branches, the penguin (its own pixels) and the LED light (a rolling-shutter band).
  - Objects are refitted by measurement. The Ferrari was shrunk to its spec height on the same spot.
  - Do not animate a room plate with an image-to-video model for this lane.
- **Versions:** `static` (the plate's matched camera), `dolly` (0.20 m push-in), `tight` (the same camera on a 1.6× lens).
- **Asset IDs:** the write-up's asset table. All are unassigned and await Fendi's eye.

## Superseded guidance

- **Any instruction that files or uses a whole-frame Dress output as the final performance picture.** That covers `WARDROBE_SWAP_RECIPE.md` ("The recipe" / "How to run it") and `DRESS_AND_INSERT_WORKFLOW.md` step 5. Dress output is now an **intermediate**; the final is its body-only put-back.
- **The 15 Oct recipe's open item, "face check on fast motion" / face softening.** It is resolved by keeping the original face.
- **"Face paste-back with alignment"** (Claudia's 18 Oct handoff, c028 test): replaced. The face is never moved or redrawn, so there is nothing to paste back.

Evidence: `docs/research/results/2026-10-18-body-only-swap/BODY_ONLY_SWAP_TEST_2026-10-18.md`.

## Segmenter flag (23 Oct 2026, opt-in, not part of the approved recipe)

`body_only_swap.py` and `replace_him_in_clip.py` take `--segmenter {mediapipe,sam3}` (env `AVT_SEGMENTER`). The default
is `mediapipe`, the path above, byte-identical. `sam3` takes the person region from a SAM 3 text-prompt matte
(`scripts/edit/segmenters.py`; weights gated at https://huggingface.co/facebook/sam3, token from `HF_TOKEN`) and falls
back to a SAM 3 face mask when the landmarker finds no face. The face-protection proof (`max |out-original| on
face/hair/skin: 0`) is printed either way. Status and the c044 before/after:
`docs/research/results/2026-10-23-sam3-person-masks/SAM3_PERSON_MASKS_2026-10-23.md`. Until Fendi approves a SAM 3
put-back on real footage, the approved recipe stays the MediaPipe path.

