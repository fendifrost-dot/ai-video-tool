// What a local ComfyUI worker may run. Pure: no network, no disk, no spend.
// Tiers are sized for an Apple M1 with 8 GB unified memory. The wave-2 packs in
// project-references (assets ef7c7891, 9fa07ba7, 811bfcd4, catalog 1a1fe9c8) were
// read on 13 Nov 2026 and are not copied into this repo.

import { comfyCloudDecision } from "./comfyCloud.ts";

export const GIB = 1024 ** 3;

/** macOS and ComfyUI share the 8 GB. Plan on 5 GB for the model and activations. */
export const M1_8GB_MEMORY_BYTES = 8 * GIB;
export const M1_8GB_USABLE_BYTES = 5 * GIB;

export type Accelerator = "mps" | "cuda" | "any";
export type Feasibility = "likely" | "tight" | "needs_bigger_machine";
export type Verdict = Feasibility | "refused_performer" | "refused_paid" | "reference_only";

export type GpuTier = {
  id: string;
  title: string;
  feasibility: Feasibility;
  minMemoryBytes: number;
  accelerator: Accelerator;
  mpsOk: boolean;
  maxEdge: number | null;
  notes: string;
};

export const GPU_TIERS: readonly GpuTier[] = [
  { id: "rvm", title: "Robust Video Matting (MobileNet)", feasibility: "likely", minMemoryBytes: 2 * GIB, accelerator: "mps", mpsOk: true, maxEdge: 1080, notes: "RVM MobileNetV3 is a few tens of MB. Short clips fit in the 5 GB budget." },
  { id: "planar-track", title: "Planar track and corner pin", feasibility: "likely", minMemoryBytes: 2 * GIB, accelerator: "any", mpsOk: true, maxEdge: 1080, notes: "PlateTrack's planar nodes are OpenCV on CPU. The face-replace graph is a separate refusal." },
  { id: "depth-anything-v2-small", title: "Depth Anything V2 small", feasibility: "likely", minMemoryBytes: 3 * GIB, accelerator: "mps", mpsOk: true, maxEdge: 768, notes: "ViT-S is about 100 MB. ViT-L is a different tier." },
  { id: "raft-small", title: "RAFT-small optical flow", feasibility: "likely", minMemoryBytes: 3 * GIB, accelerator: "mps", mpsOk: true, maxEdge: 720, notes: "Weights are small. The correlation volume is the cost, so 720p is the cap on this Mac." },
  { id: "tracking-lowres", title: "Low-res point tracking", feasibility: "likely", minMemoryBytes: 4 * GIB, accelerator: "mps", mpsOk: true, maxEdge: 720, notes: "A few points at 720p. CoTracker3 and SAM3 video state are not this tier." },
  { id: "sam2-small", title: "SAM 2 small or tiny", feasibility: "likely", minMemoryBytes: 4 * GIB, accelerator: "mps", mpsOk: true, maxEdge: 720, notes: "Hiera-small is about 180 MB. Short clips, one model loaded." },
  { id: "birefnet", title: "BiRefNet general, one frame", feasibility: "likely", minMemoryBytes: 4 * GIB, accelerator: "mps", mpsOk: true, maxEdge: 1024, notes: "MPS matting is about 3–6 GB at 1024. One image at a time. The HR variant is not this tier." },
  { id: "inpaint-lowres", title: "Low-res inpaint or clean plate", feasibility: "tight", minMemoryBytes: 4 * GIB, accelerator: "mps", mpsOk: true, maxEdge: 512, notes: "LaMa or SD 1.5 at 512, batch 1, with --lowvram. The mask must exclude his face and mouth. Flux and Wan inpaint are not this tier." },
  { id: "sam2-base-plus", title: "SAM 2 base-plus", feasibility: "tight", minMemoryBytes: 8 * GIB, accelerator: "mps", mpsOk: true, maxEdge: 512, notes: "The paint-out pack loads sam2_hiera_base_plus. That plus a video memory bank exceeds the 5 GB usable budget." },
  { id: "depth-anything-v2-large", title: "Depth Anything V2 large", feasibility: "tight", minMemoryBytes: 8 * GIB, accelerator: "mps", mpsOk: true, maxEdge: 512, notes: "ViT-L fp32, the file in the mattes pack (depth_anything_v2_vitl_fp32). Stills only on a bigger Mac." },
  { id: "seedvr2", title: "SeedVR2 3B/7B", feasibility: "needs_bigger_machine", minMemoryBytes: 12 * GIB, accelerator: "cuda", mpsOk: false, maxEdge: null, notes: "The pack's presets start at 6 GB of dedicated VRAM. A 7B fp16 weight does not fit in 8 GB unified." },
  { id: "sam3", title: "SAM 3 video", feasibility: "needs_bigger_machine", minMemoryBytes: 16 * GIB, accelerator: "cuda", mpsOk: false, maxEdge: null, notes: "sam3.pt plus a video state, as in the mattes and clean-plate graphs. Not the 8 GB path." },
  { id: "flux", title: "Flux", feasibility: "needs_bigger_machine", minMemoryBytes: 16 * GIB, accelerator: "cuda", mpsOk: false, maxEdge: null, notes: "Skin detailer and the upscale recon load Flux fp8. Needs a discrete GPU." },
  { id: "qwen-image", title: "Qwen Image Edit", feasibility: "needs_bigger_machine", minMemoryBytes: 16 * GIB, accelerator: "cuda", mpsOk: false, maxEdge: null, notes: "Qwen-Image-Edit plus a 7B VL encoder." },
  { id: "ltx-22b", title: "LTX 2.3 / 2.5 22B", feasibility: "needs_bigger_machine", minMemoryBytes: 24 * GIB, accelerator: "cuda", mpsOk: false, maxEdge: null, notes: "Clean plate, HDR, and alpha graphs load 22B transformers. Cloud or a large CUDA machine." },
  { id: "wan-14b", title: "Wan 2.1 / 2.2 14B and Wan Animate", feasibility: "needs_bigger_machine", minMemoryBytes: 40 * GIB, accelerator: "cuda", mpsOk: false, maxEdge: null, notes: "14B fp8 is still well past 8 GB unified, and MPS is not the supported path. Time-To-Move, sky, background, and character-swap graphs are this tier." },
];

const TIER_BY_ID = new Map(GPU_TIERS.map((tier) => [tier.id, tier]));

/** Heavier patterns win. Observed in the wave-2 graphs, 13 Nov 2026. */
const MODEL_TIERS: { test: RegExp; tier: string }[] = [
  { test: /wan|umt5/i, tier: "wan-14b" },
  { test: /ltx-?2|ltxv|gemma_3_12b/i, tier: "ltx-22b" },
  { test: /flux/i, tier: "flux" },
  { test: /qwen[-_]?image|qwen_2\.5_vl_7b|qwen_3_4b/i, tier: "qwen-image" },
  { test: /seedvr2/i, tier: "seedvr2" },
  { test: /sam3/i, tier: "sam3" },
  { test: /depth_anything_v2_vitl/i, tier: "depth-anything-v2-large" },
  { test: /sam2_hiera_(base|large)/i, tier: "sam2-base-plus" },
  { test: /sam2_hiera_(small|tiny)/i, tier: "sam2-small" },
  { test: /birefnet/i, tier: "birefnet" },
  { test: /rvm|robustvideomatting/i, tier: "rvm" },
  { test: /depth_anything_v2_vits|depth_anything_v2_vitb/i, tier: "depth-anything-v2-small" },
  { test: /raft/i, tier: "raft-small" },
];

/** Class types and titles that redraw a face or a mouth. Flags cannot opt in. */
const PERFORMER_CLASS = /platetrackface|facedetailer|skindetailer|reactor|instantid|ipadapterface|pulid|photomaker|liveportrait|sadtalker|wav2lip|lipsync|hallo|echomimic|musetalk|latentsync|gfpgan|codeformer|restoreformer|facerestore|hyperswap|\broop\b|insightface|fantasytalking|wanvideoanimateembeds|de-?aging|face[_ -]?replace|character[_ -]?(swap|replac)|skin[_ -]?detailer/i;

const INPAINT_CLASS = /inpaint|wanvace|vacetovideo/i;

/** Partner nodes that bill another API. Observed: GeminiNode, GeminiNanoBanana2, GeminiImage2Node. */
const PAID_CLASS = /gemini|seedance|klingnode|runway|higgsfield|^veo|nanobanana|partner/i;

const WEIGHT_EXT = /\.(safetensors|ckpt|pt|pth|gguf|bin|onnx)$/i;
const WEIGHT_KEY = /model|ckpt|lora|vae|unet|clip|filename|weight|ckpt_name/i;

export type WorkerCapability = {
  lane?: string;
  device: "mps" | "cuda" | "cpu";
  memory_bytes: number;
  usable_bytes: number;
  mps: boolean;
  cuda: boolean;
  comfyui?: boolean;
  models: string[];
  nodes: string[];
  comfy_cloud?: boolean;
};

export const M1_8GB_PROFILE: WorkerCapability = {
  lane: "gpu",
  device: "mps",
  memory_bytes: M1_8GB_MEMORY_BYTES,
  usable_bytes: M1_8GB_USABLE_BYTES,
  mps: true,
  cuda: false,
  comfyui: true,
  models: [],
  nodes: [],
  comfy_cloud: false,
};

export type PerformerFlags = {
  generative_face?: unknown;
  generative_mouth?: unknown;
  touches?: unknown;
  mask_excludes_face_and_mouth?: unknown;
};

export type Scan = {
  format: "api" | "ui" | "unknown";
  classTypes: string[];
  models: string[];
  titles: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function modelKey(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  return base.toLowerCase().replace(/\.(safetensors|ckpt|pt|pth|gguf|bin|onnx)$/i, "");
}

export function scanGraph(graph: unknown): Scan {
  const classTypes = new Set<string>();
  const models = new Set<string>();
  const titles = new Set<string>();
  const walk = (value: unknown, key: string | null) => {
    if (typeof value === "string") {
      if (key && /^(class_type|type)$/.test(key) && value.length > 0 && value.length < 120) classTypes.add(value);
      if (key === "title" && value.length > 0 && value.length < 200) titles.add(value);
      if ((key && WEIGHT_KEY.test(key)) || WEIGHT_EXT.test(value)) {
        if (value.length < 240 && WEIGHT_EXT.test(value)) models.add(value);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item, null);
      return;
    }
    const row = asRecord(value);
    if (!row) return;
    for (const [childKey, child] of Object.entries(row)) walk(child, childKey);
  };
  walk(graph, null);
  const record = asRecord(graph);
  const api = record
    ? Object.values(record).some((item) => {
        const row = asRecord(item);
        return !!row && typeof row.class_type === "string";
      })
    : false;
  const ui = record ? Array.isArray(record.nodes) : false;
  return {
    format: api ? "api" : ui ? "ui" : "unknown",
    classTypes: [...classTypes],
    models: [...models],
    titles: [...titles],
  };
}

export function tierById(id: string | null | undefined): GpuTier | null {
  if (!id) return null;
  return TIER_BY_ID.get(id) ?? null;
}

function heaviest(ids: string[]): GpuTier | null {
  let best: GpuTier | null = null;
  for (const id of ids) {
    const tier = tierById(id);
    if (!tier) continue;
    if (!best || tier.minMemoryBytes > best.minMemoryBytes) best = tier;
  }
  return best;
}

export function inferTier(scan: Scan, declared?: string | null): GpuTier | null {
  const fromModels = scan.models.map((name) => MODEL_TIERS.find((row) => row.test.test(name))?.tier).filter((id): id is string => !!id);
  const fromClasses = scan.classTypes.map((name) => MODEL_TIERS.find((row) => row.test.test(name))?.tier).filter((id): id is string => !!id);
  return heaviest([...fromModels, ...fromClasses, declared ?? ""]);
}

export function tierFits(worker: WorkerCapability, tier: GpuTier): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (tier.feasibility === "needs_bigger_machine" || tier.minMemoryBytes > worker.usable_bytes) {
    reasons.push(
      `${tier.title} needs ${tier.minMemoryBytes} bytes of usable memory and ${tier.accelerator === "cuda" ? "CUDA" : "a GPU"}. This worker has ${worker.usable_bytes} bytes usable on ${worker.device}. It needs a bigger machine or stays off this Mac.`,
    );
  }
  if (!tier.mpsOk && worker.device === "mps") reasons.push(`${tier.title} is not an MPS workload.`);
  if (tier.accelerator === "cuda" && !worker.cuda) reasons.push(`${tier.title} needs CUDA. This worker has no CUDA device.`);
  return { ok: reasons.length === 0, reasons };
}

const LICENSE_BLOCKS = /none found|no license|unclear|reference-only/i;

export type Classification = {
  tier: GpuTier | null;
  reasons: string[];
  runnableFormat: boolean;
  refusedPerformer: boolean;
  refusedPaid: boolean;
  licenseBlocks: boolean;
  scan: Scan;
};

export function classifyGraph(input: {
  name?: string;
  graph: unknown;
  license?: string;
  referenceOnly?: boolean;
  performer?: PerformerFlags;
  declaredTier?: string | null;
}): Classification {
  const scan = scanGraph(input.graph);
  const reasons: string[] = [];
  const performerHits = [...scan.classTypes, ...scan.titles, input.name ?? ""].filter((item) => PERFORMER_CLASS.test(item));
  const paidHits = scan.classTypes.filter((item) => PAID_CLASS.test(item));
  const inpaint = scan.classTypes.some((item) => INPAINT_CLASS.test(item));
  const flags = input.performer ?? {};

  if (flags.generative_face !== false) reasons.push("Hyenas performer protection: generative_face must be false. A generative pass on his face is refused.");
  if (flags.generative_mouth !== false) reasons.push("Hyenas performer protection: generative_mouth must be false. A generative pass on his mouth is refused.");
  if (flags.touches !== "none" && flags.touches !== "read") {
    reasons.push("performer.touches must be none or read. read is a mask, matte, depth, or track. generate is refused.");
  }
  if (performerHits.length > 0) {
    reasons.push(`Hyenas performer protection: ${performerHits.join(", ")} redraws a face or a mouth. Character-swap, Skin Detailer, Deaging, and PlateTrack face_replace stay off him.`);
  }
  if (inpaint && flags.mask_excludes_face_and_mouth !== true) {
    reasons.push("This graph inpaints or paints out. Set performer.mask_excludes_face_and_mouth to true. The mask must leave his face and mouth alone.");
  }
  if (paidHits.length > 0) reasons.push(`Paid partner node ${paidHits.join(", ")} is in the graph. This worker does not call it. Cost stays $0.`);
  if (scan.format !== "api") reasons.push("This is the ComfyUI editor format. A live job needs the API-format export (class_type / inputs).");

  const licenseBlocks = input.referenceOnly === true || !input.license || LICENSE_BLOCKS.test(input.license);
  if (licenseBlocks) reasons.push("License is missing, unclear, or reference-only. The graph can be listed. A live job is not queued.");

  const refusedPerformer = flags.generative_face !== false || flags.generative_mouth !== false || (flags.touches !== "none" && flags.touches !== "read") || performerHits.length > 0 || (inpaint && flags.mask_excludes_face_and_mouth !== true);
  return {
    tier: inferTier(scan, input.declaredTier),
    reasons,
    runnableFormat: scan.format === "api",
    refusedPerformer,
    refusedPaid: paidHits.length > 0,
    licenseBlocks,
    scan,
  };
}

export function verdictFor(classified: Classification, worker: WorkerCapability): Verdict {
  if (classified.refusedPerformer) return "refused_performer";
  if (classified.refusedPaid) return "refused_paid";
  if (classified.tier) {
    const fit = tierFits(worker, classified.tier);
    if (!fit.ok) return "needs_bigger_machine";
    if (classified.tier.feasibility === "tight") return classified.licenseBlocks ? "reference_only" : "tight";
  }
  if (classified.licenseBlocks) return "reference_only";
  return "likely";
}

export type Assessment = Classification & {
  ok: boolean;
  costUsd: 0;
  accepted: boolean;
  verdict: Verdict;
};

export function assessGpuJob(input: {
  name?: string;
  graph: unknown;
  license?: string;
  referenceOnly?: boolean;
  performer?: PerformerFlags;
  declaredTier?: string | null;
  route?: string;
  worker: WorkerCapability | null;
  requiredModels?: string[];
  requiredNodes?: string[];
  device?: { min_memory_bytes?: number; accelerator?: string; mps_ok?: boolean };
  env?: Record<string, string | undefined>;
}): Assessment {
  const route = input.route ?? "local";
  if (route === "comfy_cloud" || input.worker?.comfy_cloud === true) {
    const cloud = comfyCloudDecision(input.env);
    const classified = classifyGraph(input);
    return { ...classified, verdict: "refused_paid", ok: false, accepted: false, costUsd: 0, reasons: [cloud.reason, ...classified.reasons] };
  }
  if (route !== "local") {
    const classified = classifyGraph(input);
    return { ...classified, verdict: "refused_paid", ok: false, accepted: false, costUsd: 0, reasons: [`unknown route ${route}`, ...classified.reasons] };
  }
  const classified = classifyGraph(input);
  const named = input.worker;
  const worker = named ?? M1_8GB_PROFILE;
  const verdict = verdictFor(classified, worker);
  const reasons = [...classified.reasons];
  if (classified.tier) {
    const fit = tierFits(worker, classified.tier);
    if (!fit.ok) reasons.push(...fit.reasons);
  }
  let ok = (verdict === "likely" || verdict === "tight") && classified.runnableFormat;
  const device = input.device;
  if (worker && device) {
    if (typeof device.min_memory_bytes === "number" && device.min_memory_bytes > worker.usable_bytes) {
      ok = false;
      reasons.push(`Workflow asks for ${device.min_memory_bytes} bytes usable. This worker has ${worker.usable_bytes}.`);
    }
    if (device.accelerator === "cuda" && !worker.cuda) {
      ok = false;
      reasons.push("Workflow accelerator is CUDA. This worker is not CUDA.");
    }
    if (device.mps_ok === false && worker.device === "mps") {
      ok = false;
      reasons.push("Workflow sets mps_ok false. This worker is MPS.");
    }
  }
  if (named) {
    const installed = new Set(named.models.map(modelKey));
    for (const model of input.requiredModels ?? []) {
      const key = modelKey(model);
      const have = installed.has(key) || [...installed].some((item) => item.includes(key));
      if (!have) {
        ok = false;
        reasons.push(`Model ${model} is not installed on this worker.`);
      }
    }
    if ((input.requiredNodes ?? []).length > 0 && named.nodes.length === 0) {
      ok = false;
      reasons.push("This worker has not reported its ComfyUI nodes yet.");
    }
    for (const node of input.requiredNodes ?? []) {
      if (named.nodes.length > 0 && !named.nodes.includes(node)) {
        ok = false;
        reasons.push(`Node ${node} is not installed on this worker.`);
      }
    }
  }
  return { ...classified, reasons, ok, accepted: ok, verdict, costUsd: 0 };
}
