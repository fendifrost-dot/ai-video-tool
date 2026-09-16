/**
 * Consume-only stage version pins.
 *
 * These strings name other lanes' method/contract versions. Lane G2 does not
 * bump paint, reconstruct, or eval implementations — it records which version
 * a stage was bound to when it passed.
 */

import type { PipelineStageId } from "./types";

export const STAGE_VERSIONS: Record<PipelineStageId, string> = {
  ingest: "ingest-extract-v1",
  generation: "generation-import-only-v1",
  keyframe_repair: "architecture_c_still_repair_1m",
  sleeve_garment_repair: "architecture_c_sleeve_still_1c",
  temporal_propagation: "temporal_propagation_1.0.0",
  original_master_reconstruction: "reconstruct_e2e_1.0.0",
  deterministic_branding: "placement-consume-v1",
  automated_evaluation: "lane-e-reconstruct-video-v1",
  review_export: "review-export-consume-v1",
};

export function stageVersionFor(stageId: PipelineStageId): string {
  return STAGE_VERSIONS[stageId];
}
