# Lane H — Decode playable MP4 → Lane E2 frames

**Issues:** sprint [#102](https://github.com/fendifrost-dot/ai-video-tool/issues/102) · umbrella [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50) · related live INCOMPLETE [#128](https://github.com/fendifrost-dot/ai-video-tool/issues/128) / [PR #129](https://github.com/fendifrost-dot/ai-video-tool/pull/129)  
**Class:** C (evaluation / compositing ingest). Thresholds unchanged.  
**Spend:** `$0` · `paidCalls=false` · `grokPerFrame=false` · no paid Grok · no edge cap raise.

Evidence labels: **[V]** verified · **[O]** observed · **[H]** hypothesis · **[D]** decision · **[R]** recommendation

---

## Why live E2 was `frames=0` [V]

After [PR #129](https://github.com/fendifrost-dot/ai-video-tool/pull/129), Hero Frame §7 **Export playable reconstruct $0** attaches `committedPlayableMp4Ref()` (`mp4=produced`, sha256 `71f54599…`) with **`includeDecodedFrames: false`**.

That was intentional: the UI compose is an **8-frame** window; the gate artifact is **72 frames**. Scoring the 8-frame in-memory rasters as if they were decoded MP4 produced the prior false **FAIL 6/9** (`centroidDriftPx`, `mp4=none`). Encode-first with `frames: []` is **INCOMPLETE** (`awaiting decoded_frames`), `fail=0`, `blockingArtifactProducer=false`.

Nothing in that path decoded the committed H.264 file into RGBA tensors. E2 does not decode MP4 in-process (`VIDEO_QA_REAL_MEDIA_HOOK.decodeMp4 === false`).

Live toast (2026-09-16, after #129 Publish):

```
PLAYABLE compose 720×1280 frames=8 … E2 INCOMPLETE 2/9 fail=0 skip=7 frames=0 mp4=produced stillGoldensReopened=false
```

---

## What this lane adds [D]

Lane **H** owns decode. Lane **E2** still only consumes `evaluateVideoQa`.

| Surface | Role |
| ------- | ---- |
| `src/lib/reconstruct/playable/decodeMp4.ts` | **Node/ffmpeg only.** `ffmpeg` → raw RGBA. Hero Frame **must not** import this (no `child_process` in the UI graph). |
| `playableDecodedToVideoQaFrames` / `evaluatePlayableVideoQa({ decodedFrames })` | Pure plug-in. Browser-safe. |
| `runHeroFramePlayableExport({ decodedFrames })` | Optional hook after Export when rasters exist. Default click still encode-first. |

**[D]** Do not pair the 8-frame UI compose onto the 72-frame gate MP4 (`pairCompose` requires matching frame count **and** size).  
**[D]** Default decode scoring does **not** attach unique-RGB compose originals: H.264 `yuv420p` is lossy and would false-FAIL `original_master_preservation`. Visual probes SKIP without α; `mp4_artifact_scored` PASSes when `frames>0`.  
**[D]** `LIVE_PROXY_MAX_FRAMES` stays **24**. Chest 1m / sleeve 1c still goldens stay **LOCKED** (`stillGoldensReopened=false`).  
**[D]** If MP4 is claimed `produced: true` but decode is unavailable / empty, E2 stays **INCOMPLETE** `awaiting decoded_frames`. That contract is preserved.

---

## What runs where [V]

| Environment | Decoder | E2 result |
| ----------- | ------- | --------- |
| **Vitest / node** (`ffmpeg` present) | `decodePlayableMp4({ mp4Path` or `mp4Bytes, maxFrames })` | **PASS/FAIL with `frames>0`** on the committed artifact or a tiny encode fixture |
| **Vitest** (injected RGBA, no ffmpeg) | `decodedFrames` fixture / happy-path pack | **PASS** `frames>0`, `mp4_artifact_scored=PASS` |
| **Hero Frame live click** (browser) | none — no ffmpeg, docs MP4 is not a published static asset, 72×720×1280 RGBA ≈ 265 MB | **INCOMPLETE** `frames=0` `mp4=produced` **until** a later Publish ships a browser decoder **and** MP4 bytes. This PR does **not** bundle WebCodecs decode into the button. |
| **`npm run reconstruct:playable`** | still encode-first persist of `video-qa.json` (historical INCOMPLETE snapshot) | does not rewrite the committed JSON in this change |

### After this PR is merged + Lovable **frontend Publish** (no edge redeploy)

The live button still has no ffmpeg. Expect the **same class of toast**:

```
PLAYABLE compose 720×1280 frames=8 … Lane E2 video QA … INCOMPLETE 2/9 fail=0 skip=7 frames=0 mp4=produced … stillGoldensReopened=false
```

That is **not** a product FAIL. GREEN for this change is: **in-lib / CI** can score decoded playable MP4 bytes with `frames>0`. Live decoded-frame PASS is **not claimed** until a browser decode path exists.

Offline proof (this VM, ffmpeg 6.1):

```bash
npx vitest run src/lib/reconstruct/playable/decodeMp4.test.ts src/lib/reconstruct/playable/videoQaPlug.test.ts src/lib/reconstruct/playable/heroFrameExport.test.ts
```

---

## API

```ts
import { decodePlayableMp4 } from "@/lib/reconstruct/playable/decodeMp4"; // node only
import {
  committedPlayableMp4Ref,
  evaluatePlayableVideoQa,
} from "@/lib/reconstruct/playable";

const decoded = decodePlayableMp4({
  mp4Path: "docs/reconstruct/artifacts/playable-76fe7438/reconstructed.mp4",
  maxFrames: 4, // 72-frame file; bound memory in tests
});
if (!decoded.ok) {
  // evaluatePlayableVideoQa without decodedFrames → INCOMPLETE awaiting decoded_frames
} else {
  evaluatePlayableVideoQa({
    mp4: committedPlayableMp4Ref(),
    decodedFrames: decoded.frames,
    includeDecodedFrames: false,
  });
}
```

Hero Frame hook (callers that already have rasters):

```ts
runHeroFramePlayableExport({ decodedFrames });
```

The published control calls `runHeroFramePlayableExport()` with no rasters.

---

## Not claimed

- Live browser decode of the 72-frame gate MP4
- Live 241-frame / 1080 ingest of master `76fe7438`
- Chest 11/11 / sleeve 6/6 rescore
- Raising `temporal-propagate-proxy` `maxFrames` above 24
- Rewriting committed `video-qa.json` (encode-first INCOMPLETE snapshot stays)
