# Camera moves and fal Seedance reference video

**Class C** (provider payload). The planner does not submit a job and does not spend. Architecture, product, and security sign-off are required before merge. No Lovable Publish and no edge redeploy are done by this change. `avt-mcp` must be redeployed before the new tools appear, and the page needs a Publish before it is on the live app.

## What was checked

VERIFIED 2026-11-26 against `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=…`:

| Endpoint | Reference video |
|---|---|
| `bytedance/seedance-2.5/reference-to-video` | Yes. Field `video_urls`. Prompt tag `@Video1`. Task `reference`. |
| `bytedance/seedance-2.5/flash/reference-to-video` | Yes. Same `video_urls` field. |
| `bytedance/seedance-2.0/reference-to-video` | Yes. Same `video_urls` field. |
| `bytedance/seedance-2.5/text-to-video` | No `video_urls` field. |
| `bytedance/seedance-2.5/image-to-video` | `image_url` and `end_image_url` only. |

The reference-to-video schema also requires each video to be 1.8–30.2 s, 24–60 fps, aspect 0.4–2.5, and at most 200 MB. The 137 upstream pills fall inside those bounds (960×400 or 1280×534, 24 fps, 4.5–30 s).

## What AVT does with it

AVT does not hold `FAL_KEY`. Fal jobs go through Control Center `switchx-restyle` action `fal-run` as `{ action, model, input }`. The allowlist for that action lives in Control Center, not in this repo. `bytedance/seedance-2.5/reference-to-video` is not named on an allowlist here. The planner builds that body and sets `submit: false`.

The Seedance route that already runs in production is Higgsfield `seedance-2.5-reference` (`referenceVideoUrls`) through `video-providers-higgsfield-model`. The plan includes that shape, labeled as the existing route, and does not submit it either.

`generate_audio` is false. Duration is the move length clamped to fal's 4–30 enum. Default output is 9:16 at 720p, which is the music-video frame. The pill itself is a wide blockout.

The prompt is a generation goal. It does not open with "Edit @Video1". On 26 Nov 2026 Higgsfield refused that wording on `reference-to-video` and required `video-edit` (recorded on #543). This plan stays on reference-to-video because the pill is a camera reference, not an edit of a take.

Fal bills a video reference's seconds and the output seconds. For the same job that is about twice Higgsfield's list price (read 27 Nov 2026, `docs/alter/TEST_2026-11-26.md` on #543). This planner does not submit, so it does not spend. A later send should say that price before anyone approves it.

## Library

137 moves, MIT, Copyright (c) 2026 Sirio Berati, commit `602aa2348b0ae67589ce533fff571adced724811`. Notice: `supabase/functions/_shared/cameraMoves/NOTICE.md`. Poster stills are in `public/camera-moves/posters/`. Pill bytes are not in git (about 124 MB). Hashes are in the catalog.

```bash
node --experimental-strip-types scripts/camera-moves/render-references.ts --from /path/to/templates
```

That copies each `pill.mp4` and checks the sha256. `--raster CAM06-Orbit` draws a grey blockout when the upstream file is not on disk. Upload to `project-references/{userId}/{projectId}/camera-moves/{id}/pill.mp4`, then pass the signed https URL into the plan.

## Face

The default subject is an environment plate: no generated person. A performance plate says his face and mouth stay the original footage. A non-performance shot can include him only with `face_check` or `put_back`, and the prompt keeps the mouth closed. This page does not run a face check, a lip-sync score, or a composite.

## Footage match

`estimateMotion` reads grayscale frames (image shift and a zoom guess). It does not recover an orbit versus a pan, or a crane versus a tilt. `matchMoves` ranks the library against that signature. Treat the top row as a starting plate.
