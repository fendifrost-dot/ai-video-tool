import { describe, expect, it } from "vitest";
import { CHEST_REF_FRAME } from "@/lib/eval/chestCriteria";
import { SLEEVE_STILL_1A_LIVE_VERIFIED } from "@/lib/eval/sleeveStill1aEvidence";
import { TEMPORAL_LIVE_ACTIVATION_ARMED } from "@/lib/temporal/livePrep";
import { CREAM, buildCrossedArmsSleeveFixture } from "./fixtures";
import {
  DEFAULT_FLAT_SLEEVE_SOURCE_BBOX,
  LIVE_CHEST_RESERVED_QUAD_NORM,
  SEEDED_VISIBLE_SLEEVE_QUADS,
  SLEEVE_STILL_REPAIR_METHOD_VERSION,
  rasterizeReservedChestMask,
  repairVisibleSleevePanelsOnStill,
} from "./liveStill";
import {
  CANONICAL_CLEAN_STILL_ASSET_ID,
  PREFERRED_CHEST_OUTPUT_ASSET_ID,
  SLEEVE_LIVE_SCORECARD_VERSION,
  evaluateSleeveStillLive,
  pixelTargetQuadToNorm,
  scoreSleeveGeometry,
  scoreSleeveIdentity,
} from "./liveScore";
import { SLEEVE_PANEL_CLAIM } from "./types";

const LIVE_IDENTITY = {
  repairMethodVersion: SLEEVE_STILL_REPAIR_METHOD_VERSION,
  claim: SLEEVE_PANEL_CLAIM,
  contractVersion: "1.0.0",
  geometryNote: "visible_upper_arm_only" as const,
  hiddenShoulderToCuffValidated: false,
  repairStage: "sleeve_panel",
  sourceStillAssetId: CANONICAL_CLEAN_STILL_ASSET_ID,
  chestOutputAssetId: PREFERRED_CHEST_OUTPUT_ASSET_ID,
  consumedChestOutput: true,
  temporalTrackingEnabled: false,
  keyframeId: "v2-still-0.785",
  leftQuad: SEEDED_VISIBLE_SLEEVE_QUADS.left,
  rightQuad: SEEDED_VISIBLE_SLEEVE_QUADS.right,
  leftPainted: 22777,
  rightPainted: 11128,
  leftRejectedHidden: 0,
  rightRejectedHidden: 0,
  leftRejectedChest: 0,
  rightRejectedChest: 0,
  geometryRejectedHttp400: false,
};

function creamStill720(): {
  width: number;
  height: number;
  data: Uint8Array;
} {
  const w = CHEST_REF_FRAME.width;
  const h = CHEST_REF_FRAME.height;
  const still = {
    width: w,
    height: h,
    data: new Uint8Array(w * h * 4),
  };
  for (let i = 0; i < w * h; i++) {
    still.data[i * 4] = CREAM[0];
    still.data[i * 4 + 1] = CREAM[1];
    still.data[i * 4 + 2] = CREAM[2];
    still.data[i * 4 + 3] = 255;
  }
  const reserved = rasterizeReservedChestMask(w, h, LIVE_CHEST_RESERVED_QUAD_NORM);
  for (let i = 0; i < reserved.data.length; i++) {
    if (!reserved.data[i]) continue;
    still.data[i * 4] = 28;
    still.data[i * 4 + 1] = 32;
    still.data[i * 4 + 2] = 88;
  }
  return still;
}

describe("Lane B sleeve live scorecard", () => {
  it("locks live identity + seeded quads without claiming temporal armed", () => {
    expect(TEMPORAL_LIVE_ACTIVATION_ARMED).toBe(false);
    expect(SLEEVE_STILL_REPAIR_METHOD_VERSION).toBe("architecture_c_sleeve_still_1b");
    expect(scoreSleeveIdentity(LIVE_IDENTITY).verdict).toBe("PASS");
    expect(scoreSleeveGeometry(LIVE_IDENTITY).verdict).toBe("PASS");
    expect(PREFERRED_CHEST_OUTPUT_ASSET_ID).toBe("9ed83c01-8c7d-4d1b-918f-87b0fc743c50");
    const leftPx = pixelTargetQuadToNorm(
      [
        [22, 640],
        [187, 646],
        [180, 787],
        [22, 781],
      ],
      720,
      1280,
    );
    expect(leftPx).not.toBeNull();
    expect(scoreSleeveGeometry({ ...LIVE_IDENTITY, leftQuad: leftPx }).verdict).toBe("PASS");
  });

  it("passes C5/C11/reserved/visible on the 720×1280 synthetic with navy-majority crop", () => {
    const still = creamStill720();
    const fx = buildCrossedArmsSleeveFixture();
    const out = repairVisibleSleevePanelsOnStill({
      still,
      flatRef: fx.flatRef,
      panels: [
        {
          side: "left",
          targetQuad: SEEDED_VISIBLE_SLEEVE_QUADS.left,
          sourceBboxNorm: fx.panels[0].sourceBboxNorm,
        },
        {
          side: "right",
          targetQuad: SEEDED_VISIBLE_SLEEVE_QUADS.right,
          sourceBboxNorm: fx.panels[1].sourceBboxNorm,
        },
      ],
      chestBandQuadNorm: LIVE_CHEST_RESERVED_QUAD_NORM,
      sourceStillId: CANONICAL_CLEAN_STILL_ASSET_ID,
      chestOutputAssetId: PREFERRED_CHEST_OUTPUT_ASSET_ID,
    });
    const score = evaluateSleeveStillLive({
      source: still,
      output: out.still,
      identity: {
        ...LIVE_IDENTITY,
        leftPainted: out.output.sides.find((s) => s.side === "left")?.paintedPixelCount ?? 0,
        rightPainted: out.output.sides.find((s) => s.side === "right")?.paintedPixelCount ?? 0,
      },
    });
    expect(score.schemaVersion).toBe(SLEEVE_LIVE_SCORECARD_VERSION);
    expect(score.gate).toBe("CLEARED");
    expect(score.failCount).toBe(0);
    expect(score.temporal.TEMPORAL_LIVE_ACTIVATION_ARMED).toBe(false);
    expect(score.inputLineage.preferredChestOutputUsed).toBe(true);
  });

  it("1b: DEFAULT cream bbox on the fixture flat still CLEARS the 6-pt gate", () => {
    const still = creamStill720();
    const fx = buildCrossedArmsSleeveFixture();
    const out = repairVisibleSleevePanelsOnStill({
      still,
      flatRef: fx.flatRef,
      panels: [
        {
          side: "left",
          targetQuad: SEEDED_VISIBLE_SLEEVE_QUADS.left,
          sourceBboxNorm: DEFAULT_FLAT_SLEEVE_SOURCE_BBOX,
        },
        {
          side: "right",
          targetQuad: SEEDED_VISIBLE_SLEEVE_QUADS.right,
          sourceBboxNorm: DEFAULT_FLAT_SLEEVE_SOURCE_BBOX,
        },
      ],
      chestBandQuadNorm: LIVE_CHEST_RESERVED_QUAD_NORM,
      sourceStillId: PREFERRED_CHEST_OUTPUT_ASSET_ID,
      chestOutputAssetId: PREFERRED_CHEST_OUTPUT_ASSET_ID,
    });
    const score = evaluateSleeveStillLive({
      source: still,
      output: out.still,
      identity: {
        ...LIVE_IDENTITY,
        sourceStillAssetId: PREFERRED_CHEST_OUTPUT_ASSET_ID,
        leftPainted: out.output.sides.find((s) => s.side === "left")?.paintedPixelCount ?? 0,
        rightPainted: out.output.sides.find((s) => s.side === "right")?.paintedPixelCount ?? 0,
      },
    });
    expect(out.meta.repair_method_version).toBe("architecture_c_sleeve_still_1b");
    expect(score.gate).toBe("CLEARED");
    expect(score.criteria.find((c) => c.id === 6)?.verdict).toBe("PASS");
    expect(score.criteria.find((c) => c.id === 5)?.verdict).toBe("PASS");
    expect(score.criteria.find((c) => c.id === 3)?.verdict).toBe("PASS");
    expect(score.criteria.find((c) => c.id === 4)?.verdict).toBe("PASS");
  });

  it("locks the canonical live 1a score (fde270bf, NOT CLEARED 5/6) as history", () => {
    expect(SLEEVE_STILL_1A_LIVE_VERIFIED.assetId).toBe("fde270bf-63f2-44ff-a76b-4129a0248708");
    expect(SLEEVE_STILL_1A_LIVE_VERIFIED.repairMethodVersion).toBe(
      "architecture_c_sleeve_still_1a",
    );
    expect(SLEEVE_STILL_1A_LIVE_VERIFIED.claim).toBe(SLEEVE_PANEL_CLAIM);
    expect(SLEEVE_STILL_1A_LIVE_VERIFIED.hiddenShoulderToCuffValidated).toBe(false);
    expect(SLEEVE_STILL_1A_LIVE_VERIFIED.preferredChestOutputUsed).toBe(false);
    expect(SLEEVE_STILL_1A_LIVE_VERIFIED.cleanStillAssetId).toBe(CANONICAL_CLEAN_STILL_ASSET_ID);
    expect(SLEEVE_STILL_1A_LIVE_VERIFIED.gate).toBe("NOT_CLEARED");
    expect(SLEEVE_STILL_1A_LIVE_VERIFIED.pass).toEqual([1, 2, 3, 4, 5]);
    expect(SLEEVE_STILL_1A_LIVE_VERIFIED.fail).toEqual([6]);
    expect(SLEEVE_STILL_1A_LIVE_VERIFIED.c5BrightChanged).toBe(0);
    expect(SLEEVE_STILL_1A_LIVE_VERIFIED.chestReservedChanged).toBe(0);
    expect(SLEEVE_STILL_1A_LIVE_VERIFIED.c11ChangedAboveY600).toBe(0);
    expect(SLEEVE_STILL_1A_LIVE_VERIFIED.leftMeanOutLuma).toBeGreaterThan(
      SLEEVE_STILL_1A_LIVE_VERIFIED.leftMeanSrcLuma,
    );
  });

  it("fails chest reserved when the band is overwritten", () => {
    const w = CHEST_REF_FRAME.width;
    const h = CHEST_REF_FRAME.height;
    const source = {
      width: w,
      height: h,
      data: new Uint8Array(w * h * 4),
    };
    source.data.fill(200);
    const output = {
      width: w,
      height: h,
      data: new Uint8Array(source.data),
    };
    const reserved = rasterizeReservedChestMask(w, h, LIVE_CHEST_RESERVED_QUAD_NORM);
    for (let i = 0; i < reserved.data.length; i++) {
      if (!reserved.data[i]) continue;
      output.data[i * 4] = 10;
      output.data[i * 4 + 1] = 10;
      output.data[i * 4 + 2] = 10;
    }
    const score = evaluateSleeveStillLive({
      source,
      output,
      identity: LIVE_IDENTITY,
    });
    expect(score.criteria.find((c) => c.id === 5)?.verdict).toBe("FAIL");
    expect(score.gate).toBe("NOT_CLEARED");
  });
});
