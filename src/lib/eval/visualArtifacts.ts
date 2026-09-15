/**
 * Materialize evaluator artifacts: JSON report + PPM/BMP diffs and crops.
 */

import { CHEST_EVAL_SPEC_VERSION, type ChestVisualReport, type EvalCrop } from "./types";
import { encodeBmp24, encodePpm } from "./pixelMath";

export type ChestEvalJson = {
  schemaVersion: typeof CHEST_EVAL_SPEC_VERSION;
  verdict: "PASS" | "FAIL";
  passCount: number;
  failCount: number;
  criteria: Array<{
    id: number;
    key: string;
    name: string;
    verdict: "PASS" | "FAIL";
    metrics: Record<string, number>;
    windows: ChestVisualReport["criteria"][number]["windows"];
    note: string;
    failureReason: string | null;
  }>;
  unexplained: string[];
  scoring: ChestVisualReport["scoring"];
  artifacts: {
    absDiff: { id: string; width: number; height: number; files: string[] };
    crops: Array<{
      id: string;
      box: EvalCrop["box"];
      width: number;
      height: number;
      files: string[];
    }>;
  };
};

export function chestEvalReportToJson(report: ChestVisualReport): ChestEvalJson {
  return {
    schemaVersion: report.schemaVersion,
    verdict: report.verdict,
    passCount: report.passCount,
    failCount: report.failCount,
    criteria: report.criteria.map((c) => ({
      id: c.id,
      key: c.key,
      name: c.name,
      verdict: c.verdict,
      metrics: c.metrics,
      windows: c.windows,
      note: c.note,
      failureReason: c.failureReason,
    })),
    unexplained: report.unexplained,
    scoring: report.scoring,
    artifacts: {
      absDiff: {
        id: "abs_diff",
        width: report.artifacts.absDiff.width,
        height: report.artifacts.absDiff.height,
        files: ["abs_diff.ppm", "abs_diff.bmp"],
      },
      crops: report.artifacts.crops.map((c) => ({
        id: c.id,
        box: c.box,
        width: c.image.width,
        height: c.image.height,
        files: [`${c.id}.ppm`, `${c.id}.bmp`],
      })),
    },
  };
}

export function serializeChestEvalReport(report: ChestVisualReport): string {
  return `${JSON.stringify(chestEvalReportToJson(report), null, 2)}\n`;
}

export type MaterializedEvalFiles = Record<string, Uint8Array>;

/** In-memory files: JSON + PPM/BMP for the abs-diff and each crop. */
export function materializeChestEvalFiles(report: ChestVisualReport): MaterializedEvalFiles {
  const files: MaterializedEvalFiles = {
    "report.json": new TextEncoder().encode(serializeChestEvalReport(report)),
    "abs_diff.ppm": encodePpm(report.artifacts.absDiff),
    "abs_diff.bmp": encodeBmp24(report.artifacts.absDiff),
  };
  for (const crop of report.artifacts.crops) {
    files[`${crop.id}.ppm`] = encodePpm(crop.image);
    files[`${crop.id}.bmp`] = encodeBmp24(crop.image);
  }
  return files;
}

export function formatChestEvalSummary(report: ChestVisualReport): string {
  const lines = [
    `Chest visual eval ${report.schemaVersion}: ${report.verdict} (${report.passCount}/11)`,
    `ghostTerritory=${report.scoring.ghostTerritory} bandAuthorityMaskUsed=${report.scoring.bandAuthorityMaskUsed}`,
  ];
  for (const c of report.criteria) {
    const extra = c.failureReason ? ` — ${c.failureReason}` : "";
    lines.push(`  ${c.id}. ${c.name}: ${c.verdict}${extra}`);
  }
  if (report.unexplained.length) {
    lines.push(`unexplained: ${report.unexplained.join("; ")}`);
  }
  return lines.join("\n");
}
