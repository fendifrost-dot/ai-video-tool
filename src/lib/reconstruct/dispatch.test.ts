import { describe, expect, it } from "vitest";
import { dispatchOriginalMasterReconstruct, RECONSTRUCT_DISPATCH_LIMITS } from "./dispatch";
import {
  CANONICAL_MASTER_CLIP_ID,
  CANONICAL_PROJECT_ID,
  CLEARED_CHEST_ASSET_ID,
  CLEARED_SLEEVE_ASSET_ID,
} from "./canonicalLineage";
import { liveWiringFixturePack, rgbaToArray } from "./fixtures/liveWiringFixture";

function wireBody(explicitArm: boolean, extras: Record<string, unknown> = {}) {
  const pack = liveWiringFixturePack();
  return {
    clipId: "fixture-master",
    projectId: CANONICAL_PROJECT_ID,
    masterClipAssetId: CANONICAL_MASTER_CLIP_ID,
    originalFrames: pack.originalFrames.map((f) => ({
      index: f.index,
      width: f.image.width,
      height: f.image.height,
      rgba: rgbaToArray(f.image),
    })),
    chestStill: {
      assetId: pack.chestStill.assetId,
      width: pack.chestStill.image.width,
      height: pack.chestStill.image.height,
      rgba: rgbaToArray(pack.chestStill.image),
    },
    sleeveStill: {
      assetId: pack.sleeveStill.assetId,
      width: pack.sleeveStill.image.width,
      height: pack.sleeveStill.image.height,
      rgba: rgbaToArray(pack.sleeveStill.image),
    },
    sam3: {
      width: pack.sam3.width,
      height: pack.sam3.height,
      outfitAlpha: Array.from(pack.sam3.outfitAlpha),
      repairAlpha: pack.sam3.repairAlpha ? Array.from(pack.sam3.repairAlpha) : undefined,
      source: "fixture" as const,
    },
    temporalJobs: pack.temporalJobs.map((job) => ({
      kind: job.kind,
      sourceAssetId: job.sourceAssetId,
      frames: job.frames.map((fr) => ({
        index: fr.index,
        width: fr.width,
        height: fr.height,
        mask: Array.from(fr.mask),
        confidence: fr.confidence,
        reanchorRecommended: fr.reanchorRecommended,
      })),
    })),
    explicitArm,
    ...extras,
  };
}

describe("dispatchOriginalMasterReconstruct", () => {
  it("caps fixture-scale rasters", () => {
    expect(RECONSTRUCT_DISPATCH_LIMITS.maxFrames).toBe(8);
    expect(RECONSTRUCT_DISPATCH_LIMITS.maxWidth).toBe(64);
    expect(RECONSTRUCT_DISPATCH_LIMITS.maxHeight).toBe(64);
  });

  it("refuses without explicitArm (403)", () => {
    const result = dispatchOriginalMasterReconstruct(wireBody(false));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
    expect(result.body.code).toBe("explicit_arm_required");
  });

  it("refuses when sleeve is not CLEARED", () => {
    const result = dispatchOriginalMasterReconstruct(
      wireBody(true, { sleeveGate: { status: "PENDING" } }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
    expect(result.body.code).toBe("sleeve_still_not_cleared");
  });

  it("reconstructs the canonical master clip when armed + explicitArm", () => {
    const result = dispatchOriginalMasterReconstruct(wireBody(true));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe(200);
    expect(result.body.paidCalls).toBe(false);
    expect(result.body.sam3LiveFetch).toBe(false);
    expect(result.body.grokPerFrame).toBe(false);
    expect(result.body.edgeFunction).toBeNull();
    expect(result.body.clip.masterClipAssetId).toBe(CANONICAL_MASTER_CLIP_ID);
    expect(result.body.clip.chestAssetId).toBe(CLEARED_CHEST_ASSET_ID);
    expect(result.body.clip.sleeveAssetId).toBe(CLEARED_SLEEVE_ASSET_ID);
    expect(result.body.clip.originalPixelsPreservedWhereUnauthorized).toBe(true);
    expect(result.body.clip.frames).toHaveLength(4);
  });

  it("returns 400 on empty originalFrames", () => {
    const result = dispatchOriginalMasterReconstruct({ explicitArm: true, originalFrames: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("invalid_request");
  });
});
