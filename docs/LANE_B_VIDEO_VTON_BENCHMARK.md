# Lane B — video-native / purpose-built VTON benchmark

Companion to the LOCKED architecture ([`VIDEO_SWAP_ARCHITECTURE.md`](VIDEO_SWAP_ARCHITECTURE.md)).
Lane B is the competing approach we benchmark against **Lane A** (Grok keyframe +
optical-flow propagation) on a short 2–4s clip. Whichever holds Fendi's identity +
exact jacket construction + stripe/logo placement + natural occlusion **without
visible flicker/morphing** wins (kill criterion, arch doc §7).

---

## 1. Fal catalog reality (researched 2026-07-28) — read first

The architecture doc names three Lane B candidates. Here is what each actually is
on Fal today:

| Candidate | fal model id | What it actually is | Temporal? |
|-----------|--------------|---------------------|-----------|
| Kling Kolors try-on | `fal-ai/kling/v1-5/kolors-virtual-try-on` | **Still-image** try-on (diffusion inpaint). `{human_image_url, garment_image_url}` → `{image:{url}}`. Commercial-cleared, holds pose/skin/body. ~20s, ~$0.07/call. | **No** |
| FASHN | `fal-ai/fashn/tryon/v1.5` / `…/v1.6` | **Still-image** try-on. `{model_image, garment_image, category, mode, garment_photo_type, seed}` → `{images:[{url}]}`. Renders text/patterns well. | **No** |
| Kling / Wan v2v w/ pose control | `fal-ai/kling-video/*`, Wan i2v/v2v | General image/video-to-video. **NOT** garment-conditioned try-on; no DensePose/OpenPose *try-on* endpoint on Fal. | v2v yes, but not a try-on |
| (found in search) Lucy 2 VTON realtime | `decart/lucy2-vton/realtime` | **Real-time WebRTC webcam stream** try-on. Not a batch file (submit/poll) job → **incompatible** with the CC fal-run transport AVT uses. | streaming, not batch |

**Conclusion (be honest):** As of 2026-07 there is **no batch,
video-file→video-file, temporally-consistent VTON on Fal** reachable through the
CC `fal-run` submit/poll transport. The temporally-consistent video try-on work
(MagicTryOn, ViViD, RealVVT, ChronoTailor, CatV2TON) is **research, not deployed
Fal endpoints.**

So Lane B's reachable form is a **purpose-built STILL-VTON keyframe mapper**, not a
video-native solution. That is exactly how it must be framed: a cleaner
garment mapper for the **hero keyframes** Lane A propagates from — it does **not**
by itself remove flicker.

---

## 2. Chosen model + why

**`fal-ai/kling/v1-5/kolors-virtual-try-on`** — as a **keyframe mapper**, not a
video engine.

- Purpose-built, commercial-cleared try-on that holds pose, skin tone, body shape
  and renders fabric/color/fit better than the default `vton-frame` (IDM-VTON).
- Simplest schema of the reachable candidates (two URLs), so it drops into the
  existing `fal-run` path with a tiny per-family input shaper.
- FASHN v1.5/v1.6 is a strong second and is **also wired** (select it by id); it
  adds a `category` param and returns `images[]`. Pick whichever renders the SL
  bomber's construction/stripe better on the short clip.

**Not chosen as "video-native" because nothing on Fal qualifies.** If a batch video
try-on ships on Fal later, it gets its own proxy (video-in/video-out, mirroring
`make-scrub-proxy-proxy`) — deliberately **not** scaffolded now (arch doc: minimize
scope; don't build for a model that doesn't exist).

---

## 3. Wiring (what changed)

One reversible, env-gated change in the **existing Phase 2b** path — no new edge
function:

- `_shared/frameSwap.ts` → `shapeFalInput(model, args)` shapes the `fal-run`
  `input` per family: `kolors` (`human_image_url`+`garment_image_url`), `fashn`
  (`model_image`+`garment_image`+mapped `category`), `idm-generic` (unchanged
  legacy shape for `fal-ai/idm-vton` and anything else). `extractSwapImageUrl`
  already reads Kolors `{image:{url}}` and FASHN `{images:[]}`.
- Selected entirely by the existing `FRAME_SWAP_FAL_MODEL` env var on
  `wardrobe-video-swap-proxy`. **Unset (default) = `vton-frame` IDM-VTON,
  unchanged** → fully reversible, no behavior change unless the env is set.
- Reuses the 2a/2b infra as-is: client WebCodecs extract + ordered upload →
  per-frame swap (bounded concurrency, `swap_status`) → reassemble via
  `fal-ai/ffmpeg-api/compose`.

`swap_engine` is recorded on the asset as `fal-run:<model>` for reproducibility.

## 4. One-line CC allowlist

Add the chosen id to Control Center's `switchx-restyle` **fal-run allowlist**
(same as `SCRUB_PROXY_FAL_MODEL` / `VIDEO_COMPOSE_FAL_MODEL` before it):

```
fal-ai/kling/v1-5/kolors-virtual-try-on
```

(Add `fal-ai/fashn/tryon/v1.5` too if benchmarking FASHN.) The default
`vton-frame` path needs no allowlist change.

## 5. Deploy checklist (a live agent does this — not this branch)

1. Merge this branch to `main` (code: `_shared/frameSwap.ts` + tests + docs).
2. **CC:** add `fal-ai/kling/v1-5/kolors-virtual-try-on` to the `switchx-restyle`
   fal-run allowlist; redeploy CC `switchx-restyle`.
3. **AVT Lovable → Edge Function secrets:** set
   `FRAME_SWAP_FAL_MODEL=fal-ai/kling/v1-5/kolors-virtual-try-on` (and confirm
   `COMPOSE_LOOK_CC_URL`, `SWITCHX_PROXY_SECRET`, `VIDEO_COMPOSE_FAL_MODEL`
   present).
4. **AVT Lovable → Edge Functions → redeploy** `wardrobe-video-swap-proxy`
   (Publish ≠ redeploy). Confirm `wardrobe-video-reassemble-proxy` is live.
5. Publish frontend (no client change is required for the benchmark; the engine is
   server-selected).

## 6. Short-clip test plan (kill-criterion run)

Goal: a **2–4 second** clip, decimated, SL bomber locked, output to
`project-exports`, judged against the kill criterion.

- **Inputs**
  - `asset`: a short (or trimmed to 2–4s) source clip already in AVT
    (`project-clips`). Full-length is out of scope for the benchmark.
  - `wardrobeFeatureId`: the **SL bomber** `character_features` row id.
  - `artistId`: that wardrobe item's artist.
- **Decimate** so the whole per-frame job finishes inside the edge background
  window: `targetFps: 8`, `maxFrames: 32` (≈4s @ 8fps). Bump `FRAME_SWAP_CONCURRENCY`
  only if CC/Fal rate limits allow.
- **Run** (client, no code change needed):

  ```ts
  import { runFrameSwapRoundtrip } from "@/lib/queries/wardrobeVideoFrames";

  await runFrameSwapRoundtrip({
    asset,                       // { id, asset_type, file_url }
    wardrobeFeatureId,           // SL bomber
    artistId,
    targetFps: 8,
    maxFrames: 32,
    transferMode: "jacket_only", // bomber = upper-body garment
    includeAudio: true,
  });
  ```

  Engine is chosen by `FRAME_SWAP_FAL_MODEL` on the server (step 3), so the same
  call benchmarks Kolors vs. the IDM-VTON baseline by only flipping the env +
  redeploy.
- **Outputs**
  - swapped frames → `project-exports/<user>/<asset>/swapped/<session>/NNNNNN.jpg`
  - reassembled clip → `project-exports/<user>/<asset>/reassembled/<session>.mp4`
  - `swap_engine = fal-run:fal-ai/kling/v1-5/kolors-virtual-try-on` on the asset.
- **Judge (kill criterion, arch doc §7).** Play the reassembled clip and check:
  identity held? exact bomber construction? stripe/logo placement? natural
  occlusion? **And critically — flicker/boiling?** Because this is a per-frame
  mapper, expect residual garment-region flicker; that is the *diagnostic point* —
  it shows why Lane B still needs Lane A propagation (or the 2c masked-lock) to
  pass. Compare side-by-side against the IDM-VTON baseline and against Lane A on
  the same clip.

## 7. Honest verdict framing

- If Kolors/FASHN keyframes are **cleaner per-frame** than IDM-VTON → keep it as
  **Lane A's keyframe engine** (the win is quality of the anchor, not temporal
  consistency).
- Lane B **cannot win the kill criterion alone**, because no Fal model gives
  temporal consistency on a video file. A truthful benchmark records Lane B as
  "best still keyframe mapper," and temporal consistency is decided by Lane A's
  propagation on top of it.
