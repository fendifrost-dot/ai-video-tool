// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { M1_8GB_PROFILE } from "../../supabase/functions/_shared/gpuCapability.ts";
import { applyParameters, runOnce, uploadSigned } from "./worker.mjs";

const mac = {
  ...M1_8GB_PROFILE,
  models: ["sam2_hiera_small.pt"],
  nodes: ["Sam2Segmentation"],
};

const graph = {
  "3": { class_type: "Sam2Segmentation", inputs: { ckpt_name: "sam2_hiera_small.pt" } },
};

function job(id: string) {
  return {
    id,
    settings: {
      workflow: graph,
      workflow_name: "sam2-small-matte",
      license: "Apache-2.0",
      reference_only: false,
      performer: { generative_face: false, generative_mouth: false, touches: "read", mask_excludes_face_and_mouth: true },
      tier: "sam2-small",
      parameters: { mask: { node: "3", input: "threshold", value: 0.4 } },
    },
  };
}

describe("gpu worker", () => {
  it("binds parameters onto the API graph", () => {
    const next = applyParameters(graph, { mask: { node: "3", input: "threshold", value: 0.4 } });
    expect(next["3"].inputs.threshold).toBe(0.4);
    expect(graph["3"].inputs).not.toHaveProperty("threshold");
  });

  it("runs one local job and deletes scratch only after the hash matches", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "avt-gpu-worker-"));
    const calls: string[] = [];
    let comfyRan = false;
    try {
      const result = await runOnce({
        root,
        allowNonT7: true,
        capability: mac,
        workerId: "m1-test",
        api: async (body: { action: string }) => {
          calls.push(body.action);
          if (body.action === "claim") {
            return { ok: true, job: job("11111111-1111-4111-8111-111111111111"), signed: [], upload: { signedUrl: "https://upload.example/put" } };
          }
          if (body.action === "complete") return { ok: true, sha256_match: true };
          return { ok: true };
        },
        comfy: {
          async run({ scratch }: { scratch: string }) {
            comfyRan = true;
            const file = path.join(scratch, "matte.png");
            writeFileSync(file, "png");
            return { file, bytes: 3, durationSeconds: 1.5 };
          },
        },
        upload: async () => {},
      });
      expect(comfyRan).toBe(true);
      expect(result).toMatchObject({ ran: true });
      expect(calls).toEqual(["claim", "complete"]);
      expect(() => readFileSync(path.join(root, "scratch", "11111111-1111-4111-8111-111111111111", "matte.png"))).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not start ComfyUI when the graph is a 14B Wan workflow", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "avt-gpu-reject-"));
    let comfyRan = false;
    const failures: string[] = [];
    try {
      const result = await runOnce({
        root,
        allowNonT7: true,
        capability: mac,
        workerId: "m1-test",
        api: async (body: { action: string; error?: string }) => {
          if (body.action === "claim") {
            return {
              ok: true,
              job: {
                id: "22222222-2222-4222-8222-222222222222",
                settings: {
                  workflow_name: "Wan 2.2 Animate + Time-To-Move",
                  license: "none found (no LICENSE file)",
                  performer: { generative_face: false, generative_mouth: false, touches: "read", mask_excludes_face_and_mouth: true },
                  workflow: { "9": { class_type: "WanVideoSampler", inputs: { ckpt_name: "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors" } } },
                },
              },
              signed: [],
              upload: { signedUrl: "https://upload.example/put" },
            };
          }
          if (body.action === "fail") failures.push(body.error ?? "");
          return { ok: true };
        },
        comfy: {
          async run() {
            comfyRan = true;
            return { file: "nope" };
          },
        },
        upload: uploadSigned,
      });
      expect(comfyRan).toBe(false);
      expect(result).toMatchObject({ ran: false });
      expect(failures[0]).toMatch(/bigger machine|14B|usable/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
