# wardrobe-video-swap-proxy

**Phase 2b** of wardrobe video propagation. Runs the per-frame garment swap
across a frame sequence extracted in Phase 2a, **reference-locked** to one
approved garment image so the outfit is identical frame to frame. Sits between
extract and reassemble:

```
extract (client WebCodecs) → [THIS: per-frame swap] → reassemble (compose)
```

## Consistency model — read this

`switchx-restyle` is a **single-image** CC endpoint. Its actions (`segment-image`,
`vton-frame`, `fal-run`) each take one image and hold **no cross-frame / temporal
state** (confirmed in `wardrobe-vton-proxy`, `sam3-segment-proxy`,
`_shared/jacketInpaintPipeline.ts`). It cannot, by itself, keep a jacket stable
across frames.

**What this function does for consistency: REFERENCE-LOCK.** The garment reference
is resolved + signed **once** and passed unchanged to every frame's swap, so all
frames are conditioned on the exact same outfit image. Verified by
`_shared/frameSwap.test.ts` ("the SAME garment URL rides every frame's request").

**What it does NOT yet do (Phase 2c):** the masked-lock composite
`out = frame·(1−α) + swap·α` from `docs/AVT_masked_garment_swap_LOCKED.md`, which
pins every non-garment pixel to the original frame (SAM-3 mask per frame + the
client composite in `src/lib/garment/grokOutfitLock.ts`). Reference-lock fixes the
outfit *target*; a single-image engine can still leave residual garment-region
flicker until the masked-lock (and, beyond that, an optical-flow / video-native
propagation pass). **Prove reference-lock on a short clip first, then judge whether
2c is needed.**

## Engine — env-selectable, reversible

| `FRAME_SWAP_FAL_MODEL` | Path taken |
|------------------------|------------|
| **unset (default)** | `vton-frame` action (IDM-VTON / CatVTON) — already allowlisted on CC, **no new allowlist needed** |
| set to a Fal model id | `fal-run` on that model (the model **must** be in CC's fal-run allowlist) |

The switchx-restyle **endpoint** is confirmed allowlisted (it's the same transport
as the shipping `sam3-segment-proxy` / `wardrobe-vton-proxy`). Only a *custom*
`FRAME_SWAP_FAL_MODEL` would need a new CC fal-run allowlist entry — the default
path does not. Engine is recorded on the asset as `swap_engine`.

## Client

`src/lib/queries/wardrobeVideoFrames.ts` → `runFrameSwapRoundtrip()`:
extract+upload frames → `POST wardrobe-video-swap-proxy` → poll
`metadata_json.swap_status` → reassemble on the swapped frames.

Request body:

```jsonc
{
  "assetId": "<project_assets id of the master>",
  "sessionId": "<uuid, shared with the frame upload>",
  "framePaths": ["<user>/<asset>/frames/<session>/000000.jpg", ...],
  "frameBucket": "project-exports",
  "artistId": "<artist id>",
  "wardrobeFeatureId": "<character_features id — the locked garment>",
  "transferMode": "jacket_only" | "full_look",   // picks the garment ref
  "vtonModel": "idm-vton" | "cat-vton"            // when on the vton-frame path
}
```

Writes swapped frames to `project-exports/<user>/<asset>/swapped/<session>/NNNNNN.jpg`
(index-aligned to the input frames) and patches the master asset:
`swap_status` (`processing`/`ready`/`failed`), `swap_swapped_prefix`,
`swap_frame_count`, `swap_engine`, `swap_error`.

## Secrets (Lovable → AI Video Tool → Edge Function secrets)

| Secret | Value |
|--------|-------|
| `COMPOSE_LOOK_CC_URL` | CC base ending `/compose-look` (shared with wardrobe-vton-proxy) |
| `SWITCHX_PROXY_SECRET` (or `COMPOSE_LOOK_PROXY_SECRET`) | CC proxy secret |
| `FRAME_SWAP_FAL_MODEL` | *optional* — set only to force the fal-run path |
| `FRAME_SWAP_CONCURRENCY` | *optional* — parallel frames (default 6) |

`SUPABASE_*` are already present.

## Deploy

1. Push `main` with `supabase/functions/wardrobe-video-swap-proxy/` and
   `supabase/functions/_shared/frameSwap.ts`.
2. Lovable → Edge Functions → **redeploy** `wardrobe-video-swap-proxy`
   (Publish ≠ redeploy). Also redeploy `wardrobe-video-reassemble-proxy` if not
   already live (Phase 2a), and set `VIDEO_COMPOSE_FAL_MODEL`.
3. No new CC allowlist needed for the default (`vton-frame`) engine.
4. Publish frontend.

## Known limits (Phase 2b)

- **Short clips only.** Each frame is a submit+poll Fal job; the background task
  runs them `FRAME_SWAP_CONCURRENCY` at a time and must finish inside the edge
  background window. Decimate `targetFps` / trim the clip.
- **Fail-fast.** A single frame's swap failure fails the whole job
  (`swap_status=failed` + `swap_error`) — no partial output.
- **Uniform swap size.** IDM-VTON emits a fixed size; the reassembled clip takes
  that size, which may differ from the master's. Expected for the 2b proof.
