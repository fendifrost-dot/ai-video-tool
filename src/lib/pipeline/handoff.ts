/**
 * Kind-based artifact handoff.
 *
 * A passed stage offers its produced kinds to downstream stages that consume
 * them. Compatibility is ArtifactKind, never clip/project id — that is what
 * makes a second existing clip portable without clip-specific orchestration.
 */

import { STAGE_DEFINITION_LIST, getStageDefinition } from "./contract";
import type { ArtifactHandoff, ArtifactKind, ArtifactRef, PipelineRun, PipelineStageId } from "./types";
import { lifecycleFromStatus } from "./lifecycle";

export function kindsCompatible(
  produced: readonly ArtifactKind[],
  consumed: readonly ArtifactKind[],
): boolean {
  return produced.some((kind) => consumed.includes(kind));
}

export function nextCompatibleStages(fromStage: PipelineStageId): PipelineStageId[] {
  const produced = getStageDefinition(fromStage).produces;
  return STAGE_DEFINITION_LIST.filter(
    (def) => def.dependsOn.includes(fromStage) && kindsCompatible(produced, def.consumes),
  ).map((def) => def.id);
}

export function artifactsForHandoff(
  run: PipelineRun,
  fromStage: PipelineStageId,
  toStage: PipelineStageId,
): ArtifactRef[] {
  const produced = new Set(getStageDefinition(fromStage).produces);
  const consumed = new Set(getStageDefinition(toStage).consumes);
  const wanted = [...produced].filter((kind) => consumed.has(kind));
  const fromRecord = run.stages[fromStage];
  const pool = fromRecord.artifacts.length > 0 ? fromRecord.artifacts : run.artifacts;
  return pool.filter((a) => wanted.includes(a.kind));
}

export function buildHandoffs(
  run: PipelineRun,
  fromStage: PipelineStageId,
  createId: () => string,
  at: string,
): ArtifactHandoff[] {
  const fromLifecycle = lifecycleFromStatus(run.stages[fromStage].status, run.stages[fromStage].lastError);
  if (fromLifecycle !== "passed") return [];

  const out: ArtifactHandoff[] = [];
  for (const toStage of nextCompatibleStages(fromStage)) {
    const arts = artifactsForHandoff(run, fromStage, toStage);
    if (arts.length === 0) continue;
    const already = run.handoffs.some(
      (h) =>
        h.fromStage === fromStage &&
        h.toStage === toStage &&
        h.artifactIds.join(",") === arts.map((a) => a.id).join(","),
    );
    if (already) continue;
    out.push({
      id: createId(),
      fromStage,
      toStage,
      artifactIds: arts.map((a) => a.id),
      kinds: arts.map((a) => a.kind),
      compatibility: "kinds_match",
      at,
    });
  }
  return out;
}

export function applyHandoffs(run: PipelineRun, added: ArtifactHandoff[]): PipelineRun {
  if (added.length === 0) return run;
  return { ...run, handoffs: [...run.handoffs, ...added] };
}

/** True when `toStage` has every required kind available on the run. */
export function stageInputsSatisfied(run: PipelineRun, toStage: PipelineStageId): boolean {
  const def = getStageDefinition(toStage);
  const kinds = new Set(run.artifacts.map((a) => a.kind));
  const allOk = def.requiredAll.every((k) => kinds.has(k));
  const anyOk = def.requiredAny.length === 0 || def.requiredAny.some((k) => kinds.has(k));
  return allOk && anyOk;
}
