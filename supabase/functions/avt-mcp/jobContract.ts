// Job, worker, and cache decisions. dry_run defaults to true. Cost is always 0.
import { checkCompatibility, parseDependencies, type ToolManifest } from "../_shared/skillDeps.ts";
import { assetsToFetch, evictionPlan, isProtected, type CacheEntry } from "../_shared/workerCache.ts";

export const JOB_KINDS = ["edit", "vfx", "qc", "blender", "beat_cut"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type JobResult<T> = { ok: true; value: T } | { ok: false; error: string };

function fail(error: string): JobResult<never> {
  return { ok: false, error };
}

export function planJobSubmit(args: Record<string, unknown>, deps: unknown, manifest: ToolManifest | null): JobResult<{
  dryRun: boolean;
  costUsd: 0;
  job_kind: JobKind;
  project_id: string;
  sequence_id: string | null;
  skill_version_id: string | null;
  effect_preset_id: string | null;
  input_asset_ids: string[];
  assigned_worker: string | null;
  settings: Record<string, unknown>;
  compatibility: { ok: boolean; missing: { name: string; constraint: string; installed: string | null }[] } | null;
}> {
  const dryRun = args.dry_run !== false;
  if (typeof args.job_kind !== "string" || !(JOB_KINDS as readonly string[]).includes(args.job_kind)) {
    return fail(`job_kind must be one of ${JOB_KINDS.join(", ")}`);
  }
  if (typeof args.project_id !== "string" || !UUID.test(args.project_id)) return fail("project_id must be a uuid");
  const sequence_id = args.sequence_id == null || args.sequence_id === "" ? null : String(args.sequence_id);
  if (sequence_id !== null && !UUID.test(sequence_id)) return fail("sequence_id must be a uuid");
  if (args.job_kind === "edit" && !sequence_id) return fail("an edit job needs sequence_id");
  const skill_version_id = args.skill_version_id == null || args.skill_version_id === "" ? null : String(args.skill_version_id);
  const effect_preset_id = args.effect_preset_id == null || args.effect_preset_id === "" ? null : String(args.effect_preset_id);
  if (skill_version_id !== null && !UUID.test(skill_version_id)) return fail("skill_version_id must be a uuid");
  if (effect_preset_id !== null && !UUID.test(effect_preset_id)) return fail("effect_preset_id must be a uuid");
  const inputs = args.input_asset_ids === undefined ? [] : args.input_asset_ids;
  if (!Array.isArray(inputs) || inputs.some((id) => typeof id !== "string" || !UUID.test(id))) return fail("input_asset_ids must be uuids");
  if (args.settings !== undefined && (typeof args.settings !== "object" || args.settings === null || Array.isArray(args.settings))) {
    return fail("settings must be an object");
  }
  let compatibility = null;
  if (deps !== undefined && deps !== null) {
    const parsed = parseDependencies(deps);
    if (!parsed.ok) return parsed;
    compatibility = checkCompatibility(parsed.value, manifest ?? {});
    if (!dryRun && manifest && !compatibility.ok) return fail(`worker is missing ${compatibility.missing.map((item) => item.name).join(", ")}`);
  }
  return {
    ok: true,
    value: {
      dryRun,
      costUsd: 0,
      job_kind: args.job_kind as JobKind,
      project_id: args.project_id,
      sequence_id,
      skill_version_id,
      effect_preset_id,
      input_asset_ids: inputs as string[],
      assigned_worker: typeof args.assigned_worker === "string" ? args.assigned_worker : null,
      settings: (args.settings as Record<string, unknown>) ?? {},
      compatibility,
    },
  };
}

export function planCancel(status: string): JobResult<"cancelled"> {
  if (status === "complete") return fail("a finished job is not cancelled");
  if (status === "cancelled") return { ok: true, value: "cancelled" };
  if (status !== "queued" && status !== "rendering" && status !== "planned") return fail(`cannot cancel status ${status}`);
  return { ok: true, value: "cancelled" };
}

export function planWorkerRegister(args: Record<string, unknown>): JobResult<{
  label: string;
  secret: string;
  os_name: string;
  tool_versions: Record<string, string>;
  capability_manifest: Record<string, unknown>;
  cache_cap_bytes: number;
}> {
  if (typeof args.label !== "string" || !/^[a-z0-9][a-z0-9_-]{0,40}$/i.test(args.label)) return fail("label must be a short worker name");
  if (typeof args.secret !== "string" || args.secret.length < 32) return fail("secret must be at least 32 characters");
  if (typeof args.os_name !== "string" || args.os_name.length === 0) return fail("os_name is required");
  const tools = args.tool_versions === undefined ? {} : args.tool_versions;
  if (!tools || typeof tools !== "object" || Array.isArray(tools)) return fail("tool_versions must be an object");
  for (const value of Object.values(tools as Record<string, unknown>)) {
    if (typeof value !== "string" || !/^\d+(?:\.\d+){0,2}$/.test(value)) return fail("tool versions look like 4.2.3");
  }
  const manifest = args.capability_manifest === undefined ? {} : args.capability_manifest;
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return fail("capability_manifest must be an object");
  const cap = args.cache_cap_bytes === undefined ? 20 * 1024 * 1024 * 1024 : args.cache_cap_bytes;
  if (typeof cap !== "number" || cap < 1) return fail("cache_cap_bytes must be positive");
  return {
    ok: true,
    value: {
      label: args.label,
      secret: args.secret,
      os_name: args.os_name,
      tool_versions: tools as Record<string, string>,
      capability_manifest: manifest as Record<string, unknown>,
      cache_cap_bytes: cap,
    },
  };
}

export function planCacheReport(args: Record<string, unknown>, now = Date.now()) {
  if (typeof args.worker_id !== "string" || !UUID.test(args.worker_id)) return fail("worker_id must be a uuid");
  const entries = (args.entries ?? []) as CacheEntry[];
  if (!Array.isArray(entries)) return fail("entries must be an array");
  for (const entry of entries) {
    if (!entry || typeof entry.key !== "string" || typeof entry.bytes !== "number" || typeof entry.lastUsed !== "number") {
      return fail("each cache entry needs key, bytes, and lastUsed");
    }
  }
  if (Array.isArray(args.evict)) {
    for (const key of args.evict) {
      const entry = entries.find((row) => row.key === key);
      if (!entry || isProtected(entry)) return fail("protected cache entries are not evicted");
    }
  }
  const cap = typeof args.cache_cap_bytes === "number" ? args.cache_cap_bytes : undefined;
  const plan = evictionPlan({ entries, capBytes: cap, now });
  if (plan.evict.some((entry) => isProtected(entry))) return fail("protected cache entries are not evicted");
  return { ok: true as const, value: { ...plan, fetch: assetsToFetch((args.needed_asset_ids as string[]) ?? [], entries.map((entry) => entry.key)) } };
}

export const JOB_TOOL_DEFS = [
  {
    name: "avt_job_submit",
    description: "Queue a render job on the existing edit_renders row (edit, vfx, qc, blender, or beat_cut). dry_run defaults to true and inserts nothing. cost_usd is 0. Pins the skill and effect versions. Refuses a worker whose tools do not satisfy the skill when dry_run is false. Audited only when a row is written.",
    inputSchema: {
      type: "object",
      properties: {
        job_kind: { type: "string", enum: ["edit", "vfx", "qc", "blender", "beat_cut"] },
        project_id: { type: "string" },
        sequence_id: { type: "string" },
        skill_version_id: { type: "string" },
        effect_preset_id: { type: "string" },
        input_asset_ids: { type: "array", items: { type: "string" } },
        assigned_worker: { type: "string" },
        settings: { type: "object" },
        dry_run: { type: "boolean", description: "default true" },
      },
      required: ["job_kind", "project_id"],
    },
  },
  {
    name: "avt_job_status",
    description: "Status and progress of one render job. Read only. $0.",
    inputSchema: { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"] },
  },
  {
    name: "avt_job_logs",
    description: "Log text and log asset id for one render job. Read only. $0.",
    inputSchema: { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"] },
  },
  {
    name: "avt_job_outputs",
    description: "Output asset ids for one render job. Read only. $0.",
    inputSchema: { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"] },
  },
  {
    name: "avt_job_cancel",
    description: "Cancel a queued or rendering job. A finished job stays. Does not delete assets. $0. Audited.",
    inputSchema: { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"] },
  },
  {
    name: "avt_job_list",
    description: "List render jobs for a project. Read only. $0.",
    inputSchema: {
      type: "object",
      properties: { project_id: { type: "string" }, status: { type: "string" } },
      required: ["project_id"],
    },
  },
  {
    name: "avt_worker_register",
    description: "Register this worker's OS, tool versions, and capability manifest. The secret is hashed and not returned. $0. Audited.",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string" },
        secret: { type: "string" },
        os_name: { type: "string" },
        tool_versions: { type: "object" },
        capability_manifest: { type: "object" },
        cache_cap_bytes: { type: "integer" },
      },
      required: ["label", "secret", "os_name", "tool_versions"],
    },
  },
  {
    name: "avt_worker_list",
    description: "Workers you registered: label, OS, tool versions, cache usage. The secret hash is not returned. Read only. $0.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "avt_worker_check",
    description: "Compare a worker's tool versions to a skill version's dependencies. Read only. Does not start a job. $0.",
    inputSchema: {
      type: "object",
      properties: { worker_id: { type: "string" }, skill_version_id: { type: "string" } },
      required: ["worker_id", "skill_version_id"],
    },
  },
  {
    name: "avt_cache_report",
    description: "Record a worker's cache usage and cap. Returns which disposable entries the worker may drop locally. Protected entries (originals, camera takes, locked or approved masters, unverified files) are never evicted. Does not delete anything on the server. $0. Audited.",
    inputSchema: {
      type: "object",
      properties: {
        worker_id: { type: "string" },
        cache_cap_bytes: { type: "integer" },
        entries: { type: "array" },
        needed_asset_ids: { type: "array", items: { type: "string" } },
        evict: { type: "array", items: { type: "string" } },
      },
      required: ["worker_id", "entries"],
    },
  },
] as const;

export const JOB_TOOL_NAMES = JOB_TOOL_DEFS.map((tool) => tool.name);
