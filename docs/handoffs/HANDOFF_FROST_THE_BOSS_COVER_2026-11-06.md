# Handoff: Frost the Boss album cover (Ralph Lauren swap + six-car plate)

**From:** Claude, 6 Nov 2026. **For:** the next agent (Claude, Cursor, the Director) and Fendi.
**Skill:** `.claude/skills/avt-clothing-swap/SKILL.md` is the run-book this follows. Read it first.

## What Fendi asked (6 Nov 2026)

Album "Frost the Boss" (business-boss luxury rap). Cover: a semi-aerial view of him in the Polo Ralph Lauren
tailored-fit plaid tuxedo jacket (ralphlauren.com product 100097725, also for the next video), surrounded by exotic
luxury vehicles in a six-point star (Maybach, Rolls-Royce calibre). Order of work he set: the clothing swap first,
then the cover, then a skill other agents can load.

## State (VERIFIED by a read after each write unless marked)

| Item | State | Id / path |
|---|---|---|
| AVT project | created | `video_projects` `f411e59c-d966-40dc-b746-c0336c3e005d` "Frost the Boss (album cover)", aspect 1:1 |
| Board | created, active | `video_variations` `8b36b906-9ba7-4298-baea-4d63cb661bd8` |
| Shot | created | `shots` `5da65f1d-b447-4ae3-b9ea-8c061f970cc3`, `spec_key` `cover`, `shot_type` `performance` |
| Source take | chosen: `HALF_SONG_SIDE.MOV` (4K 60 fps, camera above him), window 73.5–77.5 s; the 75.5 s frame is the pose (three-quarter to camera, hands at the waist) | 4K window on the session disk only (`scratchpad/frost/src/side_73.5_4s_4k.mp4`); re-cut from the take with `ffmpeg -ss 73.5 -t 4 -i HALF_SONG_SIDE.MOV -an -vf fps=60 …` |
| original.mp4 (1080) | uploaded + filed on the shot, primary | `project-clips/<user>/f411e59c…/cover/HALF_SONG_SIDE_73.5_4s_1080.mp4`, asset `06f5fcbb-4480-4aca-8dc5-8910141493dc`, sha256 `a614dcdc…`, assignment `67a5abfb` |
| Lane-B crop (1100×2000 at (350,1400) of 2160×3840) | uploaded + filed off the shot | `…/cover/HALF_SONG_SIDE_73.5_4s_crop1100x2000.mp4`, asset `9910bbd0-d778-4085-9bb3-a8add39ec072`, sha256 `e14996fc…`; rect as fractions `{x:0.16204, y:0.36458, w:0.50926, h:0.52083}`, window `[0, 4]` |
| Cover plate drafts | 2 stills, $0.14, posted to Fendi, NOT judged | `project-references/…/worlds/scene_mw4m66lo_1.png` asset `0928901d`, `_2.png` asset `5c50f6c6`, prompt `frost-cover-plate-v1-2026-11-06` (draft 2 = six headlight beams to the centre) |
| Ralph Lauren look in the wardrobe | DONE (Fendi sent five product-page screens; pictures cropped and uploaded to `wardrobe-refs/<user>/<artist>/rl_*.jpg`) | `character_features`: jacket `976cc202`, pleated shirt `c030a1bd`, bow tie + pocket square `522d58e3`, Blackwatch trousers `238eefcc`, tassel loafers `62685002`, overcoat `a6b03f64` (optional second look) |
| Sync row for the source | DONE | `performance_syncs` `52add98d` (offset 73.5, confirmed; no song in this project) |
| Cover plate v2 (the cars draw the star, from Fendi's reference `582d6b2a`) | 2 stills, $0.14, posted, **REJECTED with v1** (Fendi: 'I provided a perfectly good image of the vehicles and you produced several worst images') | `6def390c`, `5c0b2b75`; do not use |
| **Cover plate = Fendi's own photo** `582d6b2a` (22 Rolls-Royces and Bentleys parked as a six-point star, drone, overcast day, industrial lot) | DECISION: the plate is his picture, not a redraw. Two framings posted, his pick pending: (a) $0 square crop of his pixels, 768², centre x=306 of the 1376×768 (`scratchpad/frost/cover/ref_square_crop_768.png`); (b) Gemini extension to 2048² keeping the picture and adding lot below / buildings above, `99e25661` ($0.27, job `63613d13`) — a close regeneration, labelled as such | the star's open centre is where he stands; the camera angle (~45° down) matches his overhead take |
| Genjutsu dress | DONE (run 2 after Fendi's top-up; run 1 `e32d97a3` was refused on an empty wallet, not billed) | job `a327bf27` → crop result `4a0f8bbf` (712×1294, 97 f, sha `07043593…`): jacket, pleated shirt, bow tie + pocket square, plaid trousers; loafers appeared on one foot unasked; cap kept |
| Face put-back | DONE, proof `max |out-original| on face/hair/skin: 0`, 237/241 aligned | `scratchpad/frost/swap/out/c033_body_only_swap.mp4` (1080); lifted to 4K `dressed_4k.mp4` (changed area 2.1 %), sha `3bc98ce4…`, in `project-exports …/canonical/cover/dressed_4k_HALF_SONG_SIDE_73.5_4s.mp4` |
| Cover frame | DONE: frame 120 = 75.5 s of the take | `canonical/cover/cover_frame_4k_f120.png`, sha `faa32b79…` |
| First composites | DONE, posted, NOT judged: him at the open centre of his star photo, 215 px tall on 2048² (about twice true scale), RVM matte gated by a place-limited key for the wall panel behind his back (`scripts/edit/compose_cover_still.py`), graded to the overcast lot, contact shadow, grain | A on his pixels `canonical/cover/FrostTheBoss_cover_A_hisphoto_crop_2048.jpg` (sha `ff7a4a17…`), B on the extension `…cover_B_hisphoto_extended_2048.jpg` (sha `ecaf6039…`) |
| Open with Fendi | plate A or B; his size on the cover; cap on or off; loafers on both feet (second `dress-clip` pass, $3.405, pieces: loafers only, or re-run with loafers in the four) | — |
| Face put-back, still, placement | not run | — |
| Ledger | row 232 ($0.14) | `docs/LEDGER_YSL_TESTING_BUDGET.md` |

## DECISION (Fendi, 6 Nov, later): the still path, not the video path

"Taking a video to create an image is the wrong approach, 100%. Use the images in AVT to create the swap." Also: the
take used (HALF_SONG_SIDE) sits under the warm diffused ceiling light and reads blurry/pasted; the LED takes are the
clean ones. So: covers A/B (from the take) are superseded. The still path (skill: "A STILL of him in a new outfit"):

| Item | State | Id / path |
|---|---|---|
| Grok still swap on his `silhouette_front` photo | DONE, $0.26, two candidates | `eca302e1`, `4544ebcc` (`project-references …/worlds/scene_mw568px3_{1,2}.png`, 1776×2368) |
| Face put-back on the still | DONE, proof 0 on both | `canonical/cover/still_swap{1,2}_putback.png` |
| Covers C (his pixels) / D (extension) from the still | DONE, posted, NOT judged | `canonical/cover/FrostTheBoss_cover_{C_still_crop,D_still_extended}_2048.jpg` |
| Open | the photo is eye-level; the plate looks down ~45°. Fendi offered to shoot: brief = phone 40–50° above him (stairs, balcony, a friend on a chair, or a stick), daylight or the LED panels (no warm ceiling light), plain floor with space all round, standing, looking up at the lens, hands at the waist, black mock-neck under, full body with feet, highest resolution still (and a 4 s clip if he likes); upload it to AVT; then steps 2–4 of the skill on that photo | — |
| Still his calls | plate A-crop or extension; his size; cap on or off (the photo has the cap) | — |

## (earlier) Nothing blocked: the cover waits on Fendi's picks (plate, size, cap, loafers)

## (6 Nov, earlier) Blocked on Fendi: the Higgsfield wallet — RESOLVED, he topped up

The dress is one call away. The Control Center Higgsfield API wallet (the account `dress-clip` and `montage-shot` bill
to, managed in Lovable Cloud secrets / the Higgsfield account, never in chat) answered "credit balance is too low".
After a top-up, rerun step 1 below unchanged ($3.405). Nothing else is blocked.

## Done: the jacket pictures (was blocked)

Ask for the product shots of the jacket (front on the model or flat, side/three-quarter, a lapel and plaid detail), as
he sent the YSL caps and the Pradas. Then:

1. Upload each to `artist-assets` under `3ca10935-8c3d-4479-9a0c-8bfe8050840c/8d4a4d22-41c0-43ab-ba99-92750f81e335/`
   (`avt_upload_asset` is for the project buckets; for `artist-assets` use the owner token:
   `POST /storage/v1/object/artist-assets/<path>`).
2. `avt_insert character_features`: `artist_id 8d4a4d22-41c0-43ab-ba99-92750f81e335`, `feature_type wardrobe_outerwear`,
   `label "Polo Ralph Lauren Tailored Fit Plaid Tuxedo Jacket"`, `file_url` the front picture's path, `source_url` the
   product page, `dimensions_description` (fit, lapel, buttons, the plaid's colours, what it is worn over: his black
   mock-neck stays), `reference_images [{url, angle}]`, `tags`.

## Then, in order (the skill's steps 2–7)

1. `avt_call dress-clip` `{projectId f411e59c…, assetId 06f5fcbb…, pieceIds [976cc202…, c030a1bd…, 522d58e3…, 238eefcc…], crop {path
   "3ca10935…/f411e59c…/cover/HALF_SONG_SIDE_73.5_4s_crop1100x2000.mp4", rect {x 0.16204, y 0.36458, w 0.50926,
   h 0.52083}, window [0, 4]}, dryRun true}` → expect `estimateUsd` ≈ 3.405 (5 s billed). Then `dryRun false`; poll
   `provider_jobs` by `jobId` until `succeeded`; note `result_asset_id`.
2. Download the crop result; `paste_region_swap.py original_1080 crop_swap 175 700 550 1000 pasted.mp4` (the crop box
   in 1080-scale pixels = the 4K box halved); `body_only_swap.py original_1080 pasted.mp4 out` with `AVT_HEAD_ZOOM=4`;
   proof must read `max |out-original| on face/hair/skin: 0`; `dressed_4k.py` to lift onto the 4K window.
3. Tile the dressed 4K clip, pick the 75.5 s frame (or the nearest with the mouth closed and the lapels clean), export
   the PNG. Post it with the face sheet; "rules check 1–7 pass" (3 does not apply to a still).
4. Plate: his photo (crop or extension, his pick). Matte him, scale to the open centre of the star (about one car
   length across), flat overcast daylight from above with the lot's grey bounce, grain and softness to the photo,
   compose the 1:1 cover, post. Never generate a new plate for this cover again without his ask. Type/logo
   treatment is his call afterwards.
5. On his word: file the dressed clip and the cover still in `project-exports/<user>/f411e59c…/canonical/cover/`,
   `project_assets` rows with sha256, demote the source assignment, set the cover primary; ledger rows; PR.

## Verify (expected values)

- `avt_select project_assets filters [{project_id eq f411e59c…}]` → 4 rows today (2 clips, 2 plate stills); 5 after the
  dress (the crop result), 7 after filing.
- `avt_list_files project-clips prefix 3ca10935…/f411e59c…/cover` → 2 files, sizes 4,760,810 and 9,199,630 bytes.
- The dress is not done if `provider_jobs` has no row with `request_payload_json.shotId = 5da65f1d…`.

## Do not

- Do not run the swap on a frame or a still: the engine wants ≥ 4 s of video; the still is picked after the put-back.
- Do not use a montage-shot render of him for the cover (rule 2: his face must be his real pixels).
- Do not place him over a plate that has people in it, or at a scale the plate does not give (rules 4, 6).
- Do not edit `body_only_swap.py` to make the proof read 0.
- Do not fetch ralphlauren.com repeatedly from the sandbox; it is blocked and the attempts look like scraping.
