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
