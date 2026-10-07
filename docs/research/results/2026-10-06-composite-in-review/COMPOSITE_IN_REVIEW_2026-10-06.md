# The original-footage composite, cut to a shot and playing in Review · 6 October 2026

> Integration agent. Spend: **$0.00**. Nothing generated, nothing bought, nothing deleted.
> Follows `docs/research/results/2026-10-04-composite/` (the first composite, other session) and the scope in
> `docs/research/results/2026-10-03-fresh-section/CLOSE_2026-10-04.md` ("keep the performance, change the environment").

## Verdict

**Usable as a look test, not as a finished shot.** The route works end to end: the synced take is cut to a shot's
exact window, he is lifted off the room and put over the project's approved place, and the result sits on the shot
and is read by Review like any other clip. Timing and colour hold by measurement. The edge is good on the head and
torso and fails on fast hands. He is lit by the room he was filmed in, so against a dark runway he reads as a
cut-out — the integration question the earlier lane raised is still open and is a question for the eye.

## Where it is

| | |
|---|---|
| Shot | **17** on the board (`c017`, song 1:02.75–1:06.67). It is `shots.shot_number` 18 in the database; the board renumbered after splits. |
| In the app | Review → `…/projects/764a63d2-…/review?from=17&to=17` · Storyboard → shot 17, the showing clip |
| Asset | `a84ea8e5-01f7-4d57-b51d-a2f4db610e20` (`edited_clip`, `footage_role: performance`, pending) |
| File | `project-clips/3ca10935-…/764a63d2-…/composites/c017_take3710-3944_runway_composite.mp4` (3.7 MB, 1080×1920, 29.97 fps, 118 frames) |
| Diagnostic | same folder, `c017_take3710-3944_runway_diagnostic.mp4` — the same matte over a magenta/green checker |
| Source | the synced performance take `70304981-…` (hero_clip_hd_1080), frames 3710–3944, every second frame |
| Place | `PARIS_BLACK_RUNWAY`'s approved picture `5ff90a21-…`, as a still |

## What was already there, and why it was not enough

The 4 October composite (asset `395f799e-…`) is a 2.5 s cut of the S06 working clip over a teal backdrop. It was
filed as an unassigned candidate with no bucket, no length, no place on the song clock — so no shot could play it and
Review never saw it. Two further things were found in it while checking:

1. **Its first four frames are off the take's clock.** The S06 working cut opens with five frames that each advance
   one 59.94 fps frame instead of two (the first 0.13 s runs at half speed); from frame 4 on, take time = S06 time +
   61.535 s. Against the take, its first frames are up to 67 ms out. Any composite cut from a working clip inherits
   that clip's timing. This one is cut from the synced take itself.
2. **Its colours shift in a browser.** The harness wrote RGB frames to video with ffmpeg's default matrix (BT.601)
   and no tag; a player reads an untagged HD file as BT.709. Measured on this run's first encode, made the same way:
   checker green 0/220/60 came back 0/189/55, magenta 230/0/230 came back 245/35/236. Skin and camouflage sit in
   exactly that range. The harness now names the matrix and tags the file; the 4 October file is unchanged and still
   has the shift.

## How this one was made

`scripts/qa/composite_take.py --take <take> --frames 3710:3944:2 --plate <runway picture> --diagnostic <checker>
--choke 3 --matte-args=--rvm-peel`, then `composite_verify.py`, then `composite_register.py --take-offset 0.8538`.

| step | what | number |
|---|---|---|
| cut | by frame index from the 59.94 fps take, every second frame, never resampled | 118 frames at 30000/1001 fps = 3.937 s |
| clock | first kept frame read off the take: 61.895 s; the take's sync is +0.8538 s | first frame at song **62.749 s** (the shot opens at 62.750) |
| colour | one HLG → BT.709 conversion at the cut; BT.709 matrix named at the encode; file tagged | read as BT.709 against the blended frames: mean \|Δ\| 1.21/255, saturated pixels 1.89/255 |
| performer | fit of output against source over the matte core | `out = 0.998 × src − 1.07`, residual 1.28/255 — his pixels are the take's |
| edge | matte pulled in 3 px before blending | the pale rim of the room wall around cap and shoulders is gone at 3 px (`edge_trim_0_2_3_4px.jpg`, rows are 0, 2, 3, 4 px) |
| frames | cut = matte = output | 118 = 118 = 118 |

## Checked in the app (published build)

- Storyboard → shot 17 → footage picker → "Your takes": the clip is listed, **View** plays it, **Put on this shot**
  made it the showing clip. The restaged clip that was showing (`8a894762-…`) is still on the shot, not showing;
  clicking its chip puts it back.
- Review, shot 17: the player's source is the composite; "The cut at a glance" reads three frames from it at the
  shot's opening, middle and close; **Check this cut** passes — 20 of 20 files open and decode, every shot plays what
  is selected on its record, each file is as long as its record says.
- Rows written: one `project_assets`, one `performance_syncs` (`derived`, `confirmed`, offset 62.749), one
  `shot_asset_assignments` (by the app's own button). One existing row changed: the old showing clip's `is_primary`
  went to false, by the app.

## Defects that remain

1. **A hand comes away from its arm on 5 of 118 frames** (frames 38–39 at 1.27–1.30 s and 82–84 at 2.74–2.80 s):
   the matter drops a fast, blurred forearm and keeps the hand. Worst piece 9,519 px, 1.6 % of his area.
2. **Motion-blurred hands are partly see-through** and carry a smear of the cream wall.
3. **Light.** He is evenly lit by a room; the runway is dark with one hard pool. No grade was applied to him — that was
   the point of this run (his pixels untouched) — so he does not sit in the place. The shot's own direction asks for
   near darkness with camera flashes; this is not that.
4. **The edge trim costs 3 px of his outline** everywhere, including where there was no rim.
5. **The place is a still.** Nothing behind him moves.

## What was tried and rejected

`--temporal-mode max` (the matter's option for keeping a fast limb): it removed every detached piece (0 of 118
frames) and brought back large pieces of the room — wall, door, a bag — on most frames, with the matted area jumping
more than 2 % on 37 frames against 7. Worse. Evidence: `temporal_max_rejected.jpg`,
`verification_temporal_max_rejected.json`.

## Not verified

- **Lip sync against the song, by ear.** The take has no audio and the automation window is not on screen, so
  nothing could be watched with sound. By construction his mouth is the take's mouth frame for frame, and the clip
  sits on the song by the take's own sync (0.8538 s, entered by hand on 3 October). If the take is in sync, this is.
- **The app's own "Held against the take" check** on this clip — see below; it needs the published build to include
  this change.
- **Whether it looks right.** Integration, light and edge quality in motion are a person's call.

## Code changed (all mechanistic, none specific to this project)

| file | change |
|---|---|
| `scripts/qa/composite_take.py` | cuts by frame index (`--frames A:B[:step]`; `--from/--to` become the same thing); carries the take's real rate as a fraction instead of rounding 59.94 to 60 (a 0.1 % retime — four frames a minute); records each kept frame's own time; names the BT.709 matrix and tags the output; `--choke`; `--resume` (reuses a matte of the same cut); a plate of another shape is cover-fitted, not squeezed |
| `scripts/qa/composite_verify.py` | reads every frame once (it resampled to a rounded rate, which adds a frame to a 29.97 file); new colour check: the output read as BT.709 against the blended frames, and whether the file says what it is |
| `scripts/qa/composite_register.py` | `--take-offset` files the composite as a derived take (role, bucket, length, `derived_from` with `source_window`, `song_start`, `method: "composite"`) and prints the sync row; still writes no assignment |
| `src/lib/storyboard/media.ts`, `src/lib/queries/storyboard.ts` | a derived take's record is read with its `source_window` and `method`; `sourceOfDerived` finds a clip's take from the job that made it, else from the clip's own record |
| `src/components/storyboard/BoxMediaView.tsx`, `astraSection.ts` | a composite is named "Your take · new background" and described to Astra as the filmed footage over another background — not as "restaged" / "re-shot by a video model", which is what the app said of every derived take |
| `src/components/storyboard/useStoryboardController.tsx`, `TakeCheck.tsx` | "Held against the take" (lips, framing) is offered for a clip no job made |

Tests: 191 files, 2,234 passed, 1 skipped; `tsc` clean; Python 56 passed.

## For the testing agent

- Shot 17's showing clip changed from the restaging `8a894762-…` to the composite, through the storyboard's own
  button. Put it back with one click on the chip if the restaging is needed for comparison.
- The full synced take (190 s) is readable from the repo's own public key
  (`GET $VITE_SUPABASE_URL/storage/v1/object/authenticated/project-references/<path>`), so the scoped test on shots
  39–42 does not need a folder connected on the Mac. The same three commands with those shots' frame ranges do it.
- **The composite is a known-answer case for the lip measure.** `LIP_MEASURE_VALIDATED` is false because the
  threshold has never been held against footage whose answer is known. This clip's mouth is the take's mouth by
  construction: "Held against the take" on it should read lag 0. Run it once the build is published.
