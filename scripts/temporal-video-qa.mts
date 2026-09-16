/**
 * $0 Lane C2 temporal video QA — full canonical clip + chunked proxy windows.
 * In-lib only. No Grok / Fal / CC / live 1080×1920 ingest.
 *
 * Usage:
 *   npx tsx scripts/temporal-video-qa.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CANONICAL_QA_CLIP_SPEC, SECOND_QA_CLIP_SPEC } from "../src/lib/temporal/clipSpec";
import {
  canonicalFullClipCleanFixture,
  canonicalFullClipDefectFixture,
} from "../src/lib/temporal/fullClipFixture";
import { secondClipCleanFixture, translatingChunkSeamFixture } from "../src/lib/temporal/portableFixture";
import {
  chunkedTemporalVideoQaToJson,
  formatChunkedTemporalVideoQaSummary,
  runChunkedTemporalVideoQa,
} from "../src/lib/temporal/qa/chunkReport";
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

function writeChunked(
  name: string,
  fixture: ReturnType<typeof canonicalFullClipCleanFixture>,
  spec: typeof CANONICAL_QA_CLIP_SPEC,
): void {
  const started = Date.now();
  const report = runChunkedTemporalVideoQa(fixture, spec);
  const json = chunkedTemporalVideoQaToJson(report);
  writeFileSync(`${OUT_DIR}/${name}`, `${JSON.stringify(json, null, 2)}\n`);
  process.stdout.write(
    `${formatChunkedTemporalVideoQaSummary(report)} wrote ${name} (${Date.now() - started} ms)\n`,
  );
}

writeEvidence("full-clip-clean.json", canonicalFullClipCleanFixture());
writeEvidence("full-clip-defects.json", canonicalFullClipDefectFixture());
writeChunked("chunked-canonical.json", canonicalFullClipCleanFixture(), CANONICAL_QA_CLIP_SPEC);
writeChunked("chunked-second-clip.json", secondClipCleanFixture(), SECOND_QA_CLIP_SPEC);
writeChunked("chunked-translating-seam.json", translatingChunkSeamFixture(30), {
  ...SECOND_QA_CLIP_SPEC,
  id: "temporal-qa-translating-seam-probe",
  frameCount: 30,
  fps: 24,
  keyframeIndex: 0,
  keyframeTimeSec: 0,
  lineageNote: "YELLOW probe — translating luma vs per-window CLEARED quad reset",
});
