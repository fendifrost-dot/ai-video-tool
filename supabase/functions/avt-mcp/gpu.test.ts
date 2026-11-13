// @vitest-environment node
import { describe, expect, it } from "vitest";
import { GPU_TOOL_NAMES, planGpuSubmit, planGpuWorkflow } from "./gpuContract.ts";
import { runGpuTool } from "./gpuHandlers.ts";
import { TOOLS } from "./contract.ts";
import { M1_8GB_PROFILE } from "../_shared/gpuCapability.ts";

const PROJECT = "87fc3244-de44-45a3-b2ba-7fe54222dc90";
const OWNER = "3ca10935-8c3d-4479-9a0c-8bfe8050840c";
const EFFECT = "33333333-3333-4333-8333-333333333333";

const performer = { generative_face: false, generative_mouth: false, touches: "read", mask_excludes_face_and_mouth: true };
const device = { min_memory_bytes: 4 * 1024 ** 3, accelerator: "mps", mps_ok: true, tier: "sam2-small" };
const graph = { "3": { class_type: "Sam2Segmentation", inputs: { ckpt_name: "sam2_hiera_small.pt" } } };

describe("gpu plans", () => {
  it("registers the tools and defaults a submit to a free dry run", () => {
    const names = new Set(TOOLS.map((tool) => tool.name));
    for (const name of GPU_TOOL_NAMES) expect(names.has(name)).toBe(true);
    const submit = TOOLS.find((tool) => tool.name === "avt_gpu_job_submit")!;
    expect(submit.description).toMatch(/dry_run defaults to true/);
    expect(submit.description).toMatch(/\$0|cost_usd is 0/);
    const draft = planGpuWorkflow({
      slug: "sam2-small-matte",
      name: "SAM2 small matte",
      graph,
      parameter_schema: { type: "object", properties: {} },
      device,
      license: "Apache-2.0",
      performer,
      required_models: ["sam2_hiera_small.pt"],
      required_nodes: ["Sam2Segmentation"],
    });
    expect(draft.ok).toBe(true);
    const face = planGpuWorkflow({
      slug: "face-replace",
      name: "face_replace",
      graph: { nodes: [{ type: "PlateTrackFace" }] },
      parameter_schema: { type: "object" },
      device: { min_memory_bytes: 2 * 1024 ** 3, accelerator: "any", mps_ok: true, tier: "planar-track" },
      license: "reference-only",
      performer,
      reference_only: true,
    });
    expect(face.ok).toBe(false);
    if (!face.ok) expect(face.error).toMatch(/Hyenas/);
  });

  it("refuses Comfy Cloud and a 14B graph without inserting", () => {
    const effect = {
      id: EFFECT,
      name: "Wan 2.2 Animate + Time-To-Move",
      engine: "comfyui",
      workflow: { "9": { class_type: "WanVideoSampler", inputs: { ckpt_name: "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors" } } },
      license: "none found (no LICENSE file)",
      reference_only: false,
      required_models: ["wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors"],
      required_nodes: ["WanVideoSampler"],
      device_requirement: { min_memory_bytes: 40 * 1024 ** 3, accelerator: "cuda", mps_ok: false, tier: "wan-14b" },
      performer_protection: performer,
      workflow_sha256: null,
    };
    const dry = planGpuSubmit(
      { project_id: PROJECT, effect_id: EFFECT, route: "local" },
      effect,
      { ...M1_8GB_PROFILE, models: [], nodes: [] },
    );
    expect(dry.ok).toBe(true);
    if (dry.ok) {
      expect(dry.value.dryRun).toBe(true);
      expect(dry.value.accepted).toBe(false);
      expect(dry.value.costUsd).toBe(0);
      expect(dry.value.verdict).toBe("needs_bigger_machine");
    }
    const live = planGpuSubmit(
      { project_id: PROJECT, effect_id: EFFECT, dry_run: false, assigned_worker: "m1", route: "comfy_cloud", env: { COMFY_CLOUD_ENABLED: "1" } },
      effect,
      M1_8GB_PROFILE,
    );
    expect(live.ok).toBe(false);
    if (!live.ok) expect(live.error).toMatch(/Comfy Cloud/);
  });
});

class Query {
  filters: { col: string; value: unknown }[] = [];
  action: "select" | "insert" | "update" = "select";
  patch: Record<string, unknown> | null = null;
  constructor(private mem: Memory, private table: string) {}
  select() { return this; }
  eq(col: string, value: unknown) { this.filters.push({ col, value }); return this; }
  order() { return this; }
  limit() { return this; }
  insert(row: Record<string, unknown>) { this.action = "insert"; this.patch = row; return this; }
  update(row: Record<string, unknown>) { this.action = "update"; this.patch = row; return this; }
  maybeSingle() { return Promise.resolve({ data: this.exec()[0] ?? null, error: null }); }
  single() {
    const row = this.exec()[0];
    return Promise.resolve(row ? { data: row, error: null } : { data: null, error: { message: "no row" } });
  }
  then(resolve: (value: { data: Record<string, unknown>[] | null; error: null }) => unknown) {
    return Promise.resolve({ data: this.exec(), error: null as null }).then(resolve);
  }
  private exec() {
    const table = this.mem.tables[this.table] ?? (this.mem.tables[this.table] = []);
    if (this.action === "insert" && this.patch) {
      const row = { id: crypto.randomUUID(), progress: 0, output_asset_ids: [], log_text: "", ...this.patch };
      table.push(row);
      return [row];
    }
    const rows = table.filter((row) => this.filters.every((filter) => row[filter.col] === filter.value));
    if (this.action === "update" && this.patch) {
      for (const row of rows) Object.assign(row, this.patch);
    }
    return rows;
  }
}

class Memory {
  tables: Record<string, Record<string, unknown>[]> = { edit_renders: [], production_skills: [], production_skill_versions: [], effect_presets: [] };
  workers = [{
    id: "22222222-2222-4222-8222-222222222222",
    label: "m1",
    lane: "gpu",
    os_name: "macOS",
    tool_versions: { comfyui: "0.45.3" },
    capability_manifest: { ...M1_8GB_PROFILE, models: ["sam2_hiera_small.pt"], nodes: ["Sam2Segmentation"] },
  }];
  client() {
    const mem = this;
    return {
      from: (table: string) => new Query(mem, table),
      rpc: async (name: string) => {
        if (name === "record_mcp_write") return { data: "audit-gpu", error: null };
        if (name === "list_edit_workers") return { data: mem.workers, error: null };
        return { data: null, error: { message: name } };
      },
    };
  }
}

describe("gpu handlers", () => {
  it("dry-runs without a row, then queues a fitting job for $0", async () => {
    const mem = new Memory();
    const registered = await runGpuTool(mem.client(), OWNER, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "avt_gpu_workflow_register", {
      slug: "sam2-small-matte",
      name: "SAM2 small matte",
      graph,
      parameter_schema: { type: "object", properties: {} },
      device,
      license: "Apache-2.0",
      performer,
      required_models: ["sam2_hiera_small.pt"],
      required_nodes: ["Sam2Segmentation"],
    }) as { id: string; audit_id: string };
    expect(registered.audit_id).toBe("audit-gpu");
    const listed = await runGpuTool(mem.client(), OWNER, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "avt_gpu_workflow_list", {}) as { workflows: { id: string }[] };
    expect(listed.workflows).toHaveLength(1);
    const dry = await runGpuTool(mem.client(), OWNER, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "avt_gpu_job_submit", {
      project_id: PROJECT,
      effect_id: registered.id,
      assigned_worker: "m1",
      input_asset_ids: [],
    }) as { inserted: boolean; costUsd: number; accepted: boolean };
    expect(dry.inserted).toBe(false);
    expect(dry.costUsd).toBe(0);
    expect(dry.accepted).toBe(true);
    expect(mem.tables.edit_renders).toHaveLength(0);
    const live = await runGpuTool(mem.client(), OWNER, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "avt_gpu_job_submit", {
      project_id: PROJECT,
      effect_id: registered.id,
      assigned_worker: "m1",
      dry_run: false,
    }) as { id: string; status: string; costUsd: number };
    expect(live.status).toBe("queued");
    expect(live.costUsd).toBe(0);
    const status = await runGpuTool(mem.client(), OWNER, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "avt_gpu_job_status", { job_id: live.id }) as { progress: number };
    expect(status.progress).toBe(0);
    const cancelled = await runGpuTool(mem.client(), OWNER, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "avt_gpu_job_cancel", { job_id: live.id }) as { status: string };
    expect(cancelled.status).toBe("cancelled");
    const workers = await runGpuTool(mem.client(), OWNER, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "avt_gpu_worker_list", {}) as { workers: { label: string }[] };
    expect(workers.workers.map((row) => row.label)).toEqual(["m1"]);
  });
});
