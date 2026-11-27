# ALTER in AVT

Class C (a fal payload and a face composite). The planner does not submit. No SQL. Sign-off before merge.

The method is the MIT `scenario-alter` skill (https://www.scenario.com/explorations/alter/, frontmatter `license: MIT`). AVT does not call the Scenario MCP. The edit, when someone later approves a spend, is fal `bytedance/seedance-2.5/reference-to-video`.

## Modes

| Mode | Kept | Changed |
|---|---|---|
| Swap | person, light, camera | one outfit, prop, or product |
| Motion transfer | performance and camera | who is on screen, or the place |
| Restyle | motion and framing | the whole look |

36 presets. A target frame is one still of the change already sitting in a frame of the take. `compositeTargetFrame` is the local $0 paste. The skill's Gemini "photograph it in" pass is not run.

## Draft, then check, then maybe a full body

The draft body sets `draft: true` (fal forces 480p) and `generate_audio: false`. It is not sent. `planFinalize` attaches an unsent 1080p body only when the checker returns PASS and the face fallback is not required.

Scenario's "Draft Complete" model was not a separate id in the fal schema checked on 26 Nov 2026. The 1080p body is a second reference call, not a claimed draft-completion endpoint.

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
| Identity distance | 0.25 | `scripts/edit/camera_coverage.py` `identity_max`. Lower is closer. NOT measured on his footage: the ArcFace file is not on the machine. |
| Head turn for the put-back | 0.12 face widths | A decision, not measured. Above it his original face is not laid onto the redraw: a flat face on a turned head is a paste-up. |

A rapping shot with no mouth series, or no identity distance, is CHECK. The redraw is not finalized. If "put his face back" is on, the deliverable is the masked composite of his original face and mouth, then the original audio.

## Reading his face and mouth (local, $0)

`scripts/alter/track_mouth.py` is the tracker the first pass did not have. It uses the put-back's own model files (`$AVT_MODELS/face_landmarker.task`, `selfie_multiclass_256x256.tflite`), finds his face the way `mouth_scan.py` does, and never downloads anything.

```bash
python -I scripts/alter/track_mouth.py track take.mp4 take.json          # --start S --duration D for a stretch of a long take
python -I scripts/alter/track_mouth.py track draft.mp4 draft.json
python -I scripts/alter/track_mouth.py score take.json draft.json --out score.json
node --experimental-strip-types scripts/alter/check_clip.ts take.mp4 draft.mp4 --mode swap \
  --track-source take.json --track-output draft.json --score score.json
python -I scripts/alter/track_mouth.py putback take.mp4 draft.mp4 take.json draft.json out.mp4   # the fallback
```

- `score` writes the mouth timing on the take's clock, the best fit within 6 frames and its lag, the mouth-shape distance in face widths, the share of frames read, the head-turn difference, and the identity distance when `$AVT_MODELS/arcface_w600k_r50.onnx` is on disk (null otherwise: a rapping shot is then CHECK).
- `avt_alter_check` takes that JSON as `track_score` and judges it with the gates above. The measuring happens where the footage is; the thresholds live in `gates.ts` only.
- `putback` moves his ORIGINAL face pixels onto the redraw's face (a similarity fit on his eye corners and nose bridge, the redraw's face outline as the mask, feathered, graded to the redraw's surround) and puts the original audio back. It refuses when the head is turned differently.

## What the tracker cannot read

Measured 26 Nov 2026 on the four Meditate takes, a 4 s stretch each: the front takes read on 96 of 96 frames (`IMG_6547` wide, `IMG_6550` medium). The low 45-degree take read on 9 of 96 and the side profile on 3 of 96. On a take like those the mouth is not measured, so a redraw is never cleared and his face cannot be put back either. A redraw of him is only testable on a take where he faces the camera.

His face is about 8% to 10% of the frame's width on those takes. A 480p draft of the whole frame leaves it about 40 pixels wide, too small to hold a mouth. Cut a waist-up window from the 4K original first (recipe F does the same).

`node --experimental-strip-types scripts/alter/check_clip.ts take.mp4 draft.mp4 --mode swap` scores two local files. It does not call a provider.
