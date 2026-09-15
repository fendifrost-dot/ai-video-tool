/**
 * Lane F — finishing recipe contract.
 * Pure validation only. No Premiere I/O, no computer-use, no network.
 * See docs/research/finishing/.
 */

export const FINISHING_RECIPE_SCHEMA_VERSION = 1 as const;

export const FINISHING_HOSTS = ["premiere"] as const;
export type FinishingHost = (typeof FINISHING_HOSTS)[number];

export const UXP_FINISHING_OPS = [
  "import_fcpxml",
  "import_media_folder",
  "create_bins",
  "add_markers_from_beats",
  "apply_lut",
  "queue_ame_export",
  "write_sidecar",
] as const;

export const ASTRA_FINISHING_OPS = [
  "capture_screenshot",
  "astra_visual_adjust",
] as const;

export const FINISHING_OPS = [...UXP_FINISHING_OPS, ...ASTRA_FINISHING_OPS] as const;

export type UxpFinishingOp = (typeof UXP_FINISHING_OPS)[number];
export type AstraFinishingOp = (typeof ASTRA_FINISHING_OPS)[number];
export type FinishingOp = (typeof FINISHING_OPS)[number];
export type FinishingRunner = "uxp" | "astra";

export type FinishingSpend = {
  astra_allowed: boolean;
  max_usd: number;
};

export type FinishingAction = {
  op: string;
  runner: string;
  path?: string;
  preset_path?: string;
  output_path?: string;
};

export type FinishingRecipe = {
  schema_version: number;
  host: string;
  project_id: string;
  operator: string;
  workspace_root: string;
  export_package_relpath: string;
  spend: FinishingSpend;
  actions: FinishingAction[];
};

export type FinishingRecipeIssue = {
  code:
    | "schema"
    | "host"
    | "workspace"
    | "op"
    | "runner"
    | "spend"
    | "empty";
  message: string;
};

export type FinishingRecipeValidation = {
  ok: boolean;
  errors: FinishingRecipeIssue[];
};

const JAIL_REJECT_SUBSTRINGS = [
  "Library/Mobile Documents",
  "com~apple~CloudDocs",
  "architecture-c",
  "architecture_c",
  "architecturec",
  "ArchitectureC",
  "MODEST Member Only",
  "FENDI FILES",
];

const UXP_OP_SET = new Set<string>(UXP_FINISHING_OPS);
const ASTRA_OP_SET = new Set<string>(ASTRA_FINISHING_OPS);
const ALL_OP_SET = new Set<string>(FINISHING_OPS);

export function isUxpFinishingOp(op: string): op is UxpFinishingOp {
  return UXP_OP_SET.has(op);
}

export function isAstraFinishingOp(op: string): op is AstraFinishingOp {
  return ASTRA_OP_SET.has(op);
}

export function workspacePathAllowed(workspaceRoot: string): boolean {
  if (!workspaceRoot || workspaceRoot.trim() !== workspaceRoot) return false;
  if (!workspaceRoot.startsWith("/")) return false;
  if (workspaceRoot === "/" || workspaceRoot === "/Users" || workspaceRoot === "/home") {
    return false;
  }
  const lower = workspaceRoot.toLowerCase();
  for (const needle of JAIL_REJECT_SUBSTRINGS) {
    if (workspaceRoot.includes(needle) || lower.includes(needle.toLowerCase())) {
      return false;
    }
  }
  return true;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Validate a finishing recipe. Accepts unknown JSON so a future UXP panel
 * or docs fixture can share one gate.
 */
export function validateFinishingRecipe(input: unknown): FinishingRecipeValidation {
  const errors: FinishingRecipeIssue[] = [];
  const rec = asRecord(input);
  if (!rec) {
    return {
      ok: false,
      errors: [{ code: "schema", message: "Recipe must be an object" }],
    };
  }

  if (rec.schema_version !== FINISHING_RECIPE_SCHEMA_VERSION) {
    errors.push({
      code: "schema",
      message: `schema_version must be ${FINISHING_RECIPE_SCHEMA_VERSION}`,
    });
  }

  if (rec.host !== "premiere") {
    errors.push({
      code: "host",
      message: 'host must be "premiere" (after_effects is out of v1)',
    });
  }

  for (const key of ["project_id", "operator", "export_package_relpath"] as const) {
    if (typeof rec[key] !== "string" || rec[key] === "") {
      errors.push({ code: "schema", message: `${key} must be a non-empty string` });
    }
  }

  if (typeof rec.workspace_root !== "string" || !workspacePathAllowed(rec.workspace_root)) {
    errors.push({
      code: "workspace",
      message:
        "workspace_root must be an absolute jail path (T7 or named sandbox); iCloud / Architecture C / MODEST / FENDI FILES rejected",
    });
  }

  const spend = asRecord(rec.spend);
  if (!spend || typeof spend.astra_allowed !== "boolean" || typeof spend.max_usd !== "number") {
    errors.push({
      code: "spend",
      message: "spend.astra_allowed (boolean) and spend.max_usd (number) are required",
    });
  } else {
    if (spend.max_usd < 0) {
      errors.push({ code: "spend", message: "spend.max_usd must be >= 0" });
    }
    if (spend.astra_allowed === true || spend.max_usd > 0) {
      errors.push({
        code: "spend",
        message:
          "Astra / paid spend is disabled until a RED item is approved (see docs/research/finishing/RED_ITEMS.md)",
      });
    }
  }

  if (!Array.isArray(rec.actions) || rec.actions.length === 0) {
    errors.push({ code: "empty", message: "actions must be a non-empty array" });
    return { ok: false, errors };
  }

  if (rec.actions.length > 12) {
    errors.push({ code: "op", message: "actions exceed max_actions (12)" });
  }

  for (const [index, raw] of rec.actions.entries()) {
    const action = asRecord(raw);
    if (!action) {
      errors.push({ code: "op", message: `actions[${index}] must be an object` });
      continue;
    }
    const op = action.op;
    const runner = action.runner;
    if (typeof op !== "string" || !ALL_OP_SET.has(op)) {
      errors.push({
        code: "op",
        message: `actions[${index}].op "${String(op)}" is not on the v1 allowlist`,
      });
      continue;
    }
    if (isUxpFinishingOp(op)) {
      if (runner !== "uxp") {
        errors.push({
          code: "runner",
          message: `actions[${index}] ${op} must use runner "uxp" (Astra must not click UXP-capable ops)`,
        });
      }
    } else if (isAstraFinishingOp(op)) {
      errors.push({
        code: "spend",
        message: `actions[${index}] ${op} is an Astra op; Astra runner is disabled until RED approval`,
      });
    }
  }

  return { ok: errors.length === 0, errors };
}
