import { PIPELINE_STAGE_IDS, type PipelineStageId, type StageDefinition } from "./types";

export function topologicalStages(definitions: readonly StageDefinition[]): PipelineStageId[] {
  const byId = new Map(definitions.map((d) => [d.id, d]));
  const visiting = new Set<PipelineStageId>();
  const visited = new Set<PipelineStageId>();
  const ordered: PipelineStageId[] = [];

  const visit = (id: PipelineStageId) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`pipeline_cycle:${id}`);
    }
    visiting.add(id);
    const def = byId.get(id);
    if (!def) throw new Error(`unknown_stage:${id}`);
    for (const dep of def.dependsOn) visit(dep);
    visiting.delete(id);
    visited.add(id);
    ordered.push(id);
  };

  for (const id of PIPELINE_STAGE_IDS) {
    if (byId.has(id)) visit(id);
  }
  return ordered;
}

export function assertAcyclic(definitions: readonly StageDefinition[]): void {
  topologicalStages(definitions);
}

export function upstreamClosure(
  stageId: PipelineStageId,
  definitions: readonly StageDefinition[],
): PipelineStageId[] {
  const byId = new Map(definitions.map((d) => [d.id, d]));
  const seen = new Set<PipelineStageId>();
  const walk = (id: PipelineStageId) => {
    const def = byId.get(id);
    if (!def) return;
    for (const dep of def.dependsOn) {
      if (seen.has(dep)) continue;
      seen.add(dep);
      walk(dep);
    }
  };
  walk(stageId);
  return [...seen];
}
