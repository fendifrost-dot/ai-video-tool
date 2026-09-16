import { describe, expect, it } from "vitest";
import { STAGE1J_LIVE_VERIFIED } from "./stage1jEvidence";
import { STAGE1K_LIVE_VERIFIED } from "./stage1kEvidence";
import { STAGE1L_LIVE_VERIFIED } from "./stage1lEvidence";
import { STAGE1M_LIVE_VERIFIED } from "./stage1mEvidence";
import { SLEEVE_STILL_1A_LIVE_VERIFIED } from "./sleeveStill1aEvidence";
import { SLEEVE_STILL_1B_LIVE_VERIFIED } from "./sleeveStill1bEvidence";
import { SLEEVE_STILL_1C_LIVE_VERIFIED } from "./sleeveStill1cEvidence";
import {
  extractRepairMethodVersion,
  forensicExtras,
  runFixturePipeline,
  scoreStillPair,
  STAGE1K_CANONICAL,
  STAGE1K_EXPECTED_VERSION,
  STAGE1L_EXPECTED_VERSION,
  STAGE1M_EXPECTED_VERSION,
} from "./liveVerify";
import { GHOST_RATIO_PASS_CEILING } from "./chestCriteria";

describe("Stage 1k live-verify harness (unit)", () => {
  it("locks canonical IDs, expected version, and 1j historical table", () => {
    expect(STAGE1K_EXPECTED_VERSION).toBe("architecture_c_still_repair_1k");
    expect(STAGE1K_CANONICAL.stillAssetId).toBe("2aa1a44c-b24a-46bf-890f-13a6fc65b1cc");
    expect(STAGE1K_CANONICAL.bandQuad).toEqual([
      [0.3, 0.53],
      [0.87, 0.533],
      [0.87, 0.585],
      [0.3, 0.582],
    ]);
    expect(STAGE1J_LIVE_VERIFIED.gate).toBe("NOT_CLEARED");
    expect(STAGE1K_LIVE_VERIFIED.gate).toBe("NOT_CLEARED");
    expect(STAGE1K_LIVE_VERIFIED.fail).toEqual([2, 4, 6, 9]);
    expect(STAGE1L_LIVE_VERIFIED.gate).toBe("NOT_CLEARED");
    expect(STAGE1L_LIVE_VERIFIED.fail).toEqual([9]);
    expect(STAGE1L_LIVE_VERIFIED.assetId).toBe("9eaf0c55-5fdd-44ac-ac5c-9a9a86414c75");
    expect(STAGE1L_LIVE_VERIFIED.pinstripeRemnants).toBe(0);
    expect(STAGE1L_LIVE_VERIFIED.creamBodyToNavy).toBe(0);
    expect(STAGE1L_LIVE_VERIFIED.rightEndCreamToNavy).toBe(0);
    expect(STAGE1M_LIVE_VERIFIED.gate).toBe("CLEARED");
    expect(STAGE1M_LIVE_VERIFIED.fail).toEqual([]);
    expect(STAGE1M_LIVE_VERIFIED.assetId).toBe("9ed83c01-8c7d-4d1b-918f-87b0fc743c50");
    expect(STAGE1M_LIVE_VERIFIED.pinstripeRemnants).toBe(0);
    expect(STAGE1M_LIVE_VERIFIED.creamBodyToNavy).toBe(0);
    expect(STAGE1M_LIVE_VERIFIED.rightEndCreamToNavy).toBe(0);
    expect(
      extractRepairMethodVersion({ repair: { repair_method_version: STAGE1K_EXPECTED_VERSION } }),
    ).toBe(STAGE1K_EXPECTED_VERSION);
  });

  it("locks Stage 1l live asset identity (PR #69) and canonical 10/11 score (PR #70)", () => {
    expect(STAGE1L_EXPECTED_VERSION).toBe("architecture_c_still_repair_1l");
    expect(STAGE1L_LIVE_VERIFIED.assetId).toBe("9eaf0c55-5fdd-44ac-ac5c-9a9a86414c75");
    expect(STAGE1L_LIVE_VERIFIED.repairMethodVersion).toBe(STAGE1L_EXPECTED_VERSION);
    expect(STAGE1L_LIVE_VERIFIED.cleanStillAssetId).toBe(STAGE1K_CANONICAL.stillAssetId);
    expect(STAGE1L_LIVE_VERIFIED.requestedBandQuadNorm).toEqual(STAGE1K_CANONICAL.bandQuad);
    expect(STAGE1L_LIVE_VERIFIED.gate).toBe("NOT_CLEARED");
    expect(
      extractRepairMethodVersion({ repair: { repair_method_version: STAGE1L_EXPECTED_VERSION } }),
    ).toBe(STAGE1L_EXPECTED_VERSION);
  });

  it("locks Stage 1m live asset identity and canonical 11/11 score", () => {
    expect(STAGE1M_EXPECTED_VERSION).toBe("architecture_c_still_repair_1m");
    expect(STAGE1M_LIVE_VERIFIED.assetId).toBe("9ed83c01-8c7d-4d1b-918f-87b0fc743c50");
    expect(STAGE1M_LIVE_VERIFIED.repairMethodVersion).toBe(STAGE1M_EXPECTED_VERSION);
    expect(STAGE1M_LIVE_VERIFIED.cleanStillAssetId).toBe(STAGE1K_CANONICAL.stillAssetId);
    expect(STAGE1M_LIVE_VERIFIED.requestedBandQuadNorm).toEqual(STAGE1K_CANONICAL.bandQuad);
    expect(STAGE1M_LIVE_VERIFIED.gate).toBe("CLEARED");
    expect(STAGE1M_LIVE_VERIFIED.pass).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(STAGE1M_LIVE_VERIFIED.fail).toEqual([]);
    expect(STAGE1M_LIVE_VERIFIED.ghostRatiosUnfiltered.combined).toBeLessThan(
      GHOST_RATIO_PASS_CEILING,
    );
    expect(STAGE1M_LIVE_VERIFIED.ghostRatiosUnfiltered.right).toBeLessThan(
      GHOST_RATIO_PASS_CEILING,
    );
    expect(STAGE1M_LIVE_VERIFIED.ghostRatiosUnfiltered.right).toBeLessThan(
      STAGE1L_LIVE_VERIFIED.ghostRatiosUnfiltered.right,
    );
    expect(
      extractRepairMethodVersion({ repair: { repair_method_version: STAGE1M_EXPECTED_VERSION } }),
    ).toBe(STAGE1M_EXPECTED_VERSION);
  });

  it("locks Lane B sleeve still 1a live identity and 5/6 score", () => {
    expect(SLEEVE_STILL_1A_LIVE_VERIFIED.repairMethodVersion).toBe(
      "architecture_c_sleeve_still_1a",
    );
    expect(SLEEVE_STILL_1A_LIVE_VERIFIED.claim).toBe("visible_geometry_only");
    expect(SLEEVE_STILL_1A_LIVE_VERIFIED.assetId).toBe("fde270bf-63f2-44ff-a76b-4129a0248708");
    expect(SLEEVE_STILL_1A_LIVE_VERIFIED.cleanStillAssetId).toBe(STAGE1K_CANONICAL.stillAssetId);
    expect(SLEEVE_STILL_1A_LIVE_VERIFIED.preferredChestOutputUsed).toBe(false);
    expect(SLEEVE_STILL_1A_LIVE_VERIFIED.geometryRejectedHttp400).toBe(false);
    expect(SLEEVE_STILL_1A_LIVE_VERIFIED.gate).toBe("NOT_CLEARED");
    expect(SLEEVE_STILL_1A_LIVE_VERIFIED.pass).toEqual([1, 2, 3, 4, 5]);
    expect(SLEEVE_STILL_1A_LIVE_VERIFIED.fail).toEqual([6]);
    expect(
      extractRepairMethodVersion({
        repair: { repair_method_version: SLEEVE_STILL_1A_LIVE_VERIFIED.repairMethodVersion },
      }),
    ).toBe("architecture_c_sleeve_still_1a");
  });

  it("locks Lane B sleeve still 1b live identity and 5/6 score (right navy-ward FAIL)", () => {
    expect(SLEEVE_STILL_1B_LIVE_VERIFIED.repairMethodVersion).toBe(
      "architecture_c_sleeve_still_1b",
    );
    expect(SLEEVE_STILL_1B_LIVE_VERIFIED.claim).toBe("visible_geometry_only");
    expect(SLEEVE_STILL_1B_LIVE_VERIFIED.assetId).toBe("a4dc7f47-a08d-46e5-b279-ae53fd81e37c");
    expect(SLEEVE_STILL_1B_LIVE_VERIFIED.cleanStillAssetId).toBe(STAGE1K_CANONICAL.stillAssetId);
    expect(SLEEVE_STILL_1B_LIVE_VERIFIED.preferredChestOutputUsed).toBe(false);
    expect(SLEEVE_STILL_1B_LIVE_VERIFIED.geometryRejectedHttp400).toBe(false);
    expect(SLEEVE_STILL_1B_LIVE_VERIFIED.navyFillMode).toBe("warp");
    expect(SLEEVE_STILL_1B_LIVE_VERIFIED.gate).toBe("NOT_CLEARED");
    expect(SLEEVE_STILL_1B_LIVE_VERIFIED.pass).toEqual([1, 2, 3, 4, 5]);
    expect(SLEEVE_STILL_1B_LIVE_VERIFIED.fail).toEqual([6]);
    expect(SLEEVE_STILL_1B_LIVE_VERIFIED.leftMeanOutLuma).toBeLessThan(
      SLEEVE_STILL_1B_LIVE_VERIFIED.leftMeanSrcLuma - 8,
    );
    expect(SLEEVE_STILL_1B_LIVE_VERIFIED.rightMeanOutLuma).toBeGreaterThan(
      SLEEVE_STILL_1B_LIVE_VERIFIED.rightMeanSrcLuma,
    );
    expect(
      extractRepairMethodVersion({
        repair: { repair_method_version: SLEEVE_STILL_1B_LIVE_VERIFIED.repairMethodVersion },
      }),
    ).toBe("architecture_c_sleeve_still_1b");
  });

  it("locks Lane B sleeve still 1c live identity and 6/6 CLEARED (both sides navy-ward)", () => {
    expect(SLEEVE_STILL_1C_LIVE_VERIFIED.repairMethodVersion).toBe(
      "architecture_c_sleeve_still_1c",
    );
    expect(SLEEVE_STILL_1C_LIVE_VERIFIED.claim).toBe("visible_geometry_only");
    expect(SLEEVE_STILL_1C_LIVE_VERIFIED.assetId).toBe("fdb86b18-d4aa-465e-b73f-1d252709739c");
    expect(SLEEVE_STILL_1C_LIVE_VERIFIED.cleanStillAssetId).toBe(STAGE1K_CANONICAL.stillAssetId);
    expect(SLEEVE_STILL_1C_LIVE_VERIFIED.preferredChestOutputUsed).toBe(false);
    expect(SLEEVE_STILL_1C_LIVE_VERIFIED.geometryRejectedHttp400).toBe(false);
    expect(SLEEVE_STILL_1C_LIVE_VERIFIED.navyFillMode).toBe("navy_over_cream");
    expect(SLEEVE_STILL_1C_LIVE_VERIFIED.gate).toBe("CLEARED");
    expect(SLEEVE_STILL_1C_LIVE_VERIFIED.pass).toEqual([1, 2, 3, 4, 5, 6]);
    expect(SLEEVE_STILL_1C_LIVE_VERIFIED.fail).toEqual([]);
    expect(SLEEVE_STILL_1C_LIVE_VERIFIED.leftMeanOutLuma).toBeLessThan(
      SLEEVE_STILL_1C_LIVE_VERIFIED.leftMeanSrcLuma - 8,
    );
    expect(SLEEVE_STILL_1C_LIVE_VERIFIED.rightMeanOutLuma).toBeLessThan(
      SLEEVE_STILL_1C_LIVE_VERIFIED.rightMeanSrcLuma - 8,
    );
    expect(SLEEVE_STILL_1C_LIVE_VERIFIED.leftNavyLike).toBeGreaterThan(0);
    expect(SLEEVE_STILL_1C_LIVE_VERIFIED.rightNavyLike).toBeGreaterThan(0);
    expect(
      extractRepairMethodVersion({
        repair: { repair_method_version: SLEEVE_STILL_1C_LIVE_VERIFIED.repairMethodVersion },
      }),
    ).toBe("architecture_c_sleeve_still_1c");
  });

  it("fixture pipeline is 11/11 under Stage 1l paint (1k live 7/11 stays historical)", () => {
    const { source, output } = runFixturePipeline();
    const pkg = scoreStillPair(source, output, "fixture_1l", false, STAGE1K_CANONICAL.bandQuad);
    const passed = pkg.report.criteria.filter((c) => c.verdict === "PASS").map((c) => c.id);
    const failed = pkg.report.criteria.filter((c) => c.verdict === "FAIL").map((c) => c.id);
    expect(passed).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(failed).toEqual([]);
    expect(pkg.report.passCount).toBe(11);
    const c9 = pkg.report.criteria.find((c) => c.id === 9)!;
    expect(c9.metrics.ghostRatio).toBeLessThan(GHOST_RATIO_PASS_CEILING);
    expect(c9.metrics.rightWindowRatio).toBeLessThan(
      STAGE1K_LIVE_VERIFIED.ghostRatiosUnfiltered.right,
    );
    expect(pkg.extras.sleeveCornerDarkened).toBe(0);
    expect(pkg.extras.rightEndCreamToNavy).toBe(0);
    expect(pkg.extras.creamToNavyX280Y673).toBe(0);
    expect(pkg.extras.changedAboveY600).toBe(0);
    expect(pkg.extras.changedBelowY800).toBe(0);
    expect(pkg.json.live).toBe(false);
  });

  it("forensic extras count cream→navy in the 1j windows", () => {
    const { source, output } = runFixturePipeline();
    const extra = forensicExtras(source, output);
    expect(extra.leftTapeLumaY715X399).toBeLessThan(80);
    expect(extra.sleeveCornerDarkened).toBe(0);
  });
});
