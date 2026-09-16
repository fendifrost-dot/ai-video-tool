import { describe, expect, it } from "vitest";
import { CANONICAL_MASTER_CLIP_ID, CANONICAL_PROJECT_ID } from "../canonicalLineage";
import { unauthorizedPixelsMatchOriginal } from "../originalMasterReconstruct";
import { runPlayableCompose } from "./compose";
import { PLAYABLE_WORKING_HEIGHT, PLAYABLE_WORKING_WIDTH } from "./contract";
import { heroFramePlayableSpec } from "./spec";

describe("runPlayableCompose", () => {
  it("refuses without explicitArm", () => {
    const result = runPlayableCompose({ spec: heroFramePlayableSpec({ frameCount: 4 }) });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.paidCalls).toBe(false);
    expect(result.grokPerFrame).toBe(false);
    expect(result.code).toBe("explicit_arm_required");
  });

  it("composes a 720×1280 window with intended SAM-3 and in-lib temporal", () => {
    const spec = heroFramePlayableSpec({ frameCount: 6, keyframeIndex: 2 });
    const result = runPlayableCompose({ explicitArm: true, spec });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.width).toBe(PLAYABLE_WORKING_WIDTH);
    expect(result.height).toBe(PLAYABLE_WORKING_HEIGHT);
    expect(result.frameCount).toBe(6);
    expect(result.fps).toBe(24);
    expect(result.paidCalls).toBe(false);
    expect(result.grokPerFrame).toBe(false);
    expect(result.sam3LiveFetch).toBe(false);
    expect(result.edgeFunction).toBeNull();
    expect(result.spec.projectId).toBe(CANONICAL_PROJECT_ID);
    expect(result.spec.masterClipAssetId).toBe(CANONICAL_MASTER_CLIP_ID);
    expect(result.clip.masterClipAssetId).toBe(CANONICAL_MASTER_CLIP_ID);
    expect(result.sam3.source).toBe("intended_stage1h_evidence");
    expect(result.sam3.liveFetch).toBe(false);
    expect(result.sam3.fallbackStatus).toBe("none");
    expect(result.temporalJobCount).toBe(3);
    expect(result.temporalFramesUsed).toBeGreaterThan(0);
    expect(result.temporalChunking.didChunk).toBe(false);
    expect(result.temporalChunking.raisedProxyMaxFrames).toBe(false);
    expect(result.temporalChunking.maxFrames).toBe(24);
    expect(result.clip.originalPixelsPreservedWhereUnauthorized).toBe(true);
    expect(result.mediaKind).toBe("canonical_720x1280_still_derived");

    const byIndex = new Map(result.originalFrames.map((f) => [f.index, f.image]));
    for (const fr of result.clip.frames) {
      const original = byIndex.get(fr.index);
      expect(original).toBeDefined();
      expect(
        unauthorizedPixelsMatchOriginal(original!, fr.result.image, fr.result.authorizedAlpha),
      ).toBe(true);
      expect(fr.result.preservedPixels).toBeGreaterThan(0);
      expect(fr.result.changedPixels).toBeLessThan(fr.result.image.width * fr.result.image.height);
    }
  });
});
