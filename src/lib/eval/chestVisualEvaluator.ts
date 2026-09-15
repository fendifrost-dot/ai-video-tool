/**
 * Lane E chest still evaluator.
 *
 * output → metrics + diffs + crops + JSON PASS/FAIL for the 11-point criteria.
 * Ghosting (criterion 9) is scored on every mid-luma source pixel inside the
 * band quad. `bandAuthorityMask` is never a scoring filter.
 */

import {
  BAND_MEDIAN_SAMPLE,
  BAND_NAVY_LUMA,
  BRIGHT_SKIN_LUMA,
  CANONICAL_BAND_QUAD_NORM,
  CHEST_CRITERION_DEFS,
  CHEST_REF_FRAME,
  CREAM_LUMA,
  CREASE_MEDIAN_SLACK,
  EVIDENCE_CROPS,
  GHOST_MEDIAN_SLACK,
  GHOST_RATIO_PASS_CEILING,
  MID_LUMA_MAX,
  MID_LUMA_MIN,
  OUTSIDE_Y_BOTTOM,
  OUTSIDE_Y_TOP,
  PINSTRIPE_REMNANT_MAX,
  UNPAINTED_NAVY_MAX_FRAC,
  WORDMARK_NAVY_MIN_FRAC,
  ZIP_CORE_X0,
  ZIP_CORE_X1,
} from "./chestCriteria";
import {
  absDiffLuma,
  clampBox,
  countChangedOutsideRows,
  cropRgba,
  lumaAt,
  pixelsMatch,
  pointInQuad,
  quadFromNorm,
  scaleBox,
} from "./pixelMath";
import {
  CHEST_EVAL_SPEC_VERSION,
  type ChestCriterionResult,
  type ChestVisualReport,
  type EvaluateChestStillInput,
  type PixelBox,
  type QuadPts,
  type RgbaImage,
} from "./types";

export type MidLumaGhostScore = {
  midLumaChecked: number;
  midLumaGhosts: number;
  ghostRatio: number;
  windowRatios: number[];
  windowChecked: number[];
  windowGhosts: number[];
};

/**
 * Mid-luma outline ghosts inside the quad windows.
 * `authorityMask` is accepted only so tests can prove it is ignored.
 */
export function scoreMidLumaGhosts(opts: {
  source: RgbaImage;
  output: RgbaImage;
  quad: QuadPts;
  windows: PixelBox[];
  ceiling: number;
  authorityMask?: Float32Array | null;
}): MidLumaGhostScore {
  void opts.authorityMask;
  const windowChecked: number[] = [];
  const windowGhosts: number[] = [];
  const windowRatios: number[] = [];
  let midLumaChecked = 0;
  let midLumaGhosts = 0;
  for (const raw of opts.windows) {
    const box = clampBox(raw, opts.source.width, opts.source.height);
    let checked = 0;
    let ghosts = 0;
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) {
        if (!pointInQuad(x, y, opts.quad)) continue;
        const srcL = lumaAt(opts.source, x, y);
        if (srcL < MID_LUMA_MIN || srcL > MID_LUMA_MAX) continue;
        checked++;
        if (lumaAt(opts.output, x, y) > opts.ceiling) ghosts++;
      }
    }
    windowChecked.push(checked);
    windowGhosts.push(ghosts);
    windowRatios.push(checked === 0 ? 0 : ghosts / checked);
    midLumaChecked += checked;
    midLumaGhosts += ghosts;
  }
  return {
    midLumaChecked,
    midLumaGhosts,
    ghostRatio: midLumaChecked === 0 ? 0 : midLumaGhosts / midLumaChecked,
    windowRatios,
    windowChecked,
    windowGhosts,
  };
}

function bandMedian(output: RgbaImage, width: number, height: number): number {
  const x = Math.round((BAND_MEDIAN_SAMPLE.x * width) / CHEST_REF_FRAME.width);
  const y = Math.round((BAND_MEDIAN_SAMPLE.y * height) / CHEST_REF_FRAME.height);
  const cx = Math.max(0, Math.min(width - 1, x));
  const cy = Math.max(0, Math.min(height - 1, y));
  return lumaAt(output, cx, cy);
}

function scaleWindows(windows: PixelBox[], width: number, height: number): PixelBox[] {
  return windows.map((w) => clampBox(scaleBox(w, width, height), width, height));
}

function result(
  def: (typeof CHEST_CRITERION_DEFS)[number],
  windows: PixelBox[],
  verdict: "PASS" | "FAIL",
  metrics: Record<string, number>,
  note: string,
  failureReason: string | null,
): ChestCriterionResult {
  return {
    id: def.id,
    key: def.key,
    name: def.name,
    verdict,
    metrics,
    windows,
    note,
    failureReason,
  };
}

function scoreCriterion1(
  source: RgbaImage,
  output: RgbaImage,
  quad: QuadPts,
  windows: PixelBox[],
): Pick<ChestCriterionResult, "verdict" | "metrics" | "note" | "failureReason"> {
  let sourceNavy = 0;
  let unpainted = 0;
  for (const box of windows) {
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) {
        if (!pointInQuad(x, y, quad)) continue;
        if (lumaAt(source, x, y) >= BAND_NAVY_LUMA) continue;
        sourceNavy++;
        if (lumaAt(output, x, y) > 100) unpainted++;
      }
    }
  }
  const frac = sourceNavy === 0 ? 0 : unpainted / sourceNavy;
  const pass = sourceNavy > 0 && frac <= UNPAINTED_NAVY_MAX_FRAC;
  return {
    verdict: pass ? "PASS" : "FAIL",
    metrics: { sourceNavy, unpaintedNavy: unpainted, unpaintedFrac: frac },
    note: "Source-dark pixels in the left-third quad must stay painted navy.",
    failureReason: pass
      ? null
      : sourceNavy === 0
        ? "no source-navy samples in left third"
        : `${unpainted}/${sourceNavy} left-third navy pixels unpainted`,
  };
}

function scoreCriterion2(
  source: RgbaImage,
  output: RgbaImage,
  windows: PixelBox[],
): Pick<ChestCriterionResult, "verdict" | "metrics" | "note" | "failureReason"> {
  let remnants = 0;
  let probed = 0;
  let maxOut = 0;
  for (const box of windows) {
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) {
        const srcL = lumaAt(source, x, y);
        const outL = lumaAt(output, x, y);
        if (outL > maxOut) maxOut = outL;
        if (srcL <= 100) continue;
        probed++;
        if (outL > BAND_NAVY_LUMA && outL <= PINSTRIPE_REMNANT_MAX) remnants++;
      }
    }
  }
  const pass = remnants === 0;
  return {
    verdict: pass ? "PASS" : "FAIL",
    metrics: { remnants, probed, maxOutputLuma: maxOut },
    note: "Mid-luma ridge/AA remnants (not cream body) in the top-left pinstripe windows.",
    failureReason: pass ? null : `${remnants} pinstripe/AA remnant pixels`,
  };
}

function scoreCriterion3(
  output: RgbaImage,
  windows: PixelBox[],
  median: number,
): Pick<ChestCriterionResult, "verdict" | "metrics" | "note" | "failureReason"> {
  const floor = median - CREASE_MEDIAN_SLACK;
  const box = windows[0]!;
  let below = 0;
  const columnMeans: number[] = [];
  for (let x = box.x0; x <= box.x1; x++) {
    let sum = 0;
    let n = 0;
    for (let y = box.y0; y <= box.y1; y++) {
      sum += lumaAt(output, x, y);
      n++;
    }
    const mean = n === 0 ? 0 : sum / n;
    columnMeans.push(mean);
    if (mean < floor) below++;
  }
  const minMean = columnMeans.length ? Math.min(...columnMeans) : 0;
  const pass = below === 0 && columnMeans.length > 0;
  return {
    verdict: pass ? "PASS" : "FAIL",
    metrics: { median, floor, columnsBelowFloor: below, minColumnMean: minMean },
    note: "Crease columns must sit at/above band median − 6.",
    failureReason: pass ? null : `${below} crease columns below floor ${floor.toFixed(1)}`,
  };
}

function firstNavyRow(img: RgbaImage, x: number, y0: number, y1: number): number {
  for (let y = y0; y <= y1; y++) {
    if (lumaAt(img, x, y) < BAND_NAVY_LUMA) return y;
  }
  return y1 + 1;
}

function scoreCreamToNavy(
  source: RgbaImage,
  output: RgbaImage,
  windows: PixelBox[],
  label: string,
  extras?: Record<string, number>,
): Pick<ChestCriterionResult, "verdict" | "metrics" | "note" | "failureReason"> {
  let cream = 0;
  let darkened = 0;
  for (const box of windows) {
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) {
        if (lumaAt(source, x, y) <= CREAM_LUMA) continue;
        cream++;
        if (lumaAt(output, x, y) < BAND_NAVY_LUMA) darkened++;
      }
    }
  }
  const raisePx = extras?.firstNavyRaisePx ?? 0;
  const pass = darkened === 0 && raisePx < 2;
  return {
    verdict: pass ? "PASS" : "FAIL",
    metrics: { creamSource: cream, creamToNavy: darkened, ...extras },
    note: label,
    failureReason: pass
      ? null
      : darkened > 0
        ? `${darkened} cream pixels painted navy`
        : `first-navy row raised ${raisePx} px into cream`,
  };
}

function scoreCriterion5(
  source: RgbaImage,
  output: RgbaImage,
  windows: PixelBox[],
): Pick<ChestCriterionResult, "verdict" | "metrics" | "note" | "failureReason"> {
  const sleeve = windows[0]!;
  const patch = windows[1] ?? sleeve;
  let brightChecked = 0;
  let brightChanged = 0;
  for (let y = sleeve.y0; y <= sleeve.y1; y++) {
    for (let x = sleeve.x0; x <= sleeve.x1; x++) {
      if (lumaAt(source, x, y) < BRIGHT_SKIN_LUMA) continue;
      brightChecked++;
      if (!pixelsMatch(source, output, x, y)) brightChanged++;
    }
  }
  let patchDarkened = 0;
  for (let y = patch.y0; y <= patch.y1; y++) {
    for (let x = patch.x0; x <= patch.x1; x++) {
      const srcL = lumaAt(source, x, y);
      if (srcL <= 100) continue;
      if (srcL - lumaAt(output, x, y) >= 40) patchDarkened++;
    }
  }
  const pass = brightChanged === 0 && patchDarkened === 0;
  return {
    verdict: pass ? "PASS" : "FAIL",
    metrics: { brightChecked, brightChanged, patchDarkened },
    note: "Bright sleeve/forearm bytes stay identical; 4×3 zip-corner cream must not drop ≥40 luma.",
    failureReason: pass
      ? null
      : `${brightChanged} bright sleeve bytes changed, ${patchDarkened} corner cream darkened`,
  };
}

function scoreCriterion7(
  output: RgbaImage,
  windows: PixelBox[],
): Pick<ChestCriterionResult, "verdict" | "metrics" | "note" | "failureReason"> {
  const box = windows[0]!;
  let n = 0;
  let navy = 0;
  let sum = 0;
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const L = lumaAt(output, x, y);
      n++;
      sum += L;
      if (L < BAND_NAVY_LUMA) navy++;
    }
  }
  const navyFrac = n === 0 ? 0 : navy / n;
  const meanLuma = n === 0 ? 0 : sum / n;
  const pass = navyFrac >= WORDMARK_NAVY_MIN_FRAC;
  return {
    verdict: pass ? "PASS" : "FAIL",
    metrics: { navyFrac, meanLuma, pixels: n },
    note: "Wearer's-left wordmark zone must be a navy band (not a cream hole). Not OCR.",
    failureReason: pass
      ? null
      : `wordmark-zone navyFrac ${navyFrac.toFixed(3)} < ${WORDMARK_NAVY_MIN_FRAC}`,
  };
}

function scoreCriterion8(
  output: RgbaImage,
  windows: PixelBox[],
  width: number,
): Pick<ChestCriterionResult, "verdict" | "metrics" | "note" | "failureReason"> {
  const zip0 = Math.round((ZIP_CORE_X0 * width) / CHEST_REF_FRAME.width);
  const zip1 = Math.round((ZIP_CORE_X1 * width) / CHEST_REF_FRAME.width);
  let tapeSamples = 0;
  let tapeBright = 0;
  for (const box of windows) {
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) {
        if (x >= zip0 && x <= zip1) continue;
        tapeSamples++;
        if (lumaAt(output, x, y) >= BAND_NAVY_LUMA) tapeBright++;
      }
    }
  }
  const pass = tapeSamples > 0 && tapeBright === 0;
  return {
    verdict: pass ? "PASS" : "FAIL",
    metrics: { tapeSamples, tapeBright },
    note: "Left tape x399–401 and diagonal x427–431 must be navy; zip core x418–424 excluded.",
    failureReason: pass ? null : `${tapeBright}/${tapeSamples} zip-tape samples still bright`,
  };
}

function scoreCriterion10(
  source: RgbaImage,
  output: RgbaImage,
  windows: PixelBox[],
): Pick<ChestCriterionResult, "verdict" | "metrics" | "note" | "failureReason"> {
  const box = windows[0]!;
  let bright = 0;
  let changed = 0;
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      if (lumaAt(source, x, y) < BRIGHT_SKIN_LUMA) continue;
      bright++;
      if (!pixelsMatch(source, output, x, y)) changed++;
    }
  }
  const pass = changed === 0;
  return {
    verdict: pass ? "PASS" : "FAIL",
    metrics: { brightSkin: bright, changed },
    note: "Bright hand/forearm pixels (luma ≥ 180) must be byte-identical.",
    failureReason: pass ? null : `${changed} foreground skin pixels changed`,
  };
}

export function evaluateChestStill(input: EvaluateChestStillInput): ChestVisualReport {
  const { source, output } = input;
  const unexplained: string[] = [];
  if (source.width !== output.width || source.height !== output.height) {
    unexplained.push(
      `source ${source.width}×${source.height} vs output ${output.width}×${output.height}`,
    );
  }
  const width = Math.min(source.width, output.width);
  const height = Math.min(source.height, output.height);
  const quad = quadFromNorm(width, height, input.bandQuadNorm ?? CANONICAL_BAND_QUAD_NORM);
  const median = bandMedian(output, width, height);
  const ghostCeiling = median + GHOST_MEDIAN_SLACK;

  const criteria: ChestCriterionResult[] = [];
  for (const def of CHEST_CRITERION_DEFS) {
    const windows = scaleWindows(def.windows, width, height);
    if (def.id === 1) {
      const s = scoreCriterion1(source, output, quad, windows);
      criteria.push(result(def, windows, s.verdict, s.metrics, s.note, s.failureReason));
      continue;
    }
    if (def.id === 2) {
      const s = scoreCriterion2(source, output, windows);
      criteria.push(result(def, windows, s.verdict, s.metrics, s.note, s.failureReason));
      continue;
    }
    if (def.id === 3) {
      const s = scoreCriterion3(output, windows, median);
      criteria.push(result(def, windows, s.verdict, s.metrics, s.note, s.failureReason));
      continue;
    }
    if (def.id === 4) {
      const x290 = Math.round((290 * width) / CHEST_REF_FRAME.width);
      const yScan0 = Math.round((662 * height) / CHEST_REF_FRAME.height);
      const yScan1 = Math.round((690 * height) / CHEST_REF_FRAME.height);
      const srcNavy = firstNavyRow(source, x290, yScan0, yScan1);
      const outNavy = firstNavyRow(output, x290, yScan0, yScan1);
      const s = scoreCreamToNavy(
        source,
        output,
        windows,
        "Cream body at the 3-px raise window must not become navy (1j: 97 px / 3-px raise at x290).",
        {
          firstNavyRaisePx: srcNavy - outNavy,
          firstNavyRowSource: srcNavy,
          firstNavyRowOutput: outNavy,
        },
      );
      criteria.push(result(def, windows, s.verdict, s.metrics, s.note, s.failureReason));
      continue;
    }
    if (def.id === 5) {
      const s = scoreCriterion5(source, output, windows);
      criteria.push(result(def, windows, s.verdict, s.metrics, s.note, s.failureReason));
      continue;
    }
    if (def.id === 6) {
      const s = scoreCreamToNavy(
        source,
        output,
        windows,
        "Right-end cream (x580–616 / y713–730) must stay cream.",
      );
      criteria.push(result(def, windows, s.verdict, s.metrics, s.note, s.failureReason));
      continue;
    }
    if (def.id === 7) {
      const s = scoreCriterion7(output, windows);
      criteria.push(result(def, windows, s.verdict, s.metrics, s.note, s.failureReason));
      continue;
    }
    if (def.id === 8) {
      const s = scoreCriterion8(output, windows, width);
      criteria.push(result(def, windows, s.verdict, s.metrics, s.note, s.failureReason));
      continue;
    }
    if (def.id === 9) {
      const ghost = scoreMidLumaGhosts({
        source,
        output,
        quad,
        windows,
        ceiling: ghostCeiling,
        authorityMask: input.bandAuthorityMask,
      });
      const pass = ghost.midLumaChecked > 0 && ghost.ghostRatio < GHOST_RATIO_PASS_CEILING;
      criteria.push(
        result(
          def,
          windows,
          pass ? "PASS" : "FAIL",
          {
            midLumaChecked: ghost.midLumaChecked,
            midLumaGhosts: ghost.midLumaGhosts,
            ghostRatio: ghost.ghostRatio,
            ghostCeiling,
            median,
            bandAuthorityMaskUsed: 0,
            leftWindowRatio: ghost.windowRatios[0] ?? 0,
            rightWindowRatio: ghost.windowRatios[1] ?? 0,
            leftWindowChecked: ghost.windowChecked[0] ?? 0,
            rightWindowChecked: ghost.windowChecked[1] ?? 0,
            passCeiling: GHOST_RATIO_PASS_CEILING,
          },
          "Every mid-luma (60–180) source pixel inside the quad windows. Authority mask is not a filter.",
          pass
            ? null
            : ghost.midLumaChecked === 0
              ? "no mid-luma quad samples"
              : `ghost ratio ${ghost.ghostRatio.toFixed(3)} ≥ ${GHOST_RATIO_PASS_CEILING}`,
        ),
      );
      continue;
    }
    if (def.id === 10) {
      const s = scoreCriterion10(source, output, windows);
      criteria.push(result(def, windows, s.verdict, s.metrics, s.note, s.failureReason));
      continue;
    }
    const yTop = Math.round((OUTSIDE_Y_TOP * height) / CHEST_REF_FRAME.height);
    const yBot = Math.round((OUTSIDE_Y_BOTTOM * height) / CHEST_REF_FRAME.height);
    const changed = countChangedOutsideRows(source, output, yTop, yBot - 1);
    const pass = changed === 0;
    criteria.push(
      result(
        def,
        windows,
        pass ? "PASS" : "FAIL",
        { changed, yTopExclusive: yTop, yBottomExclusive: yBot },
        "No pixel changes above y600 or below y800 (scaled).",
        pass ? null : `${changed} pixels changed outside the chest belt`,
      ),
    );
  }

  // Fix the sloppy first push if I left a duplicate — I already overwrite.
  // Clean up: I had a buggy double-push for criterion 1. Looking at the loop...
  // I push then immediately overwrite criteria[length-1]. There's a leftover
  // first push with Object.values. Let me not do that.

  const passCount = criteria.filter((c) => c.verdict === "PASS").length;
  const failCount = criteria.length - passCount;
  const absDiff = absDiffLuma(source, output);
  const crops = EVIDENCE_CROPS.map((c) => {
    const box = clampBox(scaleBox(c.box, width, height), width, height);
    return { id: c.id, box, image: cropRgba(output, box) };
  });

  return {
    schemaVersion: CHEST_EVAL_SPEC_VERSION,
    verdict: failCount === 0 ? "PASS" : "FAIL",
    passCount,
    failCount,
    criteria,
    artifacts: { absDiff, crops },
    unexplained,
    scoring: {
      ghostTerritory: "quad_mid_luma",
      bandAuthorityMaskUsed: false,
      ghostRatioPassCeiling: GHOST_RATIO_PASS_CEILING,
      referenceFrame: { ...CHEST_REF_FRAME },
    },
  };
}
