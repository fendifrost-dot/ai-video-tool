# Lane H — Browser decode of playable MP4 → Lane E2 frames

**Issues:** sprint [#102](https://github.com/fendifrost-dot/ai-video-tool/issues/102) · umbrella [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50) · related live INCOMPLETE [#128](https://github.com/fendifrost-dot/ai-video-tool/issues/128) / [PR #129](https://github.com/fendifrost-dot/ai-video-tool/pull/129) · sibling node/ffmpeg decode [PR #132](https://github.com/fendifrost-dot/ai-video-tool/pull/132) · browser sample [PR #133](https://github.com/fendifrost-dot/ai-video-tool/pull/133) · this change: live WebCodecs default **72** with abort/OOM/timeout fallback  
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
| `runHeroFramePlayableExportLive()` | After compose, fetch committed MP4 + WebCodecs decode (default all 72). Abort/OOM/timeout → partial sample or INCOMPLETE. |
| `public/reconstruct/playable-76fe7438.mp4` | Same-origin Publish mirror of the gate file (sha256 `71f54599…`). `docs/` is not a published static tree. |

**[D]** Do not pair the 8-frame UI compose onto the 72-frame gate MP4 (`pairCompose` requires matching frame count **and** size). Live Export sets `pairCompose: false`.  
**[D]** Default decode scoring does **not** attach unique-RGB compose originals: H.264 `yuv420p` is lossy and would false-FAIL `original_master_preservation`. Visual probes SKIP without α; `mp4_artifact_scored` PASSes when `frames>0`.  
**[D]** Live decode default is the **full gate**: `LIVE_PLAYABLE_DECODE_MAX_FRAMES = 72` (`CANONICAL_CLIP_FRAME_COUNT`). Configurable via `maxFrames`. The 8-frame UI compose (`HERO_FRAME_PLAYABLE_EXPORT_FRAME_COUNT`) is a different buffer.  
**[D]** Memory/time: 72 × 720 × 1280 × 4 = **265_420_800 bytes ≈ 253 MiB** RGBA in-tab. Timeout is `10s + 500ms × N` capped at **60 s** (72 frames → 46 s). If decode aborts / OOM / times out, keep any rasters already copied, else step `LIVE_PLAYABLE_DECODE_FALLBACK_STEPS` **24 then 8**. Never false E2 FAIL. Node/ffmpeg CI still scores the full file.  
**[D]** `LIVE_PROXY_MAX_FRAMES` stays **24**. Chest 1m / sleeve 1c still goldens stay **LOCKED** (`stillGoldensReopened=false`).  
**[D]** If WebCodecs is missing, the codec is unsupported, fetch 404s, or sha256 mismatches, E2 stays **INCOMPLETE** `awaiting decoded_frames`. That contract is preserved.

---

## What runs where [V]

| Environment | Decoder | E2 result |
| ----------- | ------- | --------- |
| **Vitest / jsdom** (no VideoDecoder) | none | **INCOMPLETE** `frames=0` `webcodecs_unavailable` |
| **Vitest** (mocked WebCodecs) | `decodePlayableMp4Browser` | **PASS/FAIL with `frames>0`** on a bounded sample of the committed artifact |
| **Vitest** (injected RGBA, no decoder) | `decodedFrames` fixture | **PASS** `frames>0`, `mp4_artifact_scored=PASS` |
| **Hero Frame live click** (Chromium/Safari + Publish) | WebCodecs of `/reconstruct/playable-76fe7438.mp4` | **`frames=72`** when fetch + full decode succeed; else **partial sample** or **INCOMPLETE** |
| **Node/ffmpeg CI** | `decodePlayableMp4` in PR #132 (not this module) | Full or bounded 72-frame gate decode |

### After this PR is merged + Lovable **frontend Publish** (no edge redeploy)

The live button calls `runHeroFramePlayableExportLive()`:

1. 8-frame UI compose (unchanged, not scored as MP4 rasters).
2. Fetch same-origin `/reconstruct/playable-76fe7438.mp4` (sha256 must match `71f54599…`).
3. WebCodecs-decode **all 72** frames of that file (default). Abort / OOM / timeout keep a partial sample or step 24 → 8.
4. `evaluatePlayableVideoQa({ decodedFrames, pairCompose: false })`.

**Claimed after Publish of this PR, when WebCodecs + asset fetch + memory hold [D]:**

```
PLAYABLE compose 720×1280 frames=8 … Lane E2 video QA … PASS 3/9 fail=0 skip=6 frames=72 mp4=produced … stillGoldensReopened=false
browserDecode=webcodecs 720×1280 fullDecode frames=72 source=72.
```

Compose `frames=8` is the UI window. E2 `frames=72` is the gate decode. `PASS 3/9` `fail=0` `skip=6` is unchanged (visual probes still SKIP without α).

**Documented fallback if 72-frame decode aborts / OOM / times out but some rasters land [D]:**

```
… PASS 3/9 fail=0 skip=6 frames=N mp4=produced …
browserDecode=webcodecs 720×1280 liveSample maxFrames=N of source=72 (fallback=timeout|oom|abort|progressive_ladder) (not the 8-frame UI compose).
```

**If WebCodecs is unsupported, the asset 404s, sha mismatches, or decode yields 0 frames [D]:** the same class of toast as #129:

```
PLAYABLE compose 720×1280 frames=8 … INCOMPLETE 2/9 fail=0 skip=7 frames=0 mp4=produced … stillGoldensReopened=false
browserDecode=webcodecs_unavailable|fetch_failed|sha256_mismatch|decode_failed (INCOMPLETE awaiting decoded_frames preserved).
```

That is **not** a product FAIL.

**[V]** Prior live click 2026-09-16 ~2:05 AM CT after #133 Publish: E2 **PASS 3/9** `frames=8` `liveSample maxFrames=8 of source=72`. See [`PLAYABLE_EXPORT_LIVE_PASS_2026-09-16.md`](PLAYABLE_EXPORT_LIVE_PASS_2026-09-16.md). This change raises the default cap; that sample toast is historical.

Hard browser limits (INCOMPLETE or partial sample, never false FAIL):

| Limit | Behavior |
| ----- | -------- |
| No `VideoDecoder` / `EncodedVideoChunk` | `webcodecs_unavailable` → INCOMPLETE |
| `isConfigSupported` false for `avc1.64001f` | `codec_unsupported` |
| Gate MP4 not fetchable after Publish | `fetch_failed` |
| Fetched bytes ≠ sha256 `71f54599…` | `sha256_mismatch` |
| Abort / OOM / timeout with rasters copied | **partial sample** (`fallback=…`); E2 scores `frames>0` |
| Abort / OOM / timeout with 0 rasters | retry 24 then 8; if still 0 → INCOMPLETE |
| 72×720×1280 RGBA ≈ 253 MiB | default budget; fallback exists so a weak tab does not false-FAIL |

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
  maxFrames: 72, // default live cap of the 72-frame gate — not the UI compose
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

## Memory / time tradeoffs [D]

| Sample | RGBA bytes | Timeout budget | When |
| ------ | ---------- | -------------- | ---- |
| 72 (default) | 265_420_800 ≈ 253 MiB | 46 s (cap 60 s) | tab can hold ~250 MiB + WebCodecs |
| 24 (fallback step) | 88_473_600 ≈ 84 MiB | 22 s | first attempt yielded 0 frames |
| 8 (fallback step) | 29_491_200 ≈ 28 MiB | 14 s | 24 also yielded 0; same count as UI window **by accident**, not the compose buffer |
| Partial N < requested | `N × 3_686_400` | whatever landed before abort/OOM/timeout | prefer over stepping down |

Do **not** score the 8-frame compose as the gate. `pairCompose` stays **false**.

---

## Live re-verify after #133 Publish [V]

**When:** 2026-09-16 ~2:05 AM America/Chicago (~07:05 UTC). `main` @ `7dc04ad` + Lovable frontend **Publish**. Signed-in owner, hard refresh, one click.

Verbatim toast:

```
PLAYABLE compose 720×1280 frames=8 fps=24 preserved=true sam3=intended_stage1h_evidence paidCalls=false. Lane E2 video QA lane-e2-video-qa-v1: PASS 3/9 fail=0 skip=6 frames=8 mp4=produced paidCalls=false stillGoldensReopened=false. browserDecode=webcodecs 720×1280 liveSample maxFrames=8 of source=72 (not the 8-frame UI compose; full 72f is node/ffmpeg CI).
```

That was the **#133** claimed-after-Publish contract: `frames=8` is a sample of the 72-frame gate; `mp4_artifact_scored` PASS; visual probes SKIP; still goldens not reopened. Gate sha256 `71f54599…` unchanged. This file's current claimed toast (after this PR + Publish) is `fullDecode frames=72 source=72` or a documented fallback.

Write-up: [`PLAYABLE_EXPORT_LIVE_PASS_2026-09-16.md`](PLAYABLE_EXPORT_LIVE_PASS_2026-09-16.md) · JSON: [`live-smoke/playable-export-pass.json`](live-smoke/playable-export-pass.json).

---

## Not claimed

- Live click of this 72-frame default (needs Lovable **frontend Publish** of this PR; do not Publish from the implementing agent)
- Live 241-frame / 1080 ingest of master `76fe7438`
- Pairing the 8-frame UI compose onto the 72-frame gate
- Chest 11/11 / sleeve 6/6 rescore
- Raising `temporal-propagate-proxy` `maxFrames` above 24
- Rewriting committed `video-qa.json` (encode-first INCOMPLETE snapshot stays)
- CORS of GitHub raw from `aivideotool.lovable.app` (fallback only; same-origin `public/` is the Publish path)
