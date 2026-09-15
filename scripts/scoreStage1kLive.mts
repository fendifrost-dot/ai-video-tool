/**
 * Stage 1k canonical live scorer (score-only).
 * Reads 720×1280 RGBA dumps + runs Lane E evaluateChestStill + 1d–1j forensic probes.
 *
 * Source JPEG **must** be decoded with ImageScript (edge `decodeToRgba`).
 * FFmpeg JPEG decode false-FAILs C5/C10/C11 (~859k px drift).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { evaluateChestStill } from "../src/lib/eval/chestVisualEvaluator";
import {
  chestEvalReportToJson,
  formatChestEvalSummary,
  materializeChestEvalFiles,
} from "../src/lib/eval/visualArtifacts";
import { CANONICAL_BAND_QUAD_NORM, EVIDENCE_CROPS } from "../src/lib/eval/chestCriteria";
import { lumaAt, pixelsMatch, pointInQuad, quadFromNorm, rgbAt } from "../src/lib/eval/pixelMath";
import type { RgbaImage } from "../src/lib/eval/types";

const W = 720;
const H = 1280;
const DIR = process.env.AVT_1K_LIVE_DIR ?? "/tmp/avt-1k-live";
const OUT = process.env.AVT_1K_EVIDENCE_DIR ?? "/tmp/avt-1k-evidence";

function loadRgba(path: string): RgbaImage {
  const data = new Uint8Array(readFileSync(path));
  if (data.byteLength !== W * H * 4) {
    throw new Error(`${path} size ${data.byteLength} != ${W * H * 4}`);
  }
  return { width: W, height: H, data };
}

function countChanged(a: RgbaImage, b: RgbaImage): { n: number; x0: number; x1: number; y0: number; y1: number } {
  let n = 0;
  let x0 = W;
  let x1 = 0;
  let y0 = H;
  let y1 = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (pixelsMatch(a, b, x, y)) continue;
      n++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { n, x0, x1, y0, y1 };
}

function countChangedThresh(a: RgbaImage, b: RgbaImage, thresh: number): number {
  let n = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [ar, ag, ab] = rgbAt(a, x, y);
      const [br, bg, bb] = rgbAt(b, x, y);
      const d = Math.max(Math.abs(ar - br), Math.abs(ag - bg), Math.abs(ab - bb));
      if (d > thresh) n++;
    }
  }
  return n;
}

function midLumaInteriorUnpainted(source: RgbaImage, output: RgbaImage): {
  mid: number;
  unpainted: number;
  brightUnpainted: number;
} {
  const quad = quadFromNorm(W, H, CANONICAL_BAND_QUAD_NORM);
  let mid = 0;
  let unpainted = 0;
  let brightUnpainted = 0;
  for (let y = 678; y <= 749; y++) {
    for (let x = 216; x <= 621; x++) {
      if (!pointInQuad(x, y, quad)) continue;
      const srcL = lumaAt(source, x, y);
      const outL = lumaAt(output, x, y);
      if (srcL >= 60 && srcL <= 180) {
        mid++;
        if (Math.abs(outL - srcL) < 8 && outL > 80) unpainted++;
      }
      if (srcL > 180 && outL > 80 && Math.abs(outL - srcL) < 8) brightUnpainted++;
    }
  }
  return { mid, unpainted, brightUnpainted };
}

function creamToNavy(source: RgbaImage, output: RgbaImage, x0: number, x1: number, y0: number, y1: number, cream = 140, navy = 80): number {
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (lumaAt(source, x, y) > cream && lumaAt(output, x, y) < navy) n++;
    }
  }
  return n;
}

function patchDarkened(source: RgbaImage, output: RgbaImage, x0: number, x1: number, y0: number, y1: number, drop = 40): number {
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const srcL = lumaAt(source, x, y);
      if (srcL <= 100) continue;
      if (srcL - lumaAt(output, x, y) >= drop) n++;
    }
  }
  return n;
}

function sampleRow(img: RgbaImage, y: number, xs: number[]): number[] {
  return xs.map((x) => Math.round(lumaAt(img, x, y)));
}

const source = loadRgba(`${DIR}/clean_2aa1a44c.rgba`);
const out1j = loadRgba(`${DIR}/stage1j_fb8117ee.rgba`);
const out1k = loadRgba(`${DIR}/stage1k_c9c4efee.rgba`);

const report1k = evaluateChestStill({
  source,
  output: out1k,
  bandQuadNorm: CANONICAL_BAND_QUAD_NORM,
  bandAuthorityMask: new Float32Array(W * H),
});
const report1j = evaluateChestStill({
  source,
  output: out1j,
  bandQuadNorm: CANONICAL_BAND_QUAD_NORM,
  bandAuthorityMask: new Float32Array(W * H),
});

const vsClean = countChanged(source, out1k);
const vs1j = countChanged(out1j, out1k);
const vs1jGt8 = countChangedThresh(out1j, out1k, 8);
const outsideTop = (() => {
  let n = 0;
  for (let y = 0; y < 600; y++) for (let x = 0; x < W; x++) if (!pixelsMatch(source, out1k, x, y)) n++;
  return n;
})();
const outsideBot = (() => {
  let n = 0;
  for (let y = 800; y < H; y++) for (let x = 0; x < W; x++) if (!pixelsMatch(source, out1k, x, y)) n++;
  return n;
})();

const interior = midLumaInteriorUnpainted(source, out1k);
const interior1j = midLumaInteriorUnpainted(source, out1j);
const c9 = report1k.criteria.find((c) => c.id === 9)!;
const median = c9.metrics.median;

const probes = {
  assetId: "c9c4efee-6bd2-450f-a9e4-b70fb9b722bb",
  vsClean,
  vs1j: { ...vs1j, gt8: vs1jGt8 },
  outsideTop,
  outsideBot,
  bandCoreMedianLuma: median,
  midLumaInterior: { live1k: interior, live1j: interior1j },
  creamRaise_x280_330_y673_676: creamToNavy(source, out1k, 280, 330, 673, 676),
  creamRaise1j: creamToNavy(source, out1j, 280, 330, 673, 676),
  rightEndCreamToNavy: creamToNavy(source, out1k, 580, 616, 713, 730),
  rightEnd1j: creamToNavy(source, out1j, 580, 616, 713, 730),
  sleevePatchDarkened: patchDarkened(source, out1k, 389, 392, 746, 748),
  sleevePatch1j: patchDarkened(source, out1j, 389, 392, 746, 748),
  leftTape: {
    y715: sampleRow(out1k, 715, [399, 400, 401]),
    y735: sampleRow(out1k, 735, [399, 400, 401]),
    sourceY715: sampleRow(source, 715, [399, 400, 401]),
    live1j_y715: sampleRow(out1j, 715, [399, 400, 401]),
  },
  diagonalTape_y715: {
    live1k: sampleRow(out1k, 715, [427, 428, 430, 431]),
    live1j: sampleRow(out1j, 715, [427, 428, 430, 431]),
    source: sampleRow(source, 715, [427, 428, 430, 431]),
  },
  pinstripe: {
    row676_x208_213: sampleRow(out1k, 676, [208, 209, 210, 211, 212, 213]),
    row676_x256_262: sampleRow(out1k, 676, [256, 257, 258, 259, 260, 261, 262]),
    row679_x228_239: sampleRow(out1k, 679, [228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239]),
    row676_1j: sampleRow(out1j, 676, [208, 209, 210, 211, 212, 213, 256, 257, 258, 259, 260, 261, 262]),
    source676: sampleRow(source, 676, [208, 209, 210, 211, 212, 213, 256, 257, 258, 259, 260, 261, 262]),
  },
  creaseColMeans: [277, 278, 279, 280, 281, 282, 283].map((x) => {
    let s = 0;
    for (let y = 690; y <= 720; y++) s += lumaAt(out1k, x, y);
    return { x, mean: s / 31 };
  }),
  firstNavyRow_x290: {
    source: (() => {
      for (let y = 662; y <= 690; y++) if (lumaAt(source, 290, y) < 80) return y;
      return null;
    })(),
    live1k: (() => {
      for (let y = 662; y <= 690; y++) if (lumaAt(out1k, 290, y) < 80) return y;
      return null;
    })(),
    live1j: (() => {
      for (let y = 662; y <= 690; y++) if (lumaAt(out1j, 290, y) < 80) return y;
      return null;
    })(),
  },
};

mkdirSync(OUT, { recursive: true });
const files = materializeChestEvalFiles(report1k);
for (const [name, bytes] of Object.entries(files)) {
  writeFileSync(`${OUT}/${name}`, bytes);
}
const json = {
  live1k: chestEvalReportToJson(report1k),
  live1jRescore: {
    passCount: report1j.passCount,
    failCount: report1j.failCount,
    verdict: report1j.verdict,
    criteria: report1j.criteria.map((c) => ({
      id: c.id,
      key: c.key,
      verdict: c.verdict,
      metrics: c.metrics,
      failureReason: c.failureReason,
    })),
  },
  forensic: probes,
  summary1k: formatChestEvalSummary(report1k),
  summary1j: formatChestEvalSummary(report1j),
  evidenceCrops: EVIDENCE_CROPS,
};
writeFileSync(`${OUT}/stage1k_live_score.json`, `${JSON.stringify(json, null, 2)}\n`);
console.log(formatChestEvalSummary(report1k));
console.log("--- 1j rescore ---");
console.log(formatChestEvalSummary(report1j));
console.log("--- forensic ---");
console.log(JSON.stringify(probes, null, 2));
