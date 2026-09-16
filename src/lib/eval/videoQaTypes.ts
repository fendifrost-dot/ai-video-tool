/**
 * Lane E2 — video-level QA contract types.
 *
 * Isolated from Architecture C paint, temporal core, reconstruct math,
 * pipeline OS, and finishing. Lane H calls this with decoded frames plus
 * optional reconstructed-MP4 provenance.
 */

import type { EvalCrop, EvalVerdict, PixelBox, RgbaImage } from "./types";

export const VIDEO_QA_SPEC_VERSION = "lane-e2-video-qa-v1" as const;

export type VideoQaVerdict = EvalVerdict | "INCOMPLETE";

export type VideoQaCriterionVerdict = EvalVerdict | "SKIP";

export type VideoQaCriterionId =
  | "paid_calls_false"
  | "still_goldens_not_reopened"
  | "per_frame_repair_coverage"
  | "temporal_jitter_drift"
  | "mask_discontinuity"
  | "unintended_outside_region_change"
  | "seam_edge_instability"
  | "original_master_preservation"
  | "mp4_artifact_scored";

export type VideoQaMp4Ref = {
  produced: boolean;
  artifactId?: string;
  path?: string;
  sha256?: string;
  byteLength?: number;
  mimeType?: "video/mp4";
};

export type VideoQaFrame = {
  index: number;
  original: RgbaImage;
  reconstructed: RgbaImage;
  /** Authorized transform α in [0, 1], length === width * height. α === 0 must match original. */
  authorizedAlpha?: Float32Array;
  /** Repair punch-out α in [0, 1]. Coverage = fraction > 0.5. */
  repairAlpha?: Float32Array;
  /** Segmentation before repair (optional). */
  segmentationAlpha?: Float32Array;
};

export type VideoQaArtifactKind = "reconstructed_mp4" | "reconstructed_frames";

export type VideoQaArtifact = {
  kind: VideoQaArtifactKind;
  /** Lane H MP4 pointer. Scoring uses `frames`; missing decode is INCOMPLETE, not a producer FAIL. */
  mp4?: VideoQaMp4Ref;
  frames: VideoQaFrame[];
  width?: number;
  height?: number;
  fps?: number;
};

export type VideoQaProvenance = {
  projectId?: string;
  masterClipAssetId?: string;
  reconstructionVersion?: string;
  temporalJobCount?: number;
  source?: string;
};

/**
 * Lane H plug-in input. `paidCalls` is the literal false — this evaluator
 * never invokes providers.
 */
export type VideoQaInput = {
  paidCalls: false;
  artifact: VideoQaArtifact;
  provenance?: VideoQaProvenance;
};

export type VideoQaCriterion = {
  id: VideoQaCriterionId;
  name: string;
  verdict: VideoQaCriterionVerdict;
  metrics: Record<string, number>;
  note: string;
  failureReason: string | null;
};

export type VideoQaPerFrame = {
  index: number;
  repairCoverage: number | null;
  maskCoverage: number | null;
  unauthorizedPixels: number | null;
  unauthorizedChangedPixels: number | null;
  unauthorizedChangedFrac: number | null;
  seamPixelCount: number | null;
};

export type VideoQaTemporal = {
  maskXorMean: number | null;
  maskXorMax: number | null;
  outsideExcessMeanAbsLuma: number | null;
  insideMeanAbsLumaDelta: number | null;
  seamTemporalMeanAbsLuma: number | null;
  centroidDriftPx: number | null;
};

export type VideoQaEscalateKind = "architectural_blocker" | "still_golden_regression_suspected";

export type VideoQaEscalate = {
  kind: VideoQaEscalateKind;
  message: string;
  stillGoldensReopened: false;
};

export type VideoQaArtifacts = {
  crops: EvalCrop[];
};

export type VideoQaReport = {
  schemaVersion: typeof VIDEO_QA_SPEC_VERSION;
  verdict: VideoQaVerdict;
  passCount: number;
  failCount: number;
  skipCount: number;
  paidCalls: false;
  stillGoldensReopened: false;
  /** Always false — incomplete decode must not stall Lane H MP4 production. */
  blockingArtifactProducer: false;
  claudeInvestigates: "unexplained_only";
  awaiting: string[];
  frameCount: number;
  artifactKind: VideoQaArtifactKind;
  mp4: VideoQaMp4Ref | null;
  criteria: VideoQaCriterion[];
  perFrame: VideoQaPerFrame[];
  temporal: VideoQaTemporal;
  artifacts: VideoQaArtifacts;
  unexplained: string[];
  escalate: VideoQaEscalate | null;
  notClaimed: string[];
  provenance: VideoQaProvenance;
};

export type VideoQaCropJson = {
  id: string;
  criterionId: string;
  frameIndex: number;
  box: PixelBox;
  width: number;
  height: number;
  files: string[];
};

export type VideoQaJson = {
  schemaVersion: typeof VIDEO_QA_SPEC_VERSION;
  verdict: VideoQaVerdict;
  passCount: number;
  failCount: number;
  skipCount: number;
  paidCalls: false;
  stillGoldensReopened: false;
  blockingArtifactProducer: false;
  claudeInvestigates: "unexplained_only";
  awaiting: string[];
  frameCount: number;
  artifactKind: VideoQaArtifactKind;
  mp4: VideoQaMp4Ref | null;
  criteria: Array<{
    id: VideoQaCriterionId;
    name: string;
    verdict: VideoQaCriterionVerdict;
    metrics: Record<string, number>;
    note: string;
    failureReason: string | null;
  }>;
  perFrame: VideoQaPerFrame[];
  temporal: VideoQaTemporal;
  artifacts: { crops: VideoQaCropJson[] };
  unexplained: string[];
  escalate: VideoQaEscalate | null;
  notClaimed: string[];
  provenance: VideoQaProvenance;
};
