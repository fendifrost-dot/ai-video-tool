# Handoff: c033 BODY-ONLY placed in the showroom with Blender (19 Oct 2026)

**Status:** CODED + RENDERED offline (room v5, merged in #351, squash `8277701`). Nothing is on the board or in the Cut.
**Fendi's note (19 Oct, after room v5):** "there is bleed I believe from the headlight effect, it looks like I'm coming out of the environment."
**Fixed on 20 Oct as v6.** The comp's edge wrap was lowered from 0.5 to 0.15 (`lens.wrap`). See item 0. Fendi: "That one is solid."
**v7 (20 Oct):** a livelier penguin in place. Fendi: "not enough movement still … it can walk away from me".
**v8 (20 Oct):** the penguin walked away. Fendi: "That looks terrible … Remove the penguin from the scene altogether … It looks AI generated and cheesy."
**v9 (20 Oct, CODED + RENDERED, current; Fendi has not judged it):** no penguin; the clean still shows the cabinets and floor where it stood. Static `436ffebe`, tight `835a050b`, dolly `567e8ff7` (VERIFIED: face 36.3 / 38.3 / 36.5 dB median, timing 111/111 each). Do not bring back a cut-out animal (see the write-up's v9 section).
**Room 2 (22 Oct, CODED + RENDERED, current; Fendi's pick of the Gemini rooms):** he stands just beyond the island's far end of Gemini still `49041b07`, the blue Ferrari behind him. **v2** (the outline fix for his "flashing around the entire outline of my upper body"): static `b2ad4ae6`, tight `9271b8eb`, dolly `28d2190b`, plate `9addb550` (VERIFIED: face 35.7 / 38.5 / 35.7 dB median, timing 111/111 each). Cause VERIFIED: the 24p take's outline jumped on each new picture against the dark window. Fendi has not judged v2.
**Spend: $2.36** (ledger rows 148–157), all on the room (stills and plates), none on him. Room 2 itself added $0 beyond its Gemini still (row 157).

Write-up: [`docs/research/results/2026-10-19-blender-showroom/BLENDER_SHOWROOM_C033_2026-10-19.md`](../research/results/2026-10-19-blender-showroom/BLENDER_SHOWROOM_C033_2026-10-19.md)
Canonical method: [`docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md`](../recipes/FACE_PRESERVING_CLOTHING_SWAP.md)

## Done (in this PR, with the asset IDs in the write-up)

- **Scene:** `scripts/edit/blender/showroom_c033.json`. Every value is labelled MEASURED / SPEC / ESTIMATE / DECISION.
- **Scripts:** `scripts/edit/blender/`:
  - `room_layers.py`, `snow.py`, `room_motion.py` (room v5: the room moves with no generative video)
  - `prep_performer.py`
  - `build_scene.py` (Blender 4.5.9 LTS)
  - `measure_plate_light.py`
  - `comp_scene.py`
  - `verify_scene.py`
  - `review_clips.py`
- **Reproduce:** `scripts/edit/reproduce_c033_showroom_blender.sh` (`MOVE=static|dolly|tight`). It checks the inputs by sha256 and prints the decoded MD5.
- **Fendi's notes, all applied:**
  - His height (6 ft 3 in): he is sized from it, and the room is scaled 0.95 at his direction.
  - "The penguin is perfectly still": it now moves in place.
  - A blue Ferrari Purosangue with LED flicker.
  - Snow in the wind, and a UFO chasing a flying Tesla Roadster outside: **rejected** in plates v3 and v4 ("scrap the UFO and Tesla").
  - "Looks AI generated and antithetical to our whole approach": room v5 replaces every generative motion with Blender and fixed curves:
    - Blender particle snow in a gusting wind;
    - branch sway;
    - rolling-shutter LED bands (his "natural rolling flicker", not flashing);
    - the penguin's own pixels moved.
  - "The Ferrari appear to be larger than the other truck": measured at 1.92 m against a 1.589 m spec, now shrunk ×0.828 on the same spot.
- **Rendered and filed in AVT (unassigned edited_clip), room v5 (plate `0fc2cf8c`):**
  - matched camera `30f71856` (with song `2df713e3`, side-by-side `8883b4d2`, face pair `a6d442b5`);
  - tight `7adff8e9` (with song `9254ba24`, face pair `7a9ad53f`);
  - dolly `a74c3c90` (with song `f46ba962`, side-by-side `afb9ed1e`, face pair `6c257bdb`).
- **Superseded, on the rejected plate v3:** matched `98d1d04e`, tight `63a101f1`.
- **Storage only:** the `.blend` files and the floor plan.

## Not done: what needs a person or a later session

S. **The reshoot (23 Oct): received, placed in room 2, the clothing swap DONE on the c033 window (room 2 rendered dressed); c044 and c009 carry his real takes; the still-mouth tool is merged, its redeploy unverified.**
   - **Takes on AVT** (reference_video, project YSL, uploaded by the Mac session): overhead `a38e403f` (HALF_SONG_FOOT_ON_WALL), `cc3a8a3f` (HALF_SONG_SIDE); LED `92d60797` (IMG_6228), `4dc59481` (IMG_6229), `393cfc88` (IMG_6230). The sixth, FULL SONG FRONT FACING (1.59 GB), exceeded the bucket limit; Fendi has not chosen (recommended: split it losslessly on the Mac).
   - **VERIFIED:** the LED takes are neutral (red/blue 1.02) and sharp; the overhead takes warm (1.11) and hazy. Fendi: use the LED takes. No flicker in either. iPhone 4K HEVC, ~60 fps, rotation −90.
   - **IMG_6228 → c033:** sync take t = song t + 5.7977 s (audio cross-correlation, 20 sd). Window frames 3759–3998 = song 56.9098 s, 240 frames at 1080×1920 59.94: asset **`859308f6`**, on the c033 shot as a performance take, unselected; sync row `d9f88b54`. Geometry MEASURED: 420 px/m at his face, lens 1.54 m, roll −0.40°; scene file `scripts/edit/blender/showroom_c033_room2_reshoot.json` (room, camera and placement as room 2). Matte: `matte-video-proxy` job `4b40d992`, $0.18 (ledger 158); the wall shadow is gone with the matte.
   - **Room 2 static, black outfit (a placement test, $0):** asset **`8bfc21f2`**, review (take | result, with song) `423e2fbc`. VERIFIED by `verify_scene.py`: 120 frames checked, face PSNR median 37.58 dB (min 34.98), timing lag 0 on 119/120, margin median 6.34 dB. Decoded MD5 `e959bf5e4a29937db2bee4f40bc42933`. Not rendered: dolly and tight. For tight, cut the window from the 4K take (the 1080 window gives a 1.28× upscale at 2.0×).
   - **The clothing swap (Fendi: "You didn't do the clothing swap"), the approved c033 look (`YSL_JACKET` v2, the four pieces of job `c817d489`): DONE on the c033 window, $3.405 + $0.18.**
     1. Whole frame (ledger 159, $3.405, job `fa940bc9`, result `fc411c26` on the shot, unselected): **UNUSABLE**. Genjutsu re-staged him ~2.5× larger (he fills little of a full-body frame). It also put a white T-shirt and a gold chain at the neck. Fendi: tacky; remove the chain; the jacket zipped all the way up ("perfect", the approved c033 collar).
     2. The jacket piece `0feb028f` (`character_features.dimensions_description`, in AVT, not this repo) now reads FULLY ZIPPED to the collar, nothing at the neck, no chain. Dry run VERIFIED: the dress prompt carries it.
     3. The swap went on an **enlarged crop** where he fills the frame: `project-clips …/swap-crops/c033_reshoot_IMG6228_crop_243_760_486x864.mp4` (box 486×864 at (243, 760), ×2.22; sha256 `0cbad25c…`), `dress-clip` with `crop {rect {x 0.225, y 0.395833, w 0.45, h 0.45}, window [0, 4.004]}`. Refused twice on an empty Higgsfield **API** wallet (ledger 160–161, $0; the wallet is Control Center's account at `platform.higgsfield.ai`, not plan credits); Fendi topped up; job **`cbde3fdc`** ran (ledger 162, $3.405): 89 frames, 4.0039 s, conformed.
     4. Pasted back (`paste_region_swap.py`, intermediate `5a86dc61`) and put back body-only (`AVT_HEAD_ZOOM=4 body_only_swap.py`): VERIFIED `first face detection at frame 0`, `max |out-original| on face/hair/skin: 0`. Dressed take **`d54cc392`** (on the c033 shot, unselected): jacket zipped, no shirt, no chain, his own glasses. Black Pradas kept (room 2 hides his feet).
     5. Matte of the dressed take: ledger 163, $0.18. **Room 2 static, dressed:** asset **`b17bef97`**, review `ef0581ab`. VERIFIED by `verify_scene.py`: 120 frames, face PSNR median 38.09 dB (min 36.6), timing lag 0 on 120/120, margin median 6.85 dB. Decoded MD5 **`e61413b45443e2b40c9bcb0f99884081`**. The room passes were reused from the black render (same plate); only his fg pass was rendered. Not rendered: dolly and tight.
   - **c044 (the L-platform fashion show) with his real take, $0.25 in mattes — Fendi (23 Oct): "that shot in particular I love … needs to be as close to exact as possible"; the method below changes nothing but him, every other pixel is the montage's own:** `scripts/edit/replace_him_in_clip.py` (merged in #368) puts the matted IMG_6229 window (`2f3723d0`, song 75.885 s, sync z 76) over the Seedance him in clip frames 36–62 (his back on the pillar) and 84–96 (the wide); every cutaway stays; the crossing model stays in front; his light is a skin-to-skin gain from the generated face. Result **`d2b67c49`** on the c044 shot `ebf8f826`, unselected; before/after `ad4c24ab`; decoded MD5 `988930cb820c25ce43d7266e5b2beb10`; ledger 164–165. **Fendi (23 Oct): "that's perfect … actually amazing" — `d2b67c49` is the board pick (assignment `0fc76df1`, `is_primary` true).** Then: "you didn't do the outfit swap" → **DONE, $3.585:** the take window `2f3723d0` (put on the c044 shot, sync row `13bda798` at 75.885 s) dressed through the canonical crop route (enlarged crop 486×864 at (240, 778) cut from the 4K source, `dress-clip` job `eb4ba5a7`, ledger 174: jacket fully zipped, cap, YSL jeans, cream Pradas — the glasses piece dropped, at most 4 pictures, his own glasses kept by the put-back), pasted back (`paste_region_swap.py`, intermediate `b10be8bf`), body-only put-back (`AVT_HEAD_ZOOM=4 body_only_swap.py`: VERIFIED `first face detection at frame 0`, `max |out-original| on face/hair/skin: 0`) → dressed take **`2b0f9208`** (on the shot, decoded MD5 `2dd238181a53eb6299a3a3448bb0a04d`); its matte job `8b267ff0` (ledger 175); the dressed take lifted to native 4K by `scratchpad c044/dressed_4k.py` (the garment region from the dressed 1080, the rest the 4K original; changed area 4.3 % of the frame) and the clip rebuilt with the same segments → **dressed real-him v3 `21b9b341`** on c044, unselected, decoded MD5 `b720daff2f4a980bc9acaff62fb8a670`; before/after with the song `76d49f6e`; ledger 176 ($0). Posted. **Fendi's verdict on it (23 Oct): "the model's face is distorted … different from the original seedance render", "a double outline of me", "a mouth sync on both videos".** Root cause VERIFIED: v2/v3 (and their before/after) were built on `35c85578`, the **lip-sync pass** of the montage (`fal-ai/sync-lipsync/v2`, 17 Oct, already marked unusable: it re-draws every face in the frame), not the original Seedance montage **`60cd0232`**; and the generated him's soft matte edge left a ghost of his cap and head beside the real him. **Fixed as v6 (ledger 177–178, $0.07):** the original montage `60cd0232` with the matte of its shoe-box swap `03794fcc` (job `a4b2cfcd`); `replace_him_in_clip.py` now clears the whole generated-him region (matte > 0.1, dilated) and fills it along the rows (`"fill": "rows"`, a passing train's streaks survive; `median` and `inpaint` kept as options), and the real him is sized and placed by a cover search (scratchpad `c044/align_search.py`: pillar `left_x 198, head_y 284, height 1782`, wide `222, 287, 676`; the generated him was ~15 % larger than the first anchors). Black v6 **`a563f683`** is the board pick now (assignment `0fc76df1` demoted, new row with `is_primary` true); dressed v6 **`eb492043`** on the shot, unselected; before/afters with the song `d21f93ff` (dressed) and `fd1d7e48` (black); v2 `d2b67c49` and v3 `21b9b341` marked rejected/superseded. Decoded MD5s: black `3349578b546ced78605424a5665d3429`, dressed `bb7b51103cfeeb51e742de2274ca9880`. VERIFIED on the zoomed frames 45/62: no ghost outline; the crossing model is the original's. His own take raps in his stretches (the shot is a performance shot). **Then (23 Oct): "the black space around me, the masking isn't accurate … the shoes have black space resembling a bad crop."** Two causes, both VERIFIED on crops: (1) `body_only_swap.py` pasted the swap only where the segmenter saw clothes, and it missed the black patent shoe on the dark floor, so the ORIGINAL shoe's toe and heel stayed where they reach past the smaller cream sneaker → the put-back now also takes any strongly changed pixel next to him that is not protected (`changed & near`), dressed take **`c6454e98`** (put-back v2, proof 0; its matte job `8aa82631`, ledger 179); (2) the compositor's matte edge carried a few pixels of the take's wall shadow and floor, invisible on black, a dark rim on beige → `replace_him_in_clip.py --choke 6 --despill 12` (take px: the matte eroded to his core, his own colours pushed into the feather). Result **dressed v8 `888f7349`** on c044, unselected (assignment row with `is_primary` false); before/after with the song `1e8cef7e`; decoded MD5 `2932fd23e7d6f356fe3e8ed7501c4901`. VERIFIED on crops of frames 50/90: no black at the shoes, no rim. `2b0f9208`/`eb492043` marked rejected. Fendi asked "are we using our recommended system for clothing swap?": yes, the canonical recipe (Genjutsu on the enlarged crop → paste back → body-only put-back, proof 0); the defects were in the put-back's shoe mask and the compositor's edge, not the swap. **Then (23 Oct): "Still some flickering at my hat."** Cause VERIFIED by a per-stage trace of the hat region (frame-to-frame mean |diff|, 1080 take coords y 780–1040, x 360–660): the Genjutsu crop (24 fps and minterpolated 59.94), the pasted full frame and the original take have no periodic spike (take ≈0.2), but every put-back output spiked to ≈1.1 at frames 1, 12, 24, 36 … — the 12-frame GOP of the `cv2.VideoWriter("mp4v")` intermediate that `body_only_swap.py` wrote before its libx264 pass (I-frames re-quantised the cap differently from the P-frames). Fixed: raw frames now go straight into libx264 at the source rate (no intermediate), the brow line is median-smoothed over time and the forehead band comes from the swap. Put-back v6 **`c889f207`** (proof 0; hat spikes gone: diff at frames 12/24 now 0.2/0.4, max over the clip 1.11 at a real head move; the residual ≈0.4 mean is the 24→59.94 cadence of the Genjutsu output itself), its matte job `c1e7337f` (ledger 180, $0.18), native-4K lift, same segments and edge → **dressed v9 `c0619701`** on c044, unselected (assignment `117c8203`, `is_primary` false); before/after with the song `8b1d094e`; decoded MD5 `4a55447901b1a5d052a885a9b4d9e92a`. v8 `888f7349` and put-back v2 `c6454e98` marked rejected/superseded; v8's assignment `1d63ae26` excluded. Black v6 `a563f683` stays the board pick until Fendi passes the dressed v9. **Fendi on v9 (24 Oct): "there's a black space where the hat should be ... there's still some of the old hat that's flashing, pixelating in the frame, especially when the train goes by" (he circled the dark strip under the cream brim).** VERIFIED on 4× crops of the put-back: he wears his black cap low, its brim reaches the top of his glasses, so the ORIGINAL black brim sits below the brow cut and inside the face oval, where every put-back protected it; the Genjutsu cap sits higher and never covered it. A horizontal cut cannot separate that brim from his brows (a band rule down to the eyelids, now in `body_only_swap.py`, still left a strip). **Fendi's direction: "Worst case scenario just change the color of my hat instead of trying to do a swap. You can't see the front of the hat anyway. And darker jeans would look better for this shot."** Done, $0 generation: new `scripts/edit/recolor_cap_jeans.py` keeps every row above his eye line from the take (his own cap, forehead, wall, shadow) and shifts the cap's own pixels to the jacket's cream (sampled: 197,179,148; shading kept), restores the face oval below the eye line from the take (proof printed: 0), and darkens the swap's jeans to indigo (gamma 1.75, tint 0.68/0.75/1.00; median 105,104,104 → ≈46,57,84). Recoloured take **`384bd8ed`** (decoded MD5 `eb8ecf5de468bdcea7a1462f47ce56a7`), matte job `f2cb460b` (ledger 181, $0.18), lifted to native 4K, same segments and edge → **dressed v10 `d945e659`** on c044, unselected (assignment `b67535b0`); before/after with the song `d82177cd`; decoded MD5 `6fdf9058215730697bbc74e7decb690e`. v9 `c0619701` marked superseded. **Fendi on v10 (24 Oct): "Terrible still. Just leave the black outfit entirely and let's see how that looks." DECISION: c044 stays his real take in the BLACK outfit, v6 `a563f683` (board pick, assignment `b2b7e2ce`); v10 `d945e659` rejected, its assignment excluded; the black v6 clip with the song re-posted. No further dressing of c044 unless he asks.**
   - **c009 (lights off, ice on: the dark lounge) with his real take, $0.25 in mattes:** the generated him sat across half the picture with a chain on, so there was nothing to inpaint from: the script's **plate mode** (this PR) rebuilds his stretch (clip frames 51–79, song 16.26–17.43 s) on the lounge still the montage was made from (`worlds/plate_lounge_lights_off_mvc0326x_2.png`, moved by the clip's shake tracked in a fixed window the generated him never enters), with the matted IMG_6228 window (`2ba10a60`, song 14.134 s) standing in front of the couch, the crew behind him, graded by the generated face (gain 0.93 / 0.50 / 0.30 linear). No jewellery on him. Result **`be49e5b0`** on the c009 shot `c99c4596`, unselected; before/after `ca862dc1`; decoded MD5 `63ccbafbbb3094f5c301c0cf81cc7ad0`; ledger 166–168. OBSERVED, not judged by Fendi: his light is flat where the generated him was side-lit; the chain macro at the end is a crew member's (Pelle Pelle jacket), not his.
   - **Standing wardrobe and board rules (Fendi, 23 Oct):**
     - **Black Pradas turn cream on full-body shots:** wherever his feet show, the swap adds the cream Prada America's Cup `5a78f069` as a piece. Not on shots that hide his feet (room 2 behind the island: the black shoes stay, nothing is spent on them).
     - **B-roll with him in it: re-render the approved shots as the same scene with NO mouth movement** (Fendi, 23 Oct). He is never seen mouthing words outside the performance shots. A generation pass per shot: list the primary clips of the non-performance shots he appears in, dry-run, bring him the count and the cost before spending.
       - **Scan of the cut on 23 Oct (VERIFIED by face strips, every 10th frame):** the only primary clip with him in a non-rapping shot is the approved Red Line clip `0000c19a` (c037/c039); his lips stay closed for all 241 frames. Nothing in the current cut needs a re-render. The TV-room clips (c025–c033 primaries) are moot: **Fendi, 23 Oct: "The TV sitting was scrapped."** The active board, `video_variations` `c067efb9` "Freezin Every Season · cold runway" (made from Interrupted Broadcast candidate 6 on 17 Oct), still carries the armchair shots c028–c033 and their clips from that scrapped treatment (Fendi: "That was the original treatment which we scrapped"). c033 is the showroom (room 2) now. Do not re-render or re-dress the armchair clips; replacing those slots with the showroom scene waits on Fendi's word.
       - **The intro is scrapped too (Fendi, 23 Oct):** "the whole scene of the men running out the store is cut and we will have no intro." The c001–c007 montages (store robbery, him in c007) are dead; do not re-render, re-dress or place them. The video has no intro scene.
       - **Fendi's marks (23 Oct, from the labelled reel):** b-roll with his mouth still = **c041, c042, c045, c046** (candidate-6 shots `3e33cc6e`, `928ff526`, `8df8cc79`, `3cafe729`) and **c013** (active board `daff32b5`: him in the back seat of the car with the crew and the penguin). **Performance from his real takes** = **c044** (the L-platform fashion show: his leg-on-wall lean take, IMG_6229 / HALF_SONG_FOOT_ON_WALL, in place of the Seedance him; "I love everything about this shot except the inaccurate lip sync") and **c009** (the lights-on / ice-on switch at song 14.68–16.72 s, the dark lounge lit by the crew's ice: one of his new takes placed in it, **no jewellery on him**). **c047** stays as is (he is not in it). The reel's c042/c045/c046 mouth movement came from 17 Oct lip-sync passes (`fal-ai/sync-lipsync/v2`), made before the no-lip-sync rule.
       - **The tool for a still mouth:** `montage-shot` `mouth: "still"` at the Body's top level for a **montage** (#369, merged `42d111c`, redeployed through the Lovable MCP, **VERIFIED live** by a dry run: the prompt carries `Whenever he is on screen his mouth stays closed` and the variant records `mouth: "still"`), and `continuous.mouth: "still"` for a continuous take (#368). The approved b-roll shots are montages, so the montage form was used.
       - **DONE (23 Oct, ledger 169–173, $2.219 each, total $468.43):** the five approved montages re-rendered as the same scenes (their own lines with "rapping" → "his mouth shut", the same takes and plates, 4 s, 720p) with his mouth still, each filed on its shot **unselected**: c041 `27dce8c6` (job `a868b5ed`), c042 `dd0e37e2` (`69e32394`), c045 `ef3c13e4` (`b6c7d9a8`), c046 `61419118` (`9a80f2ba`), c013 `75efaff6` (`dc4cadbd`). Posted to Fendi with still sheets. **Fendi (23 Oct): "All of those pass"** (and later: "pretty similar to the original … some of them are not as good, but for right now, they'll do" — a later pass may improve them; nothing is scheduled) — each is now the board pick (`shot_asset_assignments.is_primary` true on its row: c041 `cb0a6170`, c042 `998de33c`, c045 `6ef9fcdb`, c046 `41d0dd97`, c013 `851939da`; the earlier picks on those shots were already unselected, nothing else changed). **OBSERVED** on the sheets: his mouth reads closed in every frame he is in; the landmarker scan at 2× found his face in too few frames to call it VERIFIED (faces ~60 px, profile). The two parted-mouth frames it found in c013 (30, 35) are the crew camera operator, not him. The black shoes stay (the approved c041/c046 had Genjutsu shoe swaps on top, $3.405 each; not redone, his feet are out of frame by the WAIST_UP rule).
     - **No browser sign-ins for what the MCP can do** (Fendi, 23 Oct: "I keep getting AVT browser requests"). `avt_browser_session` mints a credential he is asked about each time. Reads and rows: `avt_select` / `avt_insert` / `avt_update`; downloads: `avt_signed_url`; functions: `avt_call`. Only a storage **upload** still needs the sign-in (the MCP has no upload tool; `upload-asset` takes raw bytes with headers that `avt_call` cannot send): batch every upload into one sign-in, and only when a result is ready.
     - **Not every scene a performance shot.** The Seedance recreation pass replaces only the performance shots he names (the L-platform lean first); the other scenes keep their narrative and b-roll treatment.
   - **Next performance shots (Fendi):** the subway / L-platform fashion-show shot from the lean takes (IMG_6229, HALF_SONG_FOOT_ON_WALL): him rapping while leaning on the platform, models walking past, trains going by, recreated in Seedance. The black outfit is irrelevant (swapped later). Fendi's three wardrobe notes above apply to every swap.
   - He has no foam boards or video lights yet; the LEDs worked. Two identical soft, flicker-free lights remain the capture-standard recommendation (not bought; ask before any spend).
R. **Room 2: Fendi's eye on v2's outline** (the before / after `6039f53d`, then the three versions).
   - If it still flashes, the levers are in `lens` of `showroom_c033_room2.json`:
     - `edge_tween_px`: wider smears more;
     - `edge_choke`;
     - `edge_colour_from_inside_px`.
   - Only `comp_scene.py` re-runs (~10 min a move); the Blender passes stay.
   - Measure as the write-up does (outline change on new pictures against between) before showing him.
   - **Do not** hold, freeze or carry the matte itself: three such fixes failed (write-up, Room 2).
R2. **Room 2: Fendi's eye** on placement (behind the island's far end), size against the counter (0.927 m), the +0.3 stop exposure, the tight 2.0× and the 0.12 m dolly. Every value is in `scripts/edit/blender/showroom_c033_room2.json`.
0. **The headlight bleed: fixed in v6, awaiting Fendi's eye.**
   - **Test run ($0, frames 60/120/180):** the comp with the wrap at 0.5, at 0.15 and off.
   - **OBSERVED:** at 0.5 the wrap lifted his outline by up to 16–18 levels.
     - It left a pale rim around his cap, jaw and shoulders against the snowy window.
     - On the car side the rim followed the Ferrari's lamps and their rolling band.
   - **DECISION:** wrap 0.15 (`showroom_c033.json`, `lens.wrap`). Only `comp_scene.py` re-ran.
   - **VERIFIED after the fix:** static 36.4 / 34.2 dB, tight 38.2 / 35.9 (10 px in), dolly 36.5 / 33.6; mouth timing lag 0 on 111 / 111 for all three.
   - **v6 files:** static `81989353`, tight `7c341552`, dolly `49bdba39` (with-song reviews in the write-up). The v5 files are superseded.
   - **Still open (low priority):** the tight shot's 5 px outline dip (29.9 dB on frame 184) is not the wrap. See the write-up's correction.
   - **Ask Fendi:** is the halo gone, and does his edge still sit in the room? Lower or raise `lens.wrap` (0–0.5) and re-run `comp_scene.py` only.
1. **Room v5 awaits Fendi's eye** after the bleed fix. Ask:
   - whether the LED bands read as the camera phenomenon he means;
   - whether the Ferrari's size and the penguin's moves read right;
   - whether the snow density is right.
   Every one of these is a value in `showroom_c033.json` (`room_v5`). Retune there and rerun; no generation is needed.
2. **Fendi's eye** on the three versions. Ask in this order:
   - Does he read as standing behind the island?
   - His height against the penguin and the counter.
   - His exposure (+0.8 stop over the measured match).
   - Which framing: wide, dolly or tight.
   - Nothing goes on the board until he picks.
3. **Placing the pick on c033.**
   - It would be a new version on the shot, through the board's own versioning, never by replacing the production clip.
   - Verify by re-querying that only that row changed.
4. **Integration into AVT (not built):**
   - The app has no Blender worker, so this lane runs offline only.
   - The camera measurement (vanishing points) and the performer spot are manual.
   - The body-only put-back is still not in Dress.
5. **Tomorrow's takes:** shoot to the guidance in the write-up (eye-height phone, 3–4 m, tripod, one full-body take).
   - Then run Genjutsu → body-only → this Blender lane per take.
   - A full-body take can stand in open floor with real floor contact.

## How to verify (cheap, distinguishes outcomes)

- **Reproduce room 2.** `MOVE=static scripts/edit/reproduce_c033_showroom_room2.sh` with the stored inputs.
  - Expected decoded MD5 (v2, the scene file as merged): static **07e2787f59861e7f8696e0c29f2e921c**, tight `04b00d03387aa1ad6a88a21ae8ec6abb`, dolly `b9182d91c903aa2e6d6f0151e7626c6a`, plate `29126c0cd09f3a20d221f01f30b3ef94`.
  - v1 (before the outline fix): static `b39ecd1f…`, tight `c886e6e8…`, dolly `b158fd69…`. VERIFIED: the v1 static was rendered twice from scratch to the same MD5 (21 Oct).
  - It snow-renders 240 frames (~1 h CPU) and each move ~1 h. Run each move as its own job; a 2 h background limit stopped one run (it resumes: frames on disk are kept).
- **Reproduce v9.** `MOVE=static scripts/edit/reproduce_c033_showroom_blender.sh` with the stored inputs (room v5).
  - VERIFIED: the room-2 code changes leave v9 bit-identical (an env frame rendered with the old and new code, max difference 0).
  - Expected decoded MD5 (v9, current) **22401387639530934a3e5ac3d6c658e5** (static). Tight: `f27057454327c0763204bc0177c8d538`. Dolly: `61b922fb0788a92941c08e48e951bb4e`.
  - v6 (with the penguin, wrap 0.15): static `4eacb289…`, tight `b9ba7cae…`, dolly `ef590cb5…`.
  - v5 (wrap 0.5): static `f0cd5952…`, tight `9fdbad43…`, dolly `111486d1…`.
  - The plate on its own: the v5 plate was MD5 `ee623d0a5906d76ba41bdf572d5a8484`. The v9 plate (no penguin) is not yet reproduced from scratch: run the script and record its MD5 (`$OUT/plate.mp4`). Compare it first: a different plate means a different Blender particle build or OpenCV.
  - Plate v3 versions: the script at commit `75c1279` (MD5 `aecb5dbc…` static).
  - A different MD5 with identical input hashes means a different Blender/ffmpeg/numpy build. Compare the versions before trusting it.
  - A MISMATCH on an input means the wrong file. Do not edit the hashes.
- **The reshoot's room 2 static** (`showroom_c033_room2_reshoot.json`, take window `859308f6`, matte job `4b40d992`): decoded MD5 **e959bf5e4a29937db2bee4f40bc42933**. The room passes are room 2's (same plate MD5); only his passes differ.
- **The real-him clips (c044 `d2b67c49`, c009 `be49e5b0`):** re-run `scripts/edit/replace_him_in_clip.py` with the clip, its matte alpha, the take window (native 2160×3840 cut from the take at the asset's `take_start_seconds`), its alpha and the `segments` stored in the asset's `metadata_json` (c009 adds `plate`, `track_rect`, `clip_face`). Expected: `uncovered px max 0`, `shake max` ≤ 13 (c009) and the decoded MD5 above (`ffmpeg -f rawvideo -pix_fmt rgb24 - | md5sum`); the report's `faces` must be `[true, true]`, else the gain was 1.0 and he is lit by the white room.
- **`verify_scene.py` on a full-body take:** his face is ~100 px wide at 1080; the script (since #365) searches 360×480 windows at 3× when the 1× box finds nothing. `frames_checked 0` (an empty-array crash before #365) means the search failed, not that the face is wrong.
- **`verify_scene.py` on the result.** Expected (static):
  - face PSNR median ~36 dB (min ≥ 34; dolly ≥ 33.5). For tight use `--inner 10`: ~38, min ≥ 35;
  - timing lag-0 fraction **1.0**, min margin > 0 dB.
  - A redrawn or warped face would fall far below 30 dB. A timing slip shows best_lag ≠ 0.

## Guardrails

- Do not re-matte, re-animate the plate or regenerate anything to reproduce. Every input is in storage.
- Do not change `showroom_c033.json` values to make a check pass. A failing check means the inputs or tools differ, and that is the finding.
- Never run a generative pass over his face. Never add lip-sync. Never mark a version accepted for him.
- The repo is public: never commit media of Fendi or the song (renders stay in AVT storage).

## Continuation prompt (copy-ready)

> Continue the c033 showroom Blender build in `fendifrost-dot/ai-video-tool` (Lovable-managed AVT; no standalone
> Supabase, no supabase CLI). Read first, in order:
> 1. `CLAUDE.md`;
> 2. `docs/handoffs/HANDOFF_BLENDER_SHOWROOM_2026-10-19.md` (this file);
> 3. the write-up it links (`docs/research/results/2026-10-19-blender-showroom/BLENDER_SHOWROOM_C033_2026-10-19.md`);
> 4. `docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md`.
>
> **State:** room v5 is merged. The room is a frozen still split into layers; the only motion is Blender particle snow,
> a branch sway, a rolling-shutter LED band on the Ferrari's lamps and small rigid moves of the penguin's own pixels.
> The Ferrari is shrunk to its 1.589 m spec. Fendi's headlight-bleed note is fixed in v6 (edge wrap 0.15).
> Fendi had the penguin removed ("AI generated and cheesy"). The v9 versions, with no penguin (matched `436ffebe`, tight `835a050b`, dolly `567e8ff7`), are filed in AVT, unassigned.
> Fendi has not picked one.
>
> **Current: room 2** (Gemini still `49041b07`; static `18a6ad54`, tight `65df207f`, dolly `e8dff105`; scene `scripts/edit/blender/showroom_c033_room2.json`; reproduce `scripts/edit/reproduce_c033_showroom_room2.sh`).
> **First task:** Fendi's eye on room 2 v2 (static `b2ad4ae6`, tight `9271b8eb`, dolly `28d2190b`). v2 fixes his "flashing around the entire outline of my upper body": the 24p take's outline jumped on each new picture.
> - Read the write-up's Room 2 "Edge flashing" section first.
> - Retune only `lens` in the scene file and re-run `comp_scene.py`. Never hold, freeze or carry the matte across frames: three such fixes failed.
>
> **Earlier (v9 room):** get Fendi's eye on v6.
> - Is the halo gone?
> - LED bands, Ferrari size, snow, framing.
> - Never bring back a cut-out or puppeted animal.
> - Retune values in `showroom_c033.json` (no generation needed) and re-render what changed.
> - Re-verify with `verify_scene.py` and file new versions as new assets.
>
> **Rules:**
> - No image-to-video on the room. Every motion stays Blender or a seeded curve in `showroom_c033.json` (`room_v5`).
> - Never redraw his face, never add lip-sync, and do not reopen the approved BODY-ONLY result (`5482b35b`) or the baseline (`8a527bab`).
> - Nothing goes on the board or in the Cut until Fendi picks a version. Then add it as a new version on c033 and re-query that only that row changed.
> - Post every clip and still to chat as it exists.
> - Dry-run any paid step, report its cost, log it in `docs/LEDGER_YSL_TESTING_BUDGET.md` (last row 179, total $472.26), and ask before spending over $50.
> - Never commit media of Fendi or the song (the repo is public), and never paste a token or a signed URL.
> - Label every claim VERIFIED / OBSERVED / HYPOTHESIS / DECISION / RECOMMENDATION.
> - Reproduce with `scripts/edit/reproduce_c033_showroom_blender.sh`. The plate MD5 `ee623d0a…` is VERIFIED bit-identical from storage.
> - Finish with a verification-first update of this handoff.

## Review request for Grokbot / ChatGPT (optional, paste as is)

> Please review a VFX placement for a music video. A real performer (locked-off iPhone take, framed thighs-up) is placed
> in an AI-generated showroom (locked-off, 24 fps image-to-video).
>
> - **Placement:** behind a kitchen island, so the island hides the hip cut. He is 1.905 m tall; the room is scaled so the island is 0.865 m.
> - **Plate camera, measured from vanishing points:** 29 mm full-frame equivalent, level, 1.65 m high.
> - **Performer:** a camera-facing card at 4.42 m, sized from his stated height; 1.5 m in front of a penguin.
> - **Light:** a measured white-balance/exposure match (+0.8 stop for the nearby downlight). Flashes in the room are followed at 80 %.
> - **Lens:** depth of field f/2 from a depth pass.
> - **Not done:** no shadow, because geometry says it falls behind the island.
>
> What would make it read more like it was filmed there, without regenerating his face or inventing camera angles?
