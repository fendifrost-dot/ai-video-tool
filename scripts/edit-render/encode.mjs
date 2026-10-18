// Importable core of scripts/edit-render.mjs: encodePlan(plan, output) → resolves on success, throws on failure.
// The plan must cost 0 and name no provider. A structural plan (no resolved files) runs as written. A plan with
// resolved media downloads each signed storage URL (200 MB cap), probes it with ffprobe, and rebuilds the ffmpeg
// argv with local paths and measured durations. Options: { urls: {assetId: signedUrl} } overrides the (possibly
// expired) URLs stored in the plan; { log } receives progress lines.
import { spawnSync } from "node:child_process";
import { createWriteStream, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { assertPlanSafe } from "../../supabase/functions/_shared/editModel.ts";
import {
  assertMediaUrls,
  renderPlanFor,
  resolutionFromReport,
  storageSignUrlOk,
} from "../../supabase/functions/_shared/editMedia.ts";

const MAX_BYTES = 200 * 1024 * 1024;
const BLOCKED = /https?:|fal\.ai|api\.x\.ai|openai\.com|montage-shot|lipsync-shot|grok-|topaz/i;

export function assertFreePlan(plan) {
  if (plan.costUsd !== 0 || plan.billable !== false)
    throw new Error("refusing a plan that is not free");
}

export function assertLocalArgv(argv) {
  if (BLOCKED.test(argv.join(" ")))
    throw new Error("refusing a plan with a remote or billable input");
}

export function probeDuration(file) {
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
  if (response.status >= 300 && response.status < 400)
    throw new Error("refusing a storage download that redirects");
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

function runFfmpeg(argv, output, stdio) {
  assertLocalArgv(argv);
  const args = argv.slice(1).map((arg) => (arg === "OUTPUT" ? output : arg));
  const run = spawnSync(argv[0], args, { stdio, timeout: 600_000, encoding: "utf8" });
  if ((run.status ?? 1) !== 0) {
    const tail = String(run.stderr ?? "")
      .trim()
      .split("\n")
      .slice(-4)
      .join(" | ");
    throw new Error(`ffmpeg exited ${run.status ?? "signal"}${tail ? `: ${tail}` : ""}`);
  }
}

export async function encodePlan(plan, output, opts = {}) {
  const log = opts.log ?? ((line) => console.error(line));
  const stdio = opts.stdio ?? "inherit";
  assertFreePlan(plan);
  const items = plan.inputs?.items ?? [];
  if (items.length === 0) {
    runFfmpeg(plan.argv ?? [], output, stdio);
    return { realCount: 0 };
  }
  if (!plan.sequence)
    throw new Error("plan has resolved media but no sequence to rebuild after ffprobe");
  const dir = mkdtempSync(join(tmpdir(), "avt-edit-"));
  try {
    const locals = {};
    const probes = {};
    const seen = new Set();
    for (const item of items) {
      if (seen.has(item.assetId)) continue;
      seen.add(item.assetId);
      const url = opts.urls?.[item.assetId] ?? item.url;
      if (!url || !storageSignUrlOk(url)) {
        throw new Error(`refusing ${item.assetId}: unsigned or not this project's storage`);
      }
      const safe = basename(String(item.path || item.assetId)).replace(/[^a-zA-Z0-9._-]/g, "_");
      const file = join(dir, `${item.assetId.slice(0, 8)}-${safe}`);
      const bytes = await download(url, file);
      locals[item.assetId] = file;
      const duration = probeDuration(file);
      if (duration != null) probes[item.assetId] = duration;
      log(
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
    log(
      `encoding ${rebuilt.inputs.realCount} picture inputs${rebuilt.inputs.song ? " plus song" : ""}`,
    );
    runFfmpeg(rebuilt.argv, output, stdio);
    return { realCount: rebuilt.inputs.realCount };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
