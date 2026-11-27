# ALTER in AVT

Class C (a provider payload that redraws him on a performance take). The planner does not submit. No SQL.
**To run a shot, use the run sheet: [`../recipes/ALTER_ACTION_ON_A_RAPPING_TAKE.md`](../recipes/ALTER_ACTION_ON_A_RAPPING_TAKE.md).** This page is the design behind it.

The method is the MIT `scenario-alter` skill (https://www.scenario.com/explorations/alter/, frontmatter `license: MIT`). AVT does not call the Scenario MCP. The edit runs on the route that rendered the draft Fendi passed on 26 and 27 Nov 2026: AVT `proxy-provider-call` -> Control Center `video-providers-higgsfield-model`, variant `seedance-2.5-edit` (Higgsfield `bytedance/seedance-2.5/video-edit`).

## Modes

| Mode | Kept | Changed |
|---|---|---|
| Swap | person, light, camera | one outfit, prop, or product |
| Motion transfer | performance and camera | who is on screen, or the place |
| Restyle | motion and framing | the whole look |

36 presets from the skill, plus AVT's own `action` preset (swap mode, checker mode `action`): something happens in the take while the performer keeps his performance. Its wording is the prompt of the passed draft with the shot's particulars turned into slots; it lives in `catalog.ts`, outside the MIT `catalog.json`. A target frame is one still of the change already sitting in a frame of the take. `compositeTargetFrame` is the local $0 paste. The skill's Gemini "photograph it in" pass is not run.

## Draft, then check, then maybe full resolution

`planAlter` returns the arguments of one `avt_call` for a 480p draft (`draft`; null while anything is blocked, with the request shown under `preview` for reading only) (`generate_audio: false`, the take as `referenceVideoUrl`, an optional target frame as `@Image1`, then up to four of his face photographs with their own `@Image` tags). It is not sent: a person or an agent sends it. A prompt with an unfilled slot, a link that is not https or carries credentials, more than four face pictures, or a preset whose change names `@Image1` with no target frame attached, is not ready.

`planFinalize` attaches the full-resolution call (720p or 1080p) for a draft whose report passes. The report (`report.json` from `run_draft.py`) is judged again from its numbers by `judge.ts` `rejudge`: its own verdict, flags and issue list are ignored, a missing or impossible number is an error, and it must be for the preset's check mode and the plan's performance setting. No open issue may stand and the mouth must have passed. The face is cleared by a passing identity number, or, while no number exists, by `faceApproval`: words the caller says are Fendi's about that draft's face. The server cannot verify them, and the call's note says so. This is a checklist that keeps an honest caller on the run sheet, not a spend control: the paid step is `avt_call`, which the same caller can use directly. Full resolution is a new render of the same request, not an upscale of the draft: it is conformed, scored and shown again. The provider's playground also lists a draft switch and `bytedance/seedance-2.5/finalize-draft`; neither is in its API docs and neither is wired (an open item).

One judge: `judge.ts` holds the only verdict logic. `checkAlter` measures frames and calls it; `avt_alter_check` and `planFinalize` call it on a handed-in report. The mouth is judged only on a performance; the face is judged on every clip, because the edit redraws him whether or not he is rapping. `redrawCleared` and `faceNeedsHisEye` both require that no other issue is open, so an edit that did not take, a frozen draft or a lost scene is never handed to his eye as "only the face is open".

## The provider route, as tested (26 Nov 2026)

`TEST_2026-11-26.md` is the first real draft. Two things it proved, both built in now:

- **An edit goes to the video-edit endpoint.** The edit wording ("Edit @Video1 …") is refused on `reference-to-video`, because an edit takes its length and frame from the source. `plan.ts` builds the `seedance-2.5-edit` body: the source clip, pictures, a resolution; no duration, no aspect ratio.
- **Conform the draft before scoring it.** The draft comes back about 7% fast (89 frames for a 96-frame source), as Genjutsu does. `scripts/alter/conform_draft.py` stretches it to the take's length, interpolates to the take's rate with `scripts/edit/swap_rate.py`'s filter, and writes exactly the take's frame count with no B-frames. It refuses a file whose length is outside 0.90 to 1.20 of the take's: that is not the take played a little fast. Unconformed, the mouth gate reads 0.15 and calls a good draft re-timed; conformed, the same draft reads 0.86 at 0 frames. `scripts/alter/run_draft.py` runs conform, track, score, check, face sheet and the side-by-side in one command.

## If a draft fails

Re-roll, change the staging, or use his real take. **His original face is not laid back onto a redraw.** Fendi failed that step on 27 Nov 2026 ("Clip 3 is the putback. That's the fail. The face was warping on clip 3."): the laid-on face slides in motion on a face about 96 pixels wide, and the mouth gate did not see it (the put-back scored 0.931 against the clean redraw's 0.860). `track_mouth.py putback` stays in the file for study and prints that note. This says nothing about the clothing-swap put-back (`scripts/edit/body_only_swap.py`), which works on his real take.

## Gates, and where the numbers come from

| Gate | Number | Where it came from |
|---|---|---|
| Structure floor | swap/recast 0.45, motion 0.08, restyle 0.12 | scenario-alter `qa.md`, calibrated 21 Oct 2026 on that skill's takes. Not measured on Fendi's footage. |
| Changed area | swap 0.4%–55%, recast 1%–55%, motion ≥5%, restyle ≥15% | same page. The swap floor is the cup-to-can case (1.9% changed). |
| Restyle structure max | 0.65 | same page. Above that, the photo surface survived. |
| Motion correlation | 0.60 | same page. Below that, the output was re-timed or frozen on their coarse grid. |
| Mouth timing | 0.65 on the take's clock | Fendi's footage, 26 Nov 2026 (`CALIBRATION_2026-11-26.md`): halfway between the highest wrong-moment score (0.567) and the lowest real redraw of the same performance (0.744). |
| Mouth re-timed | best fit 2 or more frames off the clock | Same run. Every real redraw fit best at 0 frames; every take moved 2 or more frames against itself fit best off the clock. One frame passes. |
| Mouth shape | fail above 0.06 face widths, warn above 0.04 | Same run. Identical footage at 480p reads 0.030 to 0.032 apart (the tracker's noise); real redraws 0.026 to 0.029. |
| Face read | 80% of frames, in both clips | A decision. Below it nothing is claimed about the mouth. |
| Identity distance | above 0.25 fails; under it clears nothing | `scripts/edit/camera_coverage.py` `identity_max`. Lower is closer. NOT certified (`IDENTITY_2026-11-27.md`): the draft he passed read 0.021, the put-back he failed 0.010, him on other takes 0.21 to 0.30; no rejected face measured. `IDENTITY_GATE_CERTIFIED` is false. |
| Motion and jumps in `action` mode | reported, not judged | A decision on one sample: the passed draft read -0.16 with 33 "jumps", which is the action that was asked for. Structure, change, frozen frames, tail drift and the mouth are still judged. |

A rapping shot with no mouth score is CHECK. With no identity distance, or with one under the uncertified line, it is also CHECK, marked `faceNeedsHisEye`: the tool does not clear a face on a number nobody has derived from evidence; Fendi judges the face sheet. A distance above the line fails the draft.

## Reading his face and mouth (local, $0)

`scripts/alter/track_mouth.py` is the tracker the first pass did not have. It uses the put-back's own model files (`$AVT_MODELS/face_landmarker.task`, `selfie_multiclass_256x256.tflite`), finds his face the way `mouth_scan.py` does, and never downloads anything.

```bash
python -I scripts/alter/track_mouth.py track take.mp4 take.json          # --start S --duration D for a stretch of a long take
python -I scripts/alter/track_mouth.py track draft.mp4 draft.json
python -I scripts/alter/track_mouth.py score take.json draft.json --out score.json
node --experimental-strip-types scripts/alter/check_clip.ts take.mp4 draft.mp4 --mode action \
  --track-source take.json --track-output draft.json --score score.json
```

- `score` writes the mouth timing on the take's clock, the best fit within 6 frames and its lag, the mouth-shape distance in face widths, the share of frames read, the head-turn difference, and the identity distance when `$AVT_MODELS/arcface_w600k_r50.onnx` is on disk with the pinned checksum (null otherwise; another file under that name is refused).
- `avt_alter_check` takes the checker's report (`report.json`) as `report` and judges it again from its numbers with the gates above. The measuring happens where the footage is; the thresholds live in `gates.ts` and the verdict logic in `judge.ts` only.
- One command does all of the above after a draft is downloaded: `python -I scripts/alter/run_draft.py --take take.mp4 --raw raw.mp4 --out work/ --mode action --face …`.

## What the tracker cannot read

Measured 26 Nov 2026 on the four Meditate takes, a 4 s stretch each: the front takes read on 96 of 96 frames (`IMG_6547` wide, `IMG_6550` medium). The low 45-degree take read on 9 of 96 and the side profile on 3 of 96. On a take like those the mouth is not measured, so a redraw is never cleared and his face cannot be put back either. A redraw of him is only testable on a take where he faces the camera.

His face is about 8% to 10% of the frame's width on those takes. A 480p draft of the whole frame leaves it about 40 pixels wide, too small to hold a mouth. Cut a waist-up window from the 4K original first (recipe F does the same).

`node --experimental-strip-types scripts/alter/check_clip.ts take.mp4 draft.mp4 --mode swap` scores two local files. It does not call a provider.
