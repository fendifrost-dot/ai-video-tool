// Asset-store tools. Every write goes through the owner's RLS client and record_mcp_write.
// Nothing here deletes a locked asset, a remote object, or a local file.
import { resolveOwnerStoragePath } from "./contract.ts";
import {
  attachAllows,
  deleteGuardStatus,
  isUuid,
  licenseRequired,
  planAssetTag,
  planDescribe,
  planEditLock,
  planEffectDraft,
  planEffectPublish,
  planFormatSave,
  planLicense,
  planListFilters,
  planPublish,
  planSkillDraft,
  planSupersede,
  planValidation,
  type AssetTag,
} from "./storeContract.ts";

type Row = Record<string, unknown>;
type DbResult<T> = { data: T; error: { message: string } | null };

// deno-lint-ignore no-explicit-any
export type StoreDb = any;

export type Audit = {
  tool: string;
  action: string;
  subject_table: string;
  subject_id: string | null;
  summary: Record<string, unknown>;
};

type Ctx = { userId: string; credentialId: string; db: StoreDb };

function bang<T>(result: DbResult<T>, fallback: string): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

async function audit(ctx: Ctx, entry: Audit): Promise<{ audit_id: string | null; audit_error?: string }> {
  const { data, error } = await ctx.db.rpc("record_mcp_write", {
    p_credential_id: ctx.credentialId,
    p_tool: entry.tool,
    p_action: entry.action,
    p_subject_table: entry.subject_table,
    p_subject_id: entry.subject_id,
    p_summary: entry.summary,
  });
  if (error) return { audit_id: null, audit_error: error.message };
  return { audit_id: typeof data === "string" ? data : null };
}

async function owned(ctx: Ctx, table: string, id: string): Promise<Row> {
  const data = bang(await ctx.db.from(table).select("*").eq("id", id).eq("user_id", ctx.userId).maybeSingle(), "read failed");
  if (!data) throw new Error(`${table} row not found`);
  return data as Row;
}

export async function lockedPathBlock(ctx: Ctx, bucket: string, path: string): Promise<string | null> {
  const data = bang(
    await ctx.db.from("project_assets").select("id, tags, metadata_json, file_url").eq("user_id", ctx.userId).eq("file_url", path),
    "read failed",
  ) as Row[] | null;
  for (const row of data ?? []) {
    const meta = row.metadata_json as { bucket?: string } | null;
    if (meta?.bucket && meta.bucket !== bucket) continue;
    const guard = deleteGuardStatus(row.tags as string[] | null);
    if (!guard.deletable) return guard.reason;
  }
  return null;
}

async function listAssets(ctx: Ctx, args: Record<string, unknown>) {
  const filters = planListFilters(args);
  if (!filters.ok) throw new Error(filters.error);
  let q = ctx.db.from("project_assets").select("id, project_id, shot_id, version_number, parent_asset_id, tags, origin, license_id, file_url, fps, sar, width, height, frame_count, duration_seconds, codec, sha256, size_bytes, approval_status, asset_type").eq("user_id", ctx.userId);
  if (filters.value.project_id) q = q.eq("project_id", filters.value.project_id);
  if (filters.value.shot_id) q = q.eq("shot_id", filters.value.shot_id);
  if (filters.value.version_number) q = q.eq("version_number", filters.value.version_number);
  if (filters.value.tag) q = q.contains("tags", [filters.value.tag]);
  const data = bang(await q.limit(100), "list failed");
  return { assets: data ?? [] };
}

async function tagAsset(ctx: Ctx, args: Record<string, unknown>) {
  if (!isUuid(args.asset_id)) throw new Error("asset_id must be a uuid");
  const row = await owned(ctx, "project_assets", args.asset_id);
  const next = planAssetTag(row.tags as string[] | null, args.tag, args.op);
  if (!next.ok) throw new Error(next.error);
  bang(await ctx.db.from("project_assets").update({ tags: next.value }).eq("id", row.id).eq("user_id", ctx.userId).select("id"), "update failed");
  const logged = await audit(ctx, { tool: "avt_asset_tag", action: String(args.op), subject_table: "project_assets", subject_id: row.id as string, summary: { tag: args.tag, tags: next.value } });
  return { id: row.id, tags: next.value, deleted: false, ...logged };
}

async function supersede(ctx: Ctx, args: Record<string, unknown>) {
  if (!isUuid(args.asset_id)) throw new Error("asset_id must be a uuid");
  const previous = await owned(ctx, "project_assets", args.asset_id);
  if (!isUuid(args.successor_id)) throw new Error("successor_id must be a uuid");
  const successor = await owned(ctx, "project_assets", args.successor_id);
  const plan = planSupersede(
    { id: previous.id as string, version_number: (previous.version_number as number | null) ?? 1, tags: (previous.tags as string[] | null) ?? [] },
    successor.id as string,
  );
  if (!plan.ok) throw new Error(plan.error);
  bang(await ctx.db.from("project_assets").update({ tags: plan.value.previousTags }).eq("id", previous.id).eq("user_id", ctx.userId), "update failed");
  bang(
    await ctx.db.from("project_assets").update({ parent_asset_id: plan.value.parent_asset_id, version_number: plan.value.version_number }).eq("id", successor.id).eq("user_id", ctx.userId),
    "update failed",
  );
  const logged = await audit(ctx, {
    tool: "avt_asset_supersede",
    action: "supersede",
    subject_table: "project_assets",
    subject_id: previous.id as string,
    summary: { successor_id: successor.id, version_number: plan.value.version_number, deleted: false },
  });
  return { asset_id: previous.id, successor_id: successor.id, ...plan.value, ...logged };
}

async function describeAsset(ctx: Ctx, args: Record<string, unknown>) {
  if (!isUuid(args.asset_id)) throw new Error("asset_id must be a uuid");
  const row = await owned(ctx, "project_assets", args.asset_id);
  const plan = planDescribe(args);
  if (!plan.ok) throw new Error(plan.error);
  bang(await ctx.db.from("project_assets").update(plan.value).eq("id", row.id).eq("user_id", ctx.userId), "update failed");
  const logged = await audit(ctx, { tool: "avt_asset_describe", action: "describe", subject_table: "project_assets", subject_id: row.id as string, summary: { fields: Object.keys(plan.value) } });
  return { id: row.id, ...plan.value, ...logged };
}

async function attachLicense(ctx: Ctx, args: Record<string, unknown>) {
  const plan = planLicense(args);
  if (!plan.ok) throw new Error(plan.error);
  const row = await owned(ctx, "project_assets", plan.value.asset_id);
  let licenseId = plan.value.license_id;
  if (plan.value.create) {
    const inserted = bang(
      await ctx.db.from("asset_licenses").insert({ user_id: ctx.userId, ...plan.value.create }).select("id").single(),
      "insert failed",
    ) as Row;
    licenseId = inserted.id as string;
  }
  const origin = plan.value.origin ?? (row.origin as string) ?? "generated";
  const allowed = attachAllows(origin, licenseId);
  if (!allowed.ok) throw new Error(allowed.error);
  if (licenseRequired(origin) && !licenseId) throw new Error("a license is required for stock and element assets");
  bang(
    await ctx.db.from("project_assets").update({ license_id: licenseId, origin }).eq("id", row.id).eq("user_id", ctx.userId),
    "update failed",
  );
  const logged = await audit(ctx, { tool: "avt_asset_attach_license", action: "attach", subject_table: "project_assets", subject_id: row.id as string, summary: { license_id: licenseId, origin } });
  return { asset_id: row.id, license_id: licenseId, origin, ...logged };
}

async function getLicense(ctx: Ctx, args: Record<string, unknown>) {
  if (!isUuid(args.asset_id)) throw new Error("asset_id must be a uuid");
  const row = await owned(ctx, "project_assets", args.asset_id);
  if (!row.license_id) return { asset_id: row.id, origin: row.origin, license: null };
  const license = await owned(ctx, "asset_licenses", row.license_id as string);
  return { asset_id: row.id, origin: row.origin, license };
}

async function deleteGuard(ctx: Ctx, args: Record<string, unknown>) {
  if (!isUuid(args.asset_id)) throw new Error("asset_id must be a uuid");
  const row = await owned(ctx, "project_assets", args.asset_id);
  return { asset_id: row.id, ...deleteGuardStatus(row.tags as string[] | null) };
}

async function skillBy(ctx: Ctx, args: Record<string, unknown>): Promise<Row> {
  if (isUuid(args.skill_id)) return owned(ctx, "production_skills", args.skill_id);
  if (typeof args.slug !== "string") throw new Error("skill_id or slug is required");
  const data = bang(await ctx.db.from("production_skills").select("*").eq("user_id", ctx.userId).eq("slug", args.slug).maybeSingle(), "read failed");
  if (!data) throw new Error("skill not found");
  return data as Row;
}

async function skillList(ctx: Ctx, args: Record<string, unknown>) {
  let q = ctx.db.from("production_skills").select("id, slug, name, summary, updated_at").eq("user_id", ctx.userId);
  if (typeof args.slug === "string") q = q.eq("slug", args.slug);
  const skills = (bang(await q.limit(100), "list failed") ?? []) as Row[];
  const versions = (bang(await ctx.db.from("production_skill_versions").select("id, skill_id, version_number, status, is_current").eq("user_id", ctx.userId).eq("is_current", true), "list failed") ?? []) as Row[];
  const current = new Map(versions.map((v) => [v.skill_id as string, v]));
  return { skills: skills.map((s) => ({ ...s, current: current.get(s.id as string) ?? null })) };
}

async function skillGet(ctx: Ctx, args: Record<string, unknown>) {
  if (isUuid(args.version_id)) {
    const version = await owned(ctx, "production_skill_versions", args.version_id);
    const skill = await owned(ctx, "production_skills", version.skill_id as string);
    return { skill, version };
  }
  const skill = await skillBy(ctx, args);
  const versions = bang(await ctx.db.from("production_skill_versions").select("*").eq("skill_id", skill.id).eq("user_id", ctx.userId).order("version_number", { ascending: false }), "list failed");
  return { skill, versions: versions ?? [] };
}

async function skillDraft(ctx: Ctx, args: Record<string, unknown>) {
  const plan = planSkillDraft(args);
  if (!plan.ok) throw new Error(plan.error);
  let skill = bang(await ctx.db.from("production_skills").select("*").eq("user_id", ctx.userId).eq("slug", plan.value.slug).maybeSingle(), "read failed") as Row | null;
  if (!skill) {
    skill = bang(
      await ctx.db.from("production_skills").insert({ user_id: ctx.userId, slug: plan.value.slug, name: plan.value.name, summary: plan.value.summary }).select("*").single(),
      "insert failed",
    ) as Row;
  }
  const prior = bang(
    await ctx.db.from("production_skill_versions").select("version_number").eq("skill_id", skill.id).eq("user_id", ctx.userId).order("version_number", { ascending: false }).limit(1),
    "read failed",
  ) as Row[] | null;
  const versionNumber = ((prior?.[0]?.version_number as number | undefined) ?? 0) + 1;
  const version = bang(
    await ctx.db.from("production_skill_versions").insert({
      skill_id: skill.id,
      user_id: ctx.userId,
      version_number: versionNumber,
      status: "draft",
      is_current: false,
      instructions: plan.value.instructions,
      supported_tools: plan.value.supported_tools,
      dependencies: plan.value.dependencies,
      examples: plan.value.examples,
      changelog: plan.value.changelog,
      preview_asset_id: plan.value.preview_asset_id,
      test_result_asset_id: plan.value.test_result_asset_id,
    }).select("id, version_number, status, is_current").single(),
    "insert failed",
  ) as Row;
  const logged = await audit(ctx, { tool: "avt_skill_draft", action: "draft", subject_table: "production_skill_versions", subject_id: version.id as string, summary: { slug: plan.value.slug, version_number: versionNumber } });
  return { skill_id: skill.id, ...version, ...logged };
}

async function skillPublish(ctx: Ctx, args: Record<string, unknown>) {
  if (!isUuid(args.version_id)) throw new Error("version_id must be a uuid");
  const version = await owned(ctx, "production_skill_versions", args.version_id);
  const validations = (bang(
    await ctx.db.from("skill_validations").select("result, effect_preset_id").eq("skill_version_id", version.id).eq("user_id", ctx.userId),
    "read failed",
  ) ?? []) as { result: string; effect_preset_id: string | null }[];
  const plan = planPublish(
    { id: version.id as string, status: version.status as string, is_current: version.is_current === true },
    validations.filter((v) => v.effect_preset_id == null),
  );
  if (!plan.ok) throw new Error(plan.error);
  const published = bang(await ctx.db.rpc("publish_skill_version", { p_version_id: version.id }), "publish failed");
  const logged = await audit(ctx, { tool: "avt_skill_publish", action: "publish", subject_table: "production_skill_versions", subject_id: version.id as string, summary: { result: published } });
  return { ...(published as object), ...logged };
}

async function skillPin(ctx: Ctx, args: Record<string, unknown>) {
  if (!isUuid(args.project_id) || !isUuid(args.skill_version_id)) throw new Error("project_id and skill_version_id must be uuids");
  const version = await owned(ctx, "production_skill_versions", args.skill_version_id);
  bang(
    await ctx.db.from("project_skill_pins").upsert({
      project_id: args.project_id,
      skill_id: version.skill_id,
      skill_version_id: version.id,
      user_id: ctx.userId,
      pinned_at: new Date().toISOString(),
    }),
    "pin failed",
  );
  const logged = await audit(ctx, { tool: "avt_skill_pin", action: "pin", subject_table: "project_skill_pins", subject_id: version.skill_id as string, summary: { project_id: args.project_id, skill_version_id: version.id } });
  return { project_id: args.project_id, skill_id: version.skill_id, skill_version_id: version.id, ...logged };
}

async function skillPinGet(ctx: Ctx, args: Record<string, unknown>) {
  if (isUuid(args.job_id)) {
    const job = await owned(ctx, "edit_renders", args.job_id);
    return { job_id: job.id, skill_version_id: job.skill_version_id ?? null, effect_preset_id: job.effect_preset_id ?? null };
  }
  if (!isUuid(args.project_id)) throw new Error("project_id or job_id is required");
  let q = ctx.db.from("project_skill_pins").select("*").eq("user_id", ctx.userId).eq("project_id", args.project_id);
  if (isUuid(args.skill_id)) q = q.eq("skill_id", args.skill_id);
  const pins = bang(await q, "read failed");
  return { project_id: args.project_id, pins: pins ?? [] };
}

async function effectList(ctx: Ctx, args: Record<string, unknown>) {
  let q = ctx.db.from("effect_presets").select("id, slug, name, version_number, status, is_current, code_ref, skill_version_id, preview_asset_id").eq("user_id", ctx.userId);
  if (typeof args.slug === "string") q = q.eq("slug", args.slug);
  const effects = bang(await q.order("slug", { ascending: true }).limit(200), "list failed");
  return { effects: effects ?? [] };
}

async function effectGet(ctx: Ctx, args: Record<string, unknown>) {
  if (!isUuid(args.id)) throw new Error("id must be a uuid");
  return { effect: await owned(ctx, "effect_presets", args.id) };
}

async function effectDraft(ctx: Ctx, args: Record<string, unknown>) {
  const plan = planEffectDraft(args);
  if (!plan.ok) throw new Error(plan.error);
  await owned(ctx, "production_skill_versions", plan.value.skill_version_id);
  const prior = bang(
    await ctx.db.from("effect_presets").select("id, version_number").eq("user_id", ctx.userId).eq("slug", plan.value.slug).order("version_number", { ascending: false }).limit(1),
    "read failed",
  ) as Row[] | null;
  const versionNumber = ((prior?.[0]?.version_number as number | undefined) ?? 0) + 1;
  const parentId = (prior?.[0]?.id as string | undefined) ?? null;
  const row = bang(
    await ctx.db.from("effect_presets").insert({
      user_id: ctx.userId,
      slug: plan.value.slug,
      name: plan.value.name,
      version_number: versionNumber,
      parent_id: parentId,
      skill_version_id: plan.value.skill_version_id,
      code_ref: plan.value.code_ref,
      params_schema: plan.value.params_schema,
      params_defaults: plan.value.params_defaults,
      preview_asset_id: plan.value.preview_asset_id,
      status: "draft",
      is_current: false,
      changelog: plan.value.changelog,
    }).select("id, version_number, status, is_current").single(),
    "insert failed",
  ) as Row;
  const logged = await audit(ctx, { tool: "avt_effect_draft", action: "draft", subject_table: "effect_presets", subject_id: row.id as string, summary: { slug: plan.value.slug, version_number: versionNumber } });
  return { ...row, ...logged };
}

async function effectPublish(ctx: Ctx, args: Record<string, unknown>) {
  if (!isUuid(args.id)) throw new Error("id must be a uuid");
  const preset = await owned(ctx, "effect_presets", args.id);
  const validations = (bang(await ctx.db.from("skill_validations").select("result").eq("effect_preset_id", preset.id).eq("user_id", ctx.userId), "read failed") ?? []) as { result: string }[];
  const plan = planEffectPublish({ id: preset.id as string, status: preset.status as string, is_current: preset.is_current === true }, validations);
  if (!plan.ok) throw new Error(plan.error);
  const published = bang(await ctx.db.rpc("publish_effect_preset", { p_preset_id: preset.id }), "publish failed");
  const logged = await audit(ctx, { tool: "avt_effect_publish", action: "publish", subject_table: "effect_presets", subject_id: preset.id as string, summary: { result: published } });
  return { ...(published as object), ...logged };
}

async function validationRecord(ctx: Ctx, args: Record<string, unknown>) {
  const plan = planValidation(args);
  if (!plan.ok) throw new Error(plan.error);
  await owned(ctx, "production_skill_versions", plan.value.skill_version_id);
  if (plan.value.effect_preset_id) await owned(ctx, "effect_presets", plan.value.effect_preset_id);
  const row = bang(await ctx.db.from("skill_validations").insert({ user_id: ctx.userId, ...plan.value }).select("id, result").single(), "insert failed") as Row;
  const logged = await audit(ctx, { tool: "avt_validation_record", action: "record", subject_table: "skill_validations", subject_id: row.id as string, summary: { result: plan.value.result, skill_version_id: plan.value.skill_version_id } });
  return { ...row, ...logged };
}

async function validationList(ctx: Ctx, args: Record<string, unknown>) {
  if (!isUuid(args.skill_version_id) && !isUuid(args.effect_preset_id)) throw new Error("skill_version_id or effect_preset_id is required");
  let q = ctx.db.from("skill_validations").select("*").eq("user_id", ctx.userId);
  if (isUuid(args.skill_version_id)) q = q.eq("skill_version_id", args.skill_version_id);
  if (isUuid(args.effect_preset_id)) q = q.eq("effect_preset_id", args.effect_preset_id);
  const validations = bang(await q.order("created_at", { ascending: false }).limit(100), "list failed");
  return { validations: validations ?? [] };
}

async function validationGet(ctx: Ctx, args: Record<string, unknown>) {
  if (!isUuid(args.id)) throw new Error("id must be a uuid");
  return { validation: await owned(ctx, "skill_validations", args.id) };
}

const FORMAT_KIND = {
  avt_shot_list_get: "shot_list",
  avt_shot_list_save: "shot_list",
  avt_beat_grid_get: "beat_grid",
  avt_beat_grid_save: "beat_grid",
  avt_project_rules_get: "project_rules",
  avt_project_rules_save: "project_rules",
} as const;

async function currentFormat(ctx: Ctx, projectId: string, format: string) {
  const rows = (bang(
    await ctx.db.from("project_assets").select("*").eq("user_id", ctx.userId).eq("project_id", projectId).contains("metadata_json", { format }).order("version_number", { ascending: false }).limit(20),
    "read failed",
  ) ?? []) as Row[];
  const current = rows.find((row) => !((row.tags as string[] | null) ?? []).includes("superseded")) ?? null;
  return { asset: current, document: (current?.metadata_json as { document?: unknown } | null)?.document ?? null };
}

async function saveFormat(ctx: Ctx, tool: string, kind: "shot_list" | "beat_grid" | "project_rules", args: Record<string, unknown>) {
  const plan = planFormatSave(kind, args);
  if (!plan.ok) throw new Error(plan.error);
  const previous = await currentFormat(ctx, plan.value.project_id, plan.value.format);
  const version = ((previous.asset?.version_number as number | undefined) ?? 0) + 1;
  const path = `${ctx.userId}/${plan.value.project_id}/formats/${plan.value.format}/v${version}.json`;
  const ownedPath = resolveOwnerStoragePath(ctx.userId, path);
  if (!ownedPath.ok) throw new Error(ownedPath.error);
  const body = JSON.stringify(plan.value.document);
  const up = await ctx.db.storage.from("project-references").upload(ownedPath.path, new TextEncoder().encode(body), { contentType: "application/json", upsert: false });
  if (up.error) throw new Error(up.error.message);
  const row = bang(
    await ctx.db.from("project_assets").insert({
      user_id: ctx.userId,
      project_id: plan.value.project_id,
      asset_type: "other",
      file_url: ownedPath.path,
      source_tool: "manual",
      origin: "edit",
      version_number: version,
      parent_asset_id: previous.asset?.id ?? null,
      tags: [] as AssetTag[],
      metadata_json: { bucket: "project-references", format: plan.value.format, document: plan.value.document },
    }).select("id, version_number").single(),
    "insert failed",
  ) as Row;
  if (previous.asset) {
    const tags = planAssetTag((previous.asset.tags as string[] | null) ?? [], "superseded", "add");
    if (tags.ok) {
      await ctx.db.from("project_assets").update({ tags: tags.value }).eq("id", previous.asset.id).eq("user_id", ctx.userId);
    }
  }
  const logged = await audit(ctx, { tool, action: "save", subject_table: "project_assets", subject_id: row.id as string, summary: { format: plan.value.format, version_number: version, deleted: false } });
  return { asset_id: row.id, version_number: version, format: plan.value.format, ...logged };
}

async function editLock(ctx: Ctx, args: Record<string, unknown>) {
  const plan = planEditLock(args);
  if (!plan.ok) throw new Error(plan.error);
  const sequence = await owned(ctx, "edit_sequences", plan.value.sequence_id);
  const clips = (bang(await ctx.db.from("edit_clips").select("id, locked").eq("sequence_id", sequence.id).eq("user_id", ctx.userId), "read failed") ?? []) as Row[];
  if (plan.value.read) {
    return { sequence_id: sequence.id, locked: sequence.locked === true, clips: clips.map((c) => ({ id: c.id, locked: c.locked === true })) };
  }
  if (plan.value.sequenceLocked !== null) {
    bang(await ctx.db.from("edit_sequences").update({ locked: plan.value.sequenceLocked }).eq("id", sequence.id).eq("user_id", ctx.userId), "update failed");
  }
  for (const clip of plan.value.clips) {
    if (!clips.some((row) => row.id === clip.id)) throw new Error(`clip ${clip.id} is not on this sequence`);
    bang(await ctx.db.from("edit_clips").update({ locked: clip.locked }).eq("id", clip.id).eq("user_id", ctx.userId), "update failed");
  }
  const logged = await audit(ctx, {
    tool: "avt_edit_lock",
    action: plan.value.sequenceLocked === false || plan.value.clips.some((c) => !c.locked) ? "unlock" : "lock",
    subject_table: "edit_sequences",
    subject_id: sequence.id as string,
    summary: { locked: plan.value.sequenceLocked, clips: plan.value.clips },
  });
  return { sequence_id: sequence.id, locked: plan.value.sequenceLocked ?? sequence.locked === true, clips: plan.value.clips, ...logged };
}

const HANDLERS: Record<string, (ctx: Ctx, args: Record<string, unknown>) => Promise<unknown>> = {
  avt_asset_list: listAssets,
  avt_asset_tag: tagAsset,
  avt_asset_supersede: supersede,
  avt_asset_describe: describeAsset,
  avt_asset_attach_license: attachLicense,
  avt_asset_get_license: getLicense,
  avt_asset_delete_guard: deleteGuard,
  avt_skill_list: skillList,
  avt_skill_get: skillGet,
  avt_skill_draft: skillDraft,
  avt_skill_publish: skillPublish,
  avt_skill_pin: skillPin,
  avt_skill_pin_get: skillPinGet,
  avt_effect_list: effectList,
  avt_effect_get: effectGet,
  avt_effect_draft: effectDraft,
  avt_effect_publish: effectPublish,
  avt_validation_record: validationRecord,
  avt_validation_list: validationList,
  avt_validation_get: validationGet,
  avt_edit_lock: editLock,
};

export async function runStoreTool(db: StoreDb, userId: string, credentialId: string, name: string, args: Record<string, unknown>) {
  const ctx: Ctx = { db, userId, credentialId };
  const formatKind = FORMAT_KIND[name as keyof typeof FORMAT_KIND];
  if (formatKind && name.endsWith("_get")) {
    if (!isUuid(args.project_id)) throw new Error("project_id must be a uuid");
    const format = formatKind === "shot_list" ? "avt.shot_list" : formatKind === "beat_grid" ? "avt.beat_grid" : "avt.project_rules";
    return currentFormat(ctx, args.project_id, format);
  }
  if (formatKind && name.endsWith("_save")) return saveFormat(ctx, name, formatKind, args);
  const handler = HANDLERS[name];
  if (!handler) throw new Error(`unknown store tool ${name}`);
  return handler(ctx, args);
}

export const STORE_TOOL_NAMES = [
  ...Object.keys(HANDLERS),
  ...Object.keys(FORMAT_KIND),
];
