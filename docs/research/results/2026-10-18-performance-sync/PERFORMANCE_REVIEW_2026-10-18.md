# Performance review: usable intervals and candidate timing for E1 / E2 (18 Oct 2026)

Brief (Fendi, 18 Oct): judge the intervals the cut actually uses. Compare current timing with the proposed delays.
Store candidates separately; change nothing in production. No regeneration. **Spend: $0.**

Labels follow `CLAUDE.md`. Every verdict below is **OBSERVED**: it comes from reading frames by eye, not from a metric.
No interval is called verified because its audio or timestamps line up.

## How it was judged

- **Grids.** Per-frame mouth crops at every 1/24 s of song time. The original take sits on top at the 0.8538 baseline; under it, the clip as is and at each candidate shift. Each column carries the lyric word sung at that moment.
- **Word times.** From `lyric_lines.words_json`. These are aligner estimates of about ±1 frame.
- **The mouth-opening metric was not used.** It reads ±6–8 frames of noise on the real take (`GENERALIZE_CORRECTIONS_2026-10-18.md`).
- **Rendering.** All renders are local ffmpeg on the song clock, frame-exact. Nothing relied on the in-app preview or its Compare control.

Intervals = the two lip-sync slots in the Cut `2976b498` (YSL_IceOn_v1_COLDOPEN):

| Slot | Song | Lyric | Clip there today |
|---|---|---|---|
| c033 | 58.042–59.208 | "Laugh cause we did it / what I'm whippin" | montage `f4161801` (placeholder) |
| c034 | 59.708–60.542 | "Got everything but the kitchen" | montage `6e2bb2bc` (placeholder) |

## Verdicts

| Interval | Verdict | Detail | Confidence |
|---|---|---|---|
| **E1 v3 on c033** | **One offset works throughout the slot.** It is either as is or picture 1 frame earlier; the reel decides. The proposed delays are worse. | As is, the lip rounding into "we" lands about 2 frames after his own take (58.29 → 58.375–58.42). +1 f and +2 f push it further past the word. The opening on "whip" also arrives after the vowel. −2 f is too early on "did". | Medium. His original turns to profile after 58.88, so the second half is judged against word times only. |
| E1 v3, 59.10–59.20 ("whippin") | **Stretch articulates differently (minor).** | No visible "pp" closure at any shift: the lips go from closed ("I'm") straight to open teeth. It likely passes at speed. | Medium |
| **E2 on c034** | **A specific stretch appears to articulate something different: 59.92–60.04 (inside "everything").** | E2 shows a rounded, open "O". He sings a spread "-ything" there, and no shift fixes a shape. Elsewhere: "Got" fits. On "the / kitchen" the teeth show about 1–2 frames after his take, so 1 frame earlier fits slightly better. The proposed +1 f later is worse. | Medium-low. E2's face is dark and three-quarter, low contrast. |
| Montage `f4161801` on c033 (in the Cut today) | **Insufficient visibility to decide.** | The face is small and in profile; no mouth is readable. No audio drove this mouth. | — |
| Montage `6e2bb2bc` on c034 (in the Cut today) | **Compatible where visible, as is.** | "Got" opens, and the "but" closure sits at 60.08. A hand covers the mouth 59.83–59.96. | Medium-low |

**Unsalvageable footage:** none as a whole. If Fendi confirms the shape is wrong, the failing interval is **E2 song 59.92–60.04**. Cover it with a cutaway or the original take; do not slip it.

**This withdraws the earlier suggestion of "+0.042 later" for E1 and E2.** That came from the lip-closure metric. Reading the frames points the other way: the picture is **not early**, and the later shifts fit worse.

## Candidate corrections (not accepted; production unchanged)

All are in frames of 24 fps. The **Board** slip (`slip_seconds`): + plays the picture **later**. The **Cut** "Adjust footage timing" has the opposite sign: + shows later source frames, so the picture plays **earlier**.

| Clip on slot | Candidate | Board | Cut | Fallback |
|---|---|---|---|---|
| E1 v3 on c033 | **picture 1 frame earlier** | slip −0.041667 (assignment `c2418542`) | +1 f: source in 4.250000 → 4.291667 | as is (0) |
| E2 on c034 | **picture 1 frame earlier** | slip −0.041667 (assignment `ec99f7f4`) | +1 f: source in 4.416667 → 4.458333 | as is (0) |
| Withdrawn | E1 picture 1 f / 2 f later; E2 picture 1 f later | — | — | — |

**Stored in** the Cut sequence **`44ed6145-cbf7-451a-8436-db11e2191bd6`**, "CANDIDATE perf-sync E1 c033 / E2 c034 (not accepted)":
- It is a full copy of the cold open with new clip ids, and only the two slots differ.
- `edit-render` dry-run: 0 missing media, $0. Trims `4.291666–5.458333` (E1) and `4.458333–5.291666` (E2).

**Not written** (VERIFIED by query after the change): `shot_asset_assignments.slip_seconds` (0 rows ≠ 0), the production Cut `2976b498`, board selections and `performance_syncs` (original still `0.8538`, `manual`).

**On the as-is grid values:** the Cut snaps in-points to the 24 fps grid. As placed on that grid, E1 already sits 0.2 f earlier than its exact sync and E2 0.4 f later. The reel's "as is" uses the exact sync. The difference is under half a frame.

## Review media (private, AVT storage)

- **Where:** bucket `project-exports`, folder `<owner>/764a63d2…/review/perf_sync_2026-10-18/`.
- **In the app:** Project → Assets → "Edited clips". All are filed `edited_clip`, `shot_id` null, not assigned to any shot, and each note starts "REVIEW (not for cut)".

| Asset | File |
|---|---|
| `a8af018a` | `00_DECISION_REEL_E1c033_E2c034.mp4`: **the reel** (21 s; two choices, each 1 f earlier · as is · 1 f later; 1×, 1×, ½×) |
| `d8e8aabc`, `a4860709` | E1 v3 vs original, slip 0 vs +2 f, 1× / ½× |
| `cf4871db`, `f3ef54b8` | E2 vs original, slip 0 vs +2 f, 1× / ½× |
| `af60d911`, `8006ae74` | c033 montage vs dressed vs original, 1× / ½× |
| `1287117c`, `a4776ce3` | c034 montage vs dressed vs original, 1× / ½× |
| `16aef482`, `ce83e75b` | original at 0.8538 (baseline) vs 0.7038, 1× / ½×. This is a separate question; the baseline is not changed |

The evidence grids are in `grids/` under the same folder. No media is in this repo; it is public.

## Future test (before claiming a production route; no regeneration now)

Today E1 / E2 use **different windows**:
- **@Video1:** the dressed take for song 56.91–60.91 (c033).
- **@Audio1:** the vocals for the placement window, 53.8–63.84 (E1).

A matched test should give @Video1 and @Audio1 the **same** song window, on 2–4 s, and compare it with the current approach. Judge both by this method: frame grids against the original, ±1 frame, and a short reel for Fendi. Only then call a route a solution.

## Coordination note for Grokbot (Timeline / Compare)

- **These comparisons are offline ffmpeg renders on the song clock.** They don't use the in-app preview or Compare (#342), so they don't depend on seek accuracy there.
- **Grid snapping should be visible.** Compare should show the same snapping as above (E1 −0.2 f, E2 +0.4 f against exact sync); otherwise a 1-frame candidate can look like 1.2 or 0.6 frames.
- **The candidate sequence `44ed6145` is ready to load** in Timeline for a side-by-side with `2976b498`. Its notes and clip comments carry the board/Cut translations.
- **Still open (from #343):** the EDL importer labels montage placeholders `mouth: "camera"`. The candidate sets `mouth: "model"` on the two swapped clips.
