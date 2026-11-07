# HANDOFF — Grokbot: assemble the YSL first half v2 (c001–c047, 0:00–1:26), every slot closed

**Date:** 7 Nov 2026 (evening) · **From:** Claude (this repo's AVT session) · **For:** the three Grokbot agents (Director,
Claudia, AVT agent)
**Supersedes** `HANDOFF_GROKBOT_FIRST_HALF_2026-11-05.md` and `HANDOFF_GROKBOT_CLOSET_SHOTS_DONE_2026-11-07.md` for the
slot list; those two still hold the rules, the package layout and the history.
**What Fendi asked for (7 Nov):** "a handoff for Grokbot to finish the next iteration of the video up to the last scenes
that we created, so all of those B-roll and performance shots can be included and the video can be extended to where it
was intended to be extended to." That end is **c047 / 1:26.10**; Grokbot's last assembly stopped at ~1:11 (c040).

## The one rule for this pass

**The board is the truth, not the 5 Nov package.** `video_variations` `c067efb9` (the active board) carries exactly one
primary clip per shot on c001–c047. Ten of those primaries changed after the package was cut, so for those ten pull the
clip from the storage path below; for the rest the package files are still right. Nothing in the package was deleted.

Pull a clip: the owner's session or `avt_signed_url` on the bucket + path (`…` = `3ca10935-8c3d-4479-9a0c-8bfe8050840c/764a63d2-93cd-44f3-905f-292f14ab2f51`).
Montage renders are 720x1280, 24 fps, 97 frames (4.04 s), silent; scale to 1080x1920 with lanczos, no frame repeated or
dropped inside the slot.

## The 47 slots, as the board stands now

Status: **FINAL** = Fendi accepted it by name. **ACCEPTED** = his words quoted in the assignment note. **PICK** = on the
board, never judged by him. **DIRECTOR** = the Director's own cutaway, awaiting Fendi. **OPEN** = still the moving-mouth
clip (c007), see below. `src_in` is where the slot begins inside the clip; frame 0 of a montage render sits on the slot's
first frame.

| Slot | Song (s) | Frames | Asset (primary) | Where | src_in | Status |
|---|---|---|---|---|---|---|
| c001 | 0.00–1.50 | 36 | `251c89e1` | package | 0.000 | PICK (intro, 17 Oct) |
| c002 | 1.50–2.98 | 36 | `0dae4f6c` | package | 0.000 | PICK (Oak Street chase) |
| c003 | 2.98–4.95 | 47 | `56c4e578` | package | 0.000 | PICK |
| c004 | 4.95–7.90 | 71 | `0db8f045` | package | 0.000 | PICK |
| c005 | 7.90–10.85 | 71 | `5266eab6` | package | 0.000 | PICK |
| c006 | 10.85–12.32 | 35 | `ba9e6af9` | package | 0.000 | PICK |
| c007 | 12.32–13.80 | 35 | `85101246` | package | 1.139 | **OPEN**: generated him moving his mouth; the Director's call (punch-in `punchin/c007_punchin.mp4`, a cutaway, or ask Claude for a recipe-F re-render) |
| c008 | 13.80–15.28 | 36 | `44e1adc7` | package | 0.000 | PICK (his mouth stays shut) |
| c009 | 15.28–16.75 | 35 | `b06b32f9` | package | 0.000 | FINAL 5 Nov: crew sitting, chain up, gold grin → him rapping at the wall (his real take, face put back) |
| c010 | 16.75–18.72 | 47 | `bafb13c5` | `project-exports/…/canonical/grokbot_first_half_2026-11-05/replacements/c010_bear_t1_1080x1920.mp4` (47 f, 1080x1920) | 0.000 | ACCEPTED 5 Nov: polar-bear YSL pendant b-roll from his own still. **Not the package's `f6ac996b`** |
| c011 | 18.72–20.69 | 47 | `aacbef7b` | package | 0.899 | PICK |
| c012 | 20.69–22.65 | 47 | `2ddda13a` | package | 0.000 | PICK |
| c013 | 22.65–25.11 | 59 | `78ed5ca7` | package (`c013_78ed5ca7_source.mp4`) | 0.000 | PICK 5 Nov: recipe-F calm, his mouth at rest in the slot |
| c014 | 25.11–26.59 | 36 | `0f00ecd5` | package | 0.000 | PICK |
| c015 | 26.59–28.06 | 35 | `f1d0538b` | package | 0.000 | PICK |
| c016 | 28.06–29.54 | 36 | `19885553` | `project-clips/…/18467310-7e01-4b37-86b5-a613549910e3/generated_higgsfield_01a1b445-a88.mp4` | 0.000 | ACCEPTED 7 Nov ("C016 r6 is the winner"): wet-floor sign → him by the lockers, YSL jacket |
| c017 | 29.54–31.51 | 47 | `24e0ecf1` | `project-clips/…/58e7ac51-027a-40c0-8ea1-7628c6d321eb/generated_higgsfield_01a1b42c-d53.mp4` | 0.000 | ACCEPTED 7 Nov: hallway → him leaning on the lockers |
| c018 | 31.51–32.98 | 35 | `8d93aced` | package | 0.000 | PICK |
| c019 | 32.98–34.46 | 36 | `fda3c88c` | package | 0.000 | PICK |
| c020 | 34.46–36.42 | 47 | `c485122e` | package | 0.000 | PICK |
| c021 | 36.42–39.37 | 71 | `2d334fd7` | package | 0.000 | PICK |
| c022 | 39.37–40.85 | 36 | `c45251ee` | package | 0.000 | PICK |
| c023 | 40.85–42.33 | 35 | `8705741e` | `project-clips/…/de5191f9-7560-4bb4-9fc3-4ded99a7c845/generated_higgsfield_01a1b42c-e71.mp4` | 0.000 | ACCEPTED 7 Nov: carousel → him at the carousel |
| c024 | 42.33–43.80 | 35 | `66b56c6b` | package | 0.000 | PICK |
| c025 | 43.80–45.28 | 35 | `f75de040` | `project-clips/…/813b1e78-d1a0-4c93-88ea-71c906bbd0e9/generated_higgsfield_01a1b46a-a86.mp4` | 0.000 | ACCEPTED 7 Nov: lone suitcase → him leaning on the chrome rail |
| c026 | 45.28–46.75 | 35 | `081a4ddf` | package | 0.000 | FINAL 6 Nov: fox asleep → him seated at the right |
| c027 | 46.75–48.23 | 35 | `f1716179` | `project-clips/…/c52d9f00-dc64-4f00-b5a2-eee13b65d95f/generated_higgsfield_01a1b46a-d37.mp4` | 0.000 | ACCEPTED 7 Nov: ARRIVALS sign → him leaning on the rail under the board |
| c028 | 48.23–50.19 | 47 | `75cd814a` | `project-clips/…/f2771ecb-3600-443d-91a6-25d75a91e311/generated_higgsfield_01a1b42c-c12.mp4` | 0.000 | ACCEPTED 7 Nov: fox at the window → him in profile turning to camera |
| c029 | 50.19–52.16 | 47 | `a2f302bd` | package | 0.000 | PICK |
| c030 | 52.16–54.13 | 47 | `a45df650` | `project-clips/…/5d524cf5-64e6-4560-ab73-d41c2daf5973/generated_higgsfield_01a1b42c-9ec.mp4` | 0.000 | ACCEPTED 7 Nov: Lower Wacker → him calm at the pillar. **Not the package's `ca8bca0b`** |
| c031 | 54.13–56.10 | 47 | `9da46aa6` | package | 0.000 | PICK |
| c032 | 56.10–58.06 | 47 | `746b08a0` | package | 0.000 | PICK |
| c033 | 58.06–59.54 | 36 | `20b8c185` | package | 0.000 | FINAL 6 Nov: the kitchen, him at the island, mouth at rest |
| c034 | 59.54–61.01 | 35 | `5aa6f01c` | package | 0.000 | PICK: frost on the showroom glass, no him |
| c035 | 61.01–62.49 | 36 | `a64bfbb6` | package | 0.000 | PICK: whip pan to the platform |
| c036 | 62.49–63.96 | 35 | `7a115d9c` | package (`replacements/c036_v1_1080x1920_silent.mp4`) | 1.600 | DIRECTOR 4 Nov: penguins, lights dip, no him; awaits Fendi |
| c037 | 63.96–65.93 | 47 | `4247fe23` | package (`replacements/c037_v1_1080x1920_silent.mp4`) | 1.000 | DIRECTOR 4 Nov: frosted train, no him; awaits Fendi |
| c038 | 65.93–67.90 | 47 | `c8e50b98` | package | 0.000 | PICK |
| c039 | 67.90–70.85 | 71 | `d90d6f29` | package | 0.000 | FINAL 6 Nov: the platform from further back, the Pradas whole |
| c040 | 70.85–72.33 | 36 | `a172ae9b` | package | 0.000 | PICK |
| c041 | 72.33–73.80 | 35 | `6f4edd50` | package | 0.000 | FINAL 4 Nov: his real take, bucket hat + car coat, face put back (performance) |
| c042 | 73.80–75.28 | 36 | `a2d40377` | package | 0.000 | FINAL 1 Nov: him by the orca window, mouth at rest |
| c043 | 75.28–76.75 | 35 | `583d61e1` | `project-clips/…/cf8125e2-64f8-4397-bb09-cfa8123ae8dc/generated_higgsfield_01a1b3ca-e74.mp4` | 0.000 | ACCEPTED 7 Nov: the corner → him at the station entrance. **Not the package's `d3b16d0a`** |
| c044 | 76.75–78.72 | 47 | `97f95c9a` | `project-clips/…/990be43d-adfa-43d2-87b1-80142bafe907/generated_higgsfield_01a1b776-792.mp4` | 0.000 | FINAL 7 Nov: the runway on the elevated platform, six models in long coats, trains both sides, **no him**. **Not the package's `8d34b4d0`** |
| c045 | 78.72–80.69 | 47 | `f17bee00` | package | 0.000 | FINAL 1 Nov: walrus → open door → him inside |
| c046 | 80.69–82.65 | 47 | `221961f4` | package | 0.000 | FINAL 4 Nov |
| c047 | 82.65–86.10 | 82 | `41d5c1da` | package | 0.614 | FINAL 7 Nov: the polar bear outside the liquor store, the child at the pole, no him ("grokbot actually used that clip already") |

Total 2066 frames = 86.10 s. The c047 slot is frames 15–96 of its 4 s source (0.614 s in); the flash at the very end of
that source falls outside the slot.

**Changed since the 5 Nov package (pull these ten from the paths above, not from `sources/`):** c010, c016, c017, c023,
c025, c027, c028, c030, c043, c044.

## What is and is not a performance shot in this stretch

Him rapping on camera, his real footage, his real face: **c009** (15.28 s) and **c041** (72.33 s). Everything else with
him in it is b-roll with his mouth at rest (c013, c016, c017, c023, c025, c026, c027, c028, c030, c033, c039, c042, c043,
c045, c046). c044 and c047 have no him. That is by Fendi's rules: no generated version of him ever moves his mouth, and
"every shot does not need a performance shot". If he wants a slot performed after seeing this assembly he will name it.

## Rules that hold

- Never a generated him with his mouth moving (`docs/SHOT_RULES.md`). c007 is the one slot that still breaks it: cover
  it (the Director's call) before the cut goes to Fendi.
- Do not replace any FINAL or ACCEPTED clip with a re-render or a punch-in; Fendi accepted each by name.
- Use the `sources/` files (full clips, handles) for transitions and the paths above for the ten changed slots; the
  frames outside the slot are the handles.
- Nothing after c047 exists yet: c048–c066 and c085–c090/c092/c093 have no clip on the board, and c067–c084, c091,
  c094–c100 hold 15 Oct placeholders Fendi has never judged. The second half is a separate round.

## Verify before you cut

1. `avt_select shot_asset_assignments`, filters `variation_id eq c067efb9-90af-418e-aa6d-58834f6e19de` and `is_primary eq true`,
   columns `shot_id,asset_id` → the 47 first-half shots each have exactly one row, the asset ids in the table above.
2. For the ten changed slots, `ffprobe … -show_entries stream=width,height,r_frame_rate,nb_frames` → `720,1280,24/1,97`
   (c010 is `1080,1920,24/1,47`).
3. After assembly: the cut runs 2066 frames at 24 fps and every cut lands on the slot boundaries above.

## Report back

The assembled cut to 1:26 as a file in `project-exports/…/canonical/`, what you did with c007, and anything in the ten
new clips that reads wrong in motion.
