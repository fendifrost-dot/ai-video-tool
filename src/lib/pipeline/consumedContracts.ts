/**
 * Consume-only contracts for Lane E2 (evaluator) and Lane H (MP4 encode).
 *
 * Lane G2 stores pointers and structural JSON. It does not import eval
 * metric implementations or encode bytes.
 */

import { importedArtifactsForStage, type StageHandler } from "./adapters";
import { PipelineError } from "./errors";
import type {
  ArtifactRef,
  ConsumedEncodeProvenance,
  ConsumedEvaluatorResult,
} from "./types";

/** Copied pin — do not import `src/lib/eval`. */
export const E2_RECONSTRUCT_VIDEO_SPEC_VERSION = "lane-e-reconstruct-video-v1" as const;
export const E2_VIDEO_QA_SPEC_VERSION = "lane-e2-video-qa-v1" as const;

export const ENCODE_CONTRACT = {
  ownerLane: "H" as const,
  artifactKind: "encoded_mp4" as const,
  paidCalls: false as const,
  ownsInternals: false as const,
  encodeStatusWhenUnmerged: "not_claimed" as const,
  notClaimed: "MP4 encode of reconstructed canonical clip (Lane H not merged)",
  notes:
    "Lane G2 records the encoded_mp4 artifact ref / not_claimed stub. Lane H produces the playable file. Do not FFmpeg here.",
};

export const EVALUATOR_CONTRACT = {
  ownerLane: "E2" as const,
  artifactKind: "evaluation_report" as const,
  specVersion: E2_RECONSTRUCT_VIDEO_SPEC_VERSION,
  paidCalls: false as const,
  ownsInternals: false as const,
  stillGoldensReopened: false as const,
  notes:
    "Structural consume of reconstruct-video JSON. Prefer video_qa_report (lane-e2-video-qa-v1) when present.",
};

export const VIDEO_QA_CONTRACT = {
  ownerLane: "E2" as const,
  artifactKind: "video_qa_report" as const,
  specVersion: E2_VIDEO_QA_SPEC_VERSION,
  paidCalls: false as const,
  ownsInternals: false as const,
  stillGoldensReopened: false as const,
  blockingArtifactProducer: false as const,
  notes:
    "Structural consume of Lane E2 VideoQaJson. Do not call evaluateVideoQa / chest 11/11 / sleeve 6/6.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unscored(
  specVersion: string,
  reportArtifactId: string | undefined,
  reason: string,
): ConsumedEvaluatorResult {
  return {
    specVersion,
    verdict: "UNSCORED",
    passCount: null,
    failCount: null,
    ownerLane: "E2",
    paidCalls: false,
    stillGoldensReopened: false,
    blockingArtifactProducer: false,
    reportArtifactId,
    summary: { reason },
  };
}

function parseVerdict(raw: unknown): ConsumedEvaluatorResult["verdict"] {
  if (
    raw === "PASS" ||
    raw === "FAIL" ||
    raw === "UNSCORED" ||
    raw === "NOT_RUN" ||
    raw === "INCOMPLETE"
  ) {
    return raw;
  }
  return "UNSCORED";
}

/**
 * Accept E2 report JSON (reconstruct-video or video-qa). Never computes
 * criteria. Unknown shapes become UNSCORED rather than inventing a PASS.
 */
export function consumeEvaluatorReport(
  raw: unknown,
  reportArtifactId?: string,
): ConsumedEvaluatorResult {
  if (!isRecord(raw)) {
    return unscored(EVALUATOR_CONTRACT.specVersion, reportArtifactId, "evaluator_payload_not_object");
  }
  const specVersion =
    typeof raw.schemaVersion === "string"
      ? raw.schemaVersion
      : typeof raw.specVersion === "string"
        ? raw.specVersion
        : EVALUATOR_CONTRACT.specVersion;
  return {
    specVersion,
    verdict: parseVerdict(raw.verdict),
    passCount: typeof raw.passCount === "number" ? raw.passCount : null,
    failCount: typeof raw.failCount === "number" ? raw.failCount : null,
    ownerLane: "E2",
    paidCalls: false,
    stillGoldensReopened: false,
    blockingArtifactProducer: false,
    reportArtifactId,
    summary: {
      source: raw.source ?? null,
      frameCount: raw.frameCount ?? null,
      escalate: raw.escalate ?? null,
      notClaimed: raw.notClaimed ?? ENCODE_CONTRACT.notClaimed,
      mp4: raw.mp4 ?? null,
      blockingArtifactProducer: raw.blockingArtifactProducer ?? false,
      awaiting: raw.awaiting ?? [],
    },
  };
}

/** Structural consume of `lane-e2-video-qa-v1` JSON. */
export function consumeVideoQaReport(
  raw: unknown,
  reportArtifactId?: string,
): ConsumedEvaluatorResult {
  const consumed = consumeEvaluatorReport(raw, reportArtifactId);
  if (!isRecord(raw)) return consumed;
  const spec =
    typeof raw.schemaVersion === "string" ? raw.schemaVersion : VIDEO_QA_CONTRACT.specVersion;
  if (spec !== E2_VIDEO_QA_SPEC_VERSION && consumed.verdict !== "UNSCORED") {
    return {
      ...consumed,
      specVersion: spec,
      summary: { ...consumed.summary, note: "not_lane_e2_video_qa_v1" },
    };
  }
  return {
    ...consumed,
    specVersion: spec,
    summary: {
      ...consumed.summary,
      artifactKind: raw.artifactKind ?? null,
      claudeInvestigates: raw.claudeInvestigates ?? "unexplained_only",
    },
  };
}

export function evaluatorResultFromArtifact(
  artifact: ArtifactRef | undefined,
): ConsumedEvaluatorResult | null {
  if (!artifact) return null;
  const payload = artifact.lanePayload ?? {};
  if (artifact.kind === "video_qa_report") return consumeVideoQaReport(payload, artifact.id);
  return consumeEvaluatorReport(payload, artifact.id);
}

function pickEvalArtifact(artifacts: ArtifactRef[]): ArtifactRef | undefined {
  return (
    artifacts.find((a) => a.kind === "video_qa_report") ??
    artifacts.find((a) => a.kind === "evaluation_report")
  );
}

/** Import-only automated_evaluation handler — never runs Lane E2 metrics. */
export function createConsumedEvaluatorHandler(): StageHandler {
  return async (ctx) => {
    const imported = importedArtifactsForStage(ctx.definition, ctx.inputs);
    const report = pickEvalArtifact(imported) ?? pickEvalArtifact(ctx.inputs);
    if (!report) {
      throw new PipelineError(
        "evaluator_report_required",
        "automated_evaluation consumes Lane E2 video_qa_report or evaluation_report. Lane G2 does not compute metrics.",
        {
          retryable: false,
          classification: "dependency",
          details: { ...VIDEO_QA_CONTRACT },
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

export const createConsumedVideoQaHandler = createConsumedEvaluatorHandler;

export function consumeEncodeProvenance(raw: unknown): ConsumedEncodeProvenance {
  const rec = isRecord(raw) ? raw : {};
  const mp4 = isRecord(rec.mp4) ? rec.mp4 : rec;
  const encodeStatus =
    rec.encodeStatus === "encoded" || rec.encodeStatus === "pending" || rec.encodeStatus === "not_claimed"
      ? rec.encodeStatus
      : mp4.produced === true
        ? "encoded"
        : "not_claimed";
  const produced = mp4.produced === true || encodeStatus === "encoded";
  return {
    ownerLane: "H",
    paidCalls: false,
    encodeStatus,
    produced,
    artifactId: typeof mp4.artifactId === "string" ? mp4.artifactId : undefined,
    path: typeof mp4.path === "string" ? mp4.path : typeof rec.path === "string" ? rec.path : undefined,
    sha256: typeof mp4.sha256 === "string" ? mp4.sha256 : undefined,
    mimeType: "video/mp4",
    blockingArtifactProducer: false,
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
      metadata: {
        source: "imported_from_lane",
        paidCalls: false,
        encode: consumeEncodeProvenance(imported[0]?.lanePayload),
      },
    };
  };
}

/**
 * Lane H not merged: emit a not_claimed encoded_mp4 provenance stub.
 * Does not FFmpeg. Does not fail the run.
 */
export function createLaneHEncodeStubHandler(): StageHandler {
  return async (ctx) => {
    const imported = ctx.inputs.filter((a) => a.kind === ENCODE_CONTRACT.artifactKind);
    if (imported.length > 0) {
      return {
        artifacts: imported,
        metadata: {
          source: "imported_from_lane",
          paidCalls: false,
          encode: consumeEncodeProvenance(imported[0]?.lanePayload),
        },
      };
    }
    const stub: ArtifactRef = {
      id: `encode-stub-${ctx.runId}`,
      kind: "encoded_mp4",
      mimeType: "video/mp4",
      producedByStage: "review_export",
      producedAt: new Date(0).toISOString(),
      lanePayload: {
        ownerLane: "H",
        paidCalls: false,
        encodeStatus: ENCODE_CONTRACT.encodeStatusWhenUnmerged,
        produced: false,
        blockingArtifactProducer: false,
        notClaimed: ENCODE_CONTRACT.notClaimed,
      },
    };
    return {
      artifacts: [stub],
      metadata: {
        source: "stub",
        paidCalls: false,
        encode: consumeEncodeProvenance(stub.lanePayload),
      },
    };
  };
}

export function isEncodedMp4(artifact: ArtifactRef): boolean {
  return artifact.kind === "encoded_mp4";
}

export function isVideoQaReport(artifact: ArtifactRef): boolean {
  return artifact.kind === "video_qa_report";
}
