# HANDOFF — Grokbot: the eight closet slots are done (c016 c017 c023 c025 c027 c028 c030 c043)

**Date:** 7 Nov 2026 · **From:** Claude (this repo's AVT session) · **For:** the three Grokbot agents (Director, Claudia, AVT agent)
**Closes:** Grokbot's `HANDOFF_CLOSET_SHOTS_ISSUE_v1.10.md` (the eight first-half slots that showed the closet / trench
punch-ins instead of him in the scene). Builds on `HANDOFF_GROKBOT_FIRST_HALF_2026-11-05.md` and
`HANDOFF_CLAUDE_c026_c033_c039_DELIVERED_2026-11-06.md`.
**Spend this round:** 23 renders at $2.219 list = $51.04 (ledger rows 247–269 in `docs/LEDGER_YSL_TESTING_BUDGET.md`; one more
was refused by the provider and not charged).

## What Fendi asked for, and what he said (verbatim)

- The eight slots must show **him in the scene as b-roll, mouth at rest, in the same locations as the earlier takes**; the
  nine approved performance shots are not touched.
- On the first roll (7 Nov, 02:40): "C030 dancing is too freaky it looks weird, C016 jacket doesn't look remotely close and
  logo is bogus, C028 added pin stripes to the jacket same as C016. These need new renders … please don't worry about the
  money let's get the shots correct."
- On the re-rolls (05:00–05:27): "C016 r6 is the winner" · "C025r2 is still too zesty, C027 looks unnatural and the hem does
  look a little funny" · "The rest will work. And in C027 Arrivals is spelled wrong but if that can't be fixed it's not a
  big deal" · "Both are good to go" (c025 roll A, c027 roll A) · "We don't need to do any more renders do we" → No.

## DONE — one accepted clip per slot, PRIMARY on the board (VERIFIED by a read after the writes)

Board `video_variations` `c067efb9` (the active board). Every clip: Higgsfield Seedance 2.5 reference-to-video through AVT
`montage-shot` (recipe F: the silent beige-cap window `d6750713` as the body reference, `sync: loose`, `motion: calm`, his
five face pictures + Cazals), 720x1280, 24 fps, 97 frames (4.04 s), silent, bucket `project-clips`. Frame 0 of each clip sits
on the slot's first frame (`metadata_json.derived_from.song_start`), so `source_in_s = 0.000` for all eight; the slot is the
first N frames and the rest of the clip is the tail handle. Each starts with a ~1 s cutaway of the place, then him.

| Slot | Song in–out (s) | Slot frames | AVT asset (PRIMARY) | Storage path (`project-clips/`) | What it is | Fendi |
|---|---|---|---|---|---|---|
| c016 | 28.06–29.54 | 36 | `19885553-08e3-47f3-81e4-c57f92c2ccc5` | `…/18467310-7e01-4b37-86b5-a613549910e3/generated_higgsfield_01a1b445-a88.mp4` | wet-floor sign + mop → him three-quarter by the blue lockers, janitor far behind | "C016 r6 is the winner" |
| c017 | 29.54–31.51 | 47 | `24e0ecf1-45c7-43b8-9365-2677d894b750` | `…/58e7ac51-027a-40c0-8ea1-7628c6d321eb/generated_higgsfield_01a1b42c-d53.mp4` | hallway → him leaning back on the lockers, shoulder to the metal | "The rest will work" |
| c023 | 40.85–42.33 | 35 | `8705741e-1352-418c-853c-0935c7b2aae3` | `…/de5191f9-7560-4bb4-9fc3-4ded99a7c845/generated_higgsfield_01a1b42c-e71.mp4` | carousel cutaway → him at the carousel | "The rest will work" |
| c025 | 43.80–45.28 | 35 | `f75de040-acb8-4b78-a1a5-58dceb43dc5c` | `…/813b1e78-d1a0-4c93-88ea-71c906bbd0e9/generated_higgsfield_01a1b46a-a86.mp4` | lone suitcase on the empty belt → him leaning on the chrome rail, calm, no zoom | "Both are good to go" |
| c027 | 46.75–48.23 | 35 | `f1716179-fe80-437a-a222-3addf7813474` | `…/c52d9f00-dc64-4f00-b5a2-eee13b65d95f/generated_higgsfield_01a1b46a-d37.mp4` | ARRIVALS sign (spelled right) + woman with trolley → him leaning on the rail under the board | "Both are good to go" |
| c028 | 48.23–50.19 | 47 | `75cd814a-28c3-4c16-a3cb-b9b38e79f8f3` | `…/f2771ecb-3600-443d-91a6-25d75a91e311/generated_higgsfield_01a1b42c-c12.mp4` | fox at the window → him in profile at the window turning to camera | "The rest will work" |
| c030 | 52.16–54.13 | 47 | `a45df650-09bd-44bd-894c-9d94f22080c1` | `…/5d524cf5-64e6-4560-ab73-d41c2daf5973/generated_higgsfield_01a1b42c-9ec.mp4` | Lower Wacker → him calm at the pillar (the "dancing" roll is gone) | "The rest will work" |
| c043 | 75.28–76.75 | 35 | `583d61e1-e57f-47c0-a398-9cb881b4734e` | `…/cf8125e2-64f8-4397-bb09-cfa8123ae8dc/generated_higgsfield_01a1b3ca-e74.mp4` | the corner → him at the station entrance square to camera, the woman behind his shoulder | "The rest will work" |

`…` = `3ca10935-8c3d-4479-9a0c-8bfe8050840c/764a63d2-93cd-44f3-905f-292f14ab2f51`. All eight `project_assets` rows are
`approval_status: approved`. The `shot_asset_assignments` ids and the demoted rows are in
`HANDOFF_YSL_CLOSET_SHOTS_FIX_2026-11-07.md` ("Fendi's verdict on the eight").

**What each clip passed before it was posted:** the jacket is the window's (plain mastic beige, ONE straight navy chest band,
the gold SAINT LAURENT script on his LEFT chest reading left to right, navy stripe inside each sleeve, beige cap), his face and
his Cazals on the `face_check.py` sheet, mouth at rest, waist up, no feet, nothing weird (`docs/SHOT_RULES.md`). Fendi then
judged each one in chat; only his accepted clip is primary.

## What was demoted (still on the shots as alternates, never deleted)

| Slot | Was primary (Director, 4–5 Nov) | Now |
|---|---|---|
| c016 | `82689f6e` trench punch-in 2.3x | alternate |
| c017 | `b496ecbc` trench punch-in v2 | alternate |
| c023 | `3643febe` 17 Oct montage | alternate |
| c025 | `14c31349` carousel cutaway, no him | alternate |
| c027 | `7b2caabc` luggage-cart / coats punch-in | alternate |
| c028 | `60f4715d` snow window + fox, no him | alternate |
| c030 | `ca8bca0b` Director cutaway, no him | alternate |
| c043 | `d3b16d0a` chain in polar-bear fur | alternate |

Rejected renders from this round (never use): c016 rolls 1–5 and 7 (`1833c3c9` `5be5fa5c` `d629e40b` `83a6f39e` `158a926d`
`69c736d5`: wordmark mirrored / diagonal band / profile), c017 r1 `cfdb5b4d`, c023 r1 `82df88cb`, c025 r1 `849543fa`, c025 r2
`093fdcf6` ("too zesty", hem band), c025 r3B `030affcc` (mirrored), c027 r1 `ddf22dfa` ("unnatural", ARRIVALS misspelled),
c028 r1 `c77da9fe` (pinstripes), c030 r1 `20c9cf31` ("dancing is too freaky"). The ledger has each one's verdict.

## NOT done: the 5 Nov package still holds the old files for these eight slots

Folder `project-exports/…/canonical/grokbot_first_half_2026-11-05/` (`sources/`, `slots/`, `first_half_manifest.csv`,
`YSL_first_half_c001-c047.xml`, `SHA256SUMS.txt`) was NOT re-cut for this round: it still carries the 17 Oct montages / the
Director's cutaways on c016, c017, c023, c025, c027, c028, c030, c043. **The board is the truth, not the package.** For these
eight, pull the clip at the storage path in the table (the owner's session or `avt_signed_url`), drop frames 0..N-1 on the
slot, keep the rest as the tail handle. If a re-cut package is wanted, say so: it is $0 (download, cut to the slot with
`fps=24` + lanczos to 1080x1920, rebuild manifest / XML / SHA256SUMS, re-upload) and takes one session.

Everything else in the package is unchanged from the 5 and 6 Nov handoffs: c009 / c026 / c033 / c039 / c041 / c042 / c045 / c046
FINAL, c013 / c044 picks, c036 / c037 Director cutaways awaiting Fendi.

## Also fixed this round (tool + data, live)

- `world-still-proxy` (AVT, Gemini route): the dry run now signs the references and sends them to Control Center, so CC's
  reference rule (`reference_forbidden`) fires before any spend instead of after a paid run. Merged `af4130f5`, redeployed by
  Lovable, verified live by a dry run. Nothing for Grokbot to do.
- The corner plate `dfcc35f3` was filed with its scene title so `montage-shot` finds it for c043 (`no_plate` risk closed).

## Rules that still hold

- Never a generated version of him with his mouth moving (`docs/SHOT_RULES.md`, 5 Nov). Every clip above has his mouth at rest.
- The nine approved performance shots are not to be replaced.
- Do not swap any of the eight for a Gemini re-render or a punch-in: Fendi accepted these clips by name.
- The Control Center Higgsfield API wallet is at its floor (one job refused on 7 Nov, "credit balance is too low"); any new
  render on this project waits on a top-up. Fendi: no more renders are needed for the first half.

## Verify (cheap, distinguishes outcomes)

1. `avt_select shot_asset_assignments` with `shot_id in [d495d6d4…, 8c513159…, 3100e78d…, 9379d0c6…, 9d53180d…, ff3bcb4e…,
   454015fb…, ad991d14…]`, `variation_id eq c067efb9…`, `is_primary eq true` → **exactly 8 rows**, the asset ids in the table.
   7 or 9 means a swap half-applied.
2. `avt_select project_assets` with `id in` the eight asset ids, columns `id,approval_status` → **8 rows, all `approved`**.
3. `ffprobe -v error -select_streams v -show_entries stream=width,height,r_frame_rate,nb_frames -of csv=p=0 <file>` on any
   of the eight → `720,1280,24/1,97`.

## Report back

Which of the eight you dropped into the cut and at what frame, whether you want the package re-cut, and anything in the eight
that reads wrong in motion that the stills did not show.

## Added 7 Nov, later: c044 and c047 closed, the first half is done

- **c047** `41d5c1da` (the 16 Oct bear montage v2, slot 0.614–4.064 s of the source, no him): FINAL, Fendi 7 Nov: "the bear
  shot is fine grokbot actually used that clip already so it's good". Asset approved.
- **c044** re-shot WITHOUT him as b-roll (Fendi: "Remove me from C044 and have the fashion show going while the trains are
  moving in fast speed in the background"; "the gambling scene is totally separate from this shot"; "We need more than 2
  models and some black ones as well"; the puffer in the line rejected). Shot type set to `b_roll`. The scene "Chicago, the
  runway" now has a clean plate (`8cac92d0`, crew/dice/money/penguin removed) and the six-model long-coat plate `c84505e9`
  (three Black women, one East Asian, the original two) as its plate. **FINAL = roll 6 `97f95c9a`** (job `990be43d`,
  assignment `66377562`; Fendi: "It's fine … it'll do I don't want to burn another cycle on a b roll shot"), `8d34b4d0` (the
  27 Oct pick with him) demoted. Storage: `project-clips/…/990be43d-adfa-43d2-87b1-80142bafe907/generated_higgsfield_01a1b776-792.mp4`,
  720x1280 24 fps, 97 frames; the slot is frames 0–46 (1.97 s), `source_in_s = 0`.
- Rolls 1–5 (`8340164c` `65a36524` `961cb700` `e2f79f32` `6912e77e`) are alternates on c044, never to be used. Ledger 270–278.

**Every slot c001–c047 now carries a clip Fendi accepted or a FINAL.** Verify: `avt_select shot_asset_assignments` on
shot `01903ea9…` with `is_primary eq true` → one row, asset `97f95c9a…`.

