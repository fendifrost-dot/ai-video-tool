# Hyenas: performance shots, handoff for a Claude Code session (13 Nov 2026)

From the chat session that ran 12 to 13 Nov. Fendi stopped that session because it could not play video or measure
frames well enough, and because the whole scene needs an overhaul, not more patching. **Start by reading
`docs/PROBLEM_INDEX.md`, `docs/recipes/CREATURE_OR_PROP_SWAP_ON_HIS_TAKE.md` and `docs/SHOT_RULES.md`.**

## Fendi's verdict, in his words (13 Nov, 03:02 and 03:03 Central)

- "That new test looks better but there is still a lot of flicker around the edges and on my shoes."
- "I've been focusing on the masking because it was so bad but the entire scene looks terrible. There is no movement
  in the scene it looks 2D and not built as a 3D model scene. No smoke no glare no lights or tree movement this needs
  a complete overhaul and not constant patching."
- "We will probably start from scratch on the re generating of the hyena and the background."
- "Even in the side by side my dog is laying down and you have the hyena standing. That is not the mirrored
  movement." Earlier: "I really don't like the hyena not having my dogs movement."

So three things are rejected as they stand: the set (a still Gemini plate, flat), every hyena swap made so far (none
mirrors the dog), and the edges on his shoes and outline in the last test.

## The job

His verse on "Hyenas" (about 47 s). All cutaways are approved and finished. Only the performance sections are open:
his real take, a bright room, full body, his miniature poodle on a rope leash. The poodle becomes a hyena on a chain;
he and the hyena stand in a night safari set with a spotless black G-Wagon. Photoreal, grimy, drill.

Performance sections in the cut (verse seconds; verse time 0 is 45.849 s in the master WAV):
1.5–3.9, 6.7–7.6, 11.1–15.0, 19.0–20.7, 26.4–28.2, 30.4–32.2, 36.0–37.6, 41.7–45.0. Cutaways sit between all of them.

## What must be true of the next version

1. **The hyena mirrors the dog**: the dog's size, its place (at his side, not in front of his legs), and its pose and
   movement, moment for moment. When the dog lies down the hyena lies down. Recipe step 2 on main already says size
   and place; pose is the part no swap has achieved yet.
2. **The set is a moving 3D scene**, built the way the YSL showroom was (PROBLEM_INDEX row "Room motion looks
   AI-made": `scripts/edit/blender/room_layers.py`, `snow.py`, `room_motion.py`, `comp_scene.py`, Blender 5.3; the
   c033 showroom v9 `436ffebe`). Smoke that drifts, flare light that flickers on him and the hyena, glare, trees that
   move, depth between layers. SHOT_RULES 3: a still plate with only him moving reads as a paste-up. That is what
   was shown.
3. **His face, mouth and skin are the take's pixels** (`body_only_swap.py --base swap`, printed difference 0). No
   lip-sync, no face pass.
4. **Edges that hold on his outline and his gum-sole shoes**, measured with `scripts/edit/matte_stability.py` and
   watched as video before posting.
5. True scale from his height (he has said 6 ft 2 in), off-centre, not front and centre.

## What is proven and can be reused

| Step | Tool | Evidence |
|---|---|---|
| Face put-back with the swap as base | `AVT_HEAD_ZOOM=3 body_only_swap.py take swap out --base swap` (re-times by itself) | his face found on 96 of 96 frames on seven sections, 87 of 96 on one (he looks down); max difference 0 on all |
| One matte for him + creature + chain | `matte-video-proxy` (veed), as delivered, about $0.07 per 4 s | keeps thin chain links; nine mattes made |
| Composite | `scripts/edit/composite_over_plate.py --scale 0.817 --cx <per section>` | used for the last five renders |
| Dark jeans the matte dropped | `--key-dark-box` (PR #493), only where the wall behind his legs is light | Fendi: "Perfect" on verse 0.9–4.9 |
| Measuring a matte | `matte_stability.py alpha --fg putback --baseline veed_alpha --box legs=...` | numbers posted for five sections |

## What failed, so it is not tried again

- RobustVideoMatting + a one-frame SAM mask carried by optical flow + a SAM 2 tracker + a "keep what the swap
  changed" rule: door-frame box round him, white wall between arm and body, broken hyena legs, frayed chain.
- A temporal dip-fill and a wall-colour gate on the matte (v7): his legs flickered; the metric shared thresholds with
  the fix.
- A scratch compositor (`lift_comp_clean.py`) in place of the repo script.
- Asking the swap for "a large hyena standing in front of his feet" to hide his shoes: it threw away the dog's size,
  place and movement on seven sections. This was the chat session's own instruction and it was wrong.
- A swap request that only said "moves the way the dog moves": place followed, pose did not (dog lying, hyena
  standing).
- Colour-keying the hyena off the wood floor (brown on brown).
- The plate itself carried a "20" disc on the windshield that showed whenever he moved off it. A cleaned plate is in
  the working files, but the plate is rejected as a whole anyway.

## State of each section

All of these use hyenas that do not mirror the dog and the rejected still plate. They are evidence, not deliverables.

| Window start (verse s) | Swap job | Put-back asset | Locked-workflow render |
|---|---|---|---|
| 0.9 | `f8d1ce17` | `1d0f7af2` | posted; keyed-legs repair approved on this one |
| 5.2 | `1d692fc4` | `181957d8` | posted |
| 11.1 | `891089ad` (first hyena) | `8870611c` | posted |
| 11.1 | `46b321b1` (dog-following request) | `a602f717` | posted as a test; "looks better but still a lot of flicker around the edges and on my shoes" |
| 17.9 | `97e5df82` | `34ba9d0a` | posted |
| 25.3 | `5dcd1289` | `e107fecd` | rendered, not posted |
| 29.3 | `721c6d52` | `adaa0fdb` | matte made, not rendered; the hyena walks and turns |
| 34.8 | `b7a2ba39` | `c572df49` | matte made, not rendered; the hyena is much larger |
| 41.2 | `0c4420f8` | `0989c6c9` | matte made, not rendered |

Every put-back shows 5 or 6 repeated picture frames (the re-timing uses a swap frame twice). The cause is that the
720p clip sent to the swap and the working copy were not cut from the same frames on the first section, and the swap
returns 97 frames for 98 sent. Recipe step 1 covers it: cut the window once.

Project `87fc3244-de44-45a3-b2ba-7fe54222dc90`, variation `f4971915-c776-47e7-abd5-91b4e25d4938`. Hyena reference
still (Gemini) `d82167a3`; it has eye-shine, which every swap copied as glowing white eyes. Rejected plates:
`d1898c89` (with hyena), `bd601f72` (empty).

## Files

On the T7, `/Volumes/T7/Hyenas AVT edit/`:
- `HYENAS MASTER 02.06.21.wav`, `Hyenas B Roll & Performance.MOV` (4K; the take starts at 204.39 s)
- `_avt_work/hyenas_perf_204.39_1080.mp4` (proxy; proxy time = verse time + 2.012 s)
- `_avt_work/hyenas_timing_preview_v4.mp4` (the whole verse with the approved cutaways)
- `_avt_work/perf_handoff/hyenas_perf_working_files_2026-11-13.tar`: for each window the 720p take, the raw swap,
  the put-back and the veed matte, plus the two plate stills and the chat session's state log
- `_avt_work/perf_handoff/final/`: the renders posted on 13 Nov

## Spend in the chat session (list prices)

Nine Genjutsu swaps at $2.72 ($24.48), one refused 2 s job and one Bad Gateway submit whose charges are not known,
nine mattes at about $0.07 ($0.65), about ten single-frame SAM calls of unknown cost, earlier plates and stills. None
of it is in a ledger yet; the Hyenas ledger is still to be written.

## Suggested order for the overhaul

1. The set first, as a Blender room with layers at measured distances and its own motion, shown to Fendi empty and
   moving before he is put in it.
2. One section's swap, with the dog's size, place and pose stated from the take itself, and a reference still
   without eye-shine. Show Fendi the swap in the room, side by side with the take, before anything else is built on
   it. Do not run the other sections until he approves that one.
3. Put-back, veed matte as delivered, repo composite, `matte_stability.py`, watched as video.

## Not known

- Whether Genjutsu object swap can make the hyena lie down when the dog lies down. No request so far has.
- Whether Fendi wants the hyena at the dog's real size (a miniature poodle) or a hyena-sized animal in the dog's
  place and pose. He said "my dogs movement" and "mirrored movement"; size at the dog's own scale comes from recipe
  step 2.
- Whether the gum-sole shoes hold in the veed matte on a moving set. They flickered on the still plate.
- What Grokbot's part is now. The earlier plan had Grokbot finishing in After Effects.
