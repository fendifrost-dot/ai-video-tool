#!/usr/bin/env node
// AVT durable edit-render worker. Polls edit-render-worker-api, encodes queued Timeline renders with ffmpeg,
// uploads the MP4 to project-exports and marks the row complete (or failed with a reason). $0: no providers.
//
//   AVT_WORKER_SECRET=... node --experimental-strip-types workers/edit-render/worker.mjs [--once]
// Env: AVT_WORKER_SECRET (required), AVT_WORKER_API (required: <SUPABASE_URL>/functions/v1/edit-render-worker-api),
//      AVT_WORKER_ID (default hostname-pid), AVT_POLL_SECONDS (default 10).
import { createHash } from "node:crypto";
import { createReadStream, mkdtempSync, readFileSync, rmSync, statfsSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { encodePlan } from "../../scripts/edit-render/encode.mjs";
import { mayClearScratch } from "./cache.mjs";
import { verifyMp4 } from "./verify.mjs";

let busy = false;

export function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}

/** Refuse a job when the scratch disk cannot hold it. One job holds the process. */
export function assertDisk(dir, needBytes) {
  const stats = statfsSync(dir);
  const free = Number(stats.bavail) * Number(stats.bsize);
  if (free < needBytes) throw new Error(`need ${needBytes} bytes free, have ${free}`);
  return free;
}

export function log(event, fields = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

export function makeApi({ url, secret, fetchImpl = fetch }) {
  return async (body) => {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-worker-secret": secret },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false)
      throw new Error(
        `api ${body.action} ${res.status} ${data.error ?? ""} ${data.message ?? ""}`.trim(),
      );
    return data;
  };
}

export async function uploadSigned(signedUrl, file, fetchImpl = fetch, sha256 = "") {
  const headers = { "content-type": "video/mp4", "x-upsert": "true" };
  if (sha256) headers["x-metadata"] = Buffer.from(JSON.stringify({ sha256 })).toString("base64");
  const res = await fetchImpl(signedUrl, {
    method: "PUT",
    headers,
    body: readFileSync(file),
  });
  if (!res.ok)
    throw new Error(`upload failed ${res.status} ${await res.text().catch(() => "")}`.trim());
}

/** One poll: claim → encode → verify → upload → complete. Returns the render id handled, or null when idle. */
export async function runOnce({
  api,
  workerId,
  encode = encodePlan,
  verify = verifyMp4,
  upload = uploadSigned,
  disk = () => assertDisk(tmpdir(), 64 * 1024 * 1024),
  hashFile = sha256File,
  runJob = null,
}) {
  if (busy) throw new Error("one job at a time");
  busy = true;
  let dir = null;
  let clearScratch = false;
  let render = null;
  try {
    disk();
    const claim = await api({ action: "claim", workerId });
    if (!claim.render) return null;
    render = claim.render;
    log("claimed", { renderId: render.id, kind: render.kind, jobKind: render.job_kind ?? "edit", attempts: render.attempts });
    dir = mkdtempSync(join(tmpdir(), "avt-render-"));
    const out = join(dir, `${render.id}.mp4`);
    const jobKind = render.job_kind ?? "edit";
    let summary = { durationSeconds: null, bytes: null };
    if (jobKind !== "edit") {
      if (!runJob) throw new Error(`no runner for ${jobKind}`);
      summary = await runJob(render, dir);
    } else {
      await encode(render.plan, out, {
        urls: claim.signed ?? {},
        stdio: "pipe",
        log: (line) => log("encode", { renderId: render.id, line }),
      });
      const check = verify(out);
      if (!check.ok) throw new Error(`output check failed: ${check.problems.join(", ")}`);
      summary = check.summary;
    }
    const sha256 = summary.sha256 ?? (await hashFile(out));
    await upload(claim.upload.signedUrl, out, undefined, sha256);
    const done = await api({
      action: "complete",
      workerId,
      renderId: render.id,
      durationSeconds: summary.durationSeconds,
      bytes: summary.bytes,
      probe: summary,
      sha256,
    });
    clearScratch = mayClearScratch({ uploaded: true, sha256Match: done.sha256_match === true, jobComplete: done.ok !== false });
    log("complete", {
      renderId: render.id,
      path: done.path,
      assetId: done.assetId,
      sha256_match: done.sha256_match === true,
      scratch_cleared: clearScratch,
      ...summary,
    });
    return render.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!render) throw error;
    log("failed", { renderId: render.id, error: message });
    await api({ action: "fail", workerId, renderId: render.id, error: message }).catch((e) =>
      log("fail_report_error", { error: String(e) }),
    );
    return render.id;
  } finally {
    busy = false;
    if (dir && clearScratch) rmSync(dir, { recursive: true, force: true });
    else if (dir) log("scratch_kept", { dir });
  }
}

async function main() {
  const secret = process.env.AVT_WORKER_SECRET ?? "";
  if (!secret || !process.env.AVT_WORKER_API) {
    console.error("AVT_WORKER_SECRET and AVT_WORKER_API are required");
    process.exit(2);
  }
  const api = makeApi({ url: process.env.AVT_WORKER_API, secret });
  const workerId = process.env.AVT_WORKER_ID || `${hostname()}-${process.pid}`;
  const pollMs = Math.max(2, Number(process.env.AVT_POLL_SECONDS) || 10) * 1000;
  const once = process.argv.includes("--once");
  let stopping = false;
  for (const sig of ["SIGTERM", "SIGINT"])
    process.on(sig, () => {
      stopping = true;
      log("stopping", { sig });
    });
  log("start", { workerId, once });
  do {
    let handled = null;
    try {
      handled = await runOnce({ api, workerId });
    } catch (error) {
      log("poll_error", { error: error instanceof Error ? error.message : String(error) });
    }
    if (once) break;
    if (!handled) await new Promise((r) => setTimeout(r, pollMs));
  } while (!stopping);
  log("stopped", { workerId });
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
