# Hyenas: the eight close-up performance shots in the 3D night set, for Grokbot (14 Nov 2026)

**From:** Claude Code (AVT session on Fendi's Mac, 14 Nov) · **For:** Grokbot (After Effects), any agent picking Hyenas up, and Fendi.
Labels: VERIFIED / OBSERVED / HYPOTHESIS / DECISION. Fendi's words are quoted; nothing here is marked approved by an agent.

This adds to `HANDOFF_GROKBOT_HYENAS_PERFORMANCE_IN_SET_2026-11-13.md` (the eight wide shots with the hyena). It does
not replace it.

## What Fendi said (14 Nov)

- On the first close-up shot (verse 26.1, with the light pass): "whatever version that's in the video you sent is amazing".
- "yes build them all the same way"
- On verses 1.4, 6.6, 11.1, 18.7, 30.1 and 35.7: "These look amazing"
- **The older shots stay:** "We aren't fully replacing the older shots they are going to be used on a cut screen with the
  new shots". DECISION (his): the 13 Nov wide shots (him full body with the hyena on the chain) and these close-ups are
  used together on a split screen. How the screen is split is not specified; ask him or propose it.
- On the earlier relight: "I hate the red flushing me out it makes the shot look low quality". His own white light stays
  the key.

## What each new shot is (VERIFIED from the files)

His real footage, re-filmed on 14 Nov for resolution: iPhone 14 on a tripod, 4K vertical, 24 fps, about 3 ft from him,
framed from the hips up, no dog. Nothing generative touches him: no swap, no face pass, no lip-sync. Per shot:

1. the window is cut from the 4K original by its own timestamps (no repeated frame);
2. he is cut out by one matte (`matte-video-proxy`, used as delivered);
3. his picture **as filmed** is laid into the Blender night set (G-Wagon, red flares, smoke, moving plants, a slow
   push-in) at the phone's own position. It is not lit as a surface: his face level in the shot is the take's within
   4 % before the light pass;
4. the set's white key is raised (`--key 1800`, was 950) so the scene near him carries the white light he carries;
5. a light pass adds the set's light to his own (85 % his): a red edge on the side away from his lights. It only adds;
   his face is about 24 % brighter than in the take. His face and mouth are his take's pixels, multiplied by a smooth
   gain, never redrawn.

## Files

On the T7: `/Volumes/T7/Hyenas AVT edit/_avt_work/closeup_2026-11-14/deliver/`. `MANIFEST.txt` there lists every file
with its frame count, size and sha256.

Four files per shot, 1080x1920, 24 fps, the same frame count, frame N of one is frame N of the others:

| File | What it is |
|---|---|
| `hyenas_v<start>_3ft_realpixels_key85.mp4` | **the shot Fendi saw**: with the light pass, the song under it |
| `hyenas_v<start>_3ft_realpixels_placed.mp4` | the same shot before the light pass (his pixels as filmed), the song under it |
| `hyenas_v<start>_3ft_plate.mp4` | the same set and camera without him, with his shadow, same glare, grade and grain; no audio |
| `hyenas_v<start>_3ft_matte.mp4` | white = him in the finished frame; no audio |

The take ends at his hips: the frame's bottom edge is the take's bottom edge. Do not move him up or shrink him in the
frame, or the cut shows.

**Two clocks.** Verse time 0 = 45.849 s in `/Volumes/T7/Hyenas AVT edit/HYENAS MASTER 02.06.21.wav` (master = verse +
45.849). File frame f is verse time `first frame` + f/24.

| Slot in the preview (verse s) | File `<start>` | Frames | First frame (verse s) | First frame (master s) | AVT asset (window it was cut from) | The wide shot of the same slot (13 Nov) |
|---|---|---|---|---|---|---|
| 1.500–3.900 | `v01.40` | 69 | 1.386 | 47.235 | `055bc8da` | `742c67ec` |
| 6.633–7.533 | `v06.62` | 37 | 6.596 | 52.445 | `de0f1e27` | `8d446dc5` |
| 11.000–14.900 | `v11.10` | 98 | 11.096 | 56.945 | `6e4ebef7` | `c0c93026` |
| 18.867–20.567 | `v18.73` | 57 | 18.723 | 64.572 | `d187c2b2` | `6bafa28d` |
| 26.200–28.033 | `v26.14` | 57 | 26.139 | 71.988 | `5072bb53` | `c0e59cbe` |
| 30.167–31.967 | `v30.13` | 57 | 30.141 | 75.990 | `c522abeb` | `e53c73fd` |
| 35.767–37.367 | `v35.72` | 52 | 35.725 | 81.574 | `e644a1de` | `219590fe` |
| 41.433–44.733 | `v41.53` | 90 | 41.518 | 87.367 | `d70e1fa4` | `004ec1c2` |

- The wide shots, their layers and their clock table: `_avt_work/grokbot_handoff_2026-11-13/` and its handoff. Both sets
  sit on the same verse clock, so a close-up and its wide shot can run side by side frame for frame (24 fps each).
- In AVT (project `87fc3244`): verse 26.1 is filed as `5af04625` (light pass), `36be755f` (placed), `17a50ff8` (plate),
  `35c66b15` (matte). The other seven finished shots are on the T7 only; their windows are the assets in the table.
- `closeup_2026-11-14/hyenas_timing_preview_v6.mp4`: the verse preview with the close-ups ALONE in the eight slots
  (30 fps, 1402 frames, audio identical to v5, cutaways untouched). It is a reference for timing only. It is **not**
  the intended cut: the cut uses the split screen.

## Checks on the finished shots (OBSERVED, every frame)

| Shot | Held frames (smallest change on him, /255) | Face, light pass vs placed | Light jump frame to frame: his face / the set |
|---|---|---|---|
| `v01.40` | none (11.03) | 1.28 | 0.72 % / 2.10 % |
| `v06.62` | none (6.02) | 1.24 | 1.11 % / 1.84 % |
| `v11.10` | none (7.05) | 1.24 | 1.10 % / 2.20 % |
| `v18.73` | none (11.31) | 1.24 | 0.87 % / 1.95 % |
| `v26.14` | none (4.84) | 1.24 | 1.61 % / 1.95 % |
| `v30.13` | none (9.04) | 1.24 | 1.06 % / 1.92 % |
| `v35.72` | none (10.65) | 1.22 | 2.45 % / 1.88 % |
| `v41.53` | none (8.27) | 1.25 | 0.82 % / 2.18 % |

- `v35.72`: the measure on his face moves more than the set's. HYPOTHESIS: he turns and dips his head in that shot, so
  the band the measure reads is not the same skin from frame to frame. Not checked further.
- `v26.14`: about 0.9 to 1.3 s in, he ducks and the cap covers his face. It is his performance.
- The light pass lifts his black jeans slightly toward a pinkish grey (OBSERVED on `v26.14` frame 52). The `_placed`
  file has none of it.
- The agent that made these looked at frames and measured them; it cannot play video. Fendi watched seven of the eight
  (all but `v41.53`, which he said he did not need to see).

## What is left for you

1. **The split screen** (his decision above): the wide hyena shot and the close-up of the same slot together. Layout,
   which side, a hard line or a gap, and whether both run for the whole slot are open.
2. **Match the two halves.** The wide shots carry the old light on him (Fendi: lighting "does need to be addressed");
   the close-ups carry his white key and the brighter set. Side by side they will differ in his brightness and in the
   scene's. The plates and mattes of both sets are there to grade him apart from the set.
3. **Flares and smoke are in the same phase in every close-up** (each shot starts the set's animation at its first
   frame), and in the same place in the frame. Cut together, or beside the wide shot, that may read as a repeat.
4. **One grain at the end.** Each close-up already has the set's grain over the whole frame, him included.

## Rules

- His face, beard, skin and mouth stay as they are. No lip-sync, no face pass, no model that redraws him. Never SwitchX
  on him (it redrew his face).
- No Grok on anything that ships.
- His white light stays his key; do not flush him red.
- The cutaways and the audio are not touched. Slot boundaries stay unless Fendi moves them.

## Verification (run before anyone judges your version, $0)

```
ffprobe -v error -count_frames -select_streams v -show_entries stream=nb_read_frames,width,height,r_frame_rate -of csv=p=0 FILE
shasum -a 256 FILE
```

- Expected: each shot's four files report the frame count in the table, `1080,1920,24/1`, and the sha256 in
  `MANIFEST.txt`.
- A frame that must change in your version: any frame inside a slot. A frame that must not: any cutaway frame, for
  example preview frame 150 (verse 5.0 s).
- His face: a zoomed strip at 12 fps for every slot, your version under this one; his face pixels inside the matte
  should differ only by your grade.

## What to report back

The file per slot, what you did to it in one line, before/after strips, any slot you skipped and why, and the two
commands' output for your delivery. Do not write "verified" or "approved".

## How these were made (for an agent)

- Source: `/Volumes/T7/Hyenas AVT edit/Heyenas close up Performance (2 shots-close and closer).mov` (134.7 s). It holds
  two shots from one tripod position. The closer one (used here): master = file − 38.863 s. The farther one (knees up,
  not used yet): master = file + 29.70 s. Both cover the whole verse.
- Per shot, in `_avt_work/closeup_2026-11-14/<start>/`: window (8 handle frames each end) → `matte-video-proxy` →
  `scripts/edit/blender/prep_performer.py --roll 0 --scale 1` → `scripts/edit/blender/hyenas_set_build.py` with
  `scripts/edit/blender/hyenas_set_closeup_3ft.json` and `--performer perf --perf_offset 8 --perf_gain 0 --perf_back 0
  --perf_emit 1 --perf_legs 0.80 --passes plate,matte --key 1800 --samples 24` → `hyenas_set_comp.py <exr_plate> --him
  <exr_matte> --him_gain 1.0` (final), the same without `--him` (plate), `hyenas_set_matte.py` (matte) → Beeble VFX
  Pass Generator on the final (web app, Normal pass PNG) → `scripts/edit/relight_comp.py --normals <Normal> --studio
  room --studio_share 0.85 --fixed --rows TOP,TOP+2264 --x CENTRE --song <master> --t0 <master s>`.
  `v26.14` was the first: its folder is `v26/`, its window has 20 handle frames (`--perf_offset 20`).
- The method, the fault it fixed (the relight used to re-scale him darker) and the numbers:
  `docs/recipes/PLACE_HIM_IN_A_BUILT_SCENE.md`, "Fourth run". Problem index rows: "He comes out darker or flat…" and
  "A cut window has a repeated frame".
- **This Mac has 8 GB of memory.** Two Blender renders at once, or a render plus a light pass, filled the swap and
  stalled the light pass. Run one heavy job at a time (about 18 s a frame for one render).
- Beeble: Fendi's web account, signed in in his Chrome with the Google button. One file per upload on his plan.
  3 credits left after these eight.
- Spend: `docs/LEDGER_HYENAS_2026-11-13.md`, rows 32–35.

## Not known

- The split-screen layout Fendi wants.
- Whether the farther (knees-up) shot of the reshoot should be used in any slot.
- Whether Fendi wants the close-ups without the light pass in any slot (the `_placed` files).
- How `v41.53` reads as a moving picture: nobody has watched it.
