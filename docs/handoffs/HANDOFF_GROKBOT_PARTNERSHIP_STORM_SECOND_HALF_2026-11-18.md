# Handoff to Grokbot: Partnership / Cease & Desist, the storm (second half), 18 Nov 2026

Fendi, 18 Nov: "If you think we have generated enough stills to fill the entire second half of the song then we can
build that out and have grokbot start working on it now and then we can come back to building the first half while
grok bot works." This page is that handoff. Start on the ACCEPTED slots; the PICK slots (made, not yet judged by him) are
marked. Every slot now has a clip. Detail behind every row: `PARTNERSHIP_SHOT_LIST.md`.

## What the second half is (his words)

- 17 Nov: "STANDING STILL as the world around me is chaos more debris as the verse progresses flying cars and trees
  flying pass me. I need to be scaled down and placed further back into the scene and not at the forefront ... We are
  going for raw emotion, pain ... me keeping my composure through the storm while disaster and turmoil around me."
- 18 Nov: "allen scenes in the second half of the video are non existent the entire scene is me weathering the storm
  while memories and debris are flying past me the scene is built on vfx and intensity of imagery."
- 18 Nov: "remember we are going for photo realism not cgi some of these images can past for cgi or cartoons so make
  sure we express that."
- 18 Nov, on the car takes: they "give direction of the film grained look i'm going for".

## Clocks

- Song clock = the master: T7 `PARTNERSHIP:CEASE & DESIST AVT Edit/PARTNERSHIP - CEASE & DESIST MASTER  - 11.15.26.wav`,
  230.909 s, 48 kHz 24-bit stereo, md5 `927549f0f4f202a779b7430ba3731841`. The cut starts at song 0.000: no offset.
- File clock = each clip's own time, 0.000 to 6.042 s (145 frames, 24 fps, 1280x720, no audio). The clips are b-roll:
  nothing in them is synced to a word, so `src_in` is the cutter's choice inside the clip.
- Slot boundaries are the lyric line starts (`PARTNERSHIP_TAKE_COVERAGE.md`, machine copy T7 `work/performance/coverage.json`).
- Delivery: 16:9, 24 fps (Fendi, 16 Nov: "I want to actually post this one on YouTube and run it as a single").

## The slot table

Clips: T7 `PARTNERSHIP:CEASE & DESIST AVT Edit/storm_scene/plan_b/animated/`. AVT copies: bucket `project-clips`,
project `0c5c4421-1298-4919-bf62-2764ce7837fa`, asset id in the row.

| Slot | Song (s) | Length | Lyric | Storm level | File (T7 name, md5) | Asset | Beat shown | Status (Fendi's words) |
|---|---|---|---|---|---|---|---|---|
| S01 | 127.9-136.5 | 8.6 s | Ralph umbrellas for the rain | 1 start | `storm_s01_full_start.mp4` `29eeb4b6` | `581fe3ff-ed7e-4c49-b8cb-efe5567b13e5` | full figure, centre, light debris | ACCEPTED: "Looks good as is." |
| S02 | 136.5-143.6 | 7.1 s | Range Rover sport ... Fendi bucket hat for the brain | 1 | `storm_s02b_full_start.mp4` `2e324705` | `d79c8fc2-9285-4719-90ae-56835331d788` | full figure, right of centre; knees-up by punch-in (the hat line) | ACCEPTED: "ok it's fine now" |
| S03 | 143.6-152.2 | 8.6 s | Before we would splash in these foreigns ... pull you back up out the grave | 1 to 2 | `storm_s03_street_early_no_person.mp4` `fb41febc` | `9b73b15b-109c-45e6-a030-5cc9ece3cfec` | the empty street, rubbish, a trash can and a branch blowing through; their photographs are yours to add | PICK (never judged) |
| S04 | 152.2-161.5 | 9.3 s | Just talked to your mama ... too hard to let go | 2 building | `storm_s04_full_building.mp4` `832d2570` | `ca645fd0-ef85-479f-a188-9926c33a95a9` | full figure, right of centre, branch, umbrella, cone, trash can | ACCEPTED: "S04 perfect" |
| S05 | 161.5-170.4 | 8.9 s | All the challenges you overcame ... bullet holes all in your frame | 2 | `storm_s05b_full_building.mp4` `d5a3a5e1` | `ca0c73d9-108b-48a7-8848-c4dd76e65381` | as S04, a second take; knees-up by punch-in | ACCEPTED: "ok it's fine now" |
| S06 | 170.4-176.6 | 6.2 s | Fight through life with disdain / Lost my day one ... | 3 peak | `storm_s06_full_peak.mp4` `10543332` | `3bce8d34-600c-4e35-a01a-70e1bc09d851` | full figure, a sedan and an uprooted tree in the air | ACCEPTED: "s06 looks good" |
| S07 | 176.6-183.4 | 6.8 s | Four years ago almost lost my life ... gun to my head replaying | 3 peak | `storm_s07_knees_peak_cropped.mp4` `059b7d60` | `a6e8a1a7-8f93-4f1d-a38d-040dbbed2886` (uncropped) | knees-up, sedan and tree in the air | PICK (never judged) |
| S08 | 183.4-192.5 | 9.1 s | I'm here for a purpose ... no man knows his day | 3 | `storm_s08_street_peak_no_person.mp4` `0b1e3c72` | `ad79f9f7-2ce5-4e1c-827d-cff541de8f70` | the street tearing apart, nobody in it | PICK (never judged) |
| S09 | 192.5-207.5 (ESTIMATE: the last line starts 206.0) | 15.0 s | We all on the list ... we all get a cease and desist | 4 the wind drops | `storm_s09_full_passing.mp4` `c122d95a` | `15072cc9-c961-451f-9c1d-2baf0795a625` | full figure, debris settling, the sky clearing | PICK (never judged) |
| S10 | 207.5-230.9 | 23.4 s | tail, no lyrics | 4 after | `storm_s10_knees_end.mp4` `1bdf934d` | `e2bd9e12-1104-438a-817f-926230b5771b` | knees-up, calm, rain only: the end frame | PICK (never judged) |

Extra material: `storm_s07_knees_peak.mp4` `d165c2c3` is S07 before the crop (a small tripod is drawn between his legs at
the bottom edge: never use it uncropped). REJECTED, do not use: `storm_s02_knees_up.mp4`, `storm_s05_knees_building.mp4`
(Fendi: "pants are baggy shoes aren't consistent and have red laces"; "looks extremely fake").

## What each clip needs from you (OBSERVED on the files)

- **Length.** Every slot but S06 is longer than its 6.04 s clip. ESTIMATE of the speed that fills each: S01 70 %,
  S02 85 %, S03 70 %, S04 65 %, S05 68 %, S06 97 %, S07 89 %, S08 66 %, S09 40 %, S10 26 %. A hurricane reads well slowed; S09
  and S10 are too long for one slowed clip, so they need a second framing (punch-in), a held end frame with live rain
  over it, or his word on a shorter tail.
- **Debris runs out.** In every clip the debris is thick for about 3 s and has blown away by the last 2. Add debris of
  your own so the storm builds across the verse (level 1 light, 2 building, 3 peak, 4 dropping) instead of thinning.
- **Knees-up.** He is small and further back by his own brief. A knees-up punch-in is a 2.3x enlargement of a 720p
  frame on S02, S04, S05 (soft; a short cut, not a held shot) and about 1.6x on S01.
- **Resolution.** The clips are 720p. Scale them with a plain resampler. See the rules on his face.
- **Per clip.** S02: the spray turns to haze in the last second. S04, S05, S06: his lips read slightly pink and parted,
  steady (not moving); do not push in on the face. S03: no snapshots in it by design (the first still's made-up
  ones were the reason it was remade): this is the slot for their real photographs; the trash can near 2 s is clean
  and sharp: add blur or cover it. S08: two small made-up snapshots near the camera in the first
  second: cover or crop them. S09: the sky goes from black to bright within 6 s: slow it or grade the change down.

## Memories and debris (yours to build)

- Memories take a physical form: printed photographs of him and Allen carried on the wind, at different depths, with
  motion blur, catching the street light. Never glowing, never a hologram, never floating flat to the camera.
- The 20 photographs of Allen: T7 `storm_scene/allen_photos/img/`. Use them as they are; never redraw Allen's face.
- Never a white Challenger anywhere in frame (project notes).
- The wind blows from behind the camera, past him, away down the street (Fendi, 16 Nov: "Front to back").

## Rules

1. His mouth never moves in this half. No lip-sync, no face-altering pass, no upscaler or "enhance" that redraws his
   face: mask his head out of any such pass.
2. Photoreal, not CGI. Every clip gets a real-camera finish matched to the car takes (T7 `car shots/IMG_6462.MOV`,
   `IMG_6465`, `IMG_6466`, `IMG_6467`; their phone rotation tag is wrong, they are widescreen): their grain, softness
   and contrast. Motion blur on everything you add. No glow, no clean vector shapes, no lens flares that were not there.
3. No Grok generation on anything that ships. No new generated footage of him at all: ask for a clip instead.
4. Slot boundaries are the lyric times above. Audio is the master, untouched.
5. Nothing before 127.9 s is in this handoff (the first half and the war cry at 2:03 are still being built).
6. Never replace an ACCEPTED clip with another; treat it (speed, crop, grade, layers) and say what you did.

## Verification (run before sending anything back)

- The section is 127.9 to 230.909 s: 103.0 s, 2,472 frames at 24 fps (2,471 or 2,473 is a rounding difference; more is
  an error).
- Audio: the delivered file's audio against the master at offset 0: identical samples, or state the codec used.
- One frame that must change: any frame of S04 after its 4th second (debris added where the street had cleared).
- One frame that must not change: his head in S01 (same pixels as the source after your scaling and grade, no redraw):
  post a 4x crop of it beside the source.

## Deliverables

- The second-half section as one file (with the master's audio for that stretch) and as separate slot files.
- A change log: slot, frames, speed, crop, layers, grade.
- Before/after strips for every slot.
- What you skipped and why, by slot.
