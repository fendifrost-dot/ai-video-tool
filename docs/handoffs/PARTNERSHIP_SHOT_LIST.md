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

## Allen: likeness by the swap method, and his wardrobe, 19 Nov 2026 ($0.27)

Fendi, on test v1: "use the methodology we use for the face swap and the clothing swap to get his likeness correct. And
we're going to change his wardrobe. I remember it should be in the notes, Ralph Lauren outfit." / "It was a Ralph Lauren
polo bear sweater that we were going to put on him." DECISION (his): Allen's face is his real photo's pixels, not a
face Gemini draws; he wears a Polo Bear sweater. Test v1 (a drawn face) is superseded, never judged.

**Wardrobe.** Polo Ralph Lauren Polo Bear Sweater, Navy (flag-sweater bear), code AI710946137001, chosen by the agent
(colour and style were left open; it does not repeat Fendi's cream one). T7 `wardrobe/10_allen_polo_bear_sweater_navy/`
(`source.txt`), flat front filed as `400b40c3`. Nothing collared under it: the maker's worn photos show a button-down,
so only the FLAT picture is sent as the garment.

**FAILED, not posted ($0): his real face pasted onto the generated test B** (`still_face_from_photo.py` +
`still_face_putback.py`, proof 0 each; T7 `work/allen/likeness_test_v1/face/`). MEASURED / OBSERVED:
| His photo | Scale onto the 125 px drawn face | Turn | Residual | What it looks like |
|---|---|---|---|---|
| ref 05 (kitchen) | 0.68 | -0.6 deg | 2.3 % | soft; a straight seam across the forehead; his eyes half closed as in the photo |
| ref 06 (red hoodie) | 2.20 (enlarged) | 1.1 deg | 1.6 % | blocky: the photo's face is about 60 px wide |
| ref 03 (white polo) | 1.58 (enlarged) | 8.8 deg | 4.0 % | wrong angle; a round seam on his cheek |
Cause: his young photos are old phone pictures (faces 60 to 190 px), none face-on at rest. RULE for Allen: a generated
still of him is framed so his face is no larger than his photo's face, and its head matches a photo's angle; otherwise
the route below.

**PASSED my check, posted: the clothing swap on his REAL photo** (skill avt-clothing-swap, "A STILL of him in a new
outfit"): ref 05 as `screen` + the flat sweater as `garment`, prompt `allen_dressed_photo_v1` (1k, 5:4, "change ONLY
what the man is wearing"; "still look like the same old phone photograph"), job `99002f42` → `d77de245`; then
`still_face_putback.py ref05 edit out`: ECC 0.903, `max |out-original| inside the hard head mask: 0` (73,582 px: his
face, cap, ear and earring are the photo's pixels). T7 `work/allen/dressed_v1/allen_dressed_polo_bear_navy_realface.png`
(1152x928), check sheets `allen_dressed_v1_check.jpg`, `allen_dressed_v1_heads.jpg`. Pending his word.
NEXT (not started): the same on a seated photo for the passenger seat (ref 03 is seated, three-quarter, 316x398), then
Allen placed in the car and by the cars as his own pixels; quote before each.

**ALLEN'S SWEATER IS THE RED MARTINI BEAR (Fendi, 19 Nov 2026: he sent the site's picture of it).** Polo Ralph Lauren
Martini Bear Sweater, Regal Carmine, code AI710B28797001: T7 `wardrobe/11_allen_martini_bear_sweater_regal_carmine/`
(his screenshot kept there), flat front `27e951ad` (approved). The navy one above was the agent's pick while the choice
was open: SUPERSEDED, do not use (`400b40c3`, `d77de245`).
Dressed v2, same method, $0.27: ref 05 as `screen` + the red flat as `garment`, prompt
`allen_dressed_photo_v2_martini_bear`, job `f44e74d5` → `3cb21b17`; `still_face_putback.py`: ECC 0.926, `max
|out-original| inside the hard head mask: 0` (73,582 px). T7
`work/allen/dressed_v2_martini_bear/allen_dressed_martini_bear_red_realface.png` (1152x928), `allen_dressed_v2_check.jpg`,
`allen_dressed_v2_heads.jpg`. OBSERVED: no collar under it, the tuxedo bear with the martini as on the product, the
picture still reads as the same old phone photo. Pending his word.

**Fendi, 19 Nov, on dressed v2: "Perfect".** Filed approved: `34bd95ac` (the real-face PNG, in `cast/allen/`), set as
`ALLEN.approved_asset_id`; the method and the Never list are on the `ALLEN` record and in PROBLEM_INDEX ("Allen's
likeness"). The navy assets are marked rejected (superseded). The cap stays as in the photo (asked; he answered
"Perfect" to the picture as it is).
NEXT, not started, to quote first: Allen in the passenger seat of the Lexus at night (lyric 0:15 "My partner Allen"),
as a Gemini whole-scene still with `34bd95ac` as the man and frames of the car takes as the place (red seats, grain),
his head at the photo's angle and no larger than in the photo (about 160 px), then his real face from `34bd95ac`
(`still_face_from_photo.py` + `still_face_putback.py`); the car takes show only the driver's side from the steering
column, so the passenger side is drawn. Then the same for him and Allen by the cars.

## Allen in the passenger seat v1, 19 Nov 2026 ($0.27; Fendi: "I'm not here to micromanage you I'm only going to interrupt when I see non verified methods")

DECISION (his): a step on a verified method is stated with its price and run, no "go" asked; a step with NO verified
method is put to him before any money (PROBLEM_INDEX rule 3).
| Step | What | Result |
|---|---|---|
| Plate, $0 | a real frame of his car take `IMG_6462.MOV` at 20 s (`-noautorotate`), cropped to the passenger side so he is not in it: `32b83244` | the empty red passenger seat, mirror, ceiling: his own footage |
| Still, $0.27 | Gemini edit of that frame (`screen`) adding Allen from `34bd95ac` (`cast`), prompt `allen_passenger_seat_v1`, 1k so his face is no larger than his photo's; job `1acdc65c` → `1c1bff38` | reads as the car footage: grain, seat belt, the bear half hidden by the belt and dash |
| His face, $0 | `still_face_from_photo.py 34bd95ac still 330,240,270,300` (scale 0.97, turn -3.1 deg, residual 1.9 %, face 159 x 192 px) + `still_face_putback.py` | `max |out-original| inside the hard head mask: 0` (21,746 px); no seam seen at 3x; his eyes are lowered as in the photo |
T7 `work/allen/passenger_seat_v1/` (`allen_passenger_seat_v1_realface.png`, `allen_passenger_seat_v1_head_check.jpg`).
Filed `100483dd` under `worlds/scene_*`; scene `df2ca262` "Lexus at night: Allen in the passenger seat" (15.0-18.5 s);
shot `allen_passenger` `b8a37e79`. Pending his word. This is why the paste works here and failed on test B: the scale
is 1 or less and the scene is as dark and soft as his photo.

**NOT RUN, no verified method: animating him.** Dry run ready (`montage-shot` continuous, `withHim: false`,
`face: false`, 6 s, $2.773, plate `100483dd`). The verified cases animate FENDI at 33-63 px faces (storm) or from his
real footage (recipe F). Allen has no footage and his face here is about 100 px at 720p, so Seedance would redraw it
on every frame with nothing but the still to hold it. Put to Fendi before spending. If run: one clip, judged by a head
strip against `34bd95ac` and `mouth_scan.py`; a drifting face is a reject, not a re-roll loop.

## Passenger seat v1 REJECTED; v3 with his whole head as his pixels, 19 Nov 2026 ($0.58)

**Fendi on v1: "His face is off use the Verified method to restore his pixels for his face."** VERIFIED cause (the
script's own print): the default mode of `still_face_from_photo.py` matched his face to the dark still by HALVING its
contrast (`Lab L ... gain 0.5`), laid the still's shading over it, and replaced only brows to chin, so the head shape,
ears, hairline and cap stayed the model's. Its "proof 0" compared the result with that altered face, not with his photo.
v1 `100483dd` is marked rejected and `usable: false`.

| Try | What | Result |
|---|---|---|
| v2, $0.31 (matte $0.036 + blend $0.27) | his whole approved photo cut out (`matte-video-proxy` job `6c738856`, as delivered; edges by the composite lane's recipe) and pasted UNSCALED over the real car frame (101,009 px exactly the photo's), then a Gemini blend pass | DEAD END, not posted: a flash-lit cut-out in a dark car; the blend pass changed almost nothing. T7 `work/allen/passenger_seat_v2/` |
| v3, $0.27 | NEW MODE `AVT_FACE_EXACT=<his matte>` on `still_face_from_photo.py`: his WHOLE head (face, ears, hair, cap) from `34bd95ac` onto the v1 Gemini still by similarity (scale 0.97, turn -3.1 deg), colour by ONE linear gain per channel (0.60 / 0.29 / 0.19: exposure and white balance, no contrast change, no shade), mask = the solid inside of his own matte down to the chin; `still_face_putback.py` (0); then a Gemini clean-up of the drawn cap left round his own (`58a81a22` → `84582ab9`) and the SAME put-back again: `max |out-original| inside the hard head mask: 0` (39,734 px) | posted: `077a3515`, T7 `work/allen/passenger_seat_v3/allen_passenger_seat_v3_final.png`, `..._head_check.jpg` |
OBSERVED on v3: his face, ear, earring and cap are the photo's; the scene is still the real car frame; at 3x a little of
the drawn cap still shows as a brighter band outside his cap on the right, against the red headrest. The clean-up
pass itself redrew his face (mean difference 9 of 255 inside the mask), which is why the put-back runs last.
RULE for Allen from here: `AVT_FACE_EXACT` always; the default mode never on him.

## Passenger seat v3 PASSED by Fendi; v4 is the dial-in, 19 Nov 2026 ($0.27)

**Fendi on v3 (`077a3515`): "It's very close and if you can use the approved methods to fix the issue ... You don't
have to keep coming back to me, as long as you don't do anything outside of what's already been verified and proven
... So if you can dial it in, that's fine. But as it stands, the image is extremely close and can pass."** v3 is filed
`approved` with those words.

OBSERVED on v3 at 3x (what "very close" left): a pale second cheek and jaw of the drawn head outside his own on the
left; the dark underside of his cap brim ending in a straight horizontal cut at mouth level (the mask's own cut); a line
under his chin.

v4, same verified route, one pass: Gemini clean-up of the JOIN only (`world-still-proxy`, job `5250c27d` → `e0e63fef`,
references: v3 as the frame + his approved photo `34bd95ac` for the brim, jaw and neck), then `still_face_putback.py`
with the SAME head pixels (`passenger_seat_v3/h_photo_in_frame.png`) and the SAME mask (`h_facemask.png`):
`max |out-original| inside the hard head mask: 0` (39,734 px). Inside the mask v4 is identical to v3. The clean-up
redrew his face again (mean difference 10.6 of 255 inside the mask), so the intermediate `e0e63fef` is never a final.

OBSERVED on v4: no second jawline; the brim ends in a rounded edge; beard and neck run into the sweater's collar. Left
at 4x: a thin darker rim along his left cheek and a small step where his cap meets the drawn brim on the right; his
neck is a touch greyer than his face. Not visible at normal size.

Filed: `14f9d5dd` (`worlds/scene_allen_passenger_seat_v4_hishead.png`, pending: he has not judged v4), T7
`work/allen/passenger_seat_v4/allen_passenger_seat_v4_final.png`, `..._head_check.jpg`. v4 is the working picture of
the scene (newest `scene_*` still with this scene title); v3 stays as the one he passed.

STILL HELD: animating Allen (Seedance, $2.77 for 6 s). No verified method keeps a face that exists only in photographs
through a video model; his word is needed before that spend.

## New direction, 19 Nov 2026 (Fendi): a scene per lyric, his performance switched in; the two Lexuses SCRAPPED

His words: "Scratch the two Lexuses. That's unimportant. We're going to map out the scenes and generate scenes that go
with the lyrics and switch in my performance shots throughout the video." A scene he asked for at "Treat it like it's
salad": "a table made out of money, photorealistic of course, and somebody eating a salad on top of a table made out of
money" (him or a generated person). On the room shots: "we have to create the background ... I haven't thought of any
ideas, so let's run the Treatment in AVT, and let's also bounce ideas around once the treatment is rendered and the line
by line shot list is generated." On Allen: "we just had to try it out. Do some research first to see which tool would be
best ... You probably will have to go back after we generate and apply Allen's pixels back to his face."

SCRAPPED (never list as candidates again): the two Lexuses back to back; him and Allen standing by the cars
(first-half table rows 0:00-0:07 second picture, 0:51-1:10, 1:30-1:47). No exterior Lexus scene is needed.

### Setup done in AVT (VERIFIED, all $0)

- Song analysis run in the app: 136 BPM, 3:51, 525 beats.
- Lyric timing: 114 lines placed by LRC paste from the times already measured against the master
  (T7 `work/performance/coverage.json` -> `work/lyrics_timed.lrc`), so the board uses the same clock as this page.
- His real takes filed as 720p copies with sound, each matched to the song (`performance_syncs`, method derived):
  ROOM A-E, the handheld close-up, STORM S1/S2/S3/S5, CAR 6462/6465/6466/6467 (read with `-noautorotate`); the dash
  insert 6455 as his b-roll; the empty room as a reference. Originals stay on the T7. Script: T7
  `work/proxies/make_proxies.sh`. Each take's "what he wears / where filmed" note tells the writer: room takes get a
  swap into look A, B or C and a new place; car takes are used as filmed.
- "All my real footage is in" was confirmed by the agent in Setup (the Treatment will not run without it): everything
  he has shot is filed; the close-up yell take is not shot yet.
- The active board is the variation "Lyric by lyric" (`a27d2ac1`). "Still riding" (`c9b766a2`) keeps the three test
  boxes and the two scene rows untouched; the scene rows have to be made again on the new board before `montage-shot`
  is used there. The cast and the four outfits were copied across.

### The Treatment (three writer runs, $0.24 in all; ledger rows 34-36)

1. AI-written treatment, run `6841cfba`, $0.0712: REJECTED BY THE AGENT, not shown as a plan. OBSERVED: it wrote ten
   beats with no lyric ties, so the tool shared the 116 shots out in equal blocks in the treatment's order: 13 dash
   shots over 0:00-0:27 with no performance, Allen beside him at the wheel for 26 shots in a row (0:27-1:09), the money
   table at 1:08-1:22 (the line is sung at 0:18) and on the Lexus dashboard, the storm from 1:36 (it starts at 2:08),
   "bullet-hole frames" and "the car at dawn" in the second half, two matching Lexuses in two shots. It is kept under
   Versions.
2. Treatment written by the agent in song order, one paragraph per lyric line with the sung words quoted (the tool pins
   a beat to the shot that sings its words: `beats.ts allocateBeats`), then "Rewrite the shots". Text: T7
   `work/treatment_v2_lyric_by_lyric.txt`. Every picture in it is a RECOMMENDATION to bounce ideas on, except the money
   table (his) and the Allen passenger-seat shots (his, 18-19 Nov). The app labels it "written by you"; the agent wrote it.
   Run `027761ca` ($0.0844) matched 40 of 51 beats to their words but the app did not file it: an in-place rewrite is
   refused when any beat is left without a shot ("Treat it like it's salad" shares a 1.3 s shot with "Flip through
   green"). RULE for the next video: a line-by-line treatment is written as a CANDIDATE board (it is filed with its gaps).
3. Treatment v3 (T7 `work/treatment_v3_lyric_by_lyric.txt`): salad merged into the "Flip through green" beat and held
   through "Ralph Lauren fanatic"; Allen as two-shots over his real car take (ChatGPT's note to Fendi, 19 Nov: let the
   audience notice Allen before he moves, keep rapping through the reveal); a denim close and a mirror shot to break up
   the run of performance at 1:27-1:39. Written as a candidate, run `c04b0624` ($0.0831), renamed "Lyric by lyric"
   (`a27d2ac1`) and made active. The AI first pass is archived as `29353d35`.

OBSERVED on the board `a27d2ac1` (116 shots, fast cut on the beat; windows are the tool's, a picture can sit a beat
after its words): slips to fix when the pictures are agreed: shots 39-41 put the mantel photographs "through the
windshield"; 42, 44, 45 put the radio dial "on a small screen beside him"; 28-31 hold the radio display for 6 s;
54-59 are six performance shots in a row (1:29-1:39); 70-73 stretch the yell over 2:03-2:16. The second half is written
as the storm already handed to Grokbot; nothing there is new work.

### REJECTED by Fendi, 19 Nov 2026: the plain line-by-line treatment (v3, board `a27d2ac1`, archived)

His words: "Investigate what happened with the treatment and why it didn't produce viable results. Our treatments are
supposed to be in line with the lyrics but produce mostly dynamic photorealistic results with crazy or viral twists
that resemble a hip hop montage prompting similar to how thugpappi makes his videos in Higgsfield. Your treatment is
too basic and honestly boring. Nothing unpredictable or engaging just a regular rap video that will get overlooked."

What the investigation found:

- VERIFIED: his standard was already in the repo and neither the tool nor the agent used it:
  `docs/research/references/THUGGPAPI_SEEDANCE_MONTAGE_PROMPTS_2026-10.md` (16 Oct: "something absurd that catches
  attention, shot like it is normal"; firemen rescuing a tiger, a city bus with chandeliers) and his own YSL treatment
  "Interrupted Broadcast" (geese in tiny Canada Goose jackets, a control room inside a Maybach).
- VERIFIED (`treatment-writer-proxy/contract.ts`, `treatmentSystemPrompt`): the writer is told to write "ONE idea" staged
  in "a small number of places that return", "photoreal and filmable", and to "cut it like a real music video: ... of
  every three shots about two are performance". Nothing asks for a twist, a montage or a deadpan impossible event, and
  the reference is never sent (`video_projects.creative_exemplars` is empty and no code reads it). A regular rap video
  is what those instructions describe. Same result on YSL: the AI text "Paris Black Runway" was plain; the treatment
  that worked was hand-written.
- VERIFIED: the AI's text carried no lyric cues, so its ten beats were shared out in equal blocks (the salad at 1:08).
- The agent's part: the brief it gave the writer said "calm frames with one clear idea each" and "warm and plain", and
  its own treatment illustrated each line literally. It did not look up the reference before writing.

Treatment v4 (T7 `work/treatment_v4_montage_twists.txt`), written by the agent in the reference's shape: one style line
(shaky handheld, quick optical zooms, 35mm grain, muted warm colours, fast cuts, deadpan), one impossible event per line
that answers its words, ordinary people who do not react; Allen is never part of a joke; the first half's objects (the
gift-wrapped sedan, the bills, the filing cabinets, the two sweaters, their photographs) are what the storm blows past
him. The board's mood, visual direction and notes now say the same. Written as a candidate, run `44e78b11` ($0.0849),
renamed "Montage twists" (`fa7f6b85`), ACTIVE. Every twist is a proposal until he marks it. OBSERVED on the board:
twists sit on their lines for shots 4-69; slips: 56-59 repeat the floating books (1:32-1:39), 28-31 spread the radios
over 6 s, 35-38 hold the wrestling ring 6.6 s, 70-73 stretch the yell.

Fixing the writer itself (so its own text comes out in this style) is a code change to `treatment-writer-proxy`
(Class B, one reviewer, then a Lovable redeploy): proposed as its own session, not done here.

### Making Allen move: research, 19 Nov 2026 ($0, nothing generated). NOT VERIFIED: every route below is a test

The job: the approved passenger-seat still (`14f9d5dd` / `077a3515`) as 3-6 s of him riding, mouth closed, small natural
motion, his face still his. No video of him exists, so recipe F loses its `@Video1` (the model never sees his face move;
every angle beyond his photos is invented). Recipe F's own page calls its result "a fair likeness" even with video:
plan on putting his head pixels back afterwards, as Fendi said.

| Order | Tool | Why | Inputs | Cost (estimate) | Risk |
|---|---|---|---|---|---|
| 1 | **LivePortrait, head pose only** (suggested to Fendi by ChatGPT, 19 Nov; open source, KwaiVGI) | it WARPS the still's own pixels instead of redrawing the face, so his head stays his photograph; lips can be held closed | the approved still + one small closed-mouth nod (a driving clip or pose values); Allen on his own layer over the real car frame | $0 run on the Mac (needs its model files downloaded to the T7), or cents on Fal | only the head crop moves: body, seat and light stay a still, so it needs moving cabin light around it; a nod can pull the mouth corners (check frame by frame). VERIFIED on fal's page: `flag_lip_zero`, `rotate_pitch/yaw/roll`, paste-back; a pose-only switch is not documented there. HYPOTHESIS: the open-source release has a pose-only region option (confirm with its help text) |
| 2 | **Seedance 2.5** (Higgsfield), the still as a true START FRAME + 3-6 of his face photos | the route that already made the storm clips; mouth at rest on 7 of 7 clips (ledger row 22) | `start_image` = the still, face photos as references, 5 s, 720p, locked camera, breathing, a head turn under 10 degrees, passing light | about $1.72 for 5 s | ByteDance's own rules bar real faces in references; our Higgsfield route accepted his photos on 18 Nov, a different person is untested. Sent as a reference (not a start frame) Seedance re-framed him small (ledger row 21). `montage-shot` does not send a start frame today: a tool change |
| 3 | **Kling 4.0** image-to-video | cheapest true first frame; Fendi named Kling | the still as start frame, same prompt, 5 s | about $0.55 | reviews report the face drifting over the clip; native audio leans toward talking: mouth scan |
| 4 | **Genjutsu motion transfer** | drives the still from a filmed stand-in | the still + a 4-5 s clip of someone in the real passenger seat, mouth closed | about $1.70 | redraws the whole frame; unverified for a face from photos |
| - | Gemini Omni Flash | skip | | | reports of its API blocking even a fictional presenter; a real person's photo is the likeliest refusal |

Evidence is thin everywhere: no independent 2026 test of real-person likeness from stills was found, only single-run
vendor posts. Whatever moves him, the check is the same: `face_check.py` sheet against his photographs, `mouth_scan.py`,
frame by frame at the mouth corners, jaw and where he meets the seat; Fendi judges the face.

### Allen nod test 1, 19 Nov 2026 (LivePortrait, local, $0). NOT VERIFIED: a test, waiting for Fendi's eyes

Fendi, 19 Nov: "Then download live portrait". Downloaded to `/Volumes/T7/tools/LivePortrait` from the official release
(code `github.com/KlingAIResearch/LivePortrait` at `9b294b3`; model files `huggingface.co/KlingTeam/LivePortrait`, people
only, 632 MB, every size and sha256 checked). Its packages sit in `site-packages` beside it (no environment on the Mac;
run with `PYTHONPATH=/Volumes/T7/tools/LivePortrait/site-packages /usr/bin/python3 -s`). Licence: code MIT; the bundled
InsightFace detection models are "for non-commercial research purposes only" (its LICENSE, lines 25-29), so a shot that
ships needs the detector replaced (MediaPipe, which we already use) or only the motion taken from it, as in version B.

Test: the approved still `14f9d5dd` (v4), 3 s at 24 fps, one nod of 6 degrees, head pose only. No driving clip of
another person: LivePortrait's own retargeting moves only the head pitch; expression, lips and eyes keep the still's
values (VERIFIED in its code: `animation_region: "pose"` exists, and `execute_image_retargeting` takes a pitch change).
Scripts on the T7: `work/allen/nod_test/liveportrait_nod.py`, `nod_hispixels.py`.

| Version | What it is | Measured |
|---|---|---|
| A `nod_p6_raw.mp4` | LivePortrait's own picture | outside its mask: 0 difference from the still. Inside, even with no motion, it redraws him (mean 1.7, 99th pct 11 of 255): softer skin, changed eyes and earring. Not his pixels |
| B `nod_p6_hispixels.mp4` | the still's own pixels, moved by the motion measured from A (optical flow) | 48 of 72 frames identical to the still bit for bit; the head moves up to 12.8 px in the other 24 |

OBSERVED: mouth stays closed in both (`mouth_scan.py`, lip gap never above 0.016 through the nod); no smile; cap and
headrest edge hold. Not yet done: over the real car take (his still is one frame; the cabin does not move), a longer or
second movement, a larger nod. RECOMMENDATION: version B is the route (his pixels, and nothing from the research-only
detector reaches the picture). Fendi judges whether the nod reads as him.

The engineering handoff written the same day is `docs/handoffs/HANDOFF_AVT_BUILT_IN_METHODS_2026-11-19.md` (audit of
YSL / Hyenas / Partnership, the Treatment writer fix, the four methods built into the app).

### Passenger seat v5: no seat belt, and the nod on it, 19 Nov 2026 ($0.27, ledger row 38)

Fendi on nod test 1 (version B, his own pixels moved): "Yes it's fine but remove the seatbelt."

Same verified route as the v3/v4 clean-ups: Gemini edit of v4 (`world-still-proxy`, job `7bad2c0e` → `a4449fe7`,
references v4 as the frame + the Martini Bear sweater `27e951ad` so the bear under the belt is the real one), then ONLY
the belt strip taken from the edit (mask = where the edit differs from v4 along the belt, 2.7 % of the frame).
`max |out-v4| outside the belt mask: 0`; `inside the hard head mask: 0` (39,734 px). Filed `44788e06`
(`worlds/scene_allen_passenger_seat_v5_nobelt_hishead.png`), T7 `work/allen/passenger_seat_v5/`. OBSERVED: no strap,
buckle or shadow left on him; the bear is whole with its martini glass; a small dark fitting stays by the door pillar
(it was there in v4 and is not on him).

Nod redone on v5, version B (`work/allen/nod_test/allen_nod_v5_nobelt.mp4`, filed `22921c2f` under `tests/`): 48 of 72
frames are the still bit for bit, head moves up to 12.8 px, lip gap never above 0.018 (`mouth_scan.py`). Pending his word.

NEXT (not done): Allen over the real car take at "See you frequently up in my dreams" (song 1:18.10-1:21.78 = file
74.22-77.90 s of `IMG_6462.MOV`). OBSERVED on that window: the phone is handheld, so the passenger headrest drifts by
about a twelfth of the frame width and the cabin light changes; the seat sits at the far left edge, so part of his
shoulder falls outside the frame; the dashboard edge crosses in front of his chest. He has to be tracked to the seat,
lit with the cabin and tucked behind the dashboard, frame by frame. No verified method for a still layer on a moving
handheld take: a test.

### Allen beside him in the real car take, test 1, 19 Nov 2026 ($0.036 matte, ledger row 39). NOT VERIFIED: a test

Line: "See you frequently up in my dreams", song 1:18.10-1:21.78 (file 74.22-77.90 s of `IMG_6462.MOV`, 89 frames at
24 fps, read with `-noautorotate`). VERIFIED by looking at all four car takes at this line: only 6462 shows the
passenger seat; 6465, 6466 and 6467 are close on him from the wheel.

| Step | What | Measured |
|---|---|---|
| Cut-out | `photo_people_cutout.py clip` → `matte-video-proxy` (veed, job `edc3834c`) as delivered → `cut` | people 14.5 % of the still; the dashboard in front of him is not in the matte |
| Track | the cabin (sunroof edge, headrest, seat backs, rear seats) followed frame to frame (ECC, rotation + shift), from the first frame | match 0.997 median (lowest 0.46 on the light flare); cabin drifts 93 px across and 34 px down at 720p. Chained feature tracking failed here (40 of 89 frames unsolved): too dark and shaky |
| Place | still → take: scale 1.0, shift (-250, +75) px at 720p, so the headrest's top right corner matches | his head sits in front of the headrest, left shoulder out of frame |
| Dashboard | the pale dashboard edge found per frame; he is hidden under its top edge | |
| Light | one gain from the bare headrest beside his head per frame (0.61-1.06 of frame 1), base gain 1.3, saturation 0.88, and the take's own haze (rise of the dark cabin, up to 85 of 255) laid over him | on the frames where a street light floods the car he sinks into the haze with the cabin |
| Nod | version B (his own pixels moved), frames 48-71 of the line | |
| Proof | `max |out-take| outside Allen's outline: 0` | Fendi's performance is untouched |

Output: T7 `work/allen/two_shot/allen_two_shot_test1.mp4` (1280x720, with the song), script `allen_two_shot.py` beside
it. OBSERVED, to fix if he likes the idea: the cut-out's edge is harder than the footage; no shadow from him on the
seat; he is not blurred when the camera shakes; 720p only (the still is 1376 px wide, so 1080p needs it enlarged 1.4x
or remade at 2k); the light flare comes from his side and should catch his cheek. Pending his word.

## Allen beside him in the real car take, test 2 ($0, local; asset `3e7ce2a1`, pending)

Fendi on test 1 (19 Nov): "his likeness is correct but we need to figure out a method to make him not look pasted in
the scene and having things glitch around him. The console screen is appearing and disappearing and the depth is off
in the image to where Allen almost looks like he is connected to the seat in a 2 dimensional plane where as you can
see my depth".

| What he saw | Cause in test 1 (VERIFIED by measurement) | Test 2 |
|---|---|---|
| The console screen appears and disappears | the dashboard edge was found fresh on every frame by a fixed colour rule; in the light flare (frames 7-22) the rule failed. Allen covered dashboard pixels on all 89 frames, up to 11,924 px | `dash_occluder.py`: the edge tracked as one shape from frame 1, then cut on each frame by GrabCut seeded from that track (colour learned from that frame's own light). Allen covers 0 dashboard pixels on 89 frames; left end steps 3 px per frame median, 10 worst |
| Flat, joined to the seat | he was tracked to one average of the whole cabin, so he moved as part of the far wall; the take's seat is lit as an empty seat; he was a frozen still | he follows the passenger headrest plus half of the slide the headrest shows against the rear seats (measured: 20 px across, 16 px down, over the clip); he shadows the seat behind him; slow sway of head and body |
| Pasted | razor edge, no blur on camera shake, brightened 1.3x | edge pulled in and softened, blur along each frame's shake (median 2.5, max 5.2 px per frame), edge shading, light wrap 0.12, exposure 1.12 |

- Script: `two_shot/allen_two_shot_v2.py -250 75 1.0 48` with `EXPO=1.12` (T7). Printed: outside Allen's outline and
  his shadow on the seat 0; Fendi's half of the frame (x >= 700) 0.
- HYPOTHESIS, not measured: the depth figures (head 20 cm nearer than the headrest, so `PAR` 0.5) and the light
  direction of the shadow (front left). Judged by eye only.
- OBSERVED, still open: 720p; his face is evenly lit while Fendi's light moves; the still looks at eye level and the
  phone sits low; no verdict from Fendi yet. Not a row in `PROBLEM_INDEX.md` until he approves a version.

## Allen beside him in the real car take, test 3 ($0, local; 1080p asset `f2b78e6a`, pending)

Fendi on test 2 (19 Nov): "Let's try to fix it and remember I'm not here to micromanage I think we can make it happen".

- VERIFIED (measured on test 2, frame 41): his skin sat at Lab a,b (8, 10) beside Fendi's (19, 15) under the same
  cabin light: grey. Test 2's 0.88 saturation made it worse. Test 3: (14, 14).
- Test 3 = test 2 plus the light: his colour brought to the take's warm light, a front-and-low ramp over his head
  (the cabin's light is the dash and phone glow), the dashboard's shade on his chest, the red knit held no louder
  than the seats. `two_shot/allen_two_shot_v3.py -250 75 1.0 48`, `S=1.5` for 1080p from the 4K original
  (`take1080/`, frame-matched to the 720p frames, PSNR 49+).
- Tried and dropped: a rim light from the window side in the flare frames. It drew a glowing outline round him.
- Printed: outside Allen's outline and his shadow on the seat 0; Fendi's half 0. Flicker: his face changes 1.61 per
  frame against 1.43 on the take's own bare headrest; the largest steps are the nod.
- Also posted, not filed: `allen_two_shot_test3_camera_over.mp4`, the frame starting close on Fendi and moving over
  to Allen for the nod, cut from the 1080p test 3 (720p out).

### Direction from Fendi, same day (DECISION: his, quoted)

- "If we can get it right we can always generate him perfectly swap inside one of the appropriate AI tools and use it
  as a cut scene. We can pull the camera in on me or change the angle and motion the camera over to him at certain
  parts or just do montage style cuts. We have options is all I'm saying but setting for the unrealistic 2D isn't the
  best look unless we can fold my performance down into the same 2D look that might be dope".
- "I just saw Wan 3.0 is on runway and the prices look ridiculously cheap we should test the realism on that too. If I
  need to top up my API credits I will but I believe you can run a test straight through the mcp".

### Wan 3.0 test: not run (VERIFIED blockers, 19 Nov)

- Runway connector: the connected workspace (his personal one) is on the Free plan, 2 credits, no video models
  available; top-up is not offered on Free. Two other workspaces exist on his account; their plans are not visible
  from this connection, and switching needs the connector disconnected and reconnected.
- AVT's own Runway route (`runway-video-edit-proxy`, billed to the API key Control Center holds) lists three models
  (Aleph 2.0, a Runway edit mode, Seedance 2.5 edit) and is built for wardrobe edits of a take; Wan 3.0 is not a row
  in it. Adding it is a provider change (Class C).
- Planned test when access exists, no call made, nothing of Allen sent out: (A) the still `44788e06` animated as a
  cutaway of him alone; (B) the test 3 two-shot edited on his side only, Fendi's half put back from the take (0).
  A generated face is checked against his photo `34bd95ac`; who he is stays Fendi's word.

## Wan 3.0 realism test 1: Allen alone in the passenger seat ($0.50, ledger row 42)

Fendi, 19 Nov: "Just use the API instead of the connector."

- Route (VERIFIED, worked): `avt_call proxy-provider-call` with `endpoint: video-providers-runway-generate`, body
  `{mode: "image_to_video", modelVariant: "wan3", duration: 5, aspectRatio: "auto_720p", promptText,
  referenceImageUrl: <temporary link to the still>}`; Control Center passes `modelVariant` and `aspectRatio` straight to
  the Runway API. Poll `video-providers-job-status` with `query {provider: "runway", id: <task>}`. Runway API price
  (docs, 19 Nov): `wan3` 5 / 10 / 20 credits per second at 480p / 720p / 1080p, a credit is $0.01. Control Center's
  own estimate for this model is wrong (25 cents returned); Runway's task estimate and charge were 50 credits.
- Result `bfb93450` (as delivered): OBSERVED it reads as real handheld footage: the light moves over him, the seat and
  cabin have depth, a street light passes. OBSERVED it redraws his face from about 1 s on: eyes open wide (his photo is
  heavy-lidded), sharper skin, a smirk in the last second. Mouth closed throughout. Not judged by Fendi.
- `212f2c5e`, $0 local (`wan3_test/wan_face_putback.py`, `FLOW_SIGMA=16`): the same clip with the face rebuilt from the
  still's own pixels, moved by Wan's smooth head movement and lit by Wan's slow light change. It keeps his photo's
  expression; it is softer than Wan's redraw and is not pixel-exact after the first frame. Following Wan's fine motion
  (sigma 2) dragged his eyes and mouth out of shape by the last third: do not use it.
- Not tested yet: the two-shot (his side regenerated, Fendi's side put back from the take), which needs the
  video-to-video endpoint; Wan 3.0 Prime; 1080p.

### Fendi's verdict on Wan 3.0 test 1 (19 Nov) and what follows

- Fendi on both versions (`bfb93450` as delivered, `212f2c5e` with his photo face): "I think both are solid the redraw
  they did wasn't terrible or ridiculous looking". Recorded on both assets; both stay `pending` (test clips, not on a
  shot).
- Posted, not filed: `work/allen/cut_demo/allen_dreams_line_cut_demo.mp4`, the "See you frequently up in my dreams"
  slot as a cut (88 frames, with the song): his real take punched in on him for 44 frames (the empty seat out of
  frame), then 44 frames of the Wan cutaway, his-photo-face version, clip seconds 1.55-3.38.
- VERIFIED blocker for the two-shot through Wan: Control Center's `video-providers-runway-video-edit` allows only
  `aleph2`, `gemini_omni_flash_1.1` and `seedance2_5` (its `contract.ts` on `main`); `wan3` video-to-video needs a row
  there (sister repo, provider change, Class C). Image-to-video needs no change.
- RECOMMENDATION: Allen appears in cutaways made this way (a Gemini still with his head put back, then Wan 3.0
  image-to-video, about $0.77 a shot), cut against Fendi's real takes; the wide two-shot (test 3) only inside a camera
  move. One test is not a benchmark: `docs/capability/GAPS.md` G2 keeps Wan 3.0 as a candidate until more shots pass.

## Allen's solo shots, 19-20 Nov 2026 ($4.39: seven stills $1.89, five clips $2.50; ledger rows 43-54)

**DECISION (Fendi, 19 Nov, late):** "We can do solo shots of him in those different shots, interchanging the different
polo sweaters. We can go back to the navy one that you put him in. That was nice. We can do, we can actually create the
Lexus scene, putting him in front of the green Lexus, putting him standing next to it, getting in the car. We can just
do different shots of that, different shots of him, Mercedes. Just be creative with it, so we can actually execute that."

What this changes in the notes above:
- The navy Polo Bear sweater is back in use beside the red one (`400b40c3` approved again; his navy picture with his
  real head filed approved as `a552f358`).
- An exterior Lexus scene exists again, for ALLEN ALONE. Still scrapped (his words of 19 Nov stand): the two Lexuses
  back to back, and him and Allen standing by the cars together.
- Allen's Lexus is green (new, his word). Its model and year are NOT in any note: the agent chose an early-2000s GS,
  dark green (plate `2523fc5d`), and a black mid-2000s Mercedes S-Class. HYPOTHESIS until he confirms the cars.

**Method (each step a verified one, except Wan, which he judged "solid" on test 1):**
1. One picture of the car alone, so it is the same car in every shot (`world-still-proxy`, Gemini, no references).
2. Per shot: his dressed photo as `screen` + the car as `prop`, prompt "change ONLY the place around and behind him".
3. His whole head from his photo: `still_face_from_photo.py` with `AVT_FACE_EXACT=<matte of the photo>` then
   `still_face_putback.py` with `AVT_STILL_HEAD_MASK`: proof 0 on all five (scale 0.84-1.00, residual 0.5-2.0 %).
4. Wan 3.0 image-to-video, 5 s, 720p, through the Runway API route.

**FAILED, do not repeat (VERIFIED, $0 lost beyond the stills):** `still_face_putback.py <photo> <edit>` on its own. It
assumes the edit left him where the photo has him. Gemini moved and resized him in every one of these (ECC 0.24-0.48 or
no convergence), so his head was pasted at the photo's place, floating, and the bad alignment warped two pictures to
garbage. When the scene around him changes, step 3 is the tool. The first headlights still also drew a different man
(cap forward, looking away): the prompt has to hold his size and place ("close to the camera, his head near the top").

| Shot | Lyric (song time) | Sweater | Still (his head) | Clip | Seen in the clip |
|---|---|---|---|---|---|
| L1 in front of the Lexus | My partner Allen (0:15.7) | navy | `c1b77be4` | `8211213f` | push-in, one nod, mouth closed |
| L2 at the door, gets in | Had it automatic (0:16.9) | navy | `beb5a848` | `e473e93e` | four beats: look (closed-lip smile) 0-1.3 s, turn 1.3-2.3, gets in 2.3-4.2, door shut 4.2-5; an invented "A" on his cap when he turns |
| M1 by the Mercedes | All my business partners got Benz's (0:30.8) | red | `d3a500d2` | `b054afcb` | nod, looks at the car and back |
| L3 gas station | Speaking to your spirit we agree (1:16.0) | red | `38b3a9b6` | `bb4c15a4` | two slow nods, eyes drop on each |
| L4 headlights | As your guidance shining on to me (1:21.8) | navy | `5509d699` | `1642f563` | headlights flare, mist, he lifts his chin |
| (earlier) passenger seat | See you frequently up in my dreams (1:18.1) | red | `44788e06` | `bfb93450` / `212f2c5e` | test 1, both "solid" |

OBSERVED, open: the stills are 5:4 (his photo's shape), so the clips are 1068x860; in a 16:9 cut they are cropped or
shown as snapshots in their own frame. Wan redraws his face in every clip; `wan_face_putback.py` can hold his photo
face on the ones where his head barely turns (L1, L3, L4, M1), not on L2. All ten assets are `pending`. T7
`work/allen/solo_shots/` (stills, head checks) and `solo_shots/wan/` (clips as delivered and muted).

## Fendi on the five solo clips, 20 Nov 2026: the face drifts too much; an older Allen, from the photos of the two of them

His words: "The facial drift on these is way too much and but I actually think on these we do a little bit older version
of Allen pull up some of the pictures with me and him and crop me out so you can get his likeness right".

- DECISION (his): the five clips `8211213f`, `e473e93e`, `bb4c15a4`, `1642f563`, `b054afcb` are not accepted as they
  are (drift). The Allen of these shots is a little OLDER than the kitchen photo. This replaces "the YOUNGER Allen"
  of 19 Nov for the solo shots. His likeness is to come from the photos of the two of them, Fendi cropped out.
- The photos with exactly two people: 02, 04, 08, 09, 10, 11, 12, 14, 20 (`people_points.json`). Who Allen is: 04 = A
  (his word, 19 Nov). 20 = B by the clothes and room of his confirmed solo photo 18 (not by his face). 02, 08, 09, 10,
  11, 12, 14: NOT KNOWN, his word needed. Sheet posted: T7 `work/allen/together_sheet_two_rows.jpg`.
- TESTED, $0, FAILED, not posted: `wan_face_putback.py` on clips L1 and L4. It holds his photo face only while his head
  barely moves (test 1). On L1 the camera pushes in to twice the size and his eyes come out uneven by the end; on L4
  the frame moves 460 px and it leaves streaks above his cap. RULE: no push-in and no travelling camera on a clip whose
  face must be held; a face may shrink in a clip, never grow past its size in the still.
- TESTED, $0.27 (ledger row 55): older-Allen still T1 from photo 3 (`0882dfee`). OBSERVED: a convincing photograph;
  the face is Gemini's drawing from his photo. His real head could not be put back from photo 3: the photo cuts his
  head off above the brow line, tilts it and lights it in a warm shade (gains 3.2 / 7.0 / 8.5, residual 4.3 %), so the
  exact-pixels mode has no whole head to use. Photo 3 is a likeness reference, not a head source.
- NEXT, waiting on his word (which man is Allen in 08, 09, 11 and the rest; whether a drawn face of this standard is
  acceptable or only his photo's pixels): one older-Allen shot end to end, camera locked, before the other four.

## Who Allen is in the nine two-person photos (Fendi's word, 20 Nov 2026) and the older-Allen reference set

His words: "Photo 04, he's to the left in the blue shirt. Photo 20, he's to the right in the red polo. Photo 08, he's on
the left hand side holding the bottle. Photo 9, These to the left. Photo 11. He's to the left. Photo 2, he's to the
right. Photo 10, he's to the right. Photo 12, he's to the right. Photo 14, he's to the right. And just for
clarification ... A is left, B is right." Also: "the collage is not okay" and "In the pictures where it's just me and
him, he's the obvious other person." RULE (his): no lettered collage and no picture-by-picture questions again; this
table is the record.

| Photo | File | Allen | Era (OBSERVED from the picture, not from his face) | Crop, Fendi cut out (T7 `work/allen/older_refs/`) |
|---|---|---|---|---|
| 04 | IMG_1758 | A, left, blue | later; daylight, face-on, head about 130 px | `allen_older_04A.png` (also ref 01 `862fcdcf`) |
| 08 | IMG_3070 | A, left, bottle | later; big open smile | `allen_older_08A.png` |
| 09 | IMG_3071 | A, left | later; sharp, face-on, whole head, mouth closed, faded filter | `allen_older_09A.png`, filed `a4753c00`, matte `allen_older_09A_alpha.png` |
| 11 | IMG_3073 | A, left | later; dark, soft | `allen_older_11A.png` |
| 02 | D593AEDD | B, right | younger; profile | `allen_older_02B.png` |
| 10 | IMG_3072 | B, right | younger; cap | `allen_older_10B.png` |
| 12 | IMG_3074 | B, right | small | `allen_older_12B.png` |
| 14 | IMG_3076 | B, right | small, club light | `allen_older_14B.png` |
| 20 | IMG_3344 | B, right | younger; the kitchen | `allen_older_20B.png` |

OBSERVED on the older-Allen stills (ledger rows 55-56):
- T1 from photo 3: its head is cut off at the top, so it cannot be a head source.
- T2 from photo 09 (`33152dfa`, references 09A + 04A + the car + the navy sweater): `still_face_from_photo.py`
  `AVT_FACE_EXACT` fits (scale 0.67, turn -1.2 deg, residual 2.3 %, gains 0.79 / 0.63 / 0.69, proof 0, 35,322 px) but
  the result LOOKS PASTED: photo 09 carries a faded filter (lifted blacks, low contrast) and one gain per channel
  cannot make it sit in a crisp flash picture. Not posted. So for the older Allen the exact-pixels head has no clean
  source among these photos; the still as Gemini drew it from 09A and 04A is what was animated, for Fendi to judge.

## Older Allen, test shot T2 ($0.77; ledger rows 56-57; still `33152dfa`, clip `402f7c28`, both pending)

- Still: Gemini, 16:9, references 09A + 04A (cast, Fendi cropped out), the green Lexus plate, the navy sweater; night
  flash snapshot in front of the car; bare head, no chain, mouth closed. The face is DRAWN from his photos.
- Clip: Wan 3.0, 5 s, 720p, prompt "the camera is locked on a tripod ... he stays the same size ... the same eyes,
  nose, lips, goatee, beard and hairline as in the first frame". OBSERVED: the same features hold from the first frame
  to the last, which the five kitchen-photo clips did not do; lips part slightly near 2 s; eyes closed at the end.
- HYPOTHESIS for why this one held: a sharp, detailed starting face at a size the clip never exceeds, and a camera that
  does not move. One clip; not a benchmark.
- DEVIATION, stated to Fendi before the clip: this shot does not carry his photo's own pixels (PROBLEM_INDEX "Allen's
  likeness" row). Cause: the only whole, sharp, later head (photo 09) is filtered and looks pasted when put back.
  Whether a drawn likeness of this standard stands in for him is Fendi's call; nothing here is approved.

## LOCKED: the car shot. The older Allen is for ONE shot only (Fendi, 20 Nov 2026)

His words: "I don't want you to change Alan in the car shot. That shot was perfect. Please don't touch that shot. I was
talking about only the new shot with him in the navy sweater outside of the Lexus. That shot should be a slightly older
version of him."

- **The car shot is approved and locked:** Allen in the passenger seat, still `44788e06`, clips `bfb93450` (as Wan
  delivered) and `212f2c5e` (his photo face held). All three are `approved` with these words. NEVER edit, regenerate,
  re-age or replace them. Which of the two clips goes in the cut has not been said.
- **CORRECTION to the section above** ("an older Allen ... for the solo shots"): that was the agent's over-reading. The
  slightly older Allen applies ONLY to the shot of him in the navy sweater outside the Lexus. The older-Allen test T2
  (still `33152dfa`, clip `402f7c28`) is that shot; it is pending his word on the face.
- NOT SAID, so not touched: the other solo clips (door `e473e93e`, gas station `bb4c15a4`, headlights `1642f563`,
  Mercedes `b054afcb`). His drift note on them stands; nothing is redone or re-aged on them without his word.

## Older Allen T3: ONE photo, his own pixels (Fendi, 20 Nov 2026; $1.04, ledger rows 58-60)

His words on T2: "the older version does not look like him. Those are not his pixels. It's close, but pick one of the
images and not a collection of them. Pick one and use that one as opposed to trying to merge his likeness into several
different images, because it's multiple different stages of his life over a culmination of about 15 years ... Over time,
he got heavier and heavier and bigger. So just pick one of him in the club ... Whichever one is the cleanest looking as
far as the highest quality".

- RULE (his): ONE photo of Allen per likeness. Never several photos of him as references in one request: they are 15
  years apart and blend into a man who is not him. T2 (`33152dfa`, `402f7c28`) is REJECTED for that reason.
- The photo: 09 (IMG_3071, the club, Allen on the left), crop `a4753c00`: the largest, sharpest later head, face-on,
  whole head, mouth closed. DECISION (the agent's pick among the club photos; his to overrule).
- What made his pixels sit (VERIFIED on this still): grade the WHOLE scene to the photo's own look, not his head to
  the scene. Per channel, fit the still's drawn face to the photo's face by percentiles (here B, G, R gain 0.52 / 0.78 /
  0.73, lift 89 / 65 / 73), apply to the whole still, add the photo's softness and grain; then `AVT_FACE_EXACT` needs
  gains of 0.98 / 1.04 / 1.05, i.e. his head goes on untouched. Asking Gemini for the faded look in words did nothing.
  Then the verified join clean-up and the same put-back (proof 0, 43,149 px): still `fa83826a`.
- Clip: Wan 3.0, camera locked, he only breathes and blinks. His head moves 17 px at most, so `wan_face_putback.py`
  holds his photo face for all 150 frames. Two versions filed, both pending: as delivered, and his face held.
- OBSERVED, open: the whole picture is as faded as photo 09 (lifted blacks); a single grade over the finished clip can
  bring it toward the cut's look without separating him from the scene. 720p.

## Older Allen T6: his WHOLE REAL FIGURE from one photo ($1.12, ledger rows 61-65; still `d2ca81b7`, pending)

Fendi on T3 (20 Nov): "His beard is off" / "Your cutting off his goatee" / "And he never connected his goatee" / "the face
looks glued onto another face around his ear it looks slightly un natural" / "It wasn't that long" / "You should probably
use another image" / "His black shirt is throwing you off on getting his beard pixels accurate" / "You can see from his
other pics how he kept his goatee length they are almost identical". T3 (`fa83826a`, `5fb6d7f9`, `b16148a3`) REJECTED.

FACTS about Allen (his word): a thin moustache and a SHORT goatee on the chin; the goatee is NOT connected to the
moustache; no beard along the jaw; the same length in every photo. Never lengthen, thicken or join it in a prompt.

VERIFIED causes of the T3 faults:
- The head mask stopped at his chin and the join clean-up was told to clear "the beard under his chin".
- In photo 09 a black shirt sits right under his chin; brightened, it read as a long beard. It is shirt.
- A real head on a GENERATED body always leaves a join at the ear and jaw, and the generated neck is lit differently.

**RULE for Allen from here (replaces "whole head, AVT_FACE_EXACT" for any new picture of him):** his whole REAL FIGURE,
from ONE photo, with only the garment changed. Never a real head on a generated body.
1. Clothes-only Gemini edit of the one photo (`screen` = the photo, `garment` = the flat sweater; "change ONLY what
   the man is wearing"; 9:16 for a standing photo).
2. `still_face_putback.py <photo warped into the edit's frame> <edit> <out>` (the photo is first laid into the wider
   edit by SIFT similarity: here scale 1.953, shift 82 px). Take the OLD garment's collar out of the head mask
   (colour test low on the head) or its stripes come back at his neck. Here: ECC 0.88, proof 0, 63,541 px.
3. `matte-video-proxy` (veed) on a 2 s clip of the dressed photo, as delivered.
4. `older_v1/figure_over_plate_still.py`: the figure resized (0.52, so his head is no larger than in the photo) over
   an EMPTY plate; rim colours from inside him. Proof 0 on 156,248 px.
5. One small grade over the whole finished picture.
Source photo: 04 (the White House fence), the sharpest by far (Laplacian 666 against 32-89 for the club photos),
plain daylight, no filter, his goatee against a light collar.

DEAD ENDS this round, not posted: T5 (`4013059a`: photo 04 as `screen` with place AND clothes changed in one edit:
Gemini enlarged him 1.2x and lit his face 6x brighter; his head at gain 6 was wrecked) and its join clean-up
(`81eb6fd2`: re-lit his neck and body, a dark line along his jaw).
NOT DONE: the clip. The still waits for Fendi's word first.

## T6 was WRONG (the agent's error); T7 is the corrected older Allen, with the clip ($0.77, ledger rows 66-67)

Fendi on T6, 20 Nov: "I can't make any judgments without seeing the full animation. The new still ... does not look
like his original pixels on the image. Are you using the verified method because it doesn't seem like it."

**He was right. VERIFIED by audit:** in T6 only 39 % of his face box was his photo's pixels. The agent's collar-removal
step on the head mask (colour test + 23 px dilation + 19 px opening) cut his eyes, nose, mouth and goatee out of the
mask; the put-back then restored only his forehead and hair, and the rest stayed the GENERATED face. The printed proof
("0 inside the mask") was true and meaningless, and the agent told him the face was his photo's pixels. T6 `d2ca81b7`
is marked rejected with this record.

**RULES from this (for every put-back, on anyone):**
- A "proof 0 inside the mask" line is not a proof until the mask is shown to cover the face. Print the share of the
  face outline (landmarks) that the mask covers; it must be about 1. Then print how many pixels inside the face
  outline differ from the source photo; it must be 0.
- Never edit a head mask with colour tests or large morphology. To keep an old collar out, use
  `scripts/edit/head_mask_no_collar.py`: the tool's own mask above the bottom of the nose, the face outline below it.
- Look at the mask over the face (a dimmed overlay) before telling Fendi whose pixels they are.

T7 (still `56bfa0a3`, clip with his face held `c90e03ab`, clip as delivered `7e8d7c7b`; all pending):
- Mask by `head_mask_no_collar.py`: face outline covered 1.000; inside it 0 pixels differ from his photo.
- Neck tidy (Gemini) for the beard shadow the edit had drawn under his jaw, then the same put-back.
- `scripts/edit/figure_over_plate_still.py`: his real figure over the plate, no tone change on him.
- Clip: Wan 3.0, camera locked. As delivered, Wan redraws his face after frame 1 and JOINS HIS GOATEE into a full
  circle: never usable as his face. `wan_face_putback.py` holds his photo's face on all 150 frames (head movement
  10 px). OBSERVED on the held version: a slight violet tint on his face after the first second.

## Older Allen: the face is HIM (Fendi, 20 Nov 2026); the neck fixed in T8 ($0, local)

Fendi on the T7 clip with his face held (`c90e03ab`), asked "Is clip 1 him?": **"Yes aside from the coloration of his
neck"**. Recorded on the asset. The likeness method is therefore the one in the section above: ONE photo (04), his
whole real figure, only the garment changed, his photo's face held on every frame of the clip.

OBSERVED on T7 (what he meant): the drawn neck was lighter and pinker than his face, with a pale strip under his left
ear, and from about 1 s a dark line under his chin where Wan's redrawn beard showed below the held face.

T8, $0:
- `scripts/edit/neck_to_face_tone.py` on the still: the neck (skin joined to his head, below the head mask, above the
  collar) takes his cheeks' Lab colour at 0.92 of their lightness, its own light and dark patches halved. His head is
  untouched (printed: max change inside the head mask 0). A percentile fit was tried first and FAILED (it stretched the
  pale strip greenish-white): do not use it.
- `scripts/edit/wan_face_putback.py` on the same Wan clip (no new render) with the mask of head AND neck, and
  `LIGHT=luma` (Wan's brightness change only, not its colour drift, which had tinted his face violet).
- Clip: T7 `older_v1/allen_older_T8_wan3_his_face_and_neck.mp4`, filed under `allen_solo/`, pending his word on the neck.

## Older Allen: T8's neck REJECTED; the cause found and fixed in T9 ($0, local, 20 Nov 2026)

Fendi on T8 (`333bfb56`): **"The neck is still super light. It doesn't match the skin tone of his face. It's extremely
apparent. And when you generate it, there was absolutely no movement at all. There should be just some slight
movement. But fix the neck first before generating anything, and then come back."**

What was wrong with T8 (VERIFIED by measuring frame 76, lightness 0-255):
- The neck is not light all over. Under his chin it is 46, at the collar 63-68; his jaw and chin are 50-52.
- A PALE BAND runs down the left side of his neck (viewer's left) at 104, up to 190 where it meets the collar. The light
  in the scene comes from the other side (forehead 126, that cheek 117; the cheek above the band is 77). A bright band
  on the shadow side is what he saw.
- T8's fix never reached the screen: the band is too thin to survive inside the hold's eroded mask, so the clip showed
  the video model's band, not the toned still's.
- Two agent errors on the way: (1) comparing the MEDIAN of the neck with the median of his cheeks said "neck darker
  than face" and hid the band; (2) the agent blamed a colour-cast difference; measured, the colour offset was 1 unit.
  Rule: for a tone complaint, measure small patches side by side (jaw, each cheek, each side of the neck), not medians.
- Dead ends, not posted: flattening the neck to one tone (a grey bib), scaling the whole neck (the band stays).

T9, `scripts/edit/neck_match_clip.py` (default `MODE=cap`), per frame:
- reference = his JAW (bottom fifth of his head mask), not his cheeks; any neck pixel lighter than 1.3 x the jaw is
  pulled down to it and takes his cheeks' colour; darker pixels keep their own shading;
- the bright sliver at the collar that the segmenter labels garment is included;
- his head is untouched (printed: max change inside the head mask 0). Only x 206-304, y 186-268 of the frame changed.
- Printed: brightest part of the neck 138 -> 89 on the clip (his face's brightest 157), 152 -> 70 on the still.
  Frame-to-frame change of the band: 0.42 before, 0.48 after (no new flicker).
- Filed, pending his word: clip `c8681178` (T8 with the fix, no new render), still `e77ee30f` (T7 still with the fix:
  the source for the next generation).

NEXT, only after his word on the neck: one Wan 3.0 generation from still `e77ee30f` ($0.50), camera locked, with
SLIGHT MOVEMENT asked for in the prompt (a small weight shift, a slow turn of the head of a few degrees, the sweater
moving with his breath); then `wan_face_putback.py` (his photo's face) and `neck_match_clip.py` on the result.
Risk to check: the face hold breaks on large head movement (10 px was fine on T7).

## Performance-shot ideas from Fendi (20 Nov 2026), recorded, NOT started

His words: "I have an idea for the performance shots. I was thinking stained glass windows, cathedral stained glass
windows, amazing scenery. You can find a real location to place me in or rebuild in Blender for possibly for that shot.
We may have to swap my outfit to a tuxedo, a purple label Ralph Lauren tuxedo, and also I was thinking about another
shot being a collage of different patterns and textures and materials, suede, leather, carbon fiber, wood grain, oak,
etc. I want that the background, the collage background, to be colorful because we're going to do some pixelation
effects."

1. **Cathedral, stained glass.** His real performance take placed in a cathedral with stained-glass windows: a real
   location plate (a photograph, or a Gemini still that reads as one) or a Blender rebuild (`scripts/edit/blender/`).
   Possible outfit swap to a Ralph Lauren Purple Label tuxedo. RECOMMENDATION (methods already proven): Genjutsu
   `dress-clip` + the face-preserving put-back for the tuxedo (`docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md`), a
   product picture of the exact tuxedo as the garment reference; a BUILT scene, not a flat still (PROBLEM INDEX: "He
   looks pasted on a still"); the motion budget of the build skill §3 (coloured light through the glass must stay
   constant on him: no sweeping light shafts across his jacket). Swap takes need still air.
2. **Collage of materials.** A colourful background collage of patterns, textures and materials (suede, leather, carbon
   fibre, wood grain, oak, ...) behind his performance, made colourful on purpose because pixelation effects come on
   top. RECOMMENDATION: build the collage from photographs of real materials in panels (Gemini stills per material or
   stock he owns), his take matted over it (`matte-video-proxy` + `composite_over_plate.py`); the pixelation is a
   VFX-pass step (Grokbot / After Effects) and needs the collage delivered as its own layer.
Open for him: which take(s) these go on, and the tuxedo's exact product picture.

## Older Allen T10: real movement, his photo's face held while he moves (20 Nov 2026, $0.50)

Fendi on T9: **"What are you prompting for the movement because it looks like a picture ... Alan is perfectly still. No
hand movement, no head movement ... nothing to symbolize that it's a video as opposed to an image."** Then: **"if the
motion gets too crazy, as long as there's something we can keep, a couple seconds ... we need a good 2 to 4 seconds of
solid movement ... if the prompt generates something crazy, as long as there's something in there that is keepable,
let's put it aside and use it as a montage to cut."**

Cause (VERIFIED, the prompt of Runway task `3cc872b8`): it said "his head does not turn or tilt ... he only breathes,
shifts his weight very slightly and blinks once". The agent wrote that to protect the face hold. RULE: never ask a
video model for stillness to protect a put-back; ask for the movement and make the hold follow it.

T10 (Runway task `f1cd363d`, Wan 3.0, 5 s, from still `e77ee30f`): the prompt asks for weight rocking, two nods, the
hand sign bounced then lowered, the other hand at his hem; head facing the camera; hands never above his chest.
OBSERVED as delivered (`4f53c575`): he steps about 150 px toward the car, bounces and drops the hand sign, looks down
at his hand in the middle; the camera drifts although the prompt locked it; the model redraws him as a slimmer,
different man from the first second (never usable as his face).

The flow-based hold (`wan_face_putback.py`) TORE his face from frame 40 (163 px of travel). New, $0:
- `scripts/edit/wan_face_putback_track.py`: the still's head and neck are moved onto every frame by the face
  landmarks of the render (one similarity transform, smoothed 1.5 frames), brightness-only light. It prints how far
  the render's head is turned from the still's view and lists the usable stretches. It cannot turn a face.
- The mask must be his silhouette only (head and neck mask AND person segmentation of the still): a loose mask carried
  a patch of the still's brick wall around his moving head (seen on the first run, fixed).
- `scripts/edit/neck_match_clip.py` now takes a folder of per-frame head masks (written by the tracker).
- Printed: face found 150/150; head travels 154 px; turned median 9.1, max 18.7 degrees; fit max 0.047 of the eye
  distance; neck's brightest part 128 -> 80; max change inside his head mask by the neck step 0.
- Held clip `838dce7e` (pending). KEEP frames 1-52 (0.0-1.7 s) and 93-150 (3.1-5.0 s). CUT 53-92: he looks down and
  the photo's face stays facing the camera.
- NOT checked by the agent: the clip in motion (only frames at 2x). A trembling head on his body would show only in
  playback; Fendi's eye decides.

For the next roll (each $0.50): keep the movement, ask again for the head to face the camera throughout (no looking
down), feet planted or one step only; keep every usable stretch as a montage cut.

## The living portrait (Fendi's idea, 20 Nov 2026): first test P1 ($0.27)

Fendi on the T10 held clip (`838dce7e`): **"The clip looks like he's coming out a picture which may work if we use it
as a split screen as a large portrait hanging on a wall."** DECISION (his): the held-photo look is used on purpose, as
a portrait of Allen on a wall that moves. Not yet said by him: which wall, which part of the song, what is on the
other half of the split.

P1:
- Wall plate `8d4b9e7a` (Gemini, job `77f470e1`, no references): dark walnut panelling, a large gilt frame in portrait
  format with a flat green card inside, a brass picture light, window light from the left. The agent's pick of room.
- `scripts/edit/clip_in_wall_frame.py`: finds the card's four corners, warps each clip frame (cropped x 50-607 of
  1284, his whole travel inside it) onto the card, lays the card's own light over it (lamp above, the lip's shadow),
  GAIN 0.82 so a daylight picture does not read as a TV in a dim room. Printed: max change outside the card 0.
- Clip: T7 `work/allen/portrait_wall/allen_portrait_wall_P1.mp4` (1920x1080, 5 s; filed under `allen_solo/`).
- Split-screen EXAMPLE only: `allen_portrait_wall_P1_split_example.mp4`, left = the wall's centre 960 px, right = 3 s
  of his car take (not synced to the song, not a slot).
- OBSERVED: the middle second (he looks down, the photo's face does not) reads less wrong inside a portrait, but it
  is still there; a cut can use 0.0-1.7 s or 3.1-5.0 s only.
- Open for him: the room (this panelled wall, or the cathedral of his performance idea), and the other half.

## The living portrait, corrected (Fendi, 20 Nov 2026): HIS gallery scene, test G1 ($0)

Fendi on P1 (the panelled wall and the split-screen example): **"That's not what I meant by split screen and I used
the wrong terminology the portrait can work but we need a more creative realistic scene with it. Try the image I
uploaded."** So: NO split screen; the panelled room P1 (`3ea1cd75`, plate `8d4b9e7a`) is set aside. His image: a
bright gallery wall with four pieces in a row: a walnut shadow box with a white winged rose on blue, an EMPTY ornate
gilt frame, a small plaque with a dark metal rose, a red rose painting. Allen's portrait goes in the empty frame.

G1, $0, his image untouched outside the frame's opening (printed: max change outside the opening 0):
- `scripts/edit/clip_in_wall_frame.py` with `RECT=449,172,567,333` (the opening, in his image's pixels), `SUPER=2`
  (built at 3840x2160), the opening's own light laid over the picture, GAIN 0.82. Clip crop x 72-597.
- Push-in (`ZOOM=2.6`, eased, from the whole wall to the frame) and the wide shot held: T7
  `work/allen/portrait_wall/allen_portrait_gallery_G1_push.mp4`, `..._wide.mp4`.
- OBSERVED: his image is 1024x572, so the wall and the gilt frame go soft as the camera closes in; the portrait itself
  stays sharp. The room is a still: nothing in it moves but the camera and the portrait.
- RECOMMENDATION if he likes the direction: one sharper copy of his scene (Gemini, his image as the reference, 2k,
  $0.27) so the push-in holds up, and life in the room (window light drifting across the wall) built in layers.

## The gallery shot (living portrait): G2 sharp, and HIM at the far right (20 Nov 2026, $0.36)

Fendi on G1: **"First one is much better"** (the push-in). **"Is there a way to add me with clothing swap on the far
right of this shot as a b role shot"**. **"You can do the sharper image one you reference too first if you need to."**
**"Make sure it's at a point where I reference Allen."**

G2 (sharper plate, $0.27): Gemini 2k from his image `e122d96c` as the `place` reference, "reproduce exactly", a green
card in the gilt frame: plate `348d1c96` (2752x1536). OBSERVED: same wall, pieces, places and light; the gilt carving
is crisp at the end of the push-in. `clip_in_wall_frame.py` fix: the card's edge sits in the lip's shadow, so dark green
counts as card (a bright-only test left a green line). Push-in: T7 `portrait_wall/allen_portrait_gallery_G2_push_sharp.mp4`.

WHERE IN THE SONG (his rule: a line that references Allen). First-half lines that do, from the table above:
0:15-0:18 "My partner Allen" (taken by the approved car shot), **0:44-0:51 "Every time I put the polo on / Wishin you
was here ... livin through these songs"**, 1:16-1:23 "Speaking to your spirit ... see you in my dreams", 1:30-1:47
"Clean with my partner nem'". RECOMMENDATION: 0:44-0:51, because the portrait shows Allen in the Polo Bear sweater on
the line about putting the polo on. His to confirm.

HIM in the shot (method: his REAL footage, placed; `docs/recipes/HIS_FACE_IN_ANY_SCENE.md`):
- Footage: he is not rapping between room takes B and C. `mouth_scan.py` on file 238-258 s: lip gap 0.00-0.02 from
  240.6 to 244.5 s. Clip `98c51f4d` (240.6-244.7 s, 4.1 s for Genjutsu's 4 s minimum); usable at rest 241.6-244.4 s
  (2.8 s): front-on, hands clasped, tan leather jacket, black cap, glasses, jeans, thighs up, no fan.
  The side-profile take D has no rest stretch (he raps throughout; the scanner finds his face on 35 of 673 samples).
- Matte (`matte-video-proxy`, veed, job `fd222489`): as delivered it KEEPS HIS GREEN QUILT on and off
  (`matte_stability.py`: 55 of 84 frames see-through in the bottom region, a quilt-shaped blob by his shoulder).
  New, $0: `scripts/edit/matte_minus_green_backdrop.py` (per frame: delivered matte minus backdrop-green in the
  picture; green inside him restored from the delivered matte; thin streaks beside him dropped; removes only, adds 0,
  nothing carried between frames). After: see-through frames top 1, middle 1, bottom 34 (6,496 px in all; was 434,034).
  NOT a row of PROBLEM_INDEX yet: a test, shown to Fendi. Not for a take where he wears green.
- Placed with `composite_over_plate.py --scale 0.8 --cx 1722 --push 0.015` over the wide gallery plate with the
  portrait playing. Scale chosen so his eyes sit at the height of the art's centre (the camera's eye level); at that
  size he covers the right edge of the red rose and his arm touches the frame edge.
  T7 `work/gallery_him/gallery_him_T1_own_clothes.mp4`. OWN CLOTHES: a position test only.
- NEXT, needs his word: the OUTFIT (a picture of the exact garment for the swap). Then `dress-clip` (Genjutsu,
  about $0.68 per source second, 4.1 s = about $2.80) on `98c51f4d`, `body_only_swap.py` put-back (his face 0),
  matte of the put-back + the quilt step, the same placement. Swap takes need still air: this stretch has none moving.
