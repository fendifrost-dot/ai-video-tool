# Handoff: Meditate on the Mac Studio, shot 1 rebuilt the approved way (27 Nov 2026)

From the MacBook session "MEDITATE VIDEO BUILD 1" to the new Meditate session on the **Mac Studio** (M1 Max, 32 GB).
Read first, in this order: `CLAUDE.md`, `docs/PROBLEM_INDEX.md`, `docs/SHOT_RULES.md` (rule 7 amended today),
`docs/handoffs/HANDOFF_MEDITATE_2026-11-26.md` (the project handoff: footage, sync, cameras, the step table in
section 2), then this file. Ledger: `docs/LEDGER_MEDITATE_2026-11-26.md` (the T7 copy is the live one).

## 0. Machine and drive (check before anything)

- The AVT T7 (MEDITATE AVT, AVT_MODELS, `_avt_work`) moved from the MacBook to the Studio on 27 Nov. It must mount
  at `/Volumes/T7` exactly. The Studio's own backup T7 must be unplugged: with both in, the AVT one mounts as
  `/Volumes/T7 1` and every path breaks. Never touch the backup drive's contents.
  Check: `df -h /Volumes/T7` and `ls "/Volumes/T7/MEDITATE AVT " /Volumes/T7/_avt_work/meditate_2026-11-26`
  (the folder name ends in a space).
- Setup (the "Copy repos to Mac Studio" session was doing it; finish whatever is missing, Fendi approved it in his
  own words: "Ok basically just move the T7 and you can do the rest"):
  1. Blender 5.3, Apple Silicon, from blender.org, into `/Applications` ("/Applications/Blender 5.3.app/Contents/MacOS/Blender").
  2. `~/.avt-venv`, Python 3.9 or newer: numpy 2.0.x, opencv-python-headless, mediapipe, onnxruntime, scipy,
     scikit-learn, pillow, soundfile, librosa. Models stay on the T7:
     `AVT_MODELS="/Volumes/T7/Hyenas AVT edit/_avt_work/models"` (face_landmarker.task, selfie_multiclass_256x256.tflite, arcface_w600k_r50.onnx).
  3. `~/Projects/ai-video-tool` on `main`, pulled (must contain PR 508: `scripts/edit/blender/level_and_place.py`,
     `setup_comp_inputs.py`, `feet_from_placed.py`, `measure_camera_vps.py`).
  4. Test: `"$BL" -b --factory-startup -P /Volumes/T7/_avt_work/meditate_2026-11-26/hall/meditate_hall_build_v2.py -- /Volumes/T7/_avt_work/meditate_2026-11-26/hall/tex /Volumes/T7/_avt_work/meditate_2026-11-26/hall/studio_test --cam 6547 --still 1 --pct 25 --samples 16 --pre 4 --key 260 --fill 220 --sun 3.2` → "rendered 6547 1".
- State reported by the setup session (27 Nov, OBSERVED, re-check): Blender 5.3.0 installed (official dmg, sha256
  matched); `~/.avt-venv` CPython 3.11.18 with the packages above, all importing; repo at a4a619f1. The backup drive
  was renamed "STUDIO T7"; the AVT T7 first mounted as `/Volumes/T7 1`, was unmounted to remount as `/Volumes/T7` and
  then failed to mount (`fsck_exfat -n`: "appears to be OK"). Fendi was asked to unplug and replug it. The test
  render (item 4) has not run.
- All work files stay on the T7. The Studio is the render machine; Grokbot's box is not involved.

## 1. What Fendi said this stretch (his words, binding)

- "I'm not going to micromanage I need to see the completed product before I can judge it". Build to finished
  shots, check them yourself, then send. No sign-off on layouts or empty scenes.
- "the fight is not just one scene it's fighting all throughout the video": a fresh fight in every shot of the 2:38.
- "The look is off we need old cinema Bruce Lee or IP man quality. The scene and characters look AI generated".
- On shot 1 v4 (a cut-out over a Seedance picture): "That doesn't seem like the approved workflow. Please dig through
  YSL and hyena blender builds and make sure you didn't skip any steps please", then: "Please log this as your first
  mistake ... when we don't follow our verified methods to a T that is totally in our control and preventable. We
  have a proven method for most generations we can not skip steps or innovate unless we are testing a new solution".
  Logged as Meditate mistake #1 (ledger). **Walk the step table row by row, name each row's tool in chat, and say
  so before deviating from any row.**
- The build he wants: "build it in blender with depth camera motion fighting in front of me with haze dust and debris
  kicking up selling the shot as at really happened".
- "In this shot I'm sitting down not standing up so my full body is in view and if camera moves or angles change you
  have seperate angles to cut too or you can regenerate different angles of me using my dna unside AVT if needed as
  long as distances are correct b from me and characters around me and I'm completely built into a 3D space and
  nothing looks 2D".
- Rule 7 amended (PR 548, merged): centre-front with his whole body is allowed when he is proportioned to the scene;
  the ban is on a cut-out of the wrong size (a waist-up cut-out at the front of full-body people).
- ALTER (his take redrawn so he blocks or dodges) is NOT for this shot: "Grokbot didn't realize this is my actual
  footage now a swap so disregard the alter mouth sync". The ALTER tools exist (run sheet
  `docs/recipes/ALTER_ACTION_ON_A_RAPPING_TAKE.md`) for a later, separately agreed shot.
- Higgsfield is topped up (Seedance runs). His Gemini plan makes 3 videos a day.

## 2. Shot 1: what is done and usable

Shot 1 = song 16.886-24.886 (8 s), camera IMG_6547 (front, 1x, 26 mm, 2.3 m, camera 1.0 m over the floor under his
cushion), file 35.0-43.0 (song = file - 18.114). Work folder `/Volumes/T7/_avt_work/meditate_2026-11-26/`.

| Piece | File | State |
|---|---|---|
| Take window 8 s, 1080x1920 crf 14 | `shot1/take_6547_f35-43.mp4` (asset `953ba84e`) | VERIFIED sync |
| His matte (step 5): Beeble (Fal veed refused twice) | `shot1/alpha_6547_f35-43.mp4`, 720x1280, 192 frames | VERIFIED `matte_stability.py`: 0 dropouts or pops in every region; cushion and shoes outside the matte |
| His cut-out prepared for Blender | `scene6547/perf/p_0001..0192.png` (`prep_performer.py --roll 0 --scale 1`) | done |
| The hall lit to HIS take (step 4, part) | `hall/meditate_hall_build_v2.py` (options `--key --fill --sun --card 1`) | VERIFIED: white card where he sits sRGB 160,156,154 vs his wall 163,161,157 at `--key 260 --fill 220 --sun 3.2` (light the scene to match him; his footage gets a gain near 1) |
| Empty relit hall, frame 1 | `hall/v2still/6547/f_0001.png` 1080x1920 | OBSERVED: layout aligned with his take; reads as a 3D render (not photoreal yet) |
| Cut plan, 30 shots over 0-158 s, cameras rotate 6550/6549/6548/6547 | `cut/cut_plan.json` | done |
| Old shot 1 v3/v4, old fight clips (`fight/seedance_6547_v1.mp4`, Gemini clips), `film_6547_v1` plate | `shot1/`, `fight/`, `hall/real/` | **do not use**: warm sun not lit to him, built off method (mistake #1) |
| My own `tools/alpha_over.py`, `tools/film_finish.py` | `tools/` | **do not use**: replaced proven tools without his word |

## 3. Shot 1: what is left, row by row (HANDOFF_MEDITATE section 2, the tools named there)

1. **Step 4, the moving empty hall** from 6547's camera with `meditate_hall_build_v2.py` (lanterns sway, flames
   flicker, incense smoke, leaves, haze), plus dust and debris kicked up off the floor near the fight. Blender only.
2. **Step 7, the fight** on that empty render, camera locked: Seedance `montage-shot` continuous, no him
   (`continuous.withHim: false`), "real footage, not a render", period 1970s Hong Kong film fight, fighters at real
   distances, some passing close in front of the platform. `montage-shot` needs the board: the project
   (`295ebf3f-3d92-449c-be13-e2b0f8b3fbc3`) has NO `video_variations`, `variation_scenes` or `shots` yet, and needs a
   plate asset (`metadata_json.lane = world_still`, `scene_title` = the scene's name, path `worlds/plate_*`). Set the
   board up first (dryRun is free). Pre-flight in chat before the paid call; three tries per shot, then stop.
3. **Fighters in front of him**: their own matte (Beeble `switchx-background-proxy`, 8 s / 192 frames max, 720p;
   Fal `matte-video-proxy` first if it accepts) laid over him (handoff section 3).
4. **Step 6, him in the 3D hall**: the full-body Blender lane approved on Partnership ("Love it you can add it"),
   now on main: `measure_camera_vps.py` / `solve_camera_height.py` on the take → `level_and_place.py` →
   `feet_from_placed.py` → a shadow pass from the hall build with his card at his depth → `setup_comp_inputs.py
   --card ... --white-source 163,161,157` → `comp_scene.py`. Worked example, copy its commands:
   `/Volumes/T7/PARTNERSHIP:CEASE & DESIST AVT Edit/work/church_1m16/run_church.sh`.
5. **Camera motion**: cut between his four cameras (his words), or a real 3D move where everything in frame is
   geometry or a card at its true depth. Never a 2D push on a flat picture (PROBLEM_INDEX "looks 2D"). Move numbers
   from the camera-move library (`avt_camera_move_get`, e.g. CAM03 Push in). Crash zoom / shake on hits = post.
6. **Step 8, the look last**: `scripts/edit/lens_look.py` (`docs/recipes/LENS_LOOK.md`) for the period film feel.
7. **Step 9, checks**: `verify_scene.py` (face pixels, mouth timing), `face_check.py` sheet, `mouth_scan.py`,
   SHOT_RULES 1-7 stated in the post, the file itself watched. Post inline (a phone copy under 30 MB).

Then the other cameras need the same hall from their own camera (6549, 6550; 6548 was drawn too high twice by
Gemini, so build it from Blender or leave it out), and the other 29 shots, each with a fresh fight. Assembly over
the song 0-158 s, file checks, the finished video to Fendi.

## 4. Rules that bite on this video

Lovable only (no Supabase dashboard or CLI). T7 only, never iCloud. No signed URL, token or key in chat, commits or
PRs; no media of him or the song in the repo. No cost figures in chat (ledger only). No Grok on anything that ships;
Kling is not a production route. His face and mouth are his real footage; no generated lip-sync. Light the scene to
match him, never regrade him. Photoreal: every prompt says real footage, not a render. No technical questions to
Fendi; plain words. Merge your own PRs once CI passes and the class gate is met. Post every output inline. Error-spend
target 5-10 % of spend lost to mistakes.

## 5. Open threads

- The MacBook session ("MEDITATE VIDEO BUILD 1") stops working once the T7 leaves it; message it if something here
  is unclear.
- 21 other open PRs were left unmerged on purpose (drafts, conflicting, "do not merge", a security change).
