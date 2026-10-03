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
