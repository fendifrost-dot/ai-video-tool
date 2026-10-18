# Performance sync: where the timing and audio reference diverge (18 Oct 2026)

Brief (Fendi, 18 Oct): several generated performances seem to say the right words but play early or late. Test that
before rejecting footage or generating replacements. Trace a promising clip from the original recording to the
timeline. No paid generation and no face-altering lip-sync.

**Spend: $0.** This used existing files, local ffmpeg and free dry-runs only. No media of Fendi or the song is in this repo.
The comparison videos were posted in the session; they live only in that session's scratchpad.

Labels follow `CLAUDE.md`: VERIFIED, OBSERVED, HYPOTHESIS, DECISION, RECOMMENDATION.

## 1. The chain, stage by stage

| Stage | File | Audio | Timing |
|---|---|---|---|
| Original recording | `IMG_5633.mov` (assets `55bdc383`, `eb1b69f4`): 4K HEVC 59.94 fps, 190.33 s | **AAC stereo: the song playing in the room plus his voice.** VERIFIED | On the album master at **song = take + 0.8538 s**. VERIFIED by GCC-PHAT of the whole file's own audio against the master. A 12.6 s cut from 52.400 s re-measures at 52.4000 against the original's audio. |
| Hero take | `hero_clip_hd_1080.mp4` (`70304981`): 1080×1920, 59.94 fps | **None. Removed here** (`-an` in the June trim recipe). VERIFIED (ffprobe) | Picture matches the original frame for frame (fit slope 0.99997, residual 1 ms). Sync stored 0.8538, `manual`. VERIFIED |
| Dress cut sent to Genjutsu | 240 frames, 59.94 fps, 4.000 s (c033: song 56.91–60.91) | None (it is cut from the hero). VERIFIED | Matches its song window. |
| Dressed take (Genjutsu object-swap) | c033 `5a81d308` (sync 56.9098), c034 `3a31a320` (sync 58.3946) | None. VERIFIED | The provider returned 89 frames (3.708 s), conformed by timescale to 4.000 s. The frame map against the source puts every dressed frame at its stored song time within about 20–30 ms (c034: sd 13 ms, max 53 ms). **The dress keeps the performance's timing.** VERIFIED |
| E1 v3 / E2 request (Seedance 2.5 `reference_to_video`) | @Video1 = the silent dressed take. @Audio1 = the master's vocal slice for the clip's own placement window. `generate_audio:false` | The reference video is silent, so **no audio is embedded in the reference video**. The vocal slice starts at 53.8000 (E1) and 55.2750 (E2), exactly the placement syncs. VERIFIED (request payloads + GCC of the slices) | The reference performance window (song 56.91–60.91 for c033) **differs** from E1's placement window (53.8–63.84). This is by design: @Video1 is his body and look, not a timeline. |
| E1 v3 / E2 output | `ce365795` (10.041667 s), `ad2faff9` (10.041667 s): 24 fps | None (video only). VERIFIED | A **new performance** drawn by the model against the vocal slice. |
| Montages (Seedance, no vocals) | c036 `b77ef700`, c037 `941148e8`; in the Cut: c033 `f4161801`, c034 `6e2bb2bc`. Each 97 frames / 4.041667 s | The request had a silent reference and **no audio reference at all**. VERIFIED | No audio drove the mouth. Syncs are derived from the reference window (56.91, 58.395, 61.348, 63.066). |
| Board placement | `shot_asset_assignments.slip_seconds` = 0 on every row above. VERIFIED | — | in-point = shot start − (sync + slip). E1 v3 on c033: 58.06 − 53.8 = 4.26 s. The Lyric sync readout and the EDL export read the same value (unit test). |
| Cut (`edit_sequences` 2976b498, song offset 13.791667) | c033 = montage `f4161801` at source 1.166667 → song 58.0417; c034 = montage `6e2bb2bc` at 1.291667 → song 59.7083 | Song on A1/A2 from the master | Both sit within 1 frame of their own syncs (−0.035 s and +0.022 s). E1 v3 and E2 are **not** in this sequence. VERIFIED |
| Cut render | `edit-render` dry-run on the deployed function | — | Trims print as six-decimal grid times (`trim=start=0.166666`). **The frame-trim fix (#336) is live.** VERIFIED |

**Where the audio reference diverges** (VERIFIED):
1. The original's audio is dropped at the hero transcode (`-an`). Everything downstream is silent, so no generated clip ever had embedded audio.
2. E1/E2 got a separate vocal slice for the right window. The montages got no audio at all.
3. E1/E2's body reference comes from a different song window than their placement.

**Where the timing reference diverges:** nowhere in preprocessing or placement. Original → hero → dress keeps timing to
about 1 frame. Placement in the board, the export and the Cut each agree with the stored syncs to within 1 frame. Any
remaining offset is in the **generated performance itself**.

## 2. What each route is documented to do (`video-providers-higgsfield-model`, CC)

- **Genjutsu object-swap** (`video_to_video`): replaces only what the prompt names. Output length = source length; it
  re-synthesises the frame from the source, so pose, mouth and timing come from the source. Measured on S06 (1 Oct): it
  can resample frame rate and needs a retime conform (`match_grade.py --retime`). Our c033/c034 conform holds timing (above).
  **This is an edit that preserves his performance.**
- **Seedance 2.5 `reference_to_video`**: makes a new 4–30 s clip from up to 10 videos, 30 images and 10 audio files as
  *references*. Nothing documented promises frame-locked lip sync to a supplied audio file, or reproducing the reference
  video's timing. **This is a new performance.** The vocal slice gives the model the words to perform; it does not lock them.
- DECISION: no route switch. The brief forbids switching without evidence, and nothing here says the Seedance route
  can preserve an existing performance.

## 3. Constant-offset test (indicative only)

Method: inner-lip gap per frame (MediaPipe, full-body crop), then the deepest closure within ±0.35 s of each bilabial
word (murder, But, rap bout, im, whippin, home, but, This). Offset = closure − word; + means the picture is late.

| Clip | Per-event offsets (s) | Median | Read |
|---|---|---|---|
| Original at 0.8538 | murder +0.029, But +0.046, im +0.032; home/but ≈ +0.2 | +0.03 | Clean events agree within 1 frame. |
| Dressed c033 | +0.214, +0.062, −0.098, −0.024, +0.201 | +0.062 | Frame map says this clip is on time, yet the metric spreads ±0.2 s. |
| Dressed c034 | +0.154, −0.006, −0.202, +0.202 | +0.074 | Same. |
| E1 v3 | rap bout −0.132, im −0.035, home −0.038, but +0.262, This −0.182 | −0.085 | In c033's window (58.06–59.54): ≈ −0.04 (im, home). |
| E2 | murder −0.118, But −0.068, rap bout +0.093, im −0.102, home −0.063, but +0.028, This −0.082 | −0.075 (IQR 0.065) | Most consistent. In c034's window (59.54–61.01): −0.06 / +0.03. |
| Montage c033 / c034 in the Cut | +0.317, +0.157, +0.047, −0.337 / +0.132, −0.052 | — | Spread too wide to read. |
| Montage c036 / c037 | one event +0.033 / face found in 10 of 97 frames | — | Not analysable. |

OBSERVED: on footage whose timing is proven (the dressed takes), this metric still spreads by ±0.2 s at full-body
framing. It cannot prove or disprove a constant offset, or call an interval "changed articulation". The `im` and
`whippin` events also land on the same closure. **HYPOTHESIS:** E1 v3 and E2 play about 1–2 frames early (picture
leads the words), which matches Fendi's "says the right words but plays early". Test: the side-by-side comparisons below,
judged by eye.

## 4. Comparison playback supplied (posted in the session, scratchpad only)

- `E1v3_sync_x1/x0.5`, `E2_sync_x1/x0.5`: original camera | clip as stored (slip 0) | clip 2 frames later (slip +0.083).
  Album master under all three; song time burned in.
- `c033_montage_x1/x0.5`, `c034_montage_x1/x0.5`: original | dressed reference | the montage that sits in the Cut.
- `original_offsets_x1/x0.5`: the original at the stored 0.8538 next to the 0.7038 Fendi judged by eye earlier.

## 5. Corrections (RECOMMENDATION: not written; Fendi judges by eye and sets them in Lyric sync)

| Clip on shot | Try | Why |
|---|---|---|
| E1 v3 on c033 | slip **+0.042** (1 frame later); audition 0 to +0.083 | in-window closures −0.035 / −0.038 |
| E2 on c034 | slip **0** to **+0.042** | in-window −0.063 / +0.028 |
| E1 v3 or E2 used as a whole 10 s | judge per phrase | events range −0.18 to +0.26; possible drift or changed articulation around `but` (song ≈ 60.0–60.4) — check that interval by eye first |
| Dressed c033 / c034 | none | timing VERIFIED |
| Montages (c033/c034 in the Cut, c036, c037) | judge by eye; keep as alternatives | no audio drove these mouths; flag any interval that is unusable and cover it with a cutaway or the original take |
| The original's sync | keep 0.8538 unless the A/B says otherwise | measured from the song in his own recording. His earlier 0.7038 is 0.15 s earlier; the A/B was posted for him to decide. Never move the master song to fix picture timing. |

## 6. Tool changes (this PR)

- Lyric sync on the board now gives **every performance video with a sync** the same manual controls: scrub, press a
  line, ±1 frame / ±0.1 / ±0.5 s, typed slip, play with the song. Montages and restages are included (before, they got
  only "the mouth is the model's … does not line the mouth up"). E1 v3 and E2 are `restaged`, so the clip Fendi approved had no slip control.
- Neutral guidance instead of a verdict: constant offset (one slip fixes every word) vs drift (words come apart along
  the shot) vs changed articulation (a word shaped differently; note the interval, cover it). Each nudge says which way it moves the picture.
- The same neutral wording in the Cut (`editModel.ts` warning, `CutTimeline.tsx`, `media.ts`, `IN_APP_EDITOR.md`). The
  shared lines use the wording of the open Cut-workspace PR #337, so the two merge cleanly. #337 (Cursor) carries the full Cut editor:
  preview with song, explicit "Adjust footage timing" slip on any clip, save with versions. That PR is Class C (it includes
  auth) and is not merged by this session.

## 7. Slip signs (checked after #337 merged)

The word "slip" carries **opposite signs** in the two places Fendi can adjust a performance (VERIFIED from code):

| Where | Stored as | `+` means |
|---|---|---|
| Board, Lyric sync | `shot_asset_assignments.slip_seconds` (song = take·k + offset + slip) | the picture plays **later** against the song |
| Cut, "Adjust footage timing" | `edit_clips.source_in/out` moved by `deltaFrames` (`editModel.ts` `applyGesture`) | later source frames fill the same slot, so the mouth appears **earlier** against the song |

Both UIs now name the direction on each button: the board's nudge titles, and the Cut's `timingExplanation` label. A
number copied from one to the other must be **negated**. The suggested E1 v3 slip of +0.042 on the board is −1 frame in the Cut.
Review's "Check the cut" now applies the board slip (`verify.ts` `takeTime`). Before this, every slipped shot was reported off the song clock.
