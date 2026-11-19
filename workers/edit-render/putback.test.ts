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
const PROOF = "scene 0-239: his face on 240 of 240 frames\nframes 240 swap frames aligned 89 max |out-original| on face/hair/skin: 0\n";

type Call = { cmd: string; args: string[]; env: Record<string, string> };

/** A stand-in for child_process.spawn: records the call, answers ffprobe, and plays the put-back script. */
function fakeSpawn(opts: { proof?: string; code?: number; writeOutput?: boolean; probe?: Record<string, unknown> } = {}) {
  const calls: Call[] = [];
  const spawn = (cmd: string, args: string[], o: { env?: Record<string, string>; shell?: boolean }) => {
    calls.push({ cmd, args, env: o.env ?? {} });
    expect(o.shell).toBe(false);
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: () => void };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    setImmediate(() => {
      if (cmd === "ffprobe") {
        child.stdout.emit("data", JSON.stringify({ streams: [opts.probe ?? { width: 1080, height: 1920, nb_read_packets: "240", duration: "4.004" }], format: { duration: "4.004" } }));
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
    const summary = await runPutback(render, dir, { claim, out, fetchImpl: fetchOk, spawn, python: "/venv/bin/python", modelsDir: models, hashFile: goodHash, repoRoot: "/repo" });
    const py = calls.find((c) => c.cmd === "/venv/bin/python")!;
    expect(py.args).toEqual(["-I", "/repo/scripts/edit/body_only_swap.py", join(dir, "original.mp4"), join(dir, "swap.mp4"), join(dir, "putback"), "--base", "swap", "--retime", "auto", "--hat-gap-fill", "off"]);
    // the script's environment is the host's PATH, the models and the preset: nothing else
    expect(Object.keys(py.env).sort()).toEqual(["AVT_HEAD_ZOOM", "AVT_MODELS", "HOME", "LANG", "PATH"]);
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
    await expect(runPutback(render, dir, { claim, out, fetchImpl: fetchOk, spawn, modelsDir: models, hashFile: goodHash })).rejects.toThrow("is 7, not 0");
    expect(() => readFileSync(out)).toThrow();
  });

  it("a script that fails, prints no proof, or writes no file throws with the reason", async () => {
    const a = scratch();
    await expect(runPutback(render, a.dir, { claim, out: a.out, fetchImpl: fetchOk, spawn: fakeSpawn({ code: 1 }).spawn, modelsDir: a.models, hashFile: goodHash })).rejects.toThrow("stopped with code 1");
    const b = scratch();
    await expect(runPutback(render, b.dir, { claim, out: b.out, fetchImpl: fetchOk, spawn: fakeSpawn({ proof: "original (240, 1920, 1080, 3)\n" }).spawn, modelsDir: b.models, hashFile: goodHash })).rejects.toThrow("did not print its proof line");
    const c = scratch();
    await expect(runPutback(render, c.dir, { claim, out: c.out, fetchImpl: fetchOk, spawn: fakeSpawn({ writeOutput: false }).spawn, modelsDir: c.models, hashFile: goodHash })).rejects.toThrow("wrote no file");
  });

  it("never starts the script for a job that names anything but a preset, or that was handed other files", async () => {
    const { dir, models, out } = scratch();
    const evil = fakeSpawn();
    await expect(runPutback({ ...render, settings: { preset: "c033_showroom", args: ["--segmenter", "sam3"] } }, dir, { claim, out, fetchImpl: fetchOk, spawn: evil.spawn, modelsDir: models, hashFile: goodHash })).rejects.toThrow("a preset and nothing else");
    await expect(runPutback(render, dir, { claim: { inputs: { original: { assetId: B, signedUrl: "x" }, swap: { assetId: A, signedUrl: "y" } } }, out, fetchImpl: fetchOk, spawn: evil.spawn, modelsDir: models, hashFile: goodHash })).rejects.toThrow("not handed this job's two inputs");
    await expect(runPutback(render, dir, { claim: {}, out, fetchImpl: fetchOk, spawn: evil.spawn, modelsDir: models, hashFile: goodHash })).rejects.toThrow("not handed");
    expect(evil.calls).toEqual([]);
  });

  it("refuses a wrong or missing model file, and an input over the limits, before the script starts", async () => {
    const a = scratch();
    const s1 = fakeSpawn();
    await expect(runPutback(render, a.dir, { claim, out: a.out, fetchImpl: fetchOk, spawn: s1.spawn, modelsDir: a.models, hashFile: async () => "0".repeat(64) })).rejects.toThrow("models:");
    expect(s1.calls).toEqual([]);
    const b = scratch();
    const s2 = fakeSpawn({ probe: { width: 1080, height: 1920, nb_read_packets: "9000", duration: "150" } });
    await expect(runPutback(render, b.dir, { claim, out: b.out, fetchImpl: fetchOk, spawn: s2.spawn, modelsDir: b.models, hashFile: goodHash })).rejects.toThrow("over the 12 s");
    expect(s2.calls.every((c) => c.cmd === "ffprobe")).toBe(true);
    expect((await modelsReady("", goodHash)).ok).toBe(false);
    expect((await modelsReady(join(a.dir, "nowhere"), goodHash)).problems).toHaveLength(2);
  });

  it("a host says whether it can run a put-back: the interpreter's libraries and the two model files", async () => {
    const { models } = scratch();
    const real = await putbackCapability({ python: "/venv/bin/python", modelsDir: models, spawn: fakeSpawn().spawn });
    // the stand-in model files do not have the recorded hashes: the host is honestly not ready
    expect(real.ok).toBe(false);
    expect(real.versions).toEqual({ python: "3.9.6", numpy: "2.0.2", opencv: "5.0.0", mediapipe: "1.2.3" });
    expect(real.problems.join(" ")).toContain("sha256");
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
    await expect(download("https://storage.example/a?token=SECRET", join(dir, "a.mp4"), big, 1000)).rejects.toThrow("over the 1000");
    const declared = async () => new Response("tiny", { headers: { "content-length": "999999" } });
    await expect(download("https://storage.example/b?token=SECRET", join(dir, "b.mp4"), declared, 1000)).rejects.toThrow("999999 bytes");
    const ok = async () => new Response("fits");
    await download("https://storage.example/c", join(dir, "c.mp4"), ok, 1000);
    expect(readFileSync(join(dir, "c.mp4"), "utf8")).toBe("fits");
  });
  it("says only the status when the storage refuses", async () => {
    const { download } = await load();
    const dir = mkdtempSync(join(tmpdir(), "putback-dl-"));
    const refused = async () => new Response("no", { status: 403 });
    const err = await download("https://storage.example/a?token=SECRET", join(dir, "a.mp4"), refused, 1000).catch((e: Error) => e);
    expect(String((err as Error).message)).toBe("an input could not be downloaded (403)");
    expect(String((err as Error).message)).not.toContain("SECRET");
  });
});
