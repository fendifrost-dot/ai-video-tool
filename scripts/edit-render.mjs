#!/usr/bin/env node
// Encode a queued edit plan. The plan must cost 0 and name no provider.
//
// A structural plan (colour bars, no resolved files) is run as written.
// A plan with resolved media downloads each signed storage URL, probes the
// file with ffprobe, and rebuilds the ffmpeg command with those local paths
// and measured durations. The 4.04 s filing default is not a duration.
//
//   node --experimental-strip-types scripts/edit-render.mjs <plan.json> <output.mp4>
import { spawnSync } from "node:child_process";
import { createWriteStream, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { assertPlanSafe } from "../supabase/functions/_shared/editModel.ts";
import {
  assertMediaUrls,
  renderPlanFor,
  resolutionFromReport,
  storageSignUrlOk,
} from "../supabase/functions/_shared/editMedia.ts";

const MAX_BYTES = 200 * 1024 * 1024;
const BLOCKED = /https?:|fal\.ai|api\.x\.ai|openai\.com|montage-shot|lipsync-shot|grok-|topaz/i;

const [planPath, output] = process.argv.slice(2);
if (!planPath || !output) {
  console.error(
    "usage: node --experimental-strip-types scripts/edit-render.mjs <plan.json> <output.mp4>",
  );
  process.exit(2);
}

const plan = JSON.parse(readFileSync(planPath, "utf8"));
if (plan.costUsd !== 0 || plan.billable !== false) {
  console.error("refusing a plan that is not free");
  process.exit(1);
}

function assertLocalArgv(argv) {
  if (BLOCKED.test(argv.join(" "))) {
    throw new Error("refusing a plan with a remote or billable input");
  }
}

function probeDuration(file) {
  const run = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    { encoding: "utf8", timeout: 30_000 },
  );
  if (run.status !== 0) return null;
  const seconds = Number(String(run.stdout).trim());
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

async function download(url, dest) {
  if (!storageSignUrlOk(url))
    throw new Error("refusing a media url that is not this project's storage");
  const response = await fetch(url, { redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    throw new Error("refusing a storage download that redirects");
  }
  if (!response.ok || !response.body) throw new Error(`download failed (${response.status})`);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES)
    throw new Error("file is larger than 200 MB");
  let seen = 0;
  const limited = response.body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > MAX_BYTES) throw new Error("file is larger than 200 MB");
        controller.enqueue(chunk);
      },
    }),
  );
  await pipeline(Readable.fromWeb(limited), createWriteStream(dest));
  return seen;
}

function ffmpegStatus(argv) {
  assertLocalArgv(argv);
  const args = argv.slice(1).map((arg) => (arg === "OUTPUT" ? output : arg));
  const run = spawnSync(argv[0], args, { stdio: "inherit", timeout: 600_000 });
  return run.status ?? 1;
}

const items = plan.inputs?.items ?? [];
if (items.length === 0) {
  try {
    process.exit(ffmpegStatus(plan.argv ?? []));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

if (!plan.sequence) {
  console.error("plan has resolved media but no sequence to rebuild after ffprobe");
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), "avt-edit-"));
try {
  const locals = {};
  const probes = {};
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.assetId)) continue;
    seen.add(item.assetId);
    if (!item.url || !storageSignUrlOk(item.url)) {
      throw new Error(`refusing ${item.assetId}: unsigned or not this project's storage`);
    }
    const safe = basename(String(item.path || item.assetId)).replace(/[^a-zA-Z0-9._-]/g, "_");
    const file = join(dir, `${item.assetId.slice(0, 8)}-${safe}`);
    const bytes = await download(item.url, file);
    locals[item.assetId] = file;
    const duration = probeDuration(file);
    if (duration != null) probes[item.assetId] = duration;
    console.error(
      `media ${item.role} ${item.assetId} ${bytes} bytes${duration != null ? ` ${duration.toFixed(3)}s` : " duration unprobed"}`,
    );
  }
  const rebuilt = renderPlanFor(
    plan.sequence,
    resolutionFromReport(plan.inputs),
    {},
    {
      kind: plan.kind,
      aspect: plan.aspect,
      locals,
      probes,
      grain: typeof plan.filterComplex === "string" && plan.filterComplex.includes("noise=alls="),
      upscale: plan.upscale != null,
    },
  );
  assertPlanSafe(rebuilt);
  assertMediaUrls(rebuilt);
  console.error(
    `encoding ${rebuilt.inputs.realCount} picture inputs${rebuilt.inputs.song ? " plus song" : ""}`,
  );
  const status = ffmpegStatus(rebuilt.argv);
  rmSync(dir, { recursive: true, force: true });
  process.exit(status);
} catch (error) {
  rmSync(dir, { recursive: true, force: true });
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
