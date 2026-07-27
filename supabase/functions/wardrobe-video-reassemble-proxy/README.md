# wardrobe-video-reassemble-proxy

**Phase 2a** of wardrobe video propagation — the encoder roundtrip foundation
(`docs/AVT_Wardrobe_Swap_Build_Spec_v2.md` §7). Takes an ordered set of frame
images the client already extracted + uploaded and muxes them back into an H.264
clip via Fal `fal-ai/ffmpeg-api/compose`, routed through Control Center exactly
like every other Fal job in AVT (`fal-run` on CC `switchx-restyle`, polled via
`fal-queue-poll`). AVT holds no `FAL_KEY`; CC does.

No garment swap yet. This proves **master → frames → video (+ audio)** before
Phase 2b inserts the per-frame swap between extract and reassemble.

## Why extraction is client-side

Fal's ffmpeg endpoints only extract **first/middle/last** frames, never a full
sequence. The repo already owns a full-res master-bytes WebCodecs decoder
(`src/lib/video/mp4Demux.ts` + `webCodecsFrame.ts`) that hero-frame capture uses,
so batch extraction runs in the browser at master resolution
(`src/lib/video/extractFrames.ts`), and this function only reassembles.

## Client

`src/lib/queries/wardrobeVideoFrames.ts` → `runFrameRoundtrip()`:
extract frames → upload to `project-exports/<user>/<asset>/frames/<session>/NNNNNN.jpg`
→ `POST /functions/v1/wardrobe-video-reassemble-proxy`.

Request body:

```jsonc
{
  "assetId": "<project_assets id of the master>",   // ownership check + audio source
  "sessionId": "<uuid>",                             // namespaces frames + output
  "framePaths": ["<user>/<asset>/frames/<session>/000000.jpg", ...], // ordered
  "frameBucket": "project-exports",
  "fps": 24,
  "includeAudio": true
}
```

Returns `202`-style `{ ok, status: "processing", outPath, frameCount }`; the job
finishes in the edge background task and writes the result to
`project-exports/<user>/<asset>/reassembled/<session>.mp4`. Poll the master
asset's `metadata_json.reassemble_status` for `ready` / `failed`.

## Secrets (Lovable → AI Video Tool → Edge Function secrets)

| Secret | Value |
|--------|-------|
| `COMPOSE_LOOK_CC_URL` | CC base ending `/compose-look` (shared with wardrobe-vton-proxy) |
| `SWITCHX_PROXY_SECRET` (or `COMPOSE_LOOK_PROXY_SECRET`) | CC proxy secret |
| `VIDEO_COMPOSE_FAL_MODEL` | `fal-ai/ffmpeg-api/compose` — **required**, no model is guessed |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are already
present on the project.

## ⚠️ Control Center dependency

`fal-ai/ffmpeg-api/compose` **must be in CC's `fal-run` allowlist** (project
`7fce9fc6`, same allowlist the jacket-inpaint models use) or CC returns
`model_not_allowed` (400). This is a **CC-side change** — coordinate with the
Control Center owner; it cannot be done from AVT.

## Compose input shape

Built by the unit-tested `_shared/videoCompose.ts`. An `image` track carries one
keyframe per frame (`timestamp`/`duration` in ms, anchored to `i*1000/fps` so
timing never drifts); an optional `audio` track points at the signed master so
compose lays its original audio over the clip. **Audio muxing is best-effort in
2a** — if compose won't read audio from a video-container track, add a dedicated
audio-extract step (a follow-up), the frames→video result is unaffected.

## Deploy

1. Push `main` with `supabase/functions/wardrobe-video-reassemble-proxy/` and
   `supabase/functions/_shared/videoCompose.ts`.
2. Lovable → Edge Functions → **redeploy** `wardrobe-video-reassemble-proxy`
   (Publish alone does not redeploy functions).
3. Set `VIDEO_COMPOSE_FAL_MODEL` if not present.
4. Ensure CC allowlists `fal-ai/ffmpeg-api/compose`.
5. Publish frontend.

## Known limits (Phase 2a)

- **Short clips only.** Client extraction holds/encodes frames in-tab; the
  extractor's `maxFrames` guard (default 900) trims longer clips — lower
  `targetFps` or trim before extracting. Long-clip chunking is a follow-up.
- **B-frame ordering.** The demuxer doesn't parse `ctts`; frames are ordered by
  decode timestamp. Correct for typical phone/H.264+HEVC footage; heavily
  B-frame-reordered sources may need composition-offset parsing later.
