# Lane D — Original-master reconstruction

**Issue:** [#89](https://github.com/fendifrost-dot/ai-video-tool/issues/89) (child of [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50); lineage [#55](https://github.com/fendifrost-dot/ai-video-tool/issues/55) / PR #58)  
**Status:** isolated reconstruct + **live-wiring adapters** + **Hero Frame E2E $0 runner** (gate 4) + **Lane D2 video QA** ([#108](https://github.com/fendifrost-dot/ai-video-tool/issues/108)) + **Lane H playable 720×1280 MP4** (issue [#111](https://github.com/fendifrost-dot/ai-video-tool/issues/111)). Dispatch / E2E click requires `explicitArm`. Live click **PASS 9/9** (issue [#100](https://github.com/fendifrost-dot/ai-video-tool/issues/100)). D2 unique-RGB **720×1280 PASS 15/15** ([`docs/reconstruct/VIDEO_QA.md`](reconstruct/VIDEO_QA.md)). Playable artifact is in-lib compose + ffmpeg — not a live SAM-3 fetch / not live `76fe7438` camera bytes.
**Class:** C (compositing / rendering) — isolated module; no chest/sleeve paint or temporal authorize edits.

Live-wiring deploy notes: [`docs/reconstruct/LIVE_WIRING.md`](reconstruct/LIVE_WIRING.md).  
E2E click path: [`docs/reconstruct/E2E_LIVE.md`](reconstruct/E2E_LIVE.md).  
Live SUCCESS: [`docs/reconstruct/E2E_LIVE_SUCCESS_2026-09-15.md`](reconstruct/E2E_LIVE_SUCCESS_2026-09-15.md).  
Playable MP4: [`docs/reconstruct/PLAYABLE_ARTIFACT.md`](reconstruct/PLAYABLE_ARTIFACT.md).

## Product rule

Grok's full rerender cannot become the final master. It softens identity, background, and detail. Reconstruction always starts from the **original master**.

```
original master + generated transformation + segmentation/repair masks
  → reconstructed master
```

Original pixels are preserved wherever transformation is unnecessary (`authorized α === 0` → output RGB === original RGB, byte-identical).

Live wiring (gate 4) builds `generated` from CLEARED chest + sleeve stills stamped onto original frames, then authorizes with caller-supplied SAM-3 α ∪ trusted temporal masks.

## Ownership

**This lane owns**

| Path | Role |
|------|------|
| `src/lib/reconstruct/originalMasterReconstruct.ts` | Pure reconstruct / authorize / metrics |
| `src/lib/reconstruct/types.ts` | Contract types |
| `src/lib/reconstruct/canonicalLineage.ts` | Copied project / master clip / chest / sleeve IDs |
| `src/lib/reconstruct/liveWiring.ts` | Gate 4 arm + deploy notes |
| `src/lib/reconstruct/adapters.ts` | Consume stills + SAM-3 + temporal → `reconstructMasterClip` |
| `src/lib/reconstruct/dispatch.ts` | Wire parse → authorize → reconstruct |
| `src/lib/reconstruct/sam3Consume.ts` | SAM-3 consume + provenance (fixture fallback; no live fetch) |
| `src/lib/reconstruct/exportHandoff.ts` | Lane H MP4 provenance v2 (dims/fps/duration/codec claims; no exporter) |
| `src/lib/reconstruct/e2e.ts` | RECONSTRUCT-1 E2E compose (temporal jobs → reconstruct) |
| `src/lib/reconstruct/heroFrameRun.ts` | Hero Frame §7 product gate |
| `src/lib/reconstruct/videoQa.ts` | Lane D2 clip QA (preservation / seam / continuity / media) |
| `src/lib/eval/reconstructVideoEvaluator.ts` | Lane E video/sampled-frame PASS/FAIL (no still reopen) |
| `src/components/video/HeroFrameReconstructRunControl.tsx` | §7 **Run reconstruct E2E $0** |
| `src/components/video/ArchitectureCStillRepairRunner.tsx` | Thin §7 mount only (no paint edits) |
| `src/lib/reconstruct/fixtures/*` | `$0` synthetic packs (no live bytes, no paid Grok) |
| `src/lib/reconstruct/*.test.ts` | Preservation + gate + dispatch proofs |
| `src/lib/reconstruct/playable/**` | Lane H 720×1280 compose / SAM-3 consume / MP4 / E2 hook |
| `src/components/video/HeroFramePlayableExportControl.tsx` | §7 **Export playable reconstruct $0** |
| `src/lib/reconstruct/index.ts` | Public export |

**Identified shared surfaces — not edited**

| Path | Why left alone |
|------|----------------|
| `src/lib/garment/stillRepairOcclusion.ts` | Architecture C occlusion / `applyOcclusionAlphaComposite` |
| `src/lib/garment/logoComposite.ts` | Architecture C logo / chest paint |
| `src/lib/sleevePanel/**` | Lane B sleeve paint |
| `src/lib/temporal/livePrep.ts` | `TEMPORAL_LIVE_ACTIVATION_ARMED` — do not edit |
| `src/lib/temporal/edgeAdapter.ts` | `authorizeTemporalEdgeRequest` — do not edit |
| `src/lib/garment/architectureCStillRepairGolden.test.ts` | Live chest golden |
| `src/lib/garment/fixtures/*` | Architecture C still fixtures |
| `supabase/functions/_shared/jacketRecomposite.ts` | Jacket-inpaint recomposite (same *shape*, different owner) |
| `supabase/functions/_shared/stillRepairOcclusion.ts` | Edge mirror of Architecture C |
| `supabase/functions/_shared/logoComposite.ts` | Edge logo composite |
| `supabase/functions/architecture-c-still-repair-proxy/` | Live still-repair |
| `supabase/functions/sam3-segment-proxy/` | CC SAM-3 — consume masks only |
| `supabase/functions/temporal-propagate-proxy/` | Lane C |
| `src/lib/pipeline/**` | Lane G orchestration stub |

Hard locks: no `fendi-control-center`, no proxy-auth widening, no PR #37, no V3 / paid Grok.

## API contract (for Lane 7)

```ts
import { reconstructOriginalMaster, reconstructMasterClip, dispatchOriginalMasterReconstruct } from "@/lib/reconstruct";

const result = reconstructOriginalMaster({
  original,      // RgbaImage — master of record
  generated,     // RgbaImage — same size; never used as the output by itself
  segmentation,  // Float32Array — where transform is proposed
  repair,        // Float32Array | omitted — punch-out back to original
});
// result.image
// result.authorizedAlpha
// result.originalPixelsPreservedWhereUnauthorized  // must be true

const clip = reconstructMasterClip({
  originalFrames,  // discrete frames of 76fe7438
  chestStill,      // CLEARED 9ed83c01 raster (or $0 fixture)
  sleeveStill,     // CLEARED fdb86b18 raster (or $0 fixture)
  sam3,            // caller-supplied / fixture; liveFetch === false
  temporalJobs,    // structural Lane C masks; untrusted frames ignored
});
```

Math:

```
authorized = max(0, clamp(segmentation) − clamp(repair))
out = original · (1 − α) + generated · α     // α === 0 copies original bytes
```

This stage does **not** feather, dilate, run SAM-3, or call providers. Callers may pre-feather `segmentation`. Size mismatch throws `reconstruct_size_mismatch` / `reconstruct_alpha_size_mismatch`.

## Acceptance

Fixture tests prove:

1. Zero segmentation → reconstructed === original (generated discarded).
2. Garment segmentation + identity repair → background and identity stay original; authorized garment takes generated.
3. Soft α (0.5) blends only on the seam; α === 0 remains byte-identical.
4. `originalPixelsPreservedWhereUnauthorized === true` on every happy-path fixture.
5. Live-wiring gate refuses without `explicitArm` / uncleared chest or sleeve / temporal not armed.
6. `$0` 4-frame pack on master clip `76fe7438` preserves unauthorized pixels.
7. **No edge function** to redeploy from this lane.
8. Hero Frame §7 **Run reconstruct E2E $0** gated on reconstruct armed + temporal tracking; eval JSON does not reopen still goldens.
9. **Lane D2:** 720×1280 unique-RGB preservation + full-clip (24 @ 24 fps) + live-shaped 80×128 temporal onto 720×1280 originals; Lane H handoff does not encode MP4.
10. SAM-3 consume records source / mask checksum / fallback; live `maskPath` never fetched (`paidCalls=false`).
11. Lane H handoff v2 exposes dims, fps, durationSec (`frameCount/fps`), and null codec claims from the reconstruct frame stream.
12. Reconstruct QA fixtures accept alternate `masterClipAssetId` as a parameter (no clip-specific code).

Video QA: [`docs/reconstruct/VIDEO_QA.md`](reconstruct/VIDEO_QA.md).
