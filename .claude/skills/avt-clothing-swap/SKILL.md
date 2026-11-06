---
name: avt-clothing-swap
description: Change what Fendi wears in a real take (or a still cut from one) with his own face kept pixel for pixel, using the AVT tool set (MCP tools + edge functions) and the offline put-back scripts in this repo. Use for any wardrobe change on footage of him, an album-cover still of him in a new garment, or when an agent asks "how do I do a clothing swap in AVT". Also the index of the AVT tool set.
---

# AVT clothing swap (face-preserving) and the AVT tool set

Read this whole page before the first paid call. The method below is the one Fendi approved (c033 18 Oct, c041 4 Nov,
c009 5 Nov 2026). Any other route (whole-frame redraw, lip-sync pass, "face fix") is a rejected method, not a shortcut.

## Rules that never bend

1. **His face is his.** A swap ends with `scripts/edit/body_only_swap.py` putting his real face back and printing
   `max |out-original| on face/hair/skin: 0`. Anything else is a failed run, never a result.
2. **His mouth on lyrics is real footage.** Never generate lip-sync, never a face-altering pass.
3. **Every shot with him passes `docs/SHOT_RULES.md` 1–7** before it is posted or filed, and the post says so.
4. **Lovable-managed backend only.** No `supabase` CLI, no supabase.com dashboard, no service role. Everything goes
   through the AVT MCP tools (`avt_*`) or the app.
5. **Money:** dry-run first, state the cost before spending, record every paid call in
   `docs/LEDGER_YSL_TESTING_BUDGET.md` in the same commit as the result. AVT may approve up to $50; above that, Fendi.
6. **Never print a signed URL, token or key** in chat, a commit or a PR. Never commit media of him or the song.
7. **Post every output** to Fendi as an inline file with its check sheet. He judges; an agent never marks a result
   approved on its own.

## The AVT tool set (MCP server "AVT")

| Tool | What it does | Notes |
|---|---|---|
| `avt_whoami` | the owner's user id (every storage path starts with it) | `3ca10935-8c3d-4479-9a0c-8bfe8050840c` |
| `avt_tables` | the tables and what they hold | `project_assets`, `shot_asset_assignments`, `shots`, `video_variations`, `video_projects`, `character_features` (wardrobe), `provider_jobs` |
| `avt_select` | read rows: `filters: [{column, op, value}]`, `columns`, `order`, `limit` | op: eq neq gt gte lt lte like ilike is in contains. Select narrow columns; `spec_json`/`treatment_json` rows are huge |
| `avt_insert` / `avt_update` / `avt_delete` | write rows (row-level security applies) | `avt_update` must filter on `id`. Never delete an old primary: demote it (`is_primary: false`) |
| `avt_functions` | the callable edge functions | `dress-clip`, `montage-shot`, `world-still-proxy`, `matte-video-proxy`, `performance-sync`, `provider-jobs-tick`, … |
| `avt_call` | call an edge function: `{function, body}` | every paid one takes `dryRun: true` first |
| `avt_upload_asset` | put bytes in Storage ($0): `signed_url` → PUT the file → `finalize` (returns sha256) | buckets `project-clips`, `project-exports`, `project-references`, `project-audio`; path = `<user>/<project>/…` |
| `avt_signed_url` / `avt_list_files` | read a file / list a folder | never repeat a signed URL to the user |
| `avt_browser_session` | a one-hour owner token for downloads/uploads from a script | keep it in a chmod-600 file outside the repo; downloads: `GET /storage/v1/object/authenticated/<bucket>/<path>` with `apikey: <VITE_SUPABASE_PUBLISHABLE_KEY>` + `Authorization: Bearer <token>` |
| `avt_montage` | montage-shot without the browser | same body as `montage-shot` |

Project / board ids in use: YSL "Ice On" project `764a63d2-93cd-44f3-905f-292f14ab2f51`, active board `c067efb9-90af-418e-aa6d-58834f6e19de`.
Frost the Boss cover project `f411e59c-d966-40dc-b746-c0336c3e005d`, board `8b36b906-9ba7-4298-baea-4d63cb661bd8`, shot `cover` `5da65f1d-b447-4ae3-b9ea-8c061f970cc3`.

### The paid functions and what they cost

| Function | Body (the fields that matter) | Cost | Result |
|---|---|---|---|
| `dress-clip` (Genjutsu object swap via Control Center) | `{projectId, assetId, pieceIds:[wardrobe ids], dryRun}`; lane B adds `crop:{path:"<project-clips .mp4 in the project folder>", rect:{x,y,w,h} as FRACTIONS 0–1, window:[s,e]}` | ~$0.68 per source second, billed in whole seconds (4.0 s = $3.405) | filed on the shot unselected by `provider-jobs-tick` (minutes); a crop result is filed off the shot |
| `montage-shot` (Seedance 2.5 reference) | `{projectId, shotId, variationId, reference:{assetId}, sync:"loose", motion:"calm"|"lively", lines:"<timed lines>", dryRun}`; `continuous:{withHim:false, camera, action, endMotion, seconds}` for one take without him | $2.219 per 4 s with him, $1.849 b-roll, $2.311 continuous 5 s | `provider_jobs` row → `result_asset_id` when `status: succeeded` |
| `world-still-proxy` (xAI / Gemini stills) | `{projectId, prompt, promptVersion, sceneTitle, aspectRatio, resolution:"1k"|"2k", n≤4, references?, dryRun}` | $0.07 per xAI still; Gemini ≈ $0.27 | filed in `project-references/…/worlds/` as `project_assets` |
| `matte-video-proxy` | a clip → alpha matte (Fal through CC) | cents | used to place the real him over a plate |

Constraints seen in practice: `dress-clip` refuses `clip_not_on_a_shot` (set `project_assets.shot_id`), `clip_too_short`
(≥ 4 s), `bad_crop_box` (rect must be fractions). A narrative shot drops references on `montage-shot`: set
`shot_type`/`override_json.shotType` to `performance` first.

## The swap, step by step

Needs: ffmpeg; Python with numpy, opencv-python, mediapipe; the two model files (`selfie_multiclass_256x256.tflite`,
`face_landmarker.task`) in `$AVT_MODELS` (copies in AVT storage at
`project-exports …/canonical/body_only_swap_c033_2026-10-18/models/`). Run every script with `python -I`.
Full detail and the approved results: `docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md` ("Run on a new take").

### 0. The garment is in the wardrobe
A `character_features` row per piece (`feature_type` `wardrobe_outerwear` / `wardrobe_top` / `wardrobe_bottom` /
`wardrobe_accessory` / `wardrobe_footwear`, `artist_id` `8d4a4d22-41c0-43ab-ba99-92750f81e335`), with the product photo
uploaded to the **`wardrobe-refs`** bucket under `<user>/<artist>/…` (`dress-clip` signs its pictures from
`wardrobe-refs` only; a picture in `artist-assets` fails with `reference_sign_failed: Object not found`), `file_url` =
that path, `source_url`, `dimensions_description` (construction, colour, pattern in positive words) and
`reference_images` (front, side/three-quarter, detail). `avt_upload_asset` does not take this bucket: `POST
/storage/v1/object/wardrobe-refs/<path>` with the owner token from `avt_browser_session`. Brand sites often block
automated downloads (ralphlauren.com does): ask Fendi for the product shots or screenshots, crop the UI off, upload.
**The swap is given at most 4 pictures**, one per piece in `pieceIds` order; a fifth piece is listed in `notSent`.
Leave the glasses piece out of every swap. Shoes in a four-piece look go in a second pass.

### 1. Pick the original
A real take, cut to a window of ≥ 4 s (whole seconds), filed as `project_assets` on a shot (`shot_id` set) with its
`sha256`, window and source take in `metadata_json`, **and a `performance_syncs` row** (`performance_asset_id`,
`offset_seconds`, `status: "confirmed"`, `method: "derived"`): `dress-clip` refuses `clip_not_in_sync` without one. A
still cover with no song still needs the row; use the window's start in the take as the offset and say so in `notes`.
A new project also needs a `video_variations` row (set as `active_variation_id`) and a `shots` row (`user_id`,
`project_id`, `variation_id`, `shot_number`, `spec_key`, `shot_type`, `spec_json`) before anything is filed on it. He must be at the angle and scale the scene wants (rule 6).
- **Lane A** (he fills the frame): dress the filed clip itself.
- **Lane B** (small figure in a wide/4K take): also cut an enlarged crop around him from the 4K source
  (`crop=w:h:x:y`), upload it to `project-clips/<user>/<project>/…`, and dress with `crop` (rect as fractions of the
  4K frame, `window` in seconds). c044 used 486×864 at (240, 778) on 2160×3840; the cover used 1100×2000 at (350, 1400).

### 2. Dress ($)
`avt_call dress-clip` with `dryRun: true`, read `estimateUsd`, then `dryRun: false`. Poll `provider_jobs` by the
returned `jobId` (`status`, `result_asset_id`) with a background timer; never a foreground sleep. The filed, conformed
asset is `swap.mp4`; the raw provider file is never used.

### 3. Download both
`original.mp4` and `swap.mp4` into an empty folder with the owner's sign-in (`avt_browser_session` or `avt_signed_url`).

### 4. Put the face back ($0)
```
# lane B first: paste the dressed crop back onto the 1080 original
python -I scripts/edit/paste_region_swap.py original_1080.mp4 crop_swap.mp4 x y w h pasted.mp4   # box in 1080 pixels
# both lanes
AVT_MODELS=<models> AVT_HEAD_ZOOM=4 python -I scripts/edit/body_only_swap.py original.mp4 swap.mp4 <out>
# lane B: lift the garment region back onto the 4K original
python -I scripts/edit/dressed_4k.py original_4k.mp4 original_1080.mp4 <out>/c033_body_only_swap.mp4 dressed_4k.mp4
```
The output is always `<out>/c033_body_only_swap.mp4` (rename on filing). Head fit stays OFF; `AVT_HEAD_ZOOM=4` is the
approved setting. Do not change the script to make a shot pass: a failing shot is a finding.

### 5. Read the proof and measure ($0)
- `max |out-original| on face/hair/skin: 0` in the printout, and the per-scene face-found counts.
- `scripts/edit/ring_flicker.py original.mp4 out.mp4 <a-b>` (seam flicker vs the original's own number).
- `scripts/edit/hat_geometry.py out.mp4 <a-b>` when a hat changed (approved range 0.03–0.14).
- `scripts/edit/face_check.py` or a frame tile: his face next to his real face.
- `scripts/edit/mouth_scan.py` when the result must be at rest (moving = mean > 0.08 and std > 0.03).

### 6. A still (album cover) from the result
Pick the frame by eye from a tile of the dressed, face-put-back clip (mouth closed, hands composed), export it at the
4K size (`ffmpeg -ss <t> -i dressed_4k.mp4 -frames:v 1 frame.png`). To place him in a generated plate: matte the frame
(`matte-video-proxy` on the clip, or RobustVideoMatting offline), scale him to the plate's distance, match light
direction, colour and grain (rule 5), never in front of other people (rule 4). On a still cover rule 3 (a moving
plate) does not apply; on a video it does.

### 7. Post, then file on his word
Mux the song at the shot's sync if it is a performance shot, post the clip or still with the check sheet, say
"rules check 1–7 pass". After Fendi's word: `avt_upload_asset` to
`project-exports/<user>/<project>/canonical/body_only_swap_<shot>_<date>/`, a `project_assets` row (`edited_clip`,
`source_tool manual`, `metadata_json.derived_from` = method, original, swap, job, script commit, the proof), demote the
old primary, insert the `shot_asset_assignments` primary (`docs/recipes/MCP_UPLOAD_AND_FILE.md`). Add the ledger row
and the result to the approved-results table in `FACE_PRESERVING_CLOTHING_SWAP.md`.

## A STILL of him in a new outfit (album cover, poster, single frame): the short path, $0.26

**Use a photo, not a take.** Fendi, 6 Nov 2026: "taking a video to create an image is the wrong approach, 100%. Use the
images in AVT." The video recipe above is for footage; a still only needs a still.

1. **Pick the photo** from his `character_features` pictures (`feature_type` `body`: `silhouette_front`
   `1fd67e48`, `posture_neutral` `2ed75b4d`, `silhouette_side` `91f1b325`; the `face` set) or any filed `project_assets`
   photo of him. Match the angle the final picture needs (a drone plate wants a photo taken from above).
2. **Dress the photo with Grok** through `world-still-proxy` (xAI images/edits, refs in `<IMAGE_n>` order):
   `{projectId, model: "grok-imagine-image-2.0", aspectRatio: the photo's, resolution: "2k", n: 2, prompt, references: [
   {source: "character_feature", id: <his photo>, role: "cast"}, {source: "character_feature", id: <piece>, role:
   "garment"} … up to 5 refs ]}`. Prompt as a clothing-replacement edit of the first image: keep the man, face, pose,
   camera, background pixel for pixel; the other images are garment swatches only. $0.08 per candidate + $0.01 per
   input picture; dry-run first. Each result is filed in `project-references/…/worlds/`.
3. **Put his face back, $0:** `python -I scripts/edit/still_face_putback.py original.jpg edit.png out.png $AVT_MODELS`
   aligns the edit to the photo (ECC on the head), pastes the photo's head (face, beard, glasses, cap) over it and
   prints `max |out-original| inside the hard head mask: 0`, the proof. A face that is not found at full size is found
   on an enlarged head crop automatically.
4. **Place him:** `python -I scripts/edit/compose_cover_from_still.py out.png plate.png cx cy height_px cover.jpg`
   (RobustVideoMatting, largest body, scale, grade to the plate, contact shadow, grain). For a frame cut from a take,
   `compose_cover_still.py` instead (it keys the wall panel behind him).
5. Post with the head sheet; file on his word as in step 7 above.
6. **When the picture needs a different ANGLE than any photo of him** (a drone cover), a paste cannot fix it: with
   Fendi's say-so for that picture, let Gemini regenerate him INTO the plate (`world-still-proxy`, Gemini, refs = plate
   as `place`, the dressed photo as `cast` from project-references, three faces as `cast`; prompt names the camera, the
   scale in car lengths, the outfit piece by piece). His likeness is then the model's drawing, checked against his face
   pictures; say so when posting. Never do this for footage (rule 2).

## Him in a generated scene without a swap (recipe F)
When the shot needs him at rest in a place (b-roll), not a wardrobe change: `montage-shot` with a SILENT reference
window of him, `sync: loose`, `motion: calm`, his lines carrying "his mouth at rest, his face toward the camera", body
motion asked for separately. `docs/recipes/BROLL_WITH_HIM_STILL_MOUTH.md`. Check with `mouth_scan.py` before posting.

## Hand off when you stop
Anything not executed is written as `docs/HANDOFF_<TOPIC>.md` (template `docs/HANDOFF_TEMPLATE.md`): done vs not done
with ids and hashes, exact expected values, a cheap command that distinguishes outcomes, what not to do. Code merged
is CODED, never LIVE: Lovable Publish and Edge Functions → redeploy make it live, and the hand-off names which.
