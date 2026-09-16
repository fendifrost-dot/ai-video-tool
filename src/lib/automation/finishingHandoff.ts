/**
 * Lane F2 — reconstructed-master → finishing handoff contract.
 * Pure validation only. No Premiere I/O, no ffmpeg, no computer-use, no network.
 * Does not import reconstruct / eval / pipeline modules (string fields only).
 * See docs/research/finishing/RECONSTRUCTED_MASTER_HANDOFF.md.
 */

import { validateFinishingRecipe, workspacePathAllowed } from "./finishingRecipe";

export const FINISHING_HANDOFF_SCHEMA_VERSION = 1 as const;
export const FINISHING_HANDOFF_KIND = "reconstructed_master_handoff" as const;

export const HANDOFF_ENCODE_STATUSES = ["not_claimed", "pending", "encoded"] as const;
export type HandoffEncodeStatus = (typeof HANDOFF_ENCODE_STATUSES)[number];

export const HANDOFF_EVAL_VERDICTS = ["PASS", "FAIL", "unscored"] as const;
export type HandoffEvalVerdict = (typeof HANDOFF_EVAL_VERDICTS)[number];

export const HANDOFF_FINISHING_HOSTS = ["premiere", "resolve", "ame_local", "human"] as const;
export type HandoffFinishingHost = (typeof HANDOFF_FINISHING_HOSTS)[number];

/** UUID identity — any project/clip, not an allowlist of the sprint demo. */
export const FINISHING_IDENTITY_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const FINISHING_T7_PROJECT_ROOT_PREFIX = "/Volumes/T7/avt-finishing" as const;

export type FinishingHandoffIdentity = {
  project_id: string;
  master_clip_asset_id: string;
  chest_asset_id: string;
  sleeve_asset_id: string;
};

const IDENTITY_KEYS = [
  "project_id",
  "master_clip_asset_id",
  "chest_asset_id",
  "sleeve_asset_id",
] as const;

/**
 * Sprint demo identity copied as a **sample**, not a whitelist.
 * Do not import `src/lib/reconstruct/canonicalLineage` from this lane.
 */
export const F2_DEMO_HANDOFF_IDENTITY: FinishingHandoffIdentity = {
  project_id: "764a63d2-93cd-44f3-905f-292f14ab2f51",
  master_clip_asset_id: "76fe7438-671d-4428-a7f6-17a45e98c16f",
  chest_asset_id: "9ed83c01-8c7d-4d1b-918f-87b0fc743c50",
  sleeve_asset_id: "fdb86b18-d4aa-465e-b73f-1d252709739c",
};

/** Synthetic second clip/project — proves the contract is not demo-locked. */
export const F2_SECOND_CLIP_HANDOFF_IDENTITY: FinishingHandoffIdentity = {
  project_id: "aaaaaaaa-0002-4000-8000-bbbbbbbbbbbb",
  master_clip_asset_id: "cccccccc-0002-4000-8000-dddddddddddd",
  chest_asset_id: "eeeeeeee-0002-4000-8000-ffffffffffff",
  sleeve_asset_id: "12121212-0002-4000-8000-343434343434",
};

export function isFinishingIdentityId(value: unknown): value is string {
  return typeof value === "string" && FINISHING_IDENTITY_ID_RE.test(value);
}

export type ReconstructedMasterHandoff = {
  schema_version: typeof FINISHING_HANDOFF_SCHEMA_VERSION;
  kind: typeof FINISHING_HANDOFF_KIND;
  source: "lane_h";
  consumer: "lane_f2";
  paid_calls: false;
  astra_required: false;
  blocks_e2e: false;
  grok_per_frame: false;
  sam3_live_fetch: false;
  encode_status: HandoffEncodeStatus;
  project_id: string;
  master_clip_asset_id: string;
  chest_asset_id: string;
  sleeve_asset_id: string;
  reconstruct_adapter_version: string;
  reconstruct_e2e_version: string;
  frame_count: number;
  temporal_job_count: number;
  original_pixels_preserved_where_unauthorized: boolean;
  eval_verdict: HandoffEvalVerdict;
  eval_spec_version?: string;
  not_claimed: string[];
  master: {
    relpath: string | null;
    mime: "video/mp4";
    content_hash?: string;
  };
  finishing: {
    host: HandoffFinishingHost;
    import_mode: "single_clip";
    recut: false;
    regenerate: false;
    recipe_relpath?: string;
  };
};

export type FinishingHandoffIssue = {
  code:
    | "schema"
    | "kind"
    | "spend"
    | "e2e"
    | "encode"
    | "provenance"
    | "finishing"
    | "recipe";
  message: string;
};

export type FinishingHandoffValidation = {
  ok: boolean;
  errors: FinishingHandoffIssue[];
};

const ENCODE_SET = new Set<string>(HANDOFF_ENCODE_STATUSES);
const VERDICT_SET = new Set<string>(HANDOFF_EVAL_VERDICTS);
const HOST_SET = new Set<string>(HANDOFF_FINISHING_HOSTS);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requireNonEmptyString(
  rec: Record<string, unknown>,
  key: string,
  errors: FinishingHandoffIssue[],
): void {
  if (typeof rec[key] !== "string" || rec[key] === "") {
    errors.push({ code: "provenance", message: `${key} must be a non-empty string` });
  }
}

function requireIdentityId(
  rec: Record<string, unknown>,
  key: (typeof IDENTITY_KEYS)[number],
  errors: FinishingHandoffIssue[],
): void {
  if (!isFinishingIdentityId(rec[key])) {
    errors.push({
      code: "provenance",
      message: `${key} must be a UUID (any project/clip — not a demo-id allowlist)`,
    });
  }
}

function requireNonNegInt(
  rec: Record<string, unknown>,
  key: string,
  errors: FinishingHandoffIssue[],
): void {
  if (typeof rec[key] !== "number" || !Number.isInteger(rec[key]) || rec[key] < 0) {
    errors.push({ code: "provenance", message: `${key} must be a non-negative integer` });
  }
}

/**
 * Validate a reconstructed-master handoff sidecar.
 * Accepts unknown JSON so Lane H can emit it without importing this module's types at runtime.
 */
export function validateReconstructedMasterHandoff(input: unknown): FinishingHandoffValidation {
  const errors: FinishingHandoffIssue[] = [];
  const rec = asRecord(input);
  if (!rec) {
    return { ok: false, errors: [{ code: "schema", message: "Handoff must be an object" }] };
  }

  if (rec.schema_version !== FINISHING_HANDOFF_SCHEMA_VERSION) {
    errors.push({
      code: "schema",
      message: `schema_version must be ${FINISHING_HANDOFF_SCHEMA_VERSION}`,
    });
  }

  if (rec.kind !== FINISHING_HANDOFF_KIND) {
    errors.push({
      code: "kind",
      message: `kind must be "${FINISHING_HANDOFF_KIND}"`,
    });
  }

  if (rec.source !== "lane_h") {
    errors.push({ code: "schema", message: 'source must be "lane_h" (producer)' });
  }
  if (rec.consumer !== "lane_f2") {
    errors.push({ code: "schema", message: 'consumer must be "lane_f2"' });
  }

  if (rec.paid_calls !== false) {
    errors.push({ code: "spend", message: "paid_calls must be false" });
  }
  if (rec.astra_required !== false) {
    errors.push({
      code: "spend",
      message: "astra_required must be false (Astra disabled until RED)",
    });
  }
  if (rec.grok_per_frame !== false) {
    errors.push({ code: "spend", message: "grok_per_frame must be false" });
  }
  if (rec.sam3_live_fetch !== false) {
    errors.push({ code: "spend", message: "sam3_live_fetch must be false" });
  }

  if (rec.blocks_e2e !== false) {
    errors.push({
      code: "e2e",
      message: "blocks_e2e must be false — finishing must not gate Lane H E2E",
    });
  }

  if (typeof rec.encode_status !== "string" || !ENCODE_SET.has(rec.encode_status)) {
    errors.push({
      code: "encode",
      message: 'encode_status must be "not_claimed" | "pending" | "encoded"',
    });
  }

  for (const key of IDENTITY_KEYS) {
    requireIdentityId(rec, key, errors);
  }

  for (const key of ["reconstruct_adapter_version", "reconstruct_e2e_version"] as const) {
    requireNonEmptyString(rec, key, errors);
  }

  requireNonNegInt(rec, "frame_count", errors);
  requireNonNegInt(rec, "temporal_job_count", errors);

  if (rec.original_pixels_preserved_where_unauthorized !== true) {
    errors.push({
      code: "provenance",
      message:
        "original_pixels_preserved_where_unauthorized must be true (Lane D acceptance bit)",
    });
  }

  if (typeof rec.eval_verdict !== "string" || !VERDICT_SET.has(rec.eval_verdict)) {
    errors.push({
      code: "provenance",
      message: 'eval_verdict must be "PASS" | "FAIL" | "unscored"',
    });
  }

  if (!Array.isArray(rec.not_claimed) || rec.not_claimed.some((x) => typeof x !== "string")) {
    errors.push({ code: "provenance", message: "not_claimed must be an array of strings" });
  }

  const master = asRecord(rec.master);
  if (!master) {
    errors.push({ code: "encode", message: "master must be an object" });
  } else {
    if (master.mime !== "video/mp4") {
      errors.push({ code: "encode", message: 'master.mime must be "video/mp4"' });
    }
    const encoded = rec.encode_status === "encoded";
    if (encoded) {
      if (typeof master.relpath !== "string" || master.relpath === "") {
        errors.push({
          code: "encode",
          message: 'master.relpath is required when encode_status is "encoded"',
        });
      }
    } else if (master.relpath != null) {
      errors.push({
        code: "encode",
        message: "master.relpath must be null until Lane H encodes (do not invent an MP4 path)",
      });
    }
  }

  const finishing = asRecord(rec.finishing);
  if (!finishing) {
    errors.push({ code: "finishing", message: "finishing must be an object" });
  } else {
    if (typeof finishing.host !== "string" || !HOST_SET.has(finishing.host)) {
      errors.push({
        code: "finishing",
        message: 'finishing.host must be "premiere" | "resolve" | "ame_local" | "human"',
      });
    }
    if (finishing.import_mode !== "single_clip") {
      errors.push({
        code: "finishing",
        message: 'finishing.import_mode must be "single_clip" (no recut / no FCPXML rebuild of the master)',
      });
    }
    if (finishing.recut !== false) {
      errors.push({ code: "finishing", message: "finishing.recut must be false" });
    }
    if (finishing.regenerate !== false) {
      errors.push({
        code: "finishing",
        message: "finishing.regenerate must be false (no garment / identity restyle)",
      });
    }
  }

  return { ok: errors.length === 0, errors };
}

/** True only when the sidecar illegally claims finishing should gate E2E. */
export function handoffBlocksE2e(input: unknown): boolean {
  const rec = asRecord(input);
  return rec?.blocks_e2e === true;
}

/**
 * A finishing recipe may optionally consume a handoff. It must stay UXP-only,
 * $0, and (when the master is not encoded) must not queue AME of that master.
 *
 * Premiere requires a recipe whose `project_id` matches the sidecar (swap
 * identity fields for a second project — do not add clip-specific F2 code).
 * Resolve / AME / human use the same folder layout with **no** UXP recipe.
 */
export function finishingRecipeCompatibleWithHandoff(
  recipe: unknown,
  handoff: unknown,
): FinishingHandoffValidation {
  const errors: FinishingHandoffIssue[] = [];
  const handoffResult = validateReconstructedMasterHandoff(handoff);
  if (!handoffResult.ok) {
    return {
      ok: false,
      errors: handoffResult.errors.map((e) => ({
        ...e,
        message: `handoff: ${e.message}`,
      })),
    };
  }

  const handoffRec = asRecord(handoff);
  const encodeStatus = handoffRec?.encode_status;
  const finishing = asRecord(handoffRec?.finishing);
  const host = finishing?.host;

  if (host !== "premiere") {
    if (recipe != null) {
      errors.push({
        code: "recipe",
        message: `finishing.host "${String(host)}" imports reconstructed_master/ as a folder; do not attach a Premiere UXP recipe (no clip-specific F2 code)`,
      });
    }
    return { ok: errors.length === 0, errors };
  }

  const recipeResult = validateFinishingRecipe(recipe);
  if (!recipeResult.ok) {
    for (const e of recipeResult.errors) {
      errors.push({ code: "recipe", message: `recipe: ${e.message}` });
    }
  }

  const rec = asRecord(recipe);
  const actions = rec && Array.isArray(rec.actions) ? rec.actions : [];

  if (rec?.host !== "premiere") {
    errors.push({
      code: "recipe",
      message: 'handoff finishing.host is "premiere" but recipe.host is not',
    });
  }

  if (typeof rec?.project_id === "string" && rec.project_id !== handoffRec?.project_id) {
    errors.push({
      code: "recipe",
      message:
        "recipe.project_id must match handoff.project_id (bind identity fields; do not fork F2 per clip)",
    });
  }

  let importedReconstructed = false;
  for (const [index, raw] of actions.entries()) {
    const action = asRecord(raw);
    if (!action) continue;
    if (action.op === "import_media_folder" && typeof action.path === "string") {
      if (action.path.includes("reconstructed_master")) importedReconstructed = true;
    }
    if (action.op === "queue_ame_export" && encodeStatus !== "encoded") {
      errors.push({
        code: "encode",
        message: `actions[${index}] queue_ame_export is forbidden while encode_status is "${String(encodeStatus)}" (Lane H has not encoded the master)`,
      });
    }
  }

  if (!importedReconstructed) {
    errors.push({
      code: "recipe",
      message:
        'premiere recipe must include import_media_folder whose path contains "reconstructed_master"',
    });
  }

  return { ok: errors.length === 0, errors };
}

export type ReconstructedMasterHandoffOverrides = {
  encode_status?: HandoffEncodeStatus;
  reconstruct_adapter_version?: string;
  reconstruct_e2e_version?: string;
  frame_count?: number;
  temporal_job_count?: number;
  eval_verdict?: HandoffEvalVerdict;
  eval_spec_version?: string;
  not_claimed?: string[];
  master?: ReconstructedMasterHandoff["master"];
  finishing?: Partial<ReconstructedMasterHandoff["finishing"]>;
};

/**
 * Build a valid $0 sidecar for **any** identity. Locks (paid/Astra/E2E) cannot
 * be overridden. Callers pass a second project's UUIDs — no F2 code change.
 */
export function createReconstructedMasterHandoff(
  identity: FinishingHandoffIdentity,
  overrides?: ReconstructedMasterHandoffOverrides,
): ReconstructedMasterHandoff {
  const host = overrides?.finishing?.host ?? "premiere";
  return {
    schema_version: FINISHING_HANDOFF_SCHEMA_VERSION,
    kind: FINISHING_HANDOFF_KIND,
    source: "lane_h",
    consumer: "lane_f2",
    paid_calls: false,
    astra_required: false,
    blocks_e2e: false,
    grok_per_frame: false,
    sam3_live_fetch: false,
    encode_status: overrides?.encode_status ?? "not_claimed",
    ...identity,
    reconstruct_adapter_version: overrides?.reconstruct_adapter_version ?? "1.0.0",
    reconstruct_e2e_version: overrides?.reconstruct_e2e_version ?? "1.0.0",
    frame_count: overrides?.frame_count ?? 0,
    temporal_job_count: overrides?.temporal_job_count ?? 0,
    original_pixels_preserved_where_unauthorized: true,
    eval_verdict: overrides?.eval_verdict ?? "unscored",
    eval_spec_version: overrides?.eval_spec_version,
    not_claimed: overrides?.not_claimed ?? ["MP4 encode of this master clip"],
    master: overrides?.master ?? { relpath: null, mime: "video/mp4" },
    finishing: {
      host,
      import_mode: "single_clip",
      recut: false,
      regenerate: false,
      recipe_relpath: overrides?.finishing?.recipe_relpath,
    },
  };
}

/** T7 jail path for a project. Same helper for demo and second clip. */
export function finishingWorkspaceRootForProject(projectId: string): string | null {
  if (!isFinishingIdentityId(projectId)) return null;
  const root = `${FINISHING_T7_PROJECT_ROOT_PREFIX}/${projectId}`;
  return workspacePathAllowed(root) ? root : null;
}

/**
 * Swap recipe identity onto a handoff's project. One helper for every clip —
 * do not add per-clip TypeScript in this lane.
 */
export function bindRecipeToHandoffIdentity(
  recipe: unknown,
  identity: FinishingHandoffIdentity,
): unknown {
  const rec = asRecord(recipe);
  if (!rec) return recipe;
  const workspace_root = finishingWorkspaceRootForProject(identity.project_id);
  return {
    ...rec,
    project_id: identity.project_id,
    ...(workspace_root ? { workspace_root } : {}),
  };
}
