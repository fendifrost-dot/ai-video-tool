# Placing him in a built (Blender) scene so he looks filmed there, not pasted

Fendi, 14 Nov 2026: "each time we've done it, it comes out a little off. The color, it looks like I'm pasted into the
scene … This is a standard industry technique … we need to perfect this … it's going to be a regular thing that I do."

The film industry does this on every effects show (actor shot on a stage, environment built in 3D). They do not get it
right by eye in the comp. They get it right in four places, in this order, and **the first one matters most**:

1. **The shoot is lit for the scene** (the scene is designed first, then he is lit to match it).
2. **His footage and the render share one colour space** (both in linear light, one view transform at the end).
3. **The comp matches by measurement** (black point, white point, the colour of the shadows and of the light, grain, sharpness), then edges, then atmosphere.
4. **Everything gets the same lens and camera finish at the end** (glare, defocus, vignette, grain, compression), applied to him and the scene together.

Our Hyenas set did a good job on geometry (camera match, his height, shadows on the ground, smoke in front of and
behind him). Where it fell short is items 1-3. Each point below is labelled per the evidence taxonomy.

---

## Why ours reads as pasted (diagnosis of `hyenas_set_build.py` / `hyenas_set_comp.py`)

| # | What we do now | Why that shows | Label |
|---|---|---|---|
| 1 | His take was shot under the location's light (daylight/phone auto exposure); the set is night, lit by red flares and car lights. | The direction, colour and hardness of light baked into his pixels disagree with the set. No grade fixes light direction: shadows on his face and clothes point the wrong way, and the flares behind him give him no rim. **This is the main "pasted" cause.** | HYPOTHESIS (test: `integration_check.py` light tint + Fendi's eye on a re-lit version, step 3c) |
| 2 | The picture of him is used as the **surface colour** (albedo) of a card and lit again by Blender's lamps, with one flat facing direction (normal 0,-1,0). | He gets his original light *plus* the set's, and every part of him gets the same amount of each lamp: no falloff across his body, no shape. A body would be brighter on the side facing a flare. | OBSERVED in code (`hyenas_set_build.py`, performer material) |
| 3 | The phone footage is already tone-mapped by the iPhone (its contrast curve, sharpening, noise reduction). We decode it as if it were linear scene light, light it, then run our own tone curve over the whole frame. | He gets two tone curves (the phone's and ours); the set gets one. That changes his contrast and saturation against the set. | HYPOTHESIS (test: black/white point and saturation rows of `integration_check.py`) |
| 4 | His brightness is a hand-picked number (`--perf_gain 1.35`, `--perf_back 0.22`). | It was set by eye on one frame, not measured against anything in the set. The colour of his shadows was never matched. | OBSERVED (handoff "Common build options") |
| 5 | Grain is added over the finished frame. | He already carries the phone's noise and sharpening, so he ends up with two layers of grain and crisper edges than the clean render. | HYPOTHESIS (test: noise and sharpness rows) |
| 6 | His edge is EEVEE dithered transparency, with no light wrap in the Hyenas finish (the showroom's `comp_scene.py` had one). | Hard edges with none of the scene's light bleeding round them. | OBSERVED in code |

Items 2-6 can be fixed in our tools. Item 1 can only be fixed by **lighting the shoot** (best), by **re-lighting the
footage** (the relighting tools below), or by hand in After Effects (Grokbot now).

---

## The method, every time

### Step 1: before the shoot (the biggest lever, $0)

The scene comes first. Then he is filmed to fit it.

- **Build the scene in Blender first and write down its light**: where the main light comes from (left/right, high/low,
  in front/behind), its colour, whether it is hard (flame, streetlamp) or soft (sky, window), and how dark the shadow
  side is (key-to-fill ratio). The build script can print this from its lamps. Pick the camera height, tilt and lens there too.
- **Light him to that list on the day.**
  - Key light from the same side and height, in the same colour (a gel or an RGB light).
  - The same dark shadow side.
  - **A rim/back light wherever the scene has bright things behind him**: flares, headlights, a window. On Hyenas that would have been a red-orange light behind him.
  - One cheap RGB light (a tube or panel) covers most scenes.
- **Shoot against a plain backdrop close to the scene's darkness**: dark grey, or green set far behind him and kept dim.
  A bright white wall bounces white light onto his edges and into his blacks. We saw this as "a strip of the take's white wall" (PROBLEM_INDEX).
- **Phone settings: lock everything.**
  - Lock exposure and white balance.
  - 24 fps, with the shutter at 1/48 so motion blur matches the render.
  - HDR video off (or Apple Log on an iPhone 15 Pro or later).
  - The free Blackmagic Camera app locks all of these.
  - Our past cadence and pulsing problems came from 59.94 fps auto-exposure takes.
- **Two seconds of references at the start of each setup**, in his spot and under his light:
  - a grey card or grey ball;
  - a chrome ball, if there is one (it shows where every light is);
  - a colour chart.
  - In Blender, a grey ball at his spot under the scene's light is then the **target** his grey ball must match. This removes the guessing in item 4.
- **Write down the camera height, distance and tilt.** We already match the Blender camera to this (`take_camera`).

### Step 2: one colour space (in our scripts)

- Decode his footage with its **true input transform**:
  - sRGB / Rec.709 for a normal phone take;
  - the Apple Log transform for a Log take.
  - Keep it in linear light, and **do not light it as a surface** (see 3c).
- Render the scene in linear (EXR, as now) and composite in linear.
- **Apply one view transform / tone curve at the very end**, to the finished frame only. His pixels must not get the
  phone's curve plus ours. For an SDR phone take, the finishing curve should be close to identity in the mid-tones, so he keeps his own look and the set is brought to it.

### Step 3: the comp, by measurement

**a. Match grade (black, white, the colour of shadows and of the light).**
- Measure him against the set with `scripts/edit/integration_check.py <final> <matte>`. It prints:
  - black and white point in stops;
  - the colour of his shadows and of the light on him vs the set's (Lab distance);
  - saturation, grain and sharpness ratios;
  - the per-channel gain and lift that would put his shadows and lit areas on the set's.
- This is the classic compositor's "match grade" (blacks to blacks, highlights to highlights, per channel).
- In a night scene the shadows are rarely neutral: they carry the ambient colour. On Hyenas the shadows of the set are warm/red from the flares; his should be too.
- The grade is **linear gain and lift on his pixels only**. His face is graded, never redrawn (SHOT_RULES).

**b. Grain and sharpness.**
- Take the phone's noise off him (a light denoise), and leave the phone's sharpening halos alone, or soften him by the render's lens.
- Then put **one** grain over the finished frame. That grain is stronger in the darks and in blue, as on a phone sensor; `hyenas_set_comp.py` already does that.
- Target: the noise and sharpness ratios near 1.

**c. Light on him that follows the scene (re-lighting).**
- What we have today: the flat card plus `--perf_gain` / `--perf_back`. It cannot give shape.
- The industry route for footage that was not lit for the scene is to **estimate his surface** from the footage:
  - normals (which way each pixel faces);
  - base colour with the light removed;
  - depth and roughness.
- Then let the scene's lamps light that, in Blender or Nuke. **Beeble SwitchLight 3.0** ("VFX Pass Generator") does this:
  - It outputs Normal, BaseColor, Roughness, Specular, Metallic, Depth and Alpha.
  - The desktop app (Beeble Studio) writes 16-bit linear EXR, up to 4K. The cloud version writes 8-bit PNG/MP4, up to 2K.
  - Its normals are object space (OpenGL). Blender's Normal Map node expects tangent space, so it must be set to Object.
  - There is a Blender add-on for importing the passes.
  - There is no documented API, so the step is manual for now.
  - It is a **candidate, not proven on our footage**: hair, his cap brim and face shape on a phone take are the risks.
- **Rule for his face:** re-lighting changes the light on his face but must not change its shape or his mouth.
  - The approved test is the put-back logic: face from the brows down and the mouth keep the take's pixels, graded only by a smooth light map. Or use the re-lit face only if `face_check.py` and `mouth_scan.py` pass and Fendi says it is him.
  - Never a generated face.
- Without a re-lighting tool, the cheap partial fix is a **directional light map** painted over his matte from the scene's light positions: brighter on the side facing a flare, a coloured rim on the edges facing it. It is a grade (gain per pixel), not a redraw.

**d. Edges.**
- Clean the colour of his edge first: decontaminate it of the take's background (`prep_performer.py` already does this).
- Then add a **light wrap**: the scene's light bleeding round his outline, ≤ 0.15 and directional (stronger on the edge that faces a bright area).
  - PROBLEM_INDEX: wrap 0.5 gave a pale rim.
- Match motion blur at 24 fps with a 1/48 shutter.
- Do not choke or re-key a provider matte (PROBLEM_INDEX "Never").

**e. Contact and atmosphere.**
- Contact shadows and ambient occlusion where he meets the ground: we have these.
- Light bouncing up from the ground onto his legs and shoes, in the ground's colour.
- Haze and smoke at his distance in front of him: we have this.
- Depth of field focused on him.

### Step 4: one finish for the whole frame

Glare/bloom from the bright sources goes over him as well as over the set, and so do vignette, the same grain,
chromatic aberration if any, and one encode. `hyenas_set_comp.py` already finishes the whole frame. Keep it that way:
nothing applied to the scene alone after he is in it.

### The check before posting (add to SHOT_RULES posts)

1. `integration_check.py` on a middle frame, plus one frame from the brightest moment (a flare flicker): all rows "ok",
   or the rows that are OFF named in the post with the reason.
2. Watch the whole shot, then the frames side by side with the empty set (`--passes plate`): his blacks next to the
   set's blacks, his shadows' colour next to the set's.
3. Squint test / greyscale test: turn the frame to black-and-white. A paste-up stands out in brightness alone.
4. `face_check.py` + `mouth_scan.py` if his face got any light change.

The limits in `integration_check.py` are **DECISION starting points** (14 Nov 2026). Once Fendi approves a shot as
"filmed there", its numbers become the reference and the limits are re-set from it (with provenance, per
`docs/REPRODUCIBLE_BENCHMARK_SYSTEM.md`).

---

## What to do next (RECOMMENDATION)

| | What | Cost | Who |
|---|---|---|---|
| R1 | Next shoot: light him to the Blender scene's light list, plus a grey ball, chrome ball and colour chart; phone locked at 24 fps, 1/48, HDR off. | $0 + a cheap RGB light | Fendi on set; the agent writes the light list from the .blend |
| R2 | Code: composite him in linear *after* the render (not lit as albedo); one finish curve; match grade from `integration_check.py`; light wrap; denoise then one grain. One change per pass, each measured. | $0 | agent (offline scripts) |
| R3 | Benchmark Beeble SwitchLight 3.0 on one Hyenas shot (verse 26.1, him standing): passes into Blender lit by the set's flares, vs today's card. Judge: `integration_check.py` rows, face proof, Fendi's eye. Kill criterion: face shape or mouth changes, or flicker in the normals across frames. | trial / one plan month (check price before buying) | Fendi approves the spend; agent runs it (desktop app on the Mac) |
| R4 | Run `integration_check.py` on the eight delivered Hyenas shots (on the Mac, where the files are) and give Grokbot the printed match grade per shot as his starting point in After Effects. | $0 | agent on the Mac session |

Sources (research 14 Nov 2026):
- Beeble pass list, formats and limits: [docs.beeble.ai](https://docs.beeble.ai/llms-full.txt), [VFX Pass Generator](https://docs.beeble.ai/beeble/vfx-pass-generator), [SwitchLight 3.0 (CG Channel)](https://www.cgchannel.com/2025/11/beeble-launches-switchlight-3-0/), [Beeble Studio, 4K desktop (Digital Production)](https://digitalproduction.com/2025/12/10/beeble-studio-4k-ai-relighting-on-your-desktop/), [shooting for AI relighting](https://beeble.ai/blog/shooting-for-ai-relighting).
- Black/white point matching, light wrap and grain matching: Steve Wright ([Routledge, *Digital Compositing for Film and Video*](https://www.routledge.com/9781138240377)).
- Blender view transforms (AgX/Filmic vs Standard) and footage colour spaces: [Blender manual, Displays and Views](https://docs.blender.org/manual/en/dev/render/color_management/displays_views.html).
