# Building the world around a real performance frame — Grok Image passes 1–6 (2026-10-02)

Fendi's test: take one quality still of the real performance (S11 frame 18, `source_S11_f18.jpg`), ask the model to keep him and build the scene around him — daytime, four children carrying a wheel-less car — because a plate generated *without* him and composited behind him reads as detached. Then: matte him out of the result, animate the empty plate, composite the real performance back in on the song clock. Six passes on grok.com/imagine (same engine as the API's `xai/grok-imagine-image-2.0`), screen captures beside this file.

| pass | prompt move | what landed | what missed |
|---|---|---|---|
| 1 | "keep the man exactly … rebuild everything around him" (edit mode) | he is pixel-identical; daylight brick street; four kids with a car | the car kept its wheels; kids hold it overhead; he reads as a cutout (closet light on him, centred) |
| 2 | wheels off, on the shoulders | wheels gone, kids at the wheel positions | still overhead; same four clone-like kids |
| 3 | Black boys, turned away | Black boys, heads down / turned | overhead; symmetric; **Fendi: "4 of the same kid … me front and centre … not matching the grade … cropped in"** |
| 4 | **"re-photograph as one exposure, not a composite"**: he is re-rendered in the scene's light, left third, mid-ground; four *different* boys, backs to camera, candid | matched grade and shadow, off-centre, four individuals, car on shoulders at the empty wells, asymmetric | he is a re-render, not his frame (fine: the real take goes back in); Grok chose 16:9 |
| 5 | **Fendi's staging**: him on the top step by the door, upper left; boys 5–10 ft in front at the curb walking out of frame right, near one cropped; wide so a zoom-in to head-and-shoulders is possible; 9:16 | exactly that composition, 9:16 | all four boys on the near side; car on the sidewalk |
| 6 | car in the street at the curb; two boys on the far side | car at the curb | far-side pair never takes in the edit chain (the model anchors on the previous frame) |

## What this says

1. **"Keep him exactly" is the wrong instruction for a frame that gets matted out.** It pastes his pixels and composes around a cutout; the result carries the source's light. "Re-photograph the scene with him in its light" integrates him — identity drifts a little, which is irrelevant because the still is the *design* (light, placement, perspective) and the real performance is composited back.
2. **Staging is prompt data, and the artist's staging beats the model's.** Off-centre, mid-ground, kids walking out of frame, the near one cropped — those four words did more for realism than any model switch.
3. **Edit chains converge.** After three edits Grok will not move elements it has already placed (the far-side pair). A fresh generation from the staging prompt with the still as a reference, or the second model (Qwen Image 3 edit), is the next try — both are one call on the API lane (`scripts/broll/world_around.py`).
4. **The camera move is the video step, not the still.** The reveal Fendi describes (tight on his head and shoulders on the stoop → pull back to the boys carrying the car past the curb) is a Seedance 2.5 reference-to-video job: the real take as `@Video1`, this still as `@Image1`, duration = source. Today's Seedance test is the evidence it keeps his face, wardrobe and lip motion through a new camera. If the wide end's lip-sync is loose, the tight start is the real take and only the pull-back is generated.
5. A real shot on a porch remains the strongest option when it can be shot — real light, a real matte, and the camera engine does the pull-back on real footage — with the boys and the car added by the same image-edit lane afterwards.

## Next on the API lane (needs a session: Claude Code with the batch credential)

`world_around.py --still source_S11_f18.jpg --model qwen-image-3-edit --aspect 9:16 --prompt "<pass-5 prompt + far-side pair>"` and the same with `grok-image-2`; gate the picks with `realism_gate.py --look-bank`; then `run_world_batch.py --route seedance_ref` with the S11 4 s cut and the chosen still, prompt = the zoom-out reveal.

## Addendum — the fresh-generation test and Fendi's pick

Fendi asked whether Grok "is incapable of having two boys on each side". A fresh text-to-image generation (no reference, 9:16, Quality 2.0, the staging as one prompt, `fresh_generation_4up_two_per_side.jpg`) put two boys on each side in **four of four** variations, all backs to camera, empty wheel wells. The earlier failures were the edit chain on a side view (where the far pair is mostly hidden by the car body) — not a capability limit. Pass 7 (`pass7_car_closer.jpg`) confirmed the chain will not reframe the man either.

**Fendi's pick: the far-right variation** (`FENDI_PICK_kids_car_from_behind.jpg`) — "the best, most realistic one; even though it added an extra boy that's perfectly fine." It is now the reference for the kids-carrying-the-car concept: from behind, walking away down the middle of the street, parked cars both sides, overcast, grain, the car's weight visibly on shoulders. Rule for the shot list (Fendi): from behind or three-quarter rear ask for four; side-on from the stoop ask for two on the near side and let the car hide the rest ("people's minds may drift to believe there are two other people on the other side of the car they can't see").

Lower half: Fendi's performance is not full-body, so the plate has to occlude him below the waist — the stoop wall/railing and the passing car; the mechanical answer is a foreground-occluder layer in `composite_environment.py` (the car and the boys matted in front of the performer layer), not a prompt. For wide ends, Seedance can carry a full-body render (it did for the Bentley test) while the tight start stays the real take.
