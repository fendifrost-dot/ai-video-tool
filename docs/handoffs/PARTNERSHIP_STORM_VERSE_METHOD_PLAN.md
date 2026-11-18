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
