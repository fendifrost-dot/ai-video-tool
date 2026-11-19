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
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { storageSignUrlOk } from "../../supabase/functions/_shared/editMedia.ts";
import {
  checkPutbackInput,
  checkPutbackPair,
  parsePutbackProof,
  planPutback,
  putbackPasses,
  putbackRecord,
  PUTBACK_LIMITS,
  PUTBACK_MODELS,
  PUTBACK_OUTPUT,
  PUTBACK_SCRIPT,
  PUTBACK_SCRIPT_FILES,
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

/** The least a child process needs. The worker's secret and API address are never in it. */
const MIN_ENV = () => ({ PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", LANG: process.env.LANG ?? "C.UTF-8" });

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
export async function putbackCapability({ python = process.env.AVT_PUTBACK_PYTHON || "python3", modelsDir = process.env.AVT_MODELS || "", scratchDir = process.env.AVT_SCRATCH_DIR || "", spawn = nodeSpawn } = {}) {
  const problems = [];
  let versions = null;
  // a put-back's files are large: where they go is said, never defaulted (on Fendi's Mac the system temp folder is the
  // internal disk, which holds no media)
  if (!scratchDir) problems.push("AVT_SCRATCH_DIR is not set: a put-back's files go only where they are told to");
  try {
    const probe = await run(python, ["-I", "-c", "import sys, numpy, cv2, mediapipe; print(sys.version.split()[0], numpy.__version__, cv2.__version__, mediapipe.__version__)"], { timeoutMs: 60_000, spawn });
    if (probe.code === 0) {
      const [py, np, cv, mp] = probe.out.trim().split(/\s+/);
      versions = { python: py, numpy: np, opencv: cv, mediapipe: mp };
      const ff = await run("ffmpeg", ["-version"], { env: MIN_ENV(), timeoutMs: 30_000, spawn }).catch(() => null);
      const v = ff && ff.code === 0 ? (ff.out.match(/ffmpeg version (\S+)/) ?? [])[1] : null;
      if (v) versions.ffmpeg = v;
      else problems.push("ffmpeg is not on the PATH");
    } else problems.push(`${python} cannot import numpy, cv2 and mediapipe`);
  } catch (e) {
    problems.push(`${python} did not start: ${e instanceof Error ? e.message : String(e)}`);
  }
  const models = await modelsReady(modelsDir).catch((e) => ({ ok: false, problems: [String(e)] }));
  problems.push(...models.problems);
  return { ok: problems.length === 0, problems, versions, python, modelsDir };
}

/**
 * One input, streamed to disk: only from this project's storage, never across a redirect, stopped at the byte limit
 * and at the time limit. A failure never names the URL: it is signed.
 */
export async function download(url, file, fetchImpl, maxBytes = PUTBACK_LIMITS.maxBytes, { checkHost = true } = {}) {
  if (checkHost && !storageSignUrlOk(url)) throw new Error("refusing an input that is not this project's storage");
  const res = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(PUTBACK_LIMITS.downloadTimeoutMs) });
  if (res.status >= 300 && res.status < 400) throw new Error("refusing an input whose download redirects");
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
  // ffprobe gets the least environment too: it parses a file the worker did not make
  const r = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=codec_name,width,height,nb_read_packets,duration:format=duration", "-of", "json", file], { env: MIN_ENV(), timeoutMs: 120_000, spawn });
  if (r.code !== 0) throw new Error(`ffprobe could not read ${file.split("/").pop()}`);
  const j = JSON.parse(r.out || "{}");
  const s = (j.streams ?? [])[0] ?? {};
  return { codec: String(s.codec_name ?? ""), width: Number(s.width) || 0, height: Number(s.height) || 0, frames: Number(s.nb_read_packets) || 0, seconds: Number(s.duration) || Number(j.format?.duration) || 0 };
}

/** sha256 over the script and the modules it imports, in a fixed order: what "the script, unchanged" means. */
export async function scriptsSha256(repoRoot, hashFile = sha256Of) {
  const hash = createHash("sha256");
  for (const name of PUTBACK_SCRIPT_FILES) hash.update(`${name}:${await hashFile(join(repoRoot, dirname(PUTBACK_SCRIPT), name))}\n`);
  return hash.digest("hex");
}

/** The worker checkout's commit and whether it has uncommitted changes; null where there is no git. */
export async function repoState(repoRoot, spawn = nodeSpawn) {
  try {
    const head = await run("git", ["-C", repoRoot, "rev-parse", "HEAD"], { env: MIN_ENV(), timeoutMs: 20_000, spawn });
    if (head.code !== 0 || !/^[0-9a-f]{40}$/.test(head.out.trim())) return null;
    const dirty = await run("git", ["-C", repoRoot, "status", "--porcelain", "--", "scripts/edit"], { env: MIN_ENV(), timeoutMs: 20_000, spawn });
    return { commit: head.out.trim(), dirty: dirty.code !== 0 || dirty.out.trim().length > 0 };
  } catch {
    return null;
  }
}

/** A message that may be stored with the job: no home folder, no scratch path. */
export const tidy = (text, dir) => String(text).split(dir).join("<scratch>").split(process.env.HOME || "\u0000").join("~").slice(0, 600);

/**
 * One put-back. `claim` is what the worker API handed over with the job: `inputs.original` and `inputs.swap`, each
 * `{ assetId, signedUrl }`. Returns the worker's summary for the completed row, with the proof on it. Throws, with the
 * reason, when anything is off — the caller marks the job failed and files nothing.
 */
export async function runPutback(render, dir, { claim, out, fetchImpl = fetch, spawn = nodeSpawn, python = process.env.AVT_PUTBACK_PYTHON || "python3", modelsDir = process.env.AVT_MODELS || "", log = () => {}, repoRoot = REPO_ROOT, hashFile = sha256Of, versions = null, checkHost = true } = {}) {
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
  const outDir = join(dir, "putback");
  try {
    await download(inputs.original.signedUrl, original, fetchImpl, PUTBACK_LIMITS.maxBytes, { checkHost });
    await download(inputs.swap.signedUrl, swap, fetchImpl, PUTBACK_LIMITS.maxBytes, { checkHost });
    const probes = {};
    for (const [label, file, key] of [["the original", original, "original"], ["the swap", swap, "swap"]]) {
      probes[key] = await probeVideo(file, spawn);
      const problem = checkPutbackInput(label, probes[key]);
      if (problem) throw new Error(problem);
    }
    const pair = checkPutbackPair(probes.original, probes.swap);
    if (pair) throw new Error(pair);
    const inputSha256 = { original: await hashFile(original), swap: await hashFile(swap) };

    const script = join(repoRoot, PUTBACK_SCRIPT);
    // the script's whole environment: the host's PATH and locale, the models, its scratch, the preset — nothing from
    // the job row, and not the worker's secret
    const env = { ...MIN_ENV(), TMPDIR: dir, AVT_MODELS: modelsDir, ...plan.env };
    const started = Date.now();
    const result = await run(python, ["-I", script, original, swap, outDir, ...plan.args], { env, timeoutMs: PUTBACK_LIMITS.timeoutMs, spawn, onLine: (line) => log(tidy(line, dir)) });
    const seconds = Math.round((Date.now() - started) / 100) / 10;
    if (result.code !== 0) throw new Error(`the put-back script stopped with code ${result.code}: ${tidy(result.err.trim().split(/\r?\n/).slice(-3).join(" | "), dir)}`);

    const proof = parsePutbackProof(result.out);
    const verdict = putbackPasses(proof);
    if (!verdict.ok) throw new Error(verdict.why);
    const made = join(outDir, PUTBACK_OUTPUT);
    if (!existsSync(made)) throw new Error("the put-back script printed its proof but wrote no file");
    renameSync(made, out);
    const check = await probeVideo(out, spawn);
    // the file is held against the proof: the frames the proof is for are the frames in the file
    if (check.frames !== proof.frames) throw new Error(`the file has ${check.frames} frames and the proof is for ${proof.frames}`);
    return {
      durationSeconds: check.seconds || null,
      bytes: statSync(out).size,
      width: check.width,
      height: check.height,
      frames: check.frames,
      putback: putbackRecord({
        plan,
        proof,
        scriptSha256: await scriptsSha256(repoRoot, hashFile),
        inputSha256,
        seconds,
        versions,
        repo: await repoState(repoRoot, spawn),
        output: { frames: check.frames, width: check.width, height: check.height, seconds: check.seconds },
      }),
    };
  } catch (error) {
    // nothing of a failed put-back stays on disk: not the two inputs, not the script's intermediates, not a result
    for (const path of [original, swap, outDir, out]) rmSync(path, { recursive: true, force: true });
    throw error;
  }
}
