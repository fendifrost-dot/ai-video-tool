/**
 * $0 Lane C2 temporal video QA — full canonical clip (241 frames).
 * In-lib propagateRepair only. No Grok / Fal / CC / live 1080×1920 ingest.
 *
 * Usage:
 *   npx tsx scripts/temporal-video-qa.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalFullClipCleanFixture,
  canonicalFullClipDefectFixture,
} from "../src/lib/temporal/fullClipFixture";
import {
  formatTemporalVideoQaSummary,
  runTemporalVideoQa,
  temporalVideoQaReportToJson,
} from "../src/lib/temporal/qa/report";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = process.env.TEMPORAL_QA_OUT_DIR ?? `${ROOT}/docs/temporal/video-qa`;

mkdirSync(OUT_DIR, { recursive: true });

function writeEvidence(name: string, fixture: ReturnType<typeof canonicalFullClipCleanFixture>): void {
  const started = Date.now();
  const report = runTemporalVideoQa(fixture);
  const json = temporalVideoQaReportToJson(report);
  writeFileSync(`${OUT_DIR}/${name}`, `${JSON.stringify(json, null, 2)}\n`);
  const compact = {
    schemaVersion: json.schemaVersion,
    verdict: json.verdict,
    summaryLine: formatTemporalVideoQaSummary(report),
    passCount: json.passCount,
    failCount: json.failCount,
    paidCalls: json.paidCalls,
    grokPerFrame: json.grokPerFrame,
    sam3LiveFetch: json.sam3LiveFetch,
    fixtureMode: json.fixtureMode,
    clip: json.clip,
    summary: json.summary,
    badFrameCount: report.summary.badFrameCount,
    yellowContracts: json.yellowContracts,
    dispatchPath: json.dispatchPath,
    criteria: json.criteria,
    elapsedMs: Date.now() - started,
  };
  writeFileSync(
    `${OUT_DIR}/${name.replace(".json", ".summary.json")}`,
    `${JSON.stringify(compact, null, 2)}\n`,
  );
  process.stdout.write(`${formatTemporalVideoQaSummary(report)} wrote ${name} (${Date.now() - started} ms)\n`);
}

writeEvidence("full-clip-clean.json", canonicalFullClipCleanFixture());
writeEvidence("full-clip-defects.json", canonicalFullClipDefectFixture());
