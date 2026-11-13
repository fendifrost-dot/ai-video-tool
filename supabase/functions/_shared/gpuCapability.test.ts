// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { comfyCloudDecision, refuseComfyCloud } from "./comfyCloud.ts";
import {
  M1_8GB_PROFILE,
  assessGpuJob,
  modelKey,
  type PerformerFlags,
} from "./gpuCapability.ts";

const SAFE: PerformerFlags = {
  generative_face: false,
  generative_mouth: false,
  touches: "read",
  mask_excludes_face_and_mouth: true,
};

const mac = {
  ...M1_8GB_PROFILE,
  models: ["sam2_hiera_small.pt", "rvm_mobilenetv3.pth", "birefnet_general.safetensors", "depth_anything_v2_vits.pth", "raft-small.pth"],
  nodes: ["Sam2Segmentation", "RobustVideoMatting", "DepthAnything_V2", "RAFT", "PlateTrackPlanar"],
};

function api(classType: string, weights: Record<string, string> = {}) {
  return { "3": { class_type: classType, inputs: { ckpt_name: weights.ckpt, image: "in.png", ...weights } } };
}

describe("M1 8 GB capability", () => {
  it("treats SAM2-small, RVM, BiRefNet, small depth, and RAFT as runnable", () => {
    const sam = assessGpuJob({
      name: "sam2-small-matte",
      graph: api("Sam2Segmentation", { ckpt_name: "sam2_hiera_small.pt" }),
      license: "Apache-2.0",
      performer: SAFE,
      worker: mac,
      requiredModels: ["sam2_hiera_small.pt"],
      requiredNodes: ["Sam2Segmentation"],
    });
    expect(sam.verdict).toBe("likely");
    expect(sam.accepted).toBe(true);
    expect(sam.costUsd).toBe(0);
    expect(assessGpuJob({
      name: "rvm",
      graph: api("RobustVideoMatting", { ckpt_name: "rvm_mobilenetv3.pth" }),
      license: "MIT",
      performer: { ...SAFE, touches: "read" },
      worker: mac,
    }).verdict).toBe("likely");
    expect(assessGpuJob({
      name: "depth-small",
      graph: api("DepthAnything_V2", { ckpt_name: "depth_anything_v2_vits.pth" }),
      license: "Apache-2.0",
      performer: SAFE,
      worker: mac,
    }).tier?.id).toBe("depth-anything-v2-small");
  });

  it("rejects the wave-2 heavy graphs that were read from AVT storage", () => {
    // Model filenames and class types observed in the packs. The graphs themselves stay in Storage.
    const wan = assessGpuJob({
      name: "Wan 2.2 Animate + Time-To-Move",
      graph: api("WanVideoSampler", { ckpt_name: "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors" }),
      license: "none found (no LICENSE file)",
      performer: SAFE,
      worker: mac,
    });
    expect(wan.verdict).toBe("needs_bigger_machine");
    expect(wan.accepted).toBe(false);
    expect(wan.reasons.join(" ")).toMatch(/bigger machine|14B|usable/i);

    const ltx = assessGpuJob({
      name: "LTX Cleanplate",
      graph: api("LTXVInpaintPreprocess", { ckpt_name: "ltx-2.3-22b-dev_transformer_only_bf16.safetensors" }),
      license: "none found",
      performer: SAFE,
      worker: mac,
    });
    expect(ltx.verdict).toBe("needs_bigger_machine");

    const depthLarge = assessGpuJob({
      name: "Mattes and Utilities",
      graph: api("DepthAnything_V2", { ckpt_name: "depth_anything_v2_vitl_fp32.safetensors" }),
      license: "none found",
      performer: SAFE,
      worker: mac,
    });
    expect(depthLarge.tier?.id).toBe("depth-anything-v2-large");
    expect(depthLarge.verdict).toBe("needs_bigger_machine");
  });

  it("refuses character-swap, skin detailer, deaging, and PlateTrack face_replace", () => {
    const face = assessGpuJob({
      name: "face_replace",
      graph: { nodes: [{ type: "PlateTrackFace", title: "face_replace" }] },
      license: "reference-only",
      referenceOnly: true,
      performer: SAFE,
      worker: mac,
    });
    expect(face.verdict).toBe("refused_performer");
    expect(face.reasons.join(" ")).toMatch(/Hyenas/);

    expect(assessGpuJob({
      name: "Skin Detailer + Upscale Recon",
      graph: api("KSampler", { ckpt_name: "Flux_Skin_Detailer.safetensors" }),
      license: "none found",
      performer: SAFE,
      worker: mac,
    }).verdict).toBe("refused_performer");

    expect(assessGpuJob({
      name: "Deaging Workflow",
      graph: api("WanVideoSampler", { ckpt_name: "Wan2_2-Animate-14B_fp8_scaled_e4m3fn_KJ_v2.safetensors" }),
      license: "none found",
      performer: SAFE,
      worker: mac,
    }).verdict).toBe("refused_performer");

    expect(assessGpuJob({
      name: "Wan 2.2 Animate Face & Character Replacement",
      graph: api("WanVideoAnimateEmbeds", { ckpt_name: "Wan2_2-Animate-14B_fp8_scaled_e4m3fn_KJ_v2.safetensors" }),
      license: "none found",
      performer: SAFE,
      worker: mac,
    }).verdict).toBe("refused_performer");
  });

  it("refuses a paid partner node and Comfy Cloud without a call", () => {
    const gemini = assessGpuJob({
      name: "Sky Replacement",
      graph: api("GeminiImage2Node", { ckpt_name: "Wan2_2-Animate-14B_fp8_scaled_e4m3fn_KJ_v2.safetensors" }),
      license: "none found",
      performer: SAFE,
      worker: mac,
    });
    expect(gemini.verdict).toBe("refused_paid");
    expect(gemini.costUsd).toBe(0);

    const cloud = assessGpuJob({
      name: "sam2-small-matte",
      graph: api("Sam2Segmentation", { ckpt_name: "sam2_hiera_small.pt" }),
      license: "Apache-2.0",
      performer: SAFE,
      route: "comfy_cloud",
      worker: mac,
      env: { COMFY_CLOUD_ENABLED: "1" },
    });
    expect(cloud.accepted).toBe(false);
    expect(cloud.verdict).toBe("refused_paid");
    expect(cloud.reasons[0]).toMatch(/ignored/);
    expect(comfyCloudDecision({ COMFY_CLOUD_ENABLED: "true" }).paidCallsImplemented).toBe(false);
    expect(() => refuseComfyCloud()).toThrow(/disabled/);
    const source = readFileSync(new URL("./comfyCloud.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/fetch\s*\(/);
    expect(source).not.toMatch(/api\.comfy/);
  });

  it("requires the inpaint mask to spare his face, and keeps low-res inpaint tight", () => {
    const open = assessGpuJob({
      name: "clean-plate",
      graph: api("InpaintModelConditioning"),
      license: "Apache-2.0",
      performer: { generative_face: false, generative_mouth: false, touches: "read" },
      declaredTier: "inpaint-lowres",
      worker: mac,
    });
    expect(open.verdict).toBe("refused_performer");
    const closed = assessGpuJob({
      name: "clean-plate",
      graph: api("InpaintModelConditioning"),
      license: "Apache-2.0",
      performer: SAFE,
      declaredTier: "inpaint-lowres",
      worker: mac,
    });
    expect(closed.verdict).toBe("tight");
    expect(closed.accepted).toBe(true);
  });

  it("lists PlateTrack planar as hardware-likely and reference-only", () => {
    const track = assessGpuJob({
      name: "PlateTrack planar",
      graph: api("PlateTrackPlanar"),
      license: "Declared MIT in pyproject.toml only",
      referenceOnly: true,
      performer: { generative_face: false, generative_mouth: false, touches: "none" },
      declaredTier: "planar-track",
      worker: mac,
    });
    expect(track.tier?.id).toBe("planar-track");
    expect(track.verdict).toBe("reference_only");
    expect(track.accepted).toBe(false);
    expect(modelKey("models/sam2/sam2_hiera_small.pt")).toBe("sam2_hiera_small");
  });
});
