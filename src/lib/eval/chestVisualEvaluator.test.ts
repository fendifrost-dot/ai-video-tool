import { describe, expect, it } from "vitest";
import {
  applyLowFrequencyBandIllumination,
  coverTargetQuad,
  overlayZipFromSource,
  type QuadPts,
} from "@/lib/garment/logoComposite";
import {
  applyChestLocalOcclusionSemantics,
  applyOcclusionAlphaComposite,
  featherAlpha,
} from "@/lib/garment/stillRepairOcclusion";
import { buildStage1hSam3EvidenceAlphas } from "@/lib/garment/fixtures/architectureCStill1hSam3Evidence";
import {
  ARCHITECTURE_C_BAND_CROP,
  embedArchitectureCBandCropInFrame,
} from "@/lib/garment/fixtures/architectureCStillBandCrop";
import {
  CANONICAL_BAND_QUAD_NORM,
  CHEST_CRITERION_DEFS,
  GHOST_RATIO_PASS_CEILING,
} from "./chestCriteria";
import { STAGE1J_LIVE_VERIFIED } from "./stage1jEvidence";
import { STAGE1K_LIVE_VERIFIED } from "./stage1kEvidence";
import { STAGE1L_LIVE_VERIFIED } from "./stage1lEvidence";
import { evaluateChestStill, scoreMidLumaGhosts } from "./chestVisualEvaluator";
import { cloneRgba, fillRect, lumaAt, pointInQuad, quadFromNorm, solidRgba } from "./pixelMath";
import { CHEST_EVAL_SPEC_VERSION, type ChestCriterionId, type RgbaImage } from "./types";
import {
  chestEvalReportToJson,
  formatChestEvalSummary,
  materializeChestEvalFiles,
} from "./visualArtifacts";

const NAVY = [28, 32, 95] as const;
const CREAM = [200, 185, 165] as const;
const MID = [110, 105, 100] as const;

function setRgb(img: RgbaImage, x: number, y: number, rgb: readonly [number, number, number]) {
  const i = (y * img.width + x) * 4;
  img.data[i] = rgb[0];
  img.data[i + 1] = rgb[1];
  img.data[i + 2] = rgb[2];
  img.data[i + 3] = 255;
}

function paintQuad(
  img: RgbaImage,
  quad: QuadPts,
  rgb: readonly [number, number, number],
  skip?: (x: number, y: number) => boolean,
) {
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (!pointInQuad(x, y, quad)) continue;
      if (skip?.(x, y)) continue;
      setRgb(img, x, y, rgb);
    }
  }
}

function rightEndCream(x: number, y: number): boolean {
  return x >= 580 && x <= 616 && y >= 713 && y <= 730;
}

function handSkin(x: number, y: number): boolean {
  return x >= 330 && x <= 380 && y >= 738 && y <= 742;
}

function skipPaint(x: number, y: number): boolean {
  return rightEndCream(x, y) || handSkin(x, y);
}

/** Deterministic all-PASS pair on the canonical 720×1280 geometry. */
function allPassPair(): { source: RgbaImage; output: RgbaImage; quad: QuadPts } {
  const source = solidRgba(720, 1280, ...CREAM);
  const quad = quadFromNorm(720, 1280, CANONICAL_BAND_QUAD_NORM);
  paintQuad(source, quad, NAVY, skipPaint);
  // Mid-luma glyphs / tapes / ridge in source (failure territory if left unpainted).
  fillRect(source, { x0: 270, x1: 320, y0: 698, y1: 708 }, ...MID);
  fillRect(source, { x0: 460, x1: 520, y0: 710, y1: 728 }, ...MID);
  fillRect(source, { x0: 399, x1: 401, y0: 715, y1: 735 }, ...MID);
  fillRect(source, { x0: 427, x1: 431, y0: 715, y1: 715 }, ...MID);
  fillRect(source, { x0: 220, x1: 250, y0: 676, y1: 679 }, ...MID);
  const output = cloneRgba(source);
  paintQuad(output, quad, NAVY, skipPaint);
  fillRect(output, { x0: 220, x1: 250, y0: 676, y1: 679 }, ...NAVY);
  return { source, output, quad };
}

function criterion(report: ReturnType<typeof evaluateChestStill>, id: ChestCriterionId) {
  const c = report.criteria.find((row) => row.id === id);
  if (!c) throw new Error(`missing criterion ${id}`);
  return c;
}

describe("Lane E chest visual evaluator", () => {
  it("exposes all 11 criteria and the isolated spec version", () => {
    expect(CHEST_CRITERION_DEFS.map((d) => d.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(CHEST_EVAL_SPEC_VERSION).toBe("lane-e-chest-eval-v1");
    expect(GHOST_RATIO_PASS_CEILING).toBe(0.05);
  });

  it("PASSes a constructed clean still and emits diffs + crops + JSON", () => {
    const { source, output } = allPassPair();
    const report = evaluateChestStill({
      source,
      output,
      bandAuthorityMask: new Float32Array(720 * 1280), // must be ignored
    });
    expect(report.verdict).toBe("PASS");
    expect(report.passCount).toBe(11);
    expect(report.failCount).toBe(0);
    expect(report.scoring.bandAuthorityMaskUsed).toBe(false);
    expect(report.scoring.ghostTerritory).toBe("quad_mid_luma");
    expect(report.artifacts.crops.map((c) => c.id)).toEqual([
      "chest_compare",
      "pinstripe_topleft",
      "crease_lettering",
      "right_top_edge",
      "sleeve_zip_bottom",
      "centre_wedge",
    ]);
    expect(report.artifacts.absDiff.width).toBe(720);
    expect(report.artifacts.crops[0]!.image.width).toBeGreaterThan(10);

    const json = chestEvalReportToJson(report);
    expect(json.verdict).toBe("PASS");
    expect(json.criteria).toHaveLength(11);
    expect(json.scoring.bandAuthorityMaskUsed).toBe(false);
    const files = materializeChestEvalFiles(report);
    expect(ArrayBuffer.isView(files["report.json"])).toBe(true);
    expect(files["report.json"]!.byteLength).toBeGreaterThan(20);
    expect(new TextDecoder().decode(files["report.json"]!)).toContain('"verdict": "PASS"');
    expect(files["abs_diff.bmp"]![0]).toBe(0x42);
    expect(files["abs_diff.bmp"]![1]).toBe(0x4d);
    expect(files["chest_compare.ppm"]![0]).toBe(0x50); // P
    expect(formatChestEvalSummary(report)).toContain("11/11");
  });

  it("scores ghosting in real failure territory, not through bandAuthorityMask", () => {
    const source = solidRgba(720, 1280, ...CREAM);
    const quad = quadFromNorm(720, 1280, CANONICAL_BAND_QUAD_NORM);
    paintQuad(source, quad, NAVY, rightEndCream);
    // 100 mid-luma AA pixels inside the left lettering window + quad.
    const aa: Array<[number, number]> = [];
    for (let y = 698; y <= 707; y++) {
      for (let x = 280; x <= 289; x++) {
        if (!pointInQuad(x, y, quad)) continue;
        setRgb(source, x, y, MID);
        aa.push([x, y]);
      }
    }
    expect(aa.length).toBe(100);

    const output = cloneRgba(source);
    const mask = new Float32Array(720 * 1280);
    // Paint / authorize only 20 AA pixels — the old filter would skip the other 80.
    aa.forEach(([x, y], i) => {
      if (i < 20) {
        setRgb(output, x, y, NAVY);
        mask[y * 720 + x] = 1;
      }
    });

    const report = evaluateChestStill({ source, output, bandAuthorityMask: mask });
    const c9 = criterion(report, 9);
    expect(c9.metrics.bandAuthorityMaskUsed).toBe(0);
    expect(c9.metrics.midLumaChecked).toBe(100);
    expect(c9.metrics.midLumaGhosts).toBe(80);
    expect(c9.metrics.ghostRatio).toBeCloseTo(0.8, 5);
    expect(c9.verdict).toBe("FAIL");
    expect(report.verdict).toBe("FAIL");

    const unfiltered = scoreMidLumaGhosts({
      source,
      output,
      quad,
      windows: c9.windows,
      ceiling: c9.metrics.ghostCeiling,
      authorityMask: mask,
    });
    expect(unfiltered.midLumaChecked).toBe(100);

    // Reproduce the old (buggy) filter: it hides the 80 ghosts.
    let filteredChecked = 0;
    let filteredGhosts = 0;
    for (const [x, y] of aa) {
      if (mask[y * 720 + x]! < 0.5) continue;
      filteredChecked++;
      if (lumaAt(output, x, y) > c9.metrics.ghostCeiling) filteredGhosts++;
    }
    expect(filteredChecked).toBe(20);
    expect(filteredGhosts).toBe(0);
    expect(filteredGhosts / filteredChecked).toBeLessThan(0.25);
    expect(unfiltered.midLumaChecked).toBeGreaterThan(filteredChecked);
  });

  it("FAILS ordinary deterministic defects without marking them unexplained", () => {
    const { source, output } = allPassPair();
    // C4 / C6: cream → navy in the known windows.
    fillRect(output, { x0: 280, x1: 330, y0: 673, y1: 676 }, ...NAVY);
    fillRect(output, { x0: 580, x1: 616, y0: 713, y1: 730 }, ...NAVY);
    // C11: paint a pixel in the face belt.
    setRgb(output, 10, 10, NAVY);
    const report = evaluateChestStill({ source, output });
    expect(criterion(report, 4).verdict).toBe("FAIL");
    expect(criterion(report, 6).verdict).toBe("FAIL");
    expect(criterion(report, 11).verdict).toBe("FAIL");
    expect(report.unexplained).toEqual([]);
    expect(report.verdict).toBe("FAIL");
  });

  it("detects pinstripe remnants, unpainted left-third, surviving tapes, and skin writes", () => {
    const { source, output } = allPassPair();
    // C2 remnant
    fillRect(output, { x0: 220, x1: 230, y0: 676, y1: 676 }, ...MID);
    // C1: restore cream over left-third navy
    fillRect(output, { x0: 220, x1: 250, y0: 700, y1: 720 }, ...CREAM);
    // C8: leave left tape mid-luma
    fillRect(output, { x0: 399, x1: 401, y0: 715, y1: 715 }, ...MID);
    // C5 / C10: write bright cream below the band (y 752 is outside the quad).
    setRgb(output, 350, 752, [10, 10, 10]);
    setRgb(output, 350, 740, [10, 10, 10]);
    const report = evaluateChestStill({ source, output });
    expect(criterion(report, 2).verdict).toBe("FAIL");
    expect(criterion(report, 1).verdict).toBe("FAIL");
    expect(criterion(report, 8).verdict).toBe("FAIL");
    expect(criterion(report, 5).verdict).toBe("FAIL");
    expect(criterion(report, 10).verdict).toBe("FAIL");
  });
});

const STAGE1J_COVER = {
  fillMode: "quad_navy_union" as const,
  columnFollow: false,
  maxExpandFrac: 0.05,
  featherPx: 3,
  navyUnionMarginPx: 12,
  navyDilatePx: 4,
  navyEdgeDilatePx: 2,
  bandCloseRadiusPx: 6,
  topPinstripeAbsorbPx: 5,
  zipStripFrac: 0,
};

/** Evaluate-only 1j fixture path. Does not change Architecture C algorithms. */
function runStage1jFixturePipeline() {
  const source = embedArchitectureCBandCropInFrame();
  const band = ARCHITECTURE_C_BAND_CROP.measuredBandQuadNorm.map(([nx, ny]) => ({
    x: nx * source.width,
    y: ny * source.height,
  })) as QuadPts;
  const covered = coverTargetQuad(source, band, STAGE1J_COVER);
  const shaded = applyLowFrequencyBandIllumination(source, covered, band);
  const withZip = overlayZipFromSource(source, shaded, band, 0.015, 0.5);
  const { outfitBasedAlpha, handsAlpha, faceAlpha } = buildStage1hSam3EvidenceAlphas(
    source.width,
    source.height,
  );
  const chestLocal = applyChestLocalOcclusionSemantics({
    width: source.width,
    height: source.height,
    outfitBasedAlpha,
    bandComponent: covered.bandAuthorityMask,
    handsAlpha,
    faceAlpha,
    dilatePx: 12,
  });
  const out = applyOcclusionAlphaComposite(
    source,
    withZip,
    featherAlpha(chestLocal, source.width, source.height, 2),
  );
  return { source, covered, out, band };
}

describe("Lane E vs Architecture C real-crop (read-only of paint)", () => {
  it("scores unfiltered mid-luma ghosts; mask filter still sees a smaller set", () => {
    const source = embedArchitectureCBandCropInFrame();
    const band = ARCHITECTURE_C_BAND_CROP.measuredBandQuadNorm.map(([nx, ny]) => ({
      x: nx * source.width,
      y: ny * source.height,
    })) as QuadPts;
    const covered = coverTargetQuad(source, band, STAGE1J_COVER);
    const report = evaluateChestStill({
      source,
      output: covered,
      bandQuadNorm: ARCHITECTURE_C_BAND_CROP.measuredBandQuadNorm,
      bandAuthorityMask: covered.bandAuthorityMask,
    });
    const c9 = criterion(report, 9);
    expect(c9.metrics.bandAuthorityMaskUsed).toBe(0);
    expect(c9.metrics.midLumaChecked).toBeGreaterThan(30);

    let filteredChecked = 0;
    let filteredGhosts = 0;
    const ceiling = c9.metrics.ghostCeiling;
    for (const box of c9.windows) {
      for (let y = box.y0; y <= box.y1; y++) {
        for (let x = box.x0; x <= box.x1; x++) {
          if (covered.bandAuthorityMask[y * source.width + x]! < 0.5) continue;
          const srcL = lumaAt(source, x, y);
          if (srcL < 60 || srcL > 180) continue;
          filteredChecked++;
          if (lumaAt(covered, x, y) > ceiling) filteredGhosts++;
        }
      }
    }
    // Stage 1l paints the previously rejected AA, so the authority-mask subset
    // can equal the unfiltered set. The lock is that the mask is not a filter.
    expect(c9.metrics.midLumaChecked).toBeGreaterThanOrEqual(filteredChecked);
    if (filteredChecked > 0) {
      expect(filteredGhosts / filteredChecked).toBeLessThan(0.25);
    }
    expect(c9.verdict).toBe("PASS");
    expect(c9.metrics.ghostRatio).toBeLessThan(GHOST_RATIO_PASS_CEILING);
  });

  it("evaluates the real-crop fixture under Stage 1l paint (1j/1k live tables stay historical)", () => {
    const { source, covered, out } = runStage1jFixturePipeline();
    const report = evaluateChestStill({
      source,
      output: out,
      bandQuadNorm: ARCHITECTURE_C_BAND_CROP.measuredBandQuadNorm,
      bandAuthorityMask: covered.bandAuthorityMask,
    });
    const passed = report.criteria.filter((c) => c.verdict === "PASS").map((c) => c.id);
    const failed = report.criteria.filter((c) => c.verdict === "FAIL").map((c) => c.id);
    // Stage 1l fixture+cover+occlusion: 11/11. 1k live remaining FAILs (C2/C4/C6/C9)
    // are asserted to PASS here — those assertions would fail on 1k paint.
    expect(passed).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(failed).toEqual([]);
    expect(STAGE1J_LIVE_VERIFIED.pass).toEqual([1, 3, 7, 10, 11]);
    expect(STAGE1J_LIVE_VERIFIED.fail).toEqual([2, 4, 5, 6, 8, 9]);
    // Canonical live 1k (c9c4efee) is 7/11 — do not collapse live vs fixture.
    expect(STAGE1K_LIVE_VERIFIED.pass).toEqual([1, 3, 5, 7, 8, 10, 11]);
    expect(STAGE1K_LIVE_VERIFIED.fail).toEqual([2, 4, 6, 9]);
    expect(STAGE1K_LIVE_VERIFIED.gate).toBe("NOT_CLEARED");
    // Canonical live 1l (9eaf0c55) is 10/11 — C2/C4/C6 cleared; C9-right remains.
    expect(STAGE1L_LIVE_VERIFIED.pass).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 10, 11]);
    expect(STAGE1L_LIVE_VERIFIED.fail).toEqual([9]);
    expect(STAGE1L_LIVE_VERIFIED.gate).toBe("NOT_CLEARED");
    expect(STAGE1L_LIVE_VERIFIED.ghostRatiosUnfiltered.combined).toBeGreaterThan(
      GHOST_RATIO_PASS_CEILING,
    );
    expect(STAGE1L_LIVE_VERIFIED.ghostRatiosUnfiltered.right).toBeCloseTo(0.261, 3);

    const c2 = criterion(report, 2);
    const c4 = criterion(report, 4);
    const c5 = criterion(report, 5);
    const c6 = criterion(report, 6);
    const c9 = criterion(report, 9);
    expect(c2.metrics.remnants).toBe(0);
    expect(c2.metrics.remnants).toBeLessThan(STAGE1K_LIVE_VERIFIED.pinstripeRemnants);
    expect(c4.metrics.creamToNavy).toBe(0);
    expect(c4.metrics.firstNavyRaisePx).toBeLessThan(2);
    expect(c5.metrics.patchDarkened).toBe(0);
    expect(c6.metrics.creamToNavy).toBe(0);
    expect(c6.metrics.creamToNavy).toBeLessThan(STAGE1K_LIVE_VERIFIED.rightEndCreamToNavy);
    expect(c9.metrics.bandAuthorityMaskUsed).toBe(0);
    expect(c9.metrics.ghostRatio).toBeLessThan(GHOST_RATIO_PASS_CEILING);
    expect(c9.metrics.rightWindowRatio).toBeLessThan(STAGE1K_LIVE_VERIFIED.ghostRatiosUnfiltered.right);
    expect(report.unexplained).toEqual([]);
    expect(formatChestEvalSummary(report)).toContain("PASS (11/11)");
  });
});
