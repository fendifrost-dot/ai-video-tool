# Plates that read as real: the prompt recipe (15 Oct 2026)

Fendi, 15 Oct: "I'm not opposed to the AI generated background scenes, but they need to look real … we need to figure
out better prompts to create better realism."

A **plate** is a still of a place with nobody in it, drawn so a performance take can be composited into it. It is
made with `world-still-proxy` (`promptVersion` names the recipe) and filed under `project-references/…/worlds/`.

## What made the first plate read as AI (OBSERVED, c019 test, prompt `plate-v1-2026-10-15`)

- The prompt asked for a look: "cinematic", "35 mm", "light fog so the background drops off", "sodium key".
  The model delivered exactly that: a designed, clean, colour-graded frame. That is what reads as AI.
- It also asked for "true shadows where a person would stand": the model drew the shadow of an absent person.
- Invented geography: elevated tracks and a brick storefront. The real 79th Street Red Line station sits in the
  median of the Dan Ryan Expressway, reached from the 79th Street overpass. A plate that is wrong about the place
  reads as fake to anyone who knows it.

## What made the second plate read as real (OBSERVED, prompt `plate-real-v2-2026-10-15`, same model)

Fendi judged the first "AI generated"; the second set was not posted for judgement before this was written, but the
agent's reading is that they pass as phone snapshots. Fendi decides.

The recipe, in order of weight:

1. **Say it is a mundane phone photo, not a film frame.** "Unremarkable real photo taken on a phone … mundane
   snapshot, not cinematic, no fog, no stylised colour grade."
2. **Real geography, named.** The street, the structure, the signage, the chain store on the corner. The model knows
   real places; naming them pulls in real detail (the red CTA sign, the chain-link on the overpass, the median canopy).
3. **Camera as a fact, not a style.** "Held at chest height, level, wide phone lens." Match the take: the closet take
   is chest height, straight on.
4. **The imperfections a phone makes.** "ISO noise in the shadows, streetlights blown out with slight halation, mixed
   white balance from sodium and LED, a smudge of lens flare, slightly soft corners."
5. **Mess.** "Salt-stained concrete, a bit of litter." Clean is fake.
6. **Nobody in frame; where the person goes.** "The middle of the frame is empty sidewalk where a person could stand
   two metres from the camera." Never ask for their shadow.
7. **Leave out every adjective of taste.** No "cinematic", "moody", "beautiful", "dramatic", "volumetric".

## Cost and models (15 Oct)

| model | route | per still | note |
|---|---|---|---|
| `grok-imagine-image-quality` | world-still-proxy, xAI | $0.07 list | two variants per call is cheap insurance |
| `gemini-nano-banana-2.1` | world-still-proxy → CC, Google | ≈ $0.27 conditional estimate | needs a queued `provider_jobs` row (`jobRowId`); n = 1 |

Both drew a convincing plate from the realism prompt. Pick by composition, not by model.

## Compositing the take onto a plate (what worked on the 4 s test)

Runway `remove_video_background` (SAM3) gave a clean matte through an arm-crossing. The composite is ffmpeg only:
feather the alpha one pixel; multiply the performer by a key gradient (brighter on the key side); darken and warm him
to the plate; defocus the plate slightly; light-wrap only the INNER edge of the silhouette (an outer band is a halo);
grain over everything. Keep his pixels otherwise: identity and mouth timing are then exact by construction.

### In the tool (16 Oct): "Composite over plate"

The same chain, written out as pure pixel code in `src/lib/composite/pixels.ts` (`RECIPE`, version
`plate-composite-v1-2026-10-15`) and run in the browser from a shot's full-screen view
(`docs/recipes/DRESS_AND_INSERT_WORKFLOW.md`, step 6). The knobs, as the ffmpeg chain had them:

| Step | ffmpeg (variant D, 15 Oct) | pixels.ts |
|---|---|---|
| key gradient | `geq=lum='clip(120+140*(X/720)-35*(Y/1280),0,255)'`, multiply | `keyGradient` — the same ramp on x/w, y/h |
| matte | `alphaextract,erosion,gblur=sigma=1.0` | `prepareAlpha` — erode 1 px, Gaussian σ 1.0 (three box passes) |
| inner edge band | `erosion×4,gblur=sigma=5` → `blend=difference` → `gblur=sigma=1.5` | the same |
| grade | `eq=brightness=-0.05:contrast=1.04:saturation=0.9`, `colorbalance=rs=.08:gs=.02:bs=-.08:rm=.05:bm=-.06:rh=.06:bh=-.04` | `gradeForeground` — eq on Y′CbCr (709), colorbalance by lightness band as ffmpeg weights it |
| plate | `gblur=sigma=1.2` (under him), `gblur=sigma=30` (to light him) | `preparePlate` |
| wrap | `blend=screen:all_opacity=0.5` through the edge band | `compositeFrame` |
| grain | `noise=alls=7:allf=t+u` | uniform ±3.5/255 per pixel per frame, seeded (`seededRandom`) so a run repeats exactly |
| output | `-r 24 libx264 crf 18 yuv420p` | VideoEncoder H.264 at the take's size and frame times, `colr` nclx 1/1/1 |

The matte comes from Fal `veed/video-background-removal` (through Control Center) instead of Runway: the Runway
connector is a free plan with 2 credits, and CC holds the Fal key. Its h264 output is an RGB video plus a separate
alpha video; the browser keeps the alpha and his pixels stay the dressed take's own.

### v2 (16 Oct): the director's notes on the first five, and what changed

Fendi on the five Chicago composites (c041, c044, c045, c046, c047 over the still plate `b58cab47`): c041, c046,
c047 good but "completely still… unnatural — some activity needs to be happening within these shots, aside from me
rapping"; c045 "okay, still no movement"; c044 "no good — the end of the shot… drift… the outline of me becomes
white… pasted in."

**c044, the cause (VERIFIED, 16 Oct 03:50 UTC).** Replaying v1's alpha pairing on the two files with the app's own
MP4 parser: the take and the matte both have 89 frames at identical times, but the matte's header length is
4.0489 s against the take's 4.0039 s (one frame of difference a muxer is free to write). v1 paired by time with each
clock normalised to its header length, so from frame 45 on the matte ran ONE FRAME AHEAD of him (43 of 89 frames
mispaired, frame 84 took matte 85). On his fast-moving head at the end of the shot the previous frame's matte leaves
a strip of the take's white wall inside his outline — the white edge. Measured on the filed frame 84: the box left
of his cap holds 192 white-wall pixels under matte 86 and 0 under matte 84. The recipe itself, run offline on the
correctly paired frame, has no rim.

**What v2 does** (`RECIPE.version plate-composite-v2-2026-10-16`, `CAMERA.version handheld-v1-2026-10-16`):

| Change | Where | Why |
|---|---|---|
| The matte is paired FRAME BY FRAME when it has as many frames as the take (always, with this matte model); by time only otherwise, and then each clock ends at its LAST FRAME, never the header | `render.ts` `pairingFor`, `lastShownAt` | the c044 cause; `composite.alpha_pairing` on every filed row says which |
| The edge band is one-sided (a1 − inner, clipped at 0) and multiplied by a1: nothing of it lies outside him | `pixels.ts` `prepareAlpha` (`edge.confined`) | v1's band reached up to a tenth of its strength outside the outline — a faint rim of the take's own background on any plate |
| His outline is cleaned of the take's background: the feather stops at the raw matte (a1 → 0 where the matte is under 0.08), and each feather pixel is unmixed — him = (f − (1 − α)·background)/α with the matte's own α and the background estimated from the pixels just outside him (σ 8). A full-matte pixel is never touched (a stripe at a sleeve's edge stays), a thin limb the matte holds keeps its colour | `pixels.ts` `prepareAlpha`, `cleanEdges` (`decontaminate`) | a white room behind him in every dressed take; the feather blended it into his edge |
| A handheld camera: a seeded sum of three sines (0.19/0.43/1.07 Hz) per axis — ±1.2 % of the short side of drift, ±0.45° of roll, ±0.6 % breathing — applied to the FINISHED frame, so he and the place move together; overscan computed from the amplitudes so no edge shows | `camera.ts`, applied in `render.ts` | "completely still… unnatural" |
| A MOVING plate: **Animate the plate** sends the scene's plate still to Kling 2.5 (image-to-video, 5 s, locked-off camera, traffic/lights/passers-by, centre foreground kept empty; ≈ $0.35) through the existing Higgsfield lane; the server files the clip as a plate of the scene (`lane world_plate_video`, naming its still); every composite of the scene made after it goes over its frames, by time from the take's first frame, holding the last frame if the take is longer | `plateMotion.ts`, `_shared/jobProgress.ts` `filePlateVideo`, `plan.ts` `videoPlatesOf`, `render.ts` video plate | "some activity needs to be happening within these shots" — the place has its own life, and the camera's move reads against it |

**The absurd event (Fendi, 04:50 UTC, on the first moving plate: "That's much better… but I think we need something
absurd happening that catches people's attention and isn't boring"):** the Animate dialog takes one line — what
happens in the place — and `plateMotionPrompt` puts it after the locked-camera base as "one thing happens that
catches the eye and holds it: …", placed in the street, on the far side or in the middle distance, never the centre
foreground (`plate-motion-v2-2026-10-16`). The line is kept on the job and on the plate asset.

The grade, the key gradient, the wrap and the grain are v1's. A composite over a moving plate is named with both
plate ids (`…_<still8>m<video8>_<seed>.mp4`); the moving plate itself goes on no shot and selects nothing.

### plate-motion-v4 (16 Oct 2026): the life is only what belongs to the place

v3's base said "cars and buses pass along the street" for every plate. On the first platform plates (the runway
`d7a2c523`, the walrus `341cbcfb`) the model obliged: the camera rose off the platform and a bus arrived where the
train had been. v4 names the life per kind of place (street: traffic and signals; platform: the train stays or pulls
in, passengers walk; room or train car: people shift, lights flicker) and forbids anything the picture does not hold
("no vehicle where there is no road, no new building, nobody new in the foreground"), and adds "no rise" to the
camera lock. Recorded on every moving plate as `plate_motion.version`.

### plate-composite-v3 (16 Oct 2026): the moving plate starts at the shot's first frame

v2 paired the plate's frame 0 with the dressed CUT's frame 0. The cut carries a head handle (~1.1 s of take before
the shot, never shown), so the shot played plate frames ~26–75 and met the animator's late drift (Kling: a push-in
and traffic from ~3 s on both platform plates). v3 pairs plate frame 0 with the SHOT's first frame (the dress record's
head handle, `plateOffsetSeconds` on the plan) and holds frame 0 under the handle. Recorded on every composite as
`composite.plate_offset_seconds`; `RECIPE.plate.startsAtShotIn = true`. Nothing else in the recipe changed.
