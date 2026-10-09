# The render contract, and exactly where rendering stops today

2026-10-03 · post-production-test hardening tranche, priority 6.

**The law: what Review plays is what Export renders. There is no separate editorial truth.**

This document says what is built, what is proven, and the one thing that is not there — the machine that runs the
renderer — with the smallest architecture that adds it.

## 1. Do the canonical records contain everything a render needs?

Checked field by field against what Review itself reads.

| A render needs | Where it is | Complete? |
|---|---|---|
| The song and its clock | `project_assets` (the audio asset); every time on the board is song seconds | yes |
| Shot boundaries | `shots.timestamp_start / timestamp_end` | yes |
| The media each shot shows | `shot_asset_assignments.is_primary`; with nothing selected, the synced take under the shot | yes |
| The range of the file | `shot_asset_assignments.source_in/out_seconds`; for a take, derived every time from `performance_syncs` | yes |
| Performance sync | `performance_syncs.offset_seconds`, `drift_ppm` | yes |
| Generated clips and images | `project_assets` (original file path, real length) | yes |
| Aspect ratio | `video_projects.aspect_ratio` → the frame; media is fitted whole, never cropped | yes |
| Timed events inside a shot | `shots.spec_json.events` (effects: applied by the edit; direction: in the footage) | yes — new in this tranche |
| Transitions | `shots.spec_json.transitionIn` is **declared**, but Review plays every one as a **cut** | carried as declared, rendered as the cut that plays |
| Frame rate | not an editorial fact — the cut is in seconds on the song | a render setting (default 30) |

Nothing is missing. The only thing that was not written down was **what the player does at each frame** — which
frame of a take is on screen when the recording starts after the song does, what a clip shorter than its shot shows
once it has run out, what an effect has done to the picture by a given frame. Review computed those as it played. A
renderer that re-derived them would be a second implementation of the edit, and the two would drift.

## 2. The render contract (built)

`src/lib/storyboard/renderContract.ts` — `renderContract()`.

It is made from the **same timeline Review plays** (`buildTimeline`), by asking the **player's own functions**
(`segmentAt`, `videoStateAt`, `pictureAt`) what is on screen at every output frame and writing the answers down. Export
writes it into the package as `storyboard_timeline.json` (version 2). Per shot it says, in output frames:

- `frame_in` / `frame_out` — the frames the shot covers. Gapless: a shot is on screen until the next one starts, as in Review.
- `media` — the **original** file (never the lighter copy the browser plays), and for a video
  `frames: { lead, play, tail, source_first }`: hold the first picture for `lead` frames, run the file from
  `source_first` at its own rate for `play` frames, hold the last picture for `tail` frames.
- `picture_runs` — what the edit does to the picture, as runs of frames with one `brightness`, `contrast`, `flash`
  each: the effect arithmetic, **already evaluated**. A renderer applies numbers; it does not re-implement an effect.
- `effects` — the same effects as keys on the song clock (what they are, for a person reading the file).
- `direction` — timed direction that must already be in the footage. Carried for the record. Nothing is drawn for it.
- `transition_in: { declared, realized: "cut" }`.

and for the whole render: the frame (`width`, `height`, `fit: "contain"`, black behind), `fps`, the stretch of the
song (`range`), the frame count, and the song with where it starts.

A renderer therefore decides nothing editorial. It needs no knowledge of treatments, overrides, assignments or syncs.

**Proof that the contract is what Review plays** — `src/lib/storyboard/renderContract.test.ts`: for *every* output
frame, at 10, 24 and 30 fps, what the contract says is on screen (`contractFrameAt`, read from the contract alone)
equals what Review shows at that frame's song time (`reviewFrameAt`, the player's functions): same shot, same media,
same moment of the file to a tenth of a millisecond, same picture.

**Export says what it is** — the Export page shows the contract's own summary, anything that stands between it and a
finished video (a shot with nothing on it, no song), and what a render of it will and will not contain (held images,
held frames, effects applied, transitions rendered as cuts, direction that must be in the footage). It does not offer
a "Render video" button, because nothing in the app can honour one yet.

## 3. The renderer (built, tested — not hosted)

`scripts/render/render_contract.py` executes a contract with ffmpeg:

```
python3 scripts/render/render_contract.py storyboard_timeline.json --media media.json --out cut.mp4
```

`media.json` maps each `"<bucket>/<path>"` in the contract to a local file or an https URL ffmpeg can read (signed
storage links work as they are). It builds one filter chain per shot (fit whole into the frame → the project's frame
rate → hold / play / hold by frame count → the picture runs as per-channel lookups), concatenates the shots, lays the
song under them from `range.song_in`, and writes H.264 + AAC, BT.709. It **refuses** a contract it cannot execute
(wrong version, frame arithmetic that does not close, a missing file, a fit it does not implement) and renders
nothing; after rendering it probes the file and **fails** if the frame count, frame rate or sound are not the contract's.

**Proof that it executes the contract** — `scripts/render/tests` (8 tests, real ffmpeg, synthetic media whose
pictures say what they are): the right file on the first and last frame of each shot with a hard cut between them; a
take's lead-in held and then running on the song clock, read back from the frame to within one output frame; a short
clip's last picture held; a wide image fitted whole with black above and below; every effect run's colour equal to
the arithmetic Review applies; black where a shot has nothing; a section rendered as its own file; the song present.
The contract those tests execute is the very fixture the app's parity test writes and checks
(`scripts/render/tests/fixtures/contract_small.json`), so the two halves cannot drift apart unnoticed.

**To the frame, stated:** a picture taken from a file is the frame on screen at the stated source time ± one source
frame (ffmpeg's frame-rate conversion picks the nearest frame; a browser shows the one before). Held frames, cuts and
effect runs are exact in output frames.

Measured on the development machine: 1080×1920, 18 output frames a second. A three-minute video at 30 fps is about
five minutes of CPU and a few hundred MB of temporary files.

## 4. The boundary — why the app does not render

The renderer needs **a process that can run ffmpeg for minutes**. The app's backend has none:

- **Edge functions** (where every AVT server function runs) are Deno isolates: no binaries, a CPU budget of about two
  seconds a request and a wall clock of a few minutes. ffmpeg cannot run there, and a WebAssembly build of it needs
  threads and several hundred MB of memory the runtime does not give.
- **The hosted ffmpeg endpoint AVT already calls** (Fal `ffmpeg-api/compose`, through Control Center — used by the
  wardrobe reassembly lane) lays whole files on tracks at a timestamp. It has no in-point into a file, no fit of a
  picture into a frame, and no picture arithmetic — so it cannot execute a source range, a held frame, a `contain`
  fit or an effect run. Using it would mean pre-cutting every shot somewhere else and dropping the effects, i.e.
  **rendering something other than what Review plays**. Rejected.
- **The browser** could encode with WebCodecs (the app already cuts takes that way), but a render owned by a page is
  the thing priority 4 of this tranche removed for jobs: close the tab and it is gone. It is also where the codecs
  differ by device. Not the cleanest path; not built.

So the boundary is exact: **everything up to and including a tested renderer exists; a host to run it does not, and
adding one is an infrastructure decision with a cost attached** — which is outside this tranche's authorization
(no new purchase).

## 5. The smallest architecture that closes it

One small container, no render farm.

```
Export page ── "Render" ──▶ render_jobs row (queued; the contract itself is stored on the row)
                                   │
        pg_cron → pg_net ──▶ edge function render-dispatch ──▶ starts ONE worker run (HTTP) with the job id
                                   │
   worker (container: python3 + ffmpeg + scripts/render/render_contract.py)
        1. reads the job row and its contract (service role)
        2. signs every bucket/path in the contract → media.json            (no editorial logic)
        3. runs render_contract.py                                          (the code in this repository, unchanged)
        4. uploads cut.mp4 to a `project-renders` bucket, files it as a project asset, marks the job done
                                   │
Review / Export read the row: queued → rendering → done (a link) | failed (the renderer's own reason)
```

- **Same scheduler as provider jobs**: the job is moved by the server (`pg_cron` → `pg_net`), never by a page —
  the pattern `provider-jobs-tick` established in this tranche.
- **The worker is stateless and runs one job**: any service that runs a container to completion on an HTTP call
  fits (Cloud Run job, Fly machine, Modal function, Render background worker). It needs ~2 vCPU, 2 GB memory,
  ~2 GB temporary disk, a 15-minute limit; cost is cents per render.
- **Credentials**: the worker holds the project's service-role key and nothing else — it reads rows and storage and
  writes one file. No provider key, nothing from Control Center.
- **What the app adds then**: a `render_jobs` table, the dispatch function, a "Render" button on Export and Review
  (whole cut, or the section being reviewed — the contract already takes a `range`), and the result shown as a
  project asset. Roughly one working session, once the host exists.

## 6. What Fendi decides

1. Which host runs the worker (any of the above; this is a new, small, recurring cost — a purchase decision).
2. Whether transitions should ever be more than cuts. If so they are implemented **in the player first** (so Review
   plays them) and the contract's `realized` field changes with it; the renderer follows the contract. They are not
   added to the renderer alone.
