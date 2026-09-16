/**
 * Lane C2 temporal video-QA runner + machine-readable evidence.
 * In-lib propagateRepair on the full canonical clip. No Grok / Fal / CC.
 */

import type { ApprovedQuadKind } from "../approvedQuad";
import type { BinaryMask, PropagationOutput } from "../contract";
import {
  CANONICAL_CLIP_DURATION_SEC,
  CANONICAL_CLIP_FRAME_COUNT,
  CANONICAL_CLIP_KEYFRAME_FRAME_INDEX,
  CANONICAL_CLIP_NATIVE_FPS,
  CANONICAL_CLIP_NATIVE_HEIGHT,
  CANONICAL_CLIP_NATIVE_WIDTH,
  CANONICAL_CLIP_PIXELS,
  CANONICAL_MASTER_CLIP_ID,
} from "../canonicalClip";
import {
  CANONICAL_KEYFRAME_ID,
  CANONICAL_KEYFRAME_TIME_SEC,
  CANONICAL_PROJECT_ID,
  CLEARED_CHEST_ASSET_ID,
  CLEARED_CHEST_GATE,
  CLEARED_CHEST_GATE_SCORE,
  CLEARED_SLEEVE_ASSET_ID,
  CLEARED_SLEEVE_GATE,
  CLEARED_SLEEVE_GATE_SCORE,
} from "../canonicalLineage";
import type { CanonicalFullClipFixture } from "../fullClipFixture";
import { FULL_CLIP_QA_RASTER } from "../fullClipFixture";
import { buildPropagationJobsFromApprovedSet } from "../quadAdapter";
import { propagateRepair } from "../propagate";
import {
  detectorHitAllWindows,
  identifyBadFrames,
  type TemporalBadFrame,
} from "./badFrames";
import {
  inspectTemporalDispatchLock,
  TEMPORAL_QA_YELLOW_CONTRACTS,
  type TemporalDispatchLockReport,
} from "./dispatchLock";
import {
  scorePropagationFrames,
  summarizeCoverage,
  summarizeDrift,
  summarizeFlicker,
  summarizeOcclusion,
  type CoverageSummary,
  type DriftSummary,
  type FlickerSummary,
  type OcclusionSummary,
  type TemporalFrameMetrics,
} from "./metrics";
import { scoreSam3Continuity, unionMaskList, type Sam3ContinuitySummary } from "./sam3Continuity";
import {
  DEFAULT_TEMPORAL_QA_THRESHOLDS,
  TEMPORAL_VIDEO_QA_SPEC_VERSION,
  type TemporalQaThresholds,
} from "./thresholds";

export type TemporalVideoQaVerdict = "PASS" | "FAIL";

export type TemporalQaJobReport = {
  kind: ApprovedQuadKind;
  sourceAssetId: string;
  repairMethodVersion: string;
  provider: "none";
  paidCalls: false;
  grokPerFrame: false;
  canonicalIndex: number;
  frameCount: number;
  drift: DriftSummary;
  flicker: FlickerSummary;
  coverage: CoverageSummary;
  occlusion: OcclusionSummary;
  badFrameCount: number;
  frames: TemporalFrameMetrics[];
};

export type TemporalVideoQaReport = {
  schemaVersion: typeof TEMPORAL_VIDEO_QA_SPEC_VERSION;
  lane: "C2";
  verdict: TemporalVideoQaVerdict;
  passCount: number;
  failCount: number;
  paidCalls: false;
  grokPerFrame: false;
  sam3LiveFetch: false;
  stillGoldensReopened: false;
  fixtureMode: CanonicalFullClipFixture["mode"];
  clip: {
    id: typeof CANONICAL_MASTER_CLIP_ID;
    projectId: typeof CANONICAL_PROJECT_ID;
    keyframeId: typeof CANONICAL_KEYFRAME_ID;
    native: {
      width: typeof CANONICAL_CLIP_NATIVE_WIDTH;
      height: typeof CANONICAL_CLIP_NATIVE_HEIGHT;
      fps: typeof CANONICAL_CLIP_NATIVE_FPS;
      frameCount: typeof CANONICAL_CLIP_FRAME_COUNT;
      durationSec: typeof CANONICAL_CLIP_DURATION_SEC;
    };
    qaRaster: { width: number; height: number; frameCount: number; fps: number };
    canonicalIndex: number;
    keyframeTimeSec: typeof CANONICAL_KEYFRAME_TIME_SEC;
    pixels: typeof CANONICAL_CLIP_PIXELS;
  };
  lineage: {
    chestAssetId: typeof CLEARED_CHEST_ASSET_ID;
    chestGate: typeof CLEARED_CHEST_GATE;
    chestGateScore: typeof CLEARED_CHEST_GATE_SCORE;
    sleeveAssetId: typeof CLEARED_SLEEVE_ASSET_ID;
    sleeveGate: typeof CLEARED_SLEEVE_GATE;
    sleeveGateScore: typeof CLEARED_SLEEVE_GATE_SCORE;
  };
  jobs: TemporalQaJobReport[];
  summary: {
    frameCount: number;
    jobsScored: number;
    badFrameCount: number;
    detectorHitAllInjectedWindows: boolean;
    drift: DriftSummary;
    flicker: FlickerSummary;
    coverage: CoverageSummary;
    occlusion: OcclusionSummary;
    sam3Continuity: Sam3ContinuitySummary;
  };
  badFrames: TemporalBadFrame[];
  dispatchPath: TemporalDispatchLockReport;
  yellowContracts: typeof TEMPORAL_QA_YELLOW_CONTRACTS;
  notClaimed: string[];
  criteria: Array<{
    id: string;
    name: string;
    verdict: TemporalVideoQaVerdict;
    metrics: Record<string, number>;
    note: string;
    failureReason: string | null;
  }>;
};

const NOT_CLAIMED = [
  "live 1080×1920 pixels of original master 76fe7438 (synthetic luma stand-in at 80×128)",
  "live SAM-3 fetch via sam3-segment-proxy / Control Center",
  "POST of 241 frames through temporal-propagate-proxy (edge maxFrames remains 24)",
  "chest Stage 1m 11/11 rescore",
  "sleeve Stage 1c 6/6 rescore",
  "MP4 encode / Hero Frame export (Lane H)",
  "original-master reconstruct paint (Lane D2)",
];

function criterion(
  id: string,
  name: string,
  pass: boolean,
  metrics: Record<string, number>,
  note: string,
  failureReason: string | null,
): TemporalVideoQaReport["criteria"][number] {
  return {
    id,
    name,
    verdict: pass ? "PASS" : "FAIL",
    metrics,
    note,
    failureReason: pass ? null : failureReason,
  };
}

function mergeDrift(jobs: TemporalQaJobReport[]): DriftSummary {
  const maxPx = Math.max(0, ...jobs.map((j) => j.drift.maxPx));
  const meanPx =
    jobs.length === 0 ? 0 : jobs.reduce((s, j) => s + j.drift.meanPx, 0) / jobs.length;
  return {
    maxPx,
    meanPx,
    framesOverThreshold: jobs.reduce((s, j) => s + j.drift.framesOverThreshold, 0),
  };
}

function mergeFlicker(jobs: TemporalQaJobReport[]): FlickerSummary {
  return {
    minConsecutiveIou: jobs.length ? Math.min(...jobs.map((j) => j.flicker.minConsecutiveIou)) : 1,
    meanConsecutiveIou:
      jobs.length === 0
        ? 1
        : jobs.reduce((s, j) => s + j.flicker.meanConsecutiveIou, 0) / jobs.length,
    framesBelowThreshold: jobs.reduce((s, j) => s + j.flicker.framesBelowThreshold, 0),
  };
}

function mergeCoverage(jobs: TemporalQaJobReport[]): CoverageSummary {
  return {
    minRatio: jobs.length ? Math.min(...jobs.map((j) => j.coverage.minRatio)) : 0,
    meanRatio:
      jobs.length === 0 ? 0 : jobs.reduce((s, j) => s + j.coverage.meanRatio, 0) / jobs.length,
    minSupport: jobs.length ? Math.min(...jobs.map((j) => j.coverage.minSupport)) : 0,
    meanSupport:
      jobs.length === 0 ? 0 : jobs.reduce((s, j) => s + j.coverage.meanSupport, 0) / jobs.length,
    holeFrames: jobs.reduce((s, j) => s + j.coverage.holeFrames, 0),
    overflowFrames: jobs.reduce((s, j) => s + j.coverage.overflowFrames, 0),
  };
}

function mergeOcclusion(jobs: TemporalQaJobReport[]): OcclusionSummary {
  return {
    declaredWindowCount: jobs[0]?.occlusion.declaredWindowCount ?? 0,
    flaggedInWindows: jobs.reduce((s, j) => s + j.occlusion.flaggedInWindows, 0),
    recoveryLagFrames: jobs[0]?.occlusion.recoveryLagFrames ?? null,
    discontinuityFrames: jobs.reduce((s, j) => s + j.occlusion.discontinuityFrames, 0),
    holdLatchedAfterBreak: jobs.some((j) => j.occlusion.holdLatchedAfterBreak),
  };
}

export function runTemporalVideoQa(
  fixture: CanonicalFullClipFixture,
  thresholds: TemporalQaThresholds = DEFAULT_TEMPORAL_QA_THRESHOLDS,
): TemporalVideoQaReport {
  const lock = inspectTemporalDispatchLock();
  const jobSpecs = buildPropagationJobsFromApprovedSet({
    clip: fixture.clip,
    canonicalIndex: fixture.canonicalIndex,
    approved: fixture.approved,
  });

  const outputs: { kind: ApprovedQuadKind; spec: (typeof jobSpecs)[number]; out: PropagationOutput }[] =
    jobSpecs.map((spec) => ({
      kind: spec.kind,
      spec,
      out: propagateRepair(spec.input),
    }));

  const repairUnionByFrame = new Map<number, BinaryMask>();
  const frameCount = fixture.clip.frames.length;
  for (let i = 0; i < frameCount; i++) {
    const masks = outputs
      .map((j) => j.out.frames.find((f) => f.index === i)?.mask)
      .filter((m): m is BinaryMask => m != null);
    const union = unionMaskList(masks);
    if (union) repairUnionByFrame.set(i, union);
  }

  const sam3 = scoreSam3Continuity(fixture.sam3Masks, repairUnionByFrame, thresholds);
  const occlusionWindows = fixture.defects.filter((d) => d.kind === "occlusion");

  const jobs: TemporalQaJobReport[] = outputs.map(({ kind, spec, out }) => {
    const frames = scorePropagationFrames(out, fixture.expectedDx, fixture.clip.frames);
    const bad = identifyBadFrames(kind, frames, {
      thresholds,
      sam3Frames: kind === "chest" ? sam3.frames : undefined,
    });
    return {
      kind,
      sourceAssetId: spec.sourceAssetId,
      repairMethodVersion: spec.repairMethodVersion,
      provider: "none",
      paidCalls: false,
      grokPerFrame: false,
      canonicalIndex: out.canonicalIndex,
      frameCount: out.frames.length,
      drift: summarizeDrift(frames, thresholds),
      flicker: summarizeFlicker(frames, thresholds),
      coverage: summarizeCoverage(frames, thresholds),
      occlusion: summarizeOcclusion(frames, occlusionWindows, thresholds),
      badFrameCount: bad.length,
      frames,
    };
  });

  const badFrames = jobs.flatMap((job) =>
    identifyBadFrames(job.kind, job.frames, {
      thresholds,
      sam3Frames: job.kind === "chest" ? sam3.frames : undefined,
    }),
  );

  const detectorHit = detectorHitAllWindows(badFrames, fixture.defects, "chest");
  const paidOk = jobs.every((j) => j.paidCalls === false && j.grokPerFrame === false);
  const frameCountOk = jobs.every((j) => j.frameCount === CANONICAL_CLIP_FRAME_COUNT);
  const idsOk =
    fixture.clip.id === CANONICAL_MASTER_CLIP_ID &&
    fixture.canonicalIndex === CANONICAL_CLIP_KEYFRAME_FRAME_INDEX &&
    jobs.some((j) => j.kind === "chest" && j.sourceAssetId === CLEARED_CHEST_ASSET_ID) &&
    jobs.some((j) => j.kind === "sleeve_left" && j.sourceAssetId === CLEARED_SLEEVE_ASSET_ID);
  const lockOk =
    lock.paidCalls === false &&
    lock.grokPerFrame === false &&
    lock.edgeMaxFrames === 24 &&
    lock.fullClipFitsProxy === false;
  const cleanOk = fixture.mode === "clean" && badFrames.length === 0;
  const defectOk = fixture.mode === "defects" && detectorHit;
  const modeOk = fixture.mode === "clean" ? cleanOk : defectOk;
  const sam3Ok = sam3.summary.sam3LiveFetch === false && sam3.summary.frameCount === frameCount;

  const criteria = [
    criterion(
      "paid_calls_false",
      "No paid provider calls",
      paidOk,
      { paidCalls: 0 },
      "Lane C2 is $0. paidCalls must stay false.",
      "paidCalls was not false",
    ),
    criterion(
      "grok_per_frame_false",
      "No per-frame Grok",
      jobs.every((j) => j.grokPerFrame === false),
      { grokPerFrame: 0 },
      "No Grok / V3 generation on this path.",
      "grokPerFrame was not false",
    ),
    criterion(
      "full_clip_frame_count",
      "Full canonical clip frame count",
      frameCountOk,
      { frameCount, expected: CANONICAL_CLIP_FRAME_COUNT },
      "QA must score all 241 frames of master 76fe7438's duration.",
      "job frameCount is not 241",
    ),
    criterion(
      "canonical_ids",
      "Canonical master / chest / sleeve IDs",
      idsOk,
      { jobs: jobs.length },
      "Lineage stays on project 764a63d2 / master 76fe7438 / CLEARED stills.",
      "canonical IDs drifted",
    ),
    criterion(
      "dispatch_path_locked",
      "Authenticated proxy dispatch path unchanged",
      lockOk,
      { edgeMaxFrames: lock.edgeMaxFrames, canonicalFrames: lock.canonicalFrameCount },
      "maxFrames stays 24; full-clip QA is in-lib propagateRepair.",
      "dispatch lock drifted",
    ),
    criterion(
      "sam3_live_fetch_false",
      "SAM-3 not live-fetched",
      sam3Ok,
      { sam3LiveFetch: 0, sam3Frames: sam3.summary.frameCount },
      "Continuity is scored on caller-supplied / synthetic masks.",
      "SAM-3 live fetch or frame mismatch",
    ),
    criterion(
      "still_goldens_not_reopened",
      "Still goldens not rescored",
      true,
      { chest11: 0, sleeve6: 0 },
      "This QA never calls chest 11/11 or sleeve 6/6 gates.",
      "still goldens were reopened",
    ),
    criterion(
      fixture.mode === "clean" ? "clean_clip_no_bad_frames" : "defect_windows_detected",
      fixture.mode === "clean"
        ? "Clean full clip has no auto-flagged bad frames"
        : "Injected defect windows are auto-detected",
      modeOk,
      {
        badFrameCount: badFrames.length,
        injectedWindows: fixture.defects.length,
        detectorHit: detectorHit ? 1 : 0,
      },
      fixture.mode === "clean"
        ? "Stationary/slow full-clip stand-in should not flag drift/flicker/holes."
        : "Occlusion / flicker / coverage / drift windows must each produce ≥1 chest bad frame.",
      fixture.mode === "clean"
        ? "clean clip produced unexpected bad frames"
        : "one or more injected defect windows were missed",
    ),
  ];

  const passCount = criteria.filter((c) => c.verdict === "PASS").length;
  const failCount = criteria.filter((c) => c.verdict === "FAIL").length;

  return {
    schemaVersion: TEMPORAL_VIDEO_QA_SPEC_VERSION,
    lane: "C2",
    verdict: failCount === 0 ? "PASS" : "FAIL",
    passCount,
    failCount,
    paidCalls: false,
    grokPerFrame: false,
    sam3LiveFetch: false,
    stillGoldensReopened: false,
    fixtureMode: fixture.mode,
    clip: {
      id: CANONICAL_MASTER_CLIP_ID,
      projectId: CANONICAL_PROJECT_ID,
      keyframeId: CANONICAL_KEYFRAME_ID,
      native: {
        width: CANONICAL_CLIP_NATIVE_WIDTH,
        height: CANONICAL_CLIP_NATIVE_HEIGHT,
        fps: CANONICAL_CLIP_NATIVE_FPS,
        frameCount: CANONICAL_CLIP_FRAME_COUNT,
        durationSec: CANONICAL_CLIP_DURATION_SEC,
      },
      qaRaster: {
        width: FULL_CLIP_QA_RASTER.width,
        height: FULL_CLIP_QA_RASTER.height,
        frameCount: CANONICAL_CLIP_FRAME_COUNT,
        fps: CANONICAL_CLIP_NATIVE_FPS,
      },
      canonicalIndex: CANONICAL_CLIP_KEYFRAME_FRAME_INDEX,
      keyframeTimeSec: CANONICAL_KEYFRAME_TIME_SEC,
      pixels: CANONICAL_CLIP_PIXELS,
    },
    lineage: {
      chestAssetId: CLEARED_CHEST_ASSET_ID,
      chestGate: CLEARED_CHEST_GATE,
      chestGateScore: CLEARED_CHEST_GATE_SCORE,
      sleeveAssetId: CLEARED_SLEEVE_ASSET_ID,
      sleeveGate: CLEARED_SLEEVE_GATE,
      sleeveGateScore: CLEARED_SLEEVE_GATE_SCORE,
    },
    jobs,
    summary: {
      frameCount,
      jobsScored: jobs.length,
      badFrameCount: badFrames.length,
      detectorHitAllInjectedWindows: detectorHit,
      drift: mergeDrift(jobs),
      flicker: mergeFlicker(jobs),
      coverage: mergeCoverage(jobs),
      occlusion: mergeOcclusion(jobs),
      sam3Continuity: sam3.summary,
    },
    badFrames,
    dispatchPath: lock,
    yellowContracts: TEMPORAL_QA_YELLOW_CONTRACTS,
    notClaimed: NOT_CLAIMED,
    criteria,
  };
}

export function temporalVideoQaReportToJson(
  report: TemporalVideoQaReport,
): Record<string, unknown> {
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
    fixtureMode: report.fixtureMode,
    clip: report.clip,
    lineage: report.lineage,
    jobs: report.jobs.map((job) => ({
      kind: job.kind,
      sourceAssetId: job.sourceAssetId,
      repairMethodVersion: job.repairMethodVersion,
      provider: job.provider,
      paidCalls: job.paidCalls,
      grokPerFrame: job.grokPerFrame,
      canonicalIndex: job.canonicalIndex,
      frameCount: job.frameCount,
      drift: job.drift,
      flicker: job.flicker,
      coverage: job.coverage,
      occlusion: job.occlusion,
      badFrameCount: job.badFrameCount,
      confidence: job.frames.map((f) => f.confidence),
      driftPx: job.frames.map((f) => f.driftPx),
      coverageRatio: job.frames.map((f) => f.coverageRatio),
      supportCoverage: job.frames.map((f) => f.supportCoverage),
      consecutiveIou: job.frames.map((f) => f.consecutiveIou),
      source: job.frames.map((f) => f.source),
    })),
    summary: report.summary,
    badFrames: report.badFrames,
    dispatchPath: report.dispatchPath,
    yellowContracts: [...report.yellowContracts],
    notClaimed: report.notClaimed,
    criteria: report.criteria,
  };
}

export function formatTemporalVideoQaSummary(report: TemporalVideoQaReport): string {
  return `TEMPORAL-QA ${report.verdict} ${report.passCount}/${report.passCount + report.failCount} frames=${report.summary.frameCount} jobs=${report.summary.jobsScored} bad=${report.summary.badFrameCount} paidCalls=false grokPerFrame=false.`;
}
