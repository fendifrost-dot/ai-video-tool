# Lane H — Browser decode of playable MP4 → Lane E2 frames

**Issues:** sprint [#102](https://github.com/fendifrost-dot/ai-video-tool/issues/102) · umbrella [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50) · related live INCOMPLETE [#128](https://github.com/fendifrost-dot/ai-video-tool/issues/128) / [PR #129](https://github.com/fendifrost-dot/ai-video-tool/pull/129) · sibling node/ffmpeg decode [PR #132](https://github.com/fendifrost-dot/ai-video-tool/pull/132) · this PR [#133](https://github.com/fendifrost-dot/ai-video-tool/pull/133)  
**Class:** C (evaluation / compositing ingest). Thresholds unchanged.  
**Spend:** `$0` · `paidCalls=false` · `grokPerFrame=false` · no paid Grok · no edge cap raise.

Evidence labels: **[V]** verified · **[O]** observed · **[H]** hypothesis · **[D]** decision · **[R]** recommendation

---

## Why live E2 was `frames=0` [V]

After [PR #129](https://github.com/fendifrost-dot/ai-video-tool/pull/129), Hero Frame §7 **Export playable reconstruct $0** attaches `committedPlayableMp4Ref()` (`mp4=produced`, sha256 `71f54599…`) with **`includeDecodedFrames: false`**.

That was intentional: the UI compose is an **8-frame** window; the gate artifact is **72 frames**. Scoring the 8-frame in-memory rasters as if they were decoded MP4 produced the prior false **FAIL 6/9** (`centroidDriftPx`, `mp4=none`). Encode-first with `frames: []` is **INCOMPLETE** (`awaiting decoded_frames`), `fail=0`, `blockingArtifactProducer=false`.

Nothing in that path decoded the committed H.264 file into RGBA. E2 does not decode MP4 in-process (`VIDEO_QA_REAL_MEDIA_HOOK.decodeMp4 === false`). PR #132 (if landed) adds **node/ffmpeg** decode for CI; this change adds the **browser** decoder so live Export can pass `decodedFrames`.

Live toast (2026-09-16, after #129 Publish, **before** this decoder):

```
PLAYABLE compose 720×1280 frames=8 … E2 INCOMPLETE 2/9 fail=0 skip=7 frames=0 mp4=produced stillGoldensReopened=false
```

---

## What this lane adds [D]

Lane **H** owns decode. Lane **E2** still only consumes `evaluateVideoQa`.

| Surface | Role |
| ------- | ---- |
| `src/lib/reconstruct/playable/decodeMp4Browser.ts` | **Browser-safe.** `mp4Demux` + WebCodecs `VideoDecoder` → RGBA (`copyTo` or canvas `getImageData`). Hero Frame **may** import this. No `child_process`. |
| `playableDecodedToVideoQaFrames` / `evaluatePlayableVideoQa({ decodedFrames })` | Pure plug-in. Browser-safe. |
| `runHeroFramePlayableExport({ decodedFrames })` | Optional hook. |
| `runHeroFramePlayableExportLive()` | After compose, fetch committed MP4 + bounded WebCodecs sample. Failure → encode-first INCOMPLETE. |
| `public/reconstruct/playable-76fe7438.mp4` | Same-origin Publish mirror of the gate file (sha256 `71f54599…`). `docs/` is not a published static tree. |

**[D]** Do not pair the 8-frame UI compose onto the 72-frame gate MP4 (`pairCompose` requires matching frame count **and** size). Live Export sets `pairCompose: false`.  
**[D]** Default decode scoring does **not** attach unique-RGB compose originals: H.264 `yuv420p` is lossy and would false-FAIL `original_master_preservation`. Visual probes SKIP without α; `mp4_artifact_scored` PASSes when `frames>0`.  
**[D]** Live decode is a **sample**: `LIVE_PLAYABLE_DECODE_MAX_FRAMES = 8` of the **72-frame gate MP4** (~29 MB RGBA). Same count as the UI compose window **by memory budget**, not the same rasters. Full 72-frame decode (~265 MB RGBA) is the node/ffmpeg CI path (PR #132 / `decodePlayableMp4`).  
**[D]** `LIVE_PROXY_MAX_FRAMES` stays **24**. Chest 1m / sleeve 1c still goldens stay **LOCKED** (`stillGoldensReopened=false`).  
**[D]** If WebCodecs is missing, the codec is unsupported, fetch 404s, or sha256 mismatches, E2 stays **INCOMPLETE** `awaiting decoded_frames`. That contract is preserved.

---

## What runs where [V]

| Environment | Decoder | E2 result |
| ----------- | ------- | --------- |
| **Vitest / jsdom** (no VideoDecoder) | none | **INCOMPLETE** `frames=0` `webcodecs_unavailable` |
| **Vitest** (mocked WebCodecs) | `decodePlayableMp4Browser` | **PASS/FAIL with `frames>0`** on a bounded sample of the committed artifact |
| **Vitest** (injected RGBA, no decoder) | `decodedFrames` fixture | **PASS** `frames>0`, `mp4_artifact_scored=PASS` |
| **Hero Frame live click** (Chromium/Safari + Publish) | WebCodecs sample of `/reconstruct/playable-76fe7438.mp4` | **`frames>0`** when fetch + decode succeed; else **INCOMPLETE** |
| **Node/ffmpeg CI** | `decodePlayableMp4` in PR #132 (not this module) | Full or bounded 72-frame gate decode |

### After this PR is merged + Lovable **frontend Publish** (no edge redeploy)

The live button calls `runHeroFramePlayableExportLive()`:

1. 8-frame UI compose (unchanged, not scored as MP4 rasters).
2. Fetch same-origin `/reconstruct/playable-76fe7438.mp4` (sha256 must match `71f54599…`).
3. WebCodecs-decode at most **8** frames of that **72-frame** file.
4. `evaluatePlayableVideoQa({ decodedFrames, pairCompose: false })`.

**Claimed after Publish, when WebCodecs + asset fetch work [R]:**

```
PLAYABLE compose 720×1280 frames=8 … Lane E2 video QA … frames=8 mp4=produced … stillGoldensReopened=false
browserDecode=webcodecs 720×1280 liveSample maxFrames=8 of source=72 …
```

`mp4_artifact_scored` can PASS. Visual probes SKIP (no α on lossy H.264). That is **not** a full-clip 72-frame score and **not** a still-golden reopen.

**If WebCodecs is unsupported, the asset 404s, or sha mismatches [D]:** the same class of toast as #129:

```
PLAYABLE compose 720×1280 frames=8 … INCOMPLETE 2/9 fail=0 skip=7 frames=0 mp4=produced … stillGoldensReopened=false
browserDecode=webcodecs_unavailable|fetch_failed|sha256_mismatch (INCOMPLETE awaiting decoded_frames preserved).
```

That is **not** a product FAIL.

Hard browser limits (INCOMPLETE preserved, not FAIL):

| Limit | Behavior |
| ----- | -------- |
| No `VideoDecoder` / `EncodedVideoChunk` | `webcodecs_unavailable` |
| `isConfigSupported` false for `avc1.64001f` | `codec_unsupported` |
| Gate MP4 not fetchable after Publish | `fetch_failed` |
| Fetched bytes ≠ sha256 `71f54599…` | `sha256_mismatch` |
| 72×720×1280 RGBA ≈ 265 MB | live caps at 8 frames; full 72f is CI |

---

## API

```ts
import {
  decodePlayableMp4Browser,
  decodeCommittedPlayableMp4ForLive,
  runHeroFramePlayableExportLive,
  committedPlayableMp4Ref,
  evaluatePlayableVideoQa,
} from "@/lib/reconstruct/playable";

// Injected ArrayBuffer (tests / callers that already fetched):
const decoded = await decodePlayableMp4Browser({
  mp4Bytes,
  maxFrames: 8, // live sample of the 72-frame gate — not the UI compose
});
if (!decoded.ok) {
  // evaluatePlayableVideoQa without decodedFrames → INCOMPLETE awaiting decoded_frames
} else {
  evaluatePlayableVideoQa({
    mp4: committedPlayableMp4Ref(),
    decodedFrames: decoded.frames,
    includeDecodedFrames: false,
    pairCompose: false,
  });
}

// Live Hero Frame (fetch + decode + compose):
await runHeroFramePlayableExportLive();
```

The published control calls `runHeroFramePlayableExportLive()` (no compose rasters passed as `decodedFrames`).

---

## Not claimed

- Full 72-frame browser decode of the gate MP4 (memory cap)
- Live 241-frame / 1080 ingest of master `76fe7438`
- Pairing the 8-frame UI compose onto the 72-frame gate
- Chest 11/11 / sleeve 6/6 rescore
- Raising `temporal-propagate-proxy` `maxFrames` above 24
- Rewriting committed `video-qa.json` (encode-first INCOMPLETE snapshot stays)
- CORS of GitHub raw from `aivideotool.lovable.app` (fallback only; same-origin `public/` is the Publish path)
