# c033 BODY-ONLY in the showroom, placed physically in Blender (19 Oct 2026)

Fendi approved the 18 Oct showroom composite (`8a527bab`) as the **working baseline** and asked for Blender to make the
shot feel filmed there: perspective, scale, depth, light and movement, with his real face, mouth and timing kept, and
the approved BODY-ONLY wardrobe result unchanged. Mid-task: "look at how I can fit in the room more naturally …
object spacing, distance", and "reconstructing or altering placement of objects is fine to naturally place me behind
the kitchen island if it can be realistically done".

**Spend: $1.33** (ledger 149–153), all on the room, never on him.
- **His inputs** are existing files: approved final `5482b35b` and its matte `b162d95d`.
- **The final plate (v3, below)** cost two still edits ($0.14 each) and one Kling animation ($0.35).
- **Two earlier animations** ($0.35 each: penguin only, then the black Ferrari) were superseded.

## The key finding: where he can stand

- **The take is framed from the thighs up** (MEASURED: the frame bottom is ~1.0 m below his eyes at his plane).
  - Standing in open floor, his cut-off legs would show above the floor line at any believable distance.
  - Hiding the cut with the frame edge would put him ~1.5 m from the camera, filling the frame.
- **So something in the room must hide him below the hips.** The island (top ~0.91 m) is the only object in this plate that can.
- **The island's measured geometry fixes his spot.**
  - Behind its far long edge, about 0.2 m from the stone (body centre 0.22 m), 1.2 m along it from the far-left corner.
  - That puts him **4.42 m** from the camera.
  - The penguin is **1.5 m** behind-left of him, and the car ~5.7 m behind.
  - Top view: drawn from `scripts/edit/blender/showroom_c033.json`, shared in the session.
- **Moving the island was considered and not done (DECISION).**
  - Any move uncovers floor the plate never showed, so filling it would need a generative pass.
  - As it stands, the island already hides the cut at a natural standing distance.

## Measured vs estimated

| Quantity | Value | Label |
|---|---|---|
| Plate camera: pitch, roll | 0, 0 (all verticals within 0.2°) | MEASURED |
| Plate focal length | 1565 px at 1080 wide (29.3 mm full-frame equivalent on the long side) | MEASURED (two orthogonal vanishing points of the island top) |
| Plate horizon | y = 792 px (lens shift, pitch 0) | MEASURED |
| Plate camera height | 1.65 m | ESTIMATE 1.74 m from a standard 0.91 m island top, then room scale 0.95 (DECISION, below): island 0.865 m, penguin 1.21 m |
| Plate camera motion | locked off, < 0.3 px drift at 540 wide | MEASURED |
| Source camera | iPhone 14, 4K 59.94, main lens; locked off (< 0.3 px drift) | SPEC + MEASURED |
| Source roll | 1.23°, corrected by rotating the take (geometry only) | MEASURED (door verticals now within 0.33°) |
| Source scale | 1160 px per metre at his face | ESTIMATE anchored on Fendi's stated height (6 ft 3 in, 1.905 m). Eye corners 110.6 px over 0.095 m and eyes-to-waistband 809 px over ~0.70 m agree within 1 % |
| Source camera height | 0.245 m below his eyes, ~1.3 m from him | MEASURED ratio + ESTIMATE |
| His eye height | 1.78 m | From his stated 1.905 m |
| Blender camera vs the plate | horizon at 792.0, island corners at (251.8, 1160.0) and (961.3, 1291.6) vs measured (252, 1160) and (959, 1292) | VERIFIED |
| Blender room vs the plate (matched camera) | mean abs difference 0.0025 (0–1), p99 0.023 | VERIFIED |
| Depth pass vs the measured corners | 3.526 m and 2.604 m vs 3.53 and 2.60 | VERIFIED |

## Correction after Fendi's first look (19 Oct): his real height

- **His note:** "C033 is solid but the angle makes me look short especially scaled next to the penguin. I'm 6'3"." Then: "if we can either scale the penguin and objects down or scale me up in a natural manner that works too".
- **First pass (filed as `41511208`, superseded):**
  - He was sized as a 1.80 m man: 1229 px/m from a 0.090 m eye-corner assumption, eyes at 1.68 m.
  - The room used a standard 0.91 m island.
- **Now:**
  - He is sized from his stated 1.905 m: 1160 px/m, eyes at 1.78 m.
  - The room is scaled 0.95 (DECISION, as he allowed): island 0.865 m (34 in), penguin 1.21 m, camera 1.65 m.
  - Together he reads ~11 % larger on screen, with his head ~0.15 m higher over the counter.
  - The plate picture is unchanged: a room and its camera scale together.
- **Physically,** a 0.865 m island meets a 6 ft 3 in man near the crotch line. So more of his jeans shows above the stone than before; that is correct, not an error.

## The Ferrari plate (19 Oct, Fendi: "the penguin is perfectly still"; "LED lights on the vehicle flickering and make the truck a Ferrari truck")

1. **Vehicle swap without moving the room.**
   - xAI `images/edits` on the measured still `d4da62ba` gave two Ferrari Purosangue variants (`95506ae8`, `981b0a5b`).
   - The edit re-renders the whole picture slightly: mean change 2.5 % outside the car (MEASURED).
   - So only variant 1's vehicle region (6.8 % of the picture, feathered, island excluded) is pasted over the original pixels, after a sub-pixel ECC alignment. Result: still `28757bef`.
   - The raw edits are marked `usable: false`, so the app never animates them.
2. **Animation.** "Animate the plate" from `28757bef`, with the event: the penguin turns its head, flaps and waddles left; the Ferrari's LED strips flicker and pulse. Kling job `caacff5a`, plate `36f10093`.
   - **OBSERVED:** the LED bar flickers amber/white throughout. The penguin turns and moves left, away from him. A yellow bus passes outside with red light on the room.
   - **MEASURED:** the plate stays within 1.2 px of the measured still. The camera solve and his placement carry over.
3. **Interpolation and passes.** Interpolated to 59.94 (asset in the table). Only the room pass is re-rendered; his card, the reflection and depth do not depend on the plate.
4. **Light changes** are now read from the lit marble backsplash, a fixed surface, since the penguin walks. White balance stays the penguin belly on the still.

### Plate v3: blue Ferrari, UFO, wind (19 Oct, Fendi: "a little bit more movement … snow falling … tree branch movement … a UFO chasing the new Tesla Roadster, the flying one … Ferrari blue … slight natural LED flicker")

- **Still `d939cb61`** comes from xAI edit `eeec2a6e` of the Ferrari still. Two regions are taken from it:
  - the vehicle, repainted Ferrari blue (Blu Pozzi);
  - the window wall, with a UFO chasing a flying silver Tesla Roadster above the trees.
- The rest are the measured still's pixels (23.7 % of the picture taken from the edit).
- Variant `8b7498ae` was rejected: no Tesla, and the middle trees were lost.
- **Plate `256ca1bb`** (Kling job `7ddc509c`). The event asked for:
  - the chase, banking and weaving;
  - snow drifting in a light wind, branches swaying;
  - the penguin only shifting its weight, turning its head and blinking, in place;
  - the Ferrari's LED strips flickering softly.
- **OBSERVED:**
  - The chase reads clearly. The Roadster flies with its tail lights on, and the UFO follows.
  - The penguin stays put and turns.
  - The LED strips flicker amber/white. Snow falls.
  - Branch sway is slight.
  - Kling also added a passing bus and warm light washes (allowed: the room "comes alive").
- **MEASURED:** the plate stays within 0.75 px of the measured still.

## How the shot is built (scripts/edit/blender/)

1. **`prep_performer.py`.** From the approved final and its matte:
   - The composite lane's matte erode/feather and edge decontamination (`pixels.ts` steps 1 and 2b).
   - The 1.23° roll fix.
   - Area-filtered scaling to 0.31 on premultiplied colour.
   - No grade.
2. **`build_scene.py` (Blender 4.5 LTS, Cycles CPU, no denoiser).**
   - **The plate camera**, from the measurements.
   - **A room of proxy surfaces.** Each carries the plate projected from that camera: floor, ceiling, the island box at its measured footprint, the kitchen run, the far window wall, the car and the penguin at their depths.
   - **His card.** The take's frame at his plane, sized from the take's own scale, standing behind the island and facing the camera.
   - **Passes**, all from Blender's camera:
     - room;
     - his reflection in the polished top (only his card is visible to gloss);
     - his card alone;
     - depth.
   - **The camera path is keyed in Blender** and rendered from there. Nothing generative sees it.
3. **`measure_plate_light.py`.** The penguin's white belly per plate frame: the room's white, and its light changes.
4. **`comp_scene.py`.**
   - **His light, from measurements:**
     - White balance and exposure: the room's white over the take's white (the door beside him), per channel, in linear light. This is the room's warm downlight, not a guessed darken.
     - Exposure +0.8 stop on top of that match. He stands ~1 m from a downlight and the penguin does not; at +0 his face did not read (checked at 0 / 0.5 / 0.8 / 1.1).
     - The top light: +0.15 stop at his head to −0.35 at the counter. The nearest downlight is ~1 m in front of him and above.
     - The room's light changes followed at 80 %.
   - **The island** occludes him where the depth says it is in front, with the island's own lens blur on that edge.
   - **His reflection** is lit like him.
   - **Depth of field** from the depth pass: thin lens, f/2, focused on him, 1–4 px.
   - **The lane's edge band and wrap, and grain 7.**
   - **Lens softness 0.5 px on him**, so his 4K-derived pixels sit in the same camera as the 1080 AI plate.
5. **`verify_scene.py`**: the checks below.

## Camera movement

- **Matched camera first** (`static`): the plate's own locked-off camera. The source is locked off too (MEASURED), so there is no existing motion to match.
- **Then a restrained move** (`dolly`): 0.20 m straight in over the 4 s, eased, keyed in Blender.
  - It is kept to 0.20 m because the plate's AI geometry is not exactly consistent. The kitchen wall's own vanishing lines would run it through the car.
  - At 0.20 m the proxies' depth errors stay under ~2 px of parallax.
- **No orbit, profile or new body angle.** One locked-off take cannot supply them.

## Environment activity (independent of him)

- The penguin turns its body (plate ~1.5–2.5 s and 3.5–4.5 s).
- Snow falls throughout. A train passes behind the windows near the end.
- Red and blue light washes the room at ~2.0, 3.0, 3.5 and 4.5 s of the plate; he takes these at 80 %.
- With the plate from 0.95 s, the train and the light sweep land in the shot's last 2 s. That is the 1.5–2 s edit window (DECISION).
- The 24 fps plate is motion-interpolated to 59.94 (ffmpeg `minterpolate` mci), so the room does not judder against his 59.94 frames. Spot-checked: no tearing on the car, the train or the snow.

## Verification

`scripts/edit/blender/verify_scene.py`. The approved frame is pushed through the exact take-to-shot map (the roll, the
texture scale and the card's on-screen corners from Blender) to predict his face in the shot, and compared with it. A
per-channel linear gain is fitted, since the grade is linear in light. Every second frame is checked (111 frames).

| Version | Face PSNR, median / min | Mouth timing: best match at lag 0 | Timing margin, median / min |
|---|---|---|---|
| matched camera (static) | 36.2 / 34.1 dB | 111 / 111 | 7.2 / 2.0 dB |
| tight (1.6× lens) | 38.1 / 35.5 dB, mask 10 px off the outline (37.9 / 28.2 at 5 px: the light wrap from the bus passing behind his head, 2.8–3.8 s) | 111 / 111 | 10.0 / 3.6 dB |
| DOLLY_ROW

- **VERIFIED:** his face in the shot is the approved file's pixels, resampled and graded.
  - What remains is lens softness, anti-aliasing, grain and the top-light gradient (~36 dB).
  - A redrawn or warped face would fall far below 30 dB.
- **VERIFIED:** his mouth is on the take's own frames. Every checked frame matches its own approved frame better than its neighbours ±3.
- **VERIFIED:** Blender's passes are deterministic. Re-rendered frames are pixel-identical.
- **OBSERVED:** a landmark-based mouth-opening correlation is ~0.3. It is not used as evidence: at a ~45 px face the landmarks are too noisy. The same check on the 2D baseline (a pure scale/shift) gave 0.66 with a 5 px landmark residual.
- **Edges, scale, occlusion:** OBSERVED on frame grids and the side-by-side.
  - The island cuts him at the counter line, with the island's own lens blur.
  - There is no halo against the window or the car.
  - He stands taller than the penguin, at his stated 6 ft 3 in.

## Limitations (still true)

- **Viewpoint height.**
  - The phone was ~0.25 m below his eyes at ~1.3 m (~11° up at his eyes). The plate camera is ~0.13 m below his eyes at 4.4 m (~2° up).
  - So he is seen ~9° more from below than the room is (from the two cameras' measured geometry).
  - It is small at this size, but it is baked into the take; only a new take can fix it.
- **His light is a match, not a relight.**
  - The take's soft frontal light stays. The top light and the room's colour and changes are applied as gradients and gains.
  - There is no true shading change on his face.
- **The scale rests on his stated height** (1.905 m) and on the room scale (0.95). The room's true size is unknowable from one AI picture. The penguin (1.21 m) and the island (0.865 m) are the cross-checks.
- **No shadow from him.**
  - The downlight in front of him throws his shadow behind him, onto floor the island hides.
  - The window light is too weak to cast one onto the counter.
  - DECISION: none added rather than a fake one.
- **Reflection:** a thin, physically small strip on the stone just in front of him. Mostly his jeans and hands.
- **The plate is an AI picture.** Its geometry is consistent to a few percent, not exactly (see the camera move).
- **The plate interpolation** may soften very fast motion (the passing train) slightly.

## For tomorrow's takes: shoot to match this room

- Phone at **eye height (~1.7 m)**, level (no tilt). The plate camera is level at 1.74 m.
- **3–4 m away**, on the **2×** lens if it frames, so the perspective matches a camera across the room.
- **Tripod**, locked off. The plate is locked off and the move is added in Blender.
- **Full body with the floor in frame**, at least once. Then he can stand in open floor with real floor contact and a shadow, not only behind an object.
- Plain, evenly lit background; avoid a white door right behind him (spill). Note the light's direction.

## AVT assets

Project YSL `764a63d2`. All are unassigned (no shot, no Cut). Folder `canonical/body_only_swap_c033_2026-10-18/blender_showroom/`.

| Role | Asset |
|---|---|
| Approved performance (input) | `5482b35b` |
| Its matte (input) | `b162d95d` |
| Showroom still, measured (original) | `d4da62ba` |
| Still with the black Ferrari (paste) | `28757bef` (raw edits `95506ae8`, `981b0a5b`, unusable) |
| **Still v3: blue Ferrari, UFO + flying Tesla (paste)** | **`d939cb61`** (raw edits `8b7498ae`, `eeec2a6e`, unusable) |
| **Plate v3, Kling** | **`256ca1bb`** (job `7ddc509c`) |
| Plate v3 interpolated to 59.94 | `67159b15` |
| Superseded plates | `21d1bc9c` (black SUV), `275a16c9` (penguin only), `36f10093` (black Ferrari) |
| **Shot, matched camera** | **`98d1d04e`** (decoded MD5 `aecb5dbcaadb4e5186e596ac685b2a94`) |
| Review: approved \| 2D \| Blender, song | `e60299ed` |
| Review: face pair, song | `6572ac8c` |
| Review: 2 s edit, song | `e37d5516` |
| **Shot, tight (1.6× lens)** | **`63a101f1`** (decoded MD5 `f119056faf3e1ff16ab83ef02184f475`); with song `cea0eb6a`, face pair `2ce07795` |
| DOLLY_ASSET
| Superseded first pass (1.80 m, black SUV) | `41511208` |
| `.blend` files and the floor plan | storage only, same folder |

## Not in the app yet (integration gaps)

- **The Blender lane runs offline only.**
  - AVT's "Composite over plate" is the 2D lane (`pixels.ts`), with no camera, geometry, occlusion or depth.
  - Wiring it in would need a render worker that can run Blender. The AVT ffmpeg worker does not.
- **Camera measurement is manual.** The vanishing points were picked from detected lines, by hand; there is no tool for it.
- **The performer placement** is a hand-chosen spot in `showroom_c033.json`.
- **The body-only put-back is still not in Dress** (see `docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md`).
