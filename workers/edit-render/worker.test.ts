// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module
import { encodePlan } from "../../scripts/edit-render/encode.mjs";
// @ts-expect-error plain ESM module
import { verifyMp4 } from "./verify.mjs";
// @ts-expect-error plain ESM module
import { runOnce } from "./worker.mjs";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

const structuralPlan = (out = "OUTPUT") => ({
  costUsd: 0,
  billable: false,
  inputs: { items: [] },
  argv: [
    "ffmpeg",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=360x640:rate=24:duration=2",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    "-t",
    "2",
    out,
  ],
});

describe.skipIf(!hasFfmpeg)("encodePlan + verifyMp4 (real ffmpeg)", () => {
  it("encodes a structural plan to h264/aac yuv420p with moov before mdat", async () => {
    const out = join(mkdtempSync(join(tmpdir(), "er-")), "o.mp4");
    await encodePlan(structuralPlan(), out, { stdio: "pipe", log: () => {} });
    const check = verifyMp4(out);
    expect(check.problems).toEqual([]);
    expect(check.summary.faststart).toBe(true);
    expect(Math.abs(check.summary.durationSeconds - 2)).toBeLessThan(0.1);
  });

  it("refuses a plan that is not free", async () => {
    await expect(encodePlan({ ...structuralPlan(), costUsd: 1 }, "/tmp/x.mp4")).rejects.toThrow(
      /not free/,
    );
  });
});

function fakeApi(render: unknown) {
  const calls: Record<string, unknown>[] = [];
  let given = false;
  const api = async (body: Record<string, unknown>) => {
    calls.push(body);
    if (body.action === "claim") {
      if (given) return { ok: true, render: null };
      given = true;
      return { ok: true, render, signed: {}, upload: { signedUrl: "[REDACTED]example.invalid/up" } };
    }
    return { ok: true, path: "p", assetId: "a" };
  };
  return { api, calls };
}

describe.skipIf(!hasFfmpeg)("worker runOnce", () => {
  it("queued → complete with a verified upload", async () => {
    const { api, calls } = fakeApi({
      id: "r1",
      kind: "proxy",
      plan: structuralPlan(),
      attempts: 1,
    });
    const uploads: string[] = [];
    const id = await runOnce({
      api,
      workerId: "t",
      upload: async (_u: string, f: string) => void uploads.push(f),
    });
    expect(id).toBe("r1");
    expect(uploads).toHaveLength(1);
    const done = calls.find((c) => c.action === "complete");
    expect(done?.renderId).toBe("r1");
    expect(Number(done?.durationSeconds)).toBeGreaterThan(0);
  });

  it("an encode error reports failed with the reason", async () => {
    const { api, calls } = fakeApi({
      id: "r2",
      kind: "proxy",
      plan: { ...structuralPlan(), costUsd: 3 },
      attempts: 1,
    });
    await runOnce({ api, workerId: "t", upload: async () => {} });
    const fail = calls.find((c) => c.action === "fail");
    expect(String(fail?.error)).toMatch(/not free/);
    expect(calls.some((c) => c.action === "complete")).toBe(false);
  });

  it("idle returns null", async () => {
    const id = await runOnce({ api: async () => ({ ok: true, render: null }), workerId: "t" });
    expect(id).toBeNull();
  });
});
