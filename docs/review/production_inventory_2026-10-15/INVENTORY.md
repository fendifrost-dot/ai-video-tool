# Production inventory — "YSL (Ice On)", Interrupted Broadcast · candidate 5

Date: 2026-10-15. Read-only research. Nothing was written to the database, no generation function was called.

| | |
|---|---|
| Project | `764a63d2-93cd-44f3-905f-292f14ab2f51` "YSL (Ice On)", aspect 9:16, `active_variation_id` = this board |
| Board | video_variation `882ec381-0fa0-4a76-b23b-b83ebc157372` "Interrupted Broadcast · candidate 5" |
| Song | `song_analyses` 4769e2c8: 201.8743 s, 121.998 BPM, provider `web-audio-builtin-v2-downbeat-uncertain`, analysed 2026-10-14. `sections_json`, `hooks_json`, `drops_json` are all empty. One beat = 0.4918 s; one bar = 1.967 s. |
| Sources | `shots` (window = `timestamp_start`/`timestamp_end`, the columns `fetchBoxes` in `src/lib/queries/storyboard.ts` reads; `spec_json.timeline` is stale and differs by ~0.26 s), `shot_asset_assignments`, `project_assets`, `variation_scenes`, `continuity_entities`, `character_features`, `performance_syncs`, `lyric_lines`, `treatment_versions`, `writer_runs`, `provider_jobs`. Selected clips were also probed with `ffprobe` through signed URLs (read-only). |

Evidence labels follow CLAUDE.md: unless marked otherwise, every figure below is **VERIFIED** (read from the row named, or measured by ffprobe). Statements marked **OBSERVED** were seen but not proven, and **HYPOTHESIS** marks an inference.

## How each column was derived

- **method**: `spec_json.production.method` (generate / restage / composite), with `spec_json.kind` in brackets.
- **selected media**: the `shot_asset_assignments` row with `is_primary = true` (the app's "selected"). Size, fps and length were measured with ffprobe. Every selected clip is 24 fps. Status is `project_assets.approval_status`.
- **alternates count**: all other assignment rows on the box (clips and stills). Superseded and "not used" versions are included.
- **performance covered?**: the result of `takeRangeForBox` (`src/lib/storyboard/footageEdit.ts`) for the only original take, `70304981`, with sync offset 0.8538 s and drift 0 ppm (status `manual`, so `isUsableSync` = true). Take time = song time − 0.8538. Restaged and composite clips are never offered under other boxes (`boxMedia` skips `derivedFrom`), so they are not counted. **This board has no `role = performance` assignment rows.**
- **scene**: `sceneOfShot` (`src/lib/wardrobe/outfits.ts`), which uses the scene that contains the shot's start time. No shot has its own `wardrobe.outfitKey`, so the outfit always comes from the scene.
- **lyric**: `lyric_lines` rows whose `start_seconds` falls inside the box. Each line is counted once. Some boxes sit entirely inside one mis-timed line, and these are flagged. The treatment's own per-shot lyric notes (`spec_json.references`) were written for older windows and do not match. They are listed in the appendix.

## Per-scene shot tables

The board has only 5 `variation_scenes` rows. Stretches that no scene covers are listed as "(no variation_scene)" with the treatment's section name.

### A. (no variation_scene) Opening — the burning show, 0.00–43.31 s

No scene row; no outfit (Fendi not on screen; rider/models/geese only).

| # | start–end | dur | method | selected media (type / status) | alternates count | performance covered? (take id + take time range) | lyric | notes |
|---|---|---|---|---|---|---|---|---|
| 1 `c001` | 0.00–3.96 | 3.96 | generate (broll) | clip `06715881` higgsfield 1080x1920 5.04s / pending | 5 (1 clip, 4 still) | `70304981` partial 0.00–3.11s (lead-in 0.85s) | — | LOCKED. Aerial wildfire, no shape yet. Old clip f1dc51cd superseded (monogram visible from frame 1). |
| 2 `c002` | 3.96–7.90 | 3.94 | generate (broll) | clip `deeaf421` higgsfield 1080x1920 5.04s / pending | 6 (1 clip, 5 still) | `70304981` full 3.11–7.05s | — | LOCKED. Monogram reveal from the air. |
| 3 `c003` | 7.90–11.83 | 3.93 | generate (broll) | clip `a1c8e8d3` higgsfield 1080x1920 5.04s / pending | 7 (2 clip, 5 still) | `70304981` full 7.05–10.98s | — | Ground-level models in smoke. Kling clip 5.04 s trimmed to 3.93 s box. |
| 4 `c004` | 11.83–15.77 | 3.94 | generate (broll) | clip `0649fc1e` higgsfield 1080x1920 5.04s / pending | 4 (1 clip, 3 still) | `70304981` full 10.98–14.92s | You don’t gotta cut the lights on | Models pass the lens. |
| 5 `c005` | 15.77–19.70 | 3.93 | generate (broll) | clip `4ead98d0` higgsfield 1080x1920 5.04s / pending | 7 (2 clip, 5 still) | `70304981` full 14.92–18.85s | This ice on / YSL I wear em like They white ones / I don’t follow brands | Telephoto silhouettes in heat shimmer. |
| 6 `c006` | 19.70–23.64 | 3.94 | generate (broll) | clip `7ceb788e` higgsfield 1080x1920 5.04s / pending | 4 (1 clip, 3 still) | `70304981` full 18.85–22.79s | Follow designers / The rims 21 don’t ride / No minors / More cameras in the whip | Low tracking on boots through ash. |
| 7 `c007` | 23.64–27.57 | 3.93 | generate (broll) | clip `da2edcbc` higgsfield 1080x1920 5.04s / pending | 2 (0 clip, 2 still) | `70304981` full 22.79–26.72s | Than a camera crew / All this ice around me / Need a Canada goose / So clean but I don’t do | Geese in Canada Goose jackets stop camera operators (flash insert taken from the camera-crew beat). |
| 8 `c008` | 27.57–29.54 | 1.97 | generate (generated) | clip `dcb45b02` grok 704x1280 2.04s / approved | 15 (3 clip, 12 still) | `70304981` full 26.72–28.69s | What the janitor do / My money talk for me | Rider beside horse before mounting. Approved 13 Oct. |
| 9 `c008_2` | 29.54–31.51 | 1.97 | generate (generated) | clip `fed968b9` grok 848x1056 2.04s / approved | 0 (0 clip, 0 still) | `70304981` full 28.69–30.66s | and it be rambling too | **M5** (approved 13 Oct) is the selected clip here. Spec (split copy of c008) still says she is NOT in the saddle; assignment note calls M5 "the mounted beat". 848x1056 source, letterboxed in 9:16. |
| 10 `c009` | 31.51–33.47 | 1.96 | generate (broll) | clip `d81576b5` grok 704x1280 2.04s / approved | 11 (3 clip, 8 still) | `70304981` full 30.66–32.62s | — | Side-on ride in colour. Approved 13 Oct. |
| 11 `c009_2` | 33.47–35.44 | 1.97 | generate (broll) | clip `acd2797b` grok 704x1280 2.04s / approved | 1 (0 clip, 1 still) | `70304981` full 32.62–34.59s | — | Closer side-on, black and white. Approved 13 Oct. |
| 12 `c010` | 35.44–37.41 | 1.97 | generate (generated) | clip `8049a6bc` grok 704x1280 2.04s / approved | 11 (3 clip, 8 still) | `70304981` full 34.59–36.56s | — | Hooves through ash, B/W. Approved 13 Oct. |
| 13 `c010_2` | 37.41–39.37 | 1.96 | generate (generated) | clip `627a0c79` grok 704x1280 2.04s / approved | 1 (0 clip, 1 still) | `70304981` full 36.56–38.52s | — | Profile close-up, B/W. Approved 13 Oct. |
| 14 `c011` | 39.37–43.31 | 3.94 | generate (generated) | clip `2e8cffbe` higgsfield 1080x1920 5.04s / pending | 9 (1 clip, 8 still) | `70304981` full 38.52–42.46s | Woooooo / know you see it | Pull back: B/W rider on a CRT in a spare room. |

### B. Scene "The viewer" — 43.14–50.98 s, outfit YSL_DENIM_LOOK

Scene row 327761de. Outfit 57b10a61 (v8): YSL Trucker Jacket – French Black Denim; YSL Mick Long Jeans – Westwood Black Denim; Y Varsity Cap in Gabardine – Black and Ivory; YSL Cassandre smooth leather belt; YSL Lewis grained leather sneakers; Glasses – Cazal MOD octagonal. Description: "plain t-shirt under the trucker jacket". approved_asset_id null, reference_asset_ids [].

| # | start–end | dur | method | selected media (type / status) | alternates count | performance covered? (take id + take time range) | lyric | notes |
|---|---|---|---|---|---|---|---|---|
| 15 `c012` | 43.31–47.24 | 3.93 | generate (generated) | clip `30edb345` higgsfield 1080x1920 5.04s / pending | 12 (1 clip, 11 still) | `70304981` full 42.46–46.39s | [inside misaligned line 16 'know you see it' 41.04–47.6, conf 0.75] | LOCKED. Fendi (denim look) watches CRT. Chosen keyframe 5d175ab3 shared with c013/c015; walk-in not shown. |
| 16 `c013` | 47.24–51.18 | 3.94 | generate (generated) | clip `1f8c0dbf` higgsfield 1080x1920 5.04s / pending | 15 (1 clip, 14 still) | `70304981` full 46.39–50.33s | Yves Saint Laurent / On the weekend / Fly on a week day / Never take a cheat day / Feel free today | LOCKED. Fendi on couch, CRT reflects lamp. |

### C. (no variation_scene) The rider turns, 51.18–55.11 s

No scene row; rider only.

| # | start–end | dur | method | selected media (type / status) | alternates count | performance covered? (take id + take time range) | lyric | notes |
|---|---|---|---|---|---|---|---|---|
| 17 `c014` | 51.18–53.15 | 1.97 | generate (generated) | clip `51519b24` grok 704x1280 2.04s / approved | 11 (4 clip, 7 still) | `70304981` full 50.33–52.30s | Fly enough to fly away / Drive like a getaway driver | LOCKED. Rider turns to camera, B/W. Approved 13 Oct. M5 is an unselected alternate here. |
| 18 `c014_2` | 53.15–55.11 | 1.96 | generate (generated) | clip `a668ffdb` grok 704x1280 2.04s / approved | 1 (0 clip, 1 still) | `70304981` full 52.30–54.26s | On the highway / In the city | LOCKED. Rider looks into lens, B/W. Approved 13 Oct. |

### D. Scene "The viewer, after the screen" — 54.90–58.82 s, outfit YSL_DENIM_LOOK

Scene row e57f8cb6. Same outfit as B.

| # | start–end | dur | method | selected media (type / status) | alternates count | performance covered? (take id + take time range) | lyric | notes |
|---|---|---|---|---|---|---|---|---|
| 19 `c015` | 55.11–59.05 | 3.94 | generate (generated) | clip `a13ce826` higgsfield 1080x1920 5.04s / pending (plays 1.3–4.9 s) | 8 (1 clip, 7 still) | `70304981` full 54.26–58.20s | where the murder rate high / But we living / Listen what they rap bout / Laugh cause we did it / what im whippin cost a home | LOCKED. CRT snaps to white point, room dies. Clip plays 1.3–4.9 s (3.6 s) in a 3.94 s box: 0.34 s short, last frame held. |

### E. (no variation_scene) Hand at the switch, 59.05–62.98 s

No scene row; woman's hand only.

| # | start–end | dur | method | selected media (type / status) | alternates count | performance covered? (take id + take time range) | lyric | notes |
|---|---|---|---|---|---|---|---|---|
| 20 `c016` | 59.05–62.98 | 3.93 | generate (generated) | clip `eb7db792` higgsfield 1080x1920 5.04s / pending | 5 (1 clip, 4 still) | `70304981` full 58.20–62.13s | Got everything but the kitchen / You don’t gotta | LOCKED. Woman flips wall switch. Chosen keyframe is a medium close-up, not the extreme close-up the box asks for. |

### F. Scene "Chicago, the switch" — 62.75–96.08 s, outfit YSL_LEATHER_COAT

Scene row 557e9d81. Outfit 0d18f174 (v7): Coat in Bubbled Lambskin – Noir; SL look – trousers (IMG_5541 full-outfit); Saint Laurent Cap in Cotton Gabardine – Beige and Ivory; Glasses – Cazal MOD octagonal. Description: "a button-up shirt and tie under the coat". approved_asset_id null, reference_asset_ids []. Scene ends 96.08 s but c023 runs to 96.42 s (scene windows were not moved by the beat conform).

| # | start–end | dur | method | selected media (type / status) | alternates count | performance covered? (take id + take time range) | lyric | notes |
|---|---|---|---|---|---|---|---|---|
| 21 `c017` | 62.98–66.92 | 3.94 | generate (generated) | clip `0000c19a` higgsfield 1080x1920 10.04s / approved | 9 (1 clip, 8 still) | `70304981` full 62.13–66.07s | cut the lights on / This ice on / YSL I wear em Like / they white ones / You don’t gotta / cut the lights on / This ice on / YSL I wear em Like | Red Line, 79th & Lafayette, leather coat + woman. 10 s clip shared with c018 (first 3.92 s). Approved 13 Oct; known garbled sign line, towers in background. |
| 22 `c018` | 66.92–70.85 | 3.93 | generate (generated) | clip `0000c19a` higgsfield 1080x1920 10.04s / approved (plays from 3.92 s) | 5 (1 clip, 4 still) | `70304981` full 66.07–70.00s | [inside misaligned line 40 'YSL I wear em Like' 66.34–73.78, conf 1] | Same 10 s clip from 3.92 s; woman exits frame ~2.6 s in. |
| 23 `c019` | 70.85–76.75 | 5.90 | restage (performance) | none (2 stills, none selected) | 2 (0 clip, 2 still) | `70304981` full 70.00–75.90s | they white ones | Perform to camera, street. Method restage = treatment wardrobe replaces filmed clothes. No clip. |
| 24 `c020` | 76.75–82.65 | 5.90 | restage (performance) | none (2 stills, none selected) | 2 (0 clip, 2 still) | `70304981` full 75.90–81.80s | You don’t gotta / cut the lights on / This ice on / YSL I wear em Like / they white ones | Perform to camera, Red Line behind. No clip. |
| 25 `c021` | 82.65–88.56 | 5.91 | restage (performance) | none (2 stills, none selected) | 2 (0 clip, 2 still) | `70304981` full 81.80–87.71s | You don’t gotta / cut the lights on / This ice on / YSL I wear em Like | ECU mouth, grill sections start rotating. No clip. |
| 26 `c022` | 88.56–92.49 | 3.93 | restage (performance) | none (2 stills, none selected) | 2 (0 clip, 2 still) | `70304981` full 87.71–91.64s | they white ones / Freezin every season | ECU mouth, grill rotating then locking. No clip. |
| 27 `c023` | 92.49–96.42 | 3.93 | restage (performance) | none | 0 (0 clip, 0 still) | `70304981` full 91.64–95.57s | [inside misaligned line 52 'Freezin every season' 90.42–142.94, conf 0] | ECU mouth, grill intact. Nothing on box. |

### G. Scene "The cold front" — 96.08–123.53 s, outfit YSL_JACKET

Scene row 09591369. Outfit e12c51bf (v6): Saint Laurent Track Jacket – Mastic Cotton Navy Stripe; Cassandre Cap in Cotton Denim Twill – Khaki; YSL slim low-rise jeans; YSL Lewis grained leather sneakers; Glasses – Cazal MOD octagonal. Description: "a button-up shirt and tie under the track jacket". approved_asset_id null, reference_asset_ids []. Scene ends 123.53 s but c028 runs to 123.97 s.

| # | start–end | dur | method | selected media (type / status) | alternates count | performance covered? (take id + take time range) | lyric | notes |
|---|---|---|---|---|---|---|---|---|
| 28 `c024` | 96.42–102.33 | 5.91 | restage (performance) | none | 0 (0 clip, 0 still) | `70304981` full 95.57–101.48s | [inside misaligned line 52 'Freezin every season' 90.42–142.94, conf 0] | Blizzard whiteout, perform to camera. Nothing on box. |
| 29 `c025` | 102.33–108.23 | 5.90 | restage (performance) | none | 0 (0 clip, 0 still) | `70304981` full 101.48–107.38s | [inside misaligned line 52 'Freezin every season' 90.42–142.94, conf 0] | Blizzard, wind in jacket, breath. Nothing on box. |
| 30 `c026` | 108.23–112.16 | 3.93 | restage (performance) | none | 0 (0 clip, 0 still) | `70304981` full 107.38–111.31s | [inside misaligned line 52 'Freezin every season' 90.42–142.94, conf 0] | Blizzard + polar bear with chain + penguins. Nothing on box. |
| 31 `c027` | 112.16–118.06 | 5.90 | restage (performance) | none | 0 (0 clip, 0 still) | `70304981` full 111.31–117.21s | [inside misaligned line 52 'Freezin every season' 90.42–142.94, conf 0] | Blizzard, bear behind, penguins foreground. Nothing on box. |
| 32 `c028` | 118.06–123.97 | 5.91 | composite (performance) | none | 0 (0 clip, 0 still) | `70304981` full 117.21–123.12s | [inside misaligned line 52 'Freezin every season' 90.42–142.94, conf 0] | Method composite: take over generated blizzard + animals. Nothing on box. |

### H. (no variation_scene) The camera crew, 123.97–175.11 s

No scene row; crew, Maybach, geese, news camera. Fendi appears only on monitors (c030).

| # | start–end | dur | method | selected media (type / status) | alternates count | performance covered? (take id + take time range) | lyric | notes |
|---|---|---|---|---|---|---|---|---|
| 33 `c029` | 123.97–129.87 | 5.90 | generate (generated) | none | 0 (0 clip, 0 still) | `70304981` full 123.12–129.02s | [inside misaligned line 52 'Freezin every season' 90.42–142.94, conf 0] | Mobile control room, monitors show Chicago/blizzard/burning show. Nothing on box. |
| 34 `c030` | 129.87–135.77 | 5.90 | generate (generated) | none | 0 (0 clip, 0 still) | `70304981` full 129.02–134.92s | [inside misaligned line 52 'Freezin every season' 90.42–142.94, conf 0] | Control room, Fendi on monitors. Nothing on box. |
| 35 `c031` | 135.77–139.70 | 3.93 | generate (generated) | none | 0 (0 clip, 0 still) | `70304981` full 134.92–138.85s | [inside misaligned line 52 'Freezin every season' 90.42–142.94, conf 0] | Operator shoulders camera, reaches for exit. Nothing on box. |
| 36 `c032` | 139.70–145.60 | 5.90 | generate (generated) | none | 0 (0 clip, 0 still) | `70304981` full 138.85–144.75s | We party / like new years evenin / Diamonds dancin / Like the disco / Get fly I know | Same action as c031 (duplicate beat). Nothing on box. |
| 37 `c033` | 145.60–151.51 | 5.91 | generate (generated) | none | 0 (0 clip, 0 still) | `70304981` full 144.75–150.66s | That you see it / Freezin every season / We party | Operator steps out of Maybach SUV, crew follows. Nothing on box. |
| 38 `c034` | 151.51–157.41 | 5.90 | generate (generated) | none | 0 (0 clip, 0 still) | `70304981` full 150.66–156.56s | like new years evenin / Diamonds dancin / Like the disco / Get fly I know / That you see it / Freezin every season | Same action as c033. Nothing on box. |
| 39 `c035` | 157.41–161.34 | 3.93 | generate (generated) | none | 0 (0 clip, 0 still) | `70304981` full 156.56–160.49s | We party / like new years evenin / Diamonds dancin | Crew yields to geese in Canada Goose jackets (lyric for it is sung at 25.14–27.04 s). Nothing on box. |
| 40 `c036` | 161.34–165.28 | 3.94 | generate (generated) | none | 0 (0 clip, 0 still) | `70304981` full 160.49–164.43s | Like the disco / Get fly I know / That you see it / Freezin every season | Same geese beat. Nothing on box. |
| 41 `c037` | 165.28–169.21 | 3.93 | generate (broll) | none | 0 (0 clip, 0 still) | `70304981` full 164.43–168.36s | We party / like new years evenin / Diamonds dancin | News camera swings to building entrance. Nothing on box. |
| 42 `c038` | 169.21–175.11 | 5.90 | generate (broll) | none | 0 (0 clip, 0 still) | `70304981` full 168.36–174.26s | Like the disco / Get fly I know / That you see it / You don’t gotta / cut the lights on / This ice on / YSL I wear em Like | Camera view: models approach entrance. Nothing on box. |

### I. Scene "The clean entrance" — 174.51–188.24 s, outfit THE_CLEAN_ENTRANCE_LOOK

Scene row aa3fa72c. Outfit 3906edaa (v3): YSL cotton jacket; YSL confetti viscose shirt; YSL nylon bucket hat; YSL Mick Long Jeans – Westwood Black Denim; YSL Cassandre smooth leather belt; YSL Lewis grained leather sneakers; Glasses – Cazal MOD octagonal. Description: "the confetti shirt under the cotton jacket". approved_asset_id null, reference_asset_ids []. Scene notes say "from the treatment's words: exact YSL leather coat" and the shots' spec wardrobe also says "exact YSL leather coat" — conflicts with the outfit key. Scene ends 188.24 s but c041 runs to 188.89 s.

| # | start–end | dur | method | selected media (type / status) | alternates count | performance covered? (take id + take time range) | lyric | notes |
|---|---|---|---|---|---|---|---|---|
| 43 `c039` | 175.11–179.05 | 3.94 | generate (generated) | none | 0 (0 clip, 0 still) | `70304981` full 174.26–178.20s | they white ones | Models in formation, janitor + wet-floor sign. Spec wardrobe says "exact YSL leather coat"; scene outfit is THE_CLEAN_ENTRANCE_LOOK. Nothing on box. |
| 44 `c040` | 179.05–182.98 | 3.93 | generate (generated) | none | 0 (0 clip, 0 still) | `70304981` full 178.20–182.13s | You don’t gotta / cut the lights on / This ice on / YSL I wear em Like | Camera drops to reflective floor. Nothing on box. |
| 45 `c041` | 182.98–188.89 | 5.91 | generate (generated) | none | 0 (0 clip, 0 still) | `70304981` full 182.13–188.04s | they white ones / You don’t gotta | Fendi enters with models; janitor pulls sign aside. Nothing on box. |

### J. (no variation_scene) Security monitor, 188.89–201.87 s

No scene row; rider on a monitor only.

| # | start–end | dur | method | selected media (type / status) | alternates count | performance covered? (take id + take time range) | lyric | notes |
|---|---|---|---|---|---|---|---|---|
| 46 `c042` | 188.89–194.79 | 5.90 | generate (generated) | none | 0 (0 clip, 0 still) | `70304981` partial 188.04–190.34s | cut the lights on / This ice on / YSL I wear em Like / they white ones | Security monitor shows the rider arriving. Nothing on box. |
| 47 `c043` | 194.79–201.87 | 7.08 | generate (broll) | none | 0 (0 clip, 0 still) | no (past take end 191.19s) | — | Same monitor beat, final shot to song end. Nothing on box. |

## Summary

| count | value | how |
|---|---|---|
| Total shots | **47** | rows in `shots` for the variation, all with a `spec_key`. That is 43 from the treatment plus 4 splits (`c008_2`, `c009_2`, `c010_2`, `c014_2`). 8 are locked: c001, c002, c012, c013, c014, c014_2, c015, c016. |
| Shots with a selected clip | **22** (c001–c018 including the 4 splits), covering 0.00–70.85 s = 70.85 s (35.1 % of 201.87 s) | `is_primary` assignment of role `generated_clip`. 10 of these clips are `approved` (c008, c008_2, c009, c009_2, c010, c010_2, c014, c014_2, c017, c018) and 12 are `pending` (c001–c007, c011, c012, c013, c015, c016). |
| Shots with only stills | **4** (c019, c020, c021, c022), 70.85–92.49 s = 21.64 s | 2 `reference_image` storyboard stills each, none selected, no clip |
| Empty shots | **21** (c023–c043), 92.49–201.87 s = 109.38 s (54.2 %) | no assignment rows at all |
| Performance shots | **10** (c019–c028, `shot_type = performance`), 70.85–123.97 s = 53.12 s | 9 have method `restage` and c028 has `composite`. **None has any clip.** c019–c022 have stills only; c023–c028 have nothing. |
| Performance shots whose scene outfit differs from the take | **10 of 10** | The take `70304981` shows "a woodland-camouflage short-sleeve military shirt with a small flag patch on the chest, a navy baseball cap, glasses, a short beard, dark jeans", filmed "in front of a white door in a walk-in closet" (`metadata_json.shows` / `filmed_in`). c019–c023 are in scene YSL_LEATHER_COAT and c024–c028 in YSL_JACKET. Neither outfit has a camouflage shirt or a navy cap. Whether his glasses are the Cazal MOD is unknown. |
| Base-layer fallback | 24 boxes (c019–c042) | **OBSERVED, from code:** `boxMedia.showing` falls back to the synced take when nothing is selected. So in Review, c019–c041 play the raw closet take in full, c042 plays it in part, and c043 is black. |

### Duration distribution (box length, seconds)

| length | bars at 121.998 BPM | shots | histogram |
|---|---|---|---|
| 1.96–1.97 s | 1 bar | 8 | `########` c008, c008_2, c009, c009_2, c010, c010_2, c014, c014_2 |
| 3.93–3.96 s | 2 bars | 23 | `#######################` |
| 5.90–5.91 s | 3 bars | 15 | `###############` c019, c020, c021, c024, c025, c027, c028, c029, c030, c032, c033, c034, c038, c041, c042 |
| 7.08 s | ~3.6 bars | 1 | `#` c043 (runs to the song's end) |

Total = 47 shots and 201.87 s. Lengths of the selected clips (ffprobe): 12 Kling clips at 5.04 s, 1 Kling clip at 10.04 s (shared by c017 and c018), and 8 Grok clips at 2.04 s (7 at 704x1280 plus M5 at 848x1056). That makes 21 distinct clips for 22 shots. Every selected clip is at least as long as its box except c015, which plays 1.3–4.9 s (3.6 s) in a 3.94 s box, so 0.34 s is short and its last frame is held (assignment note).

## Performance takes in the project (`project_assets.footage_role = 'performance'`, 18 rows)

Only **one** is an original recording. The other 17 were made from it (`metadata_json.derived_from.asset_id = 70304981`). All 18 have a `performance_syncs` row with drift 0 ppm. Song range = offset … offset + duration.

| asset | kind | type / status | file | dur (s) | fps | sync status | offset (s) | song range covered (s) | made from | lives on |
|---|---|---|---|---|---|---|---|---|---|---|
| `70304981` | **ORIGINAL take** | reference_video / pending | hero_clip_hd_1080.mp4 | 190.34 | 59.94 (ffprobe: 60000/1001, 11409 frames, 1080x1920, HLG arib-std-b67) | manual (sync `28dbe292`) | 0.8538 | 0.854–191.194 | — | no shot (`shot_id` null) |
| `56271995` | restaged | generated_clip / pending | generated_higgsfield_02f513a6-a43.mp4 | 4 | 24 (beat_check metadata) | confirmed (sync `582686fe`) | 47.067 | 47.067–51.067 | take 46.213–50.2 s | shot c013 of variation 86fe511a "Paris Black Runway" |
| `b7eeac58` | restaged | generated_clip / pending | generated_higgsfield_a61d588e-ad9.mp4 | 4 | unknown | confirmed (sync `ea532b02`) | 54.908 | 54.908–58.908 | take 54.054–58.041 s | shot c015 of variation 86fe511a "Paris Black Runway" |
| `beb97940` | restaged | generated_clip / pending | generated_higgsfield_84292337-66c.mp4 | 4 | 24 (beat_check metadata) | confirmed (sync `2b09db0d`) | 62.749 | 62.749–66.749 | take 61.895–65.899 s | shot c017 of variation 86fe511a "Paris Black Runway" |
| `498ce2d6` | restaged | generated_clip / pending | generated_higgsfield_5ce298e1-4a7.mp4 | 4 | 24 (beat_check metadata) | confirmed (sync `f2997193`) | 62.749 | 62.749–66.749 | take 61.895–65.899 s | shot c017 of variation 86fe511a "Paris Black Runway" |
| `8a894762` | restaged | generated_clip / pending | generated_higgsfield_d0761f7f-400.mp4 | 4 | 24 (beat_check metadata) | confirmed (sync `19c7fcf1`) | 62.749 | 62.749–66.749 | take 61.895–65.899 s | shot c017 of variation 86fe511a "Paris Black Runway" |
| `081de4c6` | restaged | generated_clip / pending | generated_higgsfield_69bf008f-f13.mp4 | 4 | 24 (beat_check metadata) | confirmed (sync `07524ca3`) | 62.749 | 62.749–66.749 | take 61.895–65.899 s | shot c017 of variation 86fe511a "Paris Black Runway" |
| `a84ea8e5` | composite | edited_clip / pending | c017_take3710-3944_runway_composite.mp4 | 3.937 | 29.97 (composite metadata) | confirmed (sync `9358ee13`) | 62.749 | 62.749–66.686 | take 61.895–65.832 s | no shot (`shot_id` null) |
| `1a86ff9f` | restaged | generated_clip / pending | generated_higgsfield_cdce7fe9-177.mp4 | 4 | unknown | confirmed (sync `d9431455`) | 73.526 | 73.526–77.526 | take 72.673–76.677 s | shot c019_2 of variation 86fe511a "Paris Black Runway" |
| `62297e90` | restaged | generated_clip / pending | generated_higgsfield_bb64b96c-820.mp4 | 4 | unknown | confirmed (sync `1df9727b`) | 79.399 | 79.399–83.399 | take 78.545–82.549 s | shot c020_2 of variation 86fe511a "Paris Black Runway" |
| `61dff066` | restaged | generated_clip / pending | generated_higgsfield_1afdcd2e-755.mp4 | 4 | unknown | confirmed (sync `c1941fbc`) | 79.399 | 79.399–83.399 | take 78.545–82.549 s | shot c020_2 of variation 86fe511a "Paris Black Runway" |
| `188602d5` | restaged | generated_clip / pending | generated_higgsfield_b6a5be39-53c.mp4 | 4 | unknown | confirmed (sync `dd0ff350`) | 79.416 | 79.416–83.416 | take 78.562–82.549 s | shot c020_2 of variation 86fe511a "Paris Black Runway" |
| `93511452` | restaged | generated_clip / pending | generated_higgsfield_d5246c0d-c0d.mp4 | 4 | unknown | confirmed (sync `7f375ff1`) | 88.224 | 88.224–92.224 | take 87.371–91.375 s | shot c022 of variation 86fe511a "Paris Black Runway" |
| `a7096174` | restaged | generated_clip / pending | generated_higgsfield_8a9afc00-beb.mp4 | 4 | unknown | confirmed (sync `afd181d8`) | 88.241 | 88.241–92.241 | take 87.387–91.391 s | shot c022 of variation 86fe511a "Paris Black Runway" |
| `ae0a116f` | restaged | generated_clip / pending | generated_higgsfield_128583d3-375.mp4 | 4 | 24 (beat_check metadata) | confirmed (sync `edf49dd0`) | 156.86 | 156.860–160.860 | take 156.006–160.01 s | shot c035 of variation 86fe511a "Paris Black Runway" |
| `69280525` | restaged | generated_clip / pending | generated_higgsfield_7d4c634d-9d3.mp4 | 4 | 24 (beat_check metadata) | confirmed (sync `d69ebabc`) | 156.86 | 156.860–160.860 | take 156.006–160.01 s | shot c035 of variation 86fe511a "Paris Black Runway" |
| `9d132fa4` | restaged | generated_clip / pending | generated_higgsfield_b9a18d27-876.mp4 | 4 | 24 (beat_check metadata) | confirmed (sync `b5e6b425`) | 164.701 | 164.701–168.701 | take 163.847–167.851 s | shot c037 of variation 86fe511a "Paris Black Runway" |
| `4b872af2` | restaged | generated_clip / pending | generated_higgsfield_e5f767aa-2c6.mp4 | 6 | 24 (beat_check metadata) | confirmed (sync `fc4c84a7`) | 168.621 | 168.621–174.621 | take 167.768–173.774 s | shot c038 of variation 86fe511a "Paris Black Runway" |

Notes on the takes:
- The original take `70304981` (hero_clip_hd_1080.mp4, uploaded 2026-07-20) covers song **0.854–191.194 s**. That is the whole song except 0–0.854 s and 191.194–201.874 s (10.68 s of outro). Its sync was entered by hand ("offset entered by hand", status `manual`). `confidence_json` is empty, so no windowed evidence is stored for the offset.
- All 17 derived clips were made for the **Paris Black Runway** variation (`86fe511a`), or assigned to no shot (composite `a84ea8e5`). None is assigned on this board, and the app will not offer them under this board's boxes. Each one's look is set by the Paris Black Runway restage, and what that look is was not checked here, so it is unknown.
- The composite `a84ea8e5` was "made by scripts/qa/composite_take.py on a build box, not by AVT" (asset notes).

## M5 — asset `fed968b9-f95e-482f-a7b4-e713690583a3`

| | |
|---|---|
| Asset | `generated_clip`, Grok, `approval_status = approved`, created 2026-10-13 05:44 UTC. Provider job a078b4b7 asked for 2 s at 3:4. ffprobe: **848x1056, 24 fps, 2.04 s.** |
| Selected placement | **Shot `c008_2`** (id `032dac9d…`, #44, split from c008, 29.54–31.51 s, 1.97 s). Assignment `de8e2b99-7cf9-424a-983e-37d493f1a08b`, role `generated_clip`, **`is_primary = true` (selected)**, sort 1, created 2026-10-13 22:13 UTC. It is the only assignment on c008_2. Note: "placed 13 Oct (Claude) as the mounted beat after she stands at the horse (c008)… plays with black bars top and bottom in the 9:16 frame." |
| Alternate placement | **Shot `c014`** (51.18–53.15 s). Assignment `3b71f61b-fd5a-48b4-8a60-b65bc0285383`, **`is_primary = false` (not selected)**, sort 12, created 2026-10-14 05:44 UTC. Approved clip `51519b24` stays selected there; the note says "swap only on Fendi's say". |
| Inconsistencies (OBSERVED) | (1) `project_assets.shot_id` is null, and the asset's notes still say "Not yet placed on a shot or timeline", which is stale. (2) c008_2's spec is a copy of c008: the rider "stands on the ground beside the horse … she is not in the saddle". The M5 assignment calls it "the mounted beat", and the asset notes say "horse head never in frame". (3) It is not in any `timeline_items` row. |

## Treatment (`treatment_versions` c96ae887, the only row for this variation, 2026-10-09 07:35 UTC)

Title: **YSL — "INTERRUPTED BROADCAST"**. Mode `manual`, model grok-4-fast. The storyboard was written from treatment fingerprint `5573:swroq6` by writer run `05c89ef8` (43 shots asked, 43 written, $0.0246).

**Logline:** "An impossible Saint Laurent–inspired fashion show takes over Fendi's television, then spills into his Chicago surroundings. Fire becomes snow. A luxury SUV contains a television control room. Every new location seems to be broadcasting the next."

**Scenes (treatment sections → 22 beats):**
1. *Opening — The burning show* (b01–b05; c001–c010_2). An aerial wildfire reveals a YSL monogram cut into the forest. Models move through the burning strokes. Ground-level coverage shows no logo. Fashion coverage: telephoto, boots through ash, leather in firelight. A Black woman mounts a horse and rides between walls of fire, and a side-on shot drains to black and white.
2. *The viewer* (b06–b10; c011–c016). Pull back to a small B/W CRT. Fendi in the exact YSL denim look watches in a spare room. The rider turns to the broadcast camera, the TV snaps to a white point and the room goes dark. A woman's hand flips a wall switch.
3. *Chicago — The switch* (b11–b13; c017–c023). The light returns on the vocal entrance. Fendi stands in the same frame position at 79th & Lafayette by the Red Line in the exact YSL leather coat, and the woman completes her move beside him. He performs to camera. On "you don't gotta cut the lights on, this ice on" there is an extreme close-up of his mouth, where diamond sections of the grill rotate like reels and lock.
4. *The cold front* (b14–b15; c024–c028). A grill reflection becomes a whiteout. A blizzard follows, with Fendi in the specified YSL jacket, a polar bear with a heavy chain, and penguins wearing jewelry.
5. *The camera crew* (b16–b19; c029–c036, plus c007). A cramped mobile broadcast control room has monitors showing Chicago, the blizzard and the burning show. An operator exits, and the reveal is that the room is inside a Maybach SUV. Crew pour out with news cameras, then must yield to geese in miniature Canada Goose jackets.
6. *The clean entrance* (b20–b22; c037–c043). A news camera swings to a building. Models approach, and a janitor finishes the floor by a wet-floor sign. The floor reflects them. Fendi enters with them as the janitor pulls the sign aside. A security monitor shows the rider arriving: "The broadcast is now ahead of reality."

**Lyric beats the treatment ties to words** (`treatment.storyboard.coverage`):
- Anchored: "you don't gotta cut the lights on, this ice on" → b11 / c017 (switch) and b13 / c021 (grill).
- Unanchored, marked "sung earlier": "more cameras in the whip than a camera crew" (b16), "all this ice around me, need a Canada Goose" (b19), "so clean, but I don't do what the janitors do" (b21). In `lyric_lines` these are sung **only once**, at 23.38–25.12 s, 25.14–27.04 s and 27.04–29.00 s. The beats they motivate sit at 123.97 s (c029), 157.41 s (c035) and 175.11 s (c039). The writer inserted c007 (geese flash, 23.64–27.57 s) as a stand-in.
- Coverage verdict: **fail** (sections lyrics / treatment / structural = fail; production / relationships = pass).

**"Outrageous" ideas:** no field, row or text in this variation's treatment, `writer_runs` row, or the project's `video_projects` row uses the word "outrageous", so the requested list cannot be quoted from the data. What follows are the treatment's impossible set pieces as written, followed by the project's `creative_exemplars` (the closest stored "wild ideas" list):
- From the treatment: a YSL monogram burned into a forest at forest scale with models walking inside it; a fashion-show broadcast that "is ahead of reality"; a grill whose diamond sections rotate like slot reels; a polar bear wearing a heavy chain and penguins with jewelry under their feathers; a TV control room inside a Maybach SUV; geese in miniature Canada Goose jackets stopping a news crew; a janitor clearing the wet-floor sign for Fendi's step.
- `video_projects.creative_exemplars` (4): (1) a model opens a door and flicks the switch to reveal the arctic: penguins and polar bears in rapper jewelry, and a half-snowman, half-human in urban winter gear. (2) A wheel-less Bentley carried down the street on four kids' shoulders. (3) A luxury car swarmed by reporters filming him through the windows ("more cameras in the whip than a camera crew"). (4) He performs with a fashion show behind him, with nobody posing for the camera.

## Lyrics with timestamps (`lyric_lines`, 95 rows, source `align_lyrics`, written 2026-10-02)

Song clock, seconds. Confidence is in brackets.

| block | section | start–end (s) | lines (start s · text · confidence) |
|---|---|---|---|
| 0 | verse | 14.68–31 | 14.68 You don’t gotta cut the lights on (0.29) / 16.72 This ice on (0) / 17.52 YSL I wear em like They white ones (0.88) / 19.48 I don’t follow brands (0.5) / 20.54 Follow designers (1) / 21.28 The rims 21 don’t ride (1) / 22.68 No minors (1) / 23.38 More cameras in the whip (0.6) / 24.32 Than a camera crew (0.5) / 25.14 All this ice around me (0.8) / 26.24 Need a Canada goose (0.75) / 27.04 So clean but I don’t do (0.67) / 28.2 What the janitor do (0.75) / 29 My money talk for me (1) / 30.02 and it be rambling too (0.4) |
| 1 | adlib | 40.64–41.04 | 40.64 Woooooo (1) |
| 2 | verse | 41.04–60.8 | 41.04 know you see it (0.75) / 47.6 Yves Saint Laurent (0.67) / 48.34 On the weekend (1) / 48.98 Fly on a week day (0.8) / 50.1 Never take a cheat day (1) / 51.14 Feel free today (1) / 52.02 Fly enough to fly away (1) / 53.08 Drive like a getaway driver (0.8) / 54.26 On the highway (0.67) / 54.86 In the city (1) / 55.26 where the murder rate high (0.6) / 56.26 But we living (0.67) / 56.82 Listen what they rap bout (0.8) / 58.02 Laugh cause we did it (1) / 58.8 what im whippin cost a home (0.67) / 59.68 Got everything but the kitchen (0.8) |
| 3 | hook | 60.8–66.39 | 60.8 You don’t gotta (1) / 63.16 cut the lights on (0.5) / 63.94 This ice on (0) / 64.84 YSL I wear em Like (0.8) / 65.9 they white ones (0.67) |
| 4 | hook | 66.34–74.7 | 66.34 You don’t gotta (0) / 66.34 cut the lights on (0) / 66.34 This ice on (0) / 66.34 YSL I wear em Like (1) / 73.78 they white ones (0.33) |
| 5 | hook | 78–85.86 | 78 You don’t gotta (1) / 78.86 cut the lights on (0.25) / 80.233 This ice on (0) / 80.673 YSL I wear em Like (0.6) / 81.62 they white ones (0.33) |
| 6 | hook | 85.86–90.42 | 85.86 You don’t gotta (1) / 86.72 cut the lights on (0.25) / 87.82 This ice on (0) / 87.82 YSL I wear em Like (0.8) / 89.5 they white ones (1) |
| 7 | hook | 90.42–149.28 | 90.42 Freezin every season (0) / 142.94 We party (0) / 142.94 like new years evenin (0) / 142.94 Diamonds dancin (0) / 142.94 Like the disco (0) / 142.94 Get fly I know (0.5) / 147.968 That you see it (0) |
| 8 | hook | 149.28–156.8 | 149.28 Freezin every season (1) / 150.82 We party (1) / 151.52 like new years evenin (1) / 152.9 Diamonds dancin (1) / 154.12 Like the disco (0.67) / 154.72 Get fly I know (0.5) / 155.82 That you see it (1) |
| 9 | hook | 156.8–164.72 | 156.8 Freezin every season (1) / 158.76 We party (1) / 159.42 like new years evenin (1) / 160.86 Diamonds dancin (1) / 161.88 Like the disco (1) / 162.6 Get fly I know (0.75) / 163.72 That you see it (1) |
| 10 | hook | 164.72–172.64 | 164.72 Freezin every season (1) / 166.62 We party (1) / 167.28 like new years evenin (1) / 168.7 Diamonds dancin (1) / 169.62 Like the disco (0.67) / 170.5 Get fly I know (0.75) / 171.6 That you see it (1) |
| 11 | hook | 172.64–176.86 | 172.64 You don’t gotta (1) / 173.32 cut the lights on (0.25) / 173.82 This ice on (0.33) / 174.92 YSL I wear em Like (0.8) / 176.06 they white ones (1) |
| 12 | hook | 180.32–184.74 | 180.32 You don’t gotta (1) / 181.18 cut the lights on (0.75) / 181.96 This ice on (0) / 182.8 YSL I wear em Like (1) / 183.94 they white ones (1) |
| 13 | hook | 188.22–193.08 | 188.22 You don’t gotta (1) / 189.06 cut the lights on (0.25) / 189.52 This ice on (0.33) / 189.88 YSL I wear em Like (0.8) / 191.82 they white ones (1) |
Alignment problems (VERIFIED from the rows; their cause is a HYPOTHESIS):
- **Line 52 "Freezin every season" runs 90.42–142.94 s (52.5 s, confidence 0).** Lines 53–56 are zero-length at 142.94 s. So what is sung across 90.42–142.94 s, which covers 26 % of the song and boxes c022–c032, is **unknown** from the data. It may be vocals missing from the lyric sheet, or the alignment may have failed.
- Lines 37–39 are zero-length at 66.34 s, and line 40 "YSL I wear em Like" runs 66.34–73.78 s (7.44 s) with confidence 1.
- Line 16 "know you see it" runs 41.04–47.60 s (6.56 s).
- The first vocal starts at 14.68 s. Nothing is aligned before that.
- 14 lines have confidence 0.

## Appendix — lyric notes inside `spec_json.references` (treatment-era windows; do not match the boxes)

- `c004`: You don’t gotta
- `c005`: cut the lights on / This ice on / YSL I wear em like They white ones / I
- `c006`: I don’t follow brands / Follow designers / The rims 21 don’t ride / No minors / More
- `c007`: cameras in the whip / Than a camera crew / All this ice around me / Need a Canada goose / So
- `c008`: clean but I don’t do / What the janitor do / My money talk for me / and it be rambling too
- `c008_2`: clean but I don’t do / What the janitor do / My money talk for me / and it be rambling too
- `c011`: Woooooo / know
- `c012`: know you see
- `c013`: see it / Yves Saint Laurent / On the weekend / Fly on a week day / Never take a cheat day
- `c014`: day / Feel free today / Fly enough to fly away / Drive like a getaway driver / On the highway
- `c014_2`: day / Feel free today / Fly enough to fly away / Drive like a getaway driver / On the highway
- `c015`: In the city / where the murder rate high / But we living / Listen what they rap bout / Laugh cause we did it
- `c016`: what im whippin cost a home / Got everything but the kitchen / You don’t
- `c017`: don’t gotta / cut the lights on / This ice on / YSL I wear em Like / they white ones / You don’t gotta / cut the lights on / This ice on / YSL
- `c018`: YSL I wear em
- `c019`: em Like / they white ones
- `c020`: You don’t gotta / cut the lights on / This ice on / YSL I wear em Like / they white ones
- `c021`: em Like / they white ones
- `c022`: wear em Like / they white ones
- `c032`: We party / like new years evenin / Diamonds dancin / Like the disco / Get fly
- `c033`: fly I know / That you see it / Freezin every season / We
- `c034`: We party / like new years evenin / Diamonds dancin / Like the disco / Get fly I know / That you see it / Freezin
- `c035`: Freezin every season / We party / like new years evenin
- `c036`: evenin / Diamonds dancin / Like the disco / Get fly I know / That you see it
- `c037`: Freezin every season / We party / like new years evenin
- `c038`: evenin / Diamonds dancin / Like the disco / Get fly I know / That you see it / You don’t gotta / cut the lights on / This ice on
- `c039`: YSL I wear em Like / they white ones
- `c040`: You don’t gotta / cut the lights on / This ice
- `c041`: ice on / YSL I wear em Like / they white ones
- `c042`: You don’t gotta / cut the lights on / This ice on / YSL I wear em Like / they white ones
## Biggest gaps blocking a playable full-song sequence

1. **131.02 s of the 201.87 s song (70.85 s → end, shots c019–c043) has no selected picture.** 21 boxes (c023–c043, 109.38 s) have no media at all, and 4 (c019–c022, 21.64 s) have only unselected storyboard stills. The board's playback falls back to the raw closet take for c019–c042 and to black for c043.
2. **None of the 10 performance shots (70.85–123.97 s, 53.12 s) has footage in the right wardrobe or location.** The only real take shows a camouflage shirt and navy cap in a walk-in closet. The scenes ask for the YSL leather coat at the Red Line (c019–c023) and the YSL jacket in a blizzard with animals (c024–c028). This board has no restaged or composite clips. The 17 that exist were made for Paris Black Runway. Under the locked architecture in CLAUDE.md, this needs the keyframe-plus-propagation lane with a short benchmark and kill-criterion test first. Per-frame swap cannot be scaled to these 53 s.
3. **The grill effect (c021–c023), the blizzard animals (c026–c028), the Maybach control room (c029–c034), the geese (c035–c036) and the clean-entrance sequence (c037–c043) have never been generated.** There are no stills, keyframes or clips for them.
4. **Lyric-to-picture mismatch.** "Camera crew", "Canada Goose" and "janitor" are each sung only once, at 23.38–29.00 s, but their beats land at 124–188 s. The treatment's own coverage check says `fail`. A director must either move these beats or accept that they play under other lyrics.
5. **The lyric timing is unusable for 90.42–142.94 s** (one line, confidence 0), so lip-sync and lyric-motivated cuts cannot be checked for c022–c032. The song analysis has no sections, hooks or drops, and its provider is flagged `downbeat-uncertain`.
6. **The outfits are words, not pictures.** All 4 outfits for this variation have `approved_asset_id = null` and `reference_asset_ids = []`. Performance and clean-entrance shots carry `wardrobe.garments = []`. The clean-entrance scene's outfit (confetti shirt and cotton jacket) contradicts the shots' spec wardrobe ("exact YSL leather coat").
7. **12 of the 22 selected clips are still `pending`**: c001–c007, c011, c012, c013, c015 and c016.
8. **No cut exists for this variation.** There are 0 `timeline_manifests` for this variation (the project's only manifest, c83ae6b6, belongs to Paris Black Runway), and therefore 0 `timeline_items`, because items hang off a manifest and 0 `export_packages`. M5 is selected on c008_2, but its asset row says it is unplaced, and it plays letterboxed (848x1056).
9. **The take ends at 191.19 s**, so c042 is only partly covered and c043 (194.79–201.87 s) has no performance coverage. This matters only if the director wants performance there.
10. **Scene windows were not moved by the beat conform** (scene ends of 96.08, 123.53 and 188.24 s against shot ends of 96.42, 123.97 and 188.89 s). Scene membership is decided by shot start, so the result is still correct, but any tool that cuts by scene window will clip the last shot.
