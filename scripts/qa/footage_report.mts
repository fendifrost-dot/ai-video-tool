/**
 * FOOTAGE REPORT — run the app's own footage analyzer over a bundle of frames from a local file.
 *
 *     python3 scripts/qa/footage_frames.py --clip take.mp4 --out bundle/
 *     npx tsx scripts/qa/footage_report.mts bundle/ [--json out.json]
 *
 * Everything that MEASURES here is imported from the shipped modules — `cellsOf`, `lumaOf`, `sharpTiles`,
 * `bestShift`, `borderMask`, `faceOf`, `lumaSpread`, `analyzeFootage`, `compatibilityOf`. This file only hands them
 * the frames the browser would have handed them, in the same order and at the same sizes. A number printed here is a
 * number the app produces; where that is not true the run stops rather than printing something that looks like one.
 *
 * The parity check below is the load-bearing part: the Python mirrors `closerWindows` to find a small face, and a
 * mirror that drifts would silently change which frames have a face in them at all.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cellsOf, SERIES_GRID, type SeriesFrame } from "../../src/lib/media/frameSeries.ts";
import {
  lumaOf,
  sharpTiles,
  bestShift,
  borderMask,
  DETAIL_TILES,
  type DetailFrame,
} from "../../src/lib/media/detailSeries.ts";
import { closerWindows, lumaSpread } from "../../src/lib/media/faceSeries.ts";
import { faceOf, type FaceFrame } from "../../src/lib/storyboard/takeCheck.ts";
import {
  analyzeFootage,
  type AnalysisInput,
  type FootageAnalysis,
} from "../../src/lib/storyboard/footage.ts";
import { compatibilityOf } from "../../src/lib/storyboard/compatibility.ts";

const MATCH_SIDE = 64;
const SEEN_SIDE = 48;

type Bundle = {
  clip: string;
  file: {
    width: number | null;
    height: number | null;
    fps: number | null;
    durationSeconds: number | null;
    rotation: number | null;
    hasAudio: boolean;
    codec: string | null;
    transfer: string | null;
  };
  range: [number, number];
  detail: { w: number; h: number };
  light: { w: number; h: number; grid: number };
  face: { w: number; h: number };
  landmarks: ([number, number][] | null)[];
  windows: [number, number, number][];
  fps: number | null;
  scaler: string;
};

function frames(path: string, bytesPerFrame: number): Uint8Array[] {
  const all = new Uint8Array(readFileSync(path));
  const n = Math.floor(all.byteLength / bytesPerFrame);
  return Array.from({ length: n }, (_, i) =>
    all.subarray(i * bytesPerFrame, (i + 1) * bytesPerFrame),
  );
}

function main(): void {
  const dir = process.argv[2];
  if (!dir) throw new Error("usage: footage_report.mts <bundle dir> [--json out.json]");
  const jsonAt = process.argv.indexOf("--json");
  const b = JSON.parse(readFileSync(join(dir, "bundle.json"), "utf8")) as Bundle;

  // parity: the Python's window list must be the one the app would lay out
  const want = closerWindows(b.file.width ?? 0, b.file.height ?? 0);
  const got = b.windows;
  const same =
    want.length === got.length &&
    want.every((w, i) => w[0] === got[i][0] && w[1] === got[i][1] && w[2] === got[i][2]);
  if (!same) {
    console.error("the frame bundle's closer windows are not the app's:");
    console.error("  app:    ", JSON.stringify(want.slice(0, 4)), `… (${want.length})`);
    console.error("  bundle: ", JSON.stringify(got.slice(0, 4)), `… (${got.length})`);
    throw new Error(
      "scripts/qa/footage_frames.py has drifted from src/lib/media/faceSeries.ts — fix the mirror before trusting a report",
    );
  }

  const fps = b.fps ?? 30;
  const at = (i: number) => Math.round((b.range[0] + i / fps) * 1000) / 1000;

  // light: the 12 × 12 colour grid, by the real cellsOf
  const gside = b.light.w;
  const light: SeriesFrame[] = frames(join(dir, "light.bin"), gside * gside * 4).map((rgba, i) => ({
    t: at(i),
    cells: cellsOf(rgba, gside, b.light.grid ?? SERIES_GRID),
  }));

  // detail: sharpness, light and movement, by the real lumaOf / sharpTiles / bestShift
  const big = frames(join(dir, "detail.bin"), b.detail.w * b.detail.h * 4);
  const match = frames(join(dir, "match.bin"), MATCH_SIDE * MATCH_SIDE * 4);
  const mask = borderMask(MATCH_SIDE, Math.max(2, Math.round(MATCH_SIDE * 0.18)));
  const BLACK = 6;
  const WHITE = 249;
  let previous: Uint8Array | null = null;
  const detail: DetailFrame[] = big.map((rgba, i) => {
    const luma = lumaOf(rgba);
    let sum = 0;
    let low = 0;
    let high = 0;
    for (let k = 0; k < luma.length; k++) {
      sum += luma[k];
      if (luma[k] <= BLACK) low++;
      else if (luma[k] >= WHITE) high++;
    }
    const n = luma.length || 1;
    const now = lumaOf(match[i]);
    const whole = previous ? bestShift(previous, now, MATCH_SIDE, 8) : null;
    const border = previous ? bestShift(previous, now, MATCH_SIDE, 8, mask) : null;
    previous = now;
    const share = (s?: [number, number]): [number, number] | null =>
      s
        ? [
            Math.round((s[0] / MATCH_SIDE) * 10000) / 10000,
            Math.round((s[1] / MATCH_SIDE) * 10000) / 10000,
          ]
        : null;
    return {
      t: at(i),
      sharp: sharpTiles(luma, b.detail.w, b.detail.h, DETAIL_TILES),
      luma: Math.round((sum / n / 255) * 10000) / 10000,
      clipLow: Math.round((low / n) * 10000) / 10000,
      clipHigh: Math.round((high / n) * 10000) / 10000,
      shift: share(whole?.shift),
      borderShift: share(border?.shift),
      residual: whole ? whole.residual : null,
    };
  });

  // faces: the real faceOf on the landmarks, and the real lumaSpread for how much there is to see
  const seen = frames(join(dir, "seen.bin"), SEEN_SIDE * SEEN_SIDE * 4);
  const faces: FaceFrame[] = b.landmarks.map((pts, i) => {
    if (!pts) return { t: at(i), face: null };
    const face = faceOf(
      pts.map(([x, y]) => ({ x, y })),
      b.face.w,
      b.face.h,
    );
    if (!face) return { t: at(i), face: null };
    return { t: at(i), face: { ...face, seen: seen[i] ? lumaSpread(seen[i]) : 0 } };
  });

  const input: AnalysisInput = { file: b.file, faces, light, detail, range: b.range };
  const analysis: FootageAnalysis = analyzeFootage(input, new Date().toISOString());
  const spec = compatibilityOf(analysis);

  print(b, analysis, spec);
  if (jsonAt > 0) {
    writeFileSync(
      process.argv[jsonAt + 1],
      JSON.stringify({ clip: b.clip, scaler: b.scaler, analysis, spec }, null, 1),
    );
    console.log(`\nwritten to ${process.argv[jsonAt + 1]}`);
  }
}

function show(
  label: string,
  f: {
    status: string;
    value: unknown;
    confidence: number | null;
    evidence: string;
    limit?: string;
  },
): void {
  const mark =
    f.status === "measured"
      ? "measured "
      : f.status === "estimated"
        ? `est ${String(f.confidence).padEnd(4)}`
        : "unknown  ";
  const v =
    f.value === null
      ? "—"
      : typeof f.value === "object"
        ? JSON.stringify(f.value)
        : String(f.value);
  console.log(`  ${label.padEnd(22)} ${mark}  ${v}`);
  console.log(`  ${" ".repeat(22)}           ↳ ${f.evidence}`);
  if (f.limit) console.log(`  ${" ".repeat(22)}           ! ${f.limit}`);
}

function print(b: Bundle, a: FootageAnalysis, spec: ReturnType<typeof compatibilityOf>): void {
  console.log(`\n═══ ${b.clip}`);
  console.log(
    `    ${a.sampled.faceFrames} frames read · face in ${a.subject.faceCoverage.value ?? 0} of them · scaler: ${b.scaler}\n`,
  );
  const groups: [string, Record<string, unknown>][] = [
    ["FILE", a.file],
    ["SUBJECT", a.subject],
    ["CAMERA", a.camera],
    ["LIGHT", a.light],
    ["FOCUS", a.focus],
    ["SEPARATION", a.separation],
    ["FLOOR", a.floor],
    ["AUDIO", a.audio],
  ];
  for (const [name, g] of groups) {
    console.log(`── ${name}`);
    for (const [k, v] of Object.entries(g)) {
      if (v && typeof v === "object" && "status" in (v as object)) show(k, v as never);
      else if (Array.isArray(v) && v.length)
        console.log(`  ${k.padEnd(22)}            ${v.join("; ")}`);
    }
    console.log("");
  }
  console.log("── NOT ESTABLISHED");
  for (const n of a.notEstablished) console.log(`  · ${n}`);
  console.log("\n── BACKGROUND COMPATIBILITY");
  console.log(`  route: ${spec.route.choice}  (confidence ${spec.route.confidence})`);
  for (const r of spec.route.because) console.log(`    because ${r}`);
  console.log("  hard constraints:");
  for (const c of spec.hard) console.log(`    · [${c.kind}] ${c.text}`);
  console.log("  preferences:");
  for (const c of spec.preferences) console.log(`    · [${c.kind}] ${c.text}`);
  if (spec.capture.length) {
    console.log("  capture checklist:");
    for (const c of spec.capture) console.log(`    · ${c}`);
  }
  if (spec.gaps.length) {
    console.log("  AVT cannot do this today:");
    for (const g of spec.gaps) console.log(`    · ${g}`);
  }
  console.log("");
}

main();
