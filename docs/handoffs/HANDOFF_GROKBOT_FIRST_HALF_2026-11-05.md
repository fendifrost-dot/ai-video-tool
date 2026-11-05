# HANDOFF — Grokbot: assemble the YSL first half (c001–c047, 0:00–1:26)

**Date:** 5 Nov 2026 · **From:** Claude (this repo's AVT session) · **For:** the three Grokbot agents · **Spend this round:** $0

## What Fendi decided (5 Nov 2026, verbatim intent)

- "I think we generated enough clips to put together the video … Grokbot will assemble the first half because Grokbot has the ability to do transitions in a smoother way … and After Effects." No assembly from Claude: the hand-off is the clips, their timing and the rules.
- "Keep in mind every shot does not need a performance shot." A cutaway without him is a valid fill. "If I see somewhere where I wanna perform shot after Grokbot assembles the video I'll go to that specific shot."
- Three agents work simultaneously:
  - **Director** reviews every clip against the theme; a clip that does not line up, or that raises a question, is re-rendered with **Gemini** ("by far the best tool"; Grok's images are "not 100 % the realism").
  - **Claudia** implements transitions, After Effects, motion detail and "any other tricks that will bring the video to life".
  - **AI video tool agent** oversees the whole production to the finish.

## The package (VERIFIED in AVT storage by a listing after upload)

Folder `project-exports/3ca10935-8c3d-4479-9a0c-8bfe8050840c/764a63d2-93cd-44f3-905f-292f14ab2f51/canonical/grokbot_first_half_2026-11-05/` (bucket `project-exports`, read with the owner's session or `avt_signed_url`):

| File | What |
|---|---|
| `README.txt` | roles, rules, ids (the same as this document, short form) |
| `first_half_manifest.csv` | one row per shot: slot on the song, AVT asset id, its original storage path, `source_in_s`, sync offset, status, hashes, camera motion |
| `sources/` (47) | the full source clips, native size, 24 fps — **use these for transitions**, the frames outside the slot are the handles |
| `slots/` (47) | the same clips cut to the exact slot (no handles) for quick review |
| `YSL_first_half_c001-c047.xml` | FCP7 XML: the 47 sources on one video track at their slots, straight cuts, 1080x1920 24 fps, the song on the audio track (song = AVT asset `067a4cbf`, the album master, not in the folder) |
| `SHA256SUMS.txt` | `sha256sum -c SHA256SUMS.txt` → 94 OK |

Expected counts: 4 files at the root + 47 in `sources/` + 47 in `slots/` = 98 objects. Anything else means a partial upload.

## The 47 slots

Status: **FINAL** = approved by Fendi, do not replace. **PICK** = his pick. **APPROVED** = he approved it (c033, 18 Oct, with his one-frame-earlier timing applied). **CANDIDATE** = never judged by him; the Director may replace it. **GAP** = c043 holds only its dressed take; a cutaway is fine.

| Shot | Section | Song in–out (s) | Frames | Clip (AVT asset) | Source in (s) | Status |
|---|---|---|---|---|---|---|
| c001 | intro | 0.00–1.50 | 36 | `251c89e1` c001_251c89e1_source.mp4 | 0.000 | ON BOARD 17 Oct, unjudged |
| c002 | intro | 1.50–2.98 | 36 | `0dae4f6c` c002_0dae4f6c_source.mp4 | 0.000 | ON BOARD 17 Oct (Oak Street chase), unjudged |
| c003 | intro | 2.98–4.95 | 47 | `56c4e578` c003_56c4e578_source.mp4 | 0.000 | CANDIDATE 17 Oct, nothing selected |
| c004 | intro | 4.95–7.90 | 71 | `0db8f045` c004_0db8f045_source.mp4 | 0.000 | CANDIDATE 17 Oct (board still holds the 15 Oct carry) |
| c005 | intro | 7.90–10.85 | 71 | `5266eab6` c005_5266eab6_source.mp4 | 0.000 | CANDIDATE 17 Oct (board still holds the 15 Oct carry) |
| c006 | intro | 10.85–12.32 | 35 | `ba9e6af9` c006_ba9e6af9_source.mp4 | 0.000 | CANDIDATE 17 Oct, nothing selected |
| c007 | intro | 12.32–13.80 | 35 | `85101246` c007_85101246_source.mp4 | 1.139 | CANDIDATE 17 Oct montage, dressed intro (board holds the 15 Oct carry) |
| c008 | verse 1 | 13.80–15.28 | 36 | `44e1adc7` c008_44e1adc7_source.mp4 | 0.000 | CANDIDATE 17 Oct (board holds the 15 Oct carry) |
| c009 | verse 1 | 15.28–16.75 | 35 | `be49e5b0` c009_be49e5b0_source.mp4 | 1.146 | REJECTED by Fendi 5 Nov (him pasted into the lounge, square to camera, unnatural). Do not use the package file. REDO v1 `425c846b` REJECTED by Fendi (cut into a picture, no movement, in front of the men). REDO v2 `980443a5` filed on c009 (unselected): the crew cutaway, HARD CUT to him alone at the poster wall over a moving plate (ledger 222–225; rules 1–7 pass). Awaits Fendi; the Director leaves c009 alone. |
| c010 | verse 1 | 16.75–18.72 | 47 | `f6ac996b` c010_f6ac996b_source.mp4 | 0.898 | CANDIDATE 17 Oct montage (board holds the 15 Oct carry) |
| c011 | verse 1 | 18.72–20.69 | 47 | `aacbef7b` c011_aacbef7b_source.mp4 | 0.899 | CANDIDATE 17 Oct montage, nothing selected |
| c012 | verse 1 | 20.69–22.65 | 47 | `2ddda13a` c012_2ddda13a_source.mp4 | 0.000 | CANDIDATE 17 Oct (board holds the 15 Oct carry) |
| c013 | verse 1 | 22.65–25.11 | 720 | `78ed5ca7` c013_78ed5ca7_source.mp4 | 0.000 | PICK 5 Nov (recipe-F calm, mouth at rest in the slot; replaces the 23 Oct render whose mouth moves) - not yet judged by Fendi |
| c014 | verse 1 | 25.11–26.59 | 36 | `0f00ecd5` c014_0f00ecd5_source.mp4 | 0.000 | CANDIDATE 17 Oct (board holds the 15 Oct carry) |
| c015 | verse 1 | 26.59–28.06 | 35 | `f1d0538b` c015_f1d0538b_source.mp4 | 0.000 | CANDIDATE 17 Oct, nothing selected |
| c016 | verse 1 | 28.06–29.54 | 36 | `2f3061b9` c016_2f3061b9_source.mp4 | 1.147 | CANDIDATE 17 Oct montage (board holds the rider clip you approved 13 Oct) |
| c017 | verse 1 | 29.54–31.51 | 47 | `f7ebb204` c017_f7ebb204_source.mp4 | 0.892 | CANDIDATE 17 Oct montage (board holds the mounted clip you approved 13 Oct) |
| c018 | break | 31.51–32.98 | 35 | `8d93aced` c018_8d93aced_source.mp4 | 0.000 | CANDIDATE 17 Oct (board holds the rider clip you approved 13 Oct) |
| c019 | break | 32.98–34.46 | 36 | `fda3c88c` c019_fda3c88c_source.mp4 | 0.000 | CANDIDATE 17 Oct (board holds a 15 Oct pick) |
| c020 | break | 34.46–36.42 | 47 | `c485122e` c020_c485122e_source.mp4 | 0.000 | CANDIDATE 17 Oct (board holds a 15 Oct pick) |
| c021 | break | 36.42–39.37 | 71 | `2d334fd7` c021_2d334fd7_source.mp4 | 0.000 | CANDIDATE 17 Oct (board holds a 15 Oct pick) |
| c022 | verse 2 | 39.37–40.85 | 36 | `c45251ee` c022_c45251ee_source.mp4 | 0.000 | CANDIDATE 17 Oct (board holds the 15 Oct carry) |
| c023 | verse 2 | 40.85–42.33 | 35 | `3643febe` c023_3643febe_source.mp4 | 1.141 | CANDIDATE 17 Oct montage (board holds the 15 Oct carry) |
| c024 | verse 2 | 42.33–43.80 | 35 | `66b56c6b` c024_66b56c6b_source.mp4 | 0.000 | CANDIDATE 17 Oct (board holds a 15 Oct pick) |
| c025 | verse 2 | 43.80–45.28 | 35 | `90ec4e33` c025_90ec4e33_source.mp4 | 1.138 | CANDIDATE 17 Oct montage (board holds the 15 Oct carry) |
| c026 | verse 2 | 45.28–46.75 | 35 | `d2ce8f07` c026_d2ce8f07_source.mp4 | 0.000 | CANDIDATE 17 Oct (board holds the 15 Oct carry) |
| c027 | verse 2 | 46.75–48.23 | 35 | `dc32d17c` c027_dc32d17c_source.mp4 | 1.135 | CANDIDATE 17 Oct montage (board holds a 15 Oct pick) |
| c028 | verse 2 | 48.23–50.19 | 47 | `b7ca925f` c028_b7ca925f_source.mp4 | 0.896 | CANDIDATE 17 Oct montage (board holds the 15 Oct carry) |
| c029 | verse 2 | 50.19–52.16 | 47 | `a2f302bd` c029_a2f302bd_source.mp4 | 0.000 | CANDIDATE 17 Oct, nothing selected |
| c030 | verse 2 | 52.16–54.13 | 1080 | `ca8bca0b` c030_ca8bca0b_source.mp4 | 1.000 | APPROVED by Fendi 4 Nov ('I like it'): Director cutaway, no him (replaces the generated profile whose mouth opened) |
| c031 | verse 2 | 54.13–56.10 | 47 | `9da46aa6` c031_9da46aa6_source.mp4 | 0.000 | CANDIDATE 17 Oct b-roll, nothing selected |
| c032 | verse 2 | 56.10–58.06 | 47 | `746b08a0` c032_746b08a0_source.mp4 | 0.000 | CANDIDATE 17 Oct (board holds the 15 Oct carry) |
| c033 | verse 2 | 58.06–59.54 | 720 | `ce365795` c033_ce365795_source.mp4 | 4.218 | APPROVED 18 Oct restage E1 v3, picture 1 frame earlier as he accepted (slip -1f) |
| c034 | verse 2 | 59.54–61.01 | 720 | `5aa6f01c` c034_5aa6f01c_source.mp4 | 0.000 | CANDIDATE 17 Oct E4 cutaway (frost on the showroom glass, no him); E2 restage ruled not usable here by Fendi 18 Oct |
| c035 | hook 1 | 61.01–62.49 | 36 | `a64bfbb6` c035_a64bfbb6_source.mp4 | 0.000 | CANDIDATE 17 Oct E3 whip pan to the platform (board holds the 15 Oct carry) |
| c036 | hook 1 | 62.49–63.96 | 1080 | `7a115d9c` c036_7a115d9c_source.mp4 | 1.600 | Director cutaway 4 Nov, no him (penguins, lights dip); replaces b77ef700 (generated mouth); awaits Fendi |
| c037 | hook 1 | 63.96–65.93 | 1080 | `4247fe23` c037_4247fe23_source.mp4 | 1.000 | Director cutaway 4 Nov, no him (frosted train); replaces 941148e8 (generated mouth close-up); awaits Fendi |
| c038 | hook 1 | 65.93–67.90 | 47 | `c8e50b98` c038_c8e50b98_source.mp4 | 0.000 | CANDIDATE 17 Oct (board holds a 15 Oct pick) |
| c039 | hook 1 | 67.90–70.85 | 70 | `65465c7a` c039_65465c7a_source.mp4 | 0.880 | CANDIDATE 17 Oct montage (board holds the Red Line clip you approved 13 Oct) |
| c040 | hook 1 | 70.85–72.33 | 36 | `a172ae9b` c040_a172ae9b_source.mp4 | 0.000 | CANDIDATE 17 Oct b-roll (board holds a 15 Oct pick) |
| c041 | hook 1 | 72.33–73.80 | 35 | `6f4edd50` c041_6f4edd50_source.mp4 | 0.000 | FINAL 4 Nov |
| c042 | hook 1 | 73.80–75.28 | 36 | `a2d40377` c042_a2d40377_source.mp4 | 0.000 | FINAL 1 Nov |
| c043 | hook 1 | 75.28–76.75 | 1080 | `d3b16d0a` c043_d3b16d0a_source.mp4 | 1.000 | Director cutaway 4 Nov, no him (chain in polar-bear fur, silver v2); fills the c043 gap; awaits Fendi |
| c044 | hook 1 | 76.75–78.72 | 47 | `8d34b4d0` c044_8d34b4d0_source.mp4 | 0.000 | PICK 27 Oct ('F is the best'), not yet final |
| c045 | hook 1 | 78.72–80.69 | 47 | `f17bee00` c045_f17bee00_source.mp4 | 0.000 | FINAL 1 Nov |
| c046 | hook 1 | 80.69–82.65 | 47 | `221961f4` c046_221961f4_source.mp4 | 0.000 | FINAL 4 Nov |
| c047 | hook 1 | 82.65–86.10 | 82 | `41d5c1da` c047_41d5c1da_source.mp4 | 0.011 | CANDIDATE 16 Oct montage v2 (nothing selected) |
Frame convention: 24 fps; a clip's frame 0 sits at its sync offset on the song; `source_in_s` is where the slot begins inside the source; slots are exact to the frame (2066 frames = 86.1 s in total).

## The board (VERIFIED by a read after the writes)

`video_variations` `c067efb9` (the active board) now has exactly one primary clip per shot on c001–c047, and it is the clip in this package. Previous picks (the 15 Oct narrative-treatment clips, and the 13 Oct approvals on c016/c017/c018/c037/c039) stay on their shots as alternates. c034: the E2 restage was ruled not usable on this interval by Fendi on 18 Oct ("cover with a cutaway"), so the package and the board carry the E4 frost cutaway there.

## Mouth rule, made explicit (5 Nov 2026, after Grokbot's first assembly)

Fendi: any shot where a generated version of him moves his mouth is NOT usable as it stands. It is replaced by b-roll
(a cutaway, or him with his mouth at rest), or it becomes a performance shot built from his real performance footage with
the clothing swap. The hand-off above did not say this per shot. This section does.

**Perfected performance shots — use as given, never replace:**

| Shot | What it is |
|---|---|
| c041 | FINAL: his real face put back over the Genjutsu clothing swap (black leather bucket hat, leather car coat) |
| c042 | FINAL: recipe-F b-roll with him, mouth at rest, band fixed (the mouth that moves in this slot is the woman beside him) |
| c045 | FINAL: recipe-F b-roll with him, mouth at rest, band fixed |
| c046 | FINAL: recipe-F b-roll with him, mouth at rest |
| c044 | PICK ("F is the best"): recipe-F b-roll with him, mouth at rest; not yet final |
| c033 | APPROVED 18 Oct: the E1 v3 restage, him rapping his own lines (a performance shot; the real-face canonical c033 BODY-ONLY `5482b35b` also exists) |
| c013 | recipe-F calm b-roll `78ed5ca7`, mouth at rest in the slot (swapped in 5 Nov; the 23 Oct render it replaces moved its mouth) |

**Shots with generated mouth movement — do NOT use the clip in the package as it stands:**

| Shot | Clip that moved its mouth | Replacement | State |
|---|---|---|---|
| c030 | `607043dc` (profile, mouth opens) | Director cutaway `ca8bca0b`, no him | DONE, approved by Fendi 4 Nov; primary on the board and in the package |
| c036 | `b77ef700` | Director cutaway `7a115d9c`, no him | DONE (Director, 4 Nov); primary on the board and in the package; awaits Fendi |
| c037 | `941148e8` | Director cutaway `4247fe23`, no him | DONE (Director, 4 Nov); primary on the board and in the package; awaits Fendi |
| c043 | `5f962dd8` (the rejected dressed take; the gap) | Director cutaway `d3b16d0a`, no him | DONE (Director, 4 Nov); primary on the board and in the package; awaits Fendi |
| c013 | `75efaff6` | recipe-F calm render `78ed5ca7`, mouth at rest | DONE $0 (5 Nov); primary; awaits Fendi |
| c009 | `be49e5b0` (his real take pasted into the lounge: REJECTED by Fendi 5 Nov, "bad masking with an outline around me like I'm pasted in the scene"; the 17 Oct lounge montage `21b9e18a` is an AI him with his mouth in sync, also unusable; the closet take is not a scene) | the composite lane (`docs/recipes/DRESS_AND_INSERT_WORKFLOW.md` step 6): his real take window dressed in the tool, face put back, matted, composited over the lounge plate; Fendi's four specs: positioned naturally, angled correctly, clothing swapped, mouth on the lyrics | v1 `425c846b` REJECTED (rules 3, 4, 5); v2 `980443a5` (5 Nov, ledger 222–225: dress $3.405, wall plate $2.311, the rest $0): crew cutaway → him alone at the wall over a moving plate, unselected, awaits Fendi; the Director does not touch c009 |
| c007 | `85101246` | Director's call: `punchin/c007_punchin.mp4` (coat and belt detail, soft: 3.9x), a cutaway, or a re-render | OPEN, with the Director (see the next section) |
| c010 | `f6ac996b` | Director's call: `punchin/c010_punchin.mp4` (chain and leather-jacket detail, 3.0x), a cutaway, or a re-render | OPEN, with the Director |
| c016 | `2f3061b9` | Director's call: `punchin/c016_punchin.mp4` (trench, 2.3x), a cutaway, or a re-render | OPEN, with the Director |
| c017 | `f7ebb204` | Director's call: `punchin/c017_punchin.mp4` (trench, hands, shoes, 2.1x), a cutaway, or a re-render | OPEN, with the Director |
| c025 | `90ec4e33` | Director's call: `punchin/c025_punchin.mp4` is NOT usable as is (cuts at the neck, reads headless); a lower reframe on the jacket, a cutaway, or a re-render | OPEN, with the Director |
| c027 | `dc32d17c` (slight) | Director's call: `punchin/c027_punchin.mp4` (coat, 2.2x), a cutaway, or a re-render | OPEN, with the Director |
| c028 | `b7ca925f` | Director's call: `punchin/c028_punchin.mp4` (mostly the fox cutaway already; his part becomes a coat detail, 3.0x), a cutaway, or a re-render | OPEN, with the Director |
| c039 | `65465c7a` | Director's call: `punchin/c039_punchin.mp4` (body, hand, shoes, penguin, 2.1x), a cutaway, or a re-render (recipe F, beige-cap window) | OPEN, with the Director |

The package in the folder above carries the Director's four cutaways in `sources/` and `slots/` (and the Director's own
files stay in `replacements/`). The eight OPEN slots still hold the moving-mouth clip in the package: cover them with a
cutaway without him until a replacement lands.

### The eight open shots: the Director decides (Fendi, 5 Nov 2026, later)

**c009 (5 Nov, later) is NOT on this list:** Fendi rejected the package's c009 on first sight and the closet take is not a scene, but
he wants c009 as a performance shot inside the generated lounge: the composite lane, which was never run on c009 (the rejected
clip came from a different, offline script). Claude ran it twice. v1 `425c846b` was REJECTED ("me cut into a picture with no movement … the men on the couch do NOT need to be shown at the same time as me"), which is now `docs/SHOT_RULES.md` rules 3–5. v2 `980443a5` (ledger 224–225) is the structure Fendi named: the crew cutaway, HARD CUT to him alone at the poster wall over a MOVING plate (a Seedance continuous take of the empty wall), him following the plate's camera drift and hidden below the couch back. Posted with the rules check. What it is: his IMG_6230 take (profile, dark-lit LED
room) cropped from the 4K master, dressed in the YSL denim look through `dress-clip` (lane B), his face put back
(proof 0), matted with RobustVideoMatting and placed at 1.22x in front of the lounge couch with
`scripts/edit/place_him_over_plate.py` (new: the tool's composite lane overlays the take at its own scale, which made
him smaller than the crew behind the couch; the script scales, places, grades and drifts him with the plate). The
Director leaves c009 alone; the package file is not to be used until Fendi's verdict replaces it.

Fendi refilled the provider wallet but does not want to spend on re-renders before free editing tricks have been tried, and
he wants the Director to decide how each of the eight moves forward: "let's hand off all of this with the option to keep
some zoomed in if it fits but ultimately let my director handle how we move forward." Grokbot has tools outside AVT; use
them. What Claude tried, free, and what it found:

| Trick | Result | Evidence |
|---|---|---|
| Trim the slot to a stretch where the mouth is shut | RULED OUT: the longest closed-mouth run in any of the eight is 0.25 s (c017); slots are 1.48–2.95 s | `mouth/<shot>.csv` in the package folder (lip gap / face width at 12 fps; shut = gap < 0.08) |
| Punch in below the chin (crop + scale only, no generation) | WORKS on the mouth: a face is found in 0 samples of every punch-in (c007 0/18, c010 0/24, c016 0/18, c017 0/24, c025 0/18, c027 0/18, c028 0/24, c039 0/35). It is a zoom, nothing more: the scene, light, wardrobe and motion are the clip's own pixels, reframed on the clothing | `punchin/<shot>_punchin.mp4` (1080x1920, cut to the slot, silent), `punchin/punchin_sheet.jpg` (original mid-slot frame + five frames of the punch-in per shot), `punchin/make_punchin.py` (the crop rule: lowest chin seen by the scan + one face width of margin, 9:16 window, lanczos) |

The crop line and cost of each punch-in (effective upscale from the 720p montage, so the higher the softer):

| Shot | Crop of the 720x1280 slot clip | Upscale | Reads as |
|---|---|---|---|
| c007 | 278x496 at (176,784) | 3.9x | coat and belt detail, soft |
| c010 | 358x638 at (228,642) | 3.0x | chain and leather jacket, good garment insert |
| c016 | 468x832 at (100,448) | 2.3x | trench by the lockers, scene still readable |
| c017 | 528x940 at (4,340) | 2.1x | trench, hands, shoes, mannequins behind |
| c025 | 620x1102 at (36,178) | 1.7x | NOT usable as is: neck visible at the top, reads headless |
| c027 | 490x872 at (130,408) | 2.2x | leather coat, luggage cart |
| c028 | 366x654 at (96,626) | 3.0x | fox cutaway, then a coat detail |
| c039 | 520x926 at (160,354) | 2.1x | body, hand, jeans and shoes, the penguin on the platform |

Options the Director has, none of which Claude has tried (Grokbot's own tools decide):

- Keep a punch-in where it fits, and have Claudia turn the static crop into a slow push-in or a reframe that moves, so it
  reads as a camera move. An upscaler on the softer ones (c007, c010, c028) would help.
- Reframe differently: a crop that keeps more scene but still clears the chin (the rule in `make_punchin.py` is a floor,
  not the only framing), or a crop that follows him.
- Hide the mouth rather than cut it off: a foreground element, a whip-pan or motion blur across the frames where the
  mouth moves, a freeze on a shut-mouth frame with a push (c017 has a 0.25 s run at t=1.08 s; the others less).
- Replace with a cutaway without him (the Director's lane on c030/c036/c037/c043).
- Re-render: the Director's Gemini route, or AVT's recipe F still-mouth render on request from Claude (list $2.219 per
  4 s shot; the wallet is refilled; every paid render is quoted first and goes in the ledger). No silent window exists in
  the leather-coat/bucket-hat or beanie looks, so a recipe-F re-render wears the black window's outfit.

Whatever the Director picks, the slot's replacement goes back on the board on its shot (rule 2 below) and is named in the
report back, old asset → new, with the trick used. `punchin/SHA256SUMS_punchin.txt` holds the punch-ins' hashes
(`sha256sum -c` in that folder prints 9 OK lines).

Measurement behind the lists: `scripts/edit/mouth_scan.py` on every slot clip, lip gap / face width per sample at 12 fps
(moving = mean > 0.08 with spread > 0.03, confirmed on a face sheet); c043's dressed take and c008's generated him keep
their mouths shut and stay.

## Rules that do not bend

1. **Never** apply generated lip-sync or any face-altering pass to Fendi. A shot with him keeps his real face; the finals c041/c042/c045/c046 were built with [`docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md`](../recipes/FACE_PRESERVING_CLOTHING_SWAP.md) (its "Run on a new take" is the run-book) and [`docs/recipes/BROLL_WITH_HIM_STILL_MOUTH.md`](../recipes/BROLL_WITH_HIM_STILL_MOUTH.md) (recipe F: b-roll with him, mouth at rest). Which method applies to a shot with him: [`docs/recipes/README.md`](../recipes/README.md).
2. A replacement clip goes back into AVT on its shot (`project_assets` + `shot_asset_assignments` on variation `c067efb9`) with a note saying what it replaced and why. No standalone Supabase: AVT is Lovable-managed; use the AVT MCP (`avt_insert`, `avt_update`) or the app.
3. Paid renders are quoted before they run and appended to [`docs/LEDGER_YSL_TESTING_BUDGET.md`](../LEDGER_YSL_TESTING_BUDGET.md) in the same commit as the result.
4. Report back with: the assembled first half (file + hash), the list of shots the Director replaced (old asset → new asset, why), and anything that needs Fendi's eye.

## Verification commands

```
# the folder is complete
avt_list_files bucket=project-exports prefix=<folder>/sources   → 47 entries
avt_list_files bucket=project-exports prefix=<folder>/slots     → 47 entries
# the files are the ones in this document
sha256sum -c SHA256SUMS.txt   → 94 lines ending in OK
# the board matches
avt_select shot_asset_assignments filters variation_id=c067efb9, is_primary=true, shot_number ≤ 47 → 47 rows, asset ids = the manifest's
```
