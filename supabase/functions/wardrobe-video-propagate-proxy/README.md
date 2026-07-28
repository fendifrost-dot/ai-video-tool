# wardrobe-video-propagate-proxy

**Lane A** of the LOCKED video garment-swap architecture
([`docs/VIDEO_SWAP_ARCHITECTURE.md`](../../../docs/VIDEO_SWAP_ARCHITECTURE.md) §3):
**Grok keyframe generation + temporal propagation.** This is the middle step —
it REPLACES Phase 2b's independent per-frame swap:

```
extract (client WebCodecs)
  → generate approved Grok KEYFRAMES        (existing grok-image-garment-proxy)
  → [THIS: propagate garment across intermediates]
  → reassemble                              (existing wardrobe-video-reassemble-proxy)
```

Only the middle generation step changes vs. 2b. Frame extract, ordered storage,
Fal-via-CC routing, bounded concurrency, status tracking, and reassembly are all
reused (§4, "Phase 2b — what to keep").

## What it does

1. **Places approved keyframes.** Each Grok keyframe image is written at its
   frame index — the garment source of truth. Cadence is decided client-side by
   `planKeyframes` (every 12–24 frames + forced anchors); this fn re-derives the
   per-frame segments (`assignSegments`) from the keyframe index set.
2. **Propagates intermediates** via the **env-selectable propagation engine**
   (`_shared/propagation.ts`). For each in-between frame it warps the bracketing
   keyframe garment onto the ORIGINAL footage frame.
3. **Detects flow breaks** (`_shared/flowBreak.ts`) from optional per-frame
   `flowMetrics`. Frames where flow breaks and no keyframe covers them are left
   **blocked** (`blocked_reanchor`) — never faked. The caller generates a fresh
   Grok keyframe there and re-invokes; completed frames are skipped (resume).

## Propagation engine — env-selectable, reversible

| `WARDROBE_PROP_ENGINE` | `PROPAGATION_FAL_MODEL` | Behaviour |
|------------------------|-------------------------|-----------|
| unset (default)        | unset                   | **`disabled`** — blocks every intermediate with a precise "what to wire" reason. No fake output. |
| unset                  | set                     | defaults to **`fal-flow`** on that model |
| `fal-flow`             | set                     | CC `fal-run` on a Fal optical-flow / warp / EbSynth-equivalent model |
| `fal-v2v`              | set                     | CC `fal-run` on a video-native VTON / v2v model (Lane B engine, same transport) |
| `nearest-keyframe`     | —                       | **DIAGNOSTIC** — copies the nearest approved keyframe (no warp). Exercises the full plumbing; **pops** at keyframe boundaries by design. Never ship it. |

Reversible: unset both envs → `disabled` → no behaviour change vs. before Lane A.

### ⚠️ What the propagation step still needs to actually run

AVT's edge runtime is **Deno serverless** — it cannot run RAFT / EbSynth / FFmpeg
optical flow locally. Like every other heavy compute in AVT (Grok, VTON,
ffmpeg-compose), propagation must call an **external model**. As of this commit
**no optical-flow / warp / EbSynth-equivalent model is wired**, so the default
engine is `disabled` and intermediates block with:

> `propagation_engine_disabled: set WARDROBE_PROP_ENGINE + PROPAGATION_FAL_MODEL
> (a Fal optical-flow/warp/EbSynth-equivalent model, allowlisted on CC fal-run)`

To make Lane A produce real propagated frames, ONE of:

- **A Fal-hosted flow/warp/EbSynth-equivalent model** reachable via CC `fal-run`:
  add it to CC's `fal-run` allowlist (one-line, exactly like `FRAME_SWAP_FAL_MODEL`
  / `VIDEO_COMPOSE_FAL_MODEL`), set `PROPAGATION_FAL_MODEL`, and adjust the
  `input` key names in `buildPropagationBody` to that model's contract.
- **A video-native VTON / v2v model** (Lane B: `fal-ai/kling/v1-5/kolors-virtual-
  try-on`, `fal-ai/fashn/v1.5`, Wan2.1/Kling v2v) as the engine (`fal-v2v`) — the
  benchmark competitor (§5). Same transport, different `input` shape.
- **A dedicated server-side warp step** (RAFT/EbSynth in a container/GPU worker)
  fronted by an HTTP endpoint the fal-run path or a new proxy can call.

Use `nearest-keyframe` only to prove the extract → keyframe → status →
reassemble plumbing end-to-end while a real engine is being chosen.

## Engineering prereqs honored (§6)

- **No fail-fast.** Per-frame status persisted in `metadata_json.propagate_frames`
  (`done` / `blocked_no_engine` / `blocked_reanchor` / `failed`), per-frame
  retries (`PROPAGATE_MAX_RETRIES`, default 2), **resume + skip-completed** on
  re-invoke with the same `sessionId`.
- **Reproducibility metadata** in `metadata_json.propagate_repro`: engine mode,
  fal model, wardrobe feature, garment description, category, cadence, keyframe
  count, frame total, transfer mode.
- **Filename/format normalized.** True encoding is sniffed and the real ext is
  recorded per frame (`propagate_frames[i].ext`); reassembly reads it back rather
  than assuming `.jpg`.
- **Durable queue:** still `EdgeRuntime.waitUntil` for now — a durable chunk
  queue is the remaining §6 prereq before any FULL-LENGTH run. Short-clip Lane A
  proof runs under `waitUntil`.

## Request body

```jsonc
{
  "assetId": "<project_assets id of the master>",
  "sessionId": "<uuid, shared with the frame upload>",
  "framePaths": ["<user>/<asset>/frames/<session>/000000.jpg", ...],
  "frameBucket": "project-exports",
  "keyframes": [
    { "index": 0,  "path": "<user>/<artist>/<lookId>.png", "bucket": "look-composites" },
    { "index": 18, "path": "...", "bucket": "look-composites" },
    { "index": 41, "path": "...", "bucket": "look-composites" }
  ],
  "artistId": "<artist id>",
  "wardrobeFeatureId": "<character_features id>",
  "flowMetrics": [ { "index": 22, "confidence": 0.3, "rotationDeg": 40 } ],
  "cadenceFrames": 18
}
```

`keyframes` **must** cover frame 0 and the final frame (both ends anchored), else
`400 keyframes_must_cover_ends`.

## Client

`src/lib/queries/wardrobeVideoFrames.ts` → `runLaneARoundtrip()`:
extract+upload → generate approved Grok keyframes (`applyGrokGarmentTruthAndWait`,
per planned index) → `POST wardrobe-video-propagate-proxy` → poll
`metadata_json.propagate_status` (`ready` | `incomplete`) → reassemble on the
propagated frames when complete.

## Composite / brand layer / face-restore (§3 steps 4–6)

Propagation composites onto the ORIGINAL frame (passed as `frame_url`, the flow
target). The deterministic **brand/logo composite** (`_shared/logoComposite.ts`)
and **face-restore** safety net are the SAME deterministic passes already applied
to stills — run them per propagated frame as a follow-up post-pass. They are
recorded, reversible, and out of scope for the propagation-engine wiring itself.
