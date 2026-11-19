// The put-back runner: job_kind "putback" on the edit-render worker.
//
// It runs scripts/edit/body_only_swap.py UNCHANGED (docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md) on two files the
// worker API hands it, reads the proof the script prints, and gives the result back only when that proof is 0.
// $0: no provider is called.
//
// A job is a preset and two asset ids (supabase/functions/_shared/putback.ts). Nothing in the job row reaches the
// command line: the script path is fixed, the flags and AVT_* values come from the preset compiled into this file's
// import, and Python runs with -I (no user site, no PYTHONPATH, no current-directory imports).
//
// Env: AVT_PUTBACK_PYTHON (the interpreter with numpy, opencv, mediapipe; default python3),
//      AVT_MODELS (the folder with the two MediaPipe model files; they are never in the repo).
import { spawn as nodeSpawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import {
  checkPutbackInput,
  parsePutbackProof,
  planPutback,
  putbackPasses,
  putbackRecord,
  PUTBACK_LIMITS,
  PUTBACK_MODELS,
  PUTBACK_OUTPUT,
  PUTBACK_SCRIPT,
} from "../../supabase/functions/_shared/putback.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function sha256Of(file) {
  return new Promise((res, rej) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", rej)
      .on("end", () => res(hash.digest("hex")));
  });
}

/** Run a command, collect its output, stop it at the time limit. Never a shell: arguments are an array. */
export function run(cmd, args, { env = process.env, timeoutMs = 0, spawn = nodeSpawn, onLine = null } = {}) {
  return new Promise((res, rej) => {
    // its own process group, so that stopping it at the time limit stops what it started too (the script runs ffmpeg)
    const child = spawn(cmd, args, { env, stdio: ["ignore", "pipe", "pipe"], shell: false, detached: true });
    let out = "";
    let err = "";
    let timer = null;
    const stop = () => {
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        try {
          child.kill("SIGKILL");
        } catch {
          // already gone
        }
      }
    };
    if (timeoutMs > 0)
      timer = setTimeout(() => {
        stop();
        rej(new Error(`${cmd} ran past ${Math.round(timeoutMs / 1000)} s and was stopped`));
      }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      out += chunk;
      if (onLine) for (const line of String(chunk).split(/\r?\n/)) if (line.trim()) onLine(line.trim());
    });
    child.stderr.on("data", (chunk) => {
      err += chunk;
    });
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      rej(e);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      res({ code, out, err });
    });
  });
}

/** Which of the model files are in place with the right hash. A worker missing one never claims a put-back. */
export async function modelsReady(modelsDir, hashFile = sha256Of) {
  const problems = [];
  if (!modelsDir) return { ok: false, problems: ["AVT_MODELS is not set"] };
  for (const [name, want] of Object.entries(PUTBACK_MODELS)) {
    const file = join(modelsDir, name);
    if (!existsSync(file)) {
      problems.push(`${name} is not in the models folder`);
      continue;
    }
    const got = await hashFile(file);
    if (got !== want) problems.push(`${name} has sha256 ${got.slice(0, 12)}…, expected ${want.slice(0, 12)}…`);
  }
  return { ok: problems.length === 0, problems };
}

/** Whether this host can run a put-back at all: the interpreter imports what the script needs, and the models are right. */
export async function putbackCapability({ python = process.env.AVT_PUTBACK_PYTHON || "python3", modelsDir = process.env.AVT_MODELS || "", spawn = nodeSpawn } = {}) {
  const problems = [];
  let versions = null;
  try {
    const probe = await run(python, ["-I", "-c", "import sys, numpy, cv2, mediapipe; print(sys.version.split()[0], numpy.__version__, cv2.__version__, mediapipe.__version__)"], { timeoutMs: 60_000, spawn });
    if (probe.code === 0) {
      const [py, np, cv, mp] = probe.out.trim().split(/\s+/);
      versions = { python: py, numpy: np, opencv: cv, mediapipe: mp };
    } else problems.push(`${python} cannot import numpy, cv2 and mediapipe`);
  } catch (e) {
    problems.push(`${python} did not start: ${e instanceof Error ? e.message : String(e)}`);
  }
  const models = await modelsReady(modelsDir).catch((e) => ({ ok: false, problems: [String(e)] }));
  problems.push(...models.problems);
  return { ok: problems.length === 0, problems, versions, python, modelsDir };
}

/** One input, streamed to disk and stopped at the byte limit: a file is never read past it, whatever its header says. */
export async function download(url, file, fetchImpl, maxBytes = PUTBACK_LIMITS.maxBytes) {
  const res = await fetchImpl(url);
  // never the URL in a message: it is signed
  if (!res.ok || !res.body) throw new Error(`an input could not be downloaded (${res.status})`);
  const declared = Number(res.headers?.get?.("content-length") ?? 0);
  if (declared > maxBytes) throw new Error(`an input is ${declared} bytes, over the ${maxBytes} a put-back reads`);
  mkdirSync(dirname(file), { recursive: true });
  let seen = 0;
  const limit = new Transform({
    transform(chunk, _enc, done) {
      seen += chunk.length;
      done(seen > maxBytes ? new Error(`an input is over the ${maxBytes} bytes a put-back reads`) : null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body), limit, createWriteStream(file));
}

async function probeVideo(file, spawn) {
  const r = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=width,height,nb_read_packets,duration:format=duration", "-of", "json", file], { timeoutMs: 120_000, spawn });
  if (r.code !== 0) throw new Error(`ffprobe could not read ${file.split("/").pop()}`);
  const j = JSON.parse(r.out || "{}");
  const s = (j.streams ?? [])[0] ?? {};
  return { width: Number(s.width) || 0, height: Number(s.height) || 0, frames: Number(s.nb_read_packets) || 0, seconds: Number(s.duration) || Number(j.format?.duration) || 0 };
}

/**
 * One put-back. `claim` is what the worker API handed over with the job: `inputs.original` and `inputs.swap`, each
 * `{ assetId, signedUrl }`. Returns the worker's summary for the completed row, with the proof on it. Throws, with the
 * reason, when anything is off — the caller marks the job failed and files nothing.
 */
export async function runPutback(render, dir, { claim, out, fetchImpl = fetch, spawn = nodeSpawn, python = process.env.AVT_PUTBACK_PYTHON || "python3", modelsDir = process.env.AVT_MODELS || "", log = () => {}, repoRoot = REPO_ROOT, hashFile = sha256Of } = {}) {
  const planned = planPutback(render.settings, render.input_asset_ids);
  if (!planned.ok) throw new Error(planned.error);
  const plan = planned.value;
  const inputs = claim?.inputs ?? {};
  if (inputs.original?.assetId !== plan.originalAssetId || inputs.swap?.assetId !== plan.swapAssetId || !inputs.original?.signedUrl || !inputs.swap?.signedUrl) {
    throw new Error("the worker was not handed this job's two inputs");
  }
  const models = await modelsReady(modelsDir, hashFile);
  if (!models.ok) throw new Error(`models: ${models.problems.join("; ")}`);

  const original = join(dir, "original.mp4");
  const swap = join(dir, "swap.mp4");
  await download(inputs.original.signedUrl, original, fetchImpl);
  await download(inputs.swap.signedUrl, swap, fetchImpl);
  for (const [label, file] of [["the original", original], ["the swap", swap]]) {
    const problem = checkPutbackInput(label, await probeVideo(file, spawn));
    if (problem) throw new Error(problem);
  }
  const inputSha256 = { original: await hashFile(original), swap: await hashFile(swap) };

  const script = join(repoRoot, PUTBACK_SCRIPT);
  const outDir = join(dir, "putback");
  // the script's whole environment: the host's PATH and locale, the models, the preset — nothing from the job row
  const env = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", LANG: process.env.LANG ?? "C.UTF-8", AVT_MODELS: modelsDir, ...plan.env };
  const started = Date.now();
  const result = await run(python, ["-I", script, original, swap, outDir, ...plan.args], { env, timeoutMs: PUTBACK_LIMITS.timeoutMs, spawn, onLine: (line) => log(line) });
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  if (result.code !== 0) throw new Error(`the put-back script stopped with code ${result.code}: ${result.err.trim().split(/\r?\n/).slice(-3).join(" | ").slice(0, 600)}`);

  const proof = parsePutbackProof(result.out);
  const verdict = putbackPasses(proof);
  if (!verdict.ok) throw new Error(verdict.why);
  const made = join(outDir, PUTBACK_OUTPUT);
  if (!existsSync(made)) throw new Error("the put-back script printed its proof but wrote no file");
  renameSync(made, out);
  const check = await probeVideo(out, spawn);
  return {
    durationSeconds: check.seconds || null,
    bytes: statSync(out).size,
    width: check.width,
    height: check.height,
    frames: check.frames,
    putback: putbackRecord({ plan, proof, scriptSha256: await hashFile(script), inputSha256, seconds }),
  };
}
