# Lens look and shoot guide

Asked for by Fendi, 25 Nov 2026: "a camera lens emulator for my iPhone for when I shoot videos or … an emulator
effect built into AVT to instantly replicate a lens/distance/camera".

**Status.** The 85 mm f/1.8 look on the Hyenas close-up (one background plane) was judged by Fendi on 25 Nov 2026:
asked "Does the 85 mm clip look right to you?", he answered yes. The depth-map version was posted the same day and
is NOT yet judged. `PROBLEM_INDEX.md` has no row for this: the index is at 9,497 of the 9,500 characters its hook
test allows, so a row needs someone to decide what leaves it.

Two tools, both $0 and deterministic:

| Tool | When | What it does |
|---|---|---|
| `scripts/edit/shoot_guide.py` | before the shoot | For a target lens and framing: which phone lens, how far back, how high, how sharp the result will be, how far the background should be. Prints a shoot card. |
| `scripts/edit/lens_look.py` | last step on a finished clip | The target lens's background blur in real units (focal length, f-stop, distances), then the lens character from `lens_presets.json`. The depth-map mode uses a local depth model for distances; nothing is drawn by a model. |

## What a lens look is made of

| Part | Where it is set | Label |
|---|---|---|
| Perspective (shape of a face, how close the background feels) | **at the shoot**, by the camera's distance and nothing else. `shoot_guide.py` gives the distance. `lens_look.py` does not change it. | VERIFIED (optics) |
| Field of view | a crop of the 4K file (`--mode same_position`). Longer only; a wider view than was shot does not exist. | VERIFIED |
| Depth of field | `lens_look.py`: thin-lens blur disc from focal length, f-stop and distances, minus the blur the phone already gave. Distances come from one plane (`--background-m`) or a depth map (`--depth`). | blur size VERIFIED against the formula in tests; HYPOTHESIS that it matches a photograph through that lens until one is shot side by side; with `--depth` the distances between the two given ones are the model's ESTIMATE |
| Lens character (distortion, flare, halation, chromatic aberration, vignette, contrast, grain) | `camera_engine.lens_post`, unchanged, with the five presets in `lens_presets.json` | OBSERVED (in use since 1 Oct 2026 on camera moves) |
| Camera colour | not built. The iPhone 14 has no Log mode. | — |

Changing the perspective of a take after the shoot means redrawing him. That is not ruled out (Fendi, 25 Nov 2026:
"redraw of me is fine if we can redraw my exact pixels back onto my face or the face passes the same rating as a
redraw or original pixels"), but it is a paid generation with its own checks and is not part of these tools.

## The phone (VERIFIED from his takes' metadata: iPhone 14)

- Two lenses: 0.5x and 1x. No telephoto: 2x and beyond is a crop of the 1x camera, the same crop `lens_look.py` makes.
- From a 4K take delivered at 1080 wide, the 1x camera carries lens looks up to about **56 mm** at full sharpness.
  85 mm leaves 712 of the phone's pixels across the frame: soft.
- Its own background blur is close to none at these distances, so the blur comes from `lens_look.py`.
- Values and their labels: `scripts/edit/phone_cameras.json`.

## Shoot card

```bash
python3 scripts/edit/shoot_guide.py --lens 50 --framing waist_up --f-stop 1.8
```

Framings: `face`, `chest_up`, `waist_up` (default, SHOT_RULES 7), `thighs_up`, `knees_up`, `full_body`.
`--orientation horizontal` for 16:9. `--tilt-deg 10` for a low angle. `--lens` takes millimetres or a preset name.
The distance on the card does not depend on the phone's own lens value (tested): it is the target lens times the
height in frame. Still air, the wall and the light rules for a take that gets a swap are in the build skill §3 and
are not repeated on the card.

## Lens look on a finished clip

```bash
python3 scripts/edit/lens_look.py --src take.mp4 --alpha alpha.mp4 --out look.mp4 \
    --lens portrait_85 --f-stop 1.8 --subject-m 0.91 --background-m 1.6 \
    --compare side_by_side.mp4 --sheet sheet.jpg
```

- `--mode same_framing` (default): the framing stays; the blur is what the target lens gives once the camera has
  backed off until the framing matches. `--mode same_position`: the camera stays; the view is cropped.
- The matte pairs with the picture frame by frame; a different frame count is refused (PROBLEM_INDEX, "a strip of
  the take's white wall inside his outline").
- The blur's source excludes him and a 3-pixel ring round him (a normalised convolution), so no dark rim of him
  spreads into the background. Under his soft edge the sharp background is swapped for the blurred one.
- Printed proof on every run: `max |out - source| inside his matte, before the lens character: 0`. The run fails
  if it is not 0. The lens character then finishes the whole frame, him included, as a lens does.
- A sidecar `look.mp4.json` records the settings, the distances, the input hashes and the commit.
- **Run it last.** The swap, the cut-out and the put-back need the sharp picture.

### A background at many distances: `--depth`

```bash
AVT_DEPTH_MODEL=/Volumes/T7/AVT_MODELS/depth_anything_v2_small.onnx \
python3 scripts/edit/lens_look.py --src take.mp4 --alpha alpha.mp4 --out look.mp4 \
    --lens portrait_85 --f-stop 1.8 --subject-m 0.91 --depth --far-m 2.5
```

- The model (Depth-Anything-v2 small, ONNX, CPU; the one `camera_engine.plate_depth` uses) gives distances only and
  draws nothing. It is on the T7, sha256 `afb6a5c2…a1df10c`, 99 MB (Fendi okayed the download, 25 Nov 2026).
- It gives relative depth, so two distances tie it to metres: `--subject-m` (camera to him) and `--far-m` (camera to
  the farthest thing in the picture; omit for "far away").
- ONE depth map per clip, so the blur cannot flicker. A camera that moves is refused (the background's shift across
  the samples is measured on points outside his matte; over 2 px stops the run). Per-frame depth is not built.
- **The model never sees him.** Run on a frame with him in it, its depth is soft at his outline and leaves a ghost of
  him in the wall's blur (seen on the first try, 25 Nov). The map is taken from the scene with him removed
  (`clean_plate`: the median of the frames where he is not, filled in where he always stands); his own distance is
  carried over by a straight-line fit on the pixels far from him.
- A scene without him: no `--alpha`; `--focus-at x,y --subject-m D` says what is in focus and how far it is.
- The blur map is saved next to the output (`look.mp4.blurmap.jpg`): look at it before trusting the picture.

## Tests on real footage, 25 Nov 2026

All outputs: T7 `/Volumes/T7/_avt_work/lens_look_2026-11-25/`. Take: Hyenas close-up window
`closeup_2026-11-14/v26/hyenas_3ft_v25.31_96f_1080.mp4` with its existing matte `alpha.mp4` (96 frames, 1080x1920).
Camera to him 0.914 m (the take's "3 ft"); camera to the wall 2.5 m (ESTIMATE from the floor line in the 5 ft take,
about ±25 %).

| Run | Blur applied | Proof | Read | Fendi |
|---|---|---|---|---|
| `portrait_85` f/1.8, one plane 1.6 m behind him | 27.5 px disc everywhere | 0 | wall softened, outline clean at cap, beard, shoulders, hands; the floor is blurred as much as the wall (too much) | "yes" (looks right) |
| `portrait_85` f/1.8, `--depth --far-m 2.5` | 15 to 27 px by distance (background read as 1.6 to 2.5 m) | 0 | the floor near the camera stays sharper; the wall above the quilt blurs more than the quilt; no ghost of him in the map | not yet judged |
| `anamorphic_35` f/2, one plane | 16.0 px, oval | 0 | **fault, not sent**: the preset's flare fires on his white jersey stripes and smears bright bands across the wall | — |
| Garage car shot `IMG_6496.mov` 10–14 s, no him, `clean_50` f/1.4, 50 mm crop, focus on the Jeep at 8.5 m, far 40 m (both ESTIMATES) | 0.1 to 8.4 px | n/a | depth map reads cars, pillar, far garage and hood correctly; the visible change is mild, as the optics say for a focus at 28 ft | not sent as a look |

Flicker, blur-only pass against the source (mean frame-to-frame change, 8-bit levels, OBSERVED):

| Region | Source | One plane | Depth map |
|---|---|---|---|
| ring 4–16 px outside him | 0.66 | 0.67 | 0.60 |
| background far from him | 0.42 | 0.25 | 0.25 |
| inside him | 15.59 | 15.55 | 15.55 |

Neither pass adds flicker at his outline.

## Known limits (so no agent pretends otherwise)

1. **`--depth` needs a locked-off camera.** A moving camera is refused; use `--background-m` or a still stretch.
2. **Between the two given distances the depth is the model's guess.** On the Hyenas take it reads the quilt's right
   side as nearer than its left; that fits the picture (the quilt's top edge rises to the right) but is not measured.
3. **The flare in `lens_post` reads any bright area as a light**, so white clothing flares. Fix belongs in
   `camera_engine.lens_post` (flare from small bright sources only) as its own pass.
4. **The oval bokeh here is tall** (as anamorphic glass gives); `camera_engine.dof_levels` stretches its blur
   sideways. OBSERVED, left alone.
5. Things nearer than him are blurred inside the background layer only; they do not spread over him.
6. Scripts only. Not in the app, not a render-worker job.
7. Not compared with a real lens. A side-by-side with a real 50 mm or 85 mm photograph of the same set-up would
   move the blur from HYPOTHESIS to VERIFIED.
