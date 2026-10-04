# The source-footage analyzer — built and run on real takes · 4 October 2026

**What it is for (Fendi).** The October restaging kept the location, the man and his clothes, and still failed on
framing, light, the moment a thing happens, the camera's move and the performance. Those five are properties *of the
take*, and nothing was reading them. This reads them off the footage before anything is paid for, and turns them into
what a background would have to be for that take to sit in it.

**Status: working on real footage, advisory only.** It regenerates nothing, replaces nothing, edits no treatment and
moves no timeline. $0 spent — no provider call of any kind was made for this work.

---

## 1 · What was reused rather than rebuilt

Nothing here is a second analysis pipeline. The three readings the app already makes of a file are what it is built on:

| existing | what it gave |
|---|---|
| `src/lib/media/probe.ts` + `mp4.ts` | the container, by byte range, with no media element |
| `src/lib/media/frameSeries.ts` | every frame as a 12 × 12 grid of colour (`eachFrame`, `cellsOf`) |
| `src/lib/media/faceSeries.ts` | his face on every frame — MediaPipe landmarks, with the closer-window search |
| `src/lib/storyboard/takeCheck.ts` | `faceOf`, and `reach` — how far below his eyes the frame goes, in eye-distances |

Added, because nothing measured them: `src/lib/media/detailSeries.ts` (sharpness per tile, frame-to-frame movement,
clipping) and, in `mp4.ts`, the two container facts the brief asks for that were not being read — **rotation** (from
the `tkhd` display matrix) and **colour transfer** (from `colr`).

New pure modules: `storyboard/footage.ts` (the analysis), `storyboard/compatibility.ts` (the background spec and the
route), `storyboard/footageRecord.ts` (versioning, staleness, evidence). IO in `queries/footageAnalysis.ts`, panel in
`components/storyboard/FootageAnalysis.tsx`, on the source take in the Media view.

---

## 2 · How it was validated, and what that proves

Real footage, not a synthetic series: three takes pulled from `project-clips` — **S06**, **S09**, **S11**, the
original takes behind shots 39–42. Each is 1080 × 1920, 30 fps, H.264, **HLG (`arib-std-b67`)**, no audio track.

The app's analyzer runs in a browser. There is no browser on a build box, so `scripts/qa/footage_frames.py` writes the
same three rasters the browser draws plus the same face landmarks (the same pinned model), and
`scripts/qa/footage_report.mts` feeds them to the **real exported functions** — `cellsOf`, `lumaOf`, `sharpTiles`,
`bestShift`, `faceOf`, `lumaSpread`, `analyzeFootage`, `compatibilityOf`. Nothing is reimplemented, so a number in
these reports is a number the app produces.

**The harness checks its own mirror.** The Python copies `closerWindows()` to find a small face; the Node runner
asserts that list against the real function and refuses to report if they have drifted apart. That matters: a
whole-frame pass alone found a face in **2 of 209** frames of S06; with the window search it finds **209 of 209**.

**Where the harness and a tab differ, and it is printed on every report:** the scaler (ffmpeg swscale vs canvas
`drawImage`), the tone-map of an HLG frame, and the face pass (the harness does one whole-frame try before the
windows). Numbers are close, not identical.

---

## 3 · The reports

Full text in `S06.report.txt`, `S09.report.txt`, `S11.report.txt`; the records in the matching `.analysis.json`.

| | S06 | S09 | S11 |
|---|---|---|---|
| face found | 209/209 | 99/119 | 209/209 |
| eye-line across frame | 0.505 | **0.601** | 0.492 |
| travels across | 41 % | 41 % | 36 % |
| reach (eye-distances) | 11.47 | 10.97 | 11.62 |
| coverage (estimated) | thigh up (0.45) | waist up (0.40) | thigh up (0.48) |
| camera | locked · still | locked · still | locked · still |
| key direction | above | above | above |
| softness (uncalibrated) | medium | **hard** | **hard** |
| separation | moderate | moderate | moderate |
| feet in frame | no | no | no |
| route | composite | composite | composite |

**Different footage, different advice.** S09 places him at 60 % across where S06 and S11 put him at ~50 %, so its
first hard constraint — the band to keep clear for the performer — is a different sentence. S09 also loses his face
on a fifth of its frames and says so, rather than averaging over the gap.

**What the advice comes to, on all three:** *put this performance over a background*, because the camera is locked
and — the point — his performance, timing and lip movement survive a composite exactly, which is the thing the
restaging kept failing. And immediately beneath it, the two things AVT cannot do to deliver that:

> * AVT has no matte step for ordinary footage: `scripts/edit/composite_environment.py` composites against a plate
>   with hand-set occluder bands, and nothing pulls a per-frame matte of him.
> * AVT has no colour-transfer step: nothing converts `arib-std-b67` footage to the space a generated plate is
>   produced in, or back.

A recommendation is not proof it can be executed, and the panel says so in the same breath.

---

## 4 · Measured, estimated, unknown

The discipline is enforced by a rule, not by care: **a constraint is HARD only where the finding behind it was
MEASURED.** An estimate produces a *preference*; an unknown produces a named risk and no requirement at all. A
preference that is missed is a note; a hard constraint that is missed is a reject — only measurements earn that.

**Measured** (read from the container, or arithmetic over frames that does not guess): resolution, aspect, fps,
duration, rotation, codec, transfer, audio presence; face coverage, screen position, travel, scale, reach, which
edges his face passes near; unsteady steps, worst step; exposure, clipping, colour cast, edge contrast; peak
sharpness, share of blurred frames.

**Estimated** (with a confidence and a stated limit): body coverage from reach; camera stability and what the motion
is attributable to; key direction; softness; subject-versus-background sharpness and depth of field; separation
difficulty; whether his feet are in frame and a contact shadow is needed.

**Never claimed.** Focal length, aperture, sensor size, camera height, distance to anything in frame, how many lights
and where they stand, how a matte will behave on his hair or the brim of his cap, and lip sync — which is a
comparison against a take and cannot be judged from one file (`takeCheck.ts` does that, and this defers to it).

**Still uncalibrated, named as the brief asks.** Four:

1. **softness** — reads the left-to-right brightness difference across the band he stands in, at 12-cell resolution,
   which the wall beside him also contributes to. S06 reads medium and S11 reads hard in the same room under the same
   light; by eye both are soft. *Treat as a hint, never as a lighting spec.*
2. **keyDirection** — reads where the picture is brighter, not where a lamp is. Correct on these three (the ceiling
   fitting is above), but a bright wall on one side would read the same.
3. **subjectVsBackground / depthOfField** — the tiles he occupies are guessed from his *face*, not from a cut-out.
4. **separation difficulty** — a reading of the picture; no matte was pulled.

An earlier version of softness read the whole frame's vertical falloff and called S06's soft ceiling light "hard" —
in a 9:16 room that measure is ceiling-against-floor. It was replaced after looking at the frames.

---

## 5 · What running it on real footage changed

Two things that a synthetic series would never have shown:

* **A false face detection was changing the production advice.** Four early frames of S09 came back with an eye
  distance of 11–46 px on a 1920-tall frame. One put the bottom of frame **109 eye-distances** below his eyes —
  three and a half bodies — which read as a full-length figure with his feet in shot, and would have asked the
  background for a floor and a contact shadow this take has no use for. The analyzer now drops a face below
  `MIN_FACE_SIZE`, and reports how many it dropped and why.
* **The window search is load-bearing, measurably.** 2 of 209 frames against 209 of 209 on S06.

Both are in the tests, with the measured numbers in the comments.

---

## 6 · Evidence frames — looked at, not just computed

* `S06_contact_sheet.jpg`, `S09_contact_sheet.jpg` — what these takes are.
* `S06_travel_frames_15_and_126.jpg` — the two frames that bound the 41 % travel reading. His head is plainly right
  of centre in one and left of centre in the other. **The measurement is right.**
* `S09_eyeline_frame34_marked.jpg` — the measured eye-line (0.601, 0.352) drawn on the frame it was measured from.
  It lands on his eyes.

A first check of the S09 position drew the *median over the whole clip* on a *single frame* and appeared to be
wrong. It was the check that was wrong, not the analyzer; it is recorded here because the corrected check is the
evidence, and because a reader should know which way that went.

---

## 7 · Checks performed

* `vitest run` — whole suite green. New: `footage.test.ts` (21, discipline and arithmetic),
  `compatibility.test.ts` (17, the hard-vs-preferred rule and the route), `footageRecord.test.ts` (17, versioning and
  staleness), `footage.real.test.ts` (16, **real footage**), plus `mp4.test.ts` for rotation.
* `tsc --noEmit` clean; eslint clean on the new files.
* The real-footage fixtures (`__fixtures__/take_S06.json`, `take_S09.json`) are subsampled frames of the actual
  takes, every reduction made by the shipped functions.
* The container reading was checked against ffmpeg on all three files: same size, same rotation, same transfer.

**What the tests do not establish:** that the vision is correct in general. They pin what it currently sees on two
real takes filmed in one room on one camera. A different room, a moving camera, a second person, a dark take or a
wide lens are all unproven, and the first three are the ones most likely to be wrong.

---

## 8 · Green-screen validation, for when the screen arrives

A green screen is **not required** to use any of this, and nothing above assumes one. When the footage exists, this
is the procedure. **Wearing green does not enable garment replacement** — background removal and garment replacement
are different operations, and this analyzer speaks only to the first.

1. **Film three takes in one session, same lens, same distance, same light:**
   a. the performance as it would really be shot, against the screen;
   b. the same performance, same framing, against the ordinary wall — the control;
   c. one take where he steps to within a hand's width of the screen edge, deliberately.
2. **Record for each:** the camera, lens and distance, the screen's lit stop against the key, and whether his feet
   are in frame. The analyzer does not measure these and will not pretend to.
3. **Run the analyzer on all three** (Storyboard → the take → *Read the footage*; or the harness for a file on disk).
4. **What should be true, and is a real test because it can fail:**
   * `file.*` and `subject.*` should agree between (a) and (b) to within a few per cent — same framing, same reach,
     same position. If they do not, the analyzer is reading the *background* into findings that are supposed to be
     about *him*, and the separation work is built on sand.
   * `separation.difficulty` should fall from (b) to (a). If it does not, the difficulty estimator is not responding
     to the one condition that is unambiguously easier, and should be treated as decorative until it is fixed.
   * `colourCast.strength` should rise sharply on (a). That is the only *measured* signal a screen gives this
     analyzer today.
   * On (c), `subject.faceNearEdge` should name the edge. It reads his **face** only — if his shoulder crosses the
     edge and his face does not, it will stay silent, and that is a known hole, not a bug.
5. **Add a green-screen mode only after this**, and only for what the footage shows it can carry. On the evidence so
   far that is the cast measurement; difficulty is an estimate and should stay one.
6. **Do not** conclude from a successful run that AVT can key the footage. Nothing in AVT pulls a matte today. That
   gap is in §3 and will still be there.

---

## 9 · Dependencies, and what is deliberately not built

Named, not expanded into: a compositor, a matte/keying step, new rendering infrastructure, and garment replacement
are all outside this tranche. The analyzer reports them as gaps where a route needs them.

One real dependency to flag: the panel runs three frame-by-frame passes over a stretch of a file, bounded to
`SERIES_MAX_SECONDS`. It is pressed, never automatic, and reports each stage. It does not block playback, but on a
long take it is slow, and a shot-stretch range should be plumbed through from the box rather than defaulting to the
whole file — that is the next sensible piece of work.
