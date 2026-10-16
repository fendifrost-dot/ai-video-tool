# Handoff — two new Chicago scenes + c041 re-plated (16 Oct 2026)

**Why:** Fendi, after approving the c047 recipe (composite of him over a plate + the montage's cutaways, cut together):
"Each other clip needs a new scenery … use something like this for background for C041 and change my jacket to the
YSL bubble and put the bucket hat on me. We can do another shot with a fashion show happening on the platform with an
aerial view of a train passing by, with me rapping and models walking past me. Another shot being a continuation of
that with a walrus getting off the train and the camera cuts to the open door of the train and you see me rapping
inside the train." Then: "It's really two new scenes not 3." He sent three pictures made in Gemini (the dice game
with a penguin on the 79th St platform; the same with models walking; a walrus in gold chains stepping off the train).

Scene A = the fashion show on the platform (c044). Scene B = the walrus off the train, cut to him inside the car
(c045 + c046). c041 is a re-plate of an existing shot, in a different outfit.

## How it was built (no new lane — the tool's own pieces)

| Piece | Where | What |
|---|---|---|
| Per-shot plates and outfits | `variation_scenes` (data) | A composite, a montage and "Animate the plate" all take the shot's SCENE's newest usable plate, and a dress takes the scene's outfit. So the Chicago scene was SPLIT: "Chicago, the switch" now starts at c047 (82.65 s) and keeps the bear plates; c041–c046 got their own scenes (table below). No code. |
| The bubble coat + bucket hat | `continuity_entities` outfit `YSL_BUBBLE_BUCKET` (`c5dd106a`) | Coat in Bubbled Lambskin `fb82c0d2` + YSL nylon bucket hat `eb813927` + SL trousers `6badada3` + Cazal glasses `18b648a5`. Fendi said "bubble" and "bucket hat"; the existing `YSL_LEATHER_COAT` outfit wore the varsity cap. |
| Fendi's pictures | `project_assets` lane `director_reference`: `048b1b4e` (dice + penguin), `1f3cd0ce` (dice + models), `658c5820` (walrus) | Uploaded through the app's own storage API as the owner (scratchpad `tools/upload_ref.mjs`; the public key read from the live bundle; no key in the repo). |
| 9:16 plates from them | `world-still-proxy`, `grok-imagine-image-2.0`, the picture as the `place` reference, `plate-director-ref-v1-2026-10-16` | "Re-photograph the SAME place and the SAME people as a VERTICAL 9:16 photograph … the CENTRE FOREGROUND is EMPTY, where a man will stand". Two per scene; the second of each pair `usable:false` with why. |
| Dress press | `scripts/agent-browser/avt-press.mjs dress` (NEW, this PR) | `focus-dress-shot` → `confirm-dress-shot` (dry run `confirm-dress-dryrun`). |
| Plate motion v4 | `src/lib/composite/plateMotion.ts` `plate-motion-v4-2026-10-16` (this PR) | v3's base said "cars and buses pass along the street" for every plate; on the platform plates the camera left the platform and a bus arrived. v4: the life only of the place's kind; "no vehicle where there is no road"; "no rise". |

## The scenes now (candidate 6, variation `358363e6`)

| Scene | Seconds | Shots | Outfit | Plate still (usable) | Moving plate |
|---|---|---|---|---|---|
| Chicago, the dice | 70.85–73.8 | c040 (no Fendi), c041 | `YSL_BUBBLE_BUCKET` | `47a904a4` (dice game + penguin) | `22e1a0b1` PASS |
| Chicago, the corner | 73.8–76.75 | c042, c043 | `YSL_JACKET` | none yet | — |
| Chicago, the runway | 76.75–78.72 | c044 | `YSL_JACKET` | `435ff4dd` (models walking to camera) | `d7a2c523` FAIL, `e397ad60` FAIL (both v3; camera leaves the platform) → re-animate under v4 |
| Chicago, the train | 78.72–80.69 | c045 | `YSL_JACKET` | `d783e85a` (walrus at the open door) | `341cbcfb` PARTIAL (walrus good; the train becomes a bus after ~2.5 s) → re-animate under v4 |
| Chicago, inside the train | 80.69–82.65 | c046 | `YSL_JACKET` | `0d025e03` (the car, doors open) | `b21bc60f` PASS |
| Chicago, the switch | 82.65–100.36 | c047–c054 | `YSL_JACKET` | `fd53bf3f` (the bear) | `1323b9c8` (unchanged; c047 approved) |

## Run results — every line read back from the database or from frames

| Shot | What | Asset | Verdict |
|---|---|---|---|
| c041 | dressed take, bubble coat + bucket hat (job `390e3e88`, $2.72) | `0f649563` (4.000 s) | VERIFIED on frames 5/30/55/80: the glossy bubbled lambskin coat and the black nylon bucket hat on him, glasses kept |
| c041 | composite over the dice plate | `1aab6283` (4.000 s) | PASS: the coat and the bucket hat pixel-exact, the dice players and the penguin behind him, the plate holds (ledger row 78) |
| c044 | montage, scene A (job `b9e2bc52`, $2.22) | `bda9ead2` (4.04 s) | OBSERVED every eighth frame: him on the platform with the models behind · HARD CUT aerial of the train sliding into the station · HARD CUT low angle, the models' legs passing in front of him. All three scenes, in order. |
| c044 | composite | *not pressed — no usable moving plate yet (v4 re-animation first)* | |
| c045 | composite over the walrus plate | `f0706d72` (4.004 s) | OBSERVED: he is pixel-exact, the walrus heaves off the train behind him; the plate's drift (train → bus) shows in the shot's last ~0.5 s. Re-composite after the v4 plate. |
| c045 | montage, scene B (job `4fa88370`, $2.22) | `53771ac0` (4.0 s) | OBSERVED: the walrus off the train (wide) · HARD CUT the open door · HARD CUT him rapping inside the car; the walrus's back in the foreground of the last two cuts (ledger row 79) |
| c046 | composite inside the train car | `fea93ac6` (4.004 s) | PASS: pixel-exact in the aisle, doors open, platform behind, passengers, a train passing outside |

Nothing was selected: every row above is `is_primary false` on its shot. The earlier bear-plate composites and
montages on c041/c044/c045/c046 are still filed as alternates too.

## Verify from real output — never from a claim

| Check | How | Expected |
|---|---|---|
| The scenes | `avt_select variation_scenes` filter `variation_id = 358363e6…`, order `start_seconds` | seven rows tiling 43.31–100.36 s then "The cold front"…; names and `outfit_key` as in the table |
| A plate belongs to its scene | `avt_select project_assets` filter `metadata_json->>lane = world_still`, `metadata_json->>scene_title = Chicago, the dice` | `47a904a4` usable true, `2105eee8` usable false |
| The dressed take wears the new outfit | `avt_select provider_jobs` filter `id = 390e3e88…` | `request_payload_json.settings.dress.outfit.key = YSL_BUBBLE_BUCKET`, `status succeeded` |
| Live code (after Lovable Publish of this PR's merge) | crawl `https://aivideotool.lovable.app/projects` → `index-*.js` → `projects._id.storyboard-*.js` → its `Acceptance-*.js` | `plate-motion-v4-2026-10-16` present, `plate-motion-v3-2026-10-16` absent |

## What is NOT done (in order)

1. **Publish v4** (Lovable Publish from this PR's merge SHA), then re-animate the runway still `435ff4dd` and the
   walrus still `d783e85a` (`avt-press.mjs animate-plate … --shot c044` / `--shot c045`, with their events), judge on
   frames 0/40/80/119 (the camera must stay on the platform; no bus), then `composite` c044 and re-`composite` c045.
2. **c041 composite** and **c045 montage**: pending at hand-off time; results in the ledger when they land.
3. **The timeline step** (unchanged from `HANDOFF_MONTAGE_BEAR_2026-10-16.md`): lay composite + montage cutaways
   inside each shot's window, trimming `MONTAGE_TAIL_TRIM_SECONDS` off every montage segment.
4. c042/c043 ("Chicago, the corner") have no plate: Fendi has not said what goes there.

## Guardrails

- Do not re-merge the Chicago scenes: the split is what gives each shot its own plate and outfit.
- A plate that fails is marked `usable:false` with `unusable_why`, never deleted: the newest usable one wins.
- The `director_reference` assets are Fendi's pictures: never a plate themselves (landscape), never selected.
- Never commit the session file, `pubkey.txt`, the output folders or any clip of Fendi (public repo).
