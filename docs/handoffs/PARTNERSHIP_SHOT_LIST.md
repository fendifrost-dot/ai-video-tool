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

## Motion test, 18 Nov 2026 (job `c0d30173`, asset `581fe3ff`, $2.77 for 6 s, T7 `storm_scene/plan_b/motion_test/`)

`montage-shot` continuous, `withHim: false`, camera "locked off", `@Image1` = the approved still (`ba01451b`), his three
face photos and the coat and hat as pictures after it. MEASURED on the clip (1280x720, 24 fps, 145 frames):
- His mouth is at rest: `mouth_scan.py` lip gap mean 0.075, spread 0.016, face found on 36 of 36 samples (moving is
  mean > 0.08 AND spread > 0.03).
- He does not float: his nose stays within 3 px across the clip (at 1920 wide).
- No snow, although the function still appends YSL's "cold blue winter dusk ... snow" line: the action text's "the only
  thing falling is rain" held this time. The line still needs removing from the function (Lovable edge redeploy).
OBSERVED, not a pass or fail:
- Seedance RE-FRAMED the picture: the still is a reference, not the first frame. He stands in the middle of the road,
  further back and smaller than in the still (his face about 28 px wide at 720p), the camera lower.
- At 28 px his face cannot be judged as his or not his: it is a dark face under the brim that stays the same on every
  frame. The real test of his likeness in motion is a knees-up clip (his face about 60 px at 720p).
- Output is 720p; the master needs an upscale or a 720p finish.

**Fendi, 18 Nov, on the motion test: "Looks good as is."** DECISION: this is the look for the animated storm stills.

**Knees-up from the same clip, $0 (Fendi: "Couldn't we create the knees up shot without regenerating anything").** Yes:
`ffmpeg -vf "crop=784:440:248:146,scale=1280:720:flags=lanczos"` on the test clip →
`storm_v1_motion_test_knees_crop.mp4` (same folder). MEASURED: he stands 485 px tall in the 720p frame (hat top y 201,
feet y 685), so a knees-up cut is a 1.64x enlargement (440 real lines shown as 720; 2.45x for a 1080p master). His
face is about 50 px wide in the cut, the same on every frame, mouth closed. OBSERVED: softer than the full frame,
readable under rain. RECOMMENDATION: animate each still once as a full figure and let the cutter punch in to knees-up
where the lyric wants it (two framings from one paid clip); a knees-up meant to hold the screen for a long line is
better made from a knees-up still (sharper).

## PHOTOREAL, NOT CGI (Fendi, 18 Nov 2026, while the clips rendered)

"And remember we are going for photo realism not cgi some of these images can past for cgi or cartoons so make sure
we express that." DECISION (his): this goes into the words of every request from here on, to Gemini, to Seedance and to
Grokbot, and every picture is judged for a CGI or cartoon look before it is sent to him.

The eight clips below were already submitted when he said it; their wording did not say it (the function's own closing
line says "cinematic and grounded"). Wording to lead every request with from now on:

> Real footage, not a render: filmed on a real camera on a real street in a real storm, like news or documentary
> footage. Natural colour as the camera recorded it, available light only, real motion blur on anything moving fast,
> slight lens softness and grain, imperfect framing. Nothing looks computer-generated, illustrated, painted or like a
> video game.

For Grokbot: every storm clip gets a real-camera finish matched to the car takes (their grain, softness and contrast),
motion blur on the debris he adds, no glow, no clean vector shapes.

## The eight storm clips, 18 Nov 2026 (T7 `storm_scene/plan_b/animated/`, 1280x720, 24 fps, 145 frames each, $2.773 each)

Same request as the approved test (`montage-shot` continuous, 6 s, camera locked off, `withHim: false`, his three face
photos + coat + hat), the action changed per still for its storm level. Stills filed for it as `worlds/scene_storm_sNN_*`.
MEASURED with `mouth_scan.py` (6 samples a second; moving is gap mean > 0.08 AND spread > 0.03):

| Song | Clip (job → asset) | File | Mouth (gap / spread) | Face in the 720p file | Head drift | OBSERVED |
|---|---|---|---|---|---|---|
| 2:16-2:24 | `017b2a05` → `8ebb1a4a` | `storm_s02_knees_up.mp4` | 0.036 / 0.022 at rest, 36/36 | 53 px | 4 px | came out a full figure, not knees-up; reads mostly real |
| 2:32-2:41 | `eb44c844` → `ca645fd0` | `storm_s04_full_building.mp4` | 0.104 / 0.020 at rest, 31/36 | 33 px | 2 px | lips pink and a little parted on every frame (steady, not moving); big sharp newspapers by the lens |
| 2:41-2:50 | `da0ff0d1` → `02c928bf` | `storm_s05_knees_building.mp4` | 0.044 / 0.014 at rest, 36/36 | 51 px | 3 px | came out a full figure; reads mostly real |
| 2:50-2:57 | `af444bea` → `3bce8d34` | `storm_s06_full_peak.mp4` | 0.099 / 0.014 at rest, 29/36 | 33 px | 3 px | lips pink and a little parted; a sedan and a tree hang in the air: reads CGI |
| 2:57-3:04 | `c155ef8c` → `a6e8a1a7` | `storm_s07_knees_peak_cropped.mp4` | 0.033 / 0.014 at rest, 36/36 | 63 px | 2 px | knees-up kept; Seedance drew a small TRIPOD between his legs at the bottom edge (the word was in the camera line): cut out with `crop=1216:684:32:0` then back to 1280x720 ($0); sedan and tree in the air in the first half: reads CGI there |
| 3:04-3:12 | `6f501529` → `ad79f9f7` | `storm_s08_street_peak_no_person.mp4` | no person | - | - | sedan and tree in the air, two made-up snapshots: first half reads CGI |
| 3:12-3:27 | `c6e2f8dd` → `15072cc9` | `storm_s09_full_passing.mp4` | 0.077 / 0.012 at rest, 36/36 | 41 px | 4 px | the sky goes from black to bright in 6 s (reads like time-lapse); lips a little pink |
| 3:27-3:51 | `6da7b3e1` → `e2bd9e12` | `storm_s10_knees_end.mp4` | 0.021 / 0.008 at rest, 36/36 | 63 px | 3 px | knees-up kept; calm, rain only; the most like a photograph, but skin and coat are smooth |

OBSERVED on all eight: no snow; coat and hat correct; the debris is thick for the first 3 seconds and has blown away by
the last 2 (nothing new comes in), so the usable storm is the first half of each clip unless Grokbot adds debris; the
picture is clean, sharp and graded blue with orange lamps, which is part of the CGI read.
NEVER AGAIN: the word "tripod" in a camera line (say "the camera does not move").
Head sheet: `storm_clips_head_checks.jpg`. Per clip: `<name>_tile.jpg`, `<name>_heads.jpg`, `<name>_mouth.csv`.
OPEN (his): whether the peak keeps cars and trees in the air (his 14 Nov brief has cars blowing past) or only what a
real storm lifts. Re-making one peak still and its clip is $0.27 + $2.77.

## Fendi's word on the first four clips, 18 Nov 2026

"S02 pants are baggy shoes aren't consistent and have red laces. Should be slim prada Americas cup . S04 perfect, S05
looks extremely fake and same issue with pants and shoes, s06 looks good" and "Lower body pants and shoes perfect on
s04 and s06".

| Clip | His word | Filed |
|---|---|---|
| 2:16 `8ebb1a4a` (s02) | pants baggy, shoes wrong with red laces | rejected |
| 2:32 `ca645fd0` (s04) | "perfect" | approved |
| 2:41 `02c928bf` (s05) | "extremely fake", same pants and shoes | rejected |
| 2:50 `3bce8d34` (s06) | "looks good" | approved |
| 2:57, 3:04, 3:12, 3:27 | no word yet | pending |

VERIFIED cause: the two approved clips were made from FULL-FIGURE stills, where Gemini had already drawn the slim black
jeans (`df104591`) and the black America's Cup sneakers (`a4eaa2da`) from the wardrobe pictures. The two rejected clips
were made from KNEES-UP stills with no legs or shoes in them; Seedance framed him full figure anyway and drew its own
(baggy trousers, shoes with red laces), and it stood him large at the front, against his 17 Nov brief ("scaled down and
placed further back into the scene and not at the forefront").
DECISION (mine, from that evidence): animate full-figure stills only; a knees-up framing is cut from the clip
(`crop`, $0), as he proposed. The s04 request is the one to repeat word for word.
WITHDRAWN: my open question on cars and trees in the air. His 17 Nov brief asks for "flying cars and trees flying pass
me" and he called s06 good. My "reads CGI" on s06 was my reading, not his.
TO REDO (needs his OK, $2.77 each): 2:16 from the approved full-figure still `ba01451b`, 2:41 from the s04 still
`445fcefb`, both with the s04 request.

## The two redos, 18 Nov 2026 ($2.773 each; Fendi: "Use whatever methodology is most consistent with the results we desire. Im no here to micromanage I only interject when we don't follow proven methods and start wasting money when we don't have to")

Method unchanged from what he approved: a full-figure still, the same request words, nothing added.

| Song | Still → clip | File | Mouth (gap / spread) | Face in the 720p file | Head drift | OBSERVED |
|---|---|---|---|---|---|---|
| 2:16-2:24 | approved still `13189dcd` + the approved test's words → job `f86b6941` → `d79c8fc2` | `storm_s02b_full_start.mp4` | 0.097 / 0.027 at rest, 33/36 | 33 px | 7 x 10 px | slim black trousers, all-black shoes, small and further back; the spray thickens to a haze in the last second |
| 2:41-2:50 | S04 still `6869fade` + S04's words → job `0a8000c4` → `ca0c73d9` | `storm_s05b_full_building.mp4` | 0.107 / 0.027 at rest, 27/36 | 33 px | 2 x 2 px | slim black trousers, all-black shoes; lips pink and a little parted, steady (as in S04) |

Legs and shoes against S04: `storm_redo_legs_check.jpg`. Knees-up cuts, $0: `*_knees_crop.mp4`
(`crop=560:316:516:238,scale=1280:720`): a 2.3x enlargement because he stands further back, so they are soft; usable
for a short cut, not a held shot. Both clips are pending his word.

**Fendi, 18 Nov, on the two redos: "ok it's fine now".** Filed approved: 2:08 `581fe3ff`, 2:16 `d79c8fc2`, 2:32
`ca645fd0`, 2:41 `ca0c73d9`, 2:50 `3bce8d34`. Never judged: 2:57, 3:04, 3:12, 3:27. Missing: 2:24 (empty street, early
storm). The cutter's page for the second half: `HANDOFF_GROKBOT_PARTNERSHIP_STORM_SECOND_HALF_2026-11-18.md`.

## The missing 2:24 slot, 18 Nov 2026 ($3.04; Fendi: "Yes, make it")

| Song | Still → clip | File | OBSERVED |
|---|---|---|---|
| 2:24-2:32 | new still `4ea26daf` (prompt `storm_shotlist_v2_photoreal`; filed for animation as `55c4cdb9`) → job `c6d5df32` → `9b73b15b` | `storm_s03_street_early_no_person.mp4` (md5 `fb41febc`), still `shotlist/storm_03_street_early_no_person.jpg` | nobody in it, no snow, no snapshots, the framing held (building patch first vs last frame: 2.3 of 255); newspaper, leaves, a rolling trash can, a branch that lands on the road; the trash can near 2 s is clean and sharp |

What changed from the rejected still `6d486b10`: the request leads with the "real footage, not a render" wording, fixes
the sky ("as dark as in the reference or darker"), lists ordinary street rubbish only and never mentions snapshots
(naming them, even as "too small to show a picture", is what drew them). The clip's camera line says "the camera does
not move at all" with no "tripod". The render took 18 minutes against 5 to 10 for the others; the job stayed "running"
with no error and was not resubmitted. All ten slots now have a clip; five are his ACCEPTED, five are pending his word
(2:24, 2:57, 3:04, 3:12, 3:27).

## The memory photographs, people only, 19 Nov 2026 ($0.72; Fendi: "All the images need to be masked so just the people are in the shots. Please use the verified masking method")

READING (mine): "the images" are the 20 photographs of him and Allen that blow through the storm, not the storm clips.
Method: PROBLEM_INDEX "Him + a creature/prop": `matte-video-proxy` (veed) as delivered, as on the figure v2a (job
`25829df9`). Each photo held as a 2 s clip (short side scaled up to 1080 with Lanczos when smaller), one matte job
each, the middle frame of the matte as alpha over the photo's own pixels: `scripts/edit/photo_people_cutout.py`
(`clip`, `cut`). One test first (m04, `cc04dd8b`), then the other 19. Nothing done to the matte afterwards.
- Result: T7 `storm_scene/memory_cutouts/` (20 transparent PNGs, `mattes/`, `memory_cutouts_overview.jpg`); AVT
  `project-references/.../memories/cutouts/`. Clips and jobs: T7 `work/allen/people_cutouts/` (`manifest.tsv`,
  `asset_ids.json`, `jobs.json`); the 2 s clips are `project_assets` rows under `memories/` in `project-clips`.
- OBSERVED, all 20 looked at over grey and black: 19 usable. WEAK: 14 (tiny club photo, the back man's head fades
  out). Small or soft: 7, 19. 6 kept the event's caption lettering across the bottom of the group: CROPPED OFF at his
  word ("Crop the lettering out if it's from a caption"; "Some of these are pulled straight from instagram"), rows
  0-519 of the cut-out kept, the uncropped one stays in T7 `work/allen/people_cutouts/cutouts/`; all 20 then checked
  for Instagram lettering, none left. 2, 11, 13 keep
  parts of bystanders at the edges. Per-photo notes: the Grokbot handoff's table.
- NOT TRIED: re-running 14 from a tighter crop of the photo (3.6 cents); his word first.

## Allen's likeness: who he is in each photo, 19 Nov 2026 (WAITING ON FENDI)

Fendi, 19 Nov, on the first cut-out (memory photo 4, IMG_1758): "Allen is the one in the blue polo we'll have to compile
the images of him to create his likeness". Filed: `continuity_entities` `ALLEN` (`7e5ffb08`, his words in it).
- RULE: who Allen is in a photo is Fendi's word. No agent picks him out by matching faces.
- Every person in the 20 photos is lettered left to right on T7 `work/allen/who_is_allen_sheet.jpg` (points:
  `work/allen/people_cutouts/people_points.json`, tool `work/tools/letter_people.py`). Known so far: 4A.
- Once he names the letters: crop Allen from each photo (his own pixels, no upscaling by a model), pick the clearest
  for face-on, three-quarter, smiling and full figure, file them as `ALLEN`'s reference pictures, then the two test
  stills (Gemini, about $0.54, not yet approved).

**Fendi, 19 Nov: "There's got to be a better way than having to go picture by picture to identify him." / "Yes, the 7 solo
photos are him." / "The photos range from a span of 15 years".** DECISION (mine): the likeness needs only the seven solo
photos and the blue-polo man of photo 4; the group photos are not needed and nobody goes through them.
- Reference set, $0: T7 `work/allen/reference_set/allen_ref_01..08_*.png` (his real photos, white borders trimmed,
  photo 4 cropped to him, no upscaling), sheet `allen_reference_set_sheet.jpg`; AVT `project-references/.../cast/allen/`,
  rows in `asset_ids.json` there, all eight on `ALLEN.reference_asset_ids`. Clearest: 01-06; 07 yellow cast; 08 tiny.
- The 15 years matter: references from different ages blend into a man of no age. OPEN (his): which Allen the film
  shows (my RECOMMENDATION: the latest look, with the older photos as support for the bone structure only), and
  which of the eight are the latest. OBSERVED from the files only, not from his face: 03, 04, 05, 06, 08 are small
  old-phone pictures (406 to 1280 px, no filter); 01, 02, 07 are later phone / Instagram pictures.
- Test stills NOT made. Dry run of the first (prompt `allen_likeness_v1`, six references as `cast`, 16:9, 2k):
  accepted, $0.27. Two stills $0.54: waiting for his go and the age answer.

## Allen likeness test v1, 19 Nov 2026 ($0.54; Fendi: "Younger" / "You are correct in your assumption" / "And proceed")

DECISION (his): the film shows the YOUNGER Allen. His confirmation covers my reading of the files: references 03, 04,
05, 06, 08 are the younger photos; 01, 02, 07 are later and are NOT sent with a younger-Allen request.
| Test | Job → asset | References (`cast`) | File (T7 `work/allen/likeness_test_v1/`) | OBSERVED |
|---|---|---|---|---|
| A waist up, facing the camera | `e43a887b` → `6cc81452` | 05, 06, 03, 04 | `allen_likeness_a_waist_up.jpg` | reads as a photograph (shallow focus, skin texture); the striped polo and thermal of ref 05 kept; bare head |
| B full figure | `ebc6183e` → `b1b29bbd` | 05, 06, 03, 04, 08 | `allen_likeness_b_full_figure.jpg` | reads as a photograph; loose dark jeans, white sneakers; his legs look short for his torso; the chest crest is drawn differently from A |
Prompt `allen_likeness_v1_younger`: the "real photograph, not a render" lead, "the same real man shown in every
reference photograph, at exactly the age he is in those photographs", no cap, the clothes of ref 05. Head check with
his real photos above the generated heads: `allen_likeness_v1_head_check.jpg`. NOT JUDGED: whether the face is Allen
(his call; no agent judges that). Both assets `pending`.
