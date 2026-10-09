# The saved treatment, traced downstream — and what was fixed so it holds · 7 October 2026

> Integration agent. Brief: "Treat the saved version as the creative authority… prove that the pipeline can execute
> this treatment faithfully… Do not rewrite the treatment or silently substitute easier imagery."
> Spend: **$0.00**. No generation. Nothing on the YSL project was changed except what is listed under "State left".
> PRs #176 and #177, merged and published; `treatment-writer-proxy` and `lyric-visualizer-proxy` redeployed at
> `cea8dc6`.

## 1. The saved treatment, inspected

`video_projects.treatment_json.treatment` on YSL (`764a63d2-…`):

| | |
|---|---|
| text | "YSL — INTERRUPTED BROADCAST", 5,702 characters, 11 scenes (burning-forest show → the viewer → Chicago switch → the grill → the cold front → the camera crew → Maybach reveal → geese → the clean entrance → security monitor) |
| mode / change | `manual` / `edit`, saved 2026-10-07 02:40:52 UTC |
| the one it replaced | the AI's runway treatment (`treatment_versions` `4e97e41a`, written 2026-10-03 19:26, `grok-4-fast`), kept and restorable |
| persists? | Yes. `text` and `concept` mirror it; the trigger kept the old one as a version. |
| is it the version consumed downstream? | **It is the only text any writer or reviewer is sent.** But nothing downstream had been written from it, and (before this work) nothing said so — see 2. |

Still beside it, unchanged since the runway treatment: `visual_style` ("A Paris runway show at night… his take is restaged
inside these places"), `mood`, `notes` ("PLACES (reuse these, do not invent others)… He always wears exactly what he wears
in the take; never write another outfit on him… No readable logos"), three continuity entities (`PARIS_BLACK_RUNWAY`,
`DIAMOND_MIRROR_BALL`, `DIAMOND_DISCO_LIGHT`), `sections` and `clips` of the runway board, and all 47 shots.

## 2. Concrete pipeline gaps found (file:line at the time of finding)

Ranked by how surely they would have turned the new treatment back into the old video.

| # | gap | where | fixed? |
|---|---|---|---|
| 1 | **The board's "written from this treatment" stamp lied.** A whole-board rewrite keeps every locked, edited or footage-holding shot (19 of 47 here) and then stamps the board as written from the new text. The Treatment page then read "Written from this treatment", with the old video in the middle of it. | `build.ts:186`, `boxes.ts:423` | **Yes** (#176): every shot carries its own stamp; the page, the board and the generate dialogs read per shot |
| 2 | **Generation never looked at the treatment.** Image, clip and restage ran from the shot's own spec; money went on the old scene with no word. | `useStoryboardController.tsx:682–831`, `generate.ts:78` | **Yes** (#176): the confirmation says so before the price is accepted |
| 3 | **The old notes were sent as unbreakable.** "The director's notes… these are constraints: nothing you write may break them" — to the board writer, the per-shot writer (as `constraints`) and the reviewer. "Reuse these places", "never another outfit", "no logos" overruled the new text. | `treatment-writer-proxy/contract.ts:125`, `lyric-visualizer-proxy/contract.ts:232`, `astraSection.ts:121` | **Yes** (#176, #177): notes are facts about the footage + wishes the treatment overrules; visual direction is a look, not a map; the page names fields carried over |
| 4 | **"No logos" everywhere.** In both writers' rules and appended to every still (`NO_MARKS`). The treatment's YSL monogram cut into a forest would be written out and drawn out. | `contract.ts:175`, `lyric-visualizer-proxy/contract.ts:259`, `generate.ts:34,115` | **Yes** (#176): forbids marks nobody asked for, not one the shot names |
| 5 | **Performance = the take's clothes, always.** "He wears exactly what the notes say he wears in the footage, in every shot he is in"; a restaging keeps the take's wardrobe by construction. The "exact YSL leather coat" on 79th & Lafayette and the "exact YSL denim look" would be silently replaced by the camouflage shirt. | `contract.ts:137`, `setup.ts:144`, `restage.ts:71` | **Partly** (#176): the writer now says where each shot's wardrobe comes from (`wardrobe_from`); a shot the treatment dresses is **flagged** on its card and in the restage confirmation, never restaged in the footage's clothes. It is not *solved*: see 4 (missing references) |
| 6 | **"He appears ONLY in performance shots… never his face."** Fendi watching the CRT, walking into the building, passing the camera — all forbidden. | `contract.ts:138` | **Yes** (#176): a `narrative` shot the treatment stages him in is allowed |
| 7 | **Fixed pacing.** "Of every three shots two are performance", "never more than two cutaways in a row". The opening (≈6 scenes before he appears) and the crew/Maybach/geese run cannot exist. | `contract.ts:139` | **Yes** (#176): the treatment's own run of scenes is the cut where it lays one out |
| 8 | **"Do not repeat a cutaway idea"; "one clear subject"; "no crowds".** The rider, the models' formations, the crew returning, screens showing earlier shots — flattened or refused. | `contract.ts:172,175`, `lyric-visualizer-proxy/contract.ts:259` | **Yes** (#176): recurring things return as the same thing; linked shots are written into both; a formation the treatment asks for is the subject |
| 9 | **A worked-on board cannot be taken over.** With 19 shots locked/edited/holding footage, no rewrite could ever reach them; the only ways were per-shot, by hand, nineteen times. | `boxes.ts:423` | **Yes** (#177): "Release those N shots to be rewritten" — edits cleared, locks opened, footage taken off, scene + what-was-on-it kept in each shot's history; nothing deleted, nothing generated |
| 10 | **No provenance.** A shot did not record which treatment it was written from; a job did not record what its shot was. | `api.ts:474`, `runner.ts:248` | **Yes** (#176): `provenance.treatment` on specs and edits; `madeFrom` on jobs |
| 11 | **Reviewer had no notion of "intended".** A polar bear in a chain would come back as a realism defect, in the same breath as a fused leg. One verdict mixed idea, garment and photograph. | `astraSection.ts:128–137`, `acceptance.ts:193` | **Yes** (#176): `INTENDED_NOT_DEFECT`; findings reported under creative fidelity / identity and garment / photographic realism / craft |
| 12 | **"Regenerate" replaces a hand-written treatment** with a ~130-word AI one, without being shown it. | `TreatmentPage.tsx:167`, `build.ts:156` | **Yes** (#176): the confirmation says so and points to "Rewrite the shots" |
| 13 | **No character entity; no cross-shot links.** Entity kinds are location / prop / lighting. The rider, the woman at the switch, the janitor, the crew, the animals cannot be named once and pointed at; a screen cannot say "shot N's picture"; an interior→exterior pair cannot be expressed. The writer writes 9 shots per call in parallel and none sees another's output. | `entities.ts:22`, `contract.ts:84–113`, `index.ts:157` | **No** — a data-model change (see 3) |
| 14 | **Garment references never reach a generator.** Stills are text-only to Grok (`{model, prompt, n, aspect_ratio, resolution}`); a Look reaches a still as one text line; a restage sends the take and the place picture only; `reference`-role assignments are display-only. | `world-still-proxy/index.ts:96`, `entities.ts:172`, `requests.ts:54` | **No** — see 3 |
| 15 | **Every shot goes to one route** (still → Grok; cutaway clip → Kling i2v; performance → Seedance reference). `recommended_tool` is not in the writer schema; `shot_type` does not change the route; no "difficult effect" handling. | `generate.ts:134`, `compile.ts:86`, `api.ts:331` | **No** — see 3 |
| 16 | **Stale `sections`/`clips`** in `treatment_json`, and a manual-text rewrite empties `sections`. | `build.ts:193` | No — cosmetic; nothing reads them for generation |

Also found: `wardrobe_notes` and `creative_exemplars` have no reader in `src/`; the PR #170 realism modifier is wired
to no caller; the `film_bar_v1` look preset ("gritty, found-footage… no clean or polished shots") is hardcoded onto
every storyboard still. Left alone — none drops a requirement; the last is a taste decision for the director.

## 3. What was NOT fixed, and why

These need a model, a data shape or a provider that the app does not have. Doing them quietly would be the "broad
rebuild" the brief forbids; each is a decision.

- **Characters as entities** (the rider, the woman, the janitor, the crew, the models, the animals). Without it every
  shot re-invents them. Proposal: a fourth entity kind, `character`, with the same description/picture/approval shape
  as a location, and `continuity.characters` on a shot. One migration, one enum, the writer's block gains "People".
- **Cross-shot links** ("the monitor shows shot N", "same position in a new place"). Proposal: `continuity.links`
  on a shot — `{kind: "screen_shows" | "match_position" | "reveals", shot: key}` — written by the writer and read
  into the prompt of both shots. The parallel writer would need the linked shot's scene in its context.
- **Garment and identity references into the generator.** Grok's still endpoint accepts up to 3 source images on
  `images/edits`; the app sends none. The 17 wardrobe features on file (including both YSL denim pieces and the
  black trucker jacket) have reference photos; the leather coat does not exist as a feature. Proposal: send a Look's
  reference picture and one face reference with a cutaway/narrative still that shows him; and hold the output against
  the reference in review (the proxy already accepts `references`; the section review does not pass them).
- **Difficult effects by route.** The rotating grill, the control-room-to-Maybach cut, the whiteout. A `shot_type:
  vfx` exists; it changes nothing downstream. Proposal: a per-shot route choice with the provider's limits recorded,
  and "report the limitation" as a first-class outcome rather than a weaker shot.

## 4. Checks run (no spend)

| check | result |
|---|---|
| the saved treatment persists and is what writers are sent | yes; `treatment.text` is the only text passed (`TreatmentPage.tsx:174`, `useStoryboardController.tsx:443`, `StoryboardReviewPage.tsx`) |
| old plans are invalidated when the treatment changes | **now**: live page reads "All 47 were written from an earlier version of this treatment… 19 of yours are still from the earlier treatment"; the board tags all 47; the generate dialog warns. Before: "Written from this treatment". |
| narrative relationships survive the breakdown | **partly**: recurring subjects and linked shots are now rules the writer is given; they cannot be *verified* until the board is written from this text (which generates nothing but costs a writer call), and the rider/screens/reveals have no structure to live in (3) |
| wardrobe stays attached to the right performer and shots | **flagged, not delivered**: a shot the treatment dresses is marked; the footage on file is him in a camouflage shirt; no leather-coat reference exists |
| missing references are flagged rather than invented | place/prop/light with no entity: still **invented per shot** (writer can only point at existing keys); a location without an approved picture: flagged; characters: no concept (3) |
| intentional surreal events vs defects | **now** told to the reviewer; findings reported under separate criteria |
| the live app, after publish | Treatment page, Storyboard tags and banner, generate-image confirmation (cancelled) all read as above; `provider_jobs` since 6 Oct: 0 |
| tests | 191 files, 2,255 passed, 1 skipped; tsc clean; Python 56 |

## 5. The proposed small visual test — for authorisation, not started

Missing references first; the brief asks for them before any spend.

| | what is on file | missing |
|---|---|---|
| **A. Burning-forest formation** (cutaway, no Fendi) | nothing — no entity, no picture | a `BURNING_FOREST_MONOGRAM` location entity with an approved picture (one still, 2 candidates: **$0.14**) |
| **B. Chicago performance in the YSL leather coat** | the synced take (camouflage shirt, closet); face refs ×80; 17 wardrobe features (denim trucker, denim overshirt, cotton jacket; **no leather coat**) | the coat as a wardrobe feature with reference photos; a `CHICAGO_79TH_LAFAYETTE` location entity (+ picture, $0.14). **A restaging cannot put him in the coat** — the route keeps the take's clothes. A still of him in it is possible only through the garment lanes, which are not wired to the storyboard. |
| **C. Hard effect** | — | recommend the **broadcast-truck interior → Maybach exterior** over the grill: it tests the two things the pipeline has no structure for at all (a cut written into two shots, and an interior that must read as the exterior's) and costs two cutaway clips; the grill is one close-up whose risk is anatomy, which the realism gate already measures. |

Provider and cost at list, from `config/provider_rates.json`:

| step | route | cost |
|---|---|---|
| A: one still, then one 5 s clip from it | Grok still → Kling 2.5 turbo i2v | $0.14 + $0.35 = **$0.49** |
| C: two stills, two 5 s clips | same | **$0.98** |
| B: place still + one 4 s restage at 720p (take's clothes — a *control* for identity and location, not the coat) | Grok still → Seedance 2.5 reference | $0.14 + $2.22 = **$2.36** |
| total | | **$3.83** at list, before any still is approved |

Not in that number: the leather coat still (no route from the storyboard; the garment lane's own pricing applies),
and any retry. **No spending authorisation covers this batch** — the last authorisation ($4, 4 Oct) was for one
retest and is spent; purchases and paid retries remain paused. I am asking for approval of this batch as written,
or a smaller one.

What still-approval cannot validate (the brief is right): motion in A, the interior/exterior read in C, lip sync in B.

## 6. State left on the YSL project

- Nothing generated, nothing deleted, no shot's scene or lock changed, no assignment changed by this work.
- Shot 17 shows the composite from the previous task (PR #175); its restaging is still on the shot.
- `treatment_versions`: 3 rows (unchanged). The live treatment text: unchanged.
- One `provider_jobs`-free day: 0 jobs since 6 October.

## 7. Two things Lovable did while deploying

Both deploy-only requests were honoured (no code edits, no SQL), but the agent's workspace committed three
housekeeping commits to `main` (`f50f880`, `bc8d516`, `1183b25`: `@lovable.dev/vite-tanstack-config` 2.23.1 → 2.25.2,
`bun.lock`, and generated Supabase types for `timeline_items` columns that exist in the live database but have no
migration in the repo: `look_id`, `output_asset_id`, `production_status`, `provenance_json`, `source_asset_id`,
`source_in/out_seconds`, `sync_id`, `treatment_shot_id`). `tsc` is clean on them. The missing migration is worth a
look by whoever owns `timeline_items`.
