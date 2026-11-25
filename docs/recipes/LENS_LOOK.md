# Lens look and shoot guide

Asked for by Fendi, 25 Nov 2026: "a camera lens emulator for my iPhone for when I shoot videos or … an emulator
effect built into AVT to instantly replicate a lens/distance/camera".

**Status: first version, NOT yet judged by Fendi.** No row in `PROBLEM_INDEX.md` until he approves a result.

Two tools, both $0, deterministic, no model:

| Tool | When | What it does |
|---|---|---|
| `scripts/edit/shoot_guide.py` | before the shoot | For a target lens and framing: which phone lens, how far back, how high, how sharp the result will be, how far the background should be. Prints a shoot card. |
| `scripts/edit/lens_look.py` | last step on a finished clip | The target lens's background blur in real units (focal length, f-stop, distances), then the lens character from `lens_presets.json`. |

## What a lens look is made of

| Part | Where it is set | Label |
|---|---|---|
| Perspective (shape of a face, how close the background feels) | **at the shoot**, by the camera's distance and nothing else. `shoot_guide.py` gives the distance. `lens_look.py` does not change it. | VERIFIED (optics) |
| Field of view | a crop of the 4K file (`--mode same_position`). Longer only; a wider view than was shot does not exist. | VERIFIED |
| Depth of field | `lens_look.py`: thin-lens blur disc from focal length, f-stop, camera-to-him and him-to-background, minus the blur the phone already gave. | blur size VERIFIED against the formula in tests; HYPOTHESIS that it matches a photograph through that lens until one is shot side by side |
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

## First test, 25 Nov 2026 (OBSERVED; waiting on Fendi)

Take: Hyenas close-up window `closeup_2026-11-14/v26/hyenas_3ft_v25.31_96f_1080.mp4` with its existing matte
`alpha.mp4` (96 frames, 1080x1920). Camera to him 0.914 m (the take's "3 ft"); him to the wall 1.6 m (ESTIMATE from
the floor line in the 5 ft take, about ±25 %). Output: T7 `/Volumes/T7/_avt_work/lens_look_2026-11-25/`.

| Look | Blur applied | Proof | Read |
|---|---|---|---|
| `portrait_85` at f/1.8 | 27.5 px disc (2.5 % of the width) | 0 | wall softened, outline clean at cap, beard, shoulders, hands |
| `anamorphic_35` at f/2 | 16.0 px, oval | 0 | **fault, not sent**: the preset's flare fires on his white jersey stripes and smears bright bands across the wall |

Flicker, blur-only pass against the source (mean frame-to-frame change, 8-bit levels): ring 4–16 px outside him
0.66 → 0.67; background far from him 0.42 → 0.25; inside him 15.59 → 15.55. The pass adds no flicker at his outline.

## Known limits (so no agent pretends otherwise)

1. **One background plane.** The floor in that take is blurred as much as the wall, which is too much near him. A
   background at many distances (a street, a room) needs a depth map; the repo's depth model
   (`camera_engine.plate_depth`, Depth-Anything-v2 small) is not on this Mac, and a moving camera would need depth
   on every frame. Not built.
2. **The flare in `lens_post` reads any bright area as a light**, so white clothing flares. Fix belongs in
   `camera_engine.lens_post` (flare from small bright sources only) as its own pass.
3. **The oval bokeh here is tall** (as anamorphic glass gives); `camera_engine.dof_levels` stretches its blur
   sideways. OBSERVED, left alone.
4. Scripts only. Not in the app, not a render-worker job.
5. Not compared with a real lens. A side-by-side with a real 50 mm or 85 mm photograph of the same set-up would
   move the blur from HYPOTHESIS to VERIFIED.
