# Server-side clip / frame service (generic)

Production infra for the video-swap lanes. **Not** throwaway scaffolding — every
future video op (mask propagation, optical flow, temporal QA, rerender, final
assembly) reuses this timestamped clip/frame service + its manifest. See the
LOCKED architecture in [`VIDEO_SWAP_ARCHITECTURE.md`](./VIDEO_SWAP_ARCHITECTURE.md)
(§4 keep-list, §6 engineering prereqs).

## The problem removed

Making a short frame sequence used to make the **browser** download + decode the
whole (up to ~2 GB, 4K **HEVC**) master (`src/lib/video/extractFrames.ts`). That
is the exact choke the scrub-proxy exists to avoid, and 4K HEVC often won't decode
in a browser at all.

## What Fal actually supports (confirmed 2026-07-29, OpenAPI queue schemas)

- **No server-side full-frame-sequence extractor exists on Fal.**
  `fal-ai/ffmpeg-api/extract-frame` is **first/middle/last only**;
  `fal-ai/ffmpeg-api/compose` **cannot seek** into a source.
- The one server-side clip op is a **seek+trim**:
  `fal-ai/workflow-utilities/trim-video` — `{ video_url, start_time(s), end_time?(s), duration?(s) }`.
- `fal-ai/ffmpeg-api/metadata` returns `duration, fps, codec, container, resolution{width,height}`.
- `fal-ai/workflow-utilities/scale-video` (already CC-allowlisted as
  `SCRUB_PROXY_FAL_MODEL`) can force `libx264` + output dims (512–2048).

## The design

`supabase/functions/wardrobe-video-frame-extract-proxy` (backed by pure helpers in
`supabase/functions/_shared/frameExtract.ts`):

1. **SERVER (the part that must be server-side):** `trim-video` cuts ONLY the
   requested `[start, start+duration]` range out of the master **on Fal** — the 2 GB
   master is pulled by Fal, never by the browser. Then (best-effort) `metadata`
   probes the trimmed clip; if the codec isn't browser-decodable (HEVC passthrough)
   or output dims were requested, `scale-video` re-encodes the **small** clip to
   H.264 at the probed/requested size (never downsampling for a codec-only fix).
   The small clip is stored as `…/extract/<extractionId>/clip.mp4`.
   - **Why this dodges the scrub-proxy `fal_response_failed`:** scale-video died
     because it decodes+re-encodes the **entire** master; trim-video only touches
     the requested range. (Must still be verified live on the real 2 GB HEVC master.)
2. **CLIENT:** decodes that small H.264 clip with the existing WebCodecs path
   (`extractFramesFromUrl`) — a few MB, not the master — and uploads frames to the
   manifest paths. Then calls the fn with `{ finalize:true }` to re-list storage and
   flip the manifest to `ready`.
3. **Lane C** (whole-clip Lucy v2v) consumes `clip.mp4` directly (no frame decode),
   so it runs on exactly the requested range.

**Manifest** (on `project_assets.metadata_json.extract_manifest`): `extractionId`
(= deterministic config hash), per-frame `{ index, sourceTimestamp, path, width,
height, stored }`, `clipPath/clipBucket`, `frameCount/truncated`, and a `repro`
block (trim/scale/meta models, source codec/fps, mode, source path).

**Idempotent + resumable:** the extraction id is a deterministic hash of
`{assetId,start,duration,fps,width,height}`. It namespaces the clip + every frame
path, so a re-run **skips the existing clip** (no re-trim) and **skips frames
already uploaded**. Status lives in `metadata_json`:
`extract_status ∈ {processing, frames_pending, ready, failed}` + `extract_error` /
`extract_warning` / `extract_done_count`.

## In-app trigger

`src/components/video/WardrobeVideoLaneRunner.tsx`, mounted on the **Hero Frame
Studio** page (`/projects/$id/hero-frame`, "Phase 2" section). Requires an explicit
clip range (start + duration — no implicit full-clip), previews lane / model /
garment / settings before running, and shows extraction + run progress + errors.
It calls the (previously unrouted) orchestrators `runLaneARoundtrip` /
`runFrameSwapRoundtrip` / `runLaneCRoundtrip` (`src/lib/queries/wardrobeVideoFrames.ts`)
with `serverExtract`, which now consume server-extracted frames via the manifest.
The client WebCodecs path stays for small local files.

## Deploy checklist (a live agent does this; do not deploy from the model)

1. **GitHub `main`:** merge the PR (edge fn source + client wiring live here).
2. **Lovable Cloud edge secrets** (AVT project `qoyxgnkvjukovkrvdaiq`):
   - `CLIP_TRIM_FAL_MODEL=fal-ai/workflow-utilities/trim-video` **(required)**
   - `CLIP_SCALE_FAL_MODEL=fal-ai/workflow-utilities/scale-video` (recommended —
     same id as `SCRUB_PROXY_FAL_MODEL`; needed for HEVC→H.264 + output dims)
   - `CLIP_META_FAL_MODEL=fal-ai/ffmpeg-api/metadata` (recommended — codec probe)
   - `EXTRACT_MAX_FRAMES` (optional, default 900)
   - Already present (shared with the other proxies): `COMPOSE_LOOK_CC_URL`,
     `SWITCHX_PROXY_SECRET` (or `COMPOSE_LOOK_PROXY_SECRET`), `SUPABASE_URL`,
     `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
3. **Control Center `switchx-restyle` fal-run allowlist:** add
   `fal-ai/workflow-utilities/trim-video` and `fal-ai/ffmpeg-api/metadata`
   (`scale-video` is already allowlisted). **Redeploy CC `switchx-restyle`.**
4. **Lovable Edge Functions → redeploy** `wardrobe-video-frame-extract-proxy`
   (new) and `wardrobe-video-lucy-proxy` (now accepts an owned trimmed-clip source).
5. **Lovable Publish** the frontend from `main` (the new trigger UI).

## Verify (live)

Run a 2–4s Lane B/A extraction against the real 2 GB 4K HEVC master and confirm:
`extract_status` → `frames_pending` → `ready`; `clip.mp4` + ordered `NNNNNN.jpg`
frames appear under `…/extract/<id>/`; re-running the same range **skips** the trim.
If the trim itself returns `fal_response_failed(...trim-video)` on the large HEVC,
that exact error is recorded in `extract_error` — report it (the fallback is
chunked/segmented trimming, out of scope here).
