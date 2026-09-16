# Lane E2 fixture hang path (H / C2 / D2)

Stable module: **`src/lib/eval/fixtures/fullClip720.ts`**

Synthetic **720×1280** frame sequence (8 frames @ 24 fps). Not chest/sleeve still goldens. Not live master bytes. E2 **does not decode MP4**.

```ts
import {
  evaluateVideoQa,
  fullClip720FromDecodedFrames,
  fullClip720Input,
  secondClipFullClipInput,
  VIDEO_QA_REAL_MEDIA_HOOK,
} from "@/lib/eval";

// Local $0 proof (no real media):
evaluateVideoQa(fullClip720Input());

// Second existing clip — same probes, different IDs:
evaluateVideoQa(secondClipFullClipInput());

// Real-media hang (Lane H produced MP4; H/C2/D2 decoded rasters):
const report = evaluateVideoQa(
  fullClip720FromDecodedFrames(
    decodedFrames,
    {
      produced: true,
      artifactId,
      path,
      sha256,
      byteLength,
      mimeType: "video/mp4",
    },
    provenance,
  ),
);
```

`VIDEO_QA_REAL_MEDIA_HOOK.decodeMp4 === false`. If frames are empty, `evaluateVideoQa` returns `INCOMPLETE` and does not block MP4 production. Lane H decode (ffmpeg / WebCodecs / injected rasters) is documented in [`docs/reconstruct/PLAYABLE_DECODE.md`](../../reconstruct/PLAYABLE_DECODE.md) and [`docs/reconstruct/PLAYABLE_BROWSER_DECODE.md`](../../reconstruct/PLAYABLE_BROWSER_DECODE.md).
