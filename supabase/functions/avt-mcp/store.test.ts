// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseBeatGrid, parseProjectRules, parseShotList, REVIEW_PREVIEW } from "../_shared/assetFormats.ts";
import { checkCompatibility, compareVersions } from "../_shared/skillDeps.ts";
import { TOOLS } from "./contract.ts";
import { scratchClearance, tusUploadPlan } from "./contract.ts";
import { BUCKET_FILE_SIZE_LIMIT_BYTES, STORE_READ_TOOLS, STORE_WRITE_TOOLS, deleteGuardStatus, planAssetTag, planEditLock, planEffectDraft, planPublish, planSkillDraft, planSupersede, preserveLocks, remapReason, renderLockReason } from "./storeContract.ts";
import { lockedPathBlock, runStoreTool } from "./storeHandlers.ts";

const SONG = "067a4cbf-6fd0-4601-9111-df1119c52fa6";
const PROJECT = "764a63d2-93cd-44f3-905f-292f14ab2f51";
const OWNER = "3ca10935-8c3d-4479-9a0c-8bfe8050840c";

describe("Lovable migration rules", () => {
  it("does not write storage.buckets or put a trigger on storage.objects", () => {
    const root = new URL("../../..", import.meta.url);
    const asset = readFileSync(new URL("supabase/migrations/20261113120000_asset_store_extensions.sql", root), "utf8");
    const worker = readFileSync(new URL("supabase/migrations/20261113140000_worker_capability.sql", root), "utf8");
    for (const sql of [asset, worker]) {
      expect(sql).not.toMatch(/update\s+storage\.buckets/i);
      expect(sql).not.toMatch(/insert\s+into\s+storage\.buckets/i);
      expect(sql).not.toMatch(/trigger[\s\S]{0,120}storage\.objects/i);
      expect(sql).not.toMatch(/create\s+(or\s+replace\s+)?function[\s\S]{0,40}storage/i);
    }
    expect(asset).toContain("project_assets_locked_delete");
    expect(asset).toContain("create policy locked_objects_no_delete");
    expect(asset).toContain("as restrictive");
    expect(worker).not.toMatch(/storage\./i);
  });
});

describe("formats", () => {
  const shot = {
    format: "avt.shot_list",
    format_version: 1,
    project_id: PROJECT,
    slots: [{ slot: "c033", length_frames: 48, subject: "fendi_performance", wardrobe_swap: true, rules: ["NO_FEET", "MOUTH_AT_REST"], status: "review", approver: null }],
  };
  it("accepts a shot list and rejects a downscaled preview", () => {
    expect(parseShotList(shot).ok).toBe(true);
    expect(parseShotList({ ...shot, slots: [{ ...shot.slots[0], subject: "crowd" }] }).ok).toBe(false);
    const rules = parseProjectRules({
      format: "avt.project_rules",
      format_version: 1,
      project_id: PROJECT,
      face: "real_pixels_only",
      mouth: "no_alteration",
      likeness: "no_generated_likeness",
      preview: REVIEW_PREVIEW,
      locked_looks: ["ysl-black"],
      plates: [],
      allowed_black_windows: [],
    });
    expect(rules.ok).toBe(true);
    expect(parseProjectRules({ ...(rules.ok ? rules.value : {}), preview: { width: 720, height: 1280, sar: "1:1" } }).ok).toBe(false);
  });
  it("keeps beats strictly increasing", () => {
    const ok = parseBeatGrid({
      format: "avt.beat_grid",
      format_version: 1,
      song_asset_id: SONG,
      fps: 24,
      bpm: 120,
      beats: [{ frame: 0, downbeat: true }, { frame: 12, downbeat: false }],
      sections: [{ name: "verse", in_frame: 0, out_frame: 48 }],
    });
    expect(ok.ok).toBe(true);
    expect(parseBeatGrid({ ...(ok.ok ? ok.value : {}), beats: [{ frame: 4, downbeat: true }, { frame: 4, downbeat: false }] }).ok).toBe(false);
  });
});

describe("catalog rules", () => {
  it("covers 4 GB masters and refuses a publish without a pass", () => {
    expect(BUCKET_FILE_SIZE_LIMIT_BYTES).toBeGreaterThanOrEqual(Math.ceil(1.7 * 1024 * 1024 * 1024));
    expect(BUCKET_FILE_SIZE_LIMIT_BYTES).toBeGreaterThanOrEqual(245 * 1024 * 1024);
    expect(planPublish({ id: "v", status: "draft", is_current: false }, [{ result: "fail" }])).toMatchObject({ ok: false });
    expect(planPublish({ id: "v", status: "draft", is_current: false }, [{ result: "pass", effect_preset_id: null }]).ok).toBe(true);
    expect(planPublish({ id: "v", status: "published", is_current: true }, []).ok).toBe(true);
  });
  it("demotes without deleting and blocks a locked delete", () => {
    const next = planSupersede({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", version_number: 2, tags: ["approved"] }, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(next.ok).toBe(true);
    if (next.ok) {
      expect(next.value.deleted).toBe(false);
      expect(next.value.previousTags).toContain("superseded");
      expect(next.value.version_number).toBe(3);
    }
    expect(deleteGuardStatus(["locked"])).toMatchObject({ deletable: false, deleted: false });
    expect(planAssetTag(["review"], "locked", "add").ok).toBe(true);
    expect(planAssetTag(["locked"], "nope", "add").ok).toBe(false);
  });
  it("compares worker tools and refuses a locked render", () => {
    expect(compareVersions("4.2.3", "4.2")).toBe(1);
    expect(checkCompatibility([{ name: "blender", constraint: ">=4.2" }, { name: "ffmpeg", constraint: ">=6" }], { blender: "4.2.3", ffmpeg: "6.1" }).ok).toBe(true);
    expect(checkCompatibility([{ name: "blender", constraint: ">=4.2" }], { ffmpeg: "6" }).missing.map((m) => m.name)).toEqual(["blender"]);
    expect(renderLockReason(true, [], false)).toMatch(/unlock: true/);
    expect(renderLockReason(true, ["c1"], true)).toBeNull();
    expect(remapReason([{ id: "c", speed: 1.25, timeRemapAllowed: false }])).toMatch(/speed must stay 1/);
    expect(remapReason([{ id: "c", speed: 1.25 }])).toBeNull();
  });
  it("plans a tus upload and a scratch check that deletes nothing", () => {
    const plan = tusUploadPlan({
      supabaseUrl: "https://qoyxgnkvjukovkrvdaiq.supabase.co/",
      bucket: "project-clips",
      path: `${OWNER}/take.mp4`,
      token: "tok",
      contentType: "video/mp4",
      uploadLength: 1700000000,
      upsert: false,
    });
    expect(plan.protocol).toBe("tus-1.0.0");
    expect(plan.endpoint).toBe("https://qoyxgnkvjukovkrvdaiq.supabase.co/storage/v1/upload/resumable");
    expect(plan.chunk_bytes).toBe(6 * 1024 * 1024);
    expect(plan.headers.authorization).toBe("Bearer tok");
    expect(plan.upload_length).toBe(1700000000);
    const hash = "a".repeat(64);
    expect(scratchClearance(hash, hash)).toMatchObject({ match: true, clear_scratch: true, deleted: false });
    expect(scratchClearance(hash, "b".repeat(64))).toMatchObject({ match: false, clear_scratch: false, deleted: false });
    expect(scratchClearance(hash, null).reason).toMatch(/missing/);
  });
  it("rejects a skill draft without instructions and an effect schema that is not an object", () => {
    expect(planSkillDraft({ slug: "transitions", name: "Transitions", instructions: "  ", supported_tools: ["ffmpeg"] }).ok).toBe(false);
    expect(planSkillDraft({ slug: "transitions", name: "Transitions", instructions: "Run ffmpeg.", supported_tools: ["ffmpeg"], dependencies: [{ name: "ffmpeg", constraint: ">=6" }] }).ok).toBe(true);
    expect(planEffectDraft({ slug: "smoke", name: "Smoke", code_ref: "scripts/vfx/library.py:smoke_ember_burst", skill_version_id: SONG, params_schema: { type: "string" } }).ok).toBe(false);
  });
  it("keeps a lock when the save omits it", () => {
    const prior = { id: "s", locked: true, clips: [{ id: "c", locked: true }] };
    expect(preserveLocks(prior, { id: "s", clips: [{ id: "c", sourceIn: 1 }] }, false).ok).toBe(true);
    const cleared = preserveLocks(prior, { id: "s", locked: false, clips: [{ id: "c", locked: false }] }, false);
    expect(cleared.ok).toBe(false);
    expect(planEditLock({ sequence_id: PROJECT, locked: false }).ok).toBe(false);
    expect(planEditLock({ sequence_id: PROJECT, locked: false, unlock: true }).ok).toBe(true);
  });
});

describe("each store tool is on the server", () => {
  const names = new Set(TOOLS.map((tool) => tool.name));
  it("registers every read and write tool", () => {
    for (const name of [...STORE_READ_TOOLS, ...STORE_WRITE_TOOLS]) expect(names.has(name)).toBe(true);
  });
  it("wires the handler and the upload modes", () => {
    const src = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    expect(src).toContain("runStoreTool");
    expect(src).toContain("locked asset cannot be deleted");
    expect(src).toContain("tusUploadPlan");
    expect(src).toContain("scratchClearance");
    for (const tool of TOOLS.filter((tool) => tool.name.startsWith("avt_asset_") || tool.name.startsWith("avt_skill_") || tool.name.startsWith("avt_effect_") || tool.name.startsWith("avt_validation_") || tool.name.endsWith("_save") || tool.name === "avt_edit_lock")) {
      if (STORE_WRITE_TOOLS.includes(tool.name as (typeof STORE_WRITE_TOOLS)[number])) {
        expect(tool.description).toMatch(/\$0/);
      }
    }
  });
});

type Row = Record<string, unknown>;

class Memory {
  tables: Record<string, Row[]> = {
    project_assets: [],
    asset_licenses: [],
    production_skills: [],
    production_skill_versions: [],
    project_skill_pins: [],
    effect_presets: [],
    skill_validations: [],
    edit_sequences: [],
    edit_clips: [],
    edit_renders: [],
  };
  uploads: string[] = [];
  client() {
    const mem = this;
    return {
      from: (table: string) => new Query(mem, table),
      rpc: async (name: string, args: Record<string, unknown>) => {
        if (name === "record_mcp_write") return { data: "audit-1", error: null };
        if (name === "publish_skill_version" || name === "publish_effect_preset") return { data: { id: args.p_version_id ?? args.p_preset_id, is_current: true }, error: null };
        return { data: null, error: { message: `unexpected rpc ${name}` } };
      },
      storage: { from: () => ({ upload: async (path: string) => { mem.uploads.push(path); return { error: null }; } }) },
    };
  }
}

class Query {
  filters: { col: string; value: unknown; op: string }[] = [];
  action: "select" | "insert" | "update" | "upsert" = "select";
  patch: Row | null = null;
  sort: { col: string; asc: boolean } | null = null;
  lim: number | null = null;
  constructor(private mem: Memory, private table: string) {}
  select() { return this; }
  eq(col: string, value: unknown) { this.filters.push({ col, value, op: "eq" }); return this; }
  contains(col: string, value: unknown) { this.filters.push({ col, value, op: "contains" }); return this; }
  order(col: string, opts: { ascending: boolean }) { this.sort = { col, asc: opts.ascending }; return this; }
  limit(n: number) { this.lim = n; return this; }
  insert(row: Row) { this.action = "insert"; this.patch = row; return this; }
  update(row: Row) { this.action = "update"; this.patch = row; return this; }
  upsert(row: Row) { this.action = "upsert"; this.patch = row; return this; }
  maybeSingle() { return Promise.resolve({ data: this.exec()[0] ?? null, error: null }); }
  single() {
    const row = this.exec()[0];
    return Promise.resolve(row ? { data: row, error: null } : { data: null, error: { message: "no row" } });
  }
  then(resolve: (v: { data: Row[] | null; error: null }) => unknown, reject?: (e: unknown) => unknown) {
    return Promise.resolve({ data: this.exec(), error: null as null }).then(resolve, reject);
  }
  private match(row: Row) {
    return this.filters.every((filter) => {
      if (filter.op === "eq") return row[filter.col] === filter.value;
      if (Array.isArray(filter.value)) return filter.value.every((item) => Array.isArray(row[filter.col]) && (row[filter.col] as unknown[]).includes(item));
      if (filter.value && typeof filter.value === "object") {
        const meta = row[filter.col] as Record<string, unknown> | null;
        return !!meta && Object.entries(filter.value as Record<string, unknown>).every(([key, value]) => meta[key] === value);
      }
      return false;
    });
  }
  private exec(): Row[] {
    const table = this.mem.tables[this.table] ?? (this.mem.tables[this.table] = []);
    if (this.action === "insert" && this.patch) {
      const row = { id: crypto.randomUUID(), tags: [], version_number: 1, ...this.patch };
      table.push(row);
      return [row];
    }
    if (this.action === "upsert" && this.patch) {
      const found = table.find((row) => row.project_id === this.patch?.project_id && row.skill_id === this.patch?.skill_id);
      if (found) Object.assign(found, this.patch);
      else table.push({ ...this.patch });
      return [this.patch];
    }
    let rows = table.filter((row) => this.match(row));
    if (this.action === "update" && this.patch) {
      for (const row of rows) Object.assign(row, this.patch);
      return rows;
    }
    if (this.sort) {
      const { col, asc } = this.sort;
      rows = [...rows].sort((a, b) => (a[col] === b[col] ? 0 : (a[col] as number) > (b[col] as number) ? 1 : -1) * (asc ? 1 : -1));
    }
    if (this.lim !== null) rows = rows.slice(0, this.lim);
    return rows;
  }
}

describe("store handlers", () => {
  const skillVersion = "11111111-1111-4111-8111-111111111111";
  function seed() {
    const mem = new Memory();
    mem.tables.project_assets.push({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      user_id: OWNER,
      project_id: PROJECT,
      shot_id: null,
      version_number: 1,
      tags: ["approved"],
      origin: "generated",
      license_id: null,
      file_url: `${OWNER}/clip.mp4`,
      metadata_json: { bucket: "project-clips" },
    });
    mem.tables.production_skill_versions.push({
      id: skillVersion,
      skill_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      user_id: OWNER,
      version_number: 1,
      status: "draft",
      is_current: false,
      instructions: "qc",
    });
    mem.tables.production_skills.push({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", user_id: OWNER, slug: "qc", name: "QC" });
    mem.tables.edit_sequences.push({ id: PROJECT, user_id: OWNER, locked: false });
    mem.tables.edit_clips.push({ id: SONG, sequence_id: PROJECT, user_id: OWNER, locked: false });
    mem.tables.edit_renders.push({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", user_id: OWNER, skill_version_id: skillVersion, effect_preset_id: null });
    return mem;
  }
  const run = (mem: Memory, name: string, args: Record<string, unknown>) => runStoreTool(mem.client(), OWNER, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", name, args);

  it("tags, lists, describes, and reports the delete guard", async () => {
    const mem = seed();
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const tagged = await run(mem, "avt_asset_tag", { asset_id: id, tag: "locked", op: "add" }) as { tags: string[]; audit_id: string };
    expect(tagged.tags).toContain("locked");
    expect(tagged.audit_id).toBe("audit-1");
    const guard = await run(mem, "avt_asset_delete_guard", { asset_id: id }) as { deletable: boolean; deleted: boolean };
    expect(guard).toMatchObject({ deletable: false, deleted: false });
    const path = `${OWNER}/clip.mp4`;
    const blocked = await lockedPathBlock(
      { db: mem.client(), userId: OWNER, credentialId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
      "project-clips",
      path,
    );
    expect(blocked).toBe("locked asset cannot be deleted");
    const listed = await run(mem, "avt_asset_list", { project_id: PROJECT, tag: "locked" }) as { assets: { id: string }[] };
    expect(listed.assets.map((row) => row.id)).toEqual([id]);
    await run(mem, "avt_asset_tag", { asset_id: id, tag: "locked", op: "remove" });
    expect(await lockedPathBlock(
      { db: mem.client(), userId: OWNER, credentialId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
      "project-clips",
      path,
    )).toBeNull();
    const described = await run(mem, "avt_asset_describe", { asset_id: id, fps: 24, sar: "1:1", sha256: "ab".repeat(32), size_bytes: 10 }) as { fps: number };
    expect(described.fps).toBe(24);
  });

  it("supersedes without deleting and requires a license for stock", async () => {
    const mem = seed();
    const successor = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    mem.tables.project_assets.push({ id: successor, user_id: OWNER, project_id: PROJECT, version_number: 1, tags: [], origin: "generated", file_url: `${OWNER}/next.mp4`, metadata_json: {} });
    const result = await run(mem, "avt_asset_supersede", { asset_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", successor_id: successor }) as { deleted: boolean; version_number: number };
    expect(result.deleted).toBe(false);
    expect(result.version_number).toBe(2);
    expect(mem.tables.project_assets).toHaveLength(2);
    const licensed = await run(mem, "avt_asset_attach_license", {
      asset_id: successor,
      origin: "stock",
      license: { name: "plate pack", source: "bought", license_type: "purchased", terms: "project" },
    }) as { license_id: string };
    expect(licensed.license_id).toMatch(/-/);
    const got = await run(mem, "avt_asset_get_license", { asset_id: successor }) as { license: { name: string } };
    expect(got.license.name).toBe("plate pack");
    await expect(run(mem, "avt_asset_attach_license", { asset_id: successor, origin: "element", license_id: null })).rejects.toThrow(/license/);
  });

  it("drafts a skill, refuses publish, then publishes after a pass", async () => {
    const mem = seed();
    const drafted = await run(mem, "avt_skill_draft", {
      slug: "transitions",
      name: "Transitions",
      instructions: "Deterministic frames.",
      supported_tools: ["ffmpeg"],
      dependencies: [{ name: "ffmpeg", constraint: ">=6" }],
      changelog: "first",
    }) as { id: string; status: string; is_current: boolean };
    expect(drafted.status).toBe("draft");
    expect(drafted.is_current).toBe(false);
    await expect(run(mem, "avt_skill_publish", { version_id: drafted.id })).rejects.toThrow(/passing validation/);
    const recorded = await run(mem, "avt_validation_record", {
      skill_version_id: drafted.id,
      worker_label: "box",
      os_name: "linux",
      tool_versions: { ffmpeg: "6.1" },
      input_asset_ids: [],
      result: "pass",
    }) as { id: string };
    const listed = await run(mem, "avt_validation_list", { skill_version_id: drafted.id }) as { validations: { id: string }[] };
    expect(listed.validations.map((row) => row.id)).toContain(recorded.id);
    const one = await run(mem, "avt_validation_get", { id: recorded.id }) as { validation: { result: string } };
    expect(one.validation.result).toBe("pass");
    const published = await run(mem, "avt_skill_publish", { version_id: drafted.id }) as { is_current: boolean };
    expect(published.is_current).toBe(true);
    const skills = await run(mem, "avt_skill_list", { slug: "transitions" }) as { skills: unknown[] };
    expect(skills.skills).toHaveLength(1);
    const got = await run(mem, "avt_skill_get", { version_id: drafted.id }) as { version: { instructions: string } };
    expect(got.version.instructions).toMatch(/Deterministic/);
    const pinned = await run(mem, "avt_skill_pin", { project_id: PROJECT, skill_version_id: drafted.id }) as { skill_version_id: string };
    const pin = await run(mem, "avt_skill_pin_get", { project_id: PROJECT }) as { pins: { skill_version_id: string }[] };
    expect(pin.pins.map((row) => row.skill_version_id)).toContain(pinned.skill_version_id);
    const job = await run(mem, "avt_skill_pin_get", { job_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }) as { skill_version_id: string };
    expect(job.skill_version_id).toBe(skillVersion);
  });

  it("drafts an effect with its schema and publishes only after a pass", async () => {
    const mem = seed();
    const drafted = await run(mem, "avt_effect_draft", {
      slug: "smoke_ember_burst",
      name: "Smoke",
      code_ref: "scripts/vfx/library.py:smoke_ember_burst",
      skill_version_id: skillVersion,
      params_schema: { type: "object", properties: { frames: { type: "integer" } } },
      params_defaults: { frames: 8 },
    }) as { id: string; is_current: boolean };
    expect(drafted.is_current).toBe(false);
    const got = await run(mem, "avt_effect_get", { id: drafted.id }) as { effect: { params_defaults: { frames: number }; code_ref: string } };
    expect(got.effect.params_defaults.frames).toBe(8);
    expect(got.effect.code_ref).toContain("smoke_ember_burst");
    const list = await run(mem, "avt_effect_list", { slug: "smoke_ember_burst" }) as { effects: unknown[] };
    expect(list.effects).toHaveLength(1);
    await expect(run(mem, "avt_effect_publish", { id: drafted.id })).rejects.toThrow(/passing validation/);
    await run(mem, "avt_validation_record", { skill_version_id: skillVersion, effect_preset_id: drafted.id, worker_label: "box", os_name: "linux", result: "pass" });
    const published = await run(mem, "avt_effect_publish", { id: drafted.id }) as { is_current: boolean };
    expect(published.is_current).toBe(true);
  });

  it("saves and reads shot list, beat grid, and rules", async () => {
    const mem = seed();
    const saved = await run(mem, "avt_shot_list_save", {
      project_id: PROJECT,
      document: { format: "avt.shot_list", format_version: 1, slots: [{ slot: "c001", length_frames: 24, subject: "no_fendi", wardrobe_swap: false, rules: [], status: "open", approver: null }] },
    }) as { asset_id: string; version_number: number };
    expect(saved.version_number).toBe(1);
    expect(mem.uploads[0]).toContain("avt.shot_list");
    const again = await run(mem, "avt_shot_list_save", {
      project_id: PROJECT,
      document: { format: "avt.shot_list", format_version: 1, slots: [{ slot: "c001", length_frames: 12, subject: "ai_broll", wardrobe_swap: false, rules: ["MOUTH_AT_REST"], status: "open", approver: null }] },
    }) as { version_number: number };
    expect(again.version_number).toBe(2);
    const current = await run(mem, "avt_shot_list_get", { project_id: PROJECT }) as { asset: { version_number: number; tags: string[] } };
    expect(current.asset.version_number).toBe(2);
    const old = mem.tables.project_assets.find((row) => row.version_number === 1 && (row.metadata_json as { format?: string }).format === "avt.shot_list");
    expect(old?.tags).toContain("superseded");
    await run(mem, "avt_beat_grid_save", {
      project_id: PROJECT,
      document: { format: "avt.beat_grid", format_version: 1, song_asset_id: SONG, fps: 24, bpm: 100, beats: [{ frame: 0, downbeat: true }], sections: [] },
    });
    const grid = await run(mem, "avt_beat_grid_get", { project_id: PROJECT }) as { document: { bpm: number } };
    expect(grid.document.bpm).toBe(100);
    await run(mem, "avt_project_rules_save", {
      project_id: PROJECT,
      document: {
        format: "avt.project_rules",
        format_version: 1,
        face: "real_pixels_only",
        mouth: "no_alteration",
        likeness: "no_generated_likeness",
        preview: { width: 1080, height: 1920, sar: "1:1" },
        locked_looks: [],
        plates: [],
        allowed_black_windows: [{ in_frame: 0, out_frame: 2 }],
      },
    });
    const rules = await run(mem, "avt_project_rules_get", { project_id: PROJECT }) as { document: { preview: { width: number } } };
    expect(rules.document.preview.width).toBe(1080);
    await expect(run(mem, "avt_project_rules_save", { project_id: PROJECT, document: { format: "avt.project_rules", format_version: 1, face: "generated", mouth: "no_alteration", likeness: "no_generated_likeness", preview: REVIEW_PREVIEW, locked_looks: [], plates: [], allowed_black_windows: [] } })).rejects.toThrow(/real_pixels_only/);
  });

  it("locks a sequence and refuses to clear it without unlock", async () => {
    const mem = seed();
    const read = await run(mem, "avt_edit_lock", { sequence_id: PROJECT }) as { locked: boolean };
    expect(read.locked).toBe(false);
    await run(mem, "avt_edit_lock", { sequence_id: PROJECT, locked: true, clips: [{ id: SONG, locked: true }] });
    await expect(run(mem, "avt_edit_lock", { sequence_id: PROJECT, locked: false })).rejects.toThrow(/unlock: true/);
    const cleared = await run(mem, "avt_edit_lock", { sequence_id: PROJECT, locked: false, unlock: true }) as { locked: boolean; audit_id: string };
    expect(cleared.locked).toBe(false);
    expect(cleared.audit_id).toBe("audit-1");
  });
});

describe("beat grid script", () => {
  it("reads a synthetic click wav and prints an avt.beat_grid", () => {
    const dir = mkdtempSync(join(tmpdir(), "beats-"));
    const wav = join(dir, "clicks.wav");
    execFileSync("python3", ["-c", `import sys; sys.path.insert(0, "scripts/asset-store"); from beat_grid import write_click_wav; write_click_wav(${JSON.stringify(wav)})`], { cwd: new URL("../../..", import.meta.url).pathname });
    const out = execFileSync("python3", ["scripts/asset-store/beat_grid.py", "--wav", wav, "--fps", "24", "--song-asset-id", SONG], { cwd: new URL("../../..", import.meta.url).pathname, encoding: "utf8" });
    const doc = JSON.parse(out);
    expect(doc.format).toBe("avt.beat_grid");
    expect(doc.beats.length).toBeGreaterThan(2);
    expect(doc.beats.some((beat: { downbeat: boolean }) => beat.downbeat)).toBe(true);
    expect(doc.bpm).toBeGreaterThan(100);
    expect(doc.bpm).toBeLessThan(140);
  });
});
