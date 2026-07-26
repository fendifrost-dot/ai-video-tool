import { describe, expect, it } from "vitest";
import {
  evaluateGrokFaceMatch,
  FACE_MATCH_THRESHOLD,
  HEAD_ONLY_RESTORE_PADDING,
  HEAD_RESTORE_PADDING,
} from "./faceRestore";
import { faceRegionToQuad } from "@/lib/garment/faceRegion";

describe("HEAD_ONLY_RESTORE_PADDING", () => {
  // A head detected forehead-to-lip in the upper third of a hero frame.
  const region = { left: 150, top: 100, right: 250, bottom: 200 };
  const imgWidth = 400;
  const imgHeight = 700;

  it("reaches much less far down than the whole-head padding", () => {
    // The whole point: the head-only paste must stop short of the chest so it
    // never overwrites Grok's swapped garment.
    expect(HEAD_ONLY_RESTORE_PADDING.padBottom!).toBeLessThan(
      HEAD_RESTORE_PADDING.padBottom!,
    );

    const headOnly = faceRegionToQuad(region, imgWidth, imgHeight, HEAD_ONLY_RESTORE_PADDING);
    const wholeHead = faceRegionToQuad(region, imgWidth, imgHeight, HEAD_RESTORE_PADDING);
    // br = bottom-right corner; [1] is the normalised y of the oval's bottom edge.
    expect(headOnly[2][1]).toBeLessThan(wholeHead[2][1]);
  });

  it("keeps the oval bottom above the garment band (upper chest)", () => {
    const quad = faceRegionToQuad(region, imgWidth, imgHeight, HEAD_ONLY_RESTORE_PADDING);
    // Region bottom is at 200/700 ≈ 0.286; the bomber collar/chest sits lower in
    // frame. The head-only oval must not extend into it.
    expect(quad[2][1]).toBeLessThan(0.45);
  });

  it("still covers the hairline above the detected skin bbox", () => {
    const quad = faceRegionToQuad(region, imgWidth, imgHeight, HEAD_ONLY_RESTORE_PADDING);
    // Top edge is padded up past the skin bbox top (100/700 ≈ 0.143).
    expect(quad[0][1]).toBeLessThan(region.top / imgHeight);
  });
});

describe("evaluateGrokFaceMatch", () => {
  it("reports an unavailable comparator as null, and never skips the restore", async () => {
    const match = await evaluateGrokFaceMatch();
    expect(match.score).toBeNull();
    expect(match.comparatorAvailable).toBe(false);
    expect(match.skipRestore).toBe(false);
    expect(match.threshold).toBe(FACE_MATCH_THRESHOLD);
  });

  it("skips the restore only when a real score clears the threshold", async () => {
    const match = await evaluateGrokFaceMatch({ comparator: () => 0.95 });
    expect(match.score).toBe(0.95);
    expect(match.comparatorAvailable).toBe(true);
    expect(match.skipRestore).toBe(true);
  });

  it("keeps the restore when the score is below the threshold", async () => {
    const match = await evaluateGrokFaceMatch({ comparator: () => 0.4 });
    expect(match.skipRestore).toBe(false);
  });

  it("keeps the restore when the comparator returns null (unknown)", async () => {
    const match = await evaluateGrokFaceMatch({ comparator: () => null });
    expect(match.score).toBeNull();
    expect(match.skipRestore).toBe(false);
  });

  it("honours a custom threshold", async () => {
    const match = await evaluateGrokFaceMatch({ threshold: 0.5, comparator: () => 0.6 });
    expect(match.threshold).toBe(0.5);
    expect(match.skipRestore).toBe(true);
  });

  it("awaits an async comparator", async () => {
    const match = await evaluateGrokFaceMatch({ comparator: async () => 0.99 });
    expect(match.skipRestore).toBe(true);
  });
});
