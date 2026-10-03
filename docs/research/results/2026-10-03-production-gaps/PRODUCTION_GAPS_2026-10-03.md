# Production gaps after the storyboard redesign — 2026-10-03

Fendi, after his and ChatGPT's read of rev 56: "CLAUDE — CONTINUE. NO FENDI QA HANDOFF YET … Yellow and green issues
are yours to resolve." Eight items. This is what was done for each, what was measured, and what is still open.

Main at the end of the round: `b0f0aa4` (+ this revision's docs). Published app code: `044f95b` (the commits after it
change one test file only). Spend ≈ $0.42.

## 1. The two YSL acceptance points that needed a frame to play (11, 14)

**The barrier.** The only signed-in session is Fendi's Chrome, and its window is not on screen. A browser loads no
video or sound in a window that is not shown, so nothing can be played there. The desktop app's own browser pane was
tried as well: it has no session for the app (it shows the sign-in page) and is hidden too.

**What was built instead.** Review → **Check this cut** (`src/lib/storyboard/reviewCheck.ts`, `verify.ts`,
`src/lib/media/mp4.ts`, `probe.ts`, `src/components/storyboard/CutCheck.tsx`). It needs no media element, so it
runs in a window that is not on screen:

1. every file the cut plays is opened through its signed link, its MP4/MOV index is read by byte range, and the
   frame a player would land on is decoded with WebCodecs at up to six points where the cut enters the file;
2. the song is opened, its length read from the file and its start decoded;
3. the whole song is stepped through the player's own rules (`segmentAt`, `videoStateAt`) every 0.1 s and checked
   against the records independently: shots tile the song; every shot plays what is selected on its own record;
   file lengths match their records; AI clips, images and B-roll sit only on the shots they are assigned to; every
   cut lands on its shot's time; performance is where `performance_syncs` puts it; after other footage the take
   resumes on the song clock; first / last frame held where the take has not started or has run out; nothing runs
   backwards or restarts;
4. the links the page's own player holds are compared with each shot's own file;
5. when the window IS on screen, the real player is put at 24 moments across the song and each shot's video is read
   back from the element.

**Result on the real YSL project, in the live app (`044f95b`), 2026-10-03:**

| Check | Result |
|---|---|
| The song opens and is the length the cut was built on | 201.87 s, WAV 48 kHz stereo, 73.9 MB, decodes; equals the analysis |
| Every file the cut plays opens and decodes | 3 of 3 — the take `hero_clip_hd_1080.mp4` (H.264 High 1080×1920, 190.34 s, 182.4 MB, 40 shots) decoded at 0, 38.37, 69.74, 106.99, 150.13 and 187.39 s; two AI clips (H.264 Main 1080×1920, 5.04 s) decoded at 0 s |
| Shots cover the song with no gap or overlap | 43 shots, 3:21.87 |
| Every shot plays what is selected on its own record | 2 with footage selected, 40 on the synced take, 1 empty |
| Each file is as long as its record says | holds |
| AI clips appear only on their assigned shots | shots 06 and 09; nowhere else |
| Every cut lands on its shot's own time | 42 cuts, 2019 moments |
| Performance is where the song clock says | 1864 moments on the take, furthest 0 ms |
| After other footage, the take resumes on the song clock | 2 returns (after 06 and 09) |
| Holds | shot 01 holds the first frame 0.85 s (the take starts 0.8538 s after the song); shot 42 holds the last frame 2.9 s (the take ends at song 3:11.19) |
| Nothing runs backwards or restarts | 2019 moments |
| The player on the page holds each shot's own file | 3 video links and the song |
| The real player read back at moments across the song | **not run — the window is not on screen** |

The same check on the local Chromium run (`scripts/e2e-local`, window on screen) passes all thirteen lines including
the last (24 of 24 moments).

**What that leaves.** One thing no program in this environment can do: look at it. *Open Review on YSL, press play,
watch one pass.* Pressing **Check this cut** there first also runs line 13 on the real player.

## 2. Automatic lyric timing in Setup

**How it is built.** There is nowhere in the app's backend to run Python, and no way to start a runner without a new
credential. So: the song is decoded in the browser and cut into the script's windows (30 s, 20 s apart); each window
goes through a new edge function, `lyric-align-proxy`, to a hosted transcriber (OpenAI `whisper-1`, word
timestamps; xAI speech-to-text as fallback); the words come back and are aligned to the known lyrics by
`src/lib/lyrics/align.ts` — `align_lyrics.py`'s `merge_windows / align / place / build_lines` restated in TypeScript
and held equal to the script by a fixture the script itself writes (`scripts/lyrics/make_parity_fixtures.py`, 15
cases; `align.parity.test.ts` on the app side, `scripts/lyrics/tests/test_align_parity.py` on the script side).
The alignment algorithm exists once in behaviour; only the ear differs.

**In Setup.** Paste or import plain lyrics → **Time the lyrics to the song** → the timed lines are shown, with what
was heard part by part → **save**. Nothing is saved without a press. A project that already has timed lines gets
"Time them again": the new timing is shown *against the saved one* and replaces it only after a second, explicit
confirmation. Timed LRC remains under "Advanced".

**YSL's 95 validated lines were not touched.** Six runs were made on the live project to test; none was saved.
`lyric_lines` for YSL is byte-for-byte what it was (same checksum, last updated 2026-10-02).

**What the live runs showed** — the hosted transcriber is a weaker ear than the script's local model on this song:

| | words heard directly | lines not found | against the saved timing |
|---|---|---|---|
| `align_lyrics.py`, faster-whisper `small` (the saved timing) | 68 % | — | — |
| hosted, first run, as designed | 50 % | 27 | 55 lines compared, median 0.12 s, 15 over a second |
| hosted, shipped build | 29 % → **50 %** after the second listen | 30 | 51 compared, median 0.13 s, 17 over a second |

Where a line is found by both, the two agree closely (median 0.13 s). The difference is what is *heard*. Faults
found on the way, each fixed:

- With a held-sound line ("Woooooo") in its vocabulary the transcriber wrote that one sound over a whole window —
  a single 200-character "word" — and the verse under it was lost. Held-sound lines stay out of the vocabulary; a
  runaway word is dropped (client and function).
- It is erratic by cut: one 30 s window hears a verse, a window cut seven seconds away hears nothing. A deaf
  window is now cut 7 s earlier and then 7 s later.
- It wrote a hook line over 1.9 s of tail. Under 5 s of tail is not sent (the window before already heard it).
- **The second listen.** Where a run of lines is unfound with song time to spare, that stretch is heard again in
  15 s windows 5 s apart, and a word is kept only when two different cuts heard the same word at the same moment —
  a transcriber with lyrics in its prompt will write lyrics over an instrumental, and this is what tells the two
  apart. It replaces the first pass only where it holds more of the missing lines, and only if coverage rises.
  Measured on the same first pass: 15 s / 5 s → 50 %, 30 s / 7 s → 41 %.
- Two rules that looked right and were not: feeding the missing lines back as the prompt (it then "hears" exactly
  them), and the model's own no-speech figure (it is taken at the first instant of a window, so a window that opens
  on a beat is marked no-speech with a verse inside it). Both removed.

**Standing.** The path works end to end for a user who arrives with a song and plain lyrics, costs ≈ $0.03–0.09 for a
song of this length, and says plainly which lines it could not find. On a dense rap vocal over a loud beat it is not yet as good
as the script. The alignment is not the limit; the ear is. Two ways to close it, neither done here: run the same
`small` model in the browser (no hosted ear at all), or a backend job that runs the script (needs a runner and a
credential).

## 3. `performance_syncs`

Unchanged, and checked: YSL's row is `0.8538 s / 0 ppm / manual`. No per-shot timing was added anywhere; **Check
this cut** recomputes every performance range from the sync and compares.

## 4. Project aspect ratio

`video_projects.aspect_ratio` (migration `20261003120000`, applied): `9:16 | 16:9 | 1:1 | 4:5`, default `9:16`, so
every existing project keeps its frame. `src/lib/project/aspect.ts` is the one place that reads it.

- Setup: a **Frame** choice.
- Storyboard: the tiles keep their shape with the project frame inside them; the full-screen shot and Review take
  the project frame.
- Generation: image and clip requests carry the project's aspect. `4:5` has no image-model equivalent; it is asked
  for as `3:4` and shown whole, and the confirm text says so.
- Export: the render plan carries `frame: { aspect, width, height, fit: "contain" }`.
- Nothing is cropped: footage of another shape is shown whole inside the frame.

YSL reads `9:16`. One visible change for YSL, and it is the intended one: Review's stage and the full-screen shot
are now the video's own shape (vertical) rather than a wide stage with the vertical picture inside it.

## 5. Voice Director on phones

Below `md` it is a 44 px round button; a tap opens it as a sheet; ✕ returns it to the button. Desktop unchanged.
Verified at 390 × 844 in the local run (closed → opened → closed) and on desktop (panel shown, no button).

## 6. Security

Read-only triage: [`docs/security/SECURITY_TRIAGE_2026-10-03.md`](../../../security/SECURITY_TRIAGE_2026-10-03.md).
Nothing repaired. Summary in the handoff.

## 7. Architecture

Nothing reopened. The additions sit inside it: a column on the project, a check that reads the canonical state, a
function that returns words.

## 8. Regression

| | |
|---|---|
| `npx vitest run` | 161 files passed, 1 skipped · 1778 tests passed, 1 skipped |
| `npx tsc --noEmit -p .` | clean |
| `npx vite build` | passes |
| `python3 -m pytest scripts/edit/tests scripts/lyrics/tests scripts/_lib/tests` | 31 passed |
| `scripts/e2e-local/run_storyboard.py` | PASS — board, full-screen shot, assign, Review against the song (0 samples off the clock by more than 0.1 s), Check this cut (13 of 13), frame 9:16 → 16:9 → 9:16, lyric timing on a timed and an untimed project, phone layout, swipe, fill mode, Voice Director |

**YSL, read from the database before and after:** 43 keyed shots (44 rows; one earlier row without a key, as
before); treatment 639 characters, same checksum; `performance_syncs` 0.8538 / 0 / manual; 95 lyric lines, same
checksum; 5 assignments, 2 showing; 49 history entries; assets unchanged (33 generated clips, 2 generated stills,
56 edited clips, 91 reference images, 10 reference videos, 1 song); `aspect_ratio` 9:16. Nothing was reset.

## Spend

OpenAI `whisper-1` through `lyric-align-proxy`, six test runs on YSL: ≈ $0.42 at list (0.6 ¢ a minute of audio
sent). No generation was run.

## Lovable

Applied the migration, deployed `lyric-align-proxy` (three times as it changed), published. Its own commits:
the migration tool's copy and regenerated types (`36fe08a`), `aspect_ratio: "9:16"` added to three test fixtures
so the type check passes (`36dd30b`), and a `.ts` import extension plus a typed parameter in
`lyric-align-proxy/contract.test.ts` for its Deno check (`b0f0aa4`). All read; all correct.
