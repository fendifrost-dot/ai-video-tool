# PROBLEM INDEX: symptom → the tool that already fixed it

**Every AVT session sees this file at start (`.claude/hooks/session-start.sh`).** Fendi, 13 Nov 2026: "the agent
overlooked the notes each time, and then when I pointed it out, the agent found the notes and fixed the issue almost
immediately each time, but I still ended up wasting money in hours."

**The rule:**
1. Before you solve anything visible (flicker, edge, face, mouth, matte, timing, a model choice), find its row here.
2. A row matches → use its tool and setting first, unchanged. Do not test alternatives first. Do not write a scratch
   script for something a repo script does.
3. A row's tool fails on this shot → tell Fendi which row, what you measured, and what you want to try, before trying it.
4. **Never** repeat anything in a row's "Never" column. Each one cost money once already.
5. One change per pass. Measure the whole picture, not only the spot you are fixing: every region, his legs and feet too.
   Look at the final file yourself before posting it. A metric must not share thresholds with the fix it judges.
6. A new fix Fendi approves gets a row here in the same PR as the fix.

Deep docs: [`recipes/README.md`](recipes/README.md) (every method with him), [`recipes/HIS_FACE_IN_ANY_SCENE.md`](recipes/HIS_FACE_IN_ANY_SCENE.md)
(the pipeline), [`SHOT_RULES.md`](SHOT_RULES.md), build skill `.claude/skills/avt-music-video-build/SKILL.md`.

## Mattes and composites (him, a creature, a prop, over a plate)

| Symptom | Use (proven) | Proven on | Never |
|---|---|---|---|
| Him + a creature/prop + a chain or leash in one matte | `matte-video-proxy` (veed) on the put-back, **as delivered**; `composite_over_plate.py` | Hyenas verse 0.9–4.9 (13 Nov); YSL c033 showroom `8a527bab` | RVM + a one-frame SAM mask carried by flow; SAM 2 tracker; "keep what the swap changed" rule (door-frame box, wall between arm and body, frayed chain) |
| A part of him or the creature fades for 1–2 frames (legs behind the hyena) | 1. measure: `scripts/edit/matte_stability.py alpha.mp4 --fg fg.mp4` (bottom region included); 2. frame the failing part out (SHOT_RULES 7: waist up; Hyenas has the knees-up window `296ffe6c`) or 3. put a plate object in front of it: `composite_over_plate.py --occlude-y Y`; 4. a fix to the matte itself only as a test, shown to Fendi as an option, with `matte_stability.py --baseline` printing `added 0` outside its region | c009 v3 `b06b32f9` (occlusion line); recipe Creature step 5 | **Holding, freezing, dip-filling or flow-carrying the matte** (YSL c033 room 2: ghost trails, a strip of wall by his face; Hyenas v7, 13 Nov: legs flickered in and out); a per-frame colour gate on the matte; median, choke or re-key ("choking erased the chain") |
| A dark garment fades in and out or stays see-through (his black jeans at the hyena's back) | check the put-back picture behind it; if the wall is light: `composite_over_plate.py --key-dark-box x0,y0,x1,y1` (`matte_repair.py`: per frame, adds only dark regions touching him); measure with `matte_stability.py` (dips up to 4 frames, "see-through") | Hyenas v6, 13 Nov: leg flicker 9.84 → 5.28; Fendi: "Perfect" (verse 0.9) | a temporal fill; `--solidify-box` alone (it misses a fade open to the background); cropping the creature out without asking |
| His outline flashes on every new picture | cadence: `matte_stability.py --fg` prints repeated frames (24p content in a 59.94 file); compositing-only fix: `edge_tween_px 3`, `edge_colour_from_inside_px 1.5`, `edge_choke 0.15`, `wrap 0` (`scripts/edit/blender/comp_scene.py`) | c033 room 2 v2 `b2ad4ae6` (outline 3.7× → 1.1×) | per-pixel matte hold, whole-frame hold, optical-flow-carried matte (all three rejected) |
| A strip of the take's white wall inside his outline on fast moves | pair matte and picture **frame by frame**; frame counts must match (`matte_stability.py --fg`) | c044, 16 Oct (`pixels.ts pairingFor`) | pairing by clock with header lengths |
| Pale rim / halo round him on a dark plate | edge decontamination (unmix, feather stops at the raw matte), light wrap ≤ 0.15 or 0 | c033 v6 (`lens.wrap` 0.15), `pixels.ts cleanEdges` | wrap 0.5 (pale rim on cap, jaw, shoulders) |
| He looks pasted on a still; the scene is flat, nothing moves (smoke, glare, lights, trees) | a BUILT scene: the still split into layers moved in Blender (smoke, light flicker, tree sway, a camera move with parallax), his light following the scene's; method: `scripts/edit/blender/` (c033 showroom) | SHOT_RULES 3; c033 showroom | a still JPG plate with a 3 % push-in (Hyenas, 13 Nov: "looks 2D … no smoke no glare no lights or tree movement") |
| A swapped creature does not move like the animal it replaces (dog lying, hyena standing) | before any put-back: side by side, take vs swap, pose matched frame by frame; reference still in the animal's pose and size, placed where it is | Hyenas, 13 Nov (failed) | judging the swap from stills; patching the matte of a swap that already fails this |
| Room motion looks AI-made | Blender room layers: `room_layers.py`, `snow.py`, `room_motion.py`, `comp_scene.py` (Blender 5.3) | c033 showroom v9 `436ffebe` | — |

## His face, the put-back and the swap

| Symptom | Use (proven) | Proven on | Never |
|---|---|---|---|
| Face found on few frames | `AVT_HEAD_ZOOM=4` (3 on full body) on `body_only_swap.py` | c033; Hyenas 96/96 (2/96 without) | — |
| Doubled cap edge, white line by the ear (swap-base put-back) | `--base swap` re-times by itself (`--retime auto`) | Hyenas 12 Nov | pairing take and swap by the clock alone |
| The old prop still shows (two ropes) | `body_only_swap.py --base swap`: the swap frame is the base | Hyenas 12 Nov | compositing the original him over the swap; cutting the creature out and laying it on the take |
| Cap pulses every ~12 frames | no mp4v intermediate (its GOP pulsed the cap) | c044 v9 `c0619701` | calling it mask jitter |
| Clothes update slower than he moves | `swap_rate.py` interpolates the swap to the source's rate (inside the put-back) | 24 Oct rule, c033 / c044 | per-frame swaps of the full take |
| Brim or seam flickers | `ring_flicker.py` and `hat_geometry.py` against the original's own numbers | c041 v2 | `AVT_HEAD_FIT=1` (2–6 px jitter); judging from stills |
| Proof of the put-back | `max \|out-original\| on face/hair/skin: 0` printed by the script; `face_check.py` sheet posted with the clip | every approved swap | posting without the printed 0 |
| A swap window refused | Genjutsu needs ≥ 4 s; cut the window once, the 720p copy and the working copy from the same frames | Hyenas 12 Nov | two separate cuts (frames drift) |
| A light or a train crossing behind him smears the swap | keep it out of his frame (build skill §3); gap G1 in `capability/GAPS.md` | YSL headlights, train | promising a fix no tool has |

## Him in generated shots, models

| Symptom | Use (proven) | Proven on | Never |
|---|---|---|---|
| Generated b-roll of him, face not his | recipe F: `montage-shot` with his `character_features` face set + `@Video1` = his real non-rapping footage; re-roll on rejection | c026 `081a4ddf`, c033 `20b8c185`, c039 `d90d6f29` ("PERFECT!") | a generated still of him as the face source; text-to-video of him; refusing because he never filmed the action |
| His mouth moves in b-roll | `montage-shot` `mouth: "still"`; check with `mouth_scan.py` | c041–c046 re-renders | generated lip-sync; any face-altering pass |
| A bystander who looks like him talks | `mouth_scan.py`; a talking lookalike is a reject | c013 | posting it "for the record" |
| A still that must look like a photograph | Gemini `gemini-nano-banana-2.1` via `world-still-proxy`, `model` named on every request | YSL plates | Grok (the tool's default is still Grok) |
| Animating a still / clothing on real footage | Seedance (`montage-shot`) / Genjutsu (`dress-clip`) | YSL | `grok-broll-proxy`, any `grok-imagine-video*` |
| Grok is the right tool | Fendi makes it in Grok Imagine, or his words go in `grok_approval` on `avt_call` | 12 Nov | a Grok generation without his words |

## The build (storyboard, slots, handoffs)

| Symptom | Use (proven) | Never |
|---|---|---|
| Unwanted people or props in a shot | they come from the plate: one clean plate per scene, the cast only in cutaways (skill lesson 4) | re-rolling the prompt |
| Shots in one outfit look the same | vary lens, distance, side, action at storyboard time (lesson 5) | more rolls of the same staging |
| Times disagree between people | write both clocks, song and file (lesson 3) | one unlabeled time |
| A beat Fendi loved never reached the screen | a slot holds one beat; name the beat per slot (lesson 2) | squeezing a 4 s render into a short slot |
| A scrapped stretch came back | demote its primaries the same hour (lesson 1) | listing it in a later handoff |
| A delivered cut is "done" | verify the file: frames, audio vs the master, per-frame PSNR vs the last version, mouth scan (skill §6) | watching it and trusting the cutter's claims |
| A decision lives in an open PR | merge it; a policy on a branch does not exist for the next agent (lesson 15) | starting a video from `main` without it |
