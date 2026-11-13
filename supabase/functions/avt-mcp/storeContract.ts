// Pure decisions for the asset-store MCP tools. No network. Writes are planned here and applied by storeHandlers.
import {
  FORMAT_BEAT_GRID,
  FORMAT_PROJECT_RULES,
  FORMAT_SHOT_LIST,
  parseBeatGrid,
  parseProjectRules,
  parseShotList,
} from "../_shared/assetFormats.ts";
import { parseDependencies } from "../_shared/skillDeps.ts";

export const ASSET_TAGS = ["locked", "superseded", "review", "approved"] as const;
export type AssetTag = (typeof ASSET_TAGS)[number];
export const ASSET_ORIGINS = ["generated", "camera", "element", "stock", "edit"] as const;
export type AssetOrigin = (typeof ASSET_ORIGINS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/;

export type StoreResult<T> = { ok: true; value: T } | { ok: false; error: string };

function fail(error: string): StoreResult<never> {
  return { ok: false, error };
}

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

export function licenseRequired(origin: string): boolean {
  return origin === "element" || origin === "stock";
}

export function deleteGuardStatus(tags: readonly string[] | null | undefined): {
  locked: boolean;
  deletable: boolean;
  deleted: false;
  reason: string | null;
} {
  const locked = Array.isArray(tags) && tags.includes("locked");
  return {
    locked,
    deletable: !locked,
    deleted: false,
    reason: locked ? "locked asset cannot be deleted" : null,
  };
}

export function planAssetTag(
  tags: readonly string[] | null | undefined,
  tag: unknown,
  op: unknown,
): StoreResult<AssetTag[]> {
  if (typeof tag !== "string" || !(ASSET_TAGS as readonly string[]).includes(tag)) {
    return fail(`tag must be one of ${ASSET_TAGS.join(", ")}`);
  }
  if (op !== "add" && op !== "remove") return fail('op must be "add" or "remove"');
  const next = new Set((tags ?? []).filter((t): t is AssetTag => (ASSET_TAGS as readonly string[]).includes(t)));
  if (op === "add") next.add(tag as AssetTag);
  else next.delete(tag as AssetTag);
  return { ok: true, value: [...next] };
}

export function planSupersede(
  previous: { id: string; version_number: number | null; tags: string[] | null },
  successorId: string,
): StoreResult<{ previousTags: AssetTag[]; parent_asset_id: string; version_number: number; deleted: false }> {
  if (!isUuid(successorId)) return fail("successor_id must be a uuid");
  if (previous.id === successorId) return fail("an asset cannot supersede itself");
  const tags = planAssetTag(previous.tags, "superseded", "add");
  if (!tags.ok) return tags;
  return {
    ok: true,
    value: {
      previousTags: tags.value,
      parent_asset_id: previous.id,
      version_number: Math.max(1, previous.version_number ?? 1) + 1,
      deleted: false,
    },
  };
}

export type MediaDescribe = {
  fps?: number | null;
  sar?: string | null;
  width?: number | null;
  height?: number | null;
  frame_count?: number | null;
  duration_seconds?: number | null;
  codec?: string | null;
  sha256?: string | null;
  size_bytes?: number | null;
  source_take_asset_id?: string | null;
  song_zero_offset_seconds?: number | null;
  provenance?: Record<string, unknown> | null;
  shot_id?: string | null;
};

export function planDescribe(args: Record<string, unknown>): StoreResult<MediaDescribe> {
  const out: MediaDescribe = {};
  if ("fps" in args) {
    if (args.fps !== null && (typeof args.fps !== "number" || !(args.fps > 0) || args.fps > 120)) return fail("fps must be between 0 and 120");
    out.fps = args.fps as number | null;
  }
  if ("sar" in args) {
    if (typeof args.sar !== "string" || !/^[0-9]+:[0-9]+$/.test(args.sar)) return fail("sar must look like 1:1");
    out.sar = args.sar;
  }
  for (const key of ["width", "height", "frame_count"] as const) {
    if (!(key in args)) continue;
    const n = args[key];
    if (n !== null && (typeof n !== "number" || !Number.isInteger(n) || n <= 0)) return fail(`${key} must be a positive integer`);
    out[key] = n as number | null;
  }
  if ("duration_seconds" in args) {
    if (args.duration_seconds !== null && (typeof args.duration_seconds !== "number" || !(args.duration_seconds >= 0))) {
      return fail("duration_seconds must be >= 0");
    }
    out.duration_seconds = args.duration_seconds as number | null;
  }
  if ("codec" in args) {
    if (args.codec !== null && (typeof args.codec !== "string" || args.codec.length > 40)) return fail("codec is too long");
    out.codec = args.codec as string | null;
  }
  if ("sha256" in args) {
    if (args.sha256 !== null && (typeof args.sha256 !== "string" || !SHA.test(args.sha256))) return fail("sha256 must be 64 lowercase hex characters");
    out.sha256 = args.sha256 as string | null;
  }
  if ("size_bytes" in args) {
    if (args.size_bytes !== null && (typeof args.size_bytes !== "number" || args.size_bytes < 0)) return fail("size_bytes must be >= 0");
    out.size_bytes = args.size_bytes as number | null;
  }
  if ("source_take_asset_id" in args) {
    if (args.source_take_asset_id !== null && !isUuid(args.source_take_asset_id)) return fail("source_take_asset_id must be a uuid");
    out.source_take_asset_id = args.source_take_asset_id as string | null;
  }
  if ("song_zero_offset_seconds" in args) {
    if (typeof args.song_zero_offset_seconds !== "number" || !Number.isFinite(args.song_zero_offset_seconds)) {
      return fail("song_zero_offset_seconds must be a number");
    }
    out.song_zero_offset_seconds = args.song_zero_offset_seconds;
  }
  if ("provenance" in args) {
    if (args.provenance === null || typeof args.provenance !== "object" || Array.isArray(args.provenance)) return fail("provenance must be an object");
    out.provenance = args.provenance as Record<string, unknown>;
  }
  if ("shot_id" in args) {
    if (args.shot_id !== null && !isUuid(args.shot_id)) return fail("shot_id must be a uuid");
    out.shot_id = args.shot_id as string | null;
  }
  if (Object.keys(out).length === 0) return fail("name at least one media field");
  return { ok: true, value: out };
}

export function planListFilters(args: Record<string, unknown>): StoreResult<{
  project_id: string | null;
  shot_id: string | null;
  version_number: number | null;
  tag: AssetTag | null;
}> {
  const project_id = args.project_id === undefined || args.project_id === null ? null : args.project_id;
  const shot_id = args.shot_id === undefined || args.shot_id === null ? null : args.shot_id;
  if (project_id !== null && !isUuid(project_id)) return fail("project_id must be a uuid");
  if (shot_id !== null && !isUuid(shot_id)) return fail("shot_id must be a uuid");
  if (project_id === null && shot_id === null && args.tag === undefined && args.version_number === undefined) {
    return fail("filter by project_id, shot_id, version_number, or tag");
  }
  let version_number: number | null = null;
  if (args.version_number !== undefined && args.version_number !== null) {
    if (typeof args.version_number !== "number" || !Number.isInteger(args.version_number) || args.version_number < 1) {
      return fail("version_number must be a positive integer");
    }
    version_number = args.version_number;
  }
  let tag: AssetTag | null = null;
  if (args.tag !== undefined && args.tag !== null) {
    if (typeof args.tag !== "string" || !(ASSET_TAGS as readonly string[]).includes(args.tag)) return fail(`tag must be one of ${ASSET_TAGS.join(", ")}`);
    tag = args.tag as AssetTag;
  }
  return { ok: true, value: { project_id, shot_id, version_number, tag } };
}

export type LicenseDraft = { name: string; source: string; license_type: string; terms: string };

export function planLicense(args: Record<string, unknown>): StoreResult<{
  asset_id: string;
  origin: AssetOrigin | null;
  license_id: string | null;
  create: LicenseDraft | null;
}> {
  if (!isUuid(args.asset_id)) return fail("asset_id must be a uuid");
  let origin: AssetOrigin | null = null;
  if (args.origin !== undefined && args.origin !== null) {
    if (typeof args.origin !== "string" || !(ASSET_ORIGINS as readonly string[]).includes(args.origin)) {
      return fail(`origin must be one of ${ASSET_ORIGINS.join(", ")}`);
    }
    origin = args.origin as AssetOrigin;
  }
  const license_id = args.license_id === undefined || args.license_id === null ? null : args.license_id;
  if (license_id !== null && !isUuid(license_id)) return fail("license_id must be a uuid");
  let create: LicenseDraft | null = null;
  if (args.license !== undefined && args.license !== null) {
    if (typeof args.license !== "object" || Array.isArray(args.license)) return fail("license must be an object");
    const row = args.license as Record<string, unknown>;
    if (typeof row.name !== "string" || typeof row.source !== "string" || typeof row.license_type !== "string") {
      return fail("license needs name, source, and license_type");
    }
    if (row.name.length === 0 || row.source.length === 0 || row.license_type.length === 0) return fail("license fields must be non-empty");
    create = { name: row.name, source: row.source, license_type: row.license_type, terms: typeof row.terms === "string" ? row.terms : "" };
  }
  if (!license_id && !create) return fail("pass license_id or license");
  if (license_id && create) return fail("pass license_id or license, not both");
  return { ok: true, value: { asset_id: args.asset_id, origin, license_id, create } };
}

export function attachAllows(origin: string, licenseId: string | null): StoreResult<true> {
  if (licenseRequired(origin) && !licenseId) return fail("a license is required for stock and element assets");
  return { ok: true, value: true };
}

export type SkillDraft = {
  slug: string;
  name: string;
  summary: string;
  instructions: string;
  supported_tools: string[];
  dependencies: { name: string; constraint: string }[];
  examples: unknown[];
  changelog: string;
  preview_asset_id: string | null;
  test_result_asset_id: string | null;
};

export function planSkillDraft(args: Record<string, unknown>): StoreResult<SkillDraft> {
  if (typeof args.slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,60}$/.test(args.slug)) return fail("slug must be lowercase letters, numbers, and hyphens");
  if (typeof args.name !== "string" || args.name.length === 0 || args.name.length > 120) return fail("name is required");
  if (typeof args.instructions !== "string" || args.instructions.trim().length === 0) return fail("instructions are required");
  if (!Array.isArray(args.supported_tools) || args.supported_tools.some((t) => typeof t !== "string" || t.length === 0)) {
    return fail("supported_tools must be a list of tool names");
  }
  const deps = parseDependencies(args.dependencies ?? []);
  if (!deps.ok) return deps;
  if (args.preview_asset_id !== undefined && args.preview_asset_id !== null && !isUuid(args.preview_asset_id)) return fail("preview_asset_id must be a uuid");
  if (args.test_result_asset_id !== undefined && args.test_result_asset_id !== null && !isUuid(args.test_result_asset_id)) {
    return fail("test_result_asset_id must be a uuid");
  }
  const examples = args.examples === undefined ? [] : args.examples;
  if (!Array.isArray(examples)) return fail("examples must be an array");
  return {
    ok: true,
    value: {
      slug: args.slug,
      name: args.name,
      summary: typeof args.summary === "string" ? args.summary : "",
      instructions: args.instructions,
      supported_tools: args.supported_tools as string[],
      dependencies: deps.value,
      examples,
      changelog: typeof args.changelog === "string" ? args.changelog : "",
      preview_asset_id: isUuid(args.preview_asset_id) ? args.preview_asset_id : null,
      test_result_asset_id: isUuid(args.test_result_asset_id) ? args.test_result_asset_id : null,
    },
  };
}

export function planPublish(version: { id: string; status: string; is_current: boolean } | null, validations: readonly { result: string; effect_preset_id?: string | null }[]): StoreResult<{ already: boolean }> {
  if (!version) return fail("version not found");
  if (version.status === "published" && version.is_current) return { ok: true, value: { already: true } };
  const pass = validations.some((v) => v.result === "pass" && (v.effect_preset_id === undefined || v.effect_preset_id === null));
  if (!pass) return fail("publish requires a passing validation");
  return { ok: true, value: { already: false } };
}

export function planEffectPublish(preset: { id: string; status: string; is_current: boolean } | null, validations: readonly { result: string }[]): StoreResult<{ already: boolean }> {
  if (!preset) return fail("effect not found");
  if (preset.status === "published" && preset.is_current) return { ok: true, value: { already: true } };
  if (!validations.some((v) => v.result === "pass")) return fail("publish requires a passing validation");
  return { ok: true, value: { already: false } };
}

/** Published rows keep their body. is_current may still move when another version is published. */
export function publishedBodyFrozen(status: string, patch: Record<string, unknown>, frozen: readonly string[]): StoreResult<true> {
  if (status !== "published") return { ok: true, value: true };
  for (const key of frozen) {
    if (key in patch) return fail("published versions are immutable");
  }
  return { ok: true, value: true };
}

export type EffectDraft = {
  slug: string;
  name: string;
  code_ref: string;
  skill_version_id: string;
  params_schema: Record<string, unknown>;
  params_defaults: Record<string, unknown>;
  preview_asset_id: string | null;
  changelog: string;
};

export function planEffectDraft(args: Record<string, unknown>): StoreResult<EffectDraft> {
  if (typeof args.slug !== "string" || !/^[a-z0-9][a-z0-9_-]{0,60}$/.test(args.slug)) return fail("slug must be lowercase");
  if (typeof args.name !== "string" || args.name.length === 0) return fail("name is required");
  if (typeof args.code_ref !== "string" || args.code_ref.length === 0 || args.code_ref.length > 200) return fail("code_ref is required");
  if (!isUuid(args.skill_version_id)) return fail("skill_version_id must be a uuid");
  if (!args.params_schema || typeof args.params_schema !== "object" || Array.isArray(args.params_schema)) return fail("params_schema must be a JSON schema object");
  const schema = args.params_schema as Record<string, unknown>;
  if (schema.type !== "object") return fail('params_schema.type must be "object"');
  const defaults = args.params_defaults === undefined ? {} : args.params_defaults;
  if (!defaults || typeof defaults !== "object" || Array.isArray(defaults)) return fail("params_defaults must be an object");
  if (args.preview_asset_id !== undefined && args.preview_asset_id !== null && !isUuid(args.preview_asset_id)) return fail("preview_asset_id must be a uuid");
  return {
    ok: true,
    value: {
      slug: args.slug,
      name: args.name,
      code_ref: args.code_ref,
      skill_version_id: args.skill_version_id,
      params_schema: schema,
      params_defaults: defaults as Record<string, unknown>,
      preview_asset_id: isUuid(args.preview_asset_id) ? args.preview_asset_id : null,
      changelog: typeof args.changelog === "string" ? args.changelog : "",
    },
  };
}

export type ValidationDraft = {
  skill_version_id: string;
  effect_preset_id: string | null;
  worker_label: string;
  os_name: string;
  tool_versions: Record<string, unknown>;
  input_asset_ids: string[];
  result: "pass" | "fail";
  qc_asset_id: string | null;
  notes: string;
};

export function planValidation(args: Record<string, unknown>): StoreResult<ValidationDraft> {
  if (!isUuid(args.skill_version_id)) return fail("skill_version_id must be a uuid");
  if (args.effect_preset_id !== undefined && args.effect_preset_id !== null && !isUuid(args.effect_preset_id)) return fail("effect_preset_id must be a uuid");
  if (typeof args.worker_label !== "string" || args.worker_label.length === 0) return fail("worker_label is required");
  if (typeof args.os_name !== "string" || args.os_name.length === 0) return fail("os_name is required");
  if (args.result !== "pass" && args.result !== "fail") return fail('result must be "pass" or "fail"');
  const tools = args.tool_versions === undefined ? {} : args.tool_versions;
  if (!tools || typeof tools !== "object" || Array.isArray(tools)) return fail("tool_versions must be an object");
  const inputs = args.input_asset_ids === undefined ? [] : args.input_asset_ids;
  if (!Array.isArray(inputs) || inputs.some((id) => !isUuid(id))) return fail("input_asset_ids must be uuids");
  if (args.qc_asset_id !== undefined && args.qc_asset_id !== null && !isUuid(args.qc_asset_id)) return fail("qc_asset_id must be a uuid");
  return {
    ok: true,
    value: {
      skill_version_id: args.skill_version_id,
      effect_preset_id: isUuid(args.effect_preset_id) ? args.effect_preset_id : null,
      worker_label: args.worker_label,
      os_name: args.os_name,
      tool_versions: tools as Record<string, unknown>,
      input_asset_ids: inputs as string[],
      result: args.result,
      qc_asset_id: isUuid(args.qc_asset_id) ? args.qc_asset_id : null,
      notes: typeof args.notes === "string" ? args.notes : "",
    },
  };
}

export function planFormatSave(kind: "shot_list" | "beat_grid" | "project_rules", args: Record<string, unknown>): StoreResult<{ format: string; project_id: string; document: unknown }> {
  if (!isUuid(args.project_id)) return fail("project_id must be a uuid");
  if (kind === "beat_grid") {
    const parsed = parseBeatGrid(args.document);
    if (!parsed.ok) return parsed;
    return { ok: true, value: { format: FORMAT_BEAT_GRID, project_id: args.project_id, document: parsed.value } };
  }
  const doc = args.document;
  if (!doc || typeof doc !== "object") return fail("document is required");
  const withProject = { ...(doc as Record<string, unknown>), project_id: args.project_id };
  if (kind === "shot_list") {
    const parsed = parseShotList(withProject);
    if (!parsed.ok) return parsed;
    if (parsed.value.project_id !== args.project_id) return fail("document project_id must match");
    return { ok: true, value: { format: FORMAT_SHOT_LIST, project_id: args.project_id, document: parsed.value } };
  }
  const parsed = parseProjectRules(withProject);
  if (!parsed.ok) return parsed;
  if (parsed.value.project_id !== args.project_id) return fail("document project_id must match");
  return { ok: true, value: { format: FORMAT_PROJECT_RULES, project_id: args.project_id, document: parsed.value } };
}

export type LockClip = { id: string; locked: boolean };

export function planEditLock(args: Record<string, unknown>): StoreResult<{
  sequence_id: string;
  read: boolean;
  sequenceLocked: boolean | null;
  clips: LockClip[];
  unlock: boolean;
}> {
  if (!isUuid(args.sequence_id)) return fail("sequence_id must be a uuid");
  const unlock = args.unlock === true;
  const hasSequence = typeof args.locked === "boolean";
  const clipsIn = args.clips;
  if (clipsIn !== undefined && !Array.isArray(clipsIn)) return fail("clips must be an array");
  const clips: LockClip[] = [];
  if (Array.isArray(clipsIn)) {
    for (const item of clipsIn) {
      if (!item || typeof item !== "object") return fail("each clip lock needs id and locked");
      const row = item as Record<string, unknown>;
      if (!isUuid(row.id) || typeof row.locked !== "boolean") return fail("each clip lock needs id and locked");
      clips.push({ id: row.id, locked: row.locked });
    }
  }
  const writing = hasSequence || clips.length > 0;
  if (!writing) return { ok: true, value: { sequence_id: args.sequence_id, read: true, sequenceLocked: null, clips: [], unlock } };
  const clearing = (hasSequence && args.locked === false) || clips.some((c) => !c.locked);
  if (clearing && !unlock) return fail("clearing a lock needs unlock: true");
  return {
    ok: true,
    value: {
      sequence_id: args.sequence_id,
      read: false,
      sequenceLocked: hasSequence ? (args.locked as boolean) : null,
      clips,
      unlock,
    },
  };
}

const LOCKED_FIELDS = ["assetId", "assetVersion", "sourceIn", "sourceOut", "timelineIn", "timelineOut", "timelineInFrame", "timelineOutFrame", "speed", "transition", "transitionSeconds", "grade", "layerStack", "songZeroOffset"] as const;

/** A locked clip refuses a body change unless this save passes unlock. */
export function lockedClipMutation(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
  unlock: boolean,
): string | null {
  if (!before || before.locked !== true) return null;
  if (unlock) return null;
  for (const key of LOCKED_FIELDS) {
    if (key in after && JSON.stringify(after[key] ?? null) !== JSON.stringify(before[key] ?? null)) {
      return `clip ${String(before.id)} is locked; pass unlock: true to change it`;
    }
  }
  if (after.locked === false) return `clip ${String(before.id)} is locked; pass unlock: true to unlock it`;
  return null;
}

/** Keep a stored lock when the caller omitted the field. Clearing it still needs unlock. */
export function preserveLocks<T extends { id: string; locked?: boolean; clips: { id: string; locked?: boolean }[] }>(
  prior: T | null,
  next: T,
  unlock: boolean,
): StoreResult<T> {
  const sequenceLocked = typeof next.locked === "boolean" ? next.locked : prior?.locked === true;
  if (prior?.locked === true && sequenceLocked === false && !unlock) {
    return fail("sequence is locked; pass unlock: true to unlock it");
  }
  const clips = next.clips.map((clip) => {
    const before = prior?.clips.find((row) => row.id === clip.id);
    const locked = typeof clip.locked === "boolean" ? clip.locked : before?.locked === true;
    return { ...clip, locked };
  });
  for (const clip of clips) {
    const before = prior?.clips.find((row) => row.id === clip.id);
    if (before?.locked === true && clip.locked === false && !unlock) {
      return fail(`clip ${clip.id} is locked; pass unlock: true to unlock it`);
    }
  }
  return { ok: true, value: { ...next, locked: sequenceLocked, clips } };
}

export function renderLockReason(sequenceLocked: boolean, clipIds: readonly string[], unlock: boolean): string | null {
  if (unlock) return null;
  if (sequenceLocked) return "sequence is locked; pass unlock: true to render";
  if (clipIds.length) return `locked clips refuse re-render: ${clipIds.join(", ")}`;
  return null;
}

export function remapReason(clips: readonly { id: string; speed: number; timeRemapAllowed?: boolean }[]): string | null {
  const bad = clips.filter((c) => c.timeRemapAllowed === false && c.speed !== 1);
  if (!bad.length) return null;
  return `source in/out is not time-remapped; speed must stay 1 (${bad.map((c) => c.id).join(", ")})`;
}

/** 4 GB. Holds a 1.7 GB camera take and a 245 MB master. The project-wide cap is separate and is not SQL. */
export const BUCKET_FILE_SIZE_LIMIT_BYTES = 4 * 1024 * 1024 * 1024;

export const STORE_WRITE_TOOLS = [
  "avt_asset_tag",
  "avt_asset_supersede",
  "avt_asset_describe",
  "avt_asset_attach_license",
  "avt_skill_draft",
  "avt_skill_publish",
  "avt_skill_pin",
  "avt_effect_draft",
  "avt_effect_publish",
  "avt_validation_record",
  "avt_shot_list_save",
  "avt_beat_grid_save",
  "avt_project_rules_save",
  "avt_edit_lock",
] as const;

export const STORE_READ_TOOLS = [
  "avt_asset_list",
  "avt_asset_get_license",
  "avt_asset_delete_guard",
  "avt_skill_list",
  "avt_skill_get",
  "avt_skill_pin_get",
  "avt_effect_list",
  "avt_effect_get",
  "avt_validation_list",
  "avt_validation_get",
  "avt_shot_list_get",
  "avt_beat_grid_get",
  "avt_project_rules_get",
] as const;
