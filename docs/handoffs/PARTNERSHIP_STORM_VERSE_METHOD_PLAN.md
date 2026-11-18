# Partnership storm verse: the method plan (read before ANY generation on this verse)

Fendi, 17 Nov 2026: "Going forward before you generate anything else you must refer to the issues and proven methods
from YSL and Hyena video. We have already wasted money on proven methods being ignored."

**Gate for every paid call on this verse:** before the dry run, the agent writes in the chat (1) which shot type below
it is, (2) the proven method and the approved asset it rests on, (3) the "Never" items of that row, (4) the price.
No row, no call: say so to Fendi first (`docs/PROBLEM_INDEX.md` rule 3).

## What went wrong on 17 Nov (about $12.04 spent; nothing approved)

| Spend | What was ignored | The note that already said so |
|---|---|---|
| Storm set v1-v4 (free) and its shooting sheet | debris behind and in front of him; a fan on the swap takes | build skill section 3, motion budget (9 Nov): nothing crossing behind his outline, nothing in front, constant light; `HIS_FACE_IN_ANY_SCENE.md` step 0: "nothing crossing behind him, a plain background" |
| Swap on take S5, $4.09 | the take has a fan on the coat and a quilt draped behind him | same; the coat drifts, the matte keeps the quilt |
| v5, v6 composites (free) | local segmenter + colour gate + a homography instead of the matte lane | PROBLEM_INDEX "Him + a creature/prop": `matte-video-proxy` as delivered, `composite_over_plate.py` |
| Storm walk `0f7fd085`, $3.33, then swap on it, $3.41 | the window was not in the look, `motion: "lively"`, a hurricane in his frame, then a swap run ON that storm footage | `BROLL_WITH_HIM_STILL_MOUTH.md`: "The window's outfit is what he wears in the render; to change it, dress the window first" (YSL windows `b6687599`, `d6750713`, used on c045 v2, c046 v2, c042 v4); recipe E4: `motion: "calm"`; section 3: a swap never runs on a frame with crossing motion |

## The verse, by shot type

| Shot | Proven method | Rests on | Never |
|---|---|---|---|
| **P. He raps a line** (real mouth) | `HIS_FACE_IN_ANY_SCENE.md` step A on a real take shot in STILL AIR against a plain wall (take S1 has no fan; check the wall), then E1' (`matte-video-proxy` as delivered + `composite_over_plate.py`) over a CALM moving plate of the place; locked camera, long-lens chest-up frame (Fendi, 17 Nov: 50-100 mm) | c033 showroom `8a527bab`; Hyenas verse 0.9-4.9 | a fan take; anything crossing behind his outline or in front of him; a light sweep; a still plate with a push; any matte hold, fill, choke or colour gate (the quilt key `matte_repair.py --drop-backdrop-hue` is a TEST he has not passed) |
| **W. He is in the storm, mouth at rest** | recipe E4 with the look IN THE WINDOW: (1) cut a silent, still-air window of him; (2) dress THAT window (`dress-clip`, calm footage, put-back, proof 0, `ring_flicker.py`); (3) `montage-shot` with the dressed window as `@Video1`, his face pictures, `sync: loose`, lines naming the coat and hat. The render is born in the Prada coat; no swap ever runs on storm footage | YSL dressed windows `b6687599`, `d6750713` (c045 v2, c046 v2, c042 v4) | a swap on the render of a busy scene; a window in other clothes posted as a candidate; a generated still of him as the face |
| **S. The storm without him** (debris, cars, flags, water) | Gemini still of the place (`world-still-proxy`, `gemini-nano-banana-2.1`), animated with Seedance (`montage-shot` `continuous: {withHim: false}`) | YSL plates; Fendi 9 and 12 Nov | Grok; people in the plate |
| **M. Memories passing** | Fendi and Grokbot, After Effects, silhouettes as on the P&L video | Fendi, 17 Nov | an agent building them into the scene |

Open and untested (say so, never promise): storm motion strength in W with a dressed window (`motion: "calm"` is the
approved setting; "lively" is not); rain laid over P; whether S1's wall is plain enough for the matte.

## PLAN B, DECIDED by Fendi, 17 Nov 2026 (replaces shot types P and W above; do not reopen them)

"The performance shot will not work at all with the clothing swap there is nothing to relitigate. Let's move on and
create the clothing swap with plan b no performance shot STANDING STILL as the world around me is chaos more debris as
the verse progresses flying cars and trees flying pass me. I need to be scaled down and placed further back into the
scene and not at the forefront. Create depth using blender. 50 mm zoom in isn't the right look and if Gemini needs to
create legs and shoes it's fine. All black Americas cup pradas are preferred. Since no mouth movement is being generated
we don't have to worry about being close enough to see me recite the verse. We are going for raw emotion, pain ... the
hurt and pain I felt when I got the call that my best friend of 20 years was murdered the day he graduated from grad
school in a robbery gone bad. I had to be strong for his mother while I was dying inside ... me keeping my composure
through the storm while disaster and turmoil around me."

What that fixes:
- **No performance take and no video swap in this verse.** His mouth never moves in it. No lyric is seen on his lips.
- **He stands still, composed, full figure allowed, small and deep in the frame.** This is his exception to SHOT_RULES 7
  (waist up, never his shoes) for this shot only. Not a 50 mm close-up. Not at the front.
- **The look:** Prada coat with the yellow capelet `d3b89147`, Fendi FF bucket hat `d94f1cd4`, Prada America's Cup
  sneakers, black patent `a4eaa2da` (already in the wardrobe), dark jeans (wardrobe rule "If pants show: dark jeans":
  YSL Mick Long black denim `df104591`). Glasses are his own; never a swap piece.
- **The world is the chaos, and it builds:** light debris at the start of the verse, flying cars and trees by the end.
- **Depth is built in Blender** from layers, not a flat still with a push.
- **The feeling leads:** stillness and composure against the storm. Nothing comic, nothing superhero.

Method per piece (each one named before its paid call):

| Piece | Proven method | Rests on | Never |
|---|---|---|---|
| Him, standing still, in the look, full figure | the skill's "STILL of him in a new outfit" path: his body photo in the tool (`silhouette_front` `1fd67e48` / `posture_neutral` `2ed75b4d`) dressed by Gemini with the four wardrobe pictures, then `still_face_putback.py` (his photo's head pasted back, proof 0), then cut out | Frost the Boss cover v12 `5b825de7` (7 Nov, "Ok I like lift b g2") | feeding that still to a video model (a still of him animated is a stranger); a new face; any mouth movement |
| The place and its storm, moving, without him | Gemini still of LaSalle Street (`2fade1e8` family, cleaned of baked-in debris), animated by Seedance `montage-shot continuous {withHim: false}`; one render per stage of the verse (calm chaos -> flying cars and trees) | YSL plates and Animate the plate | Grok; people; a frozen still with a push |
| Depth | Blender layers: far storm plate, him as a card at his true height (6 ft 3) at a measured distance, near debris and rain in front, one slow camera move with parallax, contact shadow and wet reflection (`scripts/edit/blender/`: `room_layers.py`, `comp_scene.py`) | c033 showroom v9 `436ffebe` | stand-in geometry shown as the look (v4); cards that tumble like paper cut-outs for cars |

UNTESTED, say so when posting: a motionless figure in a hurricane (his coat does not move unless the hem is given a
small wind motion in Blender, which is a test); debris crossing behind a cut-out figure (the YSL seam risk; here the
figure is a still with a clean, fixed matte, which is the easiest case, but it is measured, not assumed).
