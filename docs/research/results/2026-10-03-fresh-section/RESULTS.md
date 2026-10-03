# Fresh-section production test — results (2026-10-03, rev 60)

The first production test of the architecture rev 59 established: an untouched lyrical section of YSL written,
drawn, restaged, measured and reviewed through the app's own pages. Running notes with every job id and timestamp:
`RUNNING_NOTES.md` beside this file.

**Outcome: B — PRODUCT LIMIT FOUND.** Every part of the chain works except one, and that one is now measured:
**the restage model draws the change it is asked for, about one second before the time it is asked for.** Two
timed events, two clips, −1.02 s and −0.94 s. The run ended there because both paid providers ran out of credit
(xAI during the run, Higgsfield on the last request), not because the questions were open.

## Test window

| | |
|---|---|
| Song time | 156.86 – 174.51 s (2:36.86 – 2:54.51), 17.65 s, bars 80–89 |
| Shots | 39–42 on the board: `c035`, `c036`, `c037`, `c038` |
| Lines | second hook — "Freezin every season / We party like new years evenin / Diamonds dancin like the disco / Get fly I know that you see it" — then the return of hook A, "You don't gotta cut the lights on" |

**Why this section.** Never engineered: bars 24–46 (47.06–92.16 s) were rev 58's section, 19–35 s carried the
B4 exemplar work, and 92–143 s has broken lyric timing (block 7, confidence 0). Lines 59–84 have lyric
confidence ≈ 1.0. And it is where the treatment writer, unprompted, authored a timed event on a lyric (`c038`,
"cut the lights on"). It was not chosen for being first: it is two and a half minutes in.

## Treatment

Regenerated twice with the writer (two versions kept by the version trigger). The first pass exposed two writer
defects (below); after the fixes the second pass wrote 33 open shots with no repeated sentence, 28 of them pointing
at one location entity, and three timed events of its own: `c042` and `c038` on the lyric "cut the lights on"
(→ lighting state `DIAMOND_DISCO_LIGHT`, no exposure effect) and `c043` at 0. It wrote **no** event on the hook-B
lines.

Concept as written: a black Paris runway; one hard pool of light; a cut-crystal mirror ball that is dark until the
hook says the lights are not needed.

## Storyboard

| Shot | Key | Song time | Type | What | Source |
|---|---|---|---|---|---|
| 39 | `c035` | 156.86–160.78 | performance | take restaged on the runway; **timed event** at 158.76 (director's) | Seedance 2.5 reference, 4 s |
| 40 | `c036` | 160.78–164.71 | b-roll | white sneakers step onto the runway beside the edge line | xAI still → Kling 2.5 i2v, 5 s |
| 41 | `c037` | 164.71–168.63 | performance | take restaged on the runway, no event | Seedance 2.5 reference, 4 s |
| 42 | `c038` | 168.63–174.51 | performance | take restaged on the runway; **timed event** at 173.32 (the writer's) | Seedance 2.5 reference, 6 s |

- **Performance shots:** 3, each the real take (`hero_clip_hd_1080.mp4`) cut to the shot and restaged.
- **B-roll shots:** 1.
- **Continuity entities** (made in the Continuity panel): location `PARIS_BLACK_RUNWAY` with an approved picture
  (asset `5ff90a21`), prop `DIAMOND_MIRROR_BALL`, lighting state `DIAMOND_DISCO_LIGHT`. All four shots point at the
  location; the three restagings were made into its one approved picture.
- **Timed-event shots:** 2. `c038`'s was authored by the treatment writer. `c035`'s was added by the director in
  the Timed beats editor on the lyric "We party", after xAI ran out and the writer could not be asked again — it is
  a real lyric cue of the same motif, but it is the director's, not the writer's, and is reported as such.

Cuts made on the board: split `c033`@149.02, `c034`@152.94, `c036`@162.75; merged `c033_2`+`c034` and
`c036`+`c036_2`.

## Temporal event results

How it is measured (`src/lib/storyboard/beatCheck.ts`, `src/lib/media/frameSeries.ts`): every frame of the
returned clip is decoded with its own presentation time and reduced to the light of the whole picture
(brightness, contrast, two colour leans); the series is split where the light goes from one state to another; the
change is paired with the beat asked for. "Begins" is where 20 % of the change has happened. On time = within
0.25 s. Calibrated on 11 real clips before use (five restaged takes with nothing asked: 0 changes found).

### Event 1 — `c038`, the writer's

| | |
|---|---|
| Intended song time | 173.32 s (lyric "cut the lights on") |
| Shot-relative time | 4.69 s (clip opens 0.009 s before the shot) |
| Provider / model | Higgsfield · `seedance-2.5-reference`, 6 s, 720p |
| Temporal plan | `timed_script`, 1 beat, `asked: [{id: e1, offset: 4.69, kinds: [lighting]}]` |
| Instruction as sent | "Timed changes inside this shot, in seconds from its first frame. Each holds until the next; nothing else changes: from 4.7 s: light: pool dies, only diamond points remain — The room goes dark and one hard white beam strikes the diamond mirror ball, which throws hundreds of small sharp points of white light drifting slowly across the floor, the walls and anyone standing there. White light only, no colour." |
| Frames | 0.2 s and 1.6 s: chest-up under the pool, ball unlit. 3.72 s and 4.39 s: room dark, ball lit, points of light, him in silhouette |
| Measured | 145 frames at 24 fps. Brightness 0.160–0.163 from 0 to 3.625 s; 0.144 at 3.667 s; 0.094 at 3.708 s; ≈ 0.09 to the end |
| Change begins | **3.67 s** (arrived 3.71 s — one frame) |
| Error | **−1.02 s** (early) |
| Verdict | **PARTIAL** — the right change, in the right order, a second early |

### Event 2 — `c035`, the director's

| | |
|---|---|
| Intended song time | 158.76 s (lyric "We party") |
| Shot-relative time | 1.90 s |
| Provider / model | Higgsfield · `seedance-2.5-reference`, 4 s, 720p |
| Temporal plan | `timed_script`, 1 beat, `asked: [{id: e1, offset: 1.9, kinds: [lighting]}]` |
| Instruction as sent | "… from 1.9 s: light: the pool dies and the mirror ball comes alive — The room goes dark and one hard white beam strikes the diamond mirror ball, …" |
| Frames | 0.66 s: pool, ball unlit. 1.01 s: dark, ball lit, points of light |
| Measured | 97 frames at 24 fps. Light change begins 0.958 s, arrived 1.125 s; mean brightness 0.110 → 0.164 (the room goes dark but the points of light raise the mean) |
| Change begins | **0.96 s** |
| Error | **−0.94 s** (early) |
| Verdict | **PARTIAL** — the right change, a second early |

### Reading

Both events occur, both are the change asked for, both are about one second early. The offset is the same for a
change asked at 1.9 s of a 4 s clip and one asked at 4.69 s of a 6 s clip, so it is a constant lead, not a
proportion of the clip. Two measurements are evidence, not a law: a third (the same request repeated) was
submitted and refused by the provider for lack of credit. **Seedance timing is not "working".** It is: sequence
right, state right, placement about one second early.

Clips with nothing asked, measured the same way: `c037` — one slow drift 0.92–1.88 s (the camera pushing onto
the lit pool), reported as a drift, not a change; `c036` (Kling) — nothing.

## Continuity

The three restagings (`c035`, `c037`, `c038`) show the same runway: two edge lines, the pool, the mirror ball, the
chairs — the approved picture. The cutaway `c036`, drawn from the entity's words and not from its picture, matches
it closely (edge line, pool, ball, chairs). The lighting state looks the same in both shots that switch to it.

Not held: framing. `c037` (asked with the old "wide" wording) and `c035` (asked "waist up, pushing toward him")
show him full-length with legs the take never filmed; `c038` (locked off, medium close-up) kept the take's framing.

## Background jobs

All four paid clip jobs were finished by the server (`settings.attachedBy: "server"`); three with the app tab
navigated away the moment the request was accepted.

| Job | Shot | Submitted (UTC) | Page | Attached by server | Asset |
|---|---|---|---|---|---|
| `79f467c2` Kling | `c036` | 19:31:05 | open | 19:34:04 | `c2045712` |
| `0c74f907` restage | `c037` | 20:21:52 | **closed** | 20:25:06 | `9d132fa4` |
| `714aa31f` restage | `c038` | 20:27:24 | **closed** | 20:31:04 | `4b872af2` |
| `b1d57c5d` restage | `c035` | 20:38:28 | **closed** | 20:43:04 | `ae0a116f` |
| `ec18f5ac` restage (retest) | `c035` | 21:08:50 | **closed** | failed 21:09:01 — provider out of credit, not charged | — |

For `c037`: claimed 20:25:01, asset saved 20:25:05.43 (derived from the take, song start 164.701), sync written
20:25:05.86, assignment (performance, primary) 20:25:05.93, finalized 20:25:06.02. No client took part.

## Review

`/projects/<id>/review?from=39&to=42` — 4 shots · 17.6 s, built from the board's records.

- **Check this cut: passes.** Song 201.87 s decodes; 20 of 20 files open and decode (25 frames decoded where the
  cut enters them); 47 shots tile 3:21.87; every shot plays its own selection; 46 cuts on their own times at 2 019
  moments; performance on the song clock at 1 588 moments, furthest 0 ms; the player holds each shot's own file.
- **The contact sheet** (three frames a shot, read from each shot's own file at the cut's moments) shows the
  section as described above.
- **Not done: the section was not watched playing.** The live-player line of the check was skipped — "this browser
  window is not on screen" — because the Chrome window on Fendi's Mac was minimised from about 20:48 UTC and a
  browser loads no video or sound in a window that is not shown. The same player code played the stand-in project
  in the local harness (PASS, 0 samples off the song clock).
- **Astra's second opinion** (14 frames, $0.15): "Good, with shots to fix" — 39 and 41 full-length instead of
  thighs-up; 40's sneaker reads empty until late; 42's cue happens but is a bright disco room, not the treatment's
  ice-only blackout (the lighting state's own words ask for the ball's light; the treatment's hook asks for less).

## The 47-versus-46 question

One `shots` row on YSL (`de63c78c…`, created 2026-06-07) is a leftover of the manual shot list that predates the
storyboard: no key, no spec, no times, no assignments. The board, Review and the render contract already ignored
it; Export's "Shots" total counted every row. Fixed (`storyboardShotRows`, with a test). Not drift in canonical
state.

## Product defects found and fixed (all on main, tests with each)

1. A beat with both an exposure effect and a lighting state lost the state — it was asked of nobody.
2. The writer repeated one sentence across performance shots, and its hook shots contradicted its own treatment.
3. Nothing measured whether a timed change happened when asked — `beatCheck`, the panel on each generated clip.
4. A job did not carry its script as data, so nothing could be held against it — `settings.temporal.asked`.
5. A restaging whose cut opens early would have sent script times off by the lead.
6. Export counted the leftover row (47).
7. Entity pictures could not be looked at large before approving one.
8. The split slider could not be put on a beat.
9. An image failure said only `xai_error`.
10. A cutaway set in a location described the place twice and lost its subject.
11. The restage prompt said "the environment is still" beside a timed script.
12. A state switch with its own words did not carry the state's canonical words.
13. A camera push onto a lit area read as two light changes — now one drift, worded as such.
14. The "before" frame of an early change showed the already-changed picture.
15. "Wide" framing made the model draw the body the take never filmed — `TAKE_FRAMING`.
16. A framing beside a closing move ("waist up, pushing toward him") was read as where the move ends — the framing
    named is now said to be the first and widest frame. **Unverified against the provider** (no credit).
17. A job the provider refused said only "failed"; the provider's sentence was in the response — `failureReason`.
18. The player could show the take's first frame for one tick at the take's end (a video that reached its own end
    was asked to play again) — `videoTick`.
19. "Has not been measured" is replaced by what was measured, in numbers — `ROUTE_TEMPORAL.seedance_ref.evidence`.

## Test results (on main `e8915df`)

| | |
|---|---|
| Focused regression | `beatCheck`, `events`, `restage`, `storyboard`, `jobProgress`, `worldBatch`, `Continuity`, `BeatCheck`, writer contract — pass |
| Vitest | 180 files passed, 1 skipped · 2 031 tests passed, 1 skipped |
| TypeScript | `tsc --noEmit` clean |
| Production build | `vite build` succeeds |
| Python | 39 passed (`scripts/edit`, `scripts/lyrics`, `scripts/_lib`, `scripts/render`) |
| Local end-to-end (`scripts/e2e-local`) | PASS · 0 samples off the song clock — after it caught defect 18 on its first run |

## Provider failures

- **xAI: out of credit** from 19:32 UTC (403, "used all available credits or reached its monthly spending limit").
  Stills, the treatment writer and the scene writer are blocked.
- **Higgsfield: out of credit** at 21:09 UTC ("Your credit balance is too low"). Clips and restagings are blocked.
- Seedance: timed change about 1 s early (twice); full-length figure when the camera pushes (twice).
- Kling: the stepping sneaker is not attached to a leg for most of the clip.

## Spend (list price)

| | |
|---|---|
| Entity pictures (xAI) | $0.14 |
| `c036` stills (xAI) | $0.14 |
| `c036` clip (Kling) | $0.35 |
| `c037` restage, 4 s | $3.70 |
| `c038` restage, 6 s | $5.55 |
| `c035` restage, 4 s | $3.70 |
| Astra review | $0.15 |
| Failed requests | $0.00 |
| **Total** | **$13.73** — plus two treatment-writer runs and one scene-writer run (cents; not recorded client-side) |

Ceiling $20.00, target $15.00.

## Remaining limitations

- Two timing measurements, one model, one kind of change (light). No camera or action beat was measured.
- The framing fix for closing moves and `TAKE_FRAMING` were not seen against the provider.
- The section was not watched playing in production, and lip sync on restaged clips cannot be judged from frames.
- The writer authored one of the two events; it wrote none on the second hook.
- The measurement sees a change of light. A change that leaves the light alone (an action, a camera move on an
  evenly lit scene) reads as "not seen" or as a drift.

## Next scaling decision

Do not scale to a full section on timed events as they are. The decision for Fendi and ChatGPT is which of these
to pay for first once the providers are topped up (≈ $4 each):

1. **Repeat** `c035` unchanged: is the one-second lead stable? (Also verifies the framing fix.)
2. **Compensate**: ask one second later and measure — if the change lands on the beat, a per-route measured lead
   is a small, honest addition to the temporal plan. This is designing around one provider and was deliberately
   not done in this run.
3. **Move the beat to the edit**: a cut at the beat between two restagings (state A, state B) is exact to the
   frame today and costs two shorter clips. For light-state changes on a lyric this is the mechanism already known
   to be on time.
