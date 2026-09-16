/**
 * Lane B sleeve still Stage 1c live scorer (score-only).
 * ImageScript 1.3.0 for the JPEG source (same decoder as Stage 1a / 1b / 1m / edge).
 *
 * Usage:
 *   AVT_SLEEVE_LIVE_DIR=/tmp/avt-sleeve-1c-live npx tsx scripts/scoreSleeveStill1cLive.mts
 */
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { cropRgba, encodePpm } from "../src/lib/eval/pixelMath";
import type { PixelBox, RgbaImage } from "../src/lib/eval/types";
import {
  evaluateSleeveStillLive,
  formatSleeveLiveSummary,
  pixelTargetQuadToNorm,
  sleeveLiveEvidenceCrops,
  type SleeveLiveIdentityInput,
} from "../src/lib/sleevePanel/liveScore";
import { SEEDED_VISIBLE_SLEEVE_QUADS } from "../src/lib/sleevePanel/liveStill";

const require = createRequire(import.meta.url);
const { Image } = require("/tmp/avt-sleeve-1c-tools/node_modules/imagescript/ImageScript.js") as {
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
const DIR = process.env.AVT_SLEEVE_LIVE_DIR ?? "/tmp/avt-sleeve-1c-live";
const REPO_OUT = process.env.AVT_SLEEVE_REPO_EVIDENCE ?? "docs/sleeve-panel/live-1c";

const LIVE_META = JSON.parse(
  readFileSync(process.env.AVT_SLEEVE_LIVE_META ?? `${REPO_OUT}/live_asset.json`, "utf8"),
) as {
  assetId: string;
  created_at: string;
  storedPath: string;
  pngBytes?: number;
  metadata: {
    repair_stage?: string;
    source_still_asset_id?: string;
    temporal_tracking_enabled?: boolean;
    repair?: Record<string, unknown>;
  };
};

async function decodeImage(path: string): Promise<RgbaImage> {
  const img = await Image.decode(readFileSync(path));
  if (img.width !== W || img.height !== H) {
    throw new Error(`${path} is ${img.width}×${img.height}, expected ${W}×${H}`);
  }
  return { width: img.width, height: img.height, data: new Uint8Array(img.bitmap) };
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

function labeledCrop(img: RgbaImage, box: PixelBox, label: string): RgbaImage {
  const crop = cropRgba(img, box);
  const barH = 22;
  const data = new Uint8Array(crop.width * (crop.height + barH) * 4);
  data.fill(24);
  for (let i = 0; i < data.length; i += 4) data[i + 3] = 255;
  for (let y = 0; y < crop.height; y++) {
    for (let x = 0; x < crop.width; x++) {
      const si = (y * crop.width + x) * 4;
      const di = ((y + barH) * crop.width + x) * 4;
      data[di] = crop.data[si]!;
      data[di + 1] = crop.data[si + 1]!;
      data[di + 2] = crop.data[si + 2]!;
      data[di + 3] = 255;
    }
  }
  void label;
  return { width: crop.width, height: crop.height + barH, data };
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

function absDiff(source: RgbaImage, output: RgbaImage): RgbaImage {
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    const d = Math.min(
      255,
      Math.abs(source.data[o]! - output.data[o]!) +
        Math.abs(source.data[o + 1]! - output.data[o + 1]!) +
        Math.abs(source.data[o + 2]! - output.data[o + 2]!),
    );
    data[o] = d;
    data[o + 1] = d;
    data[o + 2] = d;
    data[o + 3] = 255;
  }
  return { width: W, height: H, data };
}

const repair = (LIVE_META.metadata.repair ?? {}) as Record<string, unknown>;
const panels = Array.isArray(repair.sleeve_panels) ? repair.sleeve_panels : [];
const leftPanel = panels.find((p) => (p as { side?: string }).side === "left") as
  Record<string, unknown> | undefined;
const rightPanel = panels.find((p) => (p as { side?: string }).side === "right") as
  Record<string, unknown> | undefined;

const identity: SleeveLiveIdentityInput = {
  repairMethodVersion: String(repair.repair_method_version ?? ""),
  claim: String(repair.claim ?? ""),
  contractVersion: String(repair.contract_version ?? ""),
  geometryNote: String(repair.geometry_note ?? ""),
  hiddenShoulderToCuffValidated: repair.hidden_shoulder_to_cuff_validated === false ? false : true,
  repairStage: String(LIVE_META.metadata.repair_stage ?? ""),
  sourceStillAssetId: String(LIVE_META.metadata.source_still_asset_id ?? ""),
  chestOutputAssetId:
    typeof repair.chest_output_asset_id === "string" ? repair.chest_output_asset_id : null,
  consumedChestOutput: repair.consumed_chest_output === true,
  temporalTrackingEnabled: LIVE_META.metadata.temporal_tracking_enabled === true,
  keyframeId: typeof repair.keyframe_id === "string" ? repair.keyframe_id : null,
  leftQuad: pixelTargetQuadToNorm(leftPanel?.target_quad) ?? SEEDED_VISIBLE_SLEEVE_QUADS.left,
  rightQuad: pixelTargetQuadToNorm(rightPanel?.target_quad) ?? SEEDED_VISIBLE_SLEEVE_QUADS.right,
  leftPainted: Number(leftPanel?.painted_pixel_count ?? 0),
  rightPainted: Number(rightPanel?.painted_pixel_count ?? 0),
  leftRejectedHidden: Number(leftPanel?.rejected_hidden_pixel_count ?? 0),
  rightRejectedHidden: Number(rightPanel?.rejected_hidden_pixel_count ?? 0),
  leftRejectedChest: Number(leftPanel?.rejected_chest_reserved_pixel_count ?? 0),
  rightRejectedChest: Number(rightPanel?.rejected_chest_reserved_pixel_count ?? 0),
  geometryRejectedHttp400: false,
};

const source = await decodeImage(`${DIR}/clean_2aa1a44c.jpg`);
const output = await decodeImage(`${DIR}/sleeve_fdb86b18.png`);
const chest = await decodeImage(`${DIR}/chest_9ed83c01.png`);
const oneA = await decodeImage(`${DIR}/sleeve_fde270bf.png`);
const oneB = await decodeImage(`${DIR}/sleeve_a4dc7f47.png`);

const score = evaluateSleeveStillLive({ source, output, identity });

function countChanged(a: RgbaImage, b: RgbaImage): number {
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      a.data[i] !== b.data[i] ||
      a.data[i + 1] !== b.data[i + 1] ||
      a.data[i + 2] !== b.data[i + 2]
    ) {
      n++;
    }
  }
  return n;
}

const vsClean = countChanged(source, output);
const vsChest = countChanged(chest, output);
const vs1a = countChanged(oneA, output);
const vs1b = countChanged(oneB, output);

mkdirSync(REPO_OUT, { recursive: true });
writeFileSync(
  `${REPO_OUT}/live_score.json`,
  `${JSON.stringify(
    {
      assetId: LIVE_META.assetId,
      created_at: LIVE_META.created_at,
      storedPath: LIVE_META.storedPath,
      decoder: "imagescript-1.3.0",
      vsCleanChangedPx: vsClean,
      vsChest1mChangedPx: vsChest,
      vs1aChangedPx: vs1a,
      vs1bChangedPx: vs1b,
      navyFillMode: repair.navy_fill_mode ?? null,
      score,
      summary: formatSleeveLiveSummary(score),
    },
    null,
    2,
  )}\n`,
);
writeFileSync(`${REPO_OUT}/summary.txt`, `${formatSleeveLiveSummary(score)}\n`);
writeFileSync(`${REPO_OUT}/gate.txt`, `${score.gate} ${score.passCount}/6\n`);

const labels = ["clean 2aa1a44c", "LIVE sleeve fdb86b18"] as const;
for (const crop of sleeveLiveEvidenceCrops()) {
  const panelsImg = [source, output].map((img, i) => labeledCrop(img, crop.box, labels[i]!));
  writeJpg(hstack(panelsImg), `${REPO_OUT}/${crop.id}.jpg`);
}
writeJpg(absDiff(source, output), `${REPO_OUT}/abs_diff.jpg`);

console.log(formatSleeveLiveSummary(score));
console.log(`vs clean changed px: ${vsClean}`);
console.log(`vs 1m chest 9ed83c01 changed px: ${vsChest}`);
console.log(`vs 1a fde270bf changed px: ${vs1a}`);
console.log(`vs 1b a4dc7f47 changed px: ${vs1b}`);
console.log(`GATE: ${score.gate} ${score.passCount}/6`);
