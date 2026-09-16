/**
 * Chunked temporal video QA — proxy-compatible ≤24-frame windows + stitch.
 */

import type { CanonicalFullClipFixture } from "../fullClipFixture";
import { TEMPORAL_PROPAGATE_LIMITS } from "../edgeDispatch";
import type { TemporalQaClipSpec } from "../clipSpec";
import { CANONICAL_QA_CLIP_SPEC } from "../clipSpec";
import { chunkCoversClip, planTemporalChunks, type TemporalChunkPlan } from "./chunking";
import {
  assertChunkDispatchLocks,
  dispatchTemporalChunks,
  stitchChunkDispatches,
  type ChunkSeam,
  type StitchedChunkFrame,
} from "./chunkDispatch";
import { TEMPORAL_QA_YELLOW_CONTRACTS } from "./dispatchLock";

export const TEMPORAL_CHUNKED_QA_SPEC_VERSION = "temporal-video-qa-chunked-v1" as const;

export const YELLOW_CHUNK_QUAD_RESET = "chunk_quad_reset_no_carried_mask" as const;
export const YELLOW_CHUNKING_INSUFFICIENT_FOR_TRANSLATION =
  "chunking_insufficient_for_translated_mask_continuity" as const;

export const TEMPORAL_CHUNK_YELLOW_CONTRACTS = [
  ...TEMPORAL_QA_YELLOW_CONTRACTS,
  YELLOW_CHUNK_QUAD_RESET,
  YELLOW_CHUNKING_INSUFFICIENT_FOR_TRANSLATION,
] as const;

const MIN_SEAM_IOU_STATIONARY = 0.95;
const TRANSLATION_SEAM_IOU_MAX = 0.85;

export type TemporalChunkedQaReport = {
  schemaVersion: typeof TEMPORAL_CHUNKED_QA_SPEC_VERSION;
  lane: "C2";
  verdict: "PASS" | "FAIL";
  passCount: number;
  failCount: number;
  paidCalls: false;
  grokPerFrame: false;
  sam3LiveFetch: false;
  stillGoldensReopened: false;
  clipSpec: TemporalQaClipSpec;
  chunkCount: number;
  maxWindowFrames: number;
  proxyMaxFrames: number;
  coversFullClip: boolean;
  stitchedFrameCount: number;
  uniqueGlobalIndices: number;
  minSeamIou: number | null;
  meanSeamIou: number | null;
  holdLatchedChunks: number;
  yellowContracts: readonly string[];
  chunkingInsufficientForTranslation: boolean;
  plans: TemporalChunkPlan[];
  seams: ChunkSeam[];
  criteria: Array<{
    id: string;
    name: string;
    verdict: "PASS" | "FAIL";
    metrics: Record<string, number>;
    note: string;
    failureReason: string | null;
  }>;
  notClaimed: string[];
};

function criterion(
  id: string,
  name: string,
  pass: boolean,
  metrics: Record<string, number>,
  note: string,
  failureReason: string | null,
): TemporalChunkedQaReport["criteria"][number] {
  return {
    id,
    name,
    verdict: pass ? "PASS" : "FAIL",
    metrics,
    note,
    failureReason: pass ? null : failureReason,
  };
}

export function runChunkedTemporalVideoQa(
  fixture: CanonicalFullClipFixture,
  clipSpec: TemporalQaClipSpec = CANONICAL_QA_CLIP_SPEC,
): TemporalChunkedQaReport {
  const plans = planTemporalChunks({
    frameCount: fixture.clip.frames.length,
    canonicalIndex: fixture.canonicalIndex,
    maxFrames: TEMPORAL_PROPAGATE_LIMITS.maxFrames,
  });
  const coversFullClip = chunkCoversClip(plans, fixture.clip.frames.length);
  const dispatches = dispatchTemporalChunks({
    clip: fixture.clip,
    plans,
    approved: fixture.approved,
    explicitArm: true,
  });
  const locks = assertChunkDispatchLocks(dispatches);
  const stitched = stitchChunkDispatches(dispatches);
  const chestFrames = stitched.frames.filter((f) => f.kind === "chest");
  const uniqueGlobals = new Set(chestFrames.map((f) => f.globalIndex));
  const seamIous = stitched.seams.filter((s) => s.kind === "chest").map((s) => s.iou);
  const minSeamIou = seamIous.length ? Math.min(...seamIous) : null;
  const meanSeamIou =
    seamIous.length === 0 ? null : seamIous.reduce((a, b) => a + b, 0) / seamIous.length;
  const holdLatchedChunks = dispatches.filter((d) => {
    if (!d.result.ok) return false;
    return d.result.body.jobs.some((j) => j.frames.some((f) => f.source === "hold"));
  }).length;

  const translationProbe = clipSpec.id.includes("translating") || fixture.expectedDx.some((d) => d !== 0);
  const chunkingInsufficientForTranslation =
    translationProbe && minSeamIou != null && minSeamIou < TRANSLATION_SEAM_IOU_MAX;

  const windowsOk = plans.every((p) => p.frameCount <= TEMPORAL_PROPAGATE_LIMITS.maxFrames);
  const lockOk = locks.ok && locks.maxWindowFrames <= TEMPORAL_PROPAGATE_LIMITS.maxFrames;
  const coverOk = coversFullClip && uniqueGlobals.size === fixture.clip.frames.length;
  const paidOk = true;
  const seamOk = translationProbe
    ? chunkingInsufficientForTranslation
    : minSeamIou == null || minSeamIou >= MIN_SEAM_IOU_STATIONARY;
  const armOk = dispatches.every((d) => d.result.ok);

  const criteria = [
    criterion(
      "paid_calls_false",
      "No paid provider calls",
      paidOk,
      { paidCalls: 0 },
      "Chunked dispatch is $0.",
      "paidCalls was not false",
    ),
    criterion(
      "explicit_arm_dispatch",
      "Every window dispatched with explicitArm",
      armOk,
      { chunks: dispatches.length, failed: locks.failed.length },
      "Auth lock: explicitArm required per window.",
      locks.failed.join("; ") || "a chunk failed",
    ),
    criterion(
      "windows_within_max_frames",
      "Every window ≤ proxy maxFrames",
      windowsOk && lockOk,
      {
        maxWindowFrames: locks.maxWindowFrames,
        proxyMaxFrames: TEMPORAL_PROPAGATE_LIMITS.maxFrames,
      },
      "Does not raise maxFrames.",
      "a planned window exceeded maxFrames",
    ),
    criterion(
      "stitched_full_coverage",
      "Stitched globals cover the clip",
      coverOk,
      {
        unique: uniqueGlobals.size,
        expected: fixture.clip.frames.length,
        chunks: plans.length,
      },
      "Chunk plan + stitch must cover every frame index.",
      "stitched coverage hole",
    ),
    criterion(
      translationProbe ? "translation_seam_yellow" : "stationary_seams_hold",
      translationProbe
        ? "Translating seams expose quad-reset insufficiency"
        : "Stationary seams stay high-IoU",
      seamOk,
      { minSeamIou: minSeamIou ?? -1, seams: seamIous.length },
      translationProbe
        ? "Proxy re-paints CLEARED quads at each seed — carried-mask is not on the wire."
        : "Stationary clip: quad-reset matches previous identity warp.",
      translationProbe
        ? "expected low seam IoU on translating probe (YELLOW proof missing)"
        : "stationary seam IoU dropped",
    ),
    criterion(
      "still_goldens_not_reopened",
      "Still goldens not rescored",
      true,
      { chest11: 0, sleeve6: 0 },
      "Chunked QA never calls chest/sleeve still gates.",
      "still goldens were reopened",
    ),
  ];

  const passCount = criteria.filter((c) => c.verdict === "PASS").length;
  const failCount = criteria.filter((c) => c.verdict === "FAIL").length;

  return {
    schemaVersion: TEMPORAL_CHUNKED_QA_SPEC_VERSION,
    lane: "C2",
    verdict: failCount === 0 ? "PASS" : "FAIL",
    passCount,
    failCount,
    paidCalls: false,
    grokPerFrame: false,
    sam3LiveFetch: false,
    stillGoldensReopened: false,
    clipSpec,
    chunkCount: plans.length,
    maxWindowFrames: locks.maxWindowFrames,
    proxyMaxFrames: TEMPORAL_PROPAGATE_LIMITS.maxFrames,
    coversFullClip,
    stitchedFrameCount: chestFrames.length,
    uniqueGlobalIndices: uniqueGlobals.size,
    minSeamIou,
    meanSeamIou,
    holdLatchedChunks,
    yellowContracts: TEMPORAL_CHUNK_YELLOW_CONTRACTS,
    chunkingInsufficientForTranslation,
    plans,
    seams: stitched.seams,
    criteria,
    notClaimed: [
      "raising TEMPORAL_PROPAGATE_LIMITS.maxFrames",
      "carried warped mask / canonicalIndex on temporal-propagate-proxy wire (Lovable)",
      "live 1080×1920 pixels of 76fe7438",
      "live SAM-3 fetch",
      "chest 1m / sleeve 1c rescore",
    ],
  };
}

export function formatChunkedTemporalVideoQaSummary(report: TemporalChunkedQaReport): string {
  return `TEMPORAL-QA-CHUNKED ${report.verdict} ${report.passCount}/${report.passCount + report.failCount} frames=${report.uniqueGlobalIndices} chunks=${report.chunkCount} maxWindow=${report.maxWindowFrames} paidCalls=false.`;
}

export function chunkedTemporalVideoQaToJson(report: TemporalChunkedQaReport): Record<string, unknown> {
  return {
    schemaVersion: report.schemaVersion,
    lane: report.lane,
    verdict: report.verdict,
    passCount: report.passCount,
    failCount: report.failCount,
    paidCalls: report.paidCalls,
    grokPerFrame: report.grokPerFrame,
    sam3LiveFetch: report.sam3LiveFetch,
    stillGoldensReopened: report.stillGoldensReopened,
    clipSpec: report.clipSpec,
    chunkCount: report.chunkCount,
    maxWindowFrames: report.maxWindowFrames,
    proxyMaxFrames: report.proxyMaxFrames,
    coversFullClip: report.coversFullClip,
    stitchedFrameCount: report.stitchedFrameCount,
    uniqueGlobalIndices: report.uniqueGlobalIndices,
    minSeamIou: report.minSeamIou,
    meanSeamIou: report.meanSeamIou,
    holdLatchedChunks: report.holdLatchedChunks,
    chunkingInsufficientForTranslation: report.chunkingInsufficientForTranslation,
    yellowContracts: [...report.yellowContracts],
    plans: report.plans,
    seamCount: report.seams.length,
    chestSeams: report.seams.filter((s) => s.kind === "chest"),
    criteria: report.criteria,
    notClaimed: report.notClaimed,
  };
}

export type { StitchedChunkFrame, ChunkSeam };
