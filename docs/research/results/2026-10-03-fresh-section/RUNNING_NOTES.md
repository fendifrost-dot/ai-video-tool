# Fresh-section production test — running notes (2026-10-03, rev 60)

## Window
- Chosen: 156.86–174.51 s (2:36.9–2:54.5), 17.65 s, bars 80–89. Shots 39–42: c035 (perf 156.86–160.78), c036 (b-roll 160.78–164.71), c037 (perf 164.71–168.63), c038 (perf, writer's event, 168.63–174.51).
- Why: second hook ("Freezin every season / We party like new years evenin / Diamonds dancin like the disco / Get fly I know that you see it") ×2 then return of hook A ("You don't gotta cut the lights on / this ice on"). Never engineered: bars 24–46 (47.06–92.16) were rev 58; c006/c009 (19–35 s) carried B4 exemplar work; 92–143 s lyric timing is broken (block 7 conf 0). Lines 59–84 have confidence ~1.0.
- First considered 149.02–164.71; moved to include the WRITER's own timed event (c038) instead of a director-added one.

## 47 vs 46
- Row de63c78c… created 2026-06-07 (pre-storyboard manual shot list), spec_key null, no spec, no times, 0 assignments, 1 old timeline_items ref. boxFromRow drops keyless rows (test existed). The Export page's "Shots" total counted every `shots` row (47) beside the render contract's 46. Fixed: storyboardShotRows (633f11e). 5 keyless rows across all projects, 51 shot rows total (before splits).

## Entities (created in the Continuity panel, as director)
- PARIS_BLACK_RUNWAY (location) — approved picture asset 5ff90a21 (candidate 2; unlit ball, two edge lines); other db597d22. Description edited to match approved picture (edge line each side).
- DIAMOND_MIRROR_BALL (prop), DIAMOND_DISCO_LIGHT (lighting state).
- Entity pictures job aece3490: $0.14.

## Treatment writer
- Pass 1 (before fixes, 18:52): 33 open shots written; 23 pointed at PARIS_BLACK_RUNWAY, 10 lighting, 11 props; 4 shots with events (c005 lyric "cut the lights on" 1.2 s blackout+state; c011 at 0; c031 at 1.2; c038 at 4.2 lyric). Defects: identical sentence on many performance shots; effect blackout + lightingState on the same beat (state asked of nobody); hook-B shots contradict the treatment's "every hook the lights snap off".
- Pass 2 (after fixes, ~19:27): 0 repeated sentences in 33 open shots; 28 point at runway; events: c042 (0.8 s lyric "cut the lights on" → DIAMOND_DISCO_LIGHT, no effect), c038 (4.2 s lyric "cut the lights on", "pool dies, only diamond points remain", → DIAMOND_DISCO_LIGHT, no effect), c043 (at 0 "pool begins to narrow"). No events authored for hook-B lines.
- treatment_versions: 2 rows (trigger live).
- c036_2 "Regenerate scene" (scene writer): wrote a model walking the runway, 4 semicolon beats for a 2 s shot; later merged into c036.

## Cuts made in UI
- split c033@149.02, split c034@152.94, split c036@162.75, merge c033_2+c034, type c036_2→b_roll + regenerate scene, merge c036+c036_2. Now 47 boxes (+1 keyless row = 48 rows).

## Jobs / spend (list)
- aece3490 entity stills $0.14 (xAI)
- 75413be6 c036 stills $0.14 (xAI)
- 79f467c2 c036 Kling clip $0.35 (Higgsfield): submitted 19:31:05, attached by SERVER 19:34:04, asset c2045712. (page was open)
- c036_2 stills: failed ×3 — xAI 403 "used all available credits or reached its monthly spending limit" → $0.
- treatment writer ×2 + scene writer ×1: xAI grok-4-fast, cents (actualCostUsd not recorded client-side).
- xAI IS OUT OF CREDITS: images + both writers blocked until Fendi tops up. Higgsfield still accepting.

## Measurement calibration (v3, light of whole picture), 11 real clips
- 5 restaged takes (rev 58): 0 changes; luma range ≤ 0.035; noise 0.006–0.013.
- 6 Kling cutaways: 4 with 0 changes; 2 with real light changes (3fbef71e luma .147→.155→.233 at 1.88 s / 3.71 s; 090828fd dip .139→.094 at 1.58 s and back at 3.0 s).
- v2 (grid) on same kind of clips gave 3 false "picture" changes each (sizes .03–.13) → replaced.

## Defects found/fixed so far (commits on main)
1. effect + lighting state on one beat → state lost (events.ts effectOf; writers' rules) — 1dada30, 93724cc
2. writer repeats sentences / shots contradict treatment → repeat re-ask + rules — d3969b6
3. no measurement of temporal adherence → beatCheck (1dada30, b8d142c, 6013340, 4dacdda), v3 light-based (977e5ac, c7b6280)
4. job did not carry the script as data → temporal.asked (85ff44c)
5. restage with early cut would give wrong script times → lead shift (1dada30)
6. Export counted 47 → 633f11e
7. entity pictures could not be looked at large → 4dacdda
8. split slider could not be put on a beat → 4dacdda
9. image failure said only "xai_error" → d649219
10. cutaway in a location: place described twice, subject lost → c52d3ff
11. restage prompt said "environment is still" beside a timed script → 96a5ba6, 2963a37
12. state switch with own words did not carry the state's canonical words → 05bd4f6
- Lovable mirror lags GitHub by minutes; it "fixed" a half-landed pair locally (04fde60, never pushed).

## Later (20:20–20:40 UTC)
- xAI exhausted → merged c036+c036_2 (b-roll 160.78–164.71 with the Kling clip). Section = shots 39–42 (c035, c036, c037, c038).
- BACKGROUND JOB #1 (c037 restage, no event): job 0c74f907; submitted 20:21:52; app tab navigated away ~20:22:20; server claimed 20:25:01; asset 9d132fa4 saved 20:25:05.43 (generated_clip, footage_role performance, derived_from take, song_start 164.701); performance_syncs derived/confirmed 20:25:05.86; assignment on c037 role performance primary 20:25:05.93; attachedBy "server" 20:25:05.975; finalized 20:25:06.02. cron ran each minute. No client.
  - Result: FULL BODY (legs/feet invented) because framing "wide" → fixed TAKE_FRAMING (d4f4d74). Camera push brightened picture 0.122→0.30 over 2.3 s → v3 read 2 "light changes" (0.67, 1.46) → fixed: travelling run = one drift; drift wording (d4f4d74, 0ed9979).
- BACKGROUND JOB #2 + TEMPORAL #1 (c038, WRITER's event): job 714aa31f; submitted 20:27:24; tab away at once; attached by server 20:31:04.758; finalized 20:31:04.80; asset 4b872af2. 6 s, seedance-2.5-reference, 720p, $5.55.
  - Asked: lyric "cut the lights on" → song 173.32, shot-relative 4.69 s (script said "from 4.7 s"), clip lead 0.009 s.
  - Exact prompt: see job row (angle: "a medium close-up of his chest and face, the camera locked off. Never show more… Timed changes inside this shot, in seconds from its first frame. Each holds until the next; nothing else changes: from 4.7 s: light: pool dies, only diamond points remain — The room goes dark and one hard white beam strikes the diamond mirror ball, which throws hundreds of small sharp points of white light drifting slowly across the floor, the walls and anyone standing there. White light only, no colour." + keep + PLACE_LIGHT_CHANGING + suffix).
  - Measured (145 frames, 24 fps, 6.04 s; noise 0.004): brightness 0.160–0.163 from 0 to 3.625 s; 0.144 at 3.667; 0.094 at 3.708; ~0.09 to the end. Change begins 3.667 s, arrived 3.708 s (one frame). size 0.101, strength 72.
  - ERROR = 3.667 − 4.69 = −1.02 s (EARLY). Verdict: displaced / PARTIAL — right change (room dark, ball lit, points of light everywhere, him in silhouette), right order, wrong time.
  - Frames: 0.2 s and 1.6 s = him chest-up under the pool, ball unlit; 3.72 s and 4.39 s = dark, ball lit, points of light.
- TEMPORAL #2 (c035, DIRECTOR's beat, added in the Timed beats editor because xAI is out and the writer wrote none here): lyric "We party" → song 158.76, shot-relative 1.90 s; state DIAMOND_DISCO_LIGHT; words "the pool dies and the mirror ball comes alive". Job b1d57c5d submitted 20:38:28, 4 s, $3.70, camera pushing slowly (writer's). Tab away.
- Spend so far (list): 0.14 + 0.14 + 0.35 + 3.70 + 5.55 + 3.70 = $13.58 (+ writer calls, cents).

## 20:43–21:00 UTC
- BACKGROUND JOB #3 + TEMPORAL #2 result (c035): job b1d57c5d attached by SERVER 20:43:04, asset ae0a116f, tab away throughout.
  - Measured (97 frames, 24 fps, 4.04 s; noise 0.020): light change begins 0.958 s, half 0.958, arrived 1.125 s; brightness 0.110 → 0.164 (room goes dark but the ball's points of light raise the mean), strength 6.1.
  - ERROR = 0.958 − 1.90 = −0.94 s (EARLY). displaced / PARTIAL. Frames: 0.66 s = pool, ball unlit; 1.01 s = dark, ball lit, points of light.
  - FRAMING: asked "a medium shot from the waist up, the camera pushing slowly toward him. Never show more of his body than @Video1 shows…"; came back opening on the WHOLE of him (legs and feet invented), pushing in to thighs-up by the last frame. c038 (locked off, medium close-up) obeyed. → wording fix: closing moves say the framing named is the first and widest frame; NEVER_WIDER "in any frame from the first to the last" (f4cf7a6).
- Re-measured with published code: c037 (9d132fa4) → one unasked DRIFT 0.92–1.88 s (brightens .136→.275, the push onto the lit pool), no false "changes"; c036 Kling (c2045712) → v3, 0 changes.
- REVIEW (section 39–42, /review?from=39&to=42): 4 shots · 17.6 s. Rows: 39 restaged take, 40 AI clip, 41 restaged take, 42 restaged take. Page checks: shots cover the song 201.9/201.9; every shot has footage 46 of 47 (shot 47, c043 outro b-roll 3:14–3:21, has none — true, nothing generated, take over); takes in sync 1 of 1.
  - Check this cut: OK — song 201.87 s 48 kHz decodes; 20 of 20 files open and decode (25 frames decoded at cut entries); 47 shots tile 3:21.87; every shot plays its own selection (19 selected footage, 27 synced take, 1 empty); 10 file lengths agree; AI/B-roll only on own shots; 46 cuts at 2019 moments; performance on the song clock at 1588 moments, furthest 0 ms; 13 returns to the take; holds; no backwards; player holds each shot's own file link (4 + song).
  - LIVE player check SKIPPED: "this browser window is not on screen — a browser does not load video or sound in a window that is not shown". The Chrome window on Fendi's Mac was minimised/hidden from ~20:48 (visibilityState hidden; closing and reopening the tab group did not change it). So actual playback was not WATCHED in this run; the contact sheet frames (read from each shot's own file at the cut's moments) were.
  - Contact sheet: 39 opens whole-figure in the pool with unlit ball → mid: dark, ball lit, points of light → close: thighs-up, lit. 40 sneakers stepping on the runway beside the edge line, same pool/ball/chairs. 41 whole-figure in the pool, pushing in. 42 chest-up under the pool ×2 → dark, ball lit, points, silhouette.

## 21:00–21:30 UTC
- f4cf7a6 published (closing-move framing). RETEST of c035 submitted 21:08:50 (job ec18f5ac, same beat at 1.90 s, new framing sentence in the prompt), tab away at once.
  - Server tick 21:09:00 → provider answered status "failed": "Your credit balance is too low to complete this request. Please top up your balance and try again." Finalized 21:09:01 by the server. NOT CHARGED. → Higgsfield is out of credits too. No further paid generation is possible without a top-up (not allowed in this run). The framing fix and a third timing measurement are therefore UNVERIFIED against the provider.
  - DEFECT: the job's error_text was just "failed"; the provider's sentence sat in response_payload_json.providerMetadata.error. → failureReason() on server (_shared/jobProgress.ts) and client (worldBatch/runner.ts, browserDeps.ts), parity test with the real envelope.
- Route evidence: ROUTE_TEMPORAL.seedance_ref.evidence = two errors (−1.02, −0.94); timingSaid() replaces "has not been measured" in the beats editor and the restage confirm. measured stays false (it means "keeps to time").
- Local harness caught a player glitch: a video that plays to its own end a few hundredths ahead of the song was asked to play() again and restarted at 0 for one tick (take's first frame flashed at the take's end, 191.19 s). → media.ts videoTick (pure, tested); harness PASS after.
- Astra second opinion on shots 39–42 (14 frames, $0.15 actual vs $0.54 estimate): "Good, with shots to fix".
  - 39: opens small and full-length, reaches thighs-up only at the close (same as measured; wording fixed, unverified).
  - 40: sneaker reads empty / disconnected from a leg until late (Kling).
  - 41: full-length throughout (pre-fix "wide" wording), repeats 39's composition.
  - 42: the cue happens, but the state is a bright disco room (both edge strips still lit, luminous ball, rays), not the treatment's ice-only blackout — the DIAMOND_DISCO_LIGHT entity's own words ask for the ball's points of light; the treatment's hook asks for less. A creative mismatch between the lighting state as written and the treatment, not a transport defect.
- SPEND (list): 0.14 + 0.14 + 0.35 + 3.70 + 5.55 + 3.70 + 0.15 (Astra) = $13.73, plus treatment/scene writer calls (cents, not recorded client-side). Failed retest: $0.
