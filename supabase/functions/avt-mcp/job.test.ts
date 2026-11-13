// @vitest-environment node
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { BLENDER_SKILL_DEPENDENCY, checkCompatibility } from "../_shared/skillDeps.ts";
import { JOB_TOOL_NAMES, planCancel, planJobSubmit } from "./jobContract.ts";
import { runJobTool } from "./jobHandlers.ts";
import { TOOLS } from "./contract.ts";

const PROJECT = "764a63d2-93cd-44f3-905f-292f14ab2f51";
const OWNER = "3ca10935-8c3d-4479-9a0c-8bfe8050840c";
const SKILL = "11111111-1111-4111-8111-111111111111";
const WORKER = "22222222-2222-4222-8222-222222222222";

describe("job plans", () => {
  it("defaults to dry run and costs nothing", () => {
    const plan = planJobSubmit({ job_kind: "vfx", project_id: PROJECT }, null, null);
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.value.dryRun).toBe(true);
      expect(plan.value.costUsd).toBe(0);
    }
    expect(planJobSubmit({ job_kind: "edit", project_id: PROJECT, dry_run: false }, null, null).ok).toBe(false);
    expect(planCancel("complete").ok).toBe(false);
    expect(planCancel("queued").ok).toBe(true);
  });

  it("requires blender 5.2 and refuses 4.2.3", () => {
    expect(BLENDER_SKILL_DEPENDENCY).toEqual({ name: "blender", constraint: ">=5.2" });
    expect(checkCompatibility([BLENDER_SKILL_DEPENDENCY], { blender: "4.2.3" }).ok).toBe(false);
    expect(checkCompatibility([BLENDER_SKILL_DEPENDENCY], { blender: "5.2.4" }).ok).toBe(true);
    const plan = planJobSubmit(
      { job_kind: "blender", project_id: PROJECT, dry_run: false, assigned_worker: "box" },
      [BLENDER_SKILL_DEPENDENCY],
      { ffmpeg: "6.1", blender: "4.2.3" },
    );
    expect(plan.ok).toBe(false);
  });

  it("registers every job tool on the server", () => {
    const names = new Set(TOOLS.map((tool) => tool.name));
    for (const name of JOB_TOOL_NAMES) expect(names.has(name)).toBe(true);
    const submit = TOOLS.find((tool) => tool.name === "avt_job_submit")!;
    expect(submit.description).toMatch(/dry_run defaults to true/);
    expect(submit.description).toMatch(/\$0|cost_usd is 0/);
  });
});

class Query {
  filters: { col: string; value: unknown }[] = [];
  action: "select" | "insert" | "update" = "select";
  patch: Record<string, unknown> | null = null;
  constructor(private mem: Memory, private table: string) {}
  select() { return this; }
  eq(col: string, value: unknown) { this.filters.push({ col, value }); return this; }
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
    const table = this.mem.tables[this.table] ?? [];
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
  tables: Record<string, Record<string, unknown>[]> = {
    edit_renders: [],
    production_skill_versions: [{ id: SKILL, user_id: OWNER, dependencies: [{ name: "ffmpeg", constraint: ">=6" }] }],
  };
  workers = [{ id: WORKER, label: "box", tool_versions: { ffmpeg: "6.1", blender: "5.2.4" }, os_name: "linux" }];
  reports: unknown[] = [];
  client() {
    const mem = this;
    return {
      from: (table: string) => new Query(mem, table),
      rpc: async (name: string, args: Record<string, unknown>) => {
        if (name === "record_mcp_write") return { data: "audit-job", error: null };
        if (name === "list_edit_workers") return { data: mem.workers, error: null };
        if (name === "register_edit_worker") {
          if (String(args.p_secret).length < 32) return { data: null, error: { message: "secret" } };
          return { data: { id: WORKER, label: args.p_label }, error: null };
        }
        if (name === "report_worker_cache") {
          mem.reports.push(args);
          return { data: { id: args.p_worker_id, deletes_remote: false }, error: null };
        }
        return { data: null, error: { message: name } };
      },
    };
  }
}

describe("job handlers", () => {
  const run = (name: string, args: Record<string, unknown>, mem = new Memory()) =>
    runJobTool(mem.client(), OWNER, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", name, args).then((result) => ({ result, mem }));

  it("submits a dry run without a row, then queues when asked", async () => {
    const mem = new Memory();
    const dry = await runJobTool(mem.client(), OWNER, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "avt_job_submit", {
      job_kind: "qc",
      project_id: PROJECT,
      skill_version_id: SKILL,
      input_asset_ids: [SKILL],
    });
    expect(dry).toMatchObject({ dryRun: true, inserted: false, costUsd: 0 });
    expect(mem.tables.edit_renders).toHaveLength(0);
    const live = await runJobTool(mem.client(), OWNER, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "avt_job_submit", {
      job_kind: "qc",
      project_id: PROJECT,
      skill_version_id: SKILL,
      assigned_worker: "box",
      dry_run: false,
      input_asset_ids: [SKILL],
    }) as { id: string; status: string; audit_id: string };
    expect(live.status).toBe("queued");
    expect(live.audit_id).toBe("audit-job");
    const status = await runJobTool(mem.client(), OWNER, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "avt_job_status", { job_id: live.id }) as { progress: number };
    expect(status.progress).toBe(0);
    const logs = await runJobTool(mem.client(), OWNER, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "avt_job_logs", { job_id: live.id }) as { log_text: string };
    expect(logs.log_text).toBe("");
    const outputs = await runJobTool(mem.client(), OWNER, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "avt_job_outputs", { job_id: live.id }) as { output_asset_ids: unknown[] };
    expect(outputs.output_asset_ids).toEqual([]);
    const list = await runJobTool(mem.client(), OWNER, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "avt_job_list", { project_id: PROJECT, status: "queued" }) as { jobs: unknown[] };
    expect(list.jobs).toHaveLength(1);
    const cancelled = await runJobTool(mem.client(), OWNER, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "avt_job_cancel", { job_id: live.id }) as { status: string };
    expect(cancelled.status).toBe("cancelled");
  });

  it("registers a worker, checks compatibility, and will not evict a locked take", async () => {
    const mem = new Memory();
    const registered = await runJobTool(mem.client(), OWNER, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "avt_worker_register", {
      label: "box",
      secret: "s".repeat(32),
      os_name: "linux",
      tool_versions: { ffmpeg: "6.1", blender: "5.2.4" },
      capability_manifest: { cpu: true, gpu: false },
    }) as { secret_returned: boolean; id: string };
    expect(registered.secret_returned).toBe(false);
    const listed = await runJobTool(mem.client(), OWNER, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "avt_worker_list", {}) as { workers: { label: string }[] };
    expect(listed.workers[0].label).toBe("box");
    const check = await runJobTool(mem.client(), OWNER, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "avt_worker_check", {
      worker_id: WORKER,
      skill_version_id: SKILL,
    }) as { compatibility: { ok: boolean } };
    expect(check.compatibility.ok).toBe(true);
    await expect(runJobTool(mem.client(), OWNER, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "avt_cache_report", {
      worker_id: WORKER,
      entries: [
        { key: "copy", bytes: 10, class: "disposable", verified: true, lastUsed: 1 },
        { key: "take", bytes: 10, class: "protected", verified: true, locked: true, kind: "camera", lastUsed: 1 },
      ],
      needed_asset_ids: ["missing", "copy"],
      evict: ["take"],
    })).rejects.toThrow(/protected/);
    const report = await runJobTool(mem.client(), OWNER, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "avt_cache_report", {
      worker_id: WORKER,
      entries: [
        { key: "copy", bytes: 10, class: "disposable", verified: true, lastUsed: 1 },
        { key: "take", bytes: 10, class: "protected", verified: true, locked: true, kind: "camera", lastUsed: 1 },
      ],
      needed_asset_ids: ["missing", "copy"],
    }) as { evict: { key: string }[]; fetch: string[]; deletes_remote: boolean };
    expect(report.evict.map((entry) => entry.key)).not.toContain("take");
    expect(report.fetch).toEqual(["missing"]);
    expect(report.deletes_remote).toBe(false);
  });
});

describe("vfx scripts", () => {
  it("passes the synthetic library, QC, chain, and beat-to-cut checks", () => {
    const out = execFileSync("python3", ["scripts/vfx/test_vfx.py"], { encoding: "utf8" });
    expect(out).toMatch(/vfx synthetic checks passed/);
  });
});
