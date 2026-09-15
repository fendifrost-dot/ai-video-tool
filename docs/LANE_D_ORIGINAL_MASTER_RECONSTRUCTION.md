# Lane D — Original-master reconstruction

**Issue:** [#55](https://github.com/fendifrost-dot/ai-video-tool/issues/55) (child of [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50))
**Status:** isolated stage + fixture tests. Not wired into Architecture C still-repair.
**Class:** C (compositing / rendering) — isolated module only; no production activation.

## Product rule

Grok's full rerender cannot become the final master. It softens identity, background, and detail. Reconstruction always starts from the **original master**.

```
original master + generated transformation + segmentation/repair masks
  → reconstructed master
```

Original pixels are preserved wherever transformation is unnecessary (`authorized α === 0` → output RGB === original RGB, byte-identical).

## Ownership

**This lane owns**

| Path | Role |
|------|------|
| `src/lib/reconstruct/originalMasterReconstruct.ts` | Pure reconstruct / authorize / metrics |
| `src/lib/reconstruct/types.ts` | Contract types |
| `src/lib/reconstruct/fixtures/syntheticMaster.ts` | Static fixtures (no live chest/sleeve, no paid Grok) |
| `src/lib/reconstruct/originalMasterReconstruct.test.ts` | Preservation proofs |
| `src/lib/reconstruct/index.ts` | Public export |

**Identified shared surfaces — not edited**

| Path | Why left alone |
|------|----------------|
| `src/lib/garment/stillRepairOcclusion.ts` | Architecture C occlusion / `applyOcclusionAlphaComposite` |
| `src/lib/garment/logoComposite.ts` | Architecture C logo / chest paint |
| `src/lib/garment/architectureCStillRepairGolden.test.ts` | Live chest golden |
| `src/lib/garment/fixtures/*` | Architecture C still fixtures |
| `supabase/functions/_shared/jacketRecomposite.ts` | Jacket-inpaint recomposite (same *shape*, different owner) |
| `supabase/functions/_shared/stillRepairOcclusion.ts` | Edge mirror of Architecture C |
| `supabase/functions/_shared/logoComposite.ts` | Edge logo composite |
| `supabase/functions/architecture-c-still-repair-proxy/` | Live still-repair |

Hard locks: no `fendi-control-center`, no proxy-auth widening, no PR #37, no V3 / paid Grok.

## API contract (for Lane 7)

```ts
import { reconstructOriginalMaster } from "@/lib/reconstruct";

const result = reconstructOriginalMaster({
  original,      // RgbaImage — master of record
  generated,     // RgbaImage — same size; never used as the output by itself
  segmentation,  // Float32Array — where transform is proposed
  repair,        // Float32Array | omitted — punch-out back to original
});
// result.image
// result.authorizedAlpha
// result.originalPixelsPreservedWhereUnauthorized  // must be true
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
