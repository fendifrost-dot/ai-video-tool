# Style Learn — phase 1

Learn the editing style of a reference video and draft that rhythm on Fendi's footage.

Class C. This branch does not deploy, does not run SQL, and does not call a paid model. Merge waits on architecture, product, and security sign-off. See `RISK_REGISTER.md` STYLE-1.

Cost of the work in this change: **$0**. Tools were local ffmpeg, ffprobe, Python, and numpy. PySceneDetect, OpenCV, and librosa were not installed here. No GPU. No API key. No provider call.

## What you run

Extract, on the machine:

```bash
python3 scripts/style/extract_style.py reference.mp4 --out style.json
```

Apply, on the machine. `clips.json` lists `id`, `path`, `duration`, and `subject` (`fendi_performance`, `ai_broll`, or `no_fendi`):

```bash
npx tsx scripts/style/apply_style.ts --profile style.json --clips clips.json --song song.wav --out style-draft
```

`style-draft/` then holds `edl.json`, `grade.cube`, `draft.mp4`, and `render.json`.

`--dry-run` writes the EDL and the LUT and does not encode. `--vision` is off unless you pass it. Passing it does not call a model. It records `vision.status: "refused"` unless `AVT_STYLE_VISION=local` and `AVT_STYLE_VISION_LABELS` points at a JSON list of words on disk.

Store the profile on the project with `avt_style_profile_save` (a versioned `project_assets` row, the previous one tagged superseded). Read it with `avt_style_profile_get`. Plan without rendering with `avt_style_plan`. All three are $0. The plan tool does not write and does not encode. The page is **Style Learn** under the project's engineering nav. It loads a profile JSON, shows this summary, and downloads an EDL and a LUT. It does not upload and it does not render.

A performance take stays at speed 1. RGB split, glitch, and heavy shake are withheld on that take. Grade, grain, vignette, letterbox, and a mild zoom still apply. The draft is not a picture to post. Check `docs/SHOT_RULES.md` before anything with him goes out.

## How an effect is recreated

Every learned effect picks one tier. The share is stored on the profile as `resolution` (`code`, `local_model`, `generative`, and the counts).

1. **Code** (the default). ffmpeg when a filter exists. Otherwise a per-frame recipe in `scripts/style/recipes.py` (numpy): pixel sort, row glitch, chromatic shift, mirror, kaleidoscope, trails, halation, light leak, VHS, lens distortion, motion blur, freeze, and a contrast replay for an unclassified event. Trails use a frame mix. That is the optical-flow stand-in. RAFT is named as the local upgrade when a real flow field is needed, and it is not downloaded.
2. **Local model.** Only a cutout needs one: MediaPipe's selfie segmenter, the same free model `scripts/edit/face_check.py` already uses, and only if it is installed. `sam3-segment-proxy` is a paid Fal mask, so it is not this tier.
3. **Generative.** Only when the effect invents something that was not filmed. The recipe names an AVT function that already exists and says why in plain words. This library does not call it.

| What was not filmed | Existing AVT route | Not a new integration |
|---|---|---|
| A new place / hero still | `world-still-proxy` with `gemini-nano-banana-2.1` | The Hero Frame and world-still path. Name Gemini. The tool's default is still Grok, and Grok does not ship without Fendi's words. |
| That still, moving | `proxy-provider-call` → `video-providers-higgsfield-model`, `kling-2.5-turbo-pro-i2v`, or `montage-shot` (Seedance 2.5) | The storyboard's Kling and Seedance routes. |
| Clothes replaced on a clip | `dress-clip` (Higgsfield Genjutsu) | Face put-back stays the face-preserving recipe. |
| Clothes on a still | `wardrobe-vton-proxy` or `compose-look-proxy` | Look composite. |
| An object added to a take | `runway-video-edit-proxy`, or `montage-shot` for a new shot | Runway video edit and Seedance. |
| A new face | `faceswap-proxy` | The route exists. It is not used on Fendi. |

A color-bar reference with a white flash, bars, and a graphic resolved **100% in code** (5 effects, 0 local, 0 generative) in the synthetic test. Cost of that run: **$0**. A paid vision pass is not wired. `--vision` still refuses unless a local label file is already on disk, which is also $0.

## Finding an effect without knowing its name

Each effect has a plain sentence, the industry names and aliases, a start and end, and a small JPEG from that moment. Search is `avt_style_library_search` or the box on the Style Learn page.

- "the screen flashes white" matches the plain sentence and the aliases.
- "the thing at 0:42" matches whatever effect covers 42 seconds.

Combining is the cut rhythm of one profile plus the checked effects of another. `avt_style_library_apply` plans that cut from the stored recipe. It does not open the source video again. A generative pick comes back as `tier3_routes` with `called: false`.

The tables are `style_learn_profiles` and `style_learn_effects` in `supabase/migrations/20261117120000_style_learn_library.sql`. They are not `style_profiles` (that table is the timeline's color and vfx rows). **The migration has not been applied.** Do not run it until Fendi approves it in Lovable's SQL editor.

## Matched

These are measured from the file:

- Shot boundaries (chroma distance on the center of the frame; PySceneDetect when it is installed)
- Shot-length distribution (count, mean, median, p10, p90)
- Hard cuts
- Flash and white frames
- Letterbox and aspect
- Average contrast and saturation
- Cut timing against audio onsets (the beat-grid onset flux; librosa when it is installed)

## Approximated

These are heuristics. The draft follows the numbers. It does not recover the original effect.

- Crossfades and whip pans (a run of moderate change, or a blurry boundary). The render uses `xfade` fade and `smoothleft`.
- Speed ramps and slow motion (motion energy against the clip's own median, and only when the picture is actually moving). Applied to b-roll only.
- Zoom and shake intensity (center detail and the variance of frame-to-frame motion). Shake is withheld on a performance take when it is heavy. Zoom is a small punch-in.
- Color grade as lift, gamma, gain, and a generated 17-point `.cube`. Not a recovered LUT.
- Grain and vignette amount (`noise` and `vignette` filters)
- Text and caption overlays (a persistent high-contrast band). A hard graphic bar counts. Words are not read.
- Strobe, RGB split, and glitch (periodic brightness, a channel shift). RGB split and glitch are withheld on a performance take.
- Vision-model labels. Off by default. Refused without a local label file.

## What the synthetic test showed

Observed on a 2.3s 320×240 clip built by ffmpeg: 0.5s red, a white flash, blue, green, black bars, a white rectangle, and a 120 bpm click track.

| Check | Result |
|---|---|
| Shots | 3, including a flash out of the first |
| Letterbox | top and bottom bars at 0.125 |
| On-beat cuts | 0.5, preference `beat` |
| Text-like band | 0.96 of frames (the rectangle sits on every frame; the detector does not read words) |
| Strobe, RGB split, glitch | not flagged |
| Vision | `off`; `--vision` with no local file is `refused` |
| Draft | `draft.mp4`, 4.0s, video stream present, performance clips at speed 1 |
| Cost | $0 |

The automated test is `src/lib/style/styleLearn.test.ts`. It rebuilds that clip and renders the draft. Counts belong in the test report, by category, not as a single passing headline.

## Blockers

- PySceneDetect, OpenCV, and librosa are optional. This environment did not have them. The fallbacks are the ones the test ran.
- The edge function cannot encode. Rendering stays in `scripts/style/apply_style.ts`.
- No new SQL. Saving a profile uses the existing `project_assets` shape. That write is not run against production here.
- A true speed ramp, a recovered print LUT, and any generative effect (film damage, light leaks, a designed transition) are not in this phase.

## Phase 2

- Generative transitions and FX through a paid video model, only after a quoted dry run and Fendi's approval. Not a face redraw, and not on a performance take's mouth.
- Optional local vision labels for FX the heuristics miss, still behind the flag, still no remote call unless he approves one.
- A button that files the EDL through the existing `avt_edit_save` after he has looked at the draft.
- PySceneDetect and librosa on the worker image so the optional detectors are the default when they are installed.
