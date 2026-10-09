# Real-world frontend production test on YSL — 2026-10-03

Fendi: "This is no longer primarily an architecture exercise. The objective is to determine whether the redesigned
AVT can actually be used as the PRODUCT to create a real section of the YSL video." Setup → Treatment → Storyboard →
shot production → Review, on the real project, through the pages a director uses. Where the product could not do a
step, the product was changed, published, and the step was done again through it.

Main at the end of the round: `9677edd` (+ this revision's docs). Published app code: `9677edd`.
Spend ≈ $56.47 at list prices (ledger rows 40–44).

## The answer first

**Product: yes, with named limits.** The 45.1 s section was written, drawn, restaged, cut-checked and reviewed from
the app's own pages. No shot JSON, no database row, no ffmpeg cut and no assembly script stands behind it. The
database was read (never written) for diagnosis and for the spend count.

**Video: not release-ready.** It is a real, coherent section — his real performance carries six of thirteen shots,
in his own clothes, in three places that belong to one film — and Astra's fourth look still says "good, with shots to
fix": the hook's idea (the lights go out and the ice is the only light) is not on screen. That idea needs the light
to change *inside* a shot, on a lyric. Nothing in the product does that yet; see "What is still missing".

## The window

- **In:** 47.06 s — the start of shot 13 (`c013`), the bar boundary before verse 2's first line ("Yves Saint
  Laurent", 47.6 s). The first clean lyric / bar boundary after 0:45.
- **Out:** 92.16 s — the end of shot 25 (`c022`); the last hook line ends at 90.4 s.
- **Length:** 45.10 s. Review link: `/projects/764a63d2-93cd-44f3-905f-292f14ab2f51/review?from=13&to=25`.

The brief also said not to return to bars 24–46 "simply because that section already has extensive engineering
history". The 0:45 rule lands inside those bars. The explicit rule was followed and the section was produced fresh:
a new treatment, new scenes, new pictures, new clips. Nothing from the earlier engineering rounds is in it.

## Setup (through the Setup page)

Confirmed intact, not rebuilt: the 3:21 master (201.87 s, 122 BPM), 95 lyric lines (untouched — the hosted
re-timing was not applied), one take matched to the song (offset 0.8538 s), frame 9:16.

Added, because the writer and the restaging both needed it and the page had nowhere to say it: two fields on the
take. *He wears:* "a woodland-camouflage short-sleeve military shirt with a small flag patch on the chest, a navy
baseball cap, glasses, a short beard, dark jeans". *Filmed in:* "from the thighs up, facing the camera, in front of a
white door in a walk-in closet".

## Treatment (through the Treatment page)

One text. The project's older notes and the older treatment were replaced on the page — the brief asked for one
authoritative treatment and no competing walls of instruction.

**A record that could not be kept.** Both older texts were read into the working session before they were replaced,
to be quoted here. That session's earlier output was lost when its context was compacted, and the database keeps no
history of either field, so they cannot be quoted. What survives of the earlier writing: each shot's previous scene
text, under that shot's **Versions** tab. If the old notes mattered beyond that, they are in Fendi's own copies, not
in AVT.

The direction now saved (the page's one notes field):

> FORMAT: vertical 9:16, no letterbox. PERFORMANCE: the real take is the spine of the video. Performance shots are
> his real performance - as filmed, or restaged in one of the places below. He always wears exactly what he wears in
> the take; never write another outfit on him. PLACES (reuse these, do not invent others): 1) backstage fitting room
> - garment racks of white and black pieces, a wall of bulb mirrors; 2) the runway - black floor, one line of white
> light down the centre, the front row in darkness with camera flashes; 3) outside - a black car on wet night
> streets, the highway out of the city. HOOK ('you don't gotta cut the lights on / this ice on'): the lights go out
> and the ice is the only light. 'I wear em like they white ones': white sneakers treated like couture, couture
> treated like sneakers. CUTAWAYS: 3-5 s, one clear subject, cut on the beat. No readable logos or text, no crowds in
> close-up, no hands in close-up, no stock luxury (no champagne, no cash, no private jets). REALISM: everything
> photoreal and filmable; slow, simple camera moves (push-in, slow orbit, locked).

The treatment written from it (AVT's own writer, `grok-4-fast`): "A Paris runway at night becomes the only stage:
performance footage of the artist in his camo shirt and cap is restaged inside the fitting room, on the black
catwalk, and in the idling car, while cutaways answer every lyric with fabric, ice, white sneakers, and camera
flashes."

"Generate treatment" rewrote the 41 open shots of the board, as it is built to. The two locked shots outside the
window (06 and 09) were kept.

## Storyboard — shots 13 to 25

Three shots were split on the page to give the performance somewhere to come back to (43 → 46 shots).

| Shot | Key | Song | Kind | What it shows | Made from |
|---|---|---|---|---|---|
| 13 | `c013` | 0:47–0:50 | Performance | him, in the fitting room | take, restaged |
| 14 | `c014` | 0:50–0:54 | B-roll | boxy black sedan on a wet empty highway | image → clip |
| 15 | `c015` | 0:54–0:58 | Performance | him, on the wet street by the car | take, restaged |
| 16 | `c016` | 0:58–1:02 | B-roll | the sedan, headlights on, passing out of frame | image → clip |
| 17 | `c017` | 1:02–1:06 | Performance | him, runway in darkness, flashes behind | take, restaged |
| 18 | `c018` | 1:06–1:10 | B-roll | empty black runway, two flashes in the dark | image → clip |
| 19 | `c019` | 1:10–1:13 | B-roll | plain white sneakers on the runway's light line | image → clip |
| 20 | `c019_2` | 1:13–1:16 | Performance | him, on the runway | take, restaged |
| 21 | `c020` | 1:16–1:19 | Lyric visual | a diamond chain on black | image → clip |
| 22 | `c020_2` | 1:19–1:22 | Performance | him, low angle, lit only by the runway | take, restaged |
| 23 | `c021` | 1:22–1:25 | B-roll | white suit walking the light line, shoulders down | image → clip |
| 24 | `c021_2` | 1:25–1:28 | B-roll | rack of white garments, gold bulb mirrors | image → clip |
| 25 | `c022` | 1:28–1:32 | Performance | him, runway, camera orbiting | take, restaged |

Six performance shots and seven cutaways; never more than one cutaway before he is back, except 18–19 and 23–24.

## Media mix — the brief's list A to J

| | Asked | Done | How |
|---|---|---|---|
| A | synchronized performance footage | yes | the matched take is the base layer of every shot and the source of every restaging; Check this cut measures 0 ms off the song clock across 1,628 moments |
| B | uploaded non-AI footage | **no** | the project holds no uploaded B-roll; none was invented to tick the box |
| C | generated storyboard image | yes | 27 presses of Generate image / Generate the place |
| D | generated storyboard clip | yes | 20 clips (seven shots, with repairs) |
| E | AI-edited performance shot | yes | "Restage the take": 12 restagings over six shots |
| F | B-roll / environment | yes | shots 14, 16, 18, 19, 23, 24 |
| G | moving an asset between shots | yes | one runway place put on shots 20, 22 and 25 from the picker; a still from 18 put on 17 and taken off again |
| H | regenerating one shot without disturbing neighbours | yes | "Regenerate scene" on 16; images, clips and restagings shot by shot through three repair rounds — Check this cut confirms footage only on the shots it is assigned to |
| I | previewing media in the shot | yes | poster, five frames per piece of footage, image thumbnails in the media list |
| J | full-screen shot navigation | yes | every edit and inspection was done in the shot view, moving shot to shot |

Also used, because the work needed them: **Versions by choice** — a restaging and a clip that came back worse were
put aside with "Show this" on the earlier one; nothing was deleted.

## What broke, by class, and what was done

Every item below was found by trying to make the section, fixed in AVT (no YSL-only code), covered by a test, and
published before the work continued.

| # | Class | What happened | Fix | Commits |
|---|---|---|---|---|
| 1 | Provider | "Generate treatment" failed: Control Center's writer returned "Anthropic returned 404" | AVT's own treatment and storyboard writer (`treatment-writer-proxy`); a failed call now says why in the function's words | `592c551` `f806306` `9e8894a` `a4d97c1` `a79c532` |
| 2 | Creative | the first treatment was nine performance shots in ten, repeating one sentence | the writer cuts like a music video: he carries the song, the picture leaves him and comes back; each shot is written against the words sung in it; it is told the artist is real footage | `46adad5` `8c9c957` `0c1a3c8` `1d39c33` |
| 3 | Product UX | two notes fields, read differently by different writers | the director's notes are one text, shown, saved and sent whole | `332e97e` `da5b0cd` `8dd0c77` `a38b8df` `82d7097` |
| 4 | Product | a performance shot had no clip that was him — "Generate clip" would draw a stand-in | **Restage the take**: the shot's stretch of the real take, cut in the browser to the frame, re-shot inside the shot's place, filed as a take in sync with the song | `09c2b29` `29ce836` `fb46206` `51665ef` `81f0a1d` `e62b426` `6fb421f` |
| 5 | Timing | a cut of a long-GOP take opened seconds early; later, one frame late | exact cutter (decode, re-encode, mux); the cut opens on the frame showing at the moment asked for | `09c2b29` `3b05085` |
| 6 | Data model | nothing recorded what he wears or where the take was filmed, so writers dressed him and the image model drew the closet | two fields on a take, used differently: what he wears is kept; where it was filmed is what a restaging leaves behind | `e98e9a2` `627a460` `a7d173f` `6ce64eb` `cb7739b` |
| 7 | Generation | the place drawn for a performance shot had a stranger standing in it | the place is drawn empty, from the director's frame or the writer's place, never from the sentence about him | `3d0cdd7` `61f3760` `f0695c0` |
| 8 | Product UX | a confirmation could not be pressed while the last one's work ran | the dialog closes at once; the work reports on its own shot | `c30fdf5` |
| 9 | Timing | a restaged clip 7 ms short of its shot was marked "covers only part"; the first fix moved it 7 ms off the clock and Check this cut caught it | under a frame short counts as covering; the placement stays exact | `ac05dd0` `8787209` |
| 10 | Media assignment | putting a place image on a performance shot replaced the take as what the shot shows | the take keeps showing | `3a7f8ee` |
| 11 | Review | no way to look at part of the song; Check this cut failed its player check when a section was on the page | Review takes a section (from shot to shot): the player, the frames and the checks follow it | `b94495b` `7e98c76` `f63d9da` `95ddf20` `98544e3` `173e132` |
| 12 | Review / QA | a second opinion could only be had outside AVT | "Ask Astra" in Review: three frames a shot with the treatment and each shot's intent; findings by shot number, each opening its shot | `c5d0dc4` `0636c9a` |
| 13 | Product UX | a shot's images could not be seen in its media list | thumbnails in the list | `0636c9a` `9b05232` |
| 14 | Generation | a restaging asked for a wider frame than the take drew legs — in shorts | the restaged frame never shows more of him than the take filmed | `ab8384b` |
| 15 | Generation | white sneakers came back with a sportswear logo, a wall with lettering | every image is asked for without logos, marks or lettering | `884f451` |
| 16 | Media assignment | a clip or restaging used the first image ever drawn for its shot, not the one just drawn | the chosen image, else the newest | `fdff084` `0e29ef6` |
| 17 | Generation | restaged into a dark place he came back front-lit, or with a pale fringe | he takes the place's light and nothing more; edge and grain named; the script's copy held to the same sentence | `a83a796` `a274da5` |
| 18 | Generation | a cutaway had a dark border; a near-black still came back as a scanned film frame (edge glow, scratches) | every image is the whole frame and the scene itself, not a scan of film | `140c340` `1192a59` |
| 19 | Product UX | Restage and Clip said "this shot's image" without showing which — one restaging went into a place that put a light line through his face | the confirmation shows the picture and names it | `9677edd` |

## Generation and provider results

- **Stills** (xAI, through `world-still-proxy`): 27 presses, two candidates each, none refused. Rejected by eye and
  redrawn: a sedan on a commercial strip with signs; a different sedan with dead headlights; a runway with a crowd
  and wall lettering; logo sneakers; a rack with an arm entering; two frames with a border or film-scan edge.
- **Clips** (Kling 2.5 turbo pro through Higgsfield): 20, all returned. One put aside (the diamond chain as a
  sparkler); the earlier version of that shot shows.
- **Restagings** (Seedance 2.5 reference-to-video, 720p, 4 s in / 4 s out): 12, all returned, 3–8 minutes each.
  His face, cap, glasses, beard, shirt and flag patch held in all twelve. Rejected: shot 22's first (legs in
  shorts — fix 14), shot 25's first (same), shot 17's fourth (the runway's centre line drawn through his face —
  fix 19). Small inventions that were let stand: a unit patch on the sleeve in several shots.
- **Gate 0** (visible Fendi, correct wardrobe, photoreal enough to sit beside real footage): met on all six
  performance shots as they now show. Shot 22 is deliberately dark; he is still plainly him.

## Astra, four looks

Through Review's "Ask Astra", $0.33 / $0.30 / $0.32 / $0.31. Every finding named a shot; every repair was made on
that shot only.

| Look | Verdict | Findings | Shots named |
|---|---|---|---|
| 1 | revise | 10 (9 major) | 14 street with signs · 16 different car · 17 hook not dark · 18 crowd, hands, wall text · 19 logos · 21 lint, lit from the start · 22 shorts · 23 spectators · 24 mirrors, an arm · 25 trousers read as shorts |
| 2 | revise | 6 | 17 front-lit · 18 a spotlight, not flashes · 20 framing · 21 lit from the start · 22 cut-out fringe · 24 border |
| 3 | revise | 7 | 17 · 18 floor glow · 20 coloured beams · 21 · 22 · 24 mirrors unlike shot 13 · 25 beams |
| 4 | revise | 5 | 17 · 18 · 20 · 21 · 22 |

Not raised again after repair: 14, 16, 19, 23, 24, 25; logos, crowds, hands, wrong wardrobe, borders. Unaffected
throughout: 13, 15.

Astra's last word: "Not ready as supplied. Shots 17, 18, 20, 21 and 22 need targeted lighting or footage
replacements to establish the blackout hook." Its strengths list: the artist is consistent across performance
frames; the wet-road passage is convincing; sneakers and tailoring connect through the runway's light line; the
backstage return is coherent; the vertical frames are filled.

After the fourth look, shot 21 was put back to its earlier clip (clean stones on black) — the finding stored for 21
describes the clip that was put aside.

## QA

- **Check this cut**, on the section, after the last change: "Everything that can be checked without watching it
  holds. 46 shots · 2019 moments of the song stepped through." Twelve checks pass, among them: 16 of 16 files open
  and decode; no gap or overlap; every shot plays what is selected on its own record; AI footage only on its own
  shots; performance 0 ms from the song clock at 1,628 moments; nine returns to the take land on the clock; nothing
  runs backwards. The thirteenth — the player itself, played — reports "not run": the only signed-in browser window
  is not on screen, and a browser loads no video or sound in a window that is not shown.
- **Contact sheet** (three frames a shot, 39 frames): inspected after each round.
- **Not measured:** lip sync on the restaged clips, and the cut in motion with sound. Frames cannot establish
  either; Astra says the same. This is the one check that needs a screen.

## What is still missing — in the product, not in the effort

1. **Light that changes inside a shot.** The hook wants a blackout on a lyric. A clip is made from one still and a
   restaging from one place, so each shot has one lighting state. Needed: a look step on a shot (a keyed dim to
   black over a stretch of the song, applied at render) or first-frame / last-frame generation.
2. **One place across shots.** A place can be put on several shots by hand (done for 20, 22, 25), but cutaway
   stills are drawn one at a time from words; the car in 14 and 16 and the mirrors in 13 and 24 match because the
   words were made to match. Needed: a named place (and object) that shots point to.
3. **A restaging does not read the floor.** Put on a runway with a bright line where he stands, the model drew the
   line through him. The confirmation now shows the place; a check on the returned clip does not exist.
4. **Jobs move only while the storyboard is open.** Leave the page and a clip waits to be collected.
5. **No rendered file from Review.** The section's location is the Review link above; Export was not exercised.
6. **Uploaded non-AI B-roll** was not exercised (item B).
7. **The stored review is the latest one only**; a shot changed after it keeps the old finding until Astra is asked
   again.
8. **Under an edited shot, the writer's older lighting and purpose stay in the record.** Not shown and not sent to
   any model, but they are there.

## Regression

vitest 170 files and 1,840 tests pass (1 file, 1 test skipped) · `tsc --noEmit` clean · `vite build` clean · pytest 31 pass ·
`scripts/e2e-local/run_storyboard.py` PASS, 0 samples off the song clock.

## State left on the YSL project (Fendi's data)

- 46 shots (43 before; `c019`, `c020`, `c021` split). 41 rewritten by "Generate treatment"; 06 and 09 kept.
- One notes text and one treatment, replacing the older ones (see "A record that could not be kept").
- The take carries what he wears and where it was filmed.
- Shots 13–25 carry the footage above; every earlier image, clip and restaging is still on its shot under Media,
  not showing. Twelve restaged clips are filed as takes of their own moment, each with its own place on the song.
- 95 lyric lines, the take's match, the frame: unchanged.
