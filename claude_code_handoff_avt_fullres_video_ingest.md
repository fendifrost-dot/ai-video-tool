# AVT Handoff — Full-Resolution Source-Video Ingestion

**Date:** 2026-06-30
**Repo:** `fendifrost-dot/ai-video-tool` (`origin` = https://github.com/fendifrost-dot/ai-video-tool.git)
**Branch:** `main`
**HEAD at handoff:** `895f4b1`
**Status:** Code + migration committed to `main`, local builds green. **Not yet deployed** — Publish + edge redeploy + migration apply + one manual dashboard step still required (see §5).

> ⚠️ **Concurrency note:** This work landed on `main` across two commits from two sessions. A later session was mid-build on the same tree. Anyone continuing should `git fetch && git log --oneline` and **diff against `895f4b1`/`594339e` before editing** — do not rebuild from scratch or you'll duplicate/collide.

---

## 1. Problem

Fendi's original is a 4K iPhone `.mov` (~1.67 GB), but the project's source clips in Storage were tiny (~1.6 MB / 0.4 MB / 0.2 MB) and the one used by Hero Frame Studio decoded at **406×720**. Capturing the hero frame from that low-res proxy produced a soft face — which also degrades the eventual SwitchX motion clip, since it keeps the face from the source frames.

## 2. Investigation findings (root cause)

- **AVT does NOT downscale, transcode, or re-encode video.** There is no MediaRecorder / canvas-capture / ffmpeg.wasm anywhere in the codebase (confirmed across all git branches). The upload path streams file bytes **verbatim** to Supabase Storage.
  - `AssetUploadDropzone` → `normalizeImageForUpload()` (no-op for video; only transcodes HEIC→JPEG) → `uploadToBucket()` → `uploadBytesToBucket()` (raw `fetch` PUT/POST of the Blob body).
  - Edge `upload-asset` just writes received bytes via service role. No processing.
- **The 406×720 `hero_src_clip*` files were prepared externally** and uploaded as-is — hand-made ~3 s test proxies for the Phase 2 kill-gate (see `claude_code_handoff_avt_hero_frame_phase2_gate.md:148`). The app faithfully stored what it was given. There is no higher-res original in Storage.
- **`captureFrame.ts` captures at native `videoWidth × videoHeight`** — so it was never the culprit; feed it a 4K clip and it yields a 4K JPEG automatically.

### Blockers to ingesting the real 1.67 GB 4K master
1. **OOM:** `AssetUploadDropzone.stageFiles()` did `await file.arrayBuffer()` on **every** file → a multi-GB copy OOMs the browser tab.
2. **500 MB cap:** UI copy + edge `MAX_BYTES` (`upload-asset/index.ts`).
3. **Per-bucket `file_size_limit`:** `project-references` = 100 MB, `project-clips` = 500 MB (set in `20260514210100_storage_buckets.sql`) → server-side **413** regardless of client code.
4. **120 s network timeout** on the single-shot upload path — far too short for a multi-GB upload.
5. **Project-wide Storage "Upload file size limit"** (Supabase dashboard) — external, caps everything, overrides per-bucket limits.

## 3. Fix implemented

Small files (≤ 50 MB) keep the exact existing path — image / LUT / overlay / audio / small-clip flows are byte-identical. Large files (> 50 MB) take a new **resumable (TUS) direct-to-Storage** path that streams in 6 MB chunks (constant memory, no `arrayBuffer` copy), resumes across network blips, and **bypasses the `upload-asset` edge body cap** entirely.

### Commits
| SHA | Contents |
|---|---|
| `594339e` | TUS resumable upload (`uploadResumableToBucket`), `uploadLimits.ts`, dropzone rewire (OOM fix + routing + real progress %), edge `MAX_BYTES` → 4 GB. Adds `tus-js-client` dep. |
| `895f4b1` | Migration raising `project-references` + `project-clips` `file_size_limit` → 4 GB (the actual 413 blocker `594339e` left open). |

### Files
- **`src/lib/uploadLimits.ts`** *(new)* — single client source of truth: `MAX_UPLOAD_BYTES = 4 GB`, `STREAM_THRESHOLD_BYTES = 50 MB`, `MAX_UPLOAD_LABEL = "4 GB"`. Header documents that the edge function keeps its own mirrored literal and that the dashboard/bucket limits are enforced separately server-side.
- **`src/lib/storage.ts`** — new `uploadResumableToBucket(bucket, path, file, { upsert?, onProgress?, stallTimeoutMs? })`:
  - Endpoint `${SUPABASE_URL}/storage/v1/upload/resumable`, `chunkSize = 6 MB` (Supabase-required), `Authorization: Bearer <jwt>`, `x-upsert` header, metadata `{ bucketName, objectName, contentType, cacheControl }`.
  - `retryDelays` backoff + `findPreviousUploads()` / `resumeFromPreviousUpload()` → resume-on-drop instead of restart.
  - **Stall timeout** (default 90 s of *no progress*), not a flat wall-clock deadline — a legit multi-GB upload runs far past 120 s and must not be killed for taking a long time.
  - Existing `uploadBytesToBucket` / `uploadToBucket` / `uploadViaEdgeFunction` unchanged.
- **`src/components/assets/AssetUploadDropzone.tsx`**
  - `stageFiles`: files > `STREAM_THRESHOLD_BYTES` keep the raw `File` (no `arrayBuffer` copy → OOM fixed); ≤ threshold keep the detached-File-defense copy.
  - `handleUpload`: > threshold → `uploadResumableToBucket` with real `onProgress`; ≤ threshold → `uploadToBucket`. `normalizeImageForUpload` is skipped for large files.
  - Progress bar shows real % for resumable uploads; copy now reads "Up to 4 GB per file".
- **`supabase/functions/upload-asset/index.ts`** — `MAX_BYTES` → 4 GB, with a comment that large videos do **not** traverse this function (it buffers the whole body; only small raw-bytes callers like Hero-Frame capture use it) and that Storage limits are enforced separately.
- **`supabase/migrations/20260630000000_raise_source_video_bucket_limits.sql`** *(new)* — `update storage.buckets set file_size_limit = 4294967296 where id in ('project-references','project-clips')`.

### RLS / capture — unchanged
- TUS uploads carry the user JWT and the path starts with `user_id`, satisfying the existing `*_insert_own` storage policy. No policy change.
- `captureFrame.ts` unchanged — already resolution-agnostic; a 4K source now yields a 4K hero JPEG.

## 4. Verification (local, green)
- `npx tsc --noEmit` → **exit 0**
- `npx vite build` → **✓ built**; `tus-js-client.mjs` bundled (dep resolves)
- `deno check supabase/functions/upload-asset/index.ts` → **exit 0**

## 5. Deploy matrix

| Step | Action | Owner |
|---|---|---|
| 1. Frontend | **Lovable Publish** (`storage.ts`, `uploadLimits.ts`, `AssetUploadDropzone.tsx`) | — |
| 2. Edge fn | `supabase functions deploy upload-asset` | — |
| 3. Migration | Apply `20260630000000_raise_source_video_bucket_limits.sql` (`supabase db push` / Lovable migration apply) | — |
| 4. **Dashboard (manual, not code)** | Supabase → **Storage → Settings → global "Upload file size limit" ≥ 4 GB**. Not settable via SQL; overrides per-bucket limit. Without it, uploads still **413**. | **Human** |

## 6. Open flags / risks

- **`bun.lock` is out of sync.** `tus-js-client@^4.3.1` is in `package.json` + `package-lock.json` (both committed) but **missing from `bun.lock`**. If the deploy runs `bun install --frozen-lockfile`, it fails. **Remedy:** run `bun install` in an env that has `bun` to refresh the lockfile, or confirm the build uses npm (package-lock is correct). (Could not fix here — no `bun` on the box; `npx bun install` timed out fetching the binary.)
- **No data backfill.** This fixes ingestion **going forward**. The existing 406×720 `hero_src_clip*` proxies remain low-res. After the dashboard limit is raised, **re-upload Fendi's real 4K master** to get a sharp hero frame (and downstream a sharp SwitchX motion clip).
- **Bucket vs project limit.** The migration only raises the per-bucket cap; the project-wide limit (step 4) is the one people forget.

## 7. Quick smoke test (post-deploy)
1. Confirm dashboard global limit ≥ 4 GB and migration applied.
2. Assets tab → drop a > 50 MB (ideally the real 4K) video → watch the real % progress bar; confirm no tab OOM and the upload survives a brief network drop (resume).
3. Storage: the stored object matches the source size/resolution (not a 406×720 proxy).
4. Hero Frame Studio → select that clip → the `<video>` reports 4K `videoWidth/Height`; capture a frame → the saved `hero_frame_*.jpg` is full-res.
