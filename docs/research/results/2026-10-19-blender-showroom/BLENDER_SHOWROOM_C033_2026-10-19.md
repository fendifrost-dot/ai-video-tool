# c033 BODY-ONLY in the showroom, placed physically in Blender (19 Oct 2026)

Fendi approved the 18 Oct showroom composite (`8a527bab`) as the **working baseline** and asked for Blender to make the
shot feel filmed there: perspective, scale, depth, light and movement, with his real face, mouth and timing kept, and
the approved BODY-ONLY wardrobe result unchanged. Mid-task: "look at how I can fit in the room more naturally …
object spacing, distance", and "reconstructing or altering placement of objects is fine to naturally place me behind
the kitchen island if it can be realistically done".

**Spend: $1.82** (ledger 149–155), all on the room, never on him.
- **His inputs** are existing files: approved final `5482b35b` and its matte `b162d95d`.
- **The current versions use room v5** (below): the room moves without generative video.
  - The only spend was one $0.14 still edit, a clean picture of the room for the places the car and the penguin leave uncovered.
- **Four Kling animations** ($0.35 each) are superseded or rejected: penguin only, the black Ferrari, v3 and v4. So are two still edits of $0.14.

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

### Plate v4, rejected (19 Oct, Fendi on v3: "that looks terrible", the UFO / Tesla / bus)

- **What went wrong in v3:** the UFO and the Roadster were painted into the still, large, sharp and close to the glass. They read as stickers, and Kling added a bus and colour washes on top.
- **Still `20fcf483`:** the blue Ferrari only (the vehicle region of `eeec2a6e`, 7.1 % of the picture), with the original snowy sky.
- **Plate `cb77eddf`** (Kling job `e8a76113`). The event asked for:
  - the chase far beyond the trees, small and half hidden by the snow;
  - no bus or traffic, and steady room light;
  - the penguin shifting in place;
  - the LED strips flickering softly.
- **OBSERVED:**
  - The flying Roadster is small and distant, with its tail lights on, and a UFO searchlight beam sweeps after it from above.
  - The saucer itself stays mostly above the frame.
  - A little distant street traffic still appeared.
  - The penguin shifts in place. The LEDs flicker.
- **MEASURED:** the plate stays within 0.6 px of the measured still.
- **Fendi's verdict:** "Scrap the UFO and Tesla, it looks too bad." He also said the room motion "looks AI generated and antithetical to our whole approach". The v4 render was stopped before any version finished.

### DECISION: no more generative room motion (19 Oct)

- **Why:** a Kling plate redraws the whole room every frame. It wobbles, morphs and adds unrequested things (a bus, traffic). Nothing makes it obey the prompt, the same reason the canonical method never redraws him.
- **Fendi:** "That's what we were supposed to be doing anyway: creating movement and refitting the room to fit me in it perfectly with Blender."
- **His LED note:** "I don't want flashing lights from the Ferrari. I'm asking for the natural rolling flicker phenomenon that happens when you record LED lights."
- **His car note:** "the dimensions of the Ferrari appear to be larger than the other truck."
- **No UFO, Tesla or traffic.**

## Room v5: the room refitted and moved in Blender, no generative video (19 Oct)

**The Ferrari was too big, and the measurement says by how much.**
- The edit painted it over the SUV at the SUV's size.
- At the car's measured depth (10.6 m, the SUV's wheel line) and in the room's metric (room scale 0.95):
  - the pasted Ferrari stands **1.92 m** tall (MEASURED);
  - the SUV it replaced stood 1.97 m (MEASURED; right for a large SUV);
  - a Purosangue is **1.589 m** (SPEC).
- **DECISION:** shrink it **×0.828** about its front wheel's ground point. It stays parked on the same spot and the same floor line, and now reads its true size against his 1.905 m and the 0.865 m counter.
- The scene's car proxy shrinks with it (`room_v5.car_proxy`).

**What it took (`room_layers.py`).**
- **A clean room behind the car and the penguin.** One xAI still edit of the measured still (`b30bd9e2`, $0.14) with the vehicle and the penguin removed.
  - It is aligned to the measured still: ECC affine; the median difference on unchanged areas is 0.007.
  - It is used **only** where the car and the penguin stood.
  - The original island stays in front everywhere: its far edge is projected from the measured camera, then snapped per column to the stone's edge in the picture.
- **The car and the penguin as their own layers.**
  - Each was cut from its still with a matte: the car traced by eye and snapped to its edge by GrabCut, the penguin by difference against the clean room, refined by GrabCut.
  - Both masks are in the repo (`scripts/edit/blender/masks/`, silhouettes only).
- **The still's painted snowflakes are removed** (3,791 small dots over dark sky, filled from the sky around them), so the only snow that moves is Blender's.

**What moves, and how (every curve is a value in `showroom_c033.json`, `room_v5`).**
- **Snow (`snow.py`, Blender particles).**
  - 45,000 flakes (~2.4 cm) fall between the glass and the far trees (15.8–34 m). The glass is at 15.5 m, MEASURED from the window's floor line.
  - They render through the plate's measured camera with a half-frame shutter, and are laid only into the glass panes: the mullions and frames hide them, and the car stands in front of them.
  - **MEASURED with `--probe`:** they fall at 1.11 m/s and drift downwind at 1.11 m/s (medians), with a swirl from a turbulence field.
  - A 16 s preroll fills the yard before frame 1.
- **Wind.** One gust curve for the whole yard: its strength runs 0.38–1.12 of the mean, with a slow gust every ~3 s and a quicker flutter. The snow's wind field and the branches both follow it.
- **Branches (`room_motion.py`).**
  - A smooth sway of up to 1.4 px (the trees are 25 m or more away), with seeded phase fields so neighbouring branches do not move in lockstep.
  - It grows toward the crowns, is zero at the snowy ground, and fades to zero at every frame and mullion.
- **The Ferrari's LEDs: the rolling-shutter band, not a flash.**
  - A phone reads its sensor rows one after another (~13 ms per frame). An LED driven by pulse-width modulation is on and off within that time, so the off part lands as dark bands across the rows.
  - The bands crawl because the PWM rate is not a whole multiple of the frame rate.
  - Model: ~1.62 kHz PWM, ~90 rows per band at 1080×1920, crawling 2.7 rows a frame, at most 55 % of the lamp's own light taken out (ESTIMATE/DECISION).
  - It acts only on the two LED strips and the two lower lamps, on the light above the paint underneath. The badge and the paint's highlights stay steady.
  - **OBSERVED:** a soft dark band moves across a strip while the lamp below stays lit, then the reverse. The lamps never go dark at once.
- **The penguin**: small rigid turns of its own pixels, never redrawn:
  - a 0.8° weight shift about its feet every ~3.4 s;
  - a 0.4 % breath;
  - one 3.5° head tilt (0.9–1.4 s in, held, back by 3.5 s). v7 replaces this with the livelier tracks below.
- **Plate:** `room_motion.py` writes the 240 frames at 59.94 directly. It needs no interpolation and no plate offset. Filed as `0fc2cf8c`.


### v6: the headlight bleed (20 Oct, Fendi: "there is bleed I believe from the headlight effect, it looks like I'm coming out of the environment")

- **Test ($0, frames 60/120/180, `comp_scene.py --only N --stills`):** the comp with its edge wrap at 0.5, at 0.15 and off.
- **OBSERVED:** at 0.5, the wrap (a screen of the room blurred 30 px onto his inner edge band) lifts his outline by up to 16–18 levels.
  - It leaves a pale rim around his cap, jaw and shoulders against the snowy window.
  - On the car side the rim follows the Ferrari's lamps, including their rolling band.
  - Off, his edge looks cut out. At 0.15 the rim is gone and the edge still takes the room's light.
- **DECISION:** `lens.wrap` 0.15 (a scene value now; the composite lane's 0.5 stays the default in code).
  - Only `comp_scene.py` re-runs: the Blender passes and the plate are unchanged.
- **Files (v6, current):**
  - static `81989353` (MD5 `4eacb289a52e028a4eaf51663db8e9db`; with song `356e8b8a`, face pair `7356a109`, side-by-side `2999dd4b`);
  - tight `7c341552` (MD5 `b9ba7caee4ee58430a93fc6c40fe2456`; with song `37f0f4f2`);
  - dolly `49bdba39` (MD5 `ef590cb5e90748e3a4a19490692b19a7`; with song `1fe9a7f4`).
  - The v5 files (wrap 0.5) are superseded.

### v7: a livelier penguin (20 Oct, Fendi on v6: "That one is solid but the penguin still doesn't have much movement")

- **Still its own pixels, never redrawn.** `room_motion.py` now drives the penguin with keyframed tracks (`room_v5.penguin_motion`):
  - **Body:** a 1.8° weight shift about its feet every ~2.3 s with a 1.2 px bob, and a 0.8 % breath (was 0.8° and 0.4 %).
  - **Head:** it looks around. Tilts of +7°, −5° and +9° about the neck, and a short turn toward the camera (1.3–2.4 s) that narrows the head 10 %. Was: one 3.5° tilt.
  - **Flipper:** three flaps (14°, 10°, 8°) of the flipper that stands clear of its body, about the shoulder.
    - The flipper is split from the body layer, so as it lifts, the clean room behind it shows. Nothing is invented.
    - The far flipper lies against the body and stays put.
- **Neck, flipper box and shoulder:** MEASURED on the still at 1080×1920.
- **Only the room pass and the comp re-render.** His card, reflection and depth passes are unchanged. The edge wrap stays 0.15.

### v8: the penguin walks away (20 Oct, Fendi on v7: "Not enough movement still, the penguin doesn't have to stand still, it can walk away from me in a natural movement")

- **Still its own pixels, never redrawn.** The penguin is mirrored (`penguin_motion.mirror`) so it faces where it goes. Mirroring is a flip of the still's own pixels.
- **The path.** It glances back for 0.7 s, then waddles away from him to the left, along the floor in front of the cabinets.
  - It stays at its measured depth (5.76 m) and leaves the frame at about 3.3 s.
  - Its ground point is projected through the measured camera, so its size and floor line follow the perspective.
  - Pace: 0.3 m/s in 0.5 s steps (a brisk emperor-penguin walk; ESTIMATE).
- **The waddle.** Each step it rocks 8° about the stance foot, with a 2 px bob, and holds the clear flipper out 16° for balance. The feet are MEASURED on the still.
- **The room behind it** is the clean still (`b30bd9e2`), so nothing is invented where it has been.
- **Limitation:** in the dolly, the walking penguin is carried by the room projection (its proxy card stays at 5.76 m). The 0.2 m push gives it no parallax error of note.

### v9: no penguin (20 Oct, Fendi on the walking penguin: "That looks terrible … Remove the penguin from the scene altogether … It looks AI generated and cheesy")

- **DECISION:** the penguin is out of the shot: `penguin_motion.enabled` false, and the scene's penguin card is off (`penguin.in_scene` false).
- **Where it stood:** the clean still (`b30bd9e2`) shows the cabinets and the floor.
  - With the penguin gone, its whole box plus 40 px is taken from the clean still. A thin dark edge of the penguin's outline had survived outside its matte.
- **What the lesson rules out (DECISION):** puppeting a 2D animal from one picture (rigid turns, a mirrored walk) reads as fake. An animal that moves needs real footage or a real 3D model; never a cut-out.
- **What still moves in the room:** the snow, the branches and the Ferrari's LED bands.
- **Files (v9, current):**
  - plate `b7a72ddd`;
  - static `436ffebe` (MD5 `22401387639530934a3e5ac3d6c658e5`; with song `8baa20aa`);
  - tight `835a050b` (MD5 `f27057454327c0763204bc0177c8d538`; with song `81fbeddb`);
  - dolly `567e8ff7` (MD5 `61b922fb0788a92941c08e48e951bb4e`; with song `0b0381be`).
  - v6–v8 are superseded. v7 and v8 were not filed (rejected while rendering).

## Room 2: the Gemini room (20–21 Oct, Fendi: "I hate the environment now … regenerate a better more photo realistic environment inside Gemini"; then "Room 2")

**What it is.** Gemini candidate 2 (`49041b07`, job `524fbb29`, ledger 157), one 1536×2752 still.
- The layout: a kitchen down the left, an island running away from the camera on the right, a blue Purosangue parked in front of a full-height window wall, and snow outside.
- Nothing in it is generative video. The same lane as v9 moves it: Blender snow, the branches swayed inside the glass, and the rolling LED band on the car's lit DRLs.
- No penguin. The edge wrap stays at 0.15.

### Where he stands (DECISION)

- The island runs toward the camera here, so the only place it can hide his hip cut is its **far end**.
- He stands **0.25 m beyond the far end** (body centre; his front ~0.1 m off the stone), **0.59 m in from its left corner**, with the Ferrari behind him.
- The stone's top edge crosses his whole width at the upper thigh:
  - the take's bottom edge is 0.71 m up on his plane;
  - the edge of the stone is at 0.90 m.
- The car's DRLs land at his waist, either side of him.

### The camera, measured

| Value | How | Label |
|---|---|---|
| Horizon 1273.4 (full px), optical axis column 895.8 | the room's single vanishing point, RANSAC over line segments; verticals within 0.4° (median) | MEASURED |
| Focal 1800 full px (1266 at 1080 wide), ±10 % | the Ferrari's side line meets the horizon at x ≈ −90 and its front lines at ≈ 4200; for orthogonal directions that gives 1730–1880 | MEASURED |
| Camera height 1.55 m | the car's roof (SPEC 1.589 m) sits 5 px above the horizon at ~9.5 m, so 1.56 m | ESTIMATE |
| Counter top 0.927 m | both counters read top / camera height = 0.598: the island's far end (top 1525, floor 1900, full px) and the left counter (top and toe line at one column) | MEASURED ratio |
| Island far end 4.46 m; car wheels at 8.1 and 10.5 m; window 13.5 m; ceiling 4.95 m at the window | lifted with the camera above | MEASURED |

- The room is one-point (every room line meets one vanishing point), so the room alone cannot give the focal length. The car can.
- The focal barely changes his size. His size on screen is set by the counter (the stone's edge row and its 0.927 m height), so a 10 % focal error moves his scale by about 1 %.
- **Two cross-checks, both OBSERVED:**
  - The car's drawn wheelbase reads 2.73 m against a 3.02 m SPEC. Gemini drew the car ~10 % short in length, not in height.
  - The car's far front corner lands within ~30 px of where its width predicts.

### What changed in the tools (all $0)

- `room_layers_still.py` (new): the layers from one still that already holds the car.
  - It scales the still to 1080 wide and crops 7 rows top / 8 bottom, so nothing is stretched.
  - The glass mask is the panes minus mullions, transom and the car (traced on a 1:1 grid and snapped by GrabCut: `masks/room2_car_matte.png`).
  - 1,680 painted snowflakes are removed from the glass.
- `build_scene.py`:
  - `plate.principal_x` (the optical axis off centre, as lens shift);
  - a `proxies` list of quads for the room (kitchen run, counter, backsplash, upper cabinets, left wall, window wall, ceiling, the car's side and front);
  - `performer.position`;
  - `dolly_m`.
- `snow.py`: `principal_x`. `room_motion.py`: no penguin set-up when it is disabled. `measure_plate_light.py`: any box as the reference surface.
- **VERIFIED:** v9 is untouched by these changes.
  - A v9 room frame renders bit-identical with the old and the new code (max difference 0).
  - The v9 plate frame 120 is byte-identical.

### Decisions for this room

- **White reference:** the white wall beside the window (`light.white_plate_srgb` 0.686 / 0.647 / 0.590, MEASURED).
- **Exposure +0.3 stop**, chosen on his face at +0 / +0.3 / +0.6. At +0 his face is dim against the lit window; +0.3 reads his eyes, glasses and mouth.
- **Top light +0.1 / −0.25 stop.** The downlights are behind him here (5–11 m).
- **Dolly 0.12 m** (v9: 0.20). The island starts ~0.9 m from the lens; on frame 240, 0.20 m read as a zoom.
- **Tight 2.0× lens** (v9: 1.6×). He stands ~4.7 m away, 0.76× his v9 size, so 2.0× gives his face about the v9 tight size.
- **VERIFIED:** the plate's light reference (an island-top box) is flat: ratio 0.9999–1.0002 over 240 frames. Nothing flickers on him.

### Files (room 2)

Project YSL `764a63d2`, folder `canonical/body_only_swap_c033_2026-10-18/blender_showroom/`. All of them are unassigned: no shot and no Cut (VERIFIED by re-query).

| Role | Asset | Decoded MD5 |
|---|---|---|
| Plate (not for the cut) | `9addb550` | `29126c0cd09f3a20d221f01f30b3ef94` |
| **Static** | **`18a6ad54`**; with song `928bc471`, side-by-side `d1d50150` | `b39ecd1fb18a6554ce15e2c8fa2b1baa` |
| **Tight (2.0× lens)** | **`65df207f`**; with song `7acc1866`, face pair `d478fb22` | `c886e6e84e1d5e7b1f40f290dfa10595` |
| **Dolly (0.12 m push)** | **`e8dff105`**; with song `e1d1ef34` | `b158fd69f6394ecd02c879dcfa3ff625` |

### Verification (room 2)

| Version | Face PSNR, median / min | Mouth timing: best match at lag 0 | Timing margin, median / min |
|---|---|---|---|
| **Room 2, static** | **35.7 / 34.2 dB** | **111 / 111** | **7.7 / 1.5 dB** |
| **Room 2, tight** | **38.4 / 36.3 dB**, 10 px in | **111 / 111** | **12.1 / 5.7 dB** |
| **Room 2, dolly** | **35.8 / 34.2 dB** | **111 / 111** | **7.7 / 1.8 dB** |

- **VERIFIED:** the static was rendered twice from scratch, hours apart (the second time after the matte trials below were undone), and the decoded MD5 is `b39ecd1f…` both times.
- **VERIFIED:** his face is the approved file's pixels, resampled and graded. His mouth is on the take's own frames.
- **OBSERVED:** no stray matte outside his body on any checked frame (largest separate piece: 50 px, on the tight).

### Edge flashing (Fendi, 21 Oct: "There's some pixelation blur and flashing around my edges"; 22 Oct: "It's the entire outline of my upper body"): fixed in v2, awaiting his eye

**Cause, VERIFIED.**
- The approved take is 24p content in a 59.94 file: his picture changes every 2–3 frames and holds in between.
- His outline jumps only on the frames where the picture changes: 17–29 levels there, against 4–8 between. The room just beside him changes 3–5 levels (snow and grain).
- Against the dark, snowy window, that step reads as the whole outline flashing. In the take he stood before a white door close to his jacket's colour, so it never showed.
- Also MEASURED: his outline was ~8 % brighter than the jacket just inside it (0.507 against 0.471 in Blender's pass). That is the take's door left in the soft edge.

**Fix (DECISION, compositing only; `lens` in `showroom_c033_room2.json`, each option off by default in `comp_scene.py`).**
- `edge_tween_px` 3: within 3 px of his outline, his matte is blended from this picture's toward the next picture's across the hold, as a shutter would smear it. Nothing of him is generated: his body and face are the frame's own pixels.
- `edge_colour_from_inside_px` 1.5: his outline takes the colour of his body just inside it.
- `edge_choke` 0.15: the thin outer fringe of the matte is dropped.
- `wrap` 0 (was 0.15): the room is no longer screened onto his edge.
- MEASURED on the static's first 48 frames:

  | | Outline change on a new picture / between | Rim over a clean edge |
  |---|---|---|
  | before | 22.5 / 6.2 levels (3.7×) | +8.1 levels |
  | after | 12.9 / 11.3 levels (1.1×) | +3.6 levels |

  The rim fixes alone (no tween) left the pulse at 21.6 / 6.0: the cadence was the cause.

| v2 (current) | Asset | Face PSNR median / min | Timing | Decoded MD5 |
|---|---|---|---|---|
| **Static** | **`b2ad4ae6`**; with song `df0a070d` | 35.7 / 31.8 dB (8 px in: 35.5 / 33.9, before 35.3 / 33.4) | 111 / 111 | `07e2787f59861e7f8696e0c29f2e921c` |
| **Tight** | **`9271b8eb`**; with song `e425a805` | 38.5 / 36.3 dB (10 px in) | 111 / 111 | `04b00d03387aa1ad6a88a21ae8ec6abb` |
| **Dolly** | **`28d2190b`**; with song `e22c6c71` | 35.7 / 32.6 dB | 111 / 111 | `b9182d91c903aa2e6d6f0151e7626c6a` |

- Review: his outline before / after, half speed, `6039f53d`. The v1 versions above (`18a6ad54`, `65df207f`, `e8dff105`) are superseded.
- **OBSERVED:** the static's 5 px minimum is frame 167 (31.8, was 34.5): the side of his head as it turns, the tween at work on his outline. 8 px in, his face is as good as or better than before. On that frame it reads as a slight softness, with no artifact.

**Rejected on the way (do not repeat).** All three changed the matte itself in `prep_performer.py`; it is back to `main`.
1. **A per-pixel hold** (keep the previous matte where the picture changed by under 8–20 levels): ghost trails beside him.
2. **A whole-frame hold** (reuse the matte when the whole picture changed by under 74 levels):
   - Around his outline the picture changes on almost every frame (23–190 levels, no gap), so the held matte lagged his head.
   - A pale strip of the take's background showed beside his face on frames 160–161.
3. **A matte carried along his motion** (optical flow): the edge's change beyond his motion went only from 0.076 to 0.073.

**The "blur":** on the wide he is ~0.21× the take's size on screen (face ~745 px). That is the take's detail at that size. The tight (0.445×) is sharper.

## How the shot is built (scripts/edit/blender/)

0. **The room (v5)**, before any of the steps below:
   - `room_layers.py` splits the stills into layers (room, car, penguin, glass, LED light).
   - `snow.py` renders the snow in Blender.
   - `room_motion.py` writes the plate frames (see "Room v5").
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

- **Room v5 (current):**
  - Snow in a gusting wind throughout, with the branches swaying to the same gusts.
  - The penguin's weight shift and breath throughout, and its head tilt at ~1 s and back by 3.5 s.
  - The rolling LED bands on the Ferrari's lamps throughout.
  - The room's own light is steady (no washes), so his 80 % light follow has nothing to follow.
- **The earlier Kling plates (v1–v4, rejected or superseded):**
  - a penguin turning, a passing train and red/blue light washes;
  - those plates were 24 fps, interpolated to 59.94.

## Verification

`scripts/edit/blender/verify_scene.py`. The approved frame is pushed through the exact take-to-shot map (the roll, the
texture scale and the card's on-screen corners from Blender) to predict his face in the shot, and compared with it. A
per-channel linear gain is fitted, since the grade is linear in light. Every second frame is checked (111 frames).

| Version | Face PSNR, median / min | Mouth timing: best match at lag 0 | Timing margin, median / min |
|---|---|---|---|
| **v9 (current) = no penguin, edge wrap 0.15, matched camera (static)** | **36.3 / 34.3 dB** | **111 / 111** | **7.2 / 2.0 dB** |
| **v9, tight** | **38.3 / 36.0 dB**, 10 px in | **111 / 111** | **10.0 / 3.5 dB** |
| **v9, dolly** | **36.5 / 33.8 dB** | **111 / 111** | **7.2 / 1.6 dB** |
| v6 = room v5 + edge wrap 0.15, matched camera (static) | **36.4 / 34.2 dB** | **111 / 111** | **7.2 / 2.0 dB** |
| **v6, tight** | **38.2 / 35.9 dB**, 10 px in (38.0 / 29.9 at 5 px) | **111 / 111** | **9.9 / 3.6 dB** |
| **v6, dolly** | **36.5 / 33.6 dB** | **111 / 111** | **7.4 / 1.6 dB** |
| room v5, matched camera (static), wrap 0.5 | **36.3 / 34.1 dB** | **111 / 111** | **7.3 / 2.0 dB** |
| **room v5, tight (1.6× lens)** | **38.2 / 35.9 dB**, mask 10 px off the outline (38.0 / 29.8 at 5 px) | **111 / 111** | **10.0 / 3.4 dB** |
| **room v5, dolly (0.20 m push)** | **36.6 / 33.6 dB** | **111 / 111** | **7.3 / 1.5 dB** |
| matched camera (static), plate v3 | 36.2 / 34.1 dB | 111 / 111 | 7.2 / 2.0 dB |
| tight (1.6× lens), plate v3 | 38.1 / 35.5 dB, mask 10 px off the outline (37.9 / 28.2 at 5 px) | 111 / 111 | 10.0 / 3.6 dB |
| dolly (0.20 m push), plate v3 | not rendered: stopped when the plate changed | — | — |

- **Correction (19 Oct, room v5):** the 5 px dips are not the bus behind his head, as first written for v3.
  - OBSERVED: the same frames dip on v3 and on v5 (184, 228 and 166, at 2.8–3.8 s), and v5's background behind him is still.
  - HYPOTHESIS rejected (20 Oct): it is not the wrap. With the wrap at 0.15 the tight 5 px minimum is still 29.9 dB on frame 184.
  - Remaining HYPOTHESIS: the inner edge band itself (the erode/feather of the matte at his moving outline) reaches a 5 px mask. Test: mask the outline by its alpha instead of by distance.
  - The face's interior (10 px in) is clean on both versions.
- **VERIFIED:** his face in the shot is the approved file's pixels, resampled and graded.
  - What remains is lens softness, anti-aliasing, grain and the top-light gradient (~36 dB).
  - A redrawn or warped face would fall far below 30 dB.
- **VERIFIED:** his mouth is on the take's own frames. Every checked frame matches its own approved frame better than its neighbours ±3.
- **VERIFIED:** Blender's passes are deterministic. Re-rendered frames are pixel-identical.
- **VERIFIED (room v5):** the plate reproduces bit for bit.
  - Rebuilt from scratch (the stills downloaded from storage, the masks from the repo) with `room_layers.py`, a fresh Blender snow render and `room_motion.py`.
  - Every layer is byte-identical, and the plate's decoded MD5 is `ee623d0a5906d76ba41bdf572d5a8484` both times.
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
- **The room is an AI picture.** Its geometry is consistent to a few percent, not exactly (see the camera move).
- **Room v5's motions are 2D where the room is 2D.**
  - The branches sway as a smooth displacement of the picture's own pixels, not as simulated trees.
  - The penguin moves rigidly (a turn and a tilt), not as an animated body. These are kept small for that reason.
  - The snow is real 3D particles, but it sits in the plate: in the dolly it moves with the window proxy, with no parallax of its own.
- **The LED band is a model** (PWM rate, row time and depth are estimates), not a measurement of a real Purosangue.
- **The clean room under the car and the penguin is a still edit.** It is used only where they stood. A dark-floor patch under the shrunk car's front is that edit's floor.

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
| **Clean still, vehicle and penguin removed (room v5 input; unusable as a plate)** | **`b30bd9e2`** (second variant `42a21490`) |
| **Plate, room v5 (Blender snow, sway, LED bands, penguin; Ferrari at spec size)** | **`0fc2cf8c`** |
| **Shot, room v5, matched camera** | **`30f71856`** (decoded MD5 `f0cd5952b6931e122624ca1daadc6aad`); with song `2df713e3`, side-by-side `8883b4d2`, face pair `a6d442b5`, 2 s edit `af17951b` |
| **Shot, room v5, tight (1.6× lens)** | **`7adff8e9`**; with song `9254ba24`, face pair `7a9ad53f` (decoded MD5 `9fdbad43ce0a658558124e2a104fb152`) |
| **Shot, room v5, dolly (0.20 m push)** | **`a74c3c90`** (decoded MD5 `111486d18afd9ecc506c20b800b7a162`); with song `f46ba962`, side-by-side `afb9ed1e`, face pair `6c257bdb` |
| Still with the black Ferrari (paste) | `28757bef` (raw edits `95506ae8`, `981b0a5b`, unusable) |
| Still v3, rejected (painted UFO + Tesla) | `d939cb61` (raw edits `8b7498ae`, `eeec2a6e`) |
| Plate v3, rejected (the rendered versions use it) | `256ca1bb` (job `7ddc509c`), interpolated `67159b15` |
| Still v4: blue Ferrari only (the car's layer in room v5) | `20fcf483` |
| Plate v4, rejected (Kling) | `cb77eddf` (job `e8a76113`) |
| Superseded plates | `21d1bc9c` (black SUV), `275a16c9` (penguin only), `36f10093` (black Ferrari) |
| Shot, plate v3, matched camera (superseded) | `98d1d04e` (decoded MD5 `aecb5dbcaadb4e5186e596ac685b2a94`) |
| Review: approved \| 2D \| Blender, song | `e60299ed` |
| Review: face pair, song | `6572ac8c` |
| Review: 2 s edit, song | `e37d5516` |
| Shot, plate v3, tight (superseded) | `63a101f1` (decoded MD5 `f119056faf3e1ff16ab83ef02184f475`); with song `cea0eb6a`, face pair `2ce07795` |
| Shot, plate v3, dolly | not rendered (stopped when the plate changed) |
| Superseded first pass (1.80 m, black SUV) | `41511208` |
| `.blend` files and the floor plan | storage only, same folder |

## Not in the app yet (integration gaps)

- **The Blender lane runs offline only.**
  - AVT's "Composite over plate" is the 2D lane (`pixels.ts`), with no camera, geometry, occlusion or depth.
  - Wiring it in would need a render worker that can run Blender. The AVT ffmpeg worker does not.
- **Camera measurement is manual.** The vanishing points were picked from detected lines, by hand; there is no tool for it.
- **The performer placement** is a hand-chosen spot in `showroom_c033.json`.
- **The body-only put-back is still not in Dress** (see `docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md`).
