import { describe, expect, it } from "vitest";
import { STAGE1J_LIVE_VERIFIED } from "./stage1jEvidence";
import {
  extractRepairMethodVersion,
  forensicExtras,
  runFixturePipeline,
  scoreStillPair,
  STAGE1K_CANONICAL,
  STAGE1K_EXPECTED_VERSION,
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
    expect(
      extractRepairMethodVersion({ repair: { repair_method_version: STAGE1K_EXPECTED_VERSION } }),
    ).toBe(STAGE1K_EXPECTED_VERSION);
  });

  it("fixture pipeline is 9/11 with truthful ghosts and residual right-end cream→navy", () => {
    const { source, output } = runFixturePipeline();
    const pkg = scoreStillPair(source, output, "fixture_1k", false, STAGE1K_CANONICAL.bandQuad);
    const passed = pkg.report.criteria.filter((c) => c.verdict === "PASS").map((c) => c.id);
    const failed = pkg.report.criteria.filter((c) => c.verdict === "FAIL").map((c) => c.id);
    expect(passed).toEqual([1, 3, 4, 5, 7, 8, 9, 10, 11]);
    expect(failed).toEqual([2, 6]);
    expect(pkg.report.passCount).toBe(9);
    const c9 = pkg.report.criteria.find((c) => c.id === 9)!;
    expect(c9.metrics.ghostRatio).toBeLessThan(GHOST_RATIO_PASS_CEILING);
    expect(pkg.extras.sleeveCornerDarkened).toBe(0);
    expect(pkg.extras.rightEndCreamToNavy).toBeGreaterThan(0);
    expect(pkg.extras.rightEndCreamToNavy).toBeLessThan(STAGE1J_LIVE_VERIFIED.rightEndCreamToNavy);
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
