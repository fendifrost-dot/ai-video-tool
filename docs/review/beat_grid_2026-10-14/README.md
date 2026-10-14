# Beat grid v2 and lyric-aware cuts — evidence (14 Oct 2026)

Fendi, 14 Oct: "our treatment should reflect based on lyrics and bpm to outline exactly how short each clip should
be trimmed down and where it should fit." This change does steps 1 and 2 of the plan given in reply: measure the real
beat, and let lyric line starts move cuts.

## What was wrong (VERIFIED on "YSL Ice On", project 764a63d2)

- The stored analysis says **122.4 BPM**, beats counted from 0:00 (`analysis_provider: web-audio-builtin`,
  analysed 7 Jun). The v1 tempo is a whole-frame autocorrelation lag (10 ms frames), so it cannot land between
  122.45 and 120.0.
- Run on the album master at 48 kHz with the app's own code (`dryrun.ts`), the v2 analyzer finds **121.998 BPM,
  first beat at 0.029 s**, beat contrast 3.5× (the best grid's score over the mean of all phases). The **downbeat is
  uncertain**: beat positions 1 and 3 nearly tie (lead 3.3%, under the 10% confidence bar), so bar lines may be half a
  bar off; the lyrics do not settle it (the recurring hooks start just before position 1, weak support). Stored as
  `web-audio-builtin-v2-downbeat-uncertain`. HYPOTHESIS to settle by ear: where the "1" is. In 25 s windows the best phase stays at 0.018–0.037 s across the whole song (one window at 0.037).
  At 122.4 it slides from 0.05 to 0.46 s across the song.
- The current board's 46 cuts are **median 0.13 s and up to 0.25 s off** the measured beats; 29 of 46 are more than
  0.1 s off. Counted in bars, the v1 bar lines fall behind the real ones by 0.22 s at 1:00, 0.42 s at 2:00 and
  0.62 s at 3:00 (`windows.ts` output in the session record).

## What changed (code)

- `src/lib/songAnalysis/analyzer.ts`: the coarse tempo is refined together with the beat phase (±1 BPM, then
  ±0.03 BPM at 0.002 with an interpolated score), the downbeat is the beat position with the strongest bar onsets
  (0 unless another leads by more than 3%) and its lead is reported, and beats are projected from that first downbeat.
  A grid is only "measured" when its beat contrast is at least 1.5× (silence and noise get the v1 tempo and map;
  silence no longer reads as ~199 BPM). Provider: `web-audio-builtin-v2`, or `-downbeat-uncertain` when the
  downbeat leads by under 10%.
- `src/lib/treatment/grid.ts`: cuts fall on the measured downbeats of `beat_map_json`. With the v1 map or none, the
  bar lines are the v1 ones; the energy lookup now reads at the millisecond so the two give the same cuts (before, a
  time exactly between two energy samples broke the tie differently in ~2% of tempo/length cases and cascaded). A cut
  within one beat of a trusted lyric line start (confidence ≥ 0.5, 0.15–10 s long) moves to the beat nearest that
  start (`cutOnLyric`, not yet shown or stored anywhere); such a clip can be up to one beat under 2.5 s or over 6 s.
  Tempos outside 30–300 BPM and implausible maps are refused (no lattice, fixed-seconds clips).
- `src/lib/storyboard/build.ts`: passes the board's lyric lines to the grid.

## What it does to the existing board

Windows do not move: existing boards keep their own windows (`gridFromBoxes`); `buildClipGrid` only cuts a brand-new
board. Re-analysing a song (storing a v2 map) does change, on every board of that song: the energy and section labels
the grid supplies (board UI and what the writer is sent), and the time of any "beat N" triggered event (it resolves
on the measured beats; up to one beat). This board has no beat-triggered events (checked 14 Oct). Re-cutting the
current board onto the real beat is a separate, director-approved step.

## Dry run of the new grid on this song

46 clips, every cut on a measured beat, **6 cuts moved onto lyric line starts** (21.18, 47.74, 58.56, 149.05,
160.85, 169.70 s). Full list: `grid_v2_dryrun.json`. Stored analysis before: `song_analysis_v1_before.json`
(rollback copy); proposed v2 fields: `song_analysis_v2_proposed.json`.

## Tests (by category, docs/TEST_TAXONOMY.md)

Unit: `grid.test.ts` (11) and `analyzer.test.ts` (7), all pass; the v1-map-versus-none test fails on the code
before the millisecond fix (checked) and passes after. Full suite: see the PR.

## Reviews

- Security (independent agent, 14 Oct): APPROVE. Found an unbounded loop / crash on malformed `bpm` or
  `beat_map_json` in the first commit (fixed in `cff93d8`, re-probed); nits applied (`projectBeats` guard,
  repo-relative imports here).
- Architecture (independent agent, 14 Oct): APPROVE WITH FIXES — all four applied: the v1-equivalence claim (now
  true and tested across tempos), the beat-contrast gate, the downbeat margin, and the statement above on what
  re-analysis changes.
- Product: Fendi's request in chat, 14 Oct.

## Conform every board to its song's beat (PR #255, 14 Oct)

DECISION (Fendi, 14 Oct): "the board should be cut to the real beat of EACH song … for each new song the tool should
conform." Every board of a song is conformed automatically when the song is analysed, and from "Snap boards to the
beat" on the song card.

- Rule: the board's own old grid is inferred from its edges; an edge on old beat n moves to measured beat n from the
  first measured downbeat (REBASE), so shots keep their exact beats and bars and cuts land on measured downbeats — the
  cuts a new board gets. Edges not on a regular grid take the nearest beat (≤ 0.6 beat). A move over 1.5 beats falls
  back to nearest.
- Kept: 0:00, the song end, starts of shots with beat-triggered events, any shot that would get too short. Locked
  shots conform (a content lock, not a timing lock). Each moved shot gets one restorable `conform` history entry.
- Dry run on this board (`conform_dryrun_ysl_board.txt`): 47/47 shots move, largest move 0.67 s (late in the song,
  where the old grid had drifted most); all 46 inner cuts on a measured downbeat; every shot keeps its beat count
  except the last, which ends at the song end.
- Reviews: security APPROVE WITH FIXES (narrow project-pinned writes, restorable history, error toast, song clips
  removed from git — applied; its "respect locked" was overruled by the DECISION above and the architecture finding
  that `locked` is a content lock); architecture APPROVE WITH FIXES (bar-phase flip → rebase; per-board fetch;
  kept-edge reporting; beat-trigger starts; refresh in finally — applied).
