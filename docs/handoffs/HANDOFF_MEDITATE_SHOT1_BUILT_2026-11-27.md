# Handoff: Meditate shot 1 built the approved way; the lane for the other 29 (27 Nov 2026, evening)

From the Mac Studio session that took over `HANDOFF_MEDITATE_SHOT1_REBUILD_2026-11-27.md`. Read that file and
`HANDOFF_MEDITATE_2026-11-26.md` first; this one says what was done, what was measured, and what the next shots need.
Ledger: `docs/LEDGER_MEDITATE_2026-11-26.md` (the T7 copy is the live one). Labels: VERIFIED / OBSERVED / DECISION.

## 1. Where it stands

| | |
|---|---|
| Shot 1 (board `c004`, take IMG_6547 file 35.0-43.0, song 16.886-24.886, 8 s) | v5 built and sent to Fendi 27 Nov, asset `3bde467d`, **pending his word**. The cut plan uses its first 5.894 s |
| Board | variation `b8a2b84e` ("The hall fight") is the project's active one; one scene row + shot row so far (`c004`). The other 29 scene and shot rows are not inserted yet (cut plan: T7 `cut/cut_plan.json`) |
| Other shots | take windows for all 30 shots cut frame-exact (T7 `takes/`); his mattes for c008, c012, c016 done (Beeble, `matte_stability.py` 0 dropouts); those three are prepared up to the fight (T7 `shots/<key>/`) |
| Machine | Mac Studio set up and working: T7 mounts at `/Volumes/T7` after a restart, Blender 5.3.0, `~/.avt-venv`, ffmpeg 9.1 (Homebrew, added today) |

## 2. Fendi's words this session (binding)

- "Why did you keep the pillow", then: **"That's fine if we keep it but can we decorate it"**. DECISION: he sits on a
  cushion built in the scene, decorated: crimson silk, gold lotus embroidery, a gold tassel at each corner (still
  `33c0cfe6`). His own white cushion is cut away with the room. Every plate from now on has the decorated cushion.

## 3. What was measured (VERIFIED with the repo tools unless said)

- **Camera 6547** (`measure_camera_vps.py`, door wall masked): focal 3128.9 px +- 11.2 at 2160 wide (63 deg tall,
  not the 71.9 deg estimated on 26 Nov), tilt 1.24 deg down, roll 3.52 deg, lens 1.00 m over the floor (door as
  ruler), his front foot 2.33 m away. `solve_camera_height.py` cannot run on this take (vertical vanishing point at
  infinity); the solved file was written from the horizon line: T7 `shot1b/cam/vps_6547_solved.json`.
- **Camera 6549**: focal 3094.6 +- 45, tilt 13.9 deg DOWN, roll 3.77 deg (tool); lens about 0.68 m high, 1.35 m from
  him (two-point estimate from his head top 0.913 m over the floor). The 26 Nov "0.4 m, level" was wrong.
- **Cameras 6548, 6550**: ESTIMATES only (too few lines once he is masked; ultra-wide). Numbers and how they were
  got: T7 `cams/cameras_measured_2026-11-27.json`.
- **Light**: the Blender hall's key is now a wide panel behind the camera (the hall's open front), a white card where
  he sits reads sRGB 165,163,161 against his wall's 163,161,157 (`shot1b/light_final.args`). His gain in the
  composite is exactly 1.0 (white plate = white source); the SCENE is balanced to him.

## 4. The lane that produced shot 1, row by row (tools named)

1. `measure_camera_vps.py` on a take frame -> solved camera JSON.
2. `prep_performer.py` (take + Beeble matte) -> `level_and_place.py --plate 1080,1920,1564.45,540,926 --depth 2.33
   --x 505 --lens-height 1.0` -> his cut-out levelled and placed (scale 1.0007).
3. Blender hall from that camera, levelled: T7 `hall/meditate_hall_build_v3.py --level 1` (v2 + the measured
   camera, the cushion, `--pass shadow`, `--pass front`). Empty still -> **Gemini realism pass**
   (`world-still-proxy`, `gemini-nano-banana-2.1`, the Blender still as reference) -> darkened 0.70 stop to his
   exposure (measured on the cushion). The Blender still alone read as a 3D render in the fight clip (try 1).
4. **The fight**: `montage-shot` continuous, `withHim: false`, 8 s, camera worded "locked off ... as if bolted to the
   floor" (the word "tripod" made the model DRAW a tripod, try 1). The tool's fixed "cold blue winter dusk, snow"
   line is still in every prompt: say "no snow, no frost" in the action, and balance the clip afterwards.
5. **Scale (the finding of the day)**: on the EMPTY plate the model drew the fighters about 1.6x too big for where
   they stood (it read the platform as small furniture; try 2). Fix that worked (try 3): his REAL cut-out, frame 1,
   at 0.88 and held inside his own outline, is laid into the plate as a size anchor. The model's copy of him never
   shows: his real take covers it, `lane/anchor_ghost_check.py` counts and removes any robe-coloured pixel outside
   his cut-out (18 px over 5 frames on shot 1), and the prompt forbids anyone passing between the camera and him.
6. Room: `lane/prep_room.py` registers the clip to its plate (Seedance drew it 3-4 % narrower) and balances it on
   the cushion. `setup_comp_inputs.py` (room x his Blender shadow) -> `comp_scene.py` (top light off, f/16: his
   iPhone take is deep focus). `lane/front_layer_over.py` lays the Blender foreground pass (leaves, kicked-up dust)
   over him. `lens_look.py --lens handheld_24` last.
7. Checks: `verify_scene.py` on the composite before the look (face 40.0 dB median, timing lag 0 on 100 % of frames,
   mouth correlation 0.95), `mouth_scan.py` (96 of 96 faces), `face_check.py` sheet, SHOT_RULES 1-7.

The small steps no repo script covered live on the T7 in `lane/` (prep_room, front_people_over, front_layer_over,
anchor_ghost_check, patch_static, make_verify_scene, fill_shadow_steps, prep_shot_6547.sh) and `shot1b/finish_*.sh`.
They are NOT in the repo yet: moving them in is a Class B change (code + tests + one reviewer).

## 5. Tool notes that will bite the next shot

| Symptom | What it was | What to do |
|---|---|---|
| T7 would not mount (macOS error 516) | stale registration after an unmount | restart the Mac; nothing was repaired |
| `matte-video-proxy` (Fal veed) | `fal_submit_failed` three times on this project, nothing billed | Beeble `switchx-background-proxy` (192 frames at most; the asset row needs `duration_seconds` and `frame_count`) |
| Cycles on Metal hangs for ever (macOS 14.2.1, Blender 5.3.0) | waits on `ShaderCache::get_best_pipeline` | the shadow pass runs on the CPU (12 s a frame at 540x960); render every 4th frame and blend (`--step 4`, `fill_shadow_steps.py`): only his soft shadow, never a matte |
| `comp_scene.py` dies on `static_depth` | a macOS `._f_0001.png` sidecar sorted first on the exFAT drive | `find <passes> -name '._*' -delete` before it |
| `avt_file_asset` | `file_mcp_asset` is not deployed | `avt_insert` into `project_assets` and `shot_asset_assignments` |
| EEVEE transparent film leaves volumes out of the alpha | | the front pass is rendered over a white and a black card; alpha = 1 - (white - black) |

## 6. Next, in order

1. Fendi's word on shot 1 v5 (the look, the fight, the cushion). Nothing below is spent before it.
2. Camera 6547's other six shots (c008, c012, c016 prepared; c020, c024, c028 need their mattes): per shot an anchor
   plate from the DECORATED hall still, a fresh fight, the room steps, the checks.
3. Cameras 6549, 6548, 6550: a levelled Blender still each (v3 script needs their cameras added to `--level`), the
   Gemini realism pass with the decorated cushion, then their shots. 6550 is the ultra-wide: measure it properly first.
4. Assembly over the song 0-158 s (cut plan), file checks, the finished video.
