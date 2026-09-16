/**
 * Materialize Lane E2 video-QA JSON + diagnostic PPM/BMP crops.
 */

import { encodeBmp24, encodePpm } from "./pixelMath";
import type { MaterializedEvalFiles } from "./visualArtifacts";
import type { VideoQaJson, VideoQaReport } from "./videoQaTypes";

function cropCriterionId(id: string): string {
  if (id.startsWith("outside_change_")) return "unintended_outside_region_change";
  if (id.startsWith("seam_")) return "seam_edge_instability";
  if (id.startsWith("abs_diff_")) return "temporal_jitter_drift";
  return "diagnostic";
}

function cropFrameIndex(id: string): number {
  const m = id.match(/_f(\d+)$/);
  return m ? Number(m[1]) : 0;
}

export function videoQaReportToJson(report: VideoQaReport): VideoQaJson {
  return {
    schemaVersion: report.schemaVersion,
    verdict: report.verdict,
    passCount: report.passCount,
    failCount: report.failCount,
    skipCount: report.skipCount,
    paidCalls: report.paidCalls,
    stillGoldensReopened: report.stillGoldensReopened,
    blockingArtifactProducer: report.blockingArtifactProducer,
    claudeInvestigates: report.claudeInvestigates,
    awaiting: report.awaiting,
    frameCount: report.frameCount,
    artifactKind: report.artifactKind,
    mp4: report.mp4,
    criteria: report.criteria.map((c) => ({
      id: c.id,
      name: c.name,
      verdict: c.verdict,
      metrics: c.metrics,
      note: c.note,
      failureReason: c.failureReason,
    })),
    perFrame: report.perFrame,
    temporal: report.temporal,
    artifacts: {
      crops: report.artifacts.crops.map((c) => ({
        id: c.id,
        criterionId: cropCriterionId(c.id),
        frameIndex: cropFrameIndex(c.id),
        box: c.box,
        width: c.image.width,
        height: c.image.height,
        files: [`${c.id}.ppm`, `${c.id}.bmp`],
      })),
    },
    unexplained: report.unexplained,
    escalate: report.escalate,
    notClaimed: report.notClaimed,
    provenance: report.provenance,
  };
}

export function serializeVideoQaReport(report: VideoQaReport): string {
  return `${JSON.stringify(videoQaReportToJson(report), null, 2)}\n`;
}

export function materializeVideoQaFiles(report: VideoQaReport): MaterializedEvalFiles {
  const files: MaterializedEvalFiles = {
    "report.json": new TextEncoder().encode(serializeVideoQaReport(report)),
  };
  for (const crop of report.artifacts.crops) {
    files[`${crop.id}.ppm`] = encodePpm(crop.image);
    files[`${crop.id}.bmp`] = encodeBmp24(crop.image);
  }
  return files;
}

export function formatVideoQaSummary(report: VideoQaReport): string {
  const n = report.passCount + report.failCount + report.skipCount;
  const mp4 = report.mp4?.produced ? "mp4=produced" : "mp4=none";
  return `Lane E2 video QA ${report.schemaVersion}: ${report.verdict} ${report.passCount}/${n} fail=${report.failCount} skip=${report.skipCount} frames=${report.frameCount} ${mp4} paidCalls=false stillGoldensReopened=false.`;
}
