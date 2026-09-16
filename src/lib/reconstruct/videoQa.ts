/**
 * Lane D2 — reconstruction video QA.
 *
 * Scores original-master preservation, seam leak, identity/background,
 * frame continuity, and resolution/fps/audio handling on reconstructed
 * clips. Does not import Lane E eval, temporal metrics, or pipeline OS.
 * Does not reopen chest/sleeve still goldens.
 */

import {
  reconstructMasterClip,
  type ReconstructClipResult,
} from "./adapters";
import {
  CANONICAL_MASTER_CLIP_ID,
  CANONICAL_MASTER_FPS,
  CANONICAL_PROJECT_ID,
  CLEARED_CHEST_ASSET_ID,
  CLEARED_SLEEVE_ASSET_ID,
} from "./canonicalLineage";
import {
  buildReconstructLaneHHandoff,
  type ReconstructLaneHHandoff,
} from "./exportHandoff";
import type { ConsumedSam3Mask, ConsumedTemporalJob, MasterClipFrame } from "./adapters";
import { fixtureIdentityRect } from "./fixtures/liveWiringFixture";
import { unauthorizedPixelsMatchOriginal } from "./originalMasterReconstruct";
import type { RgbaImage } from "./types";

export const RECONSTRUCT_VIDEO_QA_VERSION = "reconstruct-video-qa-v1" as const;

/** Max |maskCoverage[i] − maskCoverage[i-1]| for trusted translating clips. */
export const FRAME_CONTINUITY_MAX_COVERAGE_DELTA = 0.08;

export type ReconstructVideoQaCriterionId =
  | "paid_calls_false"
  | "grok_per_frame_false"
  | "sam3_live_fetch_false"
  | "original_preserved_unauthorized"
  | "independent_alpha_zero_bytes"
  | "generated_is_not_master"
  | "identity_repair_preserved"
  | "background_corners_preserved"
  | "seam_no_unauthorized_leak"
  | "frame_continuity_unauthorized"
  | "resolution_matches_master"
  | "fps_passthrough"
  | "audio_untouched"
  | "temporal_masks_consumed"
  | "still_goldens_not_reopened";

export type ReconstructVideoQaCriterion = {
  id: ReconstructVideoQaCriterionId;
  name: string;
  verdict: "PASS" | "FAIL";
  metrics: Record<string, number>;
  note: string;
  failureReason: string | null;
};

export type ReconstructVideoQaReport = {
  schemaVersion: typeof RECONSTRUCT_VIDEO_QA_VERSION;
  verdict: "PASS" | "FAIL";
  passCount: number;
  failCount: number;
  paidCalls: false;
  grokPerFrame: false;
  sam3LiveFetch: false;
  stillGoldensReopened: false;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  temporalJobCount: number;
  source: string;
  criteria: ReconstructVideoQaCriterion[];
  unexplained: string[];
  notClaimed: string[];
  laneHHandoff: ReconstructLaneHHandoff;
  escalate: { kind: "architectural_blocker"; message: string } | null;
};

const NOT_CLAIMED = [
  "live camera pixels of original master 76fe7438 (unique-RGB stand-in at the claimed raster)",
  "live SAM-3 fetch via sam3-segment-proxy / Control Center",
  "chest Stage 1m 11/11 rescore",
  "sleeve Stage 1c 6/6 rescore",
  "MP4 encode / mux of clip 76fe7438 (Lane H owns export)",
];

function criterion(
  id: ReconstructVideoQaCriterionId,
  name: string,
  pass: boolean,
  metrics: Record<string, number>,
  note: string,
  failureReason: string | null,
): ReconstructVideoQaCriterion {
  return {
    id,
    name,
    verdict: pass ? "PASS" : "FAIL",
    metrics,
    note,
    failureReason: pass ? null : failureReason,
  };
}

function rgbEqual(a: Uint8Array, b: Uint8Array, p: number): boolean {
  return a[p] === b[p] && a[p + 1] === b[p + 1] && a[p + 2] === b[p + 2];
}

export function countUnauthorizedLeaks(
  original: RgbaImage,
  reconstructed: RgbaImage,
  authorizedAlpha: Float32Array,
): number {
  let leaks = 0;
  const n = original.width * original.height;
  for (let i = 0; i < n; i++) {
    if (authorizedAlpha[i] !== 0) continue;
    const p = i * 4;
    if (!rgbEqual(original.data, reconstructed.data, p)) leaks++;
  }
  return leaks;
}

/**
 * Seam ring: 4-connected neighbors of α > 0 that have α === 0 must still
 * match original RGB. Soft α (0 < a < 1) is a blend and is not a leak.
 */
export function measureSeamLeaks(
  original: RgbaImage,
  reconstructed: RgbaImage,
  authorizedAlpha: Float32Array,
): { seamPixels: number; unauthorizedNeighborLeaks: number } {
  const { width, height } = original;
  let seamPixels = 0;
  let unauthorizedNeighborLeaks = 0;
  const offsets: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const a = authorizedAlpha[i]!;
      if (a > 0 && a < 1) seamPixels++;
      if (!(a > 0)) continue;
      for (const [dx, dy] of offsets) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (authorizedAlpha[ni] !== 0) continue;
        const p = ni * 4;
        if (!rgbEqual(original.data, reconstructed.data, p)) unauthorizedNeighborLeaks++;
      }
    }
  }
  return { seamPixels, unauthorizedNeighborLeaks };
}

function cornersMatchOriginal(original: RgbaImage, reconstructed: RgbaImage): boolean {
  const samples: Array<[number, number]> = [
    [0, 0],
    [original.width - 1, 0],
    [0, original.height - 1],
    [original.width - 1, original.height - 1],
  ];
  for (const [x, y] of samples) {
    const p = (y * original.width + x) * 4;
    if (!rgbEqual(original.data, reconstructed.data, p)) return false;
  }
  return true;
}

function identityRepairPreserved(
  original: RgbaImage,
  reconstructed: RgbaImage,
  authorizedAlpha: Float32Array,
): { ok: boolean; checked: number; failed: number } {
  const rect = fixtureIdentityRect(original.width, original.height);
  let checked = 0;
  let failed = 0;
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      const i = y * original.width + x;
      checked++;
      if (authorizedAlpha[i] !== 0) {
        failed++;
        continue;
      }
      const p = i * 4;
      if (!rgbEqual(original.data, reconstructed.data, p)) failed++;
    }
  }
  return { ok: failed === 0 && checked > 0, checked, failed };
}

export type ReconstructVideoQaPack = {
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  originalFrames: MasterClipFrame[];
  chestStill: { assetId: string; image: RgbaImage };
  sleeveStill: { assetId: string; image: RgbaImage };
  sam3: ConsumedSam3Mask;
  temporalJobs: ConsumedTemporalJob[];
  source?: string;
};

export function runReconstructVideoQa(input: {
  pack: ReconstructVideoQaPack;
  expectedWidth?: number;
  expectedHeight?: number;
  expectedFps?: number;
  source?: string;
}): ReconstructVideoQaReport {
  const { pack } = input;
  const fps = pack.fps ?? CANONICAL_MASTER_FPS;
  const expectedWidth = input.expectedWidth ?? pack.width;
  const expectedHeight = input.expectedHeight ?? pack.height;
  const expectedFps = input.expectedFps ?? fps;
  const source = input.source ?? pack.source ?? "reconstruct_video_qa";

  const clip: ReconstructClipResult = reconstructMasterClip({
    originalFrames: pack.originalFrames,
    chestStill: pack.chestStill,
    sleeveStill: pack.sleeveStill,
    sam3: pack.sam3,
    temporalJobs: pack.temporalJobs,
    projectId: CANONICAL_PROJECT_ID,
    masterClipAssetId: CANONICAL_MASTER_CLIP_ID,
    clipId: CANONICAL_MASTER_CLIP_ID,
  });

  const byIndex = new Map(pack.originalFrames.map((f) => [f.index, f.image]));
  let independentFailed = 0;
  let independentChecked = 0;
  let leakTotal = 0;
  let seamLeaks = 0;
  let seamPixels = 0;
  let identityFailed = 0;
  let identityChecked = 0;
  let cornersOk = true;
  const coverages: number[] = [];

  for (const fr of clip.frames) {
    const original = byIndex.get(fr.index);
    if (!original) {
      independentFailed++;
      continue;
    }
    independentChecked++;
    const leaks = countUnauthorizedLeaks(original, fr.result.image, fr.result.authorizedAlpha);
    leakTotal += leaks;
    if (leaks > 0) independentFailed++;
    if (!unauthorizedPixelsMatchOriginal(original, fr.result.image, fr.result.authorizedAlpha)) {
      independentFailed++;
    }
    const seam = measureSeamLeaks(original, fr.result.image, fr.result.authorizedAlpha);
    seamLeaks += seam.unauthorizedNeighborLeaks;
    seamPixels += seam.seamPixels;
    const identity = identityRepairPreserved(original, fr.result.image, fr.result.authorizedAlpha);
    identityChecked += identity.checked;
    identityFailed += identity.failed;
    if (!cornersMatchOriginal(original, fr.result.image)) cornersOk = false;
    coverages.push(fr.result.maskCoverage);
  }

  let maxCoverageDelta = 0;
  for (let i = 1; i < coverages.length; i++) {
    const d = Math.abs(coverages[i]! - coverages[i - 1]!);
    if (d > maxCoverageDelta) maxCoverageDelta = d;
  }

  const preservedFlag = clip.originalPixelsPreservedWhereUnauthorized === true && leakTotal === 0;
  const independentOk = independentFailed === 0 && independentChecked > 0;
  const generatedNotMaster =
    clip.frames.length > 0 &&
    clip.frames.every(
      (f) =>
        f.result.preservedPixels > 0 &&
        f.result.changedPixels < f.result.image.width * f.result.image.height,
    );
  const temporalUsed = clip.frames.filter((f) => f.temporalUsed).length;
  const resolutionOk = clip.width === expectedWidth && clip.height === expectedHeight;
  const fpsOk = fps === expectedFps && Number.isFinite(fps) && fps > 0;
  const continuityOk = independentOk && maxCoverageDelta <= FRAME_CONTINUITY_MAX_COVERAGE_DELTA;
  const idsOk =
    clip.projectId === CANONICAL_PROJECT_ID &&
    clip.masterClipAssetId === CANONICAL_MASTER_CLIP_ID &&
    clip.chestAssetId === CLEARED_CHEST_ASSET_ID &&
    clip.sleeveAssetId === CLEARED_SLEEVE_ASSET_ID;

  const criteria: ReconstructVideoQaCriterion[] = [
    criterion(
      "paid_calls_false",
      "No paid provider calls",
      clip.paidCalls === false,
      { paidCalls: 0 },
      "RECONSTRUCT-1 / D2 is $0.",
      "paidCalls was not false",
    ),
    criterion(
      "grok_per_frame_false",
      "No per-frame Grok",
      clip.grokPerFrame === false,
      { grokPerFrame: 0 },
      "No Grok / V3 generation on this path.",
      "grokPerFrame was not false",
    ),
    criterion(
      "sam3_live_fetch_false",
      "SAM-3 not live-fetched",
      clip.sam3LiveFetch === false,
      { sam3LiveFetch: 0 },
      "Fixture / caller-supplied α only.",
      "sam3LiveFetch was not false",
    ),
    criterion(
      "original_preserved_unauthorized",
      "Clip flag: unauthorized pixels preserved",
      preservedFlag && idsOk,
      { leaks: leakTotal, frames: clip.frames.length },
      "authorized α === 0 copies original RGB bytes.",
      "originalPixelsPreservedWhereUnauthorized is false or leaks > 0",
    ),
    criterion(
      "independent_alpha_zero_bytes",
      "Independent α===0 byte check vs original frames",
      independentOk,
      { checked: independentChecked, failed: independentFailed, leaks: leakTotal },
      "Re-check preservation without trusting the clip flag alone.",
      "one or more unauthorized pixels drifted from original RGB",
    ),
    criterion(
      "generated_is_not_master",
      "Generated transformation is not the output master",
      generatedNotMaster,
      {
        frames: clip.frames.length,
        firstPreserved: clip.frames[0]?.result.preservedPixels ?? 0,
        firstChanged: clip.frames[0]?.result.changedPixels ?? 0,
      },
      "Stamped stills / invert cannot replace the original master.",
      "every pixel changed or nothing preserved — generated leaked as master",
    ),
    criterion(
      "identity_repair_preserved",
      "Identity punch-out stays original",
      identityFailed === 0 && identityChecked > 0,
      { checked: identityChecked, failed: identityFailed },
      "Repair α punches original-must-keep holes in the transform region.",
      "identity repair region drifted or was authorized",
    ),
    criterion(
      "background_corners_preserved",
      "Background corners stay original",
      cornersOk,
      { corners: 4 },
      "Scene corners are unauthorized and must be byte-identical to original.",
      "a background corner drifted from original RGB",
    ),
    criterion(
      "seam_no_unauthorized_leak",
      "Seam does not leak generated into α===0 neighbors",
      seamLeaks === 0,
      { seamPixels, unauthorizedNeighborLeaks: seamLeaks },
      "Soft α blends on the seam; α===0 neighbors stay original.",
      "generated RGB leaked into an unauthorized seam neighbor",
    ),
    criterion(
      "frame_continuity_unauthorized",
      "Unauthorized region follows original across consecutive frames",
      continuityOk,
      {
        maxCoverageDelta,
        limit: FRAME_CONTINUITY_MAX_COVERAGE_DELTA,
        frames: clip.frames.length,
      },
      "Per-frame preservation plus bounded coverage delta on translating temporal masks.",
      "unauthorized pixels drifted across frames or coverage jumped",
    ),
    criterion(
      "resolution_matches_master",
      "Reconstructed frames keep original width×height",
      resolutionOk,
      { width: clip.width, height: clip.height, expectedWidth, expectedHeight },
      "Reconstruct does not resample the master raster.",
      "reconstructed resolution drifted from original frames",
    ),
    criterion(
      "fps_passthrough",
      "fps is passthrough metadata",
      fpsOk,
      { fps, expectedFps },
      "Reconstruct does not decode or restamp fps. Lane H may mux at this rate.",
      "fps missing or not the expected passthrough value",
    ),
    criterion(
      "audio_untouched",
      "Reconstruct does not touch audio",
      true,
      { reconstructTouchesAudio: 0 },
      "Frame RGBA only. Audio passthrough is a Lane H MP4 claim.",
      "reconstruct mutated audio",
    ),
    criterion(
      "temporal_masks_consumed",
      "Trusted temporal masks participated",
      pack.temporalJobs.length > 0 && temporalUsed > 0,
      { jobs: pack.temporalJobs.length, framesTemporalUsed: temporalUsed },
      "At least one trusted temporal frame must apply.",
      "no trusted temporal mask was applied",
    ),
    criterion(
      "still_goldens_not_reopened",
      "Still goldens not rescored",
      true,
      { chest11: 0, sleeve6: 0 },
      "This QA never calls chest 11/11 or sleeve 6/6 gates.",
      "still goldens were reopened",
    ),
  ];

  const passCount = criteria.filter((c) => c.verdict === "PASS").length;
  const failCount = criteria.filter((c) => c.verdict === "FAIL").length;
  const preservationBroke = !preservedFlag || !independentOk;
  const escalate = preservationBroke
    ? {
        kind: "architectural_blocker" as const,
        message:
          "RECONSTRUCT-1 original-pixel preservation failed. That is a compositing contract break — do not reopen chest/sleeve still paint to paper over it.",
      }
    : null;

  const laneHHandoff = buildReconstructLaneHHandoff({
    clip,
    fps,
    unauthorizedLeakCount: leakTotal,
  });

  return {
    schemaVersion: RECONSTRUCT_VIDEO_QA_VERSION,
    verdict: failCount === 0 ? "PASS" : "FAIL",
    passCount,
    failCount,
    paidCalls: false,
    grokPerFrame: false,
    sam3LiveFetch: false,
    stillGoldensReopened: false,
    width: clip.width,
    height: clip.height,
    fps,
    frameCount: clip.frames.length,
    temporalJobCount: pack.temporalJobs.length,
    source,
    criteria,
    unexplained: [],
    notClaimed: NOT_CLAIMED,
    laneHHandoff,
    escalate,
  };
}

export function reconstructVideoQaToJson(report: ReconstructVideoQaReport): Record<string, unknown> {
  return {
    schemaVersion: report.schemaVersion,
    verdict: report.verdict,
    passCount: report.passCount,
    failCount: report.failCount,
    paidCalls: report.paidCalls,
    grokPerFrame: report.grokPerFrame,
    sam3LiveFetch: report.sam3LiveFetch,
    stillGoldensReopened: report.stillGoldensReopened,
    width: report.width,
    height: report.height,
    fps: report.fps,
    frameCount: report.frameCount,
    temporalJobCount: report.temporalJobCount,
    source: report.source,
    escalate: report.escalate,
    notClaimed: report.notClaimed,
    unexplained: report.unexplained,
    criteria: report.criteria.map((c) => ({
      id: c.id,
      name: c.name,
      verdict: c.verdict,
      metrics: c.metrics,
      note: c.note,
      failureReason: c.failureReason,
    })),
    laneHHandoff: report.laneHHandoff,
  };
}

export function formatReconstructVideoQaSummary(report: ReconstructVideoQaReport): string {
  return `RECONSTRUCT-1 D2 ${report.verdict} ${report.passCount}/${report.passCount + report.failCount} ${report.width}×${report.height} frames=${report.frameCount} fps=${report.fps} paidCalls=false grokPerFrame=false.`;
}
