// GPU workers, ComfyUI workflows, and jobs. dry_run inserts nothing. Cost stays 0.
import { planCancel } from "./jobContract.ts";
import { planGpuSubmit, planGpuWorkflow, type GpuEffect } from "./gpuContract.ts";
import { isUuid } from "./storeContract.ts";
import type { WorkerCapability } from "../_shared/gpuCapability.ts";

type Row = Record<string, unknown>;
// deno-lint-ignore no-explicit-any
type Db = any;
type Ctx = { db: Db; userId: string; credentialId: string };

function bang<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

async function audit(ctx: Ctx, tool: string, action: string, table: string, id: string | null, summary: Record<string, unknown>) {
  const { data, error } = await ctx.db.rpc("record_mcp_write", {
    p_credential_id: ctx.credentialId,
    p_tool: tool,
    p_action: action,
    p_subject_table: table,
    p_subject_id: id,
    p_summary: summary,
  });
  if (error) return { audit_id: null as string | null, audit_error: error.message };
  return { audit_id: typeof data === "string" ? data : null };
}

function asWorker(row: Row | undefined): WorkerCapability | null {
  if (!row) return null;
  const manifest = (row.capability_manifest ?? {}) as Record<string, unknown>;
  const models = Array.isArray(manifest.models) ? manifest.models.filter((item) => typeof item === "string") : [];
  const nodes = Array.isArray(manifest.nodes) ? manifest.nodes.filter((item) => typeof item === "string") : [];
  return {
    lane: typeof row.lane === "string" ? row.lane : undefined,
    device: manifest.device === "cuda" || manifest.device === "cpu" ? manifest.device : "mps",
    memory_bytes: typeof manifest.memory_bytes === "number" ? manifest.memory_bytes : 0,
    usable_bytes: typeof manifest.usable_bytes === "number" ? manifest.usable_bytes : 0,
    mps: manifest.mps !== false && manifest.device !== "cuda",
    cuda: manifest.cuda === true || manifest.device === "cuda",
    comfyui: manifest.comfyui !== false,
    models: models as string[],
    nodes: nodes as string[],
    comfy_cloud: manifest.comfy_cloud === true,
  };
}

function asEffect(row: Row): GpuEffect {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    engine: String(row.engine ?? "code"),
    workflow: row.workflow,
    license: typeof row.license === "string" ? row.license : null,
    reference_only: row.reference_only === true,
    required_models: Array.isArray(row.required_models) ? row.required_models as string[] : [],
    required_nodes: Array.isArray(row.required_nodes) ? row.required_nodes as string[] : [],
    device_requirement: (row.device_requirement ?? {}) as Record<string, unknown>,
    performer_protection: (row.performer_protection ?? {}) as Record<string, unknown>,
    workflow_sha256: typeof row.workflow_sha256 === "string" ? row.workflow_sha256 : null,
  };
}

async function workers(ctx: Ctx): Promise<Row[]> {
  return (bang(await ctx.db.rpc("list_edit_workers", {})) ?? []) as Row[];
}

async function registerWorkflow(ctx: Ctx, args: Record<string, unknown>) {
  const plan = planGpuWorkflow(args);
  if (!plan.ok) throw new Error(plan.error);
  const draft = plan.value;
  let skill = bang(await ctx.db.from("production_skills").select("*").eq("user_id", ctx.userId).eq("slug", `comfyui-${draft.slug}`).maybeSingle()) as Row | null;
  if (!skill) {
    skill = bang(await ctx.db.from("production_skills").insert({
      user_id: ctx.userId,
      slug: `comfyui-${draft.slug}`,
      name: draft.name,
      summary: `ComfyUI workflow ${draft.slug}`,
    }).select("*").single()) as Row;
  }
  const prior = (bang(await ctx.db.from("production_skill_versions").select("version_number").eq("user_id", ctx.userId).eq("skill_id", skill.id).order("version_number", { ascending: false }).limit(1)) ?? []) as Row[];
  const versionNumber = ((prior[0]?.version_number as number | undefined) ?? 0) + 1;
  const version = bang(await ctx.db.from("production_skill_versions").insert({
    skill_id: skill.id,
    user_id: ctx.userId,
    version_number: versionNumber,
    status: "draft",
    instructions: `${draft.name}. Local ComfyUI only. generative_face and generative_mouth are false. Cost is $0.`,
    supported_tools: ["comfyui"],
    dependencies: [{ name: "comfyui", constraint: ">=0.45.3" }],
    is_current: false,
  }).select("id").single()) as Row;
  const effects = (bang(await ctx.db.from("effect_presets").select("version_number").eq("user_id", ctx.userId).eq("slug", draft.slug).order("version_number", { ascending: false }).limit(1)) ?? []) as Row[];
  const effectVersion = ((effects[0]?.version_number as number | undefined) ?? 0) + 1;
  const row = bang(await ctx.db.from("effect_presets").insert({
    user_id: ctx.userId,
    slug: draft.slug,
    name: draft.name,
    version_number: effectVersion,
    skill_version_id: version.id,
    code_ref: `comfyui:${draft.slug}`,
    params_schema: draft.parameter_schema,
    params_defaults: draft.params_defaults,
    status: "draft",
    is_current: false,
    engine: "comfyui",
    workflow: draft.graph,
    license: draft.license,
    required_models: draft.required_models,
    required_nodes: draft.required_nodes,
    device_requirement: draft.device,
    performer_protection: draft.performer,
    reference_only: draft.reference_only,
    workflow_asset_id: draft.workflow_asset_id,
  }).select("id, version_number, status, reference_only").single()) as Row;
  const logged = await audit(ctx, "avt_gpu_workflow_register", "register", "effect_presets", row.id as string, {
    slug: draft.slug,
    reference_only: draft.reference_only,
    cost_usd: 0,
  });
  return { ...row, skill_version_id: version.id, costUsd: 0, ...logged };
}

async function submit(ctx: Ctx, args: Record<string, unknown>) {
  if (!isUuid(args.effect_id)) throw new Error("effect_id must be a uuid");
  const effectRow = bang(await ctx.db.from("effect_presets").select("*").eq("id", args.effect_id).eq("user_id", ctx.userId).maybeSingle()) as Row | null;
  if (!effectRow) throw new Error("effect not found");
  const all = await workers(ctx);
  const wanted = typeof args.assigned_worker === "string" ? args.assigned_worker : null;
  const match = wanted ? all.find((row) => row.label === wanted || row.id === wanted) : null;
  const gpu = (match ?? all.find((row) => row.lane === "gpu" || (row.capability_manifest as { lane?: string } | null)?.lane === "gpu")) ?? null;
  const plan = planGpuSubmit(args, asEffect(effectRow), gpu && (gpu.lane === "gpu" || (gpu.capability_manifest as { lane?: string })?.lane === "gpu") ? asWorker(gpu) : wanted ? asWorker(match) : null);
  if (!plan.ok) throw new Error(plan.error);
  if (plan.value.dryRun || !plan.value.accepted) return { ...plan.value, inserted: false };
  const row = bang(await ctx.db.from("edit_renders").insert({
    user_id: ctx.userId,
    project_id: plan.value.project_id,
    sequence_id: null,
    job_kind: "gpu",
    kind: "job",
    status: "queued",
    plan: { costUsd: 0, settings: { parameters: plan.value.parameters }, inputs: plan.value.input_asset_ids },
    cost_usd: 0,
    effect_preset_id: plan.value.effect_id,
    assigned_worker: plan.value.assigned_worker,
    input_asset_ids: plan.value.input_asset_ids,
    settings: {
      costUsd: 0,
      route: "local",
      parameters: plan.value.parameters,
      workflow_name: effectRow.name,
      workflow: effectRow.workflow,
      workflow_sha256: effectRow.workflow_sha256 ?? null,
      license: effectRow.license ?? "",
      reference_only: effectRow.reference_only === true,
      performer: effectRow.performer_protection,
      verdict: plan.value.verdict,
      tier: plan.value.tier,
    },
    progress: 0,
  }).select("id, status").single()) as Row;
  const logged = await audit(ctx, "avt_gpu_job_submit", "queue", "edit_renders", row.id as string, {
    job_kind: "gpu",
    dry_run: false,
    cost_usd: 0,
    verdict: plan.value.verdict,
  });
  return { id: row.id, status: row.status, dryRun: false, accepted: true, costUsd: 0, inserted: true, verdict: plan.value.verdict, ...logged };
}

async function cancel(ctx: Ctx, args: Record<string, unknown>) {
  if (!isUuid(args.job_id)) throw new Error("job_id must be a uuid");
  const row = bang(await ctx.db.from("edit_renders").select("*").eq("id", args.job_id).eq("user_id", ctx.userId).maybeSingle()) as Row | null;
  if (!row) throw new Error("job not found");
  if (row.job_kind !== "gpu") throw new Error("not a gpu job");
  const plan = planCancel(String(row.status));
  if (!plan.ok) throw new Error(plan.error);
  bang(await ctx.db.from("edit_renders").update({ status: "cancelled" }).eq("id", row.id).eq("user_id", ctx.userId));
  const logged = await audit(ctx, "avt_gpu_job_cancel", "cancel", "edit_renders", row.id as string, { previous: row.status, cost_usd: 0 });
  return { id: row.id, status: "cancelled", costUsd: 0, ...logged };
}

export async function runGpuTool(db: Db, userId: string, credentialId: string, name: string, args: Record<string, unknown>) {
  const ctx: Ctx = { db, userId, credentialId };
  if (name === "avt_gpu_worker_list") {
    const rows = await workers(ctx);
    const gpu = rows.filter((row) => row.lane === "gpu" || (row.capability_manifest as { lane?: string } | null)?.lane === "gpu");
    return { workers: gpu, costUsd: 0 };
  }
  if (name === "avt_gpu_workflow_list") {
    let query = ctx.db.from("effect_presets").select("id, slug, name, version_number, status, engine, license, reference_only, required_models, required_nodes, device_requirement, performer_protection, workflow_asset_id").eq("user_id", ctx.userId).eq("engine", "comfyui");
    if (typeof args.slug === "string") query = query.eq("slug", args.slug);
    return { workflows: bang(await query.limit(100)) ?? [], costUsd: 0 };
  }
  if (name === "avt_gpu_workflow_register") return registerWorkflow(ctx, args);
  if (name === "avt_gpu_job_submit") return submit(ctx, args);
  if (name === "avt_gpu_job_status") {
    if (!isUuid(args.job_id)) throw new Error("job_id must be a uuid");
    const row = bang(await ctx.db.from("edit_renders").select("id, status, progress, job_kind, log_text, output_asset_id, output_asset_ids, error, started_at, finished_at, duration_seconds, settings").eq("id", args.job_id).eq("user_id", ctx.userId).maybeSingle()) as Row | null;
    if (!row || row.job_kind !== "gpu") throw new Error("gpu job not found");
    return {
      id: row.id,
      status: row.status,
      progress: row.progress ?? 0,
      log_text: row.log_text ?? "",
      output_asset_id: row.output_asset_id ?? null,
      output_asset_ids: row.output_asset_ids ?? [],
      error: row.error ?? null,
      started_at: row.started_at ?? null,
      finished_at: row.finished_at ?? null,
      duration_seconds: row.duration_seconds ?? null,
      verdict: (row.settings as { verdict?: string } | null)?.verdict ?? null,
      costUsd: 0,
    };
  }
  if (name === "avt_gpu_job_cancel") return cancel(ctx, args);
  throw new Error(`unknown gpu tool ${name}`);
}
