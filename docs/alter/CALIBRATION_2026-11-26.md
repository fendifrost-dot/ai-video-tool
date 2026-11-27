# ALTER mouth gates: what was measured on Fendi's footage (26 Nov 2026)

Cost: **$0**. Local only: `scripts/alter/track_mouth.py` on this Mac, the put-back's MediaPipe files, ffmpeg. No provider
call, no download. Labels: VERIFIED (the number printed by the run) / OBSERVED / DECISION / HYPOTHESIS / RECOMMENDATION.
This is evidence from two takes. It is not a certified benchmark (`docs/REPRODUCIBLE_BENCHMARK_SYSTEM.md`): nothing is
frozen, and Fendi has judged none of these scores against his eye.

## The clips (T7, Partnership / Cease & Desist work folders)

| Set | Clips | Why |
|---|---|---|
| Real redraws | wall take `night_20nov/wall_take/original.mp4` (4 s, 30 fps, he raps) against seven Genjutsu whole-frame swaps of it (22.4 fps as delivered); `swap_test_s5/original.mp4` (6 s) against its swap | a model redrew his whole face while keeping the performance: what a redraw that follows his mouth scores |
| Same take, smaller | each take against a 480p CRF 28 copy of itself | the best any 480p draft can score: the tracker's own noise |
| Wrong moment | each take against itself moved 1, 2, 3, 4, 6, 12, 24, 36 frames | his own mouth at the wrong time: what must fail |

Frames are paired by time when the rates differ. Face read on 100% of the wall clips, 95.6% to 97.8% of the S5 clips.

## Results (VERIFIED: `/Volumes/T7/_avt_work/alter_calibration_2026-11-26/calibration.json`)

| Case | Timing on the clock | Best fit, at lag | Mouth shape (face widths) | New gates |
|---|---|---|---|---|
| 7 redraws of the wall take | 0.934 to 0.950 | same, 0 frames | 0.026 to 0.029 | pass |
| redraw of S5 | 0.744 | same, 0 | 0.026 | pass |
| wall take at 480p | 0.953 | same, 0 | 0.030 | pass |
| S5 at 480p | 0.775 | same, 0 | 0.032 | pass |
| moved 1 frame (wall / S5) | 0.950 / 0.810 | 1.000 at 1 | 0.023 / 0.016 | pass |
| moved 2 frames | 0.883 / 0.552 | 1.000 / 0.991 at 2 | 0.039 / 0.020 | fail (re-timed) |
| moved 3 frames | 0.825 / 0.316 | 1.000 / 0.979 at 3 | 0.055 / 0.024 | fail |
| moved 4 frames | 0.792 / 0.146 | 1.000 / 0.974 at 4 | 0.069 / 0.027 | fail |
| moved 6 frames | 0.737 / 0.027 | 1.000 / 0.970 at 6 | 0.095 / 0.032 | fail |
| moved 12 frames (0.4 s) | 0.567 / -0.115 | 0.744 / 0.031 | 0.158 / 0.039 | fail |
| moved 24 frames | 0.040 / -0.089 | 0.281 / -0.070 | 0.221 / 0.045 | fail |
| moved 36 frames | -0.562 / 0.070 | -0.333 / 0.115 | 0.196 / 0.047 | fail |

## What the numbers say

- VERIFIED: the first pass's single gate (timing 0.60 on the clock) would have passed the wall take moved 6 frames, a
  fifth of a second out of sync (0.737). On a take with slow, wide mouth movement the on-clock number alone does not
  see a late mouth. The lag does: every case moved 2 or more frames fits best off the clock.
- VERIFIED: the same footage at 480p scores 0.775 on S5. A draft cannot score higher than the take's own copy, so a
  fixed line near 0.8 would reject a perfect redraw of that take.
- VERIFIED: mouth shape separates the wall take's wrong moments (0.039 and up) from its redraws (0.029 and under) but
  not S5's (0.016 to 0.047 against a noise of 0.032). It is a second witness, not the judge.
- OBSERVED: every Genjutsu redraw kept his mouth on the clock. Genjutsu is a motion-preserving swap; this says nothing
  yet about Seedance reference-to-video, which is what ALTER sends.

## The gates chosen (DECISION, by this rule)

| Gate | Value | Rule |
|---|---|---|
| Timing on the clock | at least 0.65 | halfway between the highest wrong-moment score at 0.4 s or more (0.567) and the lowest real redraw (0.744) |
| Re-timed | fails when the best fit is 2 or more frames off and at least 0.02 better | all 10 same-moment cases fit at 0; all 14 cases moved 2 or more frames fit off the clock or fail timing |
| Mouth shape | fail above 0.06, warn above 0.04 | twice, and 1.25 times, the tracker's noise on identical footage (0.032) |
| Face read | at least 80% of frames in both clips | a decision; not measured |

With these, all 10 same-moment cases pass and all 14 cases moved 2 or more frames fail. One frame of slip passes.

## Not measured

- **Identity.** Not measured in this run. First readings, the pinned checksum and the model's licence are in
  `IDENTITY_2026-11-27.md`: the 0.25 line is still the older `camera_coverage.py` default and is not certified, so a
  number under it clears nothing.
- **A Seedance redraw.** No ALTER draft exists: nothing has been sent.
- **Him moving differently from the take** (blocking, dodging). The checker's motion gate compares the redraw's motion
  with the take's and would fail such a shot by design. HYPOTHESIS: it needs its own check mode where motion is
  reported and only the mouth, identity and head turn decide. Test: the one approved draft.
- **A take-relative line.** RECOMMENDATION: score each take against its own 480p copy first and require the redraw to
  reach a share of that, instead of one fixed 0.65.

## The Meditate takes (VERIFIED, a 4 s stretch from file 0:40 of each)

| Take | Face read | Face width in the frame | Head turn |
|---|---|---|---|
| `IMG_6547` wide front | 96 / 96 | 8.1% | -0.09 |
| `IMG_6550` medium front quarter | 96 / 96 | 9.6% | 0.28 |
| `IMG_6548` close, low, 45 degrees | 9 / 96 | 10.5% | -0.92 |
| `IMG_6549` side profile | 3 / 96 | 8.9% | -1.39 |

Only the two front takes can carry an ALTER test or a face put-back. On the other two the mouth cannot be read.
