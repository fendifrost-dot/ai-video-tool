# Handoff: Hyenas performance shots, his real pixels in the set + the upper-half reshoot (14 Nov 2026)

For the next session, which runs on Fendi's Mac with the T7 drive (`/Volumes/T7/Hyenas AVT edit/`). The cloud session
that wrote this could not reach the T7. Read `docs/PROBLEM_INDEX.md` (printed at session start) first.

## Read first: the branch is not merged

Everything below is on branch `hyenas-performance-set-shots-s58j73`, draft **PR #498**, CI green, **not merged**
(Fendi has not said to). Check it out, or merge it when Fendi says so, before you work:

```
cd /Users/gocrazyglobal/Projects/ai-video-tool
git fetch origin hyenas-performance-set-shots-s58j73 && git checkout hyenas-performance-set-shots-s58j73
```

New in that PR:
- `scripts/edit/reinsert_him.py`
- `scripts/edit/place_in_built_shot.py`
- `scripts/edit/relight_comp.py`
- `scripts/edit/relight_from_passes.py`
- `scripts/edit/integration_check.py`
- `scripts/edit/dressed_4k.py` (now works at any size)
- `scripts/agent-browser/beeble-passes.mjs`
- `docs/recipes/PLACE_HIM_IN_A_BUILT_SCENE.md`
- the rewritten top of `docs/recipes/CREATURE_OR_PROP_SWAP_ON_HIS_TAKE.md`

## Fendi's decisions this session (binding)

| When | Decision | Where it lives |
|---|---|---|
| 14 Nov | **No reshoot-to-match lighting, no backdrops.** His setup is three white LEDs and a 10-15 min shoot. The light match is done afterwards. | `PLACE_HIM_IN_A_BUILT_SCENE.md` step 1 |
| 14 Nov | **Beeble's re-light is the route** (VFX Pass Generator normals). **Never SwitchX on him**: it redrew his face (ledger 29) and changed garments (YSL ledger 58). | same, step 3c; PROBLEM_INDEX "pasted" row |
| 14 Nov | **"I hate the red flushing me out it makes the shot look low quality."** His own white LED key stays. The set's red is added only where his lights did not reach. | `relight_comp.py --studio room` |
| 14 Nov | **Remove the iPhone grain**, then one grain matching the set. | `--denoise 6 --regrain 0.012` |
| 14 Nov | **"re insert my actual pixels and just upscale the hyena"**; the two ropes "seemed like a fairly easy thing to fix". His take's pixels, the swap only for the creature, the chain and the old-leash strip. The 12 Nov "swap as base" rule is superseded. | `reinsert_him.py`; creature recipe, top section |
| 14 Nov | **The repo must reflect the current workflow** so the next agent does not stumble. | done in PR #498; keep it true |
| 14 Nov | **Upper-half reshoot**: he is re-filming the performance waist-up for resolution. Still camera on a tripod (handheld feel, if wanted, is added in the set's camera). | below |

## Where verse 26.1 stands (the worked example)

The same shot through every stage. All filed in AVT project `87fc3244-de44-45a3-b2ba-7fe54222dc90` as candidates
(no shot primaries changed):

| Asset | What |
|---|---|
| `c0e59cbe` | as built 13 Nov (720p swap in the set) |
| `8ba1a6cc` | Grokbot's light pass v3 (his own delivery, `grokbot_finish_v3_2026-11-14/`) |
| `0a6ba27d` / `19c15a50` | first relight, matte normals, strength 1.0 / 1.5 (red: rejected look) |
| `4485a62c` / `b54c76a5` | relight with Beeble normals, 1.0 / 1.5 (red: rejected look) |
| `39422e7a` / `194a3f69` | **studio key** 85 % / 70 % on the 720p swap |
| `b7182748` | **re-insert** in the room: his real 1080 pixels + the swap's hyena and chain (`reinsert_him.py`) |
| `1f274d62` | **current best: real pixels, placed in the built set, studio key 85 %.** Detail on him 15.6 -> 20.1; light jump 2.28 % (set 2.45 %); no held frames |

Fendi has NOT yet said which he takes (85 vs 70; real pixels yes or no). Ask before filing a primary.

Inputs that already exist for 26.1:
- **1080 take of the performance:** `ffa71d3b` (`project-references/.../hyenas_perf_204.39_1080.mp4`, file 204.39-268.59 s at 59.94). The 720p window `hyenas_perf_v25.3_98f_720_secD.mp4` is source frames 26..269 of a cut starting at 26.9 s, every 2nd or 3rd frame, matched by picture (mse < 1).
- **720p put-back:** `f8ba4d1d`. Its matte is job `ba11ffaa` (Fal alpha URL in that row's `response_url`).
- **Built-set layers** from Grokbot's folder: plate `a324c8d1`, matte `0d60f26a`. The built shot uses take frames from `--perf_offset 20`.
- **Beeble passes of the built shot:** taken on 14 Nov (9 credits); not stored in AVT. Re-run if needed.

## The pipeline (verse 26.1 commands, as run)

```
# 1. his real pixels back (the swap only for creature, chain, old-leash strip). MediaPipe models in AVT_MODELS
python3 -I scripts/edit/reinsert_him.py take1080.mp4 putback720.mp4 putback_alpha720.mp4 reinsert.mp4 --models <models>
#    prints: his own pixels 88.5 % of him (min 79.7). File it, then matte-video-proxy on it ($0.07), used as delivered
# 2. cut-out
python3 -I scripts/edit/blender/prep_performer.py reinsert.mp4 alpha.mp4 perf/ --roll 0 --scale 1
# 3a. a shot already built with the old cut-out: no re-render
python3 -I scripts/edit/place_in_built_shot.py built.mp4 plate.mov built_matte.mov old_alpha720.mp4 perf/ placed.mp4 placed_matte.mp4 --offset 20
# 3b. or a new build: hyenas_set_build.py --performer perf/ ... (handoff 13 Nov table)
# 4. Beeble normals of the shot (web app; scripts/agent-browser/beeble-passes.mjs, from a scratch folder)
# 5. light
python3 -I scripts/edit/relight_comp.py placed.mp4 plate.mov placed_matte.mp4 out.mp4 --set scripts/edit/blender/hyenas_set.json \
   --rows 557,1392 --x 625 --normals <Beeble Normal dir> --studio room --studio_share 0.85 --denoise 6 --regrain 0.012 \
   --song built.mp4 --t0 0
# check: integration_check.py out.mp4 placed_matte.mp4 (sharpness, noise ~1; light tint stays high BY DESIGN with a white key)
```

`--rows TOP,FEET --x` are his cap-top and shoe rows and centre column in the built frame, measured once on frame 28 of
the matte. The script follows the push-in from there.

## Beeble

- **Sign-in:** Fendi's Beeble web account (Personal workspace). Email `fendifrost@gmail.com`, then the code Beeble emails.
  - Read the code from his Gmail; he OK'd that on 14 Nov.
  - He prefers Google sign-in. In his own browser on the Mac, just use the Google button.
- **Credits:** 81 left after 26.1. About 3 credits per source second.
- **Do not use the Beeble API key in Control Center for this.** It is SwitchX only.
- **Normal pass:** 8-bit PNG, camera space (+X right, +Y up, +Z toward the camera). Verified on his sides and cap top.

## The upper-half reshoot (what Fendi is filming)

What was advised, so match the footage to it:
- Tripod, still.
- Rear camera, 1x, 4K vertical.
- Mid-thigh up, with headroom (room to punch in to waist-up).
- Lens at chest height, level (the 13 Nov take was tilted about 18° down).
- 24 fps, 1/48 shutter, exposure and white balance locked, HDR off (Blackmagic Camera app).
- His three LEDs as before, a step off the wall.
- **No dog in frame if the cut allows**: then no swap at all, his pixels only.

With the new footage:
1. Copy it to the T7 (never iCloud; disk rules in CLAUDE.md).
2. Find the song timing with `performance-sync` or by ear on the master `02.06.21`; write both clocks (song and file).
3. Make a 1080x1920 working copy (cut once; every copy from the same frames).
4. Without a hyena: matte, `prep_performer.py`, then `hyenas_set_build.py --performer` with a NEW `take_camera` for the
   level chest-height phone, then Beeble, then `relight_comp.py --studio room`.
   - `take_camera` (`hyenas_set.json`) must be re-measured for the new phone position. The 13 Nov one is pitch -18.55°,
     height 1.37 m.
5. With a hyena: Genjutsu swap (4 s minimum, recipe steps 1-4), then `reinsert_him.py`, then the rest as above.

## Update, 14 Nov afternoon (Mac session): the reshoot is in, first shot built

- The footage: `/Volumes/T7/Hyenas AVT edit/Heyenas close up Performance (2 shots-close and closer).mov` (iPhone 14,
  4K vertical, 24 fps, 134.7 s, one tripod position, no dog). Two shots: the farther one (he calls it 5 ft) and the
  closer one (3 ft).
- Clocks (cross-correlation against the 02.06.21 master, 11 windows each): farther shot master = file + 29.70 s;
  closer shot master = file - 38.863 s. Both cover the whole verse (verse 0 = file 16.15 s and 84.71 s).
- Working copies and everything else: `_avt_work/closeup_2026-11-14/`. Cut shot windows from the 4K original by its
  own timestamps, not from the working copies (they were cut with `-r 24`, which can repeat a frame).
- Verse 26.1 from the closer shot is built: candidates `5af04625` (relit) and `36be755f` (placed), layers `17a50ff8`
  (plate) and `35c66b15` (matte), window `5072bb53`. Method and numbers: `docs/recipes/PLACE_HIM_IN_A_BUILT_SCENE.md`,
  "Fourth run". Beeble passes are on the T7 (`closeup_2026-11-14/v26/beeble/passes`).
- The candidates `39422e7a`, `194a3f69`, `1f274d62` are superseded: made with the re-scale that darkened him.
- Fendi, 14 Nov: "i'm not here to micro manage you understand the objective let's knock it out". He chose the 3 ft shot
  for the first test, called it "amazing", and said "yes build them all the same way".
- **All eight slots are built from the closer shot** (evening, 14 Nov). Files, clocks and checks:
  `docs/handoffs/HANDOFF_GROKBOT_HYENAS_CLOSEUP_SHOTS_2026-11-14.md`; on the T7 `closeup_2026-11-14/deliver/`.
- **The 13 Nov wide shots are NOT replaced.** Fendi, 14 Nov: "We aren't fully replacing the older shots they are going to
  be used on a cut screen with the new shots". The split-screen layout is his to give.
- `closeup_2026-11-14/hyenas_timing_preview_v6.mp4` has the close-ups alone in the slots: a timing reference, not the cut.
- Beeble: 3 credits left after the eight shots. Sign-in in his Chrome with the Google button works; one file per upload.

## Open items

1. **Fendi's pick** for 26.1 (85 vs 70; real pixels). Nothing is a primary yet.
2. **The other seven shots** with real pixels:
   - About $0.07 (matte) and 9 Beeble credits each.
   - The three two-depth shots (v01.40, v06.62, v11.10: hyena lying away from his feet) are untested with `place_in_built_shot.py`.
   - Parked if the reshoot replaces them.
3. **The hyena is still the swap's 720p picture.** Upscaling it alone is open.
   - Runway `upscale_v1` would need a new Control Center route. Fendi has not said go; Control Center is a separate repo.
   - Real-ESRGAN was rejected: painterly, 3 min per frame on CPU.
4. **Body holds:** gone with real pixels. Confirm on each shot (smallest frame-to-frame change on him > 0).
5. **The relight's Beeble normals for 26.1 came from the OLD built shot.** They line up, but a fresh run on the
   real-pixels shot would be exact.

## Spend this session

Ledger rows 30-31 in `docs/LEDGER_HYENAS_2026-11-13.md`:
- Beeble: 9 credits.
- Matte: $0.07.
- Nothing else paid. The Higgsfield MCP account (0.68 credits) and the Runway route were not used.
