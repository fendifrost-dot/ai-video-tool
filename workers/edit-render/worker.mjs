#!/usr/bin/env node
// AVT durable edit-render worker. Polls edit-render-worker-api, encodes queued Timeline renders with ffmpeg,
// uploads the MP4 to project-exports and marks the row complete (or failed with a reason). $0: no providers.
//
//   AVT_WORKER_SECRET=... node --experimental-strip-types workers/edit-render/worker.mjs [--once]
// Env: AVT_WORKER_SECRET (required), AVT_WORKER_API (required: <SUPABASE_URL>/functions/v1/edit-render-worker-api),
//      AVT_WORKER_ID (default hostname-pid), AVT_POLL_SECONDS (default 10).
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { encodePlan } from "../../scripts/edit-render/encode.mjs";
import { verifyMp4 } from "./verify.mjs";

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

export async function uploadSigned(signedUrl, file, fetchImpl = fetch) {
  const res = await fetchImpl(signedUrl, {
    method: "PUT",
    headers: { "content-type": "video/mp4", "x-upsert": "true" },
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
}) {
  const claim = await api({ action: "claim", workerId });
  if (!claim.render) return null;
  const render = claim.render;
  log("claimed", { renderId: render.id, kind: render.kind, attempts: render.attempts });
  const dir = mkdtempSync(join(tmpdir(), "avt-render-"));
  const out = join(dir, `${render.id}.mp4`);
  try {
    await encode(render.plan, out, {
      urls: claim.signed ?? {},
      stdio: "pipe",
      log: (line) => log("encode", { renderId: render.id, line }),
    });
    const check = verify(out);
    if (!check.ok) throw new Error(`output check failed: ${check.problems.join(", ")}`);
    await upload(claim.upload.signedUrl, out);
    const done = await api({
      action: "complete",
      workerId,
      renderId: render.id,
      durationSeconds: check.summary.durationSeconds,
      bytes: check.summary.bytes,
      probe: check.summary,
    });
    log("complete", {
      renderId: render.id,
      path: done.path,
      assetId: done.assetId,
      ...check.summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("failed", { renderId: render.id, error: message });
    await api({ action: "fail", workerId, renderId: render.id, error: message }).catch((e) =>
      log("fail_report_error", { error: String(e) }),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return render.id;
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
