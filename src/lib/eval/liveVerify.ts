/**
 * Stage 1k canonical live-verify harness.
 *
 * Invokes architecture-c-still-repair-proxy ($0 deterministic still repair)
 * and/or scores a source/output pair with Lane E. Does not call Grok / V3.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
import { CANONICAL_BAND_QUAD_NORM } from "./chestCriteria";
import { evaluateChestStill } from "./chestVisualEvaluator";
import { lumaAt } from "./pixelMath";
import {
  chestEvalReportToJson,
  formatChestEvalSummary,
  materializeChestEvalFiles,
} from "./visualArtifacts";
import type { ChestVisualReport, NormQuad, RgbaImage } from "./types";

export const STAGE1K_EXPECTED_VERSION = "architecture_c_still_repair_1k";
export const STAGE1L_EXPECTED_VERSION = "architecture_c_still_repair_1l";

export const STAGE1K_CANONICAL = {
  projectId: "764a63d2-93cd-44f3-905f-292f14ab2f51",
  wardrobeFeatureId: "0feb028f-dc4d-45dc-82ac-e4bbd16054b0",
  clipId: "76fe7438-671d-4428-a7f6-17a45e98c16f",
  stillAssetId: "2aa1a44c-b24a-46bf-890f-13a6fc65b1cc",
  keyframeId: "v2-still-0.785",
  stage: "logo_chest" as const,
  bandQuad: [
    [0.3, 0.53],
    [0.87, 0.533],
    [0.87, 0.585],
    [0.3, 0.582],
  ] satisfies NormQuad,
};

const LIVE_COVER = {
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

export type InvokeResult = {
  httpStatus: number;
  latencyMs: number;
  url: string;
  body: Record<string, unknown>;
  repairMethodVersion: string | null;
  assetId: string | null;
  storedPath: string | null;
  previewUrl: string | null;
  worker546: boolean;
};

export function extractRepairMethodVersion(body: Record<string, unknown>): string | null {
  const repair = body.repair;
  if (repair && typeof repair === "object") {
    const v = (repair as { repair_method_version?: unknown }).repair_method_version;
    if (typeof v === "string") return v;
  }
  const top = body.repair_method_version;
  return typeof top === "string" ? top : null;
}

export async function invokeArchitectureCStillRepair(opts: {
  supabaseUrl: string;
  accessToken: string;
  timeoutMs?: number;
}): Promise<InvokeResult> {
  const url = `${opts.supabaseUrl.replace(/\/$/, "")}/functions/v1/architecture-c-still-repair-proxy`;
  const started = Date.now();
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      apikey: opts.accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      projectId: STAGE1K_CANONICAL.projectId,
      stillAssetId: STAGE1K_CANONICAL.stillAssetId,
      wardrobeFeatureId: STAGE1K_CANONICAL.wardrobeFeatureId,
      stage: STAGE1K_CANONICAL.stage,
      logoZoneQuad: STAGE1K_CANONICAL.bandQuad,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
  });
  const latencyMs = Date.now() - started;
  const body = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    httpStatus: resp.status,
    latencyMs,
    url,
    body,
    repairMethodVersion: extractRepairMethodVersion(body),
    assetId: typeof body.assetId === "string" ? body.assetId : null,
    storedPath: typeof body.storedPath === "string" ? body.storedPath : null,
    previewUrl: typeof body.previewUrl === "string" ? body.previewUrl : null,
    worker546: resp.status === 546,
  };
}

export type ForensicExtras = {
  leftTapeLumaY715X399: number;
  leftTapeLumaY735X399: number;
  creamToNavyX280Y673: number;
  rightEndCreamToNavy: number;
  sleeveCornerDarkened: number;
  firstNavyRowSourceX290: number;
  firstNavyRowOutputX290: number;
  changedAboveY600: number;
  changedBelowY800: number;
};

function firstNavyRow(img: RgbaImage, x: number, y0: number, y1: number): number {
  for (let y = y0; y <= y1; y++) {
    if (lumaAt(img, x, y) < 80) return y;
  }
  return y1 + 1;
}

export function forensicExtras(source: RgbaImage, output: RgbaImage): ForensicExtras {
  const w = Math.min(source.width, output.width);
  const h = Math.min(source.height, output.height);
  let creamToNavy = 0;
  for (let y = 673; y <= 676; y++) {
    for (let x = 280; x <= 330; x++) {
      if (x >= w || y >= h) continue;
      if (lumaAt(source, x, y) <= 140) continue;
      if (lumaAt(output, x, y) < 80) creamToNavy++;
    }
  }
  let rightEnd = 0;
  for (let y = 713; y <= 730; y++) {
    for (let x = 580; x <= 616; x++) {
      if (x >= w || y >= h) continue;
      if (lumaAt(source, x, y) <= 140) continue;
      if (lumaAt(output, x, y) < 80) rightEnd++;
    }
  }
  let sleeve = 0;
  for (let y = 746; y <= 748; y++) {
    for (let x = 389; x <= 392; x++) {
      if (x >= w || y >= h) continue;
      const srcL = lumaAt(source, x, y);
      if (srcL <= 100) continue;
      if (srcL - lumaAt(output, x, y) >= 40) sleeve++;
    }
  }
  let above = 0;
  let below = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * source.width + x) * 4;
      const changed =
        source.data[i] !== output.data[i] ||
        source.data[i + 1] !== output.data[i + 1] ||
        source.data[i + 2] !== output.data[i + 2];
      if (!changed) continue;
      if (y < 600) above++;
      if (y >= 800) below++;
    }
  }
  return {
    leftTapeLumaY715X399: lumaAt(output, 399, 715),
    leftTapeLumaY735X399: lumaAt(output, 399, 735),
    creamToNavyX280Y673: creamToNavy,
    rightEndCreamToNavy: rightEnd,
    sleeveCornerDarkened: sleeve,
    firstNavyRowSourceX290: firstNavyRow(source, 290, 662, 690),
    firstNavyRowOutputX290: firstNavyRow(output, 290, 662, 690),
    changedAboveY600: above,
    changedBelowY800: below,
  };
}

export function runFixturePipeline(): { source: RgbaImage; output: RgbaImage; band: QuadPts } {
  const source = embedArchitectureCBandCropInFrame();
  const band = ARCHITECTURE_C_BAND_CROP.measuredBandQuadNorm.map(([nx, ny]) => ({
    x: nx * source.width,
    y: ny * source.height,
  })) as QuadPts;
  const covered = coverTargetQuad(source, band, LIVE_COVER);
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
  const output = applyOcclusionAlphaComposite(
    source,
    withZip,
    featherAlpha(chestLocal, source.width, source.height, 2),
  );
  return { source, output, band };
}

export type ScorePackage = {
  label: string;
  live: boolean;
  report: ChestVisualReport;
  extras: ForensicExtras;
  summary: string;
  json: ReturnType<typeof chestEvalReportToJson> & {
    label: string;
    live: boolean;
    extras: ForensicExtras;
  };
};

export function scoreStillPair(
  source: RgbaImage,
  output: RgbaImage,
  label: string,
  live: boolean,
  bandQuadNorm: NormQuad = CANONICAL_BAND_QUAD_NORM,
): ScorePackage {
  const report = evaluateChestStill({ source, output, bandQuadNorm });
  const extras = forensicExtras(source, output);
  const json = {
    ...chestEvalReportToJson(report),
    label,
    live,
    extras,
  };
  return { label, live, report, extras, summary: formatChestEvalSummary(report), json };
}

export function writeScorePackage(pkg: ScorePackage, outDir: string): string[] {
  mkdirSync(outDir, { recursive: true });
  const written: string[] = [];
  const files = materializeChestEvalFiles(pkg.report);
  const reportName = "report.json";
  writeFileSync(join(outDir, reportName), `${JSON.stringify(pkg.json, null, 2)}\n`);
  written.push(reportName);
  writeFileSync(join(outDir, "summary.txt"), `${pkg.summary}\n`);
  written.push("summary.txt");
  for (const [name, bytes] of Object.entries(files)) {
    if (name === "report.json") continue;
    // Skip full-frame abs-diff and BMP; keep crop PPMs only long enough for JPEG conversion.
    if (name.startsWith("abs_diff.") || name.endsWith(".bmp")) continue;
    writeFileSync(join(outDir, name), bytes);
    written.push(name);
  }
  ppmToJpegCrops(outDir);
  return written;
}

function ppmToJpegCrops(outDir: string): void {
  const names = [
    "chest_compare",
    "pinstripe_topleft",
    "crease_lettering",
    "right_top_edge",
    "sleeve_zip_bottom",
    "centre_wedge",
  ];
  for (const name of names) {
    const ppm = join(outDir, `${name}.ppm`);
    const jpg = join(outDir, `${name}.jpg`);
    const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", ppm, "-q:v", "3", jpg], {
      encoding: "utf8",
    });
    try {
      unlinkSync(ppm);
    } catch {
      /* optional */
    }
    if (r.status !== 0) continue;
  }
}

export function imageToPpm(inputPath: string, outputPpm: string): void {
  const r = spawnSync(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-i", inputPath, "-frames:v", "1", outputPpm],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    throw new Error(`ffmpeg ppm convert failed: ${r.stderr || r.stdout || r.status}`);
  }
}
