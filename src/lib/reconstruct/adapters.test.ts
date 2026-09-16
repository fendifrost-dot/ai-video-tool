import { describe, expect, it } from "vitest";
import {
  SAM3_LIVE_FETCH,
  buildGeneratedFromClearedStills,
  fillConvexQuad,
  mergeAuthorization,
  reconstructMasterClip,
  scaleAlphaNearest,
} from "./adapters";
import {
  CANONICAL_MASTER_CLIP_ID,
  CANONICAL_PROJECT_ID,
  CLEARED_CHEST_ASSET_ID,
  CLEARED_CHEST_QUAD_TUPLE,
  CLEARED_SLEEVE_ASSET_ID,
} from "./canonicalLineage";
import {
  CHEST_STILL_RGB,
  fixtureIdentityRect,
  fixtureSam3Mask,
  liveWiringFixturePack,
} from "./fixtures/liveWiringFixture";
import { FIXTURE_HEIGHT, FIXTURE_WIDTH } from "./fixtures/syntheticMaster";
import { countRgbMismatches, unauthorizedPixelsMatchOriginal } from "./originalMasterReconstruct";
import type { RgbaImage } from "./types";

function rgbAt(img: RgbaImage, x: number, y: number): [number, number, number] {
  const p = (y * img.width + x) * 4;
  return [img.data[p]!, img.data[p + 1]!, img.data[p + 2]!];
}

function findMaskPixel(mask: Float32Array, width: number, height: number): [number, number] | null {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((mask[y * width + x] ?? 0) > 0.5) return [x, y];
    }
  }
  return null;
}

describe("fillConvexQuad", () => {
  it("fills the documented chest band and leaves corners empty", () => {
    const mask = fillConvexQuad(FIXTURE_WIDTH, FIXTURE_HEIGHT, CLEARED_CHEST_QUAD_TUPLE);
    expect(mask[0]).toBe(0);
    expect(findMaskPixel(mask, FIXTURE_WIDTH, FIXTURE_HEIGHT)).not.toBeNull();
  });
});

describe("buildGeneratedFromClearedStills", () => {
  it("stamps chest/sleeve stills and keeps original outside those quads", () => {
    const pack = liveWiringFixturePack();
    const original = pack.originalFrames[0]!.image;
    const generated = buildGeneratedFromClearedStills({
      original,
      chestStill: pack.chestStill.image,
      sleeveStill: pack.sleeveStill.image,
    });
    expectRgbNearCorner(generated, original);
    const chestPx = findMaskPixel(
      fillConvexQuad(FIXTURE_WIDTH, FIXTURE_HEIGHT, CLEARED_CHEST_QUAD_TUPLE),
      FIXTURE_WIDTH,
      FIXTURE_HEIGHT,
    );
    expect(chestPx).not.toBeNull();
    expect(rgbAt(generated, chestPx![0], chestPx![1])).toEqual([...CHEST_STILL_RGB]);
  });
});

function expectRgbNearCorner(a: RgbaImage, b: RgbaImage) {
  expect(rgbAt(a, 0, 0)).toEqual(rgbAt(b, 0, 0));
  expect(rgbAt(a, FIXTURE_WIDTH - 1, FIXTURE_HEIGHT - 1)).toEqual(
    rgbAt(b, FIXTURE_WIDTH - 1, FIXTURE_HEIGHT - 1),
  );
}

describe("mergeAuthorization", () => {
  it("ignores low-confidence / reanchor temporal masks", () => {
    const pack = liveWiringFixturePack();
    const trusted = mergeAuthorization({
      width: pack.width,
      height: pack.height,
      sam3: { ...pack.sam3, outfitAlpha: new Float32Array(pack.width * pack.height) },
      temporalJobs: pack.temporalJobs,
      frameIndex: 0,
    });
    expect(trusted.temporalUsed).toBe(true);

    const untrusted = mergeAuthorization({
      width: pack.width,
      height: pack.height,
      sam3: { ...pack.sam3, outfitAlpha: new Float32Array(pack.width * pack.height) },
      temporalJobs: pack.temporalJobs,
      frameIndex: 3,
    });
    // frame 3 chest job is low-confidence; sleeve jobs stay trusted
    expect(untrusted.temporalUsed).toBe(true);
    const chestOnly = mergeAuthorization({
      width: pack.width,
      height: pack.height,
      sam3: { ...pack.sam3, outfitAlpha: new Float32Array(pack.width * pack.height) },
      temporalJobs: pack.temporalJobs.filter((j) => j.kind === "chest"),
      frameIndex: 3,
    });
    expect(chestOnly.temporalUsed).toBe(false);
    expect(chestOnly.segmentation.every((v) => v === 0)).toBe(true);
  });
});

describe("reconstructMasterClip — $0 original-master live wiring", () => {
  it("never live-fetches SAM-3", () => {
    expect(SAM3_LIVE_FETCH).toBe(false);
    expect(fixtureSam3Mask().liveFetch).toBe(false);
  });

  it("zero SAM-3 + no temporal returns the original master on every frame", () => {
    const pack = liveWiringFixturePack();
    const empty = new Float32Array(pack.width * pack.height);
    const out = reconstructMasterClip({
      originalFrames: pack.originalFrames,
      chestStill: pack.chestStill,
      sleeveStill: pack.sleeveStill,
      sam3: { ...pack.sam3, outfitAlpha: empty, repairAlpha: empty },
      temporalJobs: [],
    });
    expect(out.originalPixelsPreservedWhereUnauthorized).toBe(true);
    expect(out.masterClipAssetId).toBe(CANONICAL_MASTER_CLIP_ID);
    expect(out.projectId).toBe(CANONICAL_PROJECT_ID);
    expect(out.chestAssetId).toBe(CLEARED_CHEST_ASSET_ID);
    expect(out.sleeveAssetId).toBe(CLEARED_SLEEVE_ASSET_ID);
    expect(out.paidCalls).toBe(false);
    expect(out.sam3LiveFetch).toBe(false);
    expect(out.grokPerFrame).toBe(false);
    for (let i = 0; i < pack.originalFrames.length; i++) {
      expect(countRgbMismatches(out.frames[i]!.result.image, pack.originalFrames[i]!.image)).toBe(
        0,
      );
    }
  });

  it("preserves original pixels outside SAM-3/temporal authorization and inside identity repair", () => {
    const pack = liveWiringFixturePack();
    const out = reconstructMasterClip({
      originalFrames: pack.originalFrames,
      chestStill: pack.chestStill,
      sleeveStill: pack.sleeveStill,
      sam3: pack.sam3,
      temporalJobs: pack.temporalJobs,
    });
    expect(out.originalPixelsPreservedWhereUnauthorized).toBe(true);
    expect(out.frames).toHaveLength(4);

    for (const frame of out.frames) {
      const original = pack.originalFrames.find((f) => f.index === frame.index)!.image;
      expect(
        unauthorizedPixelsMatchOriginal(original, frame.result.image, frame.result.authorizedAlpha),
      ).toBe(true);
      expectRgbNearCorner(frame.result.image, original);
      const identity = fixtureIdentityRect(pack.width, pack.height);
      expect(rgbAt(frame.result.image, identity.x0, identity.y0)).toEqual(
        rgbAt(original, identity.x0, identity.y0),
      );
    }
  });

  it("admits stamped chest still RGB only where authorization is on", () => {
    const pack = liveWiringFixturePack();
    const out = reconstructMasterClip({
      originalFrames: [pack.originalFrames[0]!],
      chestStill: pack.chestStill,
      sleeveStill: pack.sleeveStill,
      sam3: pack.sam3,
      temporalJobs: pack.temporalJobs,
    });
    const reconstructed = out.frames[0]!.result.image;
    const original = pack.originalFrames[0]!.image;
    const chestMask = fillConvexQuad(FIXTURE_WIDTH, FIXTURE_HEIGHT, CLEARED_CHEST_QUAD_TUPLE);
    const chestPx = findMaskPixel(chestMask, FIXTURE_WIDTH, FIXTURE_HEIGHT);
    expect(chestPx).not.toBeNull();
    const [cx, cy] = chestPx!;
    const a = out.frames[0]!.result.authorizedAlpha[cy * FIXTURE_WIDTH + cx]!;
    expect(a).toBeGreaterThan(0);
    expect(rgbAt(reconstructed, cx, cy)).toEqual([...CHEST_STILL_RGB]);
    expect(rgbAt(reconstructed, 0, 0)).toEqual(rgbAt(original, 0, 0));
  });

  it("nearest-neighbor scales a temporal mask to original-master size", () => {
    const src = new Float32Array(2 * 2);
    src[0] = 1;
    const out = scaleAlphaNearest(src, 2, 2, 4, 4);
    expect(out).toHaveLength(16);
    expect(out[0]).toBe(1);
    expect(out[15]).toBe(0);
  });

  it("does not let a full inverted generated become the master when SAM-3 is empty", () => {
    const pack = liveWiringFixturePack();
    const empty = new Float32Array(pack.width * pack.height);
    const out = reconstructMasterClip({
      originalFrames: [pack.originalFrames[0]!],
      generatedFrames: [{ index: 0, image: pack.invertedOnFrame0 }],
      chestStill: pack.chestStill,
      sleeveStill: pack.sleeveStill,
      sam3: { ...pack.sam3, outfitAlpha: empty, repairAlpha: empty },
      temporalJobs: [],
    });
    expect(countRgbMismatches(out.frames[0]!.result.image, pack.originalFrames[0]!.image)).toBe(0);
    expect(countRgbMismatches(out.frames[0]!.result.image, pack.invertedOnFrame0)).toBe(
      FIXTURE_WIDTH * FIXTURE_HEIGHT,
    );
  });
});

describe("scaleAlphaNearest", () => {
  it("nearest-neighbor scales a temporal mask to original-master size", () => {
    const src = new Float32Array(2 * 2);
    src[0] = 1;
    const out = scaleAlphaNearest(src, 2, 2, 4, 4);
    expect(out).toHaveLength(16);
    expect(out[0]).toBe(1);
    expect(out[15]).toBe(0);
  });

  it("is a no-op when size already matches", () => {
    const src = new Float32Array([0.2, 0.8]);
    expect(scaleAlphaNearest(src, 2, 1, 2, 1)).toBe(src);
  });
});
