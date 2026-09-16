/**
 * Consume-only contracts for Lane E2 (evaluator) and Lane H (MP4 encode).
 *
 * Lane G2 stores pointers and structural JSON. It does not import eval
 * metric implementations or encode bytes.
 */

import { PipelineError } from "./errors";
import type { StageHandler } from "./adapters";
import { importedArtifactsForStage } from "./adapters";
import type { ArtifactRef, ConsumedEvaluatorResult } from "./types";

/** Copied pin — do not import `src/lib/eval`. */
export const E2_RECONSTRUCT_VIDEO_SPEC_VERSION = "lane-e-reconstruct-video-v1" as const;

export const ENCODE_CONTRACT = {
  ownerLane: "H" as const,
  artifactKind: "encoded_mp4" as const,
  paidCalls: false as const,
  ownsInternals: false as const,
  notClaimed: "MP4 encode of reconstructed canonical clip (Lane H)",
  notes:
    "Lane G2 records the encoded_mp4 artifact ref. Lane H produces the playable file. Do not FFmpeg here.",
};

export const EVALUATOR_CONTRACT = {
  ownerLane: "E2" as const,
  artifactKind: "evaluation_report" as const,
  specVersion: E2_RECONSTRUCT_VIDEO_SPEC_VERSION,
  paidCalls: false as const,
  ownsInternals: false as const,
  stillGoldensReopened: false as const,
  notes:
    "Structural consume of E2 ReconstructVideoReport JSON. Do not call evaluateReconstructedClip / chest 11/11 / sleeve 6/6.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Accept E2 report JSON (or a lanePayload that already is one). Never computes
 * criteria. Unknown shapes become UNSCORED rather than inventing a PASS.
 */
export function consumeEvaluatorReport(
  raw: unknown,
  reportArtifactId?: string,
): ConsumedEvaluatorResult {
  if (!isRecord(raw)) {
    return {
      specVersion: EVALUATOR_CONTRACT.specVersion,
      verdict: "UNSCORED",
      passCount: null,
      failCount: null,
      ownerLane: "E2",
      paidCalls: false,
      stillGoldensReopened: false,
      reportArtifactId,
      summary: { reason: "evaluator_payload_not_object" },
    };
  }

  const specVersion =
    typeof raw.schemaVersion === "string"
      ? raw.schemaVersion
      : typeof raw.specVersion === "string"
        ? raw.specVersion
        : EVALUATOR_CONTRACT.specVersion;

  const verdictRaw = raw.verdict;
  const verdict: ConsumedEvaluatorResult["verdict"] =
    verdictRaw === "PASS" || verdictRaw === "FAIL" || verdictRaw === "UNSCORED" || verdictRaw === "NOT_RUN"
      ? verdictRaw
      : "UNSCORED";

  const passCount = typeof raw.passCount === "number" ? raw.passCount : null;
  const failCount = typeof raw.failCount === "number" ? raw.failCount : null;

  return {
    specVersion,
    verdict,
    passCount,
    failCount,
    ownerLane: "E2",
    paidCalls: false,
    stillGoldensReopened: false,
    reportArtifactId,
    summary: {
      source: raw.source ?? null,
      frameCount: raw.frameCount ?? null,
      escalate: raw.escalate ?? null,
      notClaimed: raw.notClaimed ?? ENCODE_CONTRACT.notClaimed,
    },
  };
}

export function evaluatorResultFromArtifact(
  artifact: ArtifactRef | undefined,
): ConsumedEvaluatorResult | null {
  if (!artifact) return null;
  const payload = artifact.lanePayload ?? {};
  return consumeEvaluatorReport(payload, artifact.id);
}

/** Import-only automated_evaluation handler — never runs Lane E2 metrics. */
export function createConsumedEvaluatorHandler(): StageHandler {
  return async (ctx) => {
    const imported = importedArtifactsForStage(ctx.definition, ctx.inputs);
    const report = imported.find((a) => a.kind === "evaluation_report");
    if (!report) {
      throw new PipelineError(
        "evaluator_report_required",
        "automated_evaluation consumes Lane E2 evaluation_report. Lane G2 does not compute metrics.",
        {
          retryable: false,
          classification: "dependency",
          details: { ...EVALUATOR_CONTRACT },
        },
      );
    }
    const evaluatorResult = evaluatorResultFromArtifact(report);
    return {
      artifacts: [report],
      metadata: {
        source: "imported_from_lane",
        paidCalls: false,
        stillGoldensReopened: false,
        evaluatorResult,
      },
    };
  };
}

/** Import-only encode pointer — never encodes MP4. */
export function createConsumedEncodeHandler(): StageHandler {
  return async (ctx) => {
    const imported = ctx.inputs.filter((a) => a.kind === ENCODE_CONTRACT.artifactKind);
    if (imported.length === 0) {
      throw new PipelineError(
        "encode_artifact_required",
        "review_export records Lane H encoded_mp4. Lane G2 does not encode.",
        {
          retryable: false,
          classification: "dependency",
          details: { ...ENCODE_CONTRACT },
        },
      );
    }
    return {
      artifacts: imported,
      metadata: { source: "imported_from_lane", paidCalls: false, encode: ENCODE_CONTRACT },
    };
  };
}

export function isEncodedMp4(artifact: ArtifactRef): boolean {
  return artifact.kind === "encoded_mp4";
}
