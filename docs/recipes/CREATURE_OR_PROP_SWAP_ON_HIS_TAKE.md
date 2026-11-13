# A creature or prop swapped into his real take, his face his own pixels

**Status: steps 1 to 4 VERIFIED on Hyenas, 12 Nov 2026 (verse 11.1 to 15.1 s, poodle on a rope → hyena on a chain).
Step 5 (lifting him and the creature into another set) is not proven yet and is marked so below.**

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
5. **Into another set (NOT YET PROVEN).** Him, the creature and the prop are lifted off the room together from the
   step-4 result and placed in the set at true scale, off-centre, with a shadow from a matched camera
   (`docs/recipes/HIS_FACE_IN_ANY_SCENE.md`, the YSL showroom method). The person matte (RobustVideoMatting) does not
   take the creature, thin props or light shoe soles; a per-frame mask of those is the open tool gap
   (`docs/capability/GAPS.md`). Check the soles of his shoes on every lift-out.

## Costs (Hyenas test)

| Call | Cost |
|---|---|
| Gemini reference still | $0.27 |
| Genjutsu object swap, 4 s at 720p | $2.72 |
| Put-back and face sheet | $0 |

## Mistakes already paid for

- A 2 s window: refused, minimum 4 s.
- Put-back at 720p without head zoom on a full-body take: face found on 8 of 96 frames.
- Original him composited over the swap's creature: two ropes in the shot.
- Take and swap paired by the clock alone: seams round the face on the frames where the swap ran a frame off.
