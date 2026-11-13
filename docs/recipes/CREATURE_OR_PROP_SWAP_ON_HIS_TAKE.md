# A creature or prop swapped into his real take, his face his own pixels

**Status: steps 1 to 4 VERIFIED on Hyenas, 12 Nov 2026 (verse 11.1 to 15.1 s, poodle on a rope → hyena on a chain).
Step 5 is the YSL showroom matte and composite; Fendi's verdict on the Hyenas result is still to come.**

This is the clothing swap ([`FACE_PRESERVING_CLOTHING_SWAP.md`](FACE_PRESERVING_CLOTHING_SWAP.md)) without the
clothes. Do not re-derive it and do not test alternatives first: it is the same engine, the same put-back script and
the same proof.

Fendi, 12 Nov 2026: "Just like in the clothing swap we only replace my face pixels and not the body." and "we know
that the pipeline works … document this workflow so we don't keep relitigating work and wasting time and money."

## When to use it

His real performance take holds something that must become something else and must keep moving the way the real thing
moved: a dog that becomes a hyena, a rope that becomes a chain, a cup that becomes a bottle. He raps in the take, so
his face and mouth must stay the take's pixels.

## What is kept from where

| Part of the picture | Comes from |
|---|---|
| His face from the brows down, beard, ears, visible skin | the take (proof printed: difference 0) |
| Everything else: creature, prop, his body, clothes, hands on the prop, shoes, the room | the swap frame |

The swap frame is the base. Do NOT composite the original him over the swap, and do NOT cut the creature out of the
swap and lay it on the take: the take still holds the old prop (two ropes in one shot, 12 Nov) and patching it out is
the wrong workflow.

## Steps

1. **Cut the window once.** At least 4 s (Genjutsu refuses shorter), at most the swap's limit, 24 fps, from the 4K
   original. Make the 720p copy that is sent AND the larger working copy from the same cut frames, so frame k is the
   same instant in both. (Hyenas: the two copies were cut separately and four swap frames had to be repeated.)
2. **One reference still of the creature or prop** in Gemini (`world-still-proxy`, `model: gemini-nano-banana-2.1`),
   plain background, the pose it holds in the take.
3. **Genjutsu object swap on the 720p window.** `avt_call proxy-provider-call`, body
   `{endpoint: "video-providers-higgsfield-model", method: "POST", body: {mode: "video_to_video", modelVariant:
   "genjutsu-object-swap", resolution: "720p", duration: <whole seconds>, avt_project_id, avt_user_id, promptText,
   referenceVideoUrl, referenceImageUrls: [<the still>]}}`. $0.681 per second. Poll with
   `{endpoint: "video-providers-job-status", method: "GET", query: {provider: "higgsfield", id}}`. Fendi approves the
   swap before the put-back is run. Work at 720p; enlarging is a finishing step after everything is approved.
4. **Put his face back**, swap as the base:

   ```
   AVT_HEAD_ZOOM=3 AVT_MODELS=<models dir> python3 -I scripts/edit/body_only_swap.py <take.mp4> <swap.mp4> <out_dir> --base swap
   ```

   - `--base swap` keeps the whole swap frame and returns only his protected pixels from the take.
   - `AVT_HEAD_ZOOM=3` is required on full-body framing: without it his face was found on 2 of 96 frames; with it, 96
     of 96.
   - Re-timing is on by itself in this mode (`--retime auto`): Genjutsu's clock drifts up to a frame against the take,
     and his real face on a head drawn a frame early gives a doubled cap edge and a white line by the ear. The script
     pairs each take frame with the swap frame showing the same instant and prints how many it moved.
   - A swap that changes no clothes cannot tell the script which face is his, so the largest face in the frame is
     taken. A second person in the shot needs a rule of their own.

   **Pass mark, both printed by the script:** his face found on all, or all but a few, frames; `max |out-original| on
   face/hair/skin: 0`. Then `scripts/edit/face_check.py` for the sheet against his face pictures in the tool, posted
   with the clip. Fendi judges the face.
5. **Into another set: the YSL showroom method, unchanged.** This is recipe E1' of
   [`HIS_FACE_IN_ANY_SCENE.md`](HIS_FACE_IN_ANY_SCENE.md) (c033 showroom, `8a527bab`). Do not build another cut-out.
   - File the step-4 result as a `project_assets` row (`metadata_json`: `bucket`, `mime_type` video/mp4,
     `duration_seconds`), then `avt_call matte-video-proxy {assetId}` and poll `fal-queue-poll-proxy` with the
     returned `status_url` and `response_url`. About $0.07 per 4 s. The answer holds `alpha.mp4` and `color.mp4`.
   - The matte keeps him, the creature and the chain together, thin links included (VERIFIED Hyenas verse 0.9 to 4.9,
     13 Nov 2026).
   - Use the matte as delivered. Do not choke, median, re-key, hold, fill or colour-gate it: choking erased the chain,
     and a fill made his legs flicker (below).
   - Composite with `scripts/edit/composite_over_plate.py`, at true scale and off-centre. Not a scratch compositor: if
     the script lacks an option, add it to the script with a test (that is how `--occlude-y` got there).
   - Measure before posting: `python -I scripts/edit/matte_stability.py alpha.mp4 --fg <put-back>.mp4`. It reports
     dropouts (a part that fades for 1–2 frames) and pop-ins per region, top, middle and **bottom** (legs, feet, the
     creature), plus repeated frames and a frame-count mismatch. Post the numbers with the clip.

   **When part of the matte still flickers (Hyenas, 13 Nov 2026: the bottom of his legs, where they pass behind the
   hyena's back, fades for a frame or two in the veed matte, so the plate shows through his jeans; Fendi on v6: "about
   70% 80% better, but there was drift and flicker on the top of the hyena and slightly on me").** In this order, one per pass, each shown to Fendi as an option:
   1. **Frame it out.** SHOT_RULES 7 is waist up; the failing part is below it. On Hyenas the knees-up window `296ffe6c`
      exists. Ask Fendi whether this shot needs his full body.
   2. **Put the plate in front of it.** `composite_over_plate.py --occlude-y <row>` hides him below that row behind
      the plate, as `place_him_over_plate.py --couch-y` did on c009 v3 (`b06b32f9`, "I like it"). Only where the
      plate has something there to stand behind (a table, a car, a railing).
   3. **Check the cadence.** If `matte_stability.py --fg` reports repeated frames, the outline pops on every new
      picture; the proven fix is compositing-only (c033 room 2: `edge_tween_px`, `edge_colour_from_inside_px`,
      `edge_choke` in `scripts/edit/blender/comp_scene.py`), never a change to the matte.
   **Measured on v6 (13 Nov, `matte_stability.py`):** 96/96 frames paired; 5 repeated picture frames (10, 30, 49, 68,
   88: the put-back's re-timing used five swap frames twice); flagged frames top 31, middle 52, bottom 2. The middle
   count includes fast arm moves (a hand that moves more than its own width in a frame reads as a pop-in), so compare
   counts against the baseline, never as absolutes. The defect Fendi saw is steady, not a flicker: in the stills the
   bottom of his right leg is see-through where it meets the hyena's back on every frame looked at. The
   `see-through` count (added to the script the same day) measures it. Options 1 and 2 hide the hyena with the legs;
   on a hyena shot that is Fendi's call before any pass. The matte-side options:
   3b. **Solidify only the see-through pixels** (HYPOTHESIS, $0): `composite_over_plate.py --solidify-box
      x0,y0,x1,y1` (matte pixels), per frame, nothing carried between frames. The picture there is the put-back's own
      frame (his jeans, the hyena), so no ghost. Pass: `see-through` in the box falls to near 0, nothing changes
      outside the box (`matte_stability.py <out>_alpha_solidified.mkv --baseline <veed alpha>`: added only inside the box), and Fendi watches it.
   4. **A new matte, not a changed one** (HYPOTHESIS, untested): `matte-video-proxy` on a crop of the failing region,
      enlarged, so the model sees the legs bigger; the result is used only inside that region. About $0.07. Measured
      with `matte_stability.py --baseline <veed alpha>`: no added alpha outside the region.

   **v7, the regression (13 Nov 2026). Do not repeat.** The agent added a temporal "dip fill" to its own scratch
   compositor (`lift_comp_clean.py`, not in the repo): a pixel solid on the frames around it was made solid on this
   one, at the same place on screen. His legs move, so the fill drew alpha where his leg had been, not where it was:
   white just outside his outline went from 2,504 to 11,930 pixels (its own count, VERIFIED from its log). It then
   added a per-frame colour gate (skip the fill where the picture is bright and colourless: V > 140, S < 60) to hide
   that, and judged the result with a count of bright colourless pixels (V > 150, S < 45): the gate removed exactly what
   the metric counted, so the number passed by construction (2,499). It measured only a box above the hyena, never his
   legs, and did not watch the final v7. Fendi saw his legs flicker in and out of frame. Why the legs (HYPOTHESIS,
   untested): the fill shows the swap frame's own room where his leg had just been, and the gate switches pixel by
   pixel from frame to frame on light denim and highlights. The same class of fix had already failed on YSL: c033
   room 2 rejected a per-pixel matte hold (ghost trails), a whole-frame hold and a flow-carried matte
   (`docs/research/results/2026-10-19-blender-showroom/BLENDER_SHOWROOM_C033_2026-10-19.md`, "Rejected on the way").
   The baseline is v6: the veed matte as delivered.

   **Wrong tools, tried on Hyenas 12 to 13 Nov 2026 and rejected by Fendi. Do not repeat:** RobustVideoMatting for
   him plus a one-frame SAM mask carried by optical flow for the creature; a SAM 2 tracker; a hand-written rule that
   keeps "what the swap changed" as the chain. Together they leaked the room's door frame as a box round him, left
   white wall between his arm and body on every gesture, broke the creature's legs and frayed the chain. Fendi: "We
   already had a formula that was 100% effective ... refer to the YSL video edit."

## Costs (Hyenas test)

| Call | Cost |
|---|---|
| Gemini reference still | $0.27 |
| Genjutsu object swap, 4 s at 720p | $2.72 |
| Put-back and face sheet | $0 |
| Matte (`matte-video-proxy`), 4 s | $0.07 |

## Mistakes already paid for

- A 2 s window: refused, minimum 4 s.
- Put-back at 720p without head zoom on a full-body take: face found on 8 of 96 frames.
- Original him composited over the swap's creature: two ropes in the shot.
- Take and swap paired by the clock alone: seams round the face on the frames where the swap ran a frame off.
- A temporal fill and a colour gate on the delivered matte (v7): his legs flickered in and out. See step 5.
- Several changes in one pass, through environment toggles in a scratch script, judged on one box: nobody could
  tell which change did what. One change per pass, in a repo script, measured on every region.
