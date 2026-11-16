#!/usr/bin/env node
// Local ComfyUI worker. Polls gpu-worker-api, runs one API-format graph on the
// ComfyUI already listening on 127.0.0.1, uploads the output, and reports sha256.
// $0. No Comfy Cloud. No path outside AVT_GPU_ROOT. Scratch is deleted only after
// the upload hash matches.
//
//   AVT_WORKER_SECRET=... AVT_GPU_API=... node workers/gpu/worker.mjs [--once]
import { createHash } from "node:crypto";
import { createReadStream, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assessGpuJob, M1_8GB_PROFILE } from "../../supabase/functions/_shared/gpuCapability.ts";
import { assertInside, assertScratch, assertWorkerRoot } from "./paths.mjs";

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

export function makeApi({ url, secret, fetchImpl = fetch }) {
  return async (body) => {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-worker-secret": secret },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(`api ${body.action} ${res.status} ${data.error ?? ""} ${data.message ?? ""}`.trim());
    }
    return data;
  };
}

export function listModelFiles(root, options = {}) {
  const models = path.join(assertWorkerRoot(root, options), "models");
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(safetensors|ckpt|pt|pth|gguf|bin)$/i.test(entry.name)) out.push(entry.name);
    }
  };
  walk(models);
  return out;
}

export function applyParameters(graph, parameters) {
  const next = structuredClone(graph);
  const values = parameters ?? {};
  for (const [name, spec] of Object.entries(values)) {
    if (!spec || typeof spec !== "object") continue;
    const node = spec.node;
    const input = spec.input;
    if (typeof node !== "string" || typeof input !== "string") continue;
    if (!next[node] || typeof next[node] !== "object") throw new Error(`parameter ${name} names a missing node`);
    next[node].inputs = { ...(next[node].inputs ?? {}), [input]: spec.value };
  }
  return next;
}

/**
 * One poll. comfy is injected so tests never start a real server.
 * comfy.run({ graph, inputs, scratch }) returns { file, durationSeconds }.
 */
export async function runOnce({
  api,
  workerId,
  root,
  allowNonT7 = false,
  comfy,
  upload,
  hashFile = sha256File,
  capability = null,
}) {
  if (busy) throw new Error("one job at a time");
  busy = true;
  const options = { allowNonT7 };
  const base = assertWorkerRoot(root, options);
  let scratch = null;
  let clearScratch = false;
  let job = null;
  try {
    const claim = await api({ action: "claim", workerId });
    if (!claim.job) return null;
    job = claim.job;
    const settings = job.settings ?? {};
    const gate = assessGpuJob({
      name: typeof settings.workflow_name === "string" ? settings.workflow_name : "worker",
      graph: settings.workflow,
      license: settings.license ?? "",
      referenceOnly: settings.reference_only === true,
      performer: settings.performer ?? {},
      route: "local",
      worker: capability,
      declaredTier: settings.tier ?? null,
    });
    if (!gate.accepted) {
      await api({ action: "fail", workerId, jobId: job.id, error: gate.reasons.join(" ") || "rejected before ComfyUI" });
      return { id: job.id, ran: false, reason: gate.reasons[0] ?? "rejected" };
    }
    scratch = assertInside(base, path.join(base, "scratch", job.id), options);
    mkdirSync(scratch, { recursive: true });
    const inputs = [];
    for (const item of claim.signed ?? []) {
      const dest = assertInside(base, path.join(base, "cache", item.assetId), options);
      mkdirSync(path.dirname(dest), { recursive: true });
      inputs.push({ ...item, file: dest });
    }
    const graph = applyParameters(settings.workflow, settings.parameters);
    const produced = await comfy.run({ graph, inputs, scratch, job });
    const out = assertInside(base, produced.file, options);
    const sha256 = await hashFile(out);
    await upload(claim.upload.signedUrl, out, sha256);
    const done = await api({
      action: "complete",
      workerId,
      jobId: job.id,
      sha256,
      bytes: produced.bytes ?? null,
      durationSeconds: produced.durationSeconds ?? null,
      file_name: path.basename(out),
    });
    clearScratch = done.sha256_match === true && done.ok !== false;
    return { id: job.id, ran: true, sha256 };
  } catch (error) {
    if (job?.id) {
      await api({ action: "fail", workerId, jobId: job.id, error: error instanceof Error ? error.message : String(error) }).catch(() => {});
    }
    throw error;
  } finally {
    if (clearScratch && scratch) {
      const target = assertScratch(base, scratch, options);
      rmSync(target, { recursive: true, force: true });
    }
    busy = false;
  }
}

export async function uploadSigned(signedUrl, file, sha256, fetchImpl = fetch) {
  const headers = { "content-type": "application/octet-stream", "x-upsert": "true" };
  if (sha256) headers["x-metadata"] = Buffer.from(JSON.stringify({ sha256 })).toString("base64");
  const res = await fetchImpl(signedUrl, { method: "PUT", headers, body: readFileSync(file) });
  if (!res.ok) throw new Error(`upload failed ${res.status}`);
}

async function main() {
  const secret = process.env.AVT_WORKER_SECRET ?? "";
  const url = process.env.AVT_GPU_API ?? "";
  const root = process.env.AVT_GPU_ROOT ?? "";
  if (secret.length < 32 || !url) {
    console.error("AVT_WORKER_SECRET and AVT_GPU_API are required");
    process.exit(1);
  }
  const allowNonT7 = process.env.AVT_GPU_ALLOW_UNSAFE_ROOT === "1";
  const api = makeApi({ url, secret });
  const workerId = process.env.AVT_WORKER_ID || `${hostname()}-${process.pid}`;
  const comfyUrl = process.env.AVT_COMFY_URL ?? "http://127.0.0.1:8188";
  const once = process.argv.includes("--once");
  const comfy = {
    async run({ graph, scratch, job }) {
      const queued = await fetch(`${comfyUrl}/prompt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: graph }),
      });
      const body = await queued.json();
      if (!queued.ok || !body.prompt_id) throw new Error(`comfy prompt failed ${queued.status}`);
      const started = Date.now();
      for (;;) {
        await api({ action: "progress", workerId, jobId: job?.id, progress: 0.5, line: "comfy" }).catch(() => {});
        const history = await fetch(`${comfyUrl}/history/${body.prompt_id}`);
        const doc = await history.json();
        const item = doc[body.prompt_id];
        if (item?.status?.completed) {
          const images = Object.values(item.outputs ?? {}).flatMap((output) => output.images ?? output.gifs ?? []);
          const first = images[0];
          if (!first?.filename) throw new Error("comfy returned no output");
          const view = new URL(`${comfyUrl}/view`);
          view.searchParams.set("filename", first.filename);
          view.searchParams.set("type", first.type ?? "output");
          if (first.subfolder) view.searchParams.set("subfolder", first.subfolder);
          const bytes = Buffer.from(await (await fetch(view)).arrayBuffer());
          const file = path.join(scratch, first.filename.replace(/[^a-zA-Z0-9._-]/g, "_"));
          writeFileSync(file, bytes);
          return { file, bytes: bytes.length, durationSeconds: (Date.now() - started) / 1000 };
        }
        if (item?.status?.status_str === "error") throw new Error("comfy error");
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    },
  };
  const report = async () => {
    let nodes = [];
    try {
      const res = await fetch(`${comfyUrl}/object_info`);
      if (res.ok) nodes = Object.keys(await res.json());
    } catch {
      nodes = [];
    }
    const capability = {
      ...M1_8GB_PROFILE,
      models: listModelFiles(root, { allowNonT7 }),
      nodes,
      comfy_cloud: false,
    };
    await api({
      action: "heartbeat",
      workerId,
      capability_manifest: capability,
      tool_versions: { comfyui: "0.45.3" },
    }).catch(() => {});
    return capability;
  };
  const tick = async () => runOnce({
    api,
    workerId,
    root,
    allowNonT7,
    comfy,
    upload: (signedUrl, file, sha256) => uploadSigned(signedUrl, file, sha256),
    capability: await report(),
  });
  if (once) {
    await tick();
    return;
  }
  for (;;) {
    try {
      await tick();
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
    await new Promise((resolve) => setTimeout(resolve, Number(process.env.AVT_POLL_SECONDS ?? 10) * 1000));
  }
}

const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invoked) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
