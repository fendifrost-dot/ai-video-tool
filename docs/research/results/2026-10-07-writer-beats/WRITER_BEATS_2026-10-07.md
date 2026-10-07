# The storyboard writer, repaired: beats first, shots allotted, coverage checked · 7 October 2026

> Integration agent. Spend this record: **one writer run, $0.0263 actual** (grok-4-fast, 79,174 prompt + 20,833
> completion tokens at list; estimate was $0.0205). No still, clip or entity picture generated. Paid generation
> through the browser remains blocked by the session's transaction guard — recorded below, not worked around.

## What was wrong (diagnosed from code and the run, not guessed)

The first Interrupted Broadcast write (board of 43 shots, 18:10 UTC) lost four scenes (control room, Maybach reveal,
woman at the switch, Chicago leather-coat performance), cast nobody on the rider shots and the viewer, and wrote 0
links. Where each was lost:

| loss | where | kind |
|---|---|---|
| 0 links | `SHOTS_SCHEMA` is `strict: true` and `continuity.required` omitted `links` — a strict model never has to write them; the relink pass (`linkedShots`) never fired | **code** |
| missing scenes | the grid is written in parallel runs of 9 with nothing allotting the treatment's scenes to windows; run 1 spent c001–c009 on the opening, run 2 opened on the geese, the rest collapsed into Chicago-blizzard | **code / design** |
| cast omissions | `acceptCast` keeps `none: true` with nobody named as a valid answer; nothing checked the scene against the treatment's people | model omission, **accepted by code** |
| no evidence | raw answers not retained; `actualCostUsd` returned, never persisted; no record of variation or treatment revision | **code** |
| a cast edit undone on reload | `parseBoxOverride` never read `cast` (PR #191, earlier today) | **code** |

## What was built (general to any treatment; PRs #193, #194, #195)

1. **Beats** (`supabase/functions/treatment-writer-proxy/beats.ts`): one small call reads the treatment's beats in
   order — scene, action, people by key, unnamed people, artist performs, wardrobe, verbatim lyric cue, ties to
   earlier beats (`screen_shows` / `match_position` / `reveals` / `continues`), weight 1–5 — checked in code
   (`acceptBeats`: known people only, ties only backward, ids unique).
2. **Allocation** (`allocateBeats`, deterministic): a cue the song sings pins its beat to the first window that sings
   it, strictly after the pin before it; between pins the beats share by weight, every beat ≥ 1 shot while shots
   remain; a gap before a pin stays with the beat before it; a beat never takes the shots of the beats after it.
   Cues the song does not sing after the beat's turn are reported (`unanchored`), the beat placed in order.
3. **Writing inside the beat**: every shot is handed its beat (`briefedShot`: scene, action, people, wardrobe,
   opens/closes, `must_link`); `BEAT_RULES` in the system prompt; the ties resolve to links first-shot → last-shot
   and are put on the clips whether or not the writer wrote them (`withRequiredLinks`). `links` is required.
4. **Coverage** (`coverageOf`): every beat has shots; every named person is cast in its beat; no peopled beat came
   back `none`; every tie is a link to a valid shot. Returned with the shots, kept at
   `treatment.storyboard.coverage`, shown on the Treatment page with each gap in words (`beatCoverage.ts`,
   `CoverageBlock`). An existing board is never replaced in place by shots that fail it.
5. **Evidence** (`writer_runs`, migration `20261007200000`): one row per run written by the function — user,
   project, **variation**, **treatment fingerprint**, mode, model, status, shots asked/written, usage, **actual
   cost (null = unknown, never an estimate)**, **estimate apart**, beats, allocation, coverage, accepted clips,
   missing. Readable by the owner.
6. **Candidate boards** (`writeStoryboardFromTreatment({candidate})`): a board with shots is written again into a
   NEW variation (same treatment, direction and — after #195 — continuity entities), this board left exactly as it
   is, nothing made active. The Treatment page offers "Write a candidate board…".
7. **References** (ported from open PR #190): a required screen picture / exact garment / identity that overflows
   the endpoint's reference slots **blocks** the request. The server already refuses over-cap requests
   (`references_over_capability`). Was: garment → warning (drawn from words), screen → silently dropped.

Tests: 11 for beats, contract tests extended (schema `required` = all properties), page test for the candidate
action and the coverage block, `beatCoverage` tests, `events.test` regression for the cast override. 2,363 pass.

## The second run (candidate 2) — VERIFIED from `writer_runs` `7b266a8b-…` and the rows

- 18 beats, 43/43 shots, **coverage ok = true**, missing 0; actual $0.0263.
- Every scene present, in order: burning show (b01–b03, c001–c005) → rider mounts / loses colour (b04–b05, c006–c008)
  → **the viewer** (b06, c009–c010, FENDI, "exact YSL denim look") → rider turns (b07, c011) → **woman at the
  switch** (b08, c012) → **Chicago — the switch** (b09, c013–c014, FENDI + WOMAN, "exact YSL leather coat",
  `match_position → c011`, `continues → c012`) → Fendi performs (b10, c015–c016) → grill close-up (b11, c017–c019,
  pinned to "cut the lights on" at 1:02) → cold front (b12, c020–c023, "specified YSL jacket") → animals (b13) →
  **camera crew** (b14, c027–c029) → operator to exit (b15) → **Maybach SUV** (b16, c033–c035, `reveals → c032`) →
  geese (b17) → **clean entrance** (b18, c039–c043, `screen_shows → c007` on the security monitor).
- Cast on every shot that has people; `open: true` where the street has passers-by.
- **Unanchored cues (real, reported):** "more cameras in the whip…", "all this ice around me, need a Canada Goose",
  "so clean, but I don't do what the janitors do" are sung **once, at 0:23–0:31** (the first hook, inside the forest
  sequence) and never again — the treatment hangs its crew, geese and entrance scenes on words the song does not
  repeat there. Placed in order instead. This is a treatment-vs-song decision for the director, not a writer defect.
- **Model readings reconciled by hand on candidate shot 9** (recorded, deliberate): the viewer's tie came back as
  `match_position` + `reveals`; replaced with `screen_shows → c008` ("the black-and-white CRT television") and the
  exact garment Trucker Jacket — French Black Denim ticked — the same two edits the old board's shot 9 carried.
  Shot 8 already casts THE_RIDER. The beats prompt now defines each tie kind by its device (#195).
- Smaller reads: two scenes wrote keys in prose ("THE_CREW adjusts…") — prompt now forbids it (#195); shot 10
  (Fendi watching the CRT) routed `restage` although the take is him rapping, not sitting — a routing read for the
  director; shot 33 says "daylight", the treatment does not.
- Candidate 1 is the empty leftover of the 503 run (`index.ts` lost its helpers in #193; fixed in #194) — archived,
  not deleted.

## Treatment coverage of the corrected board, in one line

18 of 18 beats have shots; 0 beats emptied; 0 people missing; 4 of 4 ties present as links; 1 cue anchored, 3
cues unanchored (the song sings them only earlier). `coverage.ok = true`.

## Rider → CRT test readiness (candidate 2, not active)

| gate | state |
|---|---|
| THE_RIDER reference picture | **none approved** — generating one ($0.14) is the first paid step; the app blocks shot 8 until then |
| shot 8 (rider side-on, c008) | cast THE_RIDER; `generate`; will send "The rider (cast)" once her picture is approved |
| shot 9 (viewer, c009) | cast FENDI; `screen_shows → c008`; exact garment f6455042; pictures IMAGE_0 Fendi, IMAGE_1 jacket, IMAGE_2 shot 8's approved image — blocked until shot 8 has one, by design |
| reference slots | 3 required pictures = the endpoint's cap; a fourth required one would now block, not drop |
| wardrobe still unreferenced | leather coat (b09–b11), blizzard jacket (b12–b13): no garment on file — "from words" unless a picture is added or the director relaxes |

## The browser's refusal (recorded, not worked around)

The Claude-in-Chrome tool in this session refuses clicks it classifies as real-world transactions: it refused the
click that opens THE_RIDER's `entity-generate-picture` confirmation ("Real-World Transactions"). It did allow the
writer call (the treatment page's "Write the candidate"). Nothing paid beyond the writer runs happened from this
session; the execution path for stills is for Fendi to decide (his own click, or a session without that guard).
