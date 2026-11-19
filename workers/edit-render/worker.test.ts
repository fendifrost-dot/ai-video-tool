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
      return { ok: true, render, signed: {}, upload: { signedUrl: "upload-target" } };
    }
    return { ok: true, path: "p", assetId: "a", sha256_match: true };
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

describe("worker runOnce with a put-back job", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";
  const render = { id: "r-putback", kind: "job", job_kind: "putback", attempts: 1, settings: { preset: "c033_showroom" }, input_asset_ids: [A, B] };
  const claimed = { ok: true, render, inputs: { original: { assetId: A, signedUrl: "u1" }, swap: { assetId: B, signedUrl: "u2" } }, upload: { signedUrl: "up", path: "p" } };

  it("tells the door which kinds it can run, hands the runner the claim, and sends the proof back with the result", async () => {
    const calls: Record<string, unknown>[] = [];
    const api = async (body: Record<string, unknown>) => {
      calls.push(body);
      if (body.action === "claim") return claimed;
      return { ok: true, sha256_match: true, assetId: "asset-1", path: "p" };
    };
    const seen: Record<string, unknown>[] = [];
    const id = await runOnce({
      api,
      workerId: "t",
      kinds: ["edit", "putback"],
      upload: async () => {},
      hashFile: async () => "a".repeat(64),
      runJob: async (r: unknown, _dir: string, ctx: Record<string, unknown>) => {
        seen.push({ r, ctx });
        return { durationSeconds: 4, bytes: 10, sha256: "a".repeat(64), putback: { proof_max: 0, preset: "c033_showroom" } };
      },
    });
    expect(id).toBe("r-putback");
    expect(calls[0]).toMatchObject({ action: "claim", kinds: ["edit", "putback"] });
    expect((seen[0].ctx as { claim: unknown }).claim).toBe(claimed);
    expect(String((seen[0].ctx as { out: string }).out)).toMatch(/r-putback\.mp4$/);
    expect(calls[1]).toMatchObject({ action: "complete", renderId: "r-putback", putback: { proof_max: 0, preset: "c033_showroom" } });
  });

  it("a put-back that does not prove itself is reported failed with the reason, and nothing is uploaded", async () => {
    const calls: Record<string, unknown>[] = [];
    let uploaded = 0;
    await runOnce({
      api: async (body: Record<string, unknown>) => {
        calls.push(body);
        return body.action === "claim" ? claimed : { ok: true };
      },
      workerId: "t",
      kinds: ["edit", "putback"],
      upload: async () => {
        uploaded++;
      },
      runJob: async () => {
        throw new Error("max |out-original| on face/hair/skin is 4, not 0: his face is not his own pixels");
      },
    });
    expect(uploaded).toBe(0);
    expect(calls[1]).toMatchObject({ action: "fail", renderId: "r-putback" });
    expect(String(calls[1].error)).toContain("is 4, not 0");
  });

  it("a worker that says nothing claims the edit queue, as before", async () => {
    const calls: Record<string, unknown>[] = [];
    await runOnce({ api: async (body: Record<string, unknown>) => (calls.push(body), { ok: true, render: null }), workerId: "t" });
    expect(calls[0]).toEqual({ action: "claim", workerId: "t", kinds: ["edit"] });
  });
});
