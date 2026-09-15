import {
  ARTIFACT_KINDS,
  PIPELINE_CONTRACT_VERSION,
  PIPELINE_RUN_STATUSES,
  PIPELINE_STAGE_IDS,
  STAGE_STATUSES,
  type ArtifactRef,
  type PipelineRun,
  type PipelineStageId,
  type StageRecord,
} from "./types";

export const PIPELINE_METADATA_KEY = "pipeline_run" as const;

export type PipelineDocument = {
  [PIPELINE_METADATA_KEY]: PipelineRun;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`pipeline_document_invalid:${label}`);
  }
  return value;
}

function parseArtifact(value: unknown): ArtifactRef {
  if (!isRecord(value)) throw new Error("pipeline_document_invalid:artifact");
  const kind = asString(value.kind, "artifact.kind");
  if (!(ARTIFACT_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`pipeline_document_invalid:artifact.kind:${kind}`);
  }
  const producedByStage = asString(value.producedByStage, "artifact.producedByStage");
  if (producedByStage !== "seed" && !(PIPELINE_STAGE_IDS as readonly string[]).includes(producedByStage)) {
    throw new Error(`pipeline_document_invalid:artifact.producedByStage:${producedByStage}`);
  }
  return value as ArtifactRef;
}

function parseStageRecord(stageId: PipelineStageId, value: unknown): StageRecord {
  if (!isRecord(value)) throw new Error(`pipeline_document_invalid:stage:${stageId}`);
  const status = asString(value.status, `stage.${stageId}.status`);
  if (!(STAGE_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`pipeline_document_invalid:stage.${stageId}.status:${status}`);
  }
  return value as StageRecord;
}

export function serializePipelineRun(run: PipelineRun): string {
  return JSON.stringify(run);
}

export function parsePipelineRun(raw: unknown): PipelineRun {
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!isRecord(value)) throw new Error("pipeline_document_invalid:root");
  if (value.contractVersion !== PIPELINE_CONTRACT_VERSION) {
    throw new Error(`pipeline_document_unsupported:${String(value.contractVersion)}`);
  }
  const status = asString(value.status, "status");
  if (!(PIPELINE_RUN_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`pipeline_document_invalid:status:${status}`);
  }
  if (!isRecord(value.stages)) throw new Error("pipeline_document_invalid:stages");
  const stages = {} as PipelineRun["stages"];
  for (const id of PIPELINE_STAGE_IDS) {
    stages[id] = parseStageRecord(id, value.stages[id]);
  }
  const artifacts = Array.isArray(value.artifacts) ? value.artifacts.map(parseArtifact) : [];
  return {
    ...(value as unknown as PipelineRun),
    stages,
    artifacts,
  };
}

/** Embed a run on project_assets.metadata_json without inventing a SQL table. */
export function embedPipelineRun(metadata: Record<string, unknown> | null | undefined, run: PipelineRun): Record<string, unknown> {
  return { ...(metadata ?? {}), [PIPELINE_METADATA_KEY]: run };
}

export function readEmbeddedPipelineRun(metadata: unknown): PipelineRun | null {
  if (!isRecord(metadata)) return null;
  const doc = metadata[PIPELINE_METADATA_KEY];
  if (doc === undefined) return null;
  return parsePipelineRun(doc);
}
