# Hyenas: the eight performance shots in the 3D night set, for Grokbot to finish (13 Nov 2026)

**From:** Claude Code (AVT session, 13 Nov) · **For:** Grokbot (After Effects), any agent picking Hyenas up, and Fendi.
Labels: VERIFIED / OBSERVED / HYPOTHESIS / DECISION. Nothing here is marked approved by an agent; Fendi's words are quoted.

This replaces `HANDOFF_GROKBOT_HYENAS_PERFORMANCE_FINISH_2026-11-12.md` (the still-plate version he rejected: "looks
2D", "the placement of me into the shot looks like a 3D person and hyena into a 2D scene") and closes
`HANDOFF_HYENAS_PERFORMANCE_OVERHAUL_2026-11-13.md`.

## What Fendi said (13 Nov)

- The empty set: "The scene looks good."
- Lighting: "I think the lighting does need to be addressed but I also think grokbot can do it in after fx as well so we
  don't need to stress on it if we can't get it right."
- The vicious shot: "I do want a scene with the hyena chomping its jaws in the direction of the camera ... as if it's
  trying to get off the leash and attack somebody. We need that grimy, vicious look."
- The handover: "let's just go ahead and finish the project and get everything ready to pass over to Grokbot."
- The song: "Before we hand off to Grokbot, can you switch out the audio with the correct master track?"

## What each shot is (VERIFIED from the files)

His real take (bright room, full body, poodle on a rope). The poodle is a hyena on a chain (Genjutsu object swap,
720p). The swap frame is the base and his face, beard and skin are the take's own pixels (put-back printout
`max |out-original| on face/hair/skin: 0` on every section). He, the hyena and the chain are cut out together by one
matte and stood in a Blender set (G-Wagon, red flares, smoke, moving plants, a slow push-in): they are lit by the
set's lamps, throw shadows on its ground and hold their place as the camera moves. **Nothing generative touches his
face or mouth. Do not run lip-sync, a face pass, a relight model that redraws him (Beeble SwitchX did: lighter skin,
other features), or Grok.**

## Files

On the T7: `/Volumes/T7/Hyenas AVT edit/_avt_work/grokbot_handoff_2026-11-13/`. `MANIFEST.txt` there lists every
file with its frame count and sha256.

Three files per shot, 1080x1920, 24 fps, the same frame count, frame N of one is frame N of the others:

| File | What it is |
|---|---|
| `hyenas_perf_v<start>_final.mp4` | the shot (no audio) |
| `hyenas_perf_v<start>_matte.mp4` | white = him, the hyena and the chain as they appear in the final. Grass in front of the hyena cuts the matte as it cuts the picture. Smoke that drifts in front of them is NOT in the matte |
| `hyenas_perf_v<start>_plate.mp4` | the same set and camera with the shadows they throw, without them in the picture; same glare, grade and grain as the final |

`<start>` is the verse time of the file's first frame. Also there: `hyenas_timing_preview_v5.mp4` (the whole verse,
30 fps, 1402 frames, the approved cutaways untouched, the eight shots in their slots), the song
(`HYENAS_verse_cut_02.06.21_from_45.849.wav`, 24-bit, verse time 0 at its first sample) and this handoff.

**The song is the 02.06.21 master.** Use that WAV, not the audio of any file made before 13 Nov evening and not
`HYENAS MASTER 12.03.20.mp3` (the December 2020 mix the project was first built on). VERIFIED: the preview's audio is
that master laid directly (0 samples off at five points across the verse); the two masters' verse cuts are on the
same clock (beats within 0.2 ms at nine points), so no picture timing moved. In the app the project song is now
asset `ad358a37` (the same cut as mp3); `38639850` is superseded.

**Two clocks.** Verse time 0 = 45.849 s in `/Volumes/T7/Hyenas AVT edit/HYENAS MASTER 02.06.21.wav`
(master = verse + 45.849). The preview's clock is the verse clock (VERIFIED: cross-correlation against the master at
five points, offset 0.000 s at all five).

| Slot in the preview (verse s) | Master (s) | File `<start>`, frames, covers (verse s) | Preview frames (30 fps) | File frames shown | Asset (project-exports) | The hyena | Status (Fendi's words) |
|---|---|---|---|---|---|---|---|
| 1.500–3.900 | 47.349–49.749 | `v01.40`, 69, 1.400–4.275 | 45–116 | 2–59 | `742c67ec` | lying, whole body | PICK: posted, no words on this shot alone |
| 6.633–7.533 | 52.482–53.382 | `v06.62`, 37, 6.617–8.158 | 199–225 | 0–21 | `8d446dc5` | lying, whole body | PICK: posted, no words on this shot alone |
| 11.000–14.900 | 56.849–60.749 | `v11.10`, 98, 11.100–15.183 | 333–446 | 0–90 | `c0c93026` | lying three-quarter, whole body | ACCEPTED: "Yes this one is hard" ("this is hard means it's good"), said before its clean-up pass |
| 18.867–20.567 | 64.716–66.416 | `v18.73`, 57, 18.733–21.108 | 566–616 | 3–43 | `6bafa28d` | lunging at the camera, jaws snapping | PICK: the scene he asked for; on its swap batch "They all look good" |
| 26.200–28.033 | 72.049–73.882 | `v26.13`, 57, 26.133–28.508 | 786–840 | 2–45 | `c0e59cbe` | large, standing at his feet | ACCEPTED: "Shot is perfect" |
| 30.167–31.967 | 76.016–77.816 | `v30.13`, 57, 30.133–32.508 | 905–958 | 1–43 | `e53c73fd` | walks and turns as the dog does | PICK: on its swap batch "They all look good" |
| 35.767–37.367 | 81.616–83.216 | `v35.72`, 52, 35.717–37.883 | 1073–1120 | 1–39 | `219590fe` | sits at his feet | ACCEPTED: "This one is solid" |
| 41.433–44.733 | 87.282–90.582 | `v41.53`, 90, 41.533–45.283 | 1246–1341 | 0–76 | `004ec1c2` | sits, then moves off | PICK: on its swap batch "They all look good" |

- The slot times are measured on preview v4/v5 (the cut points of the bright-room stretches). The earlier handoff's
  section numbers (1.5–3.9, 6.7–7.6, 11.1–15.0, 19.0–20.7, 26.4–28.2, 30.4–32.2, 36.0–37.6, 41.7–45.0) were rounder.
- Two shots begin 0.1 s after their slot: preview frames 330–332 and 1243–1245 hold the last frame of the cutaway
  before them. No frames of him exist before verse 11.100 and 41.533 in these shots; cut in there, or 3 frames later.
- Sync: file frame f is verse time `<start>` + f/24. The preview maps 24 to 30 fps by nearest frame.
- The filed assets are the versions with the song under them (the `v11.10` one has 97 frames; the package file has 98).
- Fendi on the other seven when asked about re-rendering them with the `v35.72` fixes: "I didn't see the same issue in
  the other ones." DECISION: they stay as posted.

## What is left for you

1. **Light on him and the hyena** (his words above). The matte isolates them in the final; the plate is what is behind
   them, for a light wrap or to re-lay them. The set: white key from camera-left and above, red flares behind them
   left and right (they flicker), smoke plumes over the flares. In the set render he is lit by those lamps with one
   fixed facing, so the red does not rim him the way it would in life.
2. **Size at the end.** He and the hyena come from a 720p swap enlarged 1.5x into a 1080x1920 frame; the set is native
   1080x1920. Enlarge last.
3. **Body holds.** The swap returns about 93 different pictures for 98 frames, so on 5 to 11 frames per 4 s window
   his body and the hyena repeat the previous picture while his face moves on. Not fixed here (one attempt failed).
4. **`v30.13`:** the put-back found his face on 93 of 98 frames of its window. The five frames were not identified;
   check his face on this shot frame by frame.
5. **`v18.73`:** the hyena reaches the take's bottom edge on every frame; the frame is shifted so that edge falls on
   the picture's own edge.
6. **`v01.40`, `v06.62`, `v11.10`:** the take's left edge cut the hyena's hindquarters; a grass clump stands in front of
   the cut. Do not remove the clump.
7. **`v35.72`:** a black wedge on the ground under the chain (about x 620–660, y 1235–1250) is a twig's shadow, there on
   all 52 frames. Only this shot has the slower flare flicker and no litter under the paws.

## Rules

- His face, beard, skin and mouth stay as they are. No lip-sync, no face pass, no model that redraws him.
- No Grok on anything that ships.
- The cutaways and the audio are not touched. Slot boundaries stay unless Fendi moves them.
- An ACCEPTED shot is not replaced by another take or swap without his word.

## Verification (run before anyone judges your version, $0)

```
ffprobe -v error -count_frames -select_streams v -show_entries stream=nb_read_frames,width,height,r_frame_rate -of csv=p=0 FILE
ffmpeg -loglevel error -i hyenas_timing_preview_v5.mp4 -map 0:a -c copy -f md5 -
```

- Expected: each shot's three files report the frame count in the table, `1080,1920,24/1`; the preview reports
  `1080,1920,30/1,1402`; the preview's audio md5 is `6ee44b7bd238732bf9c7454485e36a09` (AAC 320k from the 02.06.21
  master, 0.5 s fade at the end) and its picture stream md5 is `7233b0cc38560e21124c96956987fac2`
  (`ffmpeg -loglevel error -i hyenas_timing_preview_v5.mp4 -map 0:v -c copy -f md5 -`).
- A frame that must change in your version: any frame inside a slot (his light). A frame that must not: any cutaway
  frame, for example preview frame 150 (verse 5.0 s).
- His face: a zoomed strip at 12 fps for every slot, your version under this one; his face pixels inside the matte
  should differ only by your grade.

## What to report back

The file per slot, what you did to it in one line, before/after strips, any slot you skipped and why, and the two
commands' output for your delivery. Do not write "verified" or "approved".

## How these were made (for an agent)

- Per window: the take cut once from the 4K original (98 frames; a 720p copy and a working copy from the same frames) →
  Genjutsu object swap with a hyena reference still in the dog's pose (Gemini) → `scripts/edit/body_only_swap.py
  --base swap --hat-gap-fill off` (`AVT_HEAD_ZOOM=3`) → `matte-video-proxy` on the put-back, used as delivered →
  `scripts/edit/blender/prep_performer.py` → `scripts/edit/blender/hyenas_set_build.py` (Blender 5.3) →
  `scripts/edit/blender/hyenas_set_comp.py`. Layers: `hyenas_set_build.py --passes plate` / `--passes matte`, then
  `hyenas_set_comp.py` on `exr_plate` and `scripts/edit/blender/hyenas_set_matte.py` on `exr_matte`.
- Common build options: `--samples 24 --perf_gain 1.35 --perf_back 0.22 --tuft "-0.70,1.24,0.9;-0.62,1.20,0.8;-0.78,1.28,0.95;-0.66,1.30,0.85;-0.74,1.18,0.75;-0.58,1.26,0.7;-0.69,1.33,0.9;-0.64,1.15,0.7"`.

| Shot | Work folder under `_avt_work/` | Frames | Build options |
|---|---|---|---|
| `v01.40` | `sections/A` (render `v2`) | 69 | `--performer perf --perf_depth performer_depth.npz --perf_masks masks --perf_offset 12 --creature_row 1640` |
| `v06.62` | `sections/B` (`v2`) | 37 | `--performer perf --perf_depth performer_depth.npz --perf_masks masks --perf_offset 34 --creature_row 1640` |
| `v11.10` | `shot1` (`v7`) | 98 | `--performer perf3 --perf_depth performer_depth3.npz --perf_masks masks3 --perf_offset 0 --creature_row 1600` |
| `v18.73` | `sections/C` (`v1`) | 57 | `--performer perf_lunge --perf_offset 20 --shift 110,240` |
| `v26.13` | `sections/D` (`v1`) | 57 | `--performer perf --perf_offset 20` |
| `v30.13` | `sections/E` (`v1`) | 57 | `--performer perf --perf_offset 20` |
| `v35.72` | `sections/F` (`v5`) | 52 | `--performer perf2 --perf_offset 22 --flicker_rate 0.25 --clear_litter 20` |
| `v41.53` | `sections/G` (`v1`) | 90 | `--performer perf --perf_offset 8` |

VERIFIED 13 Nov: re-rendering one middle frame of each of the other seven with these options gave the posted frame
exactly (difference 0.000/255).

- `v35.72` only, on the matte: `matte_repair.py --box 262,560,362,728 --key-v 30,60` (his leg, adds only), then
  `matte_repair.py --box 355,788,398,836 --key-v 22,40 --drop-floor-shadow` (the room's floor shadow at the haunch, on
  his word "Cut it from the matte").
- The running log with every measurement: `_avt_work/sections/sections_notes.txt`. Swap jobs, references and
  put-back assets are in each filed asset's `metadata_json.derived_from`.
- Spend: `docs/LEDGER_HYENAS_2026-11-13.md`.

## Not known

- Whether Fendi wants the body holds fixed before delivery, or the lunging hyena in any other slot.
- Whether you want the mattes or plates in another format (ProRes, image sequences, linear EXR). The EXR frames of
  all three passes are in each work folder (`exr`, `exr_plate`, `exr_matte`); say which and they are re-exported.
- How the shots read as moving pictures in the cut: the agent that made them measured frames and looked at stills; it
  cannot play video. Fendi watched each posted shot.
