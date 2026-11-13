// Render jobs, worker registration, and cache reports. dry_run inserts nothing.
import { planCacheReport, planCancel, planJobSubmit, planWorkerRegister } from "./jobContract.ts";
import { isUuid } from "./storeContract.ts";

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

async function owned(ctx: Ctx, table: string, id: string): Promise<Row> {
  const data = bang(await ctx.db.from(table).select("*").eq("id", id).eq("user_id", ctx.userId).maybeSingle());
  if (!data) throw new Error(`${table} row not found`);
  return data as Row;
}

async function submit(ctx: Ctx, args: Record<string, unknown>) {
  let deps: unknown = null;
  let manifest: Record<string, string> | null = null;
  if (isUuid(args.skill_version_id)) {
    const version = await owned(ctx, "production_skill_versions", String(args.skill_version_id));
    deps = version.dependencies ?? [];
  }
  if (typeof args.assigned_worker === "string") {
    const workers = bang(await ctx.db.rpc("list_edit_workers", {})) as Row[] | null;
    const worker = (workers ?? []).find((row) => row.label === args.assigned_worker || row.id === args.assigned_worker);
    manifest = (worker?.tool_versions as Record<string, string>) ?? null;
  }
  const plan = planJobSubmit(args, deps, manifest);
  if (!plan.ok) throw new Error(plan.error);
  if (plan.value.dryRun) return { ...plan.value, inserted: false };
  const row = bang(
    await ctx.db.from("edit_renders").insert({
      user_id: ctx.userId,
      project_id: plan.value.project_id,
      sequence_id: plan.value.sequence_id,
      job_kind: plan.value.job_kind,
      kind: plan.value.job_kind === "edit" ? "proxy" : "job",
      status: "queued",
      plan: { costUsd: 0, settings: plan.value.settings, inputs: plan.value.input_asset_ids },
      cost_usd: 0,
      skill_version_id: plan.value.skill_version_id,
      effect_preset_id: plan.value.effect_preset_id,
      assigned_worker: plan.value.assigned_worker,
      input_asset_ids: plan.value.input_asset_ids,
      settings: plan.value.settings,
      progress: 0,
    }).select("id, status").single(),
  ) as Row;
  const logged = await audit(ctx, "avt_job_submit", "queue", "edit_renders", row.id as string, { job_kind: plan.value.job_kind, dry_run: false, cost_usd: 0 });
  return { id: row.id, status: row.status, dryRun: false, costUsd: 0, inserted: true, ...logged };
}

async function job(ctx: Ctx, id: unknown): Promise<Row> {
  if (!isUuid(id)) throw new Error("job_id must be a uuid");
  return owned(ctx, "edit_renders", id);
}

async function cancel(ctx: Ctx, args: Record<string, unknown>) {
  const row = await job(ctx, args.job_id);
  const plan = planCancel(String(row.status));
  if (!plan.ok) throw new Error(plan.error);
  bang(await ctx.db.from("edit_renders").update({ status: "cancelled" }).eq("id", row.id).eq("user_id", ctx.userId));
  const logged = await audit(ctx, "avt_job_cancel", "cancel", "edit_renders", row.id as string, { previous: row.status });
  return { id: row.id, status: "cancelled", ...logged };
}

async function register(ctx: Ctx, args: Record<string, unknown>) {
  const plan = planWorkerRegister(args);
  if (!plan.ok) throw new Error(plan.error);
  const row = bang(await ctx.db.rpc("register_edit_worker", {
    p_label: plan.value.label,
    p_secret: plan.value.secret,
    p_os: plan.value.os_name,
    p_tool_versions: plan.value.tool_versions,
    p_manifest: plan.value.capability_manifest,
    p_cache_cap: plan.value.cache_cap_bytes,
  })) as Row;
  const logged = await audit(ctx, "avt_worker_register", "register", "edit_render_workers", (row.id as string) ?? null, { label: plan.value.label });
  return { id: row.id, label: plan.value.label, secret_returned: false, ...logged };
}

async function check(ctx: Ctx, args: Record<string, unknown>) {
  if (!isUuid(args.worker_id) || !isUuid(args.skill_version_id)) throw new Error("worker_id and skill_version_id must be uuids");
  const version = await owned(ctx, "production_skill_versions", String(args.skill_version_id));
  const workers = (bang(await ctx.db.rpc("list_edit_workers", {})) ?? []) as Row[];
  const worker = workers.find((row) => row.id === args.worker_id);
  if (!worker) throw new Error("worker not found");
  const plan = planJobSubmit(
    { job_kind: "vfx", project_id: "00000000-0000-4000-8000-000000000001", dry_run: true, skill_version_id: version.id },
    version.dependencies ?? [],
    (worker.tool_versions as Record<string, string>) ?? {},
  );
  if (!plan.ok) throw new Error(plan.error);
  return { worker_id: worker.id, skill_version_id: version.id, compatibility: plan.value.compatibility };
}

async function cacheReport(ctx: Ctx, args: Record<string, unknown>) {
  const plan = planCacheReport(args);
  if (!plan.ok) throw new Error(plan.error);
  bang(await ctx.db.rpc("report_worker_cache", {
    p_worker_id: args.worker_id,
    p_cache_bytes: plan.value.cache_bytes,
    p_cache_cap: plan.value.cap_bytes,
    p_report: { evict: plan.value.evict.map((entry) => entry.key), fetch: plan.value.fetch },
  }));
  const logged = await audit(ctx, "avt_cache_report", "report", "edit_render_workers", String(args.worker_id), {
    evict: plan.value.evict.length,
    deletes_remote: false,
  });
  return { ...plan.value, ...logged };
}

export async function runJobTool(db: Db, userId: string, credentialId: string, name: string, args: Record<string, unknown>) {
  const ctx: Ctx = { db, userId, credentialId };
  if (name === "avt_job_submit") return submit(ctx, args);
  if (name === "avt_job_status") {
    const row = await job(ctx, args.job_id);
    return { id: row.id, status: row.status, progress: row.progress ?? 0, job_kind: row.job_kind };
  }
  if (name === "avt_job_logs") {
    const row = await job(ctx, args.job_id);
    return { id: row.id, log_text: row.log_text ?? "", log_asset_id: row.log_asset_id ?? null };
  }
  if (name === "avt_job_outputs") {
    const row = await job(ctx, args.job_id);
    return { id: row.id, output_asset_id: row.output_asset_id ?? null, output_asset_ids: row.output_asset_ids ?? [] };
  }
  if (name === "avt_job_cancel") return cancel(ctx, args);
  if (name === "avt_job_list") {
    if (!isUuid(args.project_id)) throw new Error("project_id must be a uuid");
    let q = ctx.db.from("edit_renders").select("id, status, progress, job_kind, skill_version_id, effect_preset_id").eq("user_id", ctx.userId).eq("project_id", args.project_id);
    if (typeof args.status === "string") q = q.eq("status", args.status);
    return { jobs: bang(await q.limit(100)) ?? [] };
  }
  if (name === "avt_worker_register") return register(ctx, args);
  if (name === "avt_worker_list") return { workers: bang(await ctx.db.rpc("list_edit_workers", {})) ?? [] };
  if (name === "avt_worker_check") return check(ctx, args);
  if (name === "avt_cache_report") return cacheReport(ctx, args);
  throw new Error(`unknown job tool ${name}`);
}
