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
| Chicago, the runway | 76.75–78.72 | c044 | `YSL_JACKET` | `435ff4dd` (models walking to camera) | `d7a2c523` FAIL, `e397ad60` FAIL (v3; camera leaves the platform); **`22fabc2c` v4 — holds ~3 s, then a push-in and a bus at the right** (the plate now) |
| Chicago, the train | 78.72–80.69 | c045 | `YSL_JACKET` | `d783e85a` (walrus at the open door) | `341cbcfb` PARTIAL (v3); **`6155e245` v4 — holds ~3 s, then a road and a bus at the right** (the plate now) |
| Chicago, inside the train | 80.69–82.65 | c046 | `YSL_JACKET` | `0d025e03` (the car, doors open) | `b21bc60f` PASS |
| Chicago, the switch | 82.65–100.36 | c047–c054 | `YSL_JACKET` | `fd53bf3f` (the bear) | `1323b9c8` (unchanged; c047 approved) |

## Run results — every line read back from the database or from frames

| Shot | What | Asset | Verdict |
|---|---|---|---|
| c041 | dressed take, bubble coat + bucket hat (job `390e3e88`, $2.72) | `0f649563` (4.000 s) | VERIFIED on frames 5/30/55/80: the glossy bubbled lambskin coat and the black nylon bucket hat on him, glasses kept |
| c041 | composite over the dice plate | `1aab6283` (4.000 s) | PASS: the coat and the bucket hat pixel-exact, the dice players and the penguin behind him, the plate holds (ledger row 78) |
| c044 | montage, scene A (job `b9e2bc52`, $2.22) | `bda9ead2` (4.04 s) | OBSERVED every eighth frame: him on the platform with the models behind · HARD CUT aerial of the train sliding into the station · HARD CUT low angle, the models' legs passing in front of him. All three scenes, in order. |
| c044 | composites over the runway v4 plate | `7e022326` (v2 recipe), **`1048e4da` (v3 recipe, the plate starts at the shot: PASS, no push-in or bus in the window)** | ledger rows 82, 85 |
| c045 | composites over the walrus plates | `f0706d72` (v3 plate, v2 recipe), `69c9f4b4` (v4 plate, v2 recipe), **`96174ef4` (v4 plate, v3 recipe: PASS, the train intact through the window)** | ledger rows 76, 83, 86 |
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

**LIVE (VERIFIED 14:29 UTC):** PR #283 squash `0d4e663`; Lovable `latest_commit_sha` matched; Publish (deployment `2cd5f0ff`); live `index-BZ3qMxY2.js` → `projects._id.storyboard-B7F2CON2.js` → `Acceptance-CF9ywUNR.js` carries `plate-motion-v4-2026-10-16` (1) and v3 (0). No edge function touched.

## What is NOT done (in order)

1. ~~Publish v4~~ DONE 14:29 UTC (above); then re-animate the runway still `435ff4dd` and the
   walrus still `d783e85a` (`avt-press.mjs animate-plate … --shot c044` / `--shot c045`, with their events), judge on
   frames 0/40/80/119 (the camera must stay on the platform; no bus), then `composite` c044 and re-`composite` c045.
2. ~~Composite recipe v3~~ DONE: PR #285 squash `51d1b4d`, Lovable Publish (deployment `124c3685`), live `index-DZCv3vsk.js` → `projects._id.storyboard-CbuPgb80.js` → `Acceptance-CGT5TaEn.js` carries `plate-composite-v3-2026-10-16` (1) and v2 (0), VERIFIED 14:53 UTC. The idea, for the record: today the plate's frame 0 is paired with the CUT's frame 0, so the shot (which starts ~1.1 s into the cut, after the head handle) plays plate frames ~26–75 and meets Kling's late drift. Pair plate frame 0 with the shot's in-point and hold frame 0 under the head handle (never shown) → the shot uses the plate's first, cleanest 2 s. Then re-composite c044 and c045 ($0.14 at Fal). Class B; `plan.ts`/`render.ts` + tests; version the recipe.
3. **The timeline step** (unchanged from `HANDOFF_MONTAGE_BEAR_2026-10-16.md`): lay composite + montage cutaways
   inside each shot's window, trimming `MONTAGE_TAIL_TRIM_SECONDS` off every montage segment.
4. c042/c043 ("Chicago, the corner") have no plate: Fendi has not said what goes there.

## Guardrails

- Do not re-merge the Chicago scenes: the split is what gives each shot its own plate and outfit.
- A plate that fails is marked `usable:false` with `unusable_why`, never deleted: the newest usable one wins.
- The `director_reference` assets are Fendi's pictures: never a plate themselves (landscape), never selected.
- Never commit the session file, `pubkey.txt`, the output folders or any clip of Fendi (public repo).

## Higgsfield: "$50 for one clip" (Fendi, 14:33 UTC) — and a HOLD

Checked from primary sources (ledger row 81): the Higgsfield account connected to this chat is the consumer app (free,
no spend since 11 Oct) — not the API credits Control Center spends; no receipt in Gmail; CC records list-price
estimates only (`costFinalCents` is always null), so the API's real charge per request is unread anywhere. No single
call is $50 at list; the dearest in 24 h is an 11 s object swap at $7.49. The volume is the story: 41 API calls since
15 Oct 14:00 UTC ≈ $92 list (12 object swaps $61.97, 11 Seedance $24.41, 16 Kling $5.60), so a $50 API credit pack
drains in under a day.

**HOLD:** no further Higgsfield calls (dress, montage, animate-plate) until Fendi has read the API dashboard and said
what the $50 line is. Open question for the next build: read the real charge back per request (balance before/after
or a per-request cost field) and write it on the job, so the ledger stops saying "invoice unknown".

## Fendi: "Why are we using Kling when we know Higgsfield works best" (14:45 UTC)

Facts: every video call here goes through Higgsfield's API; Kling 2.5 turbo pro is one model in that catalogue, the
cheapest image-to-video it offers ($0.18 real for 5 s), and "Animate the plate" chose it for that: a locked-off clip
of a still. The models that have held up best for Fendi are Seedance 2.5 reference-to-video (the montages: hard cuts,
no drift, the platform kept; $1.55 real for 4 s) and the Genjutsu object swap (the dressing). Seedance 2.5 has never
been tried AS A PLATE ANIMATOR. Control Center's catalogue has no Higgsfield-own image-to-video model; the
alternatives for a still are Kling 2.5 (turbo pro / standard) and Hailuo 2.3.

RECOMMENDATION (one call, ≈ $1.55 real, when the hold lifts): animate the runway still `435ff4dd` with
`seedance-2.5-reference` (@Image1 the still, "locked-off camera, the models walk toward the camera and out of frame,
the train stays, nobody enters the centre foreground") and judge it on frames 0/30/60/90/119 against Kling's
`22fabc2c`. If it holds, `PLATE_MOTION_MODEL` becomes a per-press choice (Kling cheap / Seedance faithful), not a
constant. With composite v3 the shot uses only the plate's first ~2 s, so Kling's late drift may already be out of
frame — judge the v3 composites of c044/c045 first.

## Real Higgsfield charges (ledger row 84)

Read from Fendi's API transaction list: Kling 5 s $0.18, Seedance 4 s $1.55, object swap 4 s $1.70 — ≈ 51–70 % of the
list rates CC estimates with. The "$50" was an Add-funds, auto top-up is OFF, balance $19.69. Next: carry the observed
rates in CC's `video-providers-higgsfield-model` table as the estimate (list kept as the cap).

## c047 over the orcas (Fendi, 16:00 UTC: "This can be for C047")

His fourth Gemini picture: inside the Red Line car, passengers pointing at two orcas surfacing in the flooded Dan Ryan
beside the traffic. Filed `0a4c1feb` (`director_reference`); portrait plate `0fe81de8` (pick) / `b77085fe` (unusable),
scene "Chicago, the switch" — so it is now that scene's newest usable still and c047's composites go over it; the bear
plates and the approved bear composite `616c881b` stay as they were. Under the Higgsfield HOLD the plate is a STILL:
the composite of c047 over it (Fal, $0.07) is filed as an alternate; "Animate the plate" (Kling, $0.18 real) with an
event such as "the orcas surface and roll, the passengers point, the train stands at the platform" runs when Fendi
lifts the hold, and then one more composite ($0.07) puts him over the moving orcas. Ledger rows 87–88.

DONE 16:05 UTC: c047 over the orca STILL — composite `bdf66a28` (dressed `f540b6be` over `0fe81de8`, 113 frames,
recipe v3, `plate_video_asset_id null`), filed as an alternate on c047, posted. OBSERVED: pixel-exact in the aisle,
the orcas in the window beside him, the passengers pointing; the plate moves only with the handheld camera.
Verify: `project_assets` `bdf66a28` exists with `metadata_json.composite.plate_asset_id = 0fe81de8` and
`is_primary` false on c047; the bear composite `616c881b` still selected. NOT DONE (held): the Kling animation of
`0fe81de8` and the composite over it; the c047 orca montage.

### CORRECTION 16:18–16:35 UTC — the orcas are c042's, c047 stays as approved; the Higgsfield hold is lifted

Fendi: the still-plate composite was "antithetical" to the working lane (picture → portrait plate → Kling animates
it → he is composited over the MOVING plate); the hold on Higgsfield was mine, built on a wrong reading of the
spend, and is **lifted** ("Higgsfield is the tool that works"). And c047 — the approved bear clip — is **not to be
redone**; the orcas go to a leftover shot.

Done:
- Orca plate animated: `f61be12d` (Kling via CC, `plate-motion-v4`, still `0fe81de8`). Ledger row 89.
- Re-filed to scene **"Chicago, the corner"** (c042/c043, 73.8–76.75 s): `0fe81de8`, `b77085fe`, `f61be12d`,
  reference `0a4c1feb` (`metadata_json.scene_title`; each carries a `refiled` note). The still-plate composite on
  c047 `bdf66a28` is `approval_status rejected`. c047's approved composite `616c881b` untouched (VERIFY: still
  selected on c047; "Chicago, the switch" lists only the bear plates again).
- **c042 composited over the moving orcas**: `cf43987a` (dressed `6eea726d` over `f61be12d`, recipe v3, offset
  0.2732 s), filed unselected on c042, posted. Ledger row 91. c043 has no dressed take (none to composite).
- Two mattes wasted (row 90): the `composite` press was run without `--chrome`. **Every composite press takes
  `--chrome <scratchpad>/cft/chrome-linux64/chrome`** (Chrome for Testing; the Playwright Chromium has no H.264).
  `animate-plate`, `dress` and `montage` do not decode video and run without it.

Not done then: a c042 montage over the orcas; c043 (same scene) needs a dress first.

### 16:44–17:30 UTC — the montage is the lane; the montage goes into the MCP

Fendi on the c042 composite: "You can't just put me in the front of the frame and expect it to be good. It looks
terrible, me in front. I look out of place and pasted into the shot. The angle should be cut to a position where it
looks natural for me to be standing … I don't necessarily need to be in that cut. The same way we did the polar bear
shot with the child petting the polar bear, I wasn't in that frame. It cut back to me." Then: "**The montage is the
go-to for all performance shots.** It's the only way it will look natural. Also, you do not need the browser.
Whatever you need the browser for, build it into the MCP."

DECISION (Fendi): every performance shot is shot as a MONTAGE — cutaways without him, him only at an angle that belongs
in the place (profile by the window, low from the seats), never pasted centre-front. The composite stays what it was
on c047: the pixel-exact "cut back to him" the edit uses between cutaways, not the look of the shot.

Done:
- **c042 orca montage** pressed 17:06 UTC (the last browser press): job `db161f95`, provider `48f610cb`, scene list
  in `scratchpad/montage/c042_orcas_scenes.txt` (orcas alone · HARD CUT him in profile by the window · tight orca eye ·
  low angle from the seats). Ledger row 92. Filed 17:27 UTC as `e240af21` (Seedance took 20 min this time).
  OBSERVED: scene 1 the orcas alone, scene 2 him in profile by the window (hand on the pole), scene 3 the orca's eye,
  scene 4 the low angle from the seats — he is never centre-front. PASS. Posted.
- **Montage in the MCP** — PR #289 (`4c69cbb`): edge function `montage-shot` + `avt_montage` on `avt-mcp` 1.2.0.
  Server-side it resolves the shot (id or spec key), its dressed take + sync, the scene's newest usable plate, the
  director's lines (or the dialog's prefill), builds the storyboard's own prompt (Deno copy
  `_shared/montagePrompt.ts`, held to the app's modules by `montagePrompt.test.ts`), writes the `provider_jobs` row
  first, calls `proxy-provider-call` → CC `video-providers-higgsfield-model`, and the tick runner files the clip on
  the shot unselected as a take in sync. The source is the WHOLE dressed take (no encoder server-side), so the clip
  opens on the dressed take's first frame (its head handle before the shot) — the browser's own no-encoder branch.
  Refused with the reason before any money moves: no dressed take, timed events, a take that covers only part of the
  shot, bad scene lines. `dryRun: true` answers with the exact prompt/request/settings and sends nothing.
- Deploy: Lovable "DEPLOY ONLY" for `montage-shot` + `avt-mcp` from `4c69cbb` (see the verify lines below).
  DONE 17:28 UTC (Lovable agent, twice, same bundle hashes): `montage-shot` bundle `81adf2bb…`, `avt-mcp` bundle
  `0131844b…`, `montage-shot/index.ts` sha256 `0c1ceb67…`, `avt-mcp/contract.ts` `10653ec5…`; unsigned POST → 401
  `missing_bearer`, anon key → 401 `unauthenticated`. VERIFIED 17:30 UTC through the MCP: `avt_call montage-shot
  {shotKey c042, dryRun true}` → 200, `batchShotId c042_montage`, `songStart 73.527`, `lead 0.273`, `estimateUsd
  2.219`, the dialog's four prefill scenes, the prompt opening "@Video1 is the performer". Lovable's agent flagged
  that `supabase/config.toml` had no `verify_jwt` block for `montage-shot` — added (`verify_jwt = true`, like the
  other paid lanes); it takes effect on the NEXT redeploy of `montage-shot` (the function refuses anonymous callers
  itself either way).
  Redeployed from `5c08e8c` 17:36 UTC (bundle `355903f7…`): unsigned POST now → 401 `UNAUTHORIZED_NO_AUTH_HEADER`
  from the platform, anon key → 401 `unauthenticated` from the function. VERIFIED a second dry run through the MCP
  on c047: scene "Chicago, the switch" resolves the BEAR plate `fd53bf3f` (the orca re-filing held), take `f540b6be`,
  5 s, `lead 0.625`, `$2.773`, the prefill names "the polar bear". Nothing sent.
  NOTE: Lovable's agent, on its own, then committed a test-only change to main — `717b629` / `21fe21b` ("Changes",
  "Deployed montage-shot JWT gate"): `plan.test.ts` imports with `.ts` extensions (its preview build runs `deno check`
  on test files). Reviewed: two import lines, nothing else; vitest still 5/5. The branch was resynced onto it.

Verify (after the redeploy):
- `avt_call montage-shot {projectId 764a63d2…, shotKey "c042", dryRun true}` → HTTP 200, `ok true`, `dryRun true`,
  `settings.batchShotId "c042_montage"`, `songStart 73.527`, `lead 0.273`, `estimateUsd 2.219`, `prompt` opening
  "@Video1 is the performer". A 404 = not deployed; `no_dressed_take` on a shot that has one = wrong shot/variation.
- `avt_functions {name: "montage-shot"}` → callable. The `avt_montage` tool shows once the client refreshes its tool
  list; until then `avt_call` with `function: "montage-shot"` is the same call.
- A real call: `provider_jobs` row with `request_payload_json.settings.submittedBy = "montage-shot"`, status
  queued → running → succeeded, then `project_assets` on the shot with `derived_from.song_start` = the dressed take's
  `song_start`, unselected.

Still browser-only (not asked, noted): dress, animate the plate, composite. The composite's render is pixel work in
WebCodecs — moving it server-side is a different job (ffmpeg on CC or a worker), not a request port.

### 17:50 UTC — "I'm not seeing where the new clips would live" → versions on the board

Fendi, on the treatment board: the new clips are not visible; everything done outside the tool has to be in the tool;
each shot should offer its edited footage and ALL its versions. Facts: a montage / composite / dressed take is filed on
its shot as an unselected row, so the card's picture stays on the original take; the only sign was a row of faint
pills under the scene text ("Your take · restaged", "Your take · new background" …) — the montage pill said
"restaged" because its record carried no method. The treatment page (`/projects/<id>/treatment`) shows no footage at
all; clips live on the Storyboard page.

Done (PR, "Versions on the board"):
- `DerivedMethod` gains `montage`: the parser reads it, `jobProgress.fileRestagedClip` writes it from the job's
  variant (server), `restage.ts fileRestagedClip` takes it (client), `mediaLabel` says "Your take · montage".
  BACKFILLED (avt_update, 17:52 UTC) the 11 montage assets that predate it: c047 `f79cdd9f` `4efc8c42` `46b09db6`
  `41d5c1da`, c041 `82cd07bf`, c044 `d593a56a` `bda9ead2`, c045 `c684ff12` `53771ac0`, c046 `a828c578`, c042
  `e240af21` — `metadata_json.derived_from.method = "montage"`, nothing else touched.
- `src/lib/storyboard/versions.ts` (+ test): every clip on a shot named in plain words — Your take · Dressed ·
  Montage · New background · Restaged · AI clip — numbered by creation time when there is more than one of a kind
  ("Montage 2"), with when it was made and its length.
- The card: "N versions · click one to show it" above the pills, each pill its version name (tooltip: the long label
  and the file name); ‹ › arrows on the player flip to the previous / next version (the base layer by taking the
  selection off); the player's chip reads "Montage 2 1/4". The full-screen Media tab names each item the same way.
- Nothing about selection changed: showing a version = selecting it, as before; Review plays what is selected.

Verify after Publish: bundle crawl → the storyboard chunk's Acceptance/BoxCard chunk carries
`versions · click one to show it` and `Your take · montage`; on c042's card: 4+ pills (Your take, Dressed, New
background 1–2, Montage), the arrows present; on c047: the bear composite still showing, montages named Montage 1–4.
Edge: `provider-jobs-tick` carries `_shared/jobProgress.ts` → redeploy it so NEW montages are filed with
`method: "montage"` (until then they read "Restaged" and are renamed by a backfill).

LIVE (VERIFIED 19:40 UTC): PR #292 squash `0d71988`; Lovable `latest_commit_sha` matched; Publish (deployment
`3247e1c5`); live `index-C6hXC7jw.js` → `projects._id.storyboard-DNjOIxwz.js` carries `versions · click one to show
it` (1) and `Previous version` (1); its `Acceptance-BGprR3aC.js` chunk carries `Your take · montage`. Edge:
`provider-jobs-tick` redeployed from `0d71988` (Lovable agent; `jobProgress.ts` sha256 `5c22cfdc…`, unsigned POST →
401 `missing_credentials`). Where the clips are, for Fendi: the STORYBOARD page (not the treatment page); on each
shot's card the "N versions" line and the named pills, the ‹ › arrows on the picture; c042 has Your take · Dressed ·
New background 1–2 · Montage; c047 has the bear composite showing and Montage 1–4 beside it.

### 19:50 UTC — "only the bear and orca montages were executed correctly … the others were made with Kling"

Fendi: the other montages "look like I'm pasted on another video", and he believes they were made with Kling.
VERIFIED from `provider_jobs` (every succeeded `*_montage` job): ALL eleven montages were `seedance-2.5-reference`
through Higgsfield — none was Kling. Kling made only the MOVING PLATES (`world_plate_video`), and the clips that put
him over those plates are the COMPOSITES ("New background" on the board) — those are the pasted ones. What separates
the montages he likes from the ones he does not is the SCENE LIST: the four from 07:13–07:16 (c041/c044/c045/c046)
were the bear list with "him rapping straight to camera, a medium shot from the waist up" FIRST and "HARD CUT back to
him … to the last frame" LAST — Seedance re-stages him flat in front of the place and it reads as pasted; the 14:10
c044/c045 lists opened the same way. The orca list never puts him centre-front: the place alone first, then him in
profile anchored to something in the place (hand on the pole), a tight cutaway, then a low angle with him leaning on
something. The bear montage he approved (`4efc8c42`) is the exception that proves it: its "him" beats were cut OUT by
the edit (the five-cut preview used the composite for him and the montage only for the cutaways).

RULE (from this): a montage scene list opens on the place WITHOUT him, puts him only in profile / three-quarter /
low angle anchored to something in the place, never "straight to camera, medium shot" — that line is the paste-in.
`defaultMontageLines` (montage.ts) still carries the old shape; see "Next".

Done 19:52 UTC — the four redone the orca way through the MCP lane (`avt_call montage-shot`, the first real use, no
browser): c041 job `3b41dd27` (dice/penguin, bubble coat), c044 `88fdf461` (runway), c045 `e436c68d` (walrus), c046
`16197c48` (inside the train). Ledger rows 93–96 ($2.219 list each, ≈ $1.55 real). All four filed by 19:57 UTC
(five minutes), each with `derived_from.method = "montage"` from the redeployed runner (VERIFIED): c041 `8b58017d`,
c044 `60cd0232`, c045 `81cecb2a`, c046 `f5edfee0` — unselected on their shots, beside the earlier versions. All four
PASS the rule above (he is never centre-front; anchored to a pillar, a door frame, a pole); the runway one is the
strongest. Posted. The old centre-front montages stay filed as earlier versions; the board names them Montage 1….

DONE 20:15 UTC — the orca shape is the PREFILL: PR #294 squash `751d766` (`defaultMontageLines` in montage.ts and
its Deno copy; tests). LIVE (VERIFIED): Publish (deployment `d7d73a98`); live `index-Cf28ZNWw.js` →
`projects._id.storyboard-Cy3jLSPc.js` → `Acceptance-g_JQqlR-.js` carries "the place: a wide shot with" and no longer
carries "rapping straight to camera, a medium shot from the waist up, the place behind him". `montage-shot`
redeployed from `751d766` (`montagePrompt.ts` sha256 `666df0ff…`); a dry run through the MCP on c047 returns the four
new prefill scenes (place with the polar bear, he is not in it · him in profile with a hand on something · tight on
the bear · low angle, him leaning). Nothing sent.

## His shoes — Prada America's Cup (16 Oct, evening)

Fendi: the montages invented shoes he would not wear (the takes are cut at the waist, so the low angles and
cutaways show feet the footage never had). "For all of the shoes … America's Cup Pradas — with the black jacket a
black pair, maybe patent leather; with the Mastic jacket a cream pair."

DONE (data, VERIFIED by the rows returned):
- Two `wardrobe_footwear` pictures filed (`character_features`), photos from prada.com uploaded to `wardrobe-refs`
  under the owner's folder (the server importer `fetch-reference-image` is refused by Prada's CDN — http2 stream
  error from the edge worker — so the files were downloaded here and uploaded through the storage API as the owner):
  black patent `a4eaa2da` (Prada `4E3400 ASZ F0002`, "Black Patent Leather And Technical Fabric"), cream
  `5a78f069` (Prada `4E6500 3LLJ F0242`, "Raw White … Soft Rubber And Bike Fabric" — the only cream America's Cup
  on prada.com; "Pearl/silver" is grey). Each carries front + back three-quarter `reference_images`.
- All 13 outfits in the three variations: YSL Lewis sneakers `991a79d4` swapped out. Black → YSL_LEATHER_COAT,
  YSL_BUBBLE_BUCKET, YSL_DENIM_LOOK (French black denim trucker). Cream → YSL_JACKET (Mastic), THE_CLEAN_ENTRANCE_LOOK
  (DECISION: the light cotton jacket; Fendi named only the black and Mastic jackets — swap it to black in one update
  if he wants).

CODED (PR #296): the footwear picture among the pieces he wears in the shot goes to the model as @Image2 after the
plate, with one sentence naming the pair — storyboard Montage button and `montage-shot` (MCP). Status after merge
and deploy is below.

LIVE (VERIFIED, 23:30 UTC): PR #296 squash `268bdca`. `montage-shot` redeployed (bundle `85f13c31…`); a dry run on
c042 now returns `shoes` = the cream pair, the prompt carries "His shoes are the pair in @Image2 (…)", and settings
carry `extraImages`; c041 resolves the black pair. `avt-mcp` redeployed (catalogue). Publish `9c020182`: the live
`Acceptance-C1r2FG1A.js` carries "His shoes are the pair in @Image2" (the storyboard's Montage button).

Shoe tests (ledger 97–98), both PASS on the shoes: c041 `afed6a70` (black patent, penguin platform) and c042
`ab96fc5f` (cream, orca train), each with one cutaway onto his shoes. Posted to Fendi, filed unselected.

Next: none owed on the shoes. Treatment: Fendi is gathering a picture per new location; ideas sent in chat
(non-typical runway locations, one cold animal per scene, a last-cutaway reveal). Do NOT cut the original treatment;
a fresh board variation holds the new one when he sends pictures.

## Shoes swapped on the ORIGINAL montages (17 Oct) — `dress-clip`

Fendi on the re-shot shoe tests (c041 `afed6a70`, c042 `ab96fc5f`, both now REJECTED): the shoes looked huge and
boot-like, the jeans changed — "I didn't really want the footage changed. I just wanted the swap on the shoes … use
the tool specifically to swap clothes within Higgsfield." And: "We want broad coding decisions, not fixes for a
video."

DONE (LIVE, VERIFIED by dry runs): `dress-clip` (PR #298 `dc6a965`, #299 `a4b670e`) — swap any wardrobe piece on any
clip already on a shot with Genjutsu object swap, the whole clip as the source, nothing re-shot; default = the shoes
he wears in the shot; named by the outerwear he keeps on with "Only he changes"; filed unselected, in sync, a montage
still named Montage. Redeployed: dress-clip, provider-jobs-tick, montage-shot, avt-mcp; Publish `1cfb57a0`.

Which originals show his feet (Fendi corrected me twice — I had missed both): c041 `8b58017d` at 3.25–4.0 s (he leans
over the penguin in tan boots); c044 `60cd0232` at 3.4–4.0 s (Nike AF1s at the pillar); c045 `81cecb2a` (white
sneakers by the walrus); c046 `f5edfee0` (white sneakers in the aisle). c042 never shows them: keep the original.

Results (ledger 99–103): c046 PASS `daa1644a` (posted). c044 and c045 REJECTED — the swap left the sneakers (his feet
are a few dozen pixels in a wide frame). c041 first try REJECTED (bystanders' boots changed); second try with the
wearer wording `046d1d2f`: his own boots changed to the black patent pair, but one bystander's boot in the dice cut
changed too — posted; Fendi: "C041 is fine" → APPROVED, unselected.

FINDING (OBSERVED, 2 of 2): the object swap does not change shoes that are small in the frame. The model also still bleeds onto
bystanders (c041). Next, as a general lane change rather than a per-video fix: swap a CROP around him (upscaled to the model's size) and composite it back over
the original — HYPOTHESIS, test on c044 first.

## Swap in a box — the region-swap lane (17 Oct, 01:35–02:05 UTC)

Fendi on the crop-and-composite idea: "Your your solution" → built as a general lane, not a fix for one clip.

DONE (CODED + LIVE, VERIFIED):
- PR #301 squash `d3641ab`: `dress-clip` takes a `crop` (a box cut out of the clip in the browser, enlarged to the
  clip's size, uploaded under `project-clips/<user>/<project>/swap-crops/`). The job runner files the result as a
  `crop_swap` asset that is never placed on a shot. Page `/projects/<id>/swap?asset=…&box=x,y,w,h&window=a,b`
  ("Swap in a box…" on a performance clip in Focus view) draws the box, dry-runs, sends, and has **Put it back**:
  the swapped crop goes back into the box over the ORIGINAL with a smoothstep feather, only inside the window, and the
  result is filed on the clip's shots unselected, in sync, with its method (montage) kept.
  Lovable redeployed **dress-clip, provider-jobs-tick, avt-mcp** (deployed hashes `981e24ad…`, `bea29d40…`,
  `14eb7d7a…`; probes 401 as expected). Published; the live `projects._id.swap-*.js` chunk carries the page.
- PR #302 squash `0465e86`: a side of the box on the frame's own border is not feathered (otherwise the original comes
  back exactly where the piece runs out of frame — c045's shoes). Recipe `region-swap-v2-2026-10-17`. Published;
  live `index-DmZvM2vs.js` → `projects._id.swap-C6k5Fks7.js` carries `region-swap-v2`, VERIFIED 02:00 UTC.
- Driver: `avt-press.mjs region-swap --asset --box [--window] [--pieces] [--dry-run]` and
  `region-putback --asset --job`.

Results (ledger 104–105, both posted to Fendi). Fendi, 02:05 UTC: "Both pass and are solid!" → **APPROVED**, still unselected (selection is Fendi's):
- c044 → `03794fcc`: the Nikes at the pillar are now white/grey Prada-style sneakers from 3.3 s. OBSERVED: brighter
  white than the cream "Raw White"; the side panel darker than the silver mesh.
- c045 → `ccbb3ee7`: the cream America's Cups with the grey mesh beside the walrus (1.96–2.29 s).

FINDING (OBSERVED, 2 of 2): cropping round his feet makes the object swap take where the whole-frame swap did not
(ledger 101–102, both rejected). HYPOTHESIS: this holds for any small piece (hat, glasses, a bag) — not yet tested.

RECOMMENDATION (not built): the window is fixed when the swap is sent. c045's window ran 2 frames past a hard cut
(harmless here, at noise level). Let **Put it back** take a tighter window than the one sent — no new spend — and
let the fade stop at a cut instead of crossing it.

Verify (cheap): `avt_select shot_asset_assignments asset_id in (03794fcc…, ccbb3ee7…)` → 2 rows, `is_primary=false`,
shots `ebf8f826…` (c044) and `8df8cc79…` (c045). Not selected by design; never select them without Fendi.

## Treatment adjusted — "Freezin Every Season · cold runway" (17 Oct, 02:13 UTC)

Fendi: "simple runway aesthetics in untraditional environments with cold weather animals popping up where they
shouldn't be."

DONE (in the published app, VERIFIED from the database): candidate 6 (`358363e6…`) duplicated with the switcher's
**Duplicate** → new variation **`c067efb9-90af-418e-aa6d-58834f6e19de`** "Freezin Every Season · cold runway (from
candidate 6)", now the project's active variation; treatment saved on its Treatment page (manual, 5,557 chars,
02:13:39 UTC). The copy is exact: 100 shots, 169 clips on shots (56 selected), 152 assets, 14 entities, 9 scenes — the
same counts as candidate 6; the approved c044/c045 region swaps are on it, unselected. Candidate 6's treatment is
untouched (still 15 Oct 03:50). $0 spent.

The treatment, in short: a plain Saint Laurent runway walked through everyday Chicago places (CTA platform, currency
exchange, car wash, laundromat, school hallway, Midway baggage carousel, Lower Wacker, a furniture showroom, a roller
rink); one cold animal per place that nobody reacts to; every scene opens on the place, then finds Fendi leaning in
it; frost grows through the song; hook 1 = the Red Line scenes already on the board; outro = lights out, a penguin
where he stood. No TV, fire or control room.

NOT DONE (needs Fendi's read of the treatment first): the board's shots outside hook 1 still describe the old
treatment (forest, viewing room) and will show "earlier treatment". Next = rewrite those shots from this treatment on
the copy (writer call, cents) while keeping hook 1's shots and footage; then plates per new location. Do not press
"Release N shots to be rewritten" without checking it leaves hook 1's footage on its shots.

### 02:19 UTC — "Follow designers": the cashmere goats (Fendi's picture)

Fendi sent a Gemini picture (him at a sewing machine in a mountain pasture, a line of white cashmere goats watching)
and: the fleece winds off a goat as he sews, then cut to that goat in a cashmere sweater and gold chains — "where I
say don't follow brands follow designers".

DONE ($0): the picture is filed as a director's reference, `project_assets` **`f44a2c32-4bd9-4fcf-851c-5d9f4115db3d`**
(`project-references/…/references/director_cashmere_goats.jpg`, 1024×572 — the copy the share page serves; the chat
upload was 512 px). The treatment on `c067efb9…` now carries the scene on "I don't follow brands, follow designers"
(19.5–21.3 s) with the shorn goat in the sweater on "the rims 21 don't ride" (21.3–22.7 s); it replaces the
currency-exchange line. Saved through the Treatment page 02:19:32 UTC; VERIFIED only `c067efb9` has it.

NOT DONE: the shots. On the board this is c011 (18.72–20.69) and c012 (20.69–22.65). Open question for Fendi: him
or "the man" at the machine. Not shot yet; no spend authorised for it.

### 02:22 UTC — "More cameras in the whip": the camera car (Fendi's picture)

Fendi's picture: inside an SUV under the L tracks, packed with men in black beanies and leather, camcorders and
monitors mounted everywhere, two filming out of the windows, a penguin in a fur coat in the centre console. "This fits
when I say More cameras in the whip than a camera crew."

DONE ($0): filed as a director's reference, `project_assets` **`9d4e2253-826a-4f1e-aeab-9052dade08ef`**
(`project-references/…/references/director_cameras_in_the_whip.jpg`, 1376×768). The treatment on `c067efb9…` carries
the scene on 23.4–25.1 s (replaces the car-wash line): him and the crew in the car, the models walking the sidewalk
outside the windows the camcorders film, the penguin in the fur coat riding shotgun. Saved 02:22:32 UTC; VERIFIED.
On the board: c012 (20.69–22.65) / c013 (22.65–25.11). Not shot; no spend authorised.

### 02:39 UTC — "Need a Canada Goose": the geese in the park (Fendi's picture)

Fendi's picture: a snowy Michigan Avenue park path in fog, models in long wool coats walking toward camera and on the
benches, CTA buses and the skyline behind, Canada geese in Canada Goose parkas all around. "Use this for So much ice
around me need a Canada goose."

DONE ($0): filed as a director's reference, `project_assets` **`9ad2b670-3051-4fb2-8fb5-eac55bd24a72`**
(`project-references/…/references/director_canada_geese_park.jpg`, 1376×768). The treatment on `c067efb9…` carries
the scene on 25.1–27.0 s (replaces the laundromat) and the break (31–39 s) moves to the same park: a polar bear
crosses Michigan Avenue behind the line. Saved 02:39:29 UTC; VERIFIED (all three scenes present). On the board:
c013 (22.65–25.11) / c014 (25.11–26.59); break c018–c021. Not shot; no spend authorised.
Note: the geese wear visible Canada Goose disc patches — Fendi's own picture and the lyric's brand; the treatment's
"no logos" line is about the runway clothes.

### 03:02 UTC — "You don't gotta cut the lights on / this ice on": lights off, ice on (Fendi's picture)

Fendi's picture: a dark studio lounge, a man in a black beanie and leather on the couch, iced out (star sparkles off
chains, rings, bracelets), two friends leaning over the couch, a penguin in a fur coat beside him, a hand flipping an
old wall switch.

DONE ($0): filed as a director's reference, `project_assets` **`0ae59bc2-cd92-460f-9878-e277db34ea2f`**
(`project-references/…/references/director_lights_off_ice_on.jpg`, 1376×768). The treatment on `c067efb9…` carries it
on 14.7–17.5 s (replaces the station blackout): the switch goes off, the room drops to black, his ice keeps lighting
their faces, the models pass the doorway lit only by his chain. The fur-coat penguin is now the same one that rides
shotgun in the camera car (one recurring animal). Saved 03:02:09 UTC; VERIFIED (all four of Fendi's scenes present).
On the board: c008 (13.80–15.28) / c009 (15.28–16.75) / c010 (16.75–18.72). Not shot; no spend authorised.

Verse 1 (14–31 s) is now four of Fendi's pictures in a row — lights off (0ae59bc2) → follow designers (f44a2c32) →
cameras in the whip (9d4e2253) → Canada Goose (9ad2b670) — then the janitor hallway (still mine, no picture yet).

03:05 UTC — Fendi: "Cut to me (in same scene different angle) rapping YSL I wear em like they white ones." Added to the
treatment right after the lights-off beat: on 17.5–19.5 s, cut to him in the same dark lounge from a different angle
(low, to the side of the couch), rapping to camera, lit only by his own ice. Saved 03:05:13 UTC; VERIFIED. This is a
performance beat: it can come from his own footage placed into the lounge (the montage lane), not a generated
stand-in. On the board: c010 (16.75–18.72) / c011 (18.72–20.69).

03:18 UTC — Fendi: on "YSL I wear em like they white ones" (17.5–19.5 s), the ice becomes his light before he raps —
"we can try both and see which one comes out the best": **A** a crew member holds his pendant up toward him and the
diamonds throw a spotlight onto his face; **B** his bottom grill glows from within and lights his face. Written into
the treatment as two versions to shoot; light only from the jewellery. Saved 03:18:34 UTC; VERIFIED. Next per Fendi:
"Let's get the intro settled first" — the intro (0–14 s, board c001–c007) is not settled yet.

### 03:21 UTC — The intro: boosters on Oak Street (Fendi's picture) — intro SETTLED

Fendi: "boosters running out of the YSL store on Oak Street, being chased by security during a blizzard. And then the
camera cut towards me, posted on the wall next to the YSL store window, looking at the events happen." Picture: the
frosted Saint Laurent store front in a blizzard, boosters in hoodies/bandanas/leather running out with coats on
hangers, shopping bags and a duffel, a guard in a suit behind them.

DONE ($0): filed as a director's reference, `project_assets` **`78940267-6ca3-4484-a71b-875192d5d14b`**
(`project-references/…/references/director_oak_street_boosters.jpg`, 1376×768). The treatment's intro (0–14 s)
now: the chase down Oak Street through the whiteout, shot like news footage; then the camera turns to the window —
Fendi posted on the wall beside it in the black leather coat, watching; a penguin among the mannequins in the window
(my addition, the one cold animal; drop it if Fendi says so); cut to the lounge switch on his first line. Replaces the
Red Line platform intro. Saved 03:21:37 UTC; VERIFIED. On the board: c001–c007. Not shot; no spend authorised.

## The intro BUILT — Oak Street (17 Oct, 03:26–04:05 UTC; ledger 106–111, $6.53)

Fendi: "You can build now", then "Have me in the cotton jacket for the intro", then — on the first chase clip — "I
don't like the intro. It doesn't have the same characters from the Gemini image."

Data (cold-runway variation `c067efb9`):
- Scenes: **"Oak Street, the chase"** `5ba1d919` 0–12.32 s (c001–c006) and **"Oak Street, the window"** `c29dd859`
  12.32–13.80 s (c007), both outfit `THE_CLEAN_ENTRANCE_LOOK` (the cotton jacket). Split because the tool takes one
  plate per scene (by scene name).
- Stills (all under `project-references/…/worlds/`): window plate **`bcba5663`** (PICK; `2d6cbcfe` unused), doors plate
  `5936ad79` / `57cd1a3c` (both unused now), cast scene still **`17ac4e3a`** (`scene_oak_street_boosters_…_2`, PICK;
  `6af62aa6` unused).
- c007 made a performance shot (`override_json.shotType = performance`) with his take `70304981` on it (take clock
  11.4662–12.9462 = song 12.32–13.80, before his first line) — assignment `4e0be88c`.

CODE — LIVE (VERIFIED): PR #309 squash `5910628`, Publish `7d7f2067`; live `index-O0uuvKux.js` → storyboard →
`Acceptance-Bs24WrW4.js` carries `plate-motion-v5-2026-10-17`. A still under `worlds/scene_*` is the director's picture
WITH its people (`plate.cast`): "Animate the scene" keeps them (same faces, clothes, what they carry, nobody new) and
lets the camera follow like a news camera; empty `worlds/plate_*` plates keep v4 exactly. `platesOfScene` (composite,
montage) skips cast stills; `stillsOfScene` (the Animate press) includes them. No edge function touched.

Results (all unselected; nothing selected was changed):
| Shot | Asset | Verdict |
|---|---|---|
| c002 | `1ee3c336` (empty plate, v4) | REJECTED by Fendi — invented cast |
| c004 | `603cdd8a` (empty plate, v4) | not used — same flaw (sent before his note) |
| c002 | **`0dae4f6c`** (cast still, v5) | OBSERVED: his boosters (camel coat on a hanger, hoodies, bags) sprint out toward and past the camera, the guard chasing. Posted. On c002 as assignment `5aec0881` (filed by hand: a moving plate lands on the scene, not a shot) |
| c007 | `6ee55225` dressed take | OBSERVED: belted beige cotton trench + bucket hat |
| c007 | **`ee666a9b`** montage | OBSERVED: him on the wall beside the YSL window, the penguin among the mannequins, a cutaway to the cream Pradas. Posted. |

NOT DONE: c001, c003–c006 (the rest of the chase: more beats from the cast still, e.g. the guard slipping); a press to
file a cast clip on the shot it was pressed from (today it is filed on the scene and was put on c002 by an assignment
row) — RECOMMENDATION; the shots' scene text still describes the old forest (rewrite blocked until the variation has a
visual direction). Fendi has not judged the redone clips yet.
Also noted from Fendi: the "YSL I wear em like they white ones" lounge beat is in the **denim look** (in the treatment).

## The intro REBUILT as a full fast-cut montage (17 Oct, 04:20–05:30 UTC; ledger 112–121)

Fendi: "These all need to be montage shots so a continuous running out of the store is unacceptable. Also no more shoe
shots and underneath the pea coat. The cotton jacket should be dressy button up and tie if possible … do not ask for
more approval until you have completed the full montage". Built end to end without asking.

CODE — what changed in the tool (both LIVE unless marked):
- PR #311 squash `2d941b5` (+ Lovable's one-line type fix `b96908b`, merge `67c16ed`): **montage v2**.
  - `NO_FEET` in every performance montage: never a close-up/cutaway/tilt to his shoes or feet.
  - The scene's people: a `worlds/scene_*` still is the montage's cast (`castLine`), sent after the place and shoes,
    or IS the place when the scene has no usable empty plate. `montage-shot` now prefers an empty plate.
  - **b-roll montage**: a shot he is not in is shot as fast cuts of the place and its people, no take, lines required,
    the lines share the shot's own seconds and the last holds to the end of the 4 s render (`planBrollMontage`,
    `planShotMontageScenes`). $1.849 list for 4 s. Filed on the shot unselected as a generated clip.
  - Storyboard Montage button sends the cast too; `avt_montage` description updated.
  - VERIFIED live: Lovable redeployed `montage-shot` + `avt-mcp`; dry run on c002 answered `broll:true`,
    `montage-v2-2026-10-17`. Publish `e2ea87b2` sent for the frontend.
- PR #312 squash `4aa6130`: **montage v3** — `BROLL_NO_FEET` ("No scene is a close-up of anyone's shoes or feet") in
  the b-roll prompt (the first c005 opened on running boots). VERIFIED live: Lovable redeployed `montage-shot`; a
  dry run on c005 answered `montage-v3-2026-10-17` with the sentence in the prompt. Publish `48e5f65a` sent at
  `4aa6130` for the storyboard copy of the words (bundle not re-crawled — check `montage-v3` in the storyboard chunk).
- Lovable, asked "DEPLOY ONLY", also changed one type annotation in `montage-shot/index.ts` (`dressedTakeOf`'s client
  parameter → `SupabaseClient`; its build rejected `ReturnType<typeof createClient>`). Type only; kept. Lesson: the
  repo has no Deno type check for edge functions — esbuild bundling does not catch type errors.

DATA:
- Wardrobe piece **`ff1375dd`** "Saint Laurent striped dress shirt and silk tie" — an UNALTERED crop (box 440,268–760,600)
  of the Saint Laurent look IMG_5541 already on file (`6badada3`'s on-model picture: the shirt and tie under the Mastic
  track jacket). ysl.com / Mr Porter / Farfetch / Saks refuse this container (bot walls), so no new product photo was
  fetched. No pixel generated.
- Outfit **`OAK_STREET_DRESSY`** `2eb179c4` (c067): cotton jacket, shirt + tie, Cazal glasses, Mick black jeans,
  belt, cream Pradas; no hat. Both Oak Street scenes now point at it (was THE_CLEAN_ENTRANCE_LOOK, which stays for the
  clean-entrance scene at 163 s).
- Window plate **`0a6254c2`** (dusk, matches the boosters picture's light; `5fefea0f` unused). Supersedes `bcba5663`
  by being newest.

RESULTS (all filed UNSELECTED; nothing selected was changed):
| Shot | Asset | What it is | Verdict |
|---|---|---|---|
| c001 | `251c89e1` | frosted YSL sign → doors burst open, hoodie booster with the camel coat on its hanger → guard at the door → the crew runs | OBSERVED good; first ~1.2 s is the sign |
| c002 | `bc9cb467` | wide: the four boosters coming at camera from the doors → bandana close-up with the monogram duffel → hanger in the gutter | OBSERVED good, same cast |
| c003 | `56c4e578` | varsity booster sliding between cars → guard goes down on the ice → guard's face → bag spilling sweaters | OBSERVED good; the guard's face drifts from the still |
| c004 | `0db8f045` | telephoto down Oak St → vault over a snowed-in car → hand grabs an empty coat → footprints from above → bandana looks back | OBSERVED good |
| c005 | `bd080e8b` | running boots close-up → guard (uniform, a different man) on the radio → lamp post → dropped bag → guard winded | NOT USED: a shoe shot; redone (row 121) |
| c005 | **`5266eab6`** (v3) | over the varsity booster's shoulder → the same guard in the black suit on his radio → duffel past a lamp post → dropped Saint Laurent bag → guard winded | OBSERVED good, no feet; the varsity jacket's back reads as a YSL medallion |
| c006 | `ba9e6af9` | the crew vanishing into the whiteout → the empty doorway | OBSERVED good |
| c007 | dressed `9fc49bed` → montage **`85101246`** | penguin window → him on the wall in profile → tight low angle (shirt + tie) → wide from across the street | OBSERVED good; no feet; his own navy cap from the take stays |

Marked `usable:false` with the reason (nothing selected changed): `0dae4f6c` (the continuous Kling chase — "a continuous
running out of the store is unacceptable"), `ee666a9b` (c007 montage with the Prada cutaway + confetti shirt),
`bd080e8b` (c005 boots). `6ee55225` (confetti dressed take) left as is — the montage lane takes the newest dressed take.

The whole intro, as cut for review: c001 0–1.5 · c002 0–1.48 · c003 0–1.97 · c004 0–2.95 · c005 `5266eab6` 0–2.95 ·
c006 0–1.47 · c007 1.139–2.619 (its lead) = 13.8 s, silent (the take has no sound). A review render in the
scratchpad only; NOT a production asset and never committed (Fendi's likeness, public repo).

NOT DONE / for the next agent:
- Fendi has not judged the rebuilt intro. Nothing is selected: on the board each c001–c007 has its montage as an
  unselected version; selecting is his.
- A b-roll montage is filed as a generated clip, so the board's version name reads as a clip, not "montage"
  (`derivedOf` needs `derived_from.asset_id`) — RECOMMENDATION: name it from `settings.variant.broll`.
- The storyboard Montage button still refuses a b-roll shot (`est.restage` gate); b-roll montages go through
  `montage-shot` / `avt_montage` only — RECOMMENDATION: a b-roll branch in the dialog.
- `MONTAGE_STYLE` says "muted warm night colours"; the boosters' picture is grey dusk. The clips held the picture's
  light (BROLL_PLACE), but a light-aware style line is a RECOMMENDATION.
- Verse 1 onwards on the copy variation (lights-off lounge with the spotlight-vs-grill A/B in the denim look, goats,
  camera car, geese) — not started.

## The whole video in the montage format (17 Oct, 06:00–06:50 UTC; ledger 122–126) — BLOCKED on Higgsfield credit

Fendi: "The intro is perfect don't keep stopping after every one please let's knock it all out using the same montage
format … are we going to keep doing 4 second clips or cut to the exact song … write that workflow into the tool".

DECISION + CODE (LIVE): **cut to the song.** PR #314 squash `c45fbd1` — montage v4: the board stays on the song's beat
grid; inside each shot untimed lines are cut on the song's beats (`planBeatLockedScenes`, both copies, `variant.cutOn`);
one render per shot at the model's length. Workflow for every song: `docs/recipes/MONTAGE_MUSIC_VIDEO_WORKFLOW.md`.
VERIFIED: Lovable redeployed `montage-shot` + `avt-mcp` from `c45fbd1` (checksums `42437ed0…`, `066e583d…`); every
dry run since reports `cutOn.beats == cutOn.cuts`.

DATA on the cold-runway board `c067efb9` (all VERIFIED by the rows returned):
- Scenes for 13.8–201.87 s: Lounge, lights off · Pasture, the goats · The camera car · Michigan Avenue, the geese ·
  School hallway, the janitor · Michigan Avenue, the polar bear · Midway, the carousel (was "The viewer") · Lower
  Wacker · The showroom · Red Line, the penguins · (Chicago dice/corner/runway/train/inside/switch unchanged) · 14
  "Chops — <place>" scenes, one per shot c055–c068 (the first was "The cold front"), leather coat · The empty street ·
  The roller rink (was "The clean entrance") · Red Line, every animal · Red Line, lights out. Outfits per the treatment.
- Places: 12 new stills (row 122) + 16 copy rows pointing at the picked stills for the chops and two Red Line scenes.
- 46 shots made performance shots (shot_type + override) with his take `70304981` assigned in sync (c009 c010 c011 c013
  c016 c017 c023 c025 c027 c028 c030 c031 c033 c034 c036 c037 c039 c048 c055–c068 c070 c072 c074 c076 c078 c080 c082
  c084 c086 c088 c090 c092 c094 c096). His take ends at song 190.9 s, so c097–c100 are without him (the outro: he is gone).
- Old timed events cleared on c024 and c048 (old-treatment effects; montage-shot refuses shots with events).
- c041–c047 untouched (their montages exist from 16 Oct).

RESULTS: 12 b-roll montages filed unselected (row 123). 3 blocked by content safety (row 124), reworded. 25 refused
for credit (row 125). c009's dress in flight (row 126).

BLOCKER: the Higgsfield account Control Center bills through is at **0.68 credits (free plan)** (`balance` on the
Higgsfield connector; the API answers "Your credit balance is too low"). Fendi has to top it up — about **$280 list**
covers the rest: 45 dresses ($123), 47 performance montages ($104), 28 b-roll retries ($52).

TO RESUME (agent, after the top-up; every step is the tool's own lane):
1. Dry run one montage (`avt_montage` dry_run) to confirm, then shoot the 28 b-roll retries — lines in the session
   scratchpad `prod/broll_retry.json` (the three reworded: c021, c026, c029).
2. Dress the 45 remaining performance shots (Storyboard → Dress, or `scripts/agent-browser/avt-press.mjs dress`), one at
   a time; check one frame per outfit.
3. Montage each performance shot once its dressed take is filed (lines `prod/perf.json`; c010 twice — pendant spotlight
   and glowing grill `prod/perf_c010b.json`).
4. Review per section (contact sheets), mark misses `usable:false` with a reason, reshoot only those; ledger; handoff.
Note: the scratchpad does not survive the session — the lines are also the treatment's beats, one HARD CUT per beat.

RECOMMENDATIONS: (a) `montage-shot` finds dressed takes only by `shot_id`; a duplicated board's shots carry theirs by
assignment — look them up through `shot_asset_assignments` too. (b) The storyboard Montage button has no b-roll branch.
(c) The every-animal platform still's station sign reads "KEDZIE" on a London-style roundel — regenerate if it shows.

