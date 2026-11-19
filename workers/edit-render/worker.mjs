#!/usr/bin/env node
// AVT durable edit-render worker. Polls edit-render-worker-api, encodes queued Timeline renders with ffmpeg,
// uploads the MP4 to project-exports and marks the row complete (or failed with a reason). $0: no providers.
//
//   AVT_WORKER_SECRET=... node --experimental-strip-types workers/edit-render/worker.mjs [--once]
// Env: AVT_WORKER_SECRET (required), AVT_WORKER_API (required: <SUPABASE_URL>/functions/v1/edit-render-worker-api),
//      AVT_WORKER_ID (default hostname-pid), AVT_POLL_SECONDS (default 10).
import { createHash } from "node:crypto";
import { createReadStream, mkdirSync, mkdtempSync, readFileSync, rmSync, statfsSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { encodePlan } from "../../scripts/edit-render/encode.mjs";
import { capabilityManifest } from "./blenderProbe.mjs";
import { mayClearScratch } from "./cache.mjs";
import { putbackCapability, runPutback, stopChildren } from "./putback.mjs";
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

/**
 * Where a job's files live while it runs. AVT_SCRATCH_DIR on a host whose rule is "media only on the external drive"
 * (Fendi's Mac: the T7, never the internal disk); the system temp folder otherwise.
 */
export function scratchRoot() {
  const dir = process.env.AVT_SCRATCH_DIR || tmpdir();
  mkdirSync(dir, { recursive: true });
  return dir;
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

export async function uploadSigned(signedUrl, file, fetchImpl = fetch, sha256 = "", { upsert = true } = {}) {
  const headers = { "content-type": "video/mp4", "x-upsert": upsert ? "true" : "false" };
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
  disk = () => assertDisk(scratchRoot(), 64 * 1024 * 1024),
  hashFile = sha256File,
  runJob = null,
  // the job kinds this host can run; sent with every claim so it is never handed a job it has no runner for
  kinds = ["edit"],
}) {
  if (busy) throw new Error("one job at a time");
  busy = true;
  let dir = null;
  let clearScratch = false;
  let render = null;
  try {
    disk();
    const claim = await api({ action: "claim", workerId, kinds });
    if (!claim.render) {
      // the door may have set a bad row aside instead of handing one over: said, so an empty answer is not read as
      // an empty queue (the caller may ask again)
      const aside = claim.skipped ?? claim.requeued ?? null;
      if (aside || claim.note) log("no_job", { skipped: claim.skipped ?? null, requeued: claim.requeued ?? null, note: claim.note ?? null });
      return aside ? { setAside: aside } : null;
    }
    render = claim.render;
    log("claimed", { renderId: render.id, kind: render.kind, jobKind: render.job_kind ?? "edit", attempts: render.attempts });
    dir = mkdtempSync(join(scratchRoot(), "avt-render-"));
    const out = join(dir, `${render.id}.mp4`);
    const jobKind = render.job_kind ?? "edit";
    // a job of a kind this worker did not ask for is not run, whatever the door handed over (a door that was not
    // redeployed ignores `kinds`): a put-back-only host never executes an edit job's command line
    if (!kinds.includes(jobKind)) throw new Error(`this worker takes ${kinds.join(", ")} and was handed a ${jobKind} job: not run`);
    let summary = { durationSeconds: null, bytes: null };
    if (jobKind !== "edit") {
      if (!runJob) throw new Error(`no runner for ${jobKind}`);
      summary = await runJob(render, dir, { claim, out });
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
    // a put-back's object is one per attempt and is never overwritten
    await upload(claim.upload.signedUrl, out, undefined, sha256, { upsert: jobKind === "edit" });
    const done = await api({
      action: "complete",
      workerId,
      renderId: render.id,
      durationSeconds: summary.durationSeconds,
      bytes: summary.bytes,
      probe: summary,
      sha256,
      // a put-back's proof record; the door checks it again (proof 0, this job's assets) before anything is filed
      ...(summary.putback ? { putback: summary.putback } : {}),
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
    // a failed job that is not an edit leaves nothing behind (its runner has removed its files; the folder goes too)
    if ((render.job_kind ?? "edit") !== "edit") clearScratch = true;
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
  for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"])
    process.on(sig, () => {
      stopping = true;
      log("stopping", { sig });
      // a job's script runs in its own process group: it is stopped with the worker, never left running behind a
      // closed terminal with the lock released
      stopChildren();
      if (once || sig === "SIGHUP") process.exit(130);
    });
  process.on("exit", stopChildren);
  const tools = await capabilityManifest();
  // a put-back needs Python with numpy, OpenCV and MediaPipe, and the two model files with the right hashes
  const putback = await putbackCapability();
  // What this host asks for is SAID, never assumed (AVT_WORKER_KINDS, default "edit"). An edit job's plan can carry
  // a command line from its row, so a host takes edit jobs only on purpose; Fendi's Mac asks for put-backs alone
  // (run-once-putback.sh). A kind the host cannot run is dropped.
  const can = ["edit", ...(putback.ok ? ["putback"] : [])];
  const asked = (process.env.AVT_WORKER_KINDS ?? "edit").split(",").map((k) => k.trim()).filter(Boolean);
  const kinds = can.filter((k) => asked.includes(k));
  if (kinds.length === 0) {
    log("nothing_to_do", { asked, can, putback: putback.problems });
    process.exit(5);
  }
  const runJob = (render, dir, ctx) => {
    if (render.job_kind === "putback")
      return runPutback(render, dir, { ...ctx, versions: putback.versions, log: (line) => log("putback", { renderId: render.id, line }) });
    throw new Error(`no runner for ${render.job_kind}`);
  };
  log("start", {
    workerId,
    once,
    kinds,
    putback: putback.ok ? putback.versions : putback.problems,
    blender: tools.tool_versions.blender ?? null,
    blender_bin: tools.blender_bin,
    blender_dependency: tools.skill_dependency.constraint,
  });
  do {
    let handled = null;
    try {
      handled = await runOnce({ api, workerId, kinds, runJob });
      // a row set aside at the door is not the job: ask again, a few times, so one bad row does not use up the run
      for (let again = 0; once && handled && typeof handled === "object" && again < 5; again++) handled = await runOnce({ api, workerId, kinds, runJob });
    } catch (error) {
      log("poll_error", { error: error instanceof Error ? error.message : String(error) });
    }
    if (once) {
      log("once_done", { ran: typeof handled === "string" ? handled : null });
      break;
    }
    if (!handled) await new Promise((r) => setTimeout(r, pollMs));
  } while (!stopping);
  log("stopped", { workerId });
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
