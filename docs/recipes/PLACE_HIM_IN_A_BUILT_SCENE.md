# Placing him in a built (Blender) scene so he looks filmed there, not pasted

Fendi, 14 Nov 2026: "each time we've done it, it comes out a little off. The color, it looks like I'm pasted into the
scene … This is a standard industry technique … we need to perfect this … it's going to be a regular thing that I do."

The film industry does this on every effects show (actor shot on a stage, environment built in 3D). They do not get it
right by eye in the comp. They get it right in four places, in this order, and **the first one matters most**:

1. **The shoot is lit for the scene** (the scene is designed first, then he is lit to match it). Our route instead, by
   Fendi's choice: an evenly lit 10-minute shoot, then he is **re-lit** to the scene afterwards (step 3c).
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

Items 2-6 can be fixed in our tools. Item 1 is fixed by **re-lighting the footage** (step 3c, Fendi's choice,
14 Nov), or by hand in After Effects (Grokbot now). Lighting the shoot to the scene would also fix it, but it is not
how Fendi shoots.

---

## The method, every time

### Step 1: the 10-minute shoot (Fendi's setup, kept as it is)

**DECISION (Fendi, 14 Nov 2026):**
- No re-lit reshoots, no lighting plans to follow, no backdrop for now.
- His setup is three LED lights, turned on so he is well visible, and the shoot must stay 10-15 minutes, set-up to upload.
- The light match is done afterwards, by re-lighting (step 3c), so the shoot only has to hand the re-light good footage.

That is what his setup already gives. Beeble's own shooting guide for its re-lighting asks for:
- soft, even light with no harsh contrast;
- no blown highlights and no shadows crushed to black;
- correct exposure and white balance;
- standard colour (Rec.709/sRGB, not Log);
- a sharp subject that fills a good part of the frame;
- a tripod;
- nothing crossing in front of him.

Flat light is what a re-light wants: it adds the direction later. ([Beeble, shooting for AI relighting](https://beeble.ai/blog/shooting-for-ai-relighting))

The checklist, all done in the first minute, with nothing to buy:

1. **Phone on the tripod**, at about the height the scene's camera will be.
2. **The three LEDs on him, from the front and both sides**, as now. He is evenly lit: no bright hot spot on his face or cap, no side falling to black.
3. **Camera app settings, saved once and reused.** In the free Blackmagic Camera app:
   - 24 fps, shutter 1/48;
   - exposure and white balance locked after he steps in;
   - HDR off (SDR / Rec.709).
   The phone's own camera works too: AE/AF lock, HDR video off, 24 fps.
4. **Stand a step or two away from the wall.** It stops the wall's bounce and his shadow from landing on him. Any plain wall works; the matte comes from `matte-video-proxy` (or Beeble's alpha), so no backdrop is needed.
5. **Optional, 2 seconds:** hold a grey or white sheet of paper in front of his chest, then start. It gives the measurement a known white.

Lighting him to the scene (key from the scene's side, a coloured rim) would still be the most exact. It stays an
option for a hero shot, never a requirement.

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
- **How we use it (Fendi, 14 Nov: "the beeble re light is the best candidate").**
  - We take only Beeble's **Normal** and **BaseColor** passes: which way each pixel of him faces, and his colour without light.
  - `scripts/edit/relight_from_passes.py` turns them into a smooth **gain** on his own pixels: the set's lamps are lit onto
    his normals and divided by the light already in the take.
  - The result is brighter where he faces a flare, with a red rim on the edges that turn to it.
  - No pixel is redrawn. The gain is blurred so it carries light, not detail, and the script prints the gain's sharpness as proof.
  - Self-test: a synthetic sphere relit within 0.3 % of the truth, its texture kept.
  - Not yet run on his take.
- **Which Beeble product, and where it runs:**
  - The Beeble key we hold (in Control Center, `BEEBLE_API_KEY`) is for **SwitchX**, the only product in Beeble's public API.
    SwitchX regenerates the picture: it redrew his face on Hyenas (ledger row 29) and turned black trousers into blue denim on YSL (row 58).
    **Never use SwitchX on him.**
  - The **VFX Pass Generator** (the passes) is not in the public API.
  - It runs in the Beeble web app: the Creator plan is $19/month for 540 credits, the passes cost 3 credits per second,
    so a 4 s shot is 12 credits. The cloud version is limited to 2K and 8-bit PNG/MP4.
  - Beeble Studio, the desktop app (4K, 16-bit EXR, no credits), runs on an NVIDIA GPU, which the Mac does not have.
  - Prices come from Beeble's pages on 14 Nov 2026; confirm them at purchase.
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
| R1 | Next shoot: the 10-minute checklist in step 1 (tripod, three LEDs even, phone locked at 24 fps, 1/48, HDR off, a step off the wall). | $0 | Fendi on set |
| R2 | Code: composite him in linear *after* the render (not lit as albedo); one finish curve; match grade from `integration_check.py`; light wrap; denoise then one grain. One change per pass, each measured. | $0 | agent (offline scripts) |
| R3 | Benchmark the Beeble re-light on one Hyenas shot (verse 26.1, him standing): VFX Pass Generator on his take, then `relight_from_passes.py` with the set's flares, then the set build as now; vs today's card. Judge: `integration_check.py` rows, `face_check.py` + `mouth_scan.py`, Fendi's eye. Kill criterion: any change to his face shape or mouth, or the light on him flickering between frames. | Creator plan $19/month (12 credits for the shot) | Fendi signs up or confirms an existing web plan; the upload is a browser step (him, or the agent through Claude in Chrome on the Mac) |
| R4 | Run `integration_check.py` on the eight delivered Hyenas shots (on the Mac, where the files are) and give Grokbot the printed match grade per shot as his starting point in After Effects. | $0 | agent on the Mac session |

Sources (research 14 Nov 2026):
- Beeble pass list, formats and limits: [docs.beeble.ai](https://docs.beeble.ai/llms-full.txt), [VFX Pass Generator](https://docs.beeble.ai/beeble/vfx-pass-generator), [SwitchLight 3.0 (CG Channel)](https://www.cgchannel.com/2025/11/beeble-launches-switchlight-3-0/), [Beeble Studio, 4K desktop (Digital Production)](https://digitalproduction.com/2025/12/10/beeble-studio-4k-ai-relighting-on-your-desktop/), [shooting for AI relighting](https://beeble.ai/blog/shooting-for-ai-relighting).
- Black/white point matching, light wrap and grain matching: Steve Wright ([Routledge, *Digital Compositing for Film and Video*](https://www.routledge.com/9781138240377)).
- Blender view transforms (AgX/Filmic vs Standard) and footage colour spaces: [Blender manual, Displays and Views](https://docs.blender.org/manual/en/dev/render/color_management/displays_views.html).
