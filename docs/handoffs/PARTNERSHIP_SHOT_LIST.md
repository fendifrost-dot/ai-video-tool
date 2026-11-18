# Partnership / Cease & Desist: lyric-by-lyric shot list, v1 (18 Nov 2026)

Fendi, 18 Nov 2026: "we have the concept but I don't believe we built out a full lyric by lyric shot list yet."
This is that list, first draft. Every slot is a RECOMMENDATION until he marks it; his decisions are quoted. Song clock;
line numbers and best takes are from `PARTNERSHIP_TAKE_COVERAGE.md`. Whole-video state: `PARTNERSHIP_SCENE_MAP.md`.

## Decided by Fendi, 18 Nov 2026 (binding)

- "any shot of me in the room gets a clothing swap" (takes A-E: looks A Polo Bears, B black puffer, C suede bomber).
- "I have a few shots I just added of me in the car rapping you can keep the jacket on me there" (T7 `car shots/`).
- "I don't have a picture of allens lexus so we will have to generate it."
- Allen: "we need to generate him. Once we get his likeness together we may or may not swap his outfit as well but
  anything ralph lauren on him is perfect maybe a different polo bear sweater from the site no button up underneath
  color and style doesn't matter." His likeness comes only from the 20 photos (T7 `storm_scene/allen_photos/`).
- "allen scenes in the second half of the video are non existent the entire scene is me weathering the storm while
  memories and debris are flying past me the scene is built on vfx and intensity of imagery."
- The car shots "add a little more flavor to the video and give direction of the film grained look i'm going for".
- Grokbot builds the second half while the first half is made; he expects that to take Grokbot at least a day.

## The car takes (VERIFIED: ffprobe, and audio onsets against the master; T7 `work/car/sync.json`)

4K, 24 fps, widescreen, inside his Lexus (red seats, wood-and-leather wheel), at night. CORRECTED by Fendi, 18 Nov 2026
(an agent had called them portrait): "The phone isn't upright some of the visibility is blocked purposely for the aesthetic.
All of the shots are widescreen." Use them exactly as they play: no rotating, no straightening, no cropping out the wheel
or the dash. "All of the car shots are first verse only if anything ran over it just ran over it's not meant to go to the
second verse."
| Clip | Length | Song time | What it is |
|---|---|---|---|
| IMG_6462 | 2:13 | 0:04-2:16 | full first half (use to 1:47 only) |
| IMG_6465 | 1:42 | 0:03-1:45 | full first half |
| IMG_6466 | 1:44 | 0:03-1:47 | full first half |
| IMG_6467 | 1:44 | 0:03-1:47 | full first half |
| IMG_6455 | 0:12 | not synced (peak ratio 1.09) | insert: the Lexus radio and dash, no performance |
VERIFIED (ffprobe): the files are 3840x2160 and some carry a phone rotation tag of -90 (the phone was tilted, so its
sensor tagged the clip as upright). The tag is wrong for these: read them with `ffmpeg -noautorotate` so they stay
widescreen as he shot them. The agent's first contact sheet honoured the tag, which is why he looked sideways in it.
No best-take-per-line scoring yet. IMG_6462's footage after 1:47 is overrun, not material.

## First half, 0:00-1:47

Sources: ROOM = takes A-E with a look swapped on and a new place behind him; CAR = the car takes as shot, jacket on;
ALLEN = generated from his photos; PHOTO = their real photographs.

| Song | Lines | Lyric | Picture | Source |
|---|---|---|---|---|
| 0:00-0:07 | intro | - | the Lexus dash and radio, then the two Lexuses nose to tail at night | CAR insert IMG_6455; generated cars (his real one, Allen's generated) |
| 0:07-0:15 | 0-4 | Back to back Lexus ... you can still smell the leather | him rapping at the wheel; the red leather on "smell the leather" | CAR |
| 0:15-0:18 | 5-6 | My partner Allen / Had it automatic | Allen in the passenger seat, riding | ALLEN (passenger seat) |
| 0:18-0:25 | 7-13 | Flip through green ... Ralph Lauren fanatic ... tax brackets | him in the Polo Bears look; "them days we ain't have it" on their old photos | ROOM look A; PHOTO |
| 0:25-0:30 | 14-16 | Carbon fiber ... Wood grain car feel like a cabinet | the wheel and wood grain, him at the wheel | CAR |
| 0:30-0:41 | 17-23 | All my business partners got Benz's ... ain't just an image ... no goofy dance | him, performance | ROOM look C (suede bomber) |
| 0:41-0:44 | 24 | I'm Prada like my partner still livin | him in the black Prada puffer | ROOM look B |
| 0:44-0:51 | 25-29 | Every time I put the polo on / Wishin you was here ... livin through these songs | him in Polo Bears; the empty passenger seat, then Allen in it | ROOM look A; CAR; ALLEN |
| 0:51-1:10 | 30-38 | Back to back (hook) ... like we wrestling ... blessings | the two Lexuses back to back; him and Allen standing by the cars "just like we used to take pictures"; him at the wheel | ALLEN (by the car); CAR |
| 1:10-1:16 | 39-40 | This a real nigga frequency | him, performance | ROOM look B |
| 1:16-1:23 | 41-45 | Speaking to your spirit ... see you in my dreams ... guidance shining on to me | Allen beside him in the car, light on both | ALLEN (passenger seat); CAR |
| 1:23-1:30 | 46-52 | All these clothes used to get us fly ... designer denim on | their old photos in Ralph Lauren; him in look C | PHOTO; ROOM look C |
| 1:30-1:47 | 53-55 | All this drip turn to self esteem / Clean with my partner nem' | him and Allen dressed, by the cars | ALLEN (by the car); ROOM look A |

Room time in this draft: about 45 s to swap (about $31 at $0.68 per second, before re-rolls). OPEN (his): the place
behind him in the room shots; nothing is named yet.

## Bridge and war cry, 1:47-2:08

| Song | Picture | Source |
|---|---|---|
| 1:47-2:03 | OPEN (his): 16 s with no lyrics. Not the car takes: they are first verse only | - |
| 2:03-2:08 | "Yo yo yo yo": the war cry, then the cut to the street | WAITING ON FENDI: the close-up yell take is not shot yet (18 Nov: "I didn't do the close up yell take yet"). Until then the line exists only in the trench-coat takes (S5 best) |

## Second half, the storm, 2:08-3:51 (103 s). No Allen. He stands still; the storm builds; memories and debris fly past.

| Song | Lines | Lyric | Storm level | Picture | Still |
|---|---|---|---|---|---|
| 2:08-2:16 | 58-60 | Ralph umbrellas for the rain | 1 start | full figure, far down the street | HAVE `599baa06` (approved) |
| 2:16-2:24 | 61-63 | Range Rover sport ... Fendi bucket hat for the brain | 1 | knees-up (the hat line) | HAVE `1ff8f4c2` |
| 2:24-2:32 | 64-70 | Before we would splash in these foreigns ... pull you back up out the grave | 1 to 2 | the empty street, debris and their photographs blowing through | NEED: street without him |
| 2:32-2:41 | 71-78 | Just talked to your mama ... it's been a decade ... too hard to let go | 2 building | full figure | HAVE `854e8157` |
| 2:41-2:50 | 79-86 | All the challenges you overcame ... bullet holes all in your frame | 2 | knees-up, storm building (never a white Challenger in frame: project notes) | NEED |
| 2:50-2:57 | 87-92 | Fight through life with disdain / Lost my day one ... heavy price for this pain | 3 peak | full figure, a car and a tree in the air | NEED |
| 2:57-3:04 | 93-99 | Four years ago almost lost my life ... gun to my head replaying | 3 peak | knees-up at the peak | HAVE `71032b16` |
| 3:04-3:12 | 100-107 | I'm here for a purpose ... no man knows his day | 3 | the street tearing apart, without him | NEED: street without him, peak |
| 3:12-3:27 | 108-113 | We all on the list ... we all get a cease and desist | 4 the wind drops | full figure, the storm passing, debris settling, him unmoved | NEED |
| 3:27-3:51 | tail | - | 4 after | knees-up, calm, rain only; the end frame | NEED |

Have 4 of 10 stills. The 6 to make are all inside the proven envelope (him facing the camera, full figure or knees-up)
or have no person in them: about $1.62.

Motion (ESTIMATE, to be proven): each still becomes one Seedance clip of 6 s ($3.33). Ten clips cover 60 s at full
speed; the 103 s is reached by running the storm slowed (it is a hurricane seen in slow motion) and by Grokbot's memory
and debris layers over the two empty-street slots. Ten clips: about $33. NOT PROVEN: Seedance holding his face from a
still, and how slowed footage looks; one test clip ($3.33) on the approved still settles both before the rest is bought.
Second half in all: about $38 if the test passes first time.

## What Grokbot gets for the second half (after the test and the clips)

The ten clips with song times as above, the lyric times, the master, the 20 photos of him and Allen for the memory
layers, the storm levels per slot, and the film-grain reference (the car takes). Handoff format: build skill §5.

## Stills made for the second half, 18 Nov 2026 (T7 `storm_scene/plan_b/shotlist/`)

| Slot | Still (Gemini asset) | With his real face | State |
|---|---|---|---|
| 2:24-2:32 empty street, early | `6d486b10` | - | REJECTED: bright sky, made-up snapshots. To redo |
| 2:41-2:50 knees-up, building | `b04300eb` | `storm_05_knees_building_realface.jpg` (face 119 px, proof 0) | posted |
| 2:50-2:57 full figure, peak | `e0e54d9f` | `storm_06_full_peak_realface.jpg` (61 px, proof 0) | posted |
| 3:04-3:12 empty street, peak | `442b853d` | - (`storm_08_street_peak_no_person.jpg`) | posted; it has two small made-up snapshots near the camera: Grokbot covers or crops them |
| 3:12-3:27 full figure, storm passing | `b9e55272` | `storm_09_full_passing_realface.jpg` (81 px, proof 0) | posted |
| 3:27-3:51 knees-up, end frame | `e6cf1dac` | `storm_10_knees_end_realface.jpg` (120 px, proof 0) | posted; a faint trace of Gemini's glasses rim beside his |
Settings as in the method plan's envelope table. 9 of 10 slots now have a still. To animate a still with `montage-shot`
continuous: file a copy under `worlds/scene_*` with `metadata_json.lane = world_still` and `scene_title` = the scene's
name, newest first (the function takes the newest `worlds/scene_*` of the scene as `@Image1`); dry-run and read `plate.id`.
