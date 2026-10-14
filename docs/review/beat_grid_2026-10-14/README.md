# Beat grid v2 and lyric-aware cuts — evidence (14 Oct 2026)

Fendi, 14 Oct: "our treatment should reflect based on lyrics and bpm to outline exactly how short each clip should
be trimmed down and where it should fit." This change does steps 1 and 2 of the plan given in reply: measure the real
beat, and let lyric line starts move cuts.

## What was wrong (VERIFIED on "YSL Ice On", project 764a63d2)

- The stored analysis says **122.4 BPM**, beats counted from 0:00 (`analysis_provider: web-audio-builtin`,
  analysed 7 Jun). The v1 tempo is a whole-frame autocorrelation lag (10 ms frames), so it cannot land between
  122.45 and 120.0.
- Run on the album master at 48 kHz with the app's own code (`dryrun.ts`), the v2 analyzer finds **121.998 BPM,
  first beat at 0.029 s, downbeat on the first beat**, beat contrast 3.5× (the best grid's score over the mean of all
  phases). In 25 s windows the best phase stays at 0.018–0.037 s across the whole song (one window at 0.037).
  At 122.4 it slides from 0.05 to 0.46 s across the song.
- The current board's 46 cuts are **median 0.13 s and up to 0.25 s off** the measured beats; 29 of 46 are more than
  0.1 s off. Counted in bars, the v1 bar lines fall behind the real ones by 0.22 s at 1:00, 0.42 s at 2:00 and
  0.62 s at 3:00 (`windows.ts` output in the session record).

## What changed (code)

- `src/lib/songAnalysis/analyzer.ts`: the coarse tempo is refined together with the beat phase (±1 BPM, then
  ±0.03 BPM at 0.002 with an interpolated score), the downbeat is the beat position with the strongest bar onsets
  (0 unless another leads by more than 3%), and beats are projected from that first downbeat. Provider string
  `web-audio-builtin-v2`.
- `src/lib/treatment/grid.ts`: cuts fall on the measured downbeats of `beat_map_json` (identical to v1 when the map
  is the v1 one or absent — tested against a copy of the old loop), and a cut within one beat of a trusted lyric line
  start (confidence ≥ 0.5, 0.15–10 s long) moves to the beat nearest that start (`cutOnLyric`), within the clip
  length bounds.
- `src/lib/storyboard/build.ts`: passes the board's lyric lines to the grid.

## What it does to the existing board

Nothing moves. Existing boards keep their own windows (`gridFromBoxes`); the grid only cuts a brand-new board and
supplies energy/section labels. No shot on the board uses a beat-triggered event (checked), so a corrected beat map
moves no event either. Re-cutting the current board onto the real beat is a separate, director-approved step.

## Dry run of the new grid on this song

46 clips, every cut on a measured beat, **6 cuts moved onto lyric line starts** (21.18, 47.74, 58.56, 149.05,
160.85, 169.70 s). Full list: `grid_v2_dryrun.json`. Stored analysis before: `song_analysis_v1_before.json`
(rollback copy); proposed v2 fields: `song_analysis_v2_proposed.json`.

## Tests (by category, docs/TEST_TAXONOMY.md)

Unit: `grid.test.ts` (9) and `analyzer.test.ts` (5), all pass. Full suite: 2,654 passed, 1 skipped, in three runs;
one earlier run had a single failure that did not recur and was not identified.
