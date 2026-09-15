/**
 * Deterministic visible-upper-arm sleeve-panel repair.
 *
 * Warps flat-ref navy panel pixels onto manual visible quads.
 * Cream/white source crops are resolved navy-ward (Stage 1c: prefer product
 * navy over cream stripe) instead of being pasted as panel truth.
 * Detection is not guessed — callers must supply target quads.
 * Hidden shoulder→cuff pixels are never painted and never validated.
 */

import {
  assertSleevePanelContract,
  parseChestOutputSlot,
  sleevePanelClaimsNeverValidateHidden,
  type SleevePanelSideResult,
  type SleevePanelStageInput,
  type SleevePanelStageOutput,
} from "./contract";
import {
  assertSameSize,
  cloneRgba,
  countMask,
  createMask,
  intersectMasks,
  invBilinear,
  quadNormToPts,
  rasterizeQuadMask,
  sampleNearest,
  subtractMasks,
} from "./raster";
import { assessVisibleSleeveQuad } from "./visibleGeometry";
import { resolveNavyPanelSource } from "./navyFill";
import type { BinaryMask } from "./types";

export function repairVisibleSleevePanels(input: SleevePanelStageInput): SleevePanelStageOutput {
  assertSleevePanelContract(input);
  assertSameSize(input.still, input.visibleMask, "visible_mask");
  assertSameSize(input.still, input.hiddenMask, "hidden_mask");

  const chestSlot = input.chestOutput ? parseChestOutputSlot(input.chestOutput) : null;
  const chestReserved: BinaryMask | null = chestSlot?.reservedMask ?? null;
  if (chestReserved) assertSameSize(input.still, chestReserved, "chest_reserved_mask");

  const out = cloneRgba(input.still);
  const paintedMask = createMask(out.width, out.height);
  const sides: SleevePanelSideResult[] = [];

  for (const panel of input.panels) {
    const assessment = assessVisibleSleeveQuad({
      side: panel.side,
      targetQuadNorm: panel.targetQuadNorm,
      width: out.width,
      height: out.height,
      visibleMask: input.visibleMask,
      hiddenMask: input.hiddenMask,
      chestReservedMask: chestReserved,
    });
    if (!assessment.ok) {
      throw new Error(`sleeve_panel_geometry_rejected:${panel.side}:${assessment.reason}`);
    }

    const quadPts = quadNormToPts(panel.targetQuadNorm, out.width, out.height);
    const quadMask = rasterizeQuadMask(out.width, out.height, quadPts);
    const hiddenHits = intersectMasks(quadMask, input.hiddenMask);
    const reservedHits = chestReserved
      ? intersectMasks(quadMask, chestReserved)
      : createMask(out.width, out.height);
    let paintMask = intersectMasks(quadMask, input.visibleMask);
    paintMask = subtractMasks(paintMask, input.hiddenMask);
    if (chestReserved) paintMask = subtractMasks(paintMask, chestReserved);

    const resolved = resolveNavyPanelSource(input.flatRef, panel.sourceBboxNorm, panel.side);
    const source = resolved.source;
    const [tl, tr, br, bl] = quadPts;
    let painted = 0;
    for (let y = 0; y < out.height; y++) {
      for (let x = 0; x < out.width; x++) {
        const mi = y * out.width + x;
        if (!paintMask.data[mi]) continue;
        const uv = invBilinear(x + 0.5, y + 0.5, tl, tr, br, bl);
        if (!uv) continue;
        const [r, g, b, a] = sampleNearest(source, uv.u, uv.v);
        if (a < 8) continue;
        const di = mi * 4;
        out.data[di] = r;
        out.data[di + 1] = g;
        out.data[di + 2] = b;
        out.data[di + 3] = 255;
        paintedMask.data[mi] = 1;
        painted++;
      }
    }

    sides.push({
      side: panel.side,
      paintedPixelCount: painted,
      rejectedHiddenPixelCount: countMask(hiddenHits),
      rejectedChestReservedPixelCount: countMask(reservedHits),
      targetQuadNorm: panel.targetQuadNorm,
      navyFillMode: resolved.fillMode,
      sourceNavyFraction: resolved.navyFraction,
      requestedSourceBboxNorm: panel.sourceBboxNorm,
      resolvedSourceBboxNorm: resolved.bbox,
    });
  }

  return {
    contractVersion: input.contractVersion,
    still: out,
    paintedMask,
    sides,
    visibility: input.visibility,
    claims: {
      visibleGeometryRepaired: sides.every((s) => s.paintedPixelCount > 0),
      ...sleevePanelClaimsNeverValidateHidden(),
    },
    consumedChestOutput: chestSlot != null,
  };
}
