// GPU job plans. dry_run defaults to true. Cost is always 0. Comfy Cloud stays off.
import { assessGpuJob, type WorkerCapability } from "../_shared/gpuCapability.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{0,48}$/;

export type GpuResult<T> = { ok: true; value: T } | { ok: false; error: string };

function fail(error: string): GpuResult<never> {
  return { ok: false, error };
}

export type WorkflowDraft = {
  slug: string;
  name: string;
  graph: Record<string, unknown>;
  parameter_schema: Record<string, unknown>;
  params_defaults: Record<string, unknown>;
  required_models: string[];
  required_nodes: string[];
  device: { min_memory_bytes: number; accelerator: "mps" | "cuda" | "any"; mps_ok: boolean; tier?: string; max_edge?: number };
  license: string;
  performer: { generative_face: false; generative_mouth: false; touches: "none" | "read"; mask_excludes_face_and_mouth?: boolean };
  reference_only: boolean;
  workflow_asset_id: string | null;
};

function stringList(raw: unknown, label: string): GpuResult<string[]> {
  if (raw === undefined) return { ok: true, value: [] };
  if (!Array.isArray(raw) || raw.some((item) => typeof item !== "string" || item.length === 0 || item.length > 200)) {
    return fail(`${label} must be a list of short strings`);
  }
  return { ok: true, value: raw };
}

export function planGpuWorkflow(args: Record<string, unknown>): GpuResult<WorkflowDraft> {
  if (typeof args.slug !== "string" || !SLUG.test(args.slug)) return fail("slug must be a short lowercase name");
  if (typeof args.name !== "string" || args.name.trim().length === 0 || args.name.length > 120) return fail("name is required");
  if (!args.graph || typeof args.graph !== "object" || Array.isArray(args.graph)) return fail("graph must be a ComfyUI workflow object");
  const encoded = JSON.stringify(args.graph);
  if (encoded.length > 1_000_000) return fail("graph is over 1 MB");
  const schema = args.parameter_schema;
  if (!schema || typeof schema !== "object" || Array.isArray(schema) || (schema as { type?: string }).type !== "object") {
    return fail("parameter_schema must be a JSON schema with type object");
  }
  const models = stringList(args.required_models, "required_models");
  if (!models.ok) return models;
  const nodes = stringList(args.required_nodes, "required_nodes");
  if (!nodes.ok) return nodes;
  const device = args.device;
  if (!device || typeof device !== "object" || Array.isArray(device)) return fail("device is required");
  const row = device as Record<string, unknown>;
  if (typeof row.min_memory_bytes !== "number" || row.min_memory_bytes < 1) return fail("device.min_memory_bytes must be a positive number");
  if (row.accelerator !== "mps" && row.accelerator !== "cuda" && row.accelerator !== "any") return fail("device.accelerator must be mps, cuda, or any");
  if (typeof row.mps_ok !== "boolean") return fail("device.mps_ok must be true or false");
  if (typeof args.license !== "string" || args.license.trim().length === 0 || args.license.length > 240) return fail("license is required");
  const performer = args.performer;
  if (!performer || typeof performer !== "object" || Array.isArray(performer)) return fail("performer flags are required");
  const flags = performer as Record<string, unknown>;
  if (flags.generative_face !== false || flags.generative_mouth !== false) {
    return fail("Hyenas performer protection: generative_face and generative_mouth must be false");
  }
  if (flags.touches !== "none" && flags.touches !== "read") return fail("performer.touches must be none or read");
  const asset = args.workflow_asset_id == null || args.workflow_asset_id === "" ? null : String(args.workflow_asset_id);
  if (asset !== null && !UUID.test(asset)) return fail("workflow_asset_id must be a uuid");
  const defaults = args.params_defaults === undefined ? {} : args.params_defaults;
  if (!defaults || typeof defaults !== "object" || Array.isArray(defaults)) return fail("params_defaults must be an object");
  const assessment = assessGpuJob({
    name: args.name,
    graph: args.graph,
    license: args.license,
    referenceOnly: args.reference_only === true,
    performer: flags,
    declaredTier: typeof row.tier === "string" ? row.tier : null,
    worker: null,
    requiredModels: models.value,
    requiredNodes: nodes.value,
    device: { min_memory_bytes: row.min_memory_bytes, accelerator: String(row.accelerator), mps_ok: row.mps_ok },
  });
  if (assessment.refusedPerformer || assessment.refusedPaid) return fail(assessment.reasons[0] ?? "workflow refused");
  return {
    ok: true,
    value: {
      slug: args.slug,
      name: args.name.trim(),
      graph: args.graph as Record<string, unknown>,
      parameter_schema: schema as Record<string, unknown>,
      params_defaults: defaults as Record<string, unknown>,
      required_models: models.value,
      required_nodes: nodes.value,
      device: {
        min_memory_bytes: row.min_memory_bytes,
        accelerator: row.accelerator,
        mps_ok: row.mps_ok,
        tier: typeof row.tier === "string" ? row.tier : undefined,
        max_edge: typeof row.max_edge === "number" ? row.max_edge : undefined,
      },
      license: args.license.trim(),
      performer: {
        generative_face: false,
        generative_mouth: false,
        touches: flags.touches,
        mask_excludes_face_and_mouth: flags.mask_excludes_face_and_mouth === true,
      },
      reference_only: args.reference_only === true || assessment.licenseBlocks,
      workflow_asset_id: asset,
    },
  };
}

export type GpuEffect = {
  id: string;
  name: string;
  engine: string;
  workflow: unknown;
  license: string | null;
  reference_only: boolean;
  required_models: string[];
  required_nodes: string[];
  device_requirement: Record<string, unknown>;
  performer_protection: Record<string, unknown>;
  workflow_sha256: string | null;
};

export function planGpuSubmit(
  args: Record<string, unknown>,
  effect: GpuEffect | null,
  worker: WorkerCapability | null,
): GpuResult<{
  dryRun: boolean;
  accepted: boolean;
  costUsd: 0;
  project_id: string;
  effect_id: string;
  input_asset_ids: string[];
  assigned_worker: string | null;
  parameters: Record<string, unknown>;
  reasons: string[];
  verdict: string;
  tier: string | null;
}> {
  const dryRun = args.dry_run !== false;
  const route = args.route === undefined ? "local" : String(args.route);
  if (typeof args.project_id !== "string" || !UUID.test(args.project_id)) return fail("project_id must be a uuid");
  if (typeof args.effect_id !== "string" || !UUID.test(args.effect_id)) return fail("effect_id must be a uuid");
  if (!effect || effect.engine !== "comfyui") return fail("effect_id must be a comfyui workflow");
  const inputs = args.input_asset_ids === undefined ? [] : args.input_asset_ids;
  if (!Array.isArray(inputs) || inputs.some((id) => typeof id !== "string" || !UUID.test(id))) return fail("input_asset_ids must be uuids");
  const parameters = args.parameters === undefined ? {} : args.parameters;
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) return fail("parameters must be an object");
  const assessment = assessGpuJob({
    name: effect.name,
    graph: effect.workflow,
    license: effect.license ?? "",
    referenceOnly: effect.reference_only,
    performer: effect.performer_protection,
    declaredTier: typeof effect.device_requirement.tier === "string" ? effect.device_requirement.tier : null,
    route,
    worker,
    requiredModels: effect.required_models,
    requiredNodes: effect.required_nodes,
    device: {
      min_memory_bytes: typeof effect.device_requirement.min_memory_bytes === "number" ? effect.device_requirement.min_memory_bytes : undefined,
      accelerator: typeof effect.device_requirement.accelerator === "string" ? effect.device_requirement.accelerator : undefined,
      mps_ok: typeof effect.device_requirement.mps_ok === "boolean" ? effect.device_requirement.mps_ok : undefined,
    },
    env: args.env as Record<string, string | undefined> | undefined,
  });
  const value = {
    dryRun,
    accepted: assessment.accepted,
    costUsd: 0 as const,
    project_id: args.project_id,
    effect_id: effect.id,
    input_asset_ids: inputs as string[],
    assigned_worker: typeof args.assigned_worker === "string" ? args.assigned_worker : null,
    parameters: parameters as Record<string, unknown>,
    reasons: assessment.reasons,
    verdict: assessment.verdict,
    tier: assessment.tier?.id ?? null,
  };
  if (!dryRun && !assessment.accepted) return fail(assessment.reasons.join(" "));
  if (!dryRun && !value.assigned_worker) return fail("assigned_worker is required when dry_run is false");
  return { ok: true, value };
}

export const GPU_TOOL_DEFS = [
  {
    name: "avt_gpu_worker_list",
    description: "GPU workers you registered (lane gpu): label, MPS or CUDA, memory, installed models and nodes. The secret hash is not returned. Read only. $0.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "avt_gpu_workflow_list",
    description: "ComfyUI workflows registered as effects: parameter schema, models, nodes, device, license, and the performer flags. Read only. $0. The wave-2 packs stay in Storage and are not copied here.",
    inputSchema: { type: "object", properties: { slug: { type: "string" } } },
  },
  {
    name: "avt_gpu_workflow_register",
    description: "Store a ComfyUI graph as an effect and a skill version. Requires generative_face false and generative_mouth false (Hyenas). Refuses character-swap, Skin Detailer, Deaging, PlateTrack face_replace, and paid partner nodes. A missing license is stored reference-only and cannot be queued. $0. Audited.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        name: { type: "string" },
        graph: { type: "object" },
        parameter_schema: { type: "object" },
        params_defaults: { type: "object" },
        required_models: { type: "array", items: { type: "string" } },
        required_nodes: { type: "array", items: { type: "string" } },
        device: { type: "object" },
        license: { type: "string" },
        performer: { type: "object" },
        reference_only: { type: "boolean" },
        workflow_asset_id: { type: "string" },
      },
      required: ["slug", "name", "graph", "parameter_schema", "device", "license", "performer"],
    },
  },
  {
    name: "avt_gpu_job_submit",
    description: "Queue a ComfyUI job on the existing edit_renders row (job_kind gpu). dry_run defaults to true and inserts nothing. cost_usd is 0. Jobs that exceed the worker, redraw a face or mouth, or ask for Comfy Cloud are refused with a reason and are not started. Comfy Cloud is disabled. Audited only when a row is written.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        effect_id: { type: "string" },
        input_asset_ids: { type: "array", items: { type: "string" } },
        parameters: { type: "object" },
        assigned_worker: { type: "string" },
        route: { type: "string", enum: ["local", "comfy_cloud"] },
        dry_run: { type: "boolean", description: "default true" },
      },
      required: ["project_id", "effect_id"],
    },
  },
  {
    name: "avt_gpu_job_status",
    description: "Status, progress, log tail, timing, and output asset ids for one GPU job. Read only. $0.",
    inputSchema: { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"] },
  },
  {
    name: "avt_gpu_job_cancel",
    description: "Cancel a queued or rendering GPU job. A finished job stays. Does not delete assets. $0. Audited.",
    inputSchema: { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"] },
  },
] as const;

export const GPU_TOOL_NAMES = GPU_TOOL_DEFS.map((tool) => tool.name);
