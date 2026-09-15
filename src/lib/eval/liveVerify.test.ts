import { describe, expect, it } from "vitest";
import { STAGE1J_LIVE_VERIFIED } from "./stage1jEvidence";
import { STAGE1K_LIVE_VERIFIED } from "./stage1kEvidence";
import { STAGE1L_LIVE_VERIFIED } from "./stage1lEvidence";
import {
  extractRepairMethodVersion,
  forensicExtras,
  runFixturePipeline,
  scoreStillPair,
  STAGE1K_CANONICAL,
  STAGE1K_EXPECTED_VERSION,
  STAGE1L_EXPECTED_VERSION,
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
    expect(c9.metrics.rightWindowRatio).toBeLessThan(STAGE1K_LIVE_VERIFIED.ghostRatiosUnfiltered.right);
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
