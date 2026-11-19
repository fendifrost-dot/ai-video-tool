import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PUTBACK_MODELS, PUTBACK_OUTPUT } from "../../supabase/functions/_shared/putback.ts";
// @ts-expect-error plain .mjs module
import { modelsReady, putbackCapability, run, runPutback } from "./putback.mjs";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const PROOF = "scene 0-239: his face on 240 of 240 frames\nframes 240 swap frames aligned 240 max |out-original| on face/hair/skin: 0\n";

type Call = { cmd: string; args: string[]; env: Record<string, string> };

/** A stand-in for child_process.spawn: records the call, answers ffprobe, and plays the put-back script. */
function fakeSpawn(opts: { proof?: string; code?: number; writeOutput?: boolean; probe?: Record<string, unknown>; swapProbe?: Record<string, unknown>; outProbe?: Record<string, unknown>; videoStreams?: number } = {}) {
  const calls: Call[] = [];
  const spawn = (cmd: string, args: string[], o: { env?: Record<string, string>; shell?: boolean }) => {
    calls.push({ cmd, args, env: o.env ?? {} });
    expect(o.shell).toBe(false);
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: () => void };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    setImmediate(() => {
      if (cmd === "ffprobe" && args.includes("csv=p=0")) {
        // the count of video streams, one index a line
        child.stdout.emit("data", Array.from({ length: opts.videoStreams ?? 1 }, (_, i) => String(i)).join("\n") + "\n");
        child.emit("close", 0);
        return;
      }
      if (cmd === "ffprobe") {
        // the swap may be given its own probe (a raw, unconformed file); the result file reads as the take's frames
        const isSwap = String(args[args.length - 1]).endsWith("swap.mp4");
        const probe = (isSwap ? opts.swapProbe : undefined) ?? opts.probe ?? { codec_name: "h264", width: 1080, height: 1920, nb_read_packets: "240", duration: "4.004" };
        child.stdout.emit("data", JSON.stringify({ streams: [String(args[args.length - 1]).endsWith("out.mp4") && opts.outProbe ? opts.outProbe : probe], format: { duration: probe.duration } }));
        child.emit("close", 0);
        return;
      }
      if (cmd === "git") {
        child.stdout.emit("data", args.includes("rev-parse") ? `${"c".repeat(40)}\n` : "");
        child.emit("close", 0);
        return;
      }
      if (cmd === "ffmpeg") {
        child.stdout.emit("data", "ffmpeg version 6.1.1 Copyright\n");
        child.emit("close", 0);
        return;
      }
      if (args.includes("-c")) {
        child.stdout.emit("data", "3.9.6 2.0.2 5.0.0 1.2.3\n");
        child.emit("close", 0);
        return;
      }
      // the put-back script: [-I, script, original, swap, outDir, ...flags]
      const outDir = args[4];
      if (opts.writeOutput !== false && (opts.code ?? 0) === 0) {
        mkdirSync(outDir, { recursive: true });
        writeFileSync(join(outDir, PUTBACK_OUTPUT), "mp4-bytes");
      }
      child.stdout.emit("data", opts.proof ?? PROOF);
      if (opts.code) child.stderr.emit("data", "Traceback\nValueError: boom\n");
      child.emit("close", opts.code ?? 0);
    });
    return child;
  };
  return { spawn, calls };
}

const fetchOk = async () => new Response("video-bytes");
const goodHash = async (file: string) => PUTBACK_MODELS[file.split("/").pop() as string] ?? "f".repeat(64);

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "putback-test-"));
  const models = join(dir, "models");
  mkdirSync(models);
  for (const name of Object.keys(PUTBACK_MODELS)) writeFileSync(join(models, name), "model");
  return { dir, models, out: join(dir, "out.mp4") };
}

const render = { id: "r1", job_kind: "putback", settings: { preset: "hyenas_verse_creature" }, input_asset_ids: [A, B] };
const claim = { inputs: { original: { assetId: A, signedUrl: "https://storage.example/original" }, swap: { assetId: B, signedUrl: "https://storage.example/swap" } } };

describe("the put-back runner runs the script unchanged and gives back only a proven result", () => {
  it("runs python -I on the fixed script with the preset's flags and settings, and returns the proof", async () => {
    const { dir, models, out } = scratch();
    const { spawn, calls } = fakeSpawn();
    const summary = await runPutback(render, dir, { claim, out, fetchImpl: fetchOk, checkHost: false, spawn, python: "/venv/bin/python", modelsDir: models, hashFile: goodHash, repoRoot: "/repo", versions: { python: "3.9.6" } });
    const py = calls.find((c) => c.cmd === "/venv/bin/python")!;
    expect(py.args).toEqual(["-I", "/repo/scripts/edit/body_only_swap.py", join(dir, "original.mp4"), join(dir, "swap.mp4"), join(dir, "putback"), "--base", "swap", "--retime", "auto", "--hat-gap-fill", "off"]);
    // the script's environment is the host's PATH, the models, its scratch and the preset: nothing else — and
    // ffprobe, which parses files the worker did not make, gets less still (never the worker's secret)
    expect(Object.keys(py.env).sort()).toEqual(["AVT_HEAD_ZOOM", "AVT_MODELS", "HOME", "LANG", "PATH", "TMPDIR"]);
    expect(py.env.TMPDIR).toBe(dir);
    for (const probe of calls.filter((c) => c.cmd === "ffprobe")) expect(Object.keys(probe.env).sort()).toEqual(["HOME", "LANG", "PATH"]);
    // what ran it and from which checkout is on the record, with one hash over the script and its five modules
    expect(summary.putback).toMatchObject({ repo: { commit: "c".repeat(40), dirty: false }, versions: { python: "3.9.6" }, output: { frames: 240, width: 1080, height: 1920 } });
    expect(String(summary.putback.script_sha256)).toMatch(/^[0-9a-f]{64}$/);
    expect(py.env.AVT_HEAD_ZOOM).toBe("3");
    expect(py.env.AVT_MODELS).toBe(models);
    expect(summary.putback).toMatchObject({ proof_max: 0, frames: 240, preset: "hyenas_verse_creature", original_asset_id: A, swap_asset_id: B, approved: false });
    expect(summary.putback.face_found).toEqual([{ scene: "0-239", found: 240, of: 240 }]);
    expect(readFileSync(out, "utf8")).toBe("mp4-bytes");
    expect(readFileSync(join(dir, "original.mp4"), "utf8")).toBe("video-bytes");
  });

  it("a proof that is not 0 throws and leaves no output file to upload", async () => {
    const { dir, models, out } = scratch();
    const { spawn } = fakeSpawn({ proof: PROOF.replace("skin: 0", "skin: 7") });
    await expect(runPutback(render, dir, { claim, out, fetchImpl: fetchOk, checkHost: false, spawn, modelsDir: models, hashFile: goodHash })).rejects.toThrow("is 7, not 0");
    expect(() => readFileSync(out)).toThrow();
  });

  it("nothing of a failed put-back stays on disk: not the inputs, not a result", async () => {
    const { dir, models, out } = scratch();
    await expect(runPutback(render, dir, { claim, out, fetchImpl: fetchOk, checkHost: false, spawn: fakeSpawn({ proof: PROOF.replace("skin: 0", "skin: 7") }).spawn, modelsDir: models, hashFile: goodHash })).rejects.toThrow();
    for (const name of ["original.mp4", "swap.mp4", "putback", "out.mp4"]) expect(() => readFileSync(join(dir, name))).toThrow();
  });

  it("a 0 with his face found on no frame, a raw unconformed swap, and a file shorter than its proof are all refused", async () => {
    const a = scratch();
    await expect(runPutback(render, a.dir, { claim, out: a.out, fetchImpl: fetchOk, checkHost: false, spawn: fakeSpawn({ proof: "scene 0-239: his face on 0 of 240 frames\nframes 240 swap frames aligned 240 max |out-original| on face/hair/skin: 0\n" }).spawn, modelsDir: a.models, hashFile: goodHash })).rejects.toThrow("0 of 240 frames");
    const b = scratch();
    const raw = fakeSpawn({ swapProbe: { codec_name: "h264", width: 720, height: 1280, nb_read_packets: "89", duration: "3.708" } });
    await expect(runPutback(render, b.dir, { claim, out: b.out, fetchImpl: fetchOk, checkHost: false, spawn: raw.spawn, modelsDir: b.models, hashFile: goodHash })).rejects.toThrow("not conformed");
    expect(raw.calls.every((c) => c.cmd === "ffprobe")).toBe(true);
    const c = scratch();
    await expect(runPutback(render, c.dir, { claim, out: c.out, fetchImpl: fetchOk, checkHost: false, spawn: fakeSpawn({ outProbe: { codec_name: "h264", width: 1080, height: 1920, nb_read_packets: "17", duration: "0.7" } }).spawn, modelsDir: c.models, hashFile: goodHash })).rejects.toThrow("17 frames and the proof is for 240");
  });

  it("a file with more than one video stream, or a small swap that would be read at a large take's size, is refused", async () => {
    const a = scratch();
    const two = fakeSpawn({ videoStreams: 2 });
    await expect(runPutback(render, a.dir, { claim, out: a.out, fetchImpl: fetchOk, checkHost: false, spawn: two.spawn, modelsDir: a.models, hashFile: goodHash })).rejects.toThrow("2 video streams");
    expect(two.calls.every((c) => c.cmd === "ffprobe")).toBe(true);
    // the take is 1080x1920; the swap is small on disk but has 250 frames: at the take's size that is over the budget
    const b = scratch();
    const many = fakeSpawn({ probe: { codec_name: "h264", width: 1080, height: 1920, nb_read_packets: "96", duration: "4.004" }, swapProbe: { codec_name: "h264", width: 640, height: 360, nb_read_packets: "260", duration: "4.0" } });
    await expect(runPutback(render, b.dir, { claim, out: b.out, fetchImpl: fetchOk, checkHost: false, spawn: many.spawn, modelsDir: b.models, hashFile: goodHash })).rejects.toThrow("the swap, read at the take's size");
  });

  it("a script that fails, prints no proof, or writes no file throws with the reason", async () => {
    const a = scratch();
    await expect(runPutback(render, a.dir, { claim, out: a.out, fetchImpl: fetchOk, checkHost: false, spawn: fakeSpawn({ code: 1 }).spawn, modelsDir: a.models, hashFile: goodHash })).rejects.toThrow("stopped with code 1");
    const b = scratch();
    await expect(runPutback(render, b.dir, { claim, out: b.out, fetchImpl: fetchOk, checkHost: false, spawn: fakeSpawn({ proof: "original (240, 1920, 1080, 3)\n" }).spawn, modelsDir: b.models, hashFile: goodHash })).rejects.toThrow("did not print its proof line");
    const c = scratch();
    await expect(runPutback(render, c.dir, { claim, out: c.out, fetchImpl: fetchOk, checkHost: false, spawn: fakeSpawn({ writeOutput: false }).spawn, modelsDir: c.models, hashFile: goodHash })).rejects.toThrow("wrote no file");
  });

  it("never starts the script for a job that names anything but a preset, or that was handed other files", async () => {
    const { dir, models, out } = scratch();
    const evil = fakeSpawn();
    await expect(runPutback({ ...render, settings: { preset: "c033_showroom", args: ["--segmenter", "sam3"] } }, dir, { claim, out, fetchImpl: fetchOk, checkHost: false, spawn: evil.spawn, modelsDir: models, hashFile: goodHash })).rejects.toThrow("a preset and nothing else");
    await expect(runPutback(render, dir, { claim: { inputs: { original: { assetId: B, signedUrl: "x" }, swap: { assetId: A, signedUrl: "y" } } }, out, fetchImpl: fetchOk, checkHost: false, spawn: evil.spawn, modelsDir: models, hashFile: goodHash })).rejects.toThrow("not handed this job's two inputs");
    await expect(runPutback(render, dir, { claim: {}, out, fetchImpl: fetchOk, checkHost: false, spawn: evil.spawn, modelsDir: models, hashFile: goodHash })).rejects.toThrow("not handed");
    expect(evil.calls).toEqual([]);
  });

  it("refuses a wrong or missing model file, and an input over the limits, before the script starts", async () => {
    const a = scratch();
    const s1 = fakeSpawn();
    await expect(runPutback(render, a.dir, { claim, out: a.out, fetchImpl: fetchOk, checkHost: false, spawn: s1.spawn, modelsDir: a.models, hashFile: async () => "0".repeat(64) })).rejects.toThrow("models:");
    expect(s1.calls).toEqual([]);
    const b = scratch();
    const s2 = fakeSpawn({ probe: { codec_name: "h264", width: 640, height: 360, nb_read_packets: "900", duration: "150" } });
    await expect(runPutback(render, b.dir, { claim, out: b.out, fetchImpl: fetchOk, checkHost: false, spawn: s2.spawn, modelsDir: b.models, hashFile: goodHash })).rejects.toThrow("over the 12 s");
    expect(s2.calls.every((c) => c.cmd === "ffprobe")).toBe(true);
    expect((await modelsReady("", goodHash)).ok).toBe(false);
    expect((await modelsReady(join(a.dir, "nowhere"), goodHash)).problems).toHaveLength(2);
  });

  it("a host says whether it can run a put-back: the interpreter's libraries and the two model files", async () => {
    const { models } = scratch();
    const real = await putbackCapability({ python: "/venv/bin/python", modelsDir: models, scratchDir: "/Volumes/T7/_avt_work/worker_scratch", spawn: fakeSpawn().spawn });
    // the stand-in model files do not have the recorded hashes: the host is honestly not ready
    expect(real.ok).toBe(false);
    expect(real.versions).toEqual({ python: "3.9.6", numpy: "2.0.2", opencv: "5.0.0", mediapipe: "1.2.3", ffmpeg: "6.1.1" });
    expect(real.problems.join(" ")).toContain("sha256");
    // where a put-back's files go is said, never defaulted: with no scratch folder named the host cannot run one
    const noScratch = await putbackCapability({ python: "/venv/bin/python", modelsDir: models, scratchDir: "", spawn: fakeSpawn().spawn });
    expect(noScratch.problems.join(" ")).toContain("AVT_SCRATCH_DIR is not set");
  });

  it("a command is never run through a shell and is stopped at its time limit", async () => {
    const hang = (_cmd: string, _args: string[], o: { shell?: boolean }) => {
      expect(o.shell).toBe(false);
      const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: () => void };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => {};
      return child;
    };
    await expect(run("sleep", ["100"], { timeoutMs: 20, spawn: hang })).rejects.toThrow("ran past");
  });
});

describe("an input is never read past the byte limit, and a failed download never names its signed URL", () => {
  // @ts-expect-error plain .mjs module
  const load = () => import("./putback.mjs");
  it("stops a stream that runs over the limit, and refuses one whose header already says so", async () => {
    const { download } = await load();
    const dir = mkdtempSync(join(tmpdir(), "putback-dl-"));
    const big = async () => new Response("x".repeat(5000));
    const off = { checkHost: false };
    await expect(download("https://storage.example/a?token=SECRET", join(dir, "a.mp4"), big, 1000, off)).rejects.toThrow("over the 1000");
    const declared = async () => new Response("tiny", { headers: { "content-length": "999999" } });
    await expect(download("https://storage.example/b?token=SECRET", join(dir, "b.mp4"), declared, 1000, off)).rejects.toThrow("999999 bytes");
    const ok = async () => new Response("fits");
    await download("https://storage.example/c", join(dir, "c.mp4"), ok, 1000, off);
    // only this project's storage, and never across a redirect
    await expect(download("https://storage.example/c", join(dir, "d.mp4"), ok, 1000)).rejects.toThrow("not this project's storage");
    const redirect = async () => new Response(null, { status: 302, headers: { location: "https://elsewhere.example/x" } });
    await expect(download("https://storage.example/c", join(dir, "e.mp4"), redirect, 1000, off)).rejects.toThrow("redirects");
    expect(readFileSync(join(dir, "c.mp4"), "utf8")).toBe("fits");
  });
  it("says only the status when the storage refuses", async () => {
    const { download } = await load();
    const dir = mkdtempSync(join(tmpdir(), "putback-dl-"));
    const refused = async () => new Response("no", { status: 403 });
    const err = await download("https://storage.example/a?token=SECRET", join(dir, "a.mp4"), refused, 1000, { checkHost: false }).catch((e: Error) => e);
    expect(String((err as Error).message)).toBe("an input could not be downloaded (403)");
    expect(String((err as Error).message)).not.toContain("SECRET");
  });
});
