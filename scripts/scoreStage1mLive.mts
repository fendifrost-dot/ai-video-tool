/**
 * Stage 1m canonical live scorer (score-only).
 * Reads ImageScript-decoded 720×1280 RGBA + runs Lane E evaluateChestStill.
 *
 * Source JPEG **must** be decoded with ImageScript 1.3.0 (edge `decodeToRgba`).
 * FFmpeg JPEG decode false-FAILs C5/C10/C11.
 *
 * Primary comparison is live 1l leftovers (C9-right). 1k/1j are historical rescores
 * on the same ruler. bandAuthorityMaskUsed must stay false on C9.
 */
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { evaluateChestStill } from "../src/lib/eval/chestVisualEvaluator";
import {
  chestEvalReportToJson,
  formatChestEvalSummary,
  materializeChestEvalFiles,
} from "../src/lib/eval/visualArtifacts";
import { CANONICAL_BAND_QUAD_NORM, EVIDENCE_CROPS } from "../src/lib/eval/chestCriteria";
import {
  cropRgba,
  encodePpm,
  lumaAt,
  pixelsMatch,
  pointInQuad,
  quadFromNorm,
  rgbAt,
} from "../src/lib/eval/pixelMath";
import type { PixelBox, RgbaImage } from "../src/lib/eval/types";

const require = createRequire(import.meta.url);
const { Image } = require("/tmp/avt-1m-tools/node_modules/imagescript/ImageScript.js") as {
  Image: {
    decode: (bytes: Uint8Array | Buffer) => Promise<{
      width: number;
      height: number;
      bitmap: Uint8Array;
    }>;
  };
};

const W = 720;
const H = 1280;
const DIR = process.env.AVT_1M_LIVE_DIR ?? "/tmp/avt-1m-live";
const OUT = process.env.AVT_1M_EVIDENCE_DIR ?? "/tmp/avt-1m-evidence";
const REPO_OUT =
  process.env.AVT_1M_REPO_EVIDENCE ??
  "docs/research/results/2026-09-04-still-repair";
const C9_RIGHT_LEFTOVER = { x0: 462, x1: 500, y0: 713, y1: 723 } as const;

async function decodeImage(path: string): Promise<RgbaImage> {
  const img = await Image.decode(readFileSync(path));
  if (img.width !== W || img.height !== H) {
    throw new Error(`${path} is ${img.width}×${img.height}, expected ${W}×${H}`);
  }
  return { width: img.width, height: img.height, data: new Uint8Array(img.bitmap) };
}

function countChanged(a: RgbaImage, b: RgbaImage): {
  n: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
} {
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

function midLumaInteriorUnpainted(
  source: RgbaImage,
  output: RgbaImage,
): { mid: number; unpainted: number; brightUnpainted: number } {
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

function creamToNavy(
  source: RgbaImage,
  output: RgbaImage,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  cream = 140,
  navy = 80,
): number {
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (lumaAt(source, x, y) > cream && lumaAt(output, x, y) < navy) n++;
    }
  }
  return n;
}

function patchDarkened(
  source: RgbaImage,
  output: RgbaImage,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  drop = 40,
): number {
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

function firstNavy(img: RgbaImage, x: number, y0 = 662, y1 = 690): number | null {
  for (let y = y0; y <= y1; y++) {
    if (lumaAt(img, x, y) < 80) return y;
  }
  return null;
}

function hstack(panels: RgbaImage[]): RgbaImage {
  const height = Math.max(...panels.map((p) => p.height));
  const width = panels.reduce((s, p) => s + p.width, 0);
  const data = new Uint8Array(width * height * 4);
  data.fill(255);
  let xOff = 0;
  for (const p of panels) {
    for (let y = 0; y < p.height; y++) {
      for (let x = 0; x < p.width; x++) {
        const si = (y * p.width + x) * 4;
        const di = (y * width + (xOff + x)) * 4;
        data[di] = p.data[si]!;
        data[di + 1] = p.data[si + 1]!;
        data[di + 2] = p.data[si + 2]!;
        data[di + 3] = 255;
      }
    }
    xOff += p.width;
  }
  return { width, height, data };
}

function labelBar(text: string, width: number, height = 22): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 12;
    data[i * 4 + 1] = 12;
    data[i * 4 + 2] = 12;
    data[i * 4 + 3] = 255;
  }
  void text;
  return { width, height, data };
}

function vstack(panels: RgbaImage[]): RgbaImage {
  const width = Math.max(...panels.map((p) => p.width));
  const height = panels.reduce((s, p) => s + p.height, 0);
  const data = new Uint8Array(width * height * 4);
  data.fill(255);
  let yOff = 0;
  for (const p of panels) {
    for (let y = 0; y < p.height; y++) {
      for (let x = 0; x < p.width; x++) {
        const si = (y * p.width + x) * 4;
        const di = ((yOff + y) * width + x) * 4;
        data[di] = p.data[si]!;
        data[di + 1] = p.data[si + 1]!;
        data[di + 2] = p.data[si + 2]!;
        data[di + 3] = 255;
      }
    }
    yOff += p.height;
  }
  return { width, height, data };
}

function writeJpg(img: RgbaImage, dest: string): void {
  const ppm = dest.replace(/\.jpg$/, ".ppm");
  writeFileSync(ppm, encodePpm(img));
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", ppm, "-q:v", "3", dest], {
    encoding: "utf8",
  });
  try {
    unlinkSync(ppm);
  } catch {
    /* optional */
  }
  if (r.status !== 0) {
    throw new Error(`ffmpeg jpg failed for ${dest}: ${r.stderr || r.stdout || r.status}`);
  }
}

function drawTextIntoBar(img: RgbaImage, text: string): void {
  // 5×7 bitmap font, white on the existing dark bar.
  const glyphs: Record<string, number[]> = {
    " ": [0, 0, 0, 0, 0],
    "0": [0x3e, 0x45, 0x49, 0x51, 0x3e],
    "1": [0x00, 0x21, 0x7f, 0x01, 0x00],
    "2": [0x21, 0x43, 0x45, 0x49, 0x31],
    "3": [0x42, 0x41, 0x51, 0x69, 0x46],
    "4": [0x0c, 0x14, 0x24, 0x7f, 0x04],
    "5": [0x72, 0x51, 0x51, 0x51, 0x4e],
    "6": [0x1e, 0x29, 0x49, 0x49, 0x06],
    "7": [0x40, 0x47, 0x48, 0x50, 0x60],
    "8": [0x36, 0x49, 0x49, 0x49, 0x36],
    "9": [0x30, 0x49, 0x49, 0x4a, 0x3c],
    a: [0x02, 0x15, 0x15, 0x15, 0x0f],
    c: [0x0e, 0x11, 0x11, 0x11, 0x0a],
    d: [0x3f, 0x08, 0x10, 0x10, 0x0f],
    e: [0x0e, 0x15, 0x15, 0x15, 0x0c],
    f: [0x08, 0x3f, 0x44, 0x40, 0x40],
    i: [0x00, 0x00, 0x2f, 0x00, 0x00],
    j: [0x00, 0x02, 0x01, 0x51, 0x3e],
    k: [0x00, 0x3f, 0x04, 0x0a, 0x11],
    l: [0x00, 0x41, 0x7f, 0x01, 0x00],
    n: [0x1f, 0x08, 0x10, 0x10, 0x0f],
    r: [0x1f, 0x08, 0x10, 0x10, 0x08],
    s: [0x09, 0x15, 0x15, 0x15, 0x12],
    t: [0x10, 0x3e, 0x11, 0x01, 0x02],
    v: [0x1c, 0x02, 0x01, 0x02, 0x1c],
    "|": [0x00, 0x00, 0x7f, 0x00, 0x00],
    "-": [0x04, 0x04, 0x04, 0x04, 0x04],
  };
  const scale = 2;
  let x = 4;
  const y0 = 4;
  for (const ch of text.toLowerCase()) {
    const g = glyphs[ch] ?? glyphs["-"]!;
    for (let col = 0; col < 5; col++) {
      const bits = g[col]!;
      for (let row = 0; row < 7; row++) {
        if (((bits >> (6 - row)) & 1) === 0) continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const xx = x + col * scale + dx;
            const yy = y0 + row * scale + dy;
            if (xx >= img.width || yy >= img.height) continue;
            const i = (yy * img.width + xx) * 4;
            img.data[i] = 235;
            img.data[i + 1] = 235;
            img.data[i + 2] = 235;
          }
        }
      }
    }
    x += 6 * scale;
  }
}

function labeledCrop(img: RgbaImage, box: PixelBox, label: string): RgbaImage {
  const crop = cropRgba(img, box);
  const bar = labelBar(label, crop.width);
  drawTextIntoBar(bar, label);
  return vstack([bar, crop]);
}

function leftoverGhosts(
  source: RgbaImage,
  output: RgbaImage,
  ceiling: number,
): { checked: number; ghosts: number; coords: Array<{ x: number; y: number; srcL: number; outL: number }> } {
  const quad = quadFromNorm(W, H, CANONICAL_BAND_QUAD_NORM);
  const coords: Array<{ x: number; y: number; srcL: number; outL: number }> = [];
  let checked = 0;
  for (let y = C9_RIGHT_LEFTOVER.y0; y <= C9_RIGHT_LEFTOVER.y1; y++) {
    for (let x = C9_RIGHT_LEFTOVER.x0; x <= C9_RIGHT_LEFTOVER.x1; x++) {
      if (!pointInQuad(x, y, quad)) continue;
      const srcL = lumaAt(source, x, y);
      if (srcL < 60 || srcL > 180) continue;
      checked++;
      const outL = lumaAt(output, x, y);
      if (outL > ceiling) coords.push({ x, y, srcL, outL });
    }
  }
  return { checked, ghosts: coords.length, coords };
}

function compactRescore(report: ReturnType<typeof evaluateChestStill>) {
  return {
    passCount: report.passCount,
    failCount: report.failCount,
    verdict: report.verdict,
    criteria: report.criteria.map((c) => ({
      id: c.id,
      key: c.key,
      verdict: c.verdict,
      metrics: c.metrics,
      failureReason: c.failureReason,
    })),
  };
}

const source = await decodeImage(`${DIR}/clean_2aa1a44c.jpg`);
const out1m = await decodeImage(`${DIR}/stage1m_9ed83c01.png`);
const out1l = await decodeImage(`${DIR}/stage1l_9eaf0c55.png`);
const out1k = await decodeImage(`${DIR}/stage1k_c9c4efee.png`);
const out1j = await decodeImage(`${DIR}/stage1j_fb8117ee.png`);

const report1m = evaluateChestStill({
  source,
  output: out1m,
  bandQuadNorm: CANONICAL_BAND_QUAD_NORM,
  bandAuthorityMask: new Float32Array(W * H),
});
const report1l = evaluateChestStill({
  source,
  output: out1l,
  bandQuadNorm: CANONICAL_BAND_QUAD_NORM,
  bandAuthorityMask: new Float32Array(W * H),
});
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

const vsClean = countChanged(source, out1m);
const vs1l = countChanged(out1l, out1m);
const vs1lGt8 = countChangedThresh(out1l, out1m, 8);
const vs1k = countChanged(out1k, out1m);
const vs1kGt8 = countChangedThresh(out1k, out1m, 8);
const outsideTop = (() => {
  let n = 0;
  for (let y = 0; y < 600; y++) for (let x = 0; x < W; x++) if (!pixelsMatch(source, out1m, x, y)) n++;
  return n;
})();
const outsideBot = (() => {
  let n = 0;
  for (let y = 800; y < H; y++) for (let x = 0; x < W; x++) if (!pixelsMatch(source, out1m, x, y)) n++;
  return n;
})();

const interior = midLumaInteriorUnpainted(source, out1m);
const interior1l = midLumaInteriorUnpainted(source, out1l);
const interior1k = midLumaInteriorUnpainted(source, out1k);
const c9 = report1m.criteria.find((c) => c.id === 9)!;
const c9l = report1l.criteria.find((c) => c.id === 9)!;
const median = c9.metrics.median;
const leftover1m = leftoverGhosts(source, out1m, median + 20);
const leftover1l = leftoverGhosts(source, out1l, c9l.metrics.median + 20);

const probes = {
  assetId: "9ed83c01-8c7d-4d1b-918f-87b0fc743c50",
  repairMethodVersion: "architecture_c_still_repair_1m",
  decoder: "imagescript-1.3.0",
  bandAuthorityMaskUsed: report1m.scoring.bandAuthorityMaskUsed,
  ghostTerritory: report1m.scoring.ghostTerritory,
  vsClean,
  vs1l: { ...vs1l, gt8: vs1lGt8 },
  vs1k: { ...vs1k, gt8: vs1kGt8 },
  outsideTop,
  outsideBot,
  bandCoreMedianLuma: median,
  midLumaInterior: { live1m: interior, live1l: interior1l, live1k: interior1k },
  creamRaise_x280_330_y673_676: creamToNavy(source, out1m, 280, 330, 673, 676),
  creamRaise1l: creamToNavy(source, out1l, 280, 330, 673, 676),
  creamRaise1k: creamToNavy(source, out1k, 280, 330, 673, 676),
  rightEndCreamToNavy: creamToNavy(source, out1m, 580, 616, 713, 730),
  rightEnd1l: creamToNavy(source, out1l, 580, 616, 713, 730),
  rightEnd1k: creamToNavy(source, out1k, 580, 616, 713, 730),
  sleevePatchDarkened: patchDarkened(source, out1m, 389, 392, 746, 748),
  leftoverBox: C9_RIGHT_LEFTOVER,
  leftover1m: {
    checked: leftover1m.checked,
    ghosts: leftover1m.ghosts,
    coords: leftover1m.coords.slice(0, 40),
  },
  leftover1l: { checked: leftover1l.checked, ghosts: leftover1l.ghosts },
  c9: {
    live1m: c9.metrics,
    live1l: c9l.metrics,
  },
  leftTape: {
    y715: sampleRow(out1m, 715, [399, 400, 401]),
    y735: sampleRow(out1m, 735, [399, 400, 401]),
    sourceY715: sampleRow(source, 715, [399, 400, 401]),
    live1l_y715: sampleRow(out1l, 715, [399, 400, 401]),
  },
  diagonalTape_y715: {
    live1m: sampleRow(out1m, 715, [427, 428, 430, 431]),
    live1l: sampleRow(out1l, 715, [427, 428, 430, 431]),
  },
  pinstripe: {
    row676_x208_213: sampleRow(out1m, 676, [208, 209, 210, 211, 212, 213]),
    row676_x256_262: sampleRow(out1m, 676, [256, 257, 258, 259, 260, 261, 262]),
    live1l_676: sampleRow(out1l, 676, [208, 209, 210, 211, 212, 213, 256, 257, 258, 259, 260, 261, 262]),
    source676: sampleRow(source, 676, [208, 209, 210, 211, 212, 213, 256, 257, 258, 259, 260, 261, 262]),
  },
  creaseColMeans: [277, 278, 279, 280, 281, 282, 283].map((x) => {
    let s = 0;
    for (let y = 690; y <= 720; y++) s += lumaAt(out1m, x, y);
    return { x, mean: s / 31 };
  }),
  firstNavyRow_x290: {
    source: firstNavy(source, 290),
    live1m: firstNavy(out1m, 290),
    live1l: firstNavy(out1l, 290),
    live1k: firstNavy(out1k, 290),
  },
};

mkdirSync(OUT, { recursive: true });
mkdirSync(`${REPO_OUT}/stage1m-live`, { recursive: true });

const files = materializeChestEvalFiles(report1m);
for (const [name, bytes] of Object.entries(files)) {
  writeFileSync(`${OUT}/${name}`, bytes);
}

const json = {
  live1m: chestEvalReportToJson(report1m),
  live1lRescore: compactRescore(report1l),
  live1kRescore: compactRescore(report1k),
  live1jRescore: compactRescore(report1j),
  forensic: probes,
  summary1m: formatChestEvalSummary(report1m),
  summary1l: formatChestEvalSummary(report1l),
  summary1k: formatChestEvalSummary(report1k),
  summary1j: formatChestEvalSummary(report1j),
  evidenceCrops: EVIDENCE_CROPS,
  gate:
    report1m.failCount === 0
      ? "CLEARED 11/11"
      : `NOT CLEARED ${report1m.passCount}/11`,
};

writeFileSync(`${OUT}/stage1m_live_score.json`, `${JSON.stringify(json, null, 2)}\n`);
writeFileSync(`${REPO_OUT}/stage1m_live_score.json`, `${JSON.stringify(json, null, 2)}\n`);
writeFileSync(
  `${REPO_OUT}/stage1m_lane_e_report.json`,
  `${JSON.stringify(chestEvalReportToJson(report1m), null, 2)}\n`,
);
writeFileSync(`${REPO_OUT}/stage1m-live/report.json`, `${JSON.stringify(json, null, 2)}\n`);
writeFileSync(`${REPO_OUT}/stage1m-live/summary.txt`, `${formatChestEvalSummary(report1m)}\n`);
writeFileSync(
  `${REPO_OUT}/stage1m-live/gate.txt`,
  `${json.gate}\n${report1m.verdict} ${report1m.passCount}/11\n`,
);

const labels = ["clean 2aa1a44c", "1l 9eaf0c55", "LIVE 1m 9ed83c01"] as const;
const sources = [source, out1l, out1m];
for (const crop of EVIDENCE_CROPS) {
  const panels = sources.map((img, i) => labeledCrop(img, crop.box, labels[i]!));
  const strip = hstack(panels);
  writeJpg(strip, `${REPO_OUT}/stage1m_${crop.id}.jpg`);
  writeJpg(strip, `${REPO_OUT}/stage1m-live/${crop.id}.jpg`);
}
writeJpg(report1m.artifacts.absDiff, `${REPO_OUT}/stage1m_abs_diff.jpg`);
writeJpg(report1m.artifacts.absDiff, `${REPO_OUT}/stage1m-live/abs_diff.jpg`);

console.log(formatChestEvalSummary(report1m));
console.log("--- 1l rescore ---");
console.log(formatChestEvalSummary(report1l));
console.log("--- 1k rescore ---");
console.log(formatChestEvalSummary(report1k));
console.log("--- 1j rescore ---");
console.log(formatChestEvalSummary(report1j));
console.log("--- forensic ---");
console.log(JSON.stringify(probes, null, 2));
console.log(`GATE: ${json.gate}`);
