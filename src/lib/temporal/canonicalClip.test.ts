import { describe, expect, it } from "vitest";
import {
  CANONICAL_CLIP_DURATION_SEC,
  CANONICAL_CLIP_FRAME_COUNT,
  CANONICAL_CLIP_KEYFRAME_FRAME_INDEX,
  CANONICAL_CLIP_META,
  CANONICAL_CLIP_NATIVE_FPS,
  CANONICAL_MASTER_CLIP_ID,
} from "./canonicalClip";
import { CANONICAL_KEYFRAME_TIME_SEC } from "./canonicalLineage";
import {
  FULL_CLIP_DEFECT_WINDOWS,
  FULL_CLIP_QA_RASTER,
  canonicalFullClipCleanFixture,
  canonicalFullClipDefectFixture,
  expectedDxAtFrame,
} from "./fullClipFixture";
import { CANONICAL_QA_CLIP_SPEC, SECOND_QA_CLIP_SPEC, keyframeIndexForSpec } from "./clipSpec";
import { maskArea } from "./mask";

describe("canonical master clip metadata", () => {
  it("freezes 76fe7438 as 241 frames at 59.94 fps with keyframe index 47", () => {
    expect(CANONICAL_MASTER_CLIP_ID).toBe("76fe7438-671d-4428-a7f6-17a45e98c16f");
    expect(CANONICAL_CLIP_FRAME_COUNT).toBe(241);
    expect(CANONICAL_CLIP_NATIVE_FPS).toBe(59.94);
    expect(CANONICAL_CLIP_DURATION_SEC).toBeCloseTo(4.0207);
    expect(CANONICAL_KEYFRAME_TIME_SEC).toBe(0.785);
    expect(CANONICAL_CLIP_KEYFRAME_FRAME_INDEX).toBe(47);
    expect(Math.round(CANONICAL_KEYFRAME_TIME_SEC * CANONICAL_CLIP_NATIVE_FPS)).toBe(47);
    expect(CANONICAL_CLIP_META.pixels).toBe("synthetic_luma_stand_in_not_live_1080x1920");
  });
});

describe("portable clip specs", () => {
  it("keeps a second-clip spec distinct from canonical 76fe7438 / 241 / 59.94", () => {
    expect(SECOND_QA_CLIP_SPEC.id).not.toBe(CANONICAL_QA_CLIP_SPEC.id);
    expect(SECOND_QA_CLIP_SPEC.frameCount).toBe(72);
    expect(SECOND_QA_CLIP_SPEC.fps).toBe(24);
    expect(SECOND_QA_CLIP_SPEC.keyframeIndex).toBe(18);
    expect(keyframeIndexForSpec(SECOND_QA_CLIP_SPEC)).toBe(18);
    expect(CANONICAL_QA_CLIP_SPEC.frameCount).toBe(241);
  });
});

describe("canonical full-clip synthetic fixture", () => {
  it("emits 241 luma frames sized to the QA raster with canonical keyframe 47", () => {
    const fixture = canonicalFullClipCleanFixture();
    expect(fixture.mode).toBe("clean");
    expect(fixture.clip.id).toBe(CANONICAL_MASTER_CLIP_ID);
    expect(fixture.clip.fps).toBe(59.94);
    expect(fixture.clip.frames).toHaveLength(241);
    expect(fixture.canonicalIndex).toBe(47);
    expect(fixture.clip.frames[47]?.index).toBe(47);
    expect(fixture.clip.frames[0]?.width).toBe(FULL_CLIP_QA_RASTER.width);
    expect(fixture.clip.frames[0]?.height).toBe(FULL_CLIP_QA_RASTER.height);
    expect(fixture.clip.frames[0]?.luma.length).toBe(80 * 128);
    expect(fixture.expectedDx[47]).toBe(0);
    expect(expectedDxAtFrame(47)).toBe(0);
    expect(maskArea(fixture.chestMask)).toBeGreaterThan(20);
    expect(fixture.sam3Masks).toHaveLength(241);
    expect(maskArea(fixture.sam3Masks[47]!)).toBeGreaterThan(0);
    expect(fixture.defects).toHaveLength(0);
  });

  it("injects four named defect windows on the defects fixture", () => {
    const fixture = canonicalFullClipDefectFixture();
    expect(fixture.mode).toBe("defects");
    expect(fixture.defects).toEqual([...FULL_CLIP_DEFECT_WINDOWS]);
    expect(maskArea(fixture.sam3Masks[100]!)).toBe(0);
    expect(maskArea(fixture.sam3Masks[47]!)).toBeGreaterThan(0);
  });
});
