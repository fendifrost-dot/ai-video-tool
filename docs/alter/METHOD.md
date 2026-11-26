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
| Mouth timing | 0.60 | `scripts/edit/camera_coverage.py` `lip_best_fit_min`, the existing sung-line gate. |
| Identity distance | 0.25 | `scripts/edit/camera_coverage.py` `identity_max`. Lower is closer. |
| Landmark distance | 0.08 of the frame | Provisional watch only. About one lip-height of error. Not a certified benchmark. It does not fail a draft by itself. |

A rapping shot with no mouth series, or no identity distance, is CHECK. The redraw is not finalized. If "put his face back" is on, the deliverable is the masked composite of his original face and mouth, then the original audio.

`node --experimental-strip-types scripts/alter/check_clip.ts take.mp4 draft.mp4 --mode swap` scores two local files. It does not call a provider.
