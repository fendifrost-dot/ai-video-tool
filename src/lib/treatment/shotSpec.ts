/**
 * Shot Specification — the generalized contract for a single shot.
 *
 * A Shot Spec is simultaneously:
 *   • human-readable — every creative field renders onto a treatment card, and
 *   • machine-executable — every production field feeds the render / generation
 *     pipeline and QA gates.
 *
 * Design rules (see docs/ux/SHOT_SPECIFICATION.md):
 *   1. NOTHING project-specific is baked into the schema. There are no YSL,
 *      wardrobe-brand, or artist fields. A "look" is a free string + references;
 *      a project's creative brief lives on the project, not in this contract.
 *   2. Every enum that also exists in the `shots` DB table uses the SAME literal
 *      set so the mappers below are lossless for those fields.
 *   3. Everything is optional except identity + timeline + purpose, so a spec
 *      can start as a rough treatment beat and accrete production detail.
 *   4. Validation mirrors the repo's Zod style (see other lib schemas). Parsing
 *      applies safe defaults rather than dropping data.
 *
 * This module owns TypeScript types (via z.infer) AND runtime validation.
 */

import { z } from "zod";
import type { Shot } from "@/integrations/supabase/aliases";

// ============================================================================
// Enum literals — kept in sync with src/integrations/supabase/types.ts so the
// row mappers do not silently coerce. Duplicated intentionally: the DB enums
// are generated and we must not import runtime values from a .d-style file.
// ============================================================================

/** How a shot's pixels are sourced. Orthogonal to what it depicts. */
export const SHOT_KINDS = ["performance", "broll", "generated"] as const;
export type ShotKind = (typeof SHOT_KINDS)[number];

/**
 * Editorial classification — mirrors DB enum `shot_type`. `kind` describes
 * sourcing; `shotType` describes editorial role. Both are useful and neither
 * fully implies the other.
 */
export const SHOT_TYPES = [
  "performance",
  "b_roll",
  "narrative",
  "vfx",
  "transition",
  "lyric_visual",
] as const;
export type ShotTypeLiteral = (typeof SHOT_TYPES)[number];

/** Mirrors DB enum `shot_status`, plus `draft` for pre-planning treatment beats. */
export const SHOT_STATUSES = [
  "draft",
  "planned",
  "generated",
  "approved",
  "rejected",
  "needs_regen",
] as const;
export type ShotStatusLiteral = (typeof SHOT_STATUSES)[number];

/** Mirrors DB enum `shot_transition_type`. */
export const TRANSITION_TYPES = [
  "cut",
  "crossfade",
  "fade_black",
  "fade_white",
  "whip_pan",
  "glitch",
  "flash",
] as const;
export type TransitionType = (typeof TRANSITION_TYPES)[number];

/** Mirrors DB enum `provider_name` — the tool/engine that renders the shot. */
export const RENDER_ENGINES = [
  "runway",
  "veo",
  "gemini",
  "grok",
  "higgsfield",
  "pika",
  "fal",
  "openai",
  "firefly",
  "frame_io",
  "manual",
  "other",
] as const;
export type RenderEngine = (typeof RENDER_ENGINES)[number];

/** Mirrors DB enum `shot_priority`. */
export const SHOT_PRIORITIES = ["low", "normal", "high", "hero"] as const;
export type ShotPriorityLiteral = (typeof SHOT_PRIORITIES)[number];

// --- Vocabularies with no DB column (live only inside the spec JSON) ---------

export const FRAMINGS = [
  "extreme_wide",
  "wide",
  "medium_wide",
  "medium",
  "medium_close",
  "close_up",
  "extreme_close_up",
  "insert",
] as const;
export type Framing = (typeof FRAMINGS)[number];

export const CAMERA_ANGLES = [
  "eye_level",
  "high",
  "low",
  "birds_eye",
  "worms_eye",
  "dutch",
  "over_shoulder",
  "pov",
] as const;
export type CameraAngle = (typeof CAMERA_ANGLES)[number];

export const CAMERA_MOTIONS = [
  "static",
  "pan",
  "tilt",
  "dolly",
  "truck",
  "pedestal",
  "handheld",
  "steadicam",
  "gimbal",
  "crane",
  "jib",
  "zoom",
  "orbit",
  "whip_pan",
  "drone",
] as const;
export type CameraMotion = (typeof CAMERA_MOTIONS)[number];

export const REFERENCE_KINDS = ["image", "video", "url", "frame", "asset", "note"] as const;
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

export const PROVENANCE_SOURCES = ["human", "ai", "import", "derived"] as const;
export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number];

// ============================================================================
// Leaf schemas
// ============================================================================

/** A half-open time range in seconds on some timeline (final edit or source). */
export const TimeRangeSchema = z
  .object({
    start: z.number().min(0),
    end: z.number().min(0),
  })
  .refine((r) => r.end >= r.start, { message: "end must be >= start" });
export type TimeRange = z.infer<typeof TimeRangeSchema>;

export const ReferenceSchema = z.object({
  kind: z.enum(REFERENCE_KINDS).default("note"),
  /** URI / storage path / external link. Null for pure notes. */
  uri: z.string().nullable().default(null),
  /** Stable asset id when the reference points at a managed asset. */
  assetId: z.string().nullable().default(null),
  note: z.string().default(""),
});
export type Reference = z.infer<typeof ReferenceSchema>;

/**
 * Where a shot's footage comes from when it is NOT freshly generated.
 * `kind: "generated"` means the pixels are authored by the generation block
 * below and there is no captured/stock source.
 */
export const SourceMediaSchema = z.object({
  kind: z.enum(["captured", "stock", "generated", "none"]).default("none"),
  /** Managed asset id, if the source is a tracked asset. */
  mediaId: z.string().nullable().default(null),
  uri: z.string().nullable().default(null),
  /** In/out point within the source media (seconds). */
  range: TimeRangeSchema.nullable().default(null),
  note: z.string().default(""),
});
export type SourceMedia = z.infer<typeof SourceMediaSchema>;

/** Wardrobe / styling. Generalized: a look is a name + description + refs. */
export const LookSchema = z.object({
  /** Free-form look name, e.g. "Look A / opening". Never a hardcoded brand. */
  name: z.string().default(""),
  description: z.string().default(""),
  /** Optional pointer to a managed look/wardrobe asset (e.g. artist_looks.id). */
  lookId: z.string().nullable().default(null),
  references: z.array(ReferenceSchema).default([]),
});
export type Look = z.infer<typeof LookSchema>;

export const EnvironmentSchema = z.object({
  description: z.string().default(""),
  location: z.string().default(""),
  timeOfDay: z.string().default(""),
  references: z.array(ReferenceSchema).default([]),
});
export type Environment = z.infer<typeof EnvironmentSchema>;

export const LensSchema = z.object({
  focalLengthMm: z.number().positive().nullable().default(null),
  aperture: z.string().default(""),
  description: z.string().default(""),
});
export type Lens = z.infer<typeof LensSchema>;

export const CameraMotionSchema = z.object({
  type: z.enum(CAMERA_MOTIONS).default("static"),
  description: z.string().default(""),
});
export type CameraMotionSpec = z.infer<typeof CameraMotionSchema>;

export const LightingSchema = z.object({
  style: z.string().default(""),
  description: z.string().default(""),
  references: z.array(ReferenceSchema).default([]),
});
export type Lighting = z.infer<typeof LightingSchema>;

export const FxSchema = z.object({
  type: z.string(),
  description: z.string().default(""),
  /** 0-1 relative strength, when meaningful. */
  intensity: z.number().min(0).max(1).nullable().default(null),
});
export type Fx = z.infer<typeof FxSchema>;

export const TransitionSchema = z.object({
  type: z.enum(TRANSITION_TYPES).default("cut"),
  durationSeconds: z.number().min(0).nullable().default(null),
});
export type Transition = z.infer<typeof TransitionSchema>;

export const PrevisSchema = z.object({
  status: z.enum(["none", "sketch", "rendered", "approved"]).default("none"),
  uri: z.string().nullable().default(null),
  notes: z.string().default(""),
});
export type Previs = z.infer<typeof PrevisSchema>;

/**
 * Generation requirements — what a generative engine needs to author this shot.
 * `required: false` means the shot is captured/stock and does not need genAI.
 */
export const GenerationRequirementsSchema = z.object({
  required: z.boolean().default(false),
  engine: z.enum(RENDER_ENGINES).nullable().default(null),
  model: z.string().default(""),
  prompt: z.string().default(""),
  negativePrompt: z.string().default(""),
  seed: z.number().int().nullable().default(null),
  /** Free-form extra requirements (fps, resolution, keyframe cadence, …). */
  parameters: z.record(z.string(), z.unknown()).default({}),
  notes: z.string().default(""),
});
export type GenerationRequirements = z.infer<typeof GenerationRequirementsSchema>;

/**
 * Reconstruction requirements — preservation/compositing constraints, e.g. the
 * locked keyframe + propagation path (see docs/VIDEO_SWAP_ARCHITECTURE.md).
 * Reproducibility metadata belongs here so a shot can be rebuilt deterministically.
 */
export const ReconstructionRequirementsSchema = z.object({
  required: z.boolean().default(false),
  /** e.g. "keyframe_propagation" | "masked_composite" | "faceswap" | custom. */
  mode: z.string().default(""),
  maskVersion: z.string().nullable().default(null),
  /** Hash/version of the reference asset used, for provenance. */
  referenceAssetHash: z.string().nullable().default(null),
  /** Preserve identity/scene/logo regions — pins from the locked swap arch. */
  preserve: z.array(z.string()).default([]),
  notes: z.string().default(""),
});
export type ReconstructionRequirements = z.infer<typeof ReconstructionRequirementsSchema>;

/** A single QA gate the finished shot must satisfy. */
export const QaRequirementSchema = z.object({
  check: z.string(),
  mustPass: z.boolean().default(true),
  notes: z.string().default(""),
});
export type QaRequirement = z.infer<typeof QaRequirementSchema>;

export const ProvenanceSchema = z.object({
  source: z.enum(PROVENANCE_SOURCES).default("human"),
  createdAt: z.string().default(""),
  updatedAt: z.string().nullable().default(null),
  author: z.string().nullable().default(null),
  /** Model id when source is "ai" / "derived". */
  model: z.string().nullable().default(null),
  notes: z.string().default(""),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

// ============================================================================
// Top-level Shot Spec
// ============================================================================

export const SHOT_SPEC_VERSION = 1 as const;

export const ShotSpecSchema = z.object({
  version: z.literal(SHOT_SPEC_VERSION).default(SHOT_SPEC_VERSION),

  // --- identity -------------------------------------------------------------
  /** Stable machine id (uuid or grid key). Required. */
  id: z.string().min(1),
  /** Optional short human label, e.g. "Rooftop wide". */
  title: z.string().default(""),
  /** Ordinal on the timeline; null until sequenced. */
  order: z.number().int().nullable().default(null),

  // --- intent + classification ---------------------------------------------
  /** One-line human purpose — why this shot exists. Required. */
  purpose: z.string().min(1),
  kind: z.enum(SHOT_KINDS).default("performance"),
  shotType: z.enum(SHOT_TYPES).default("performance"),
  priority: z.enum(SHOT_PRIORITIES).default("normal"),

  // --- timing + source ------------------------------------------------------
  /** Range on the FINAL edit timeline (seconds). */
  timeline: TimeRangeSchema,
  source: SourceMediaSchema.default({}),

  // --- creative -------------------------------------------------------------
  wardrobe: LookSchema.default({}),
  environment: EnvironmentSchema.default({}),
  framing: z.enum(FRAMINGS).nullable().default(null),
  cameraAngle: z.enum(CAMERA_ANGLES).nullable().default(null),
  lens: LensSchema.default({}),
  cameraMotion: CameraMotionSchema.default({}),
  lighting: LightingSchema.default({}),
  performanceDirection: z.string().default(""),
  fx: z.array(FxSchema).default([]),
  transitionIn: TransitionSchema.default({}),
  transitionOut: TransitionSchema.default({}),
  references: z.array(ReferenceSchema).default([]),
  previs: PrevisSchema.default({}),

  // --- production requirements ---------------------------------------------
  generation: GenerationRequirementsSchema.default({}),
  reconstruction: ReconstructionRequirementsSchema.default({}),
  qa: z.array(QaRequirementSchema).default([]),

  // --- lifecycle ------------------------------------------------------------
  status: z.enum(SHOT_STATUSES).default("draft"),
  provenance: ProvenanceSchema.default({}),
});
export type ShotSpec = z.infer<typeof ShotSpecSchema>;

/** Parsed input type — everything except id/purpose/timeline may be omitted. */
export type ShotSpecInput = z.input<typeof ShotSpecSchema>;

// ============================================================================
// Validation / (de)serialization
// ============================================================================

/** Strict parse — throws (ZodError) on invalid input. */
export function parseShotSpec(value: unknown): ShotSpec {
  return ShotSpecSchema.parse(value);
}

/** Safe parse — returns null instead of throwing. Use for untrusted JSON. */
export function safeParseShotSpec(value: unknown): ShotSpec | null {
  const r = ShotSpecSchema.safeParse(value);
  return r.success ? r.data : null;
}

/** Canonical serialization: parse (to apply defaults) then stringify. */
export function serializeShotSpec(spec: ShotSpecInput): string {
  return JSON.stringify(parseShotSpec(spec));
}

/** Round-trip helper: parse a JSON string into a validated ShotSpec. */
export function deserializeShotSpec(json: string): ShotSpec {
  return parseShotSpec(JSON.parse(json));
}

// ============================================================================
// Mappers: ShotSpec ↔ `shots` table row
//
// The `shots` table predates this contract and is far narrower. These mappers
// are the documented, lossy bridge. Fields with no column round-trip through
// the treatment_json Shot Spec, NOT the row. Gaps are listed in
// docs/ux/SHOT_SPECIFICATION.md § "Row mapping gaps" and mirrored here.
// ============================================================================

/** Fields on a ShotSpec that have NO home in the `shots` row (lossy on export). */
export const ROW_UNMAPPED_FIELDS = [
  "framing",
  "cameraAngle",
  "lens",
  "fx",
  "references",
  "previs",
  "generation",
  "reconstruction",
  "qa",
  "source.range (partially → trim_in/out)",
  "wardrobe.references / environment.references / lighting.references",
] as const;

const SPEC_STATUS_TO_ROW: Record<ShotStatusLiteral, Shot["status"]> = {
  draft: "planned",
  planned: "planned",
  generated: "generated",
  approved: "approved",
  rejected: "rejected",
  needs_regen: "needs_regen",
};

const ROW_STATUS_TO_SPEC: Record<string, ShotStatusLiteral> = {
  planned: "planned",
  generated: "generated",
  approved: "approved",
  rejected: "rejected",
  needs_regen: "needs_regen",
};

/** `kind` describes sourcing; the row's `shot_type` is editorial. We prefer the
 * spec's explicit `shotType`, falling back to a mapping from `kind`. */
const KIND_TO_SHOT_TYPE: Record<ShotKind, ShotTypeLiteral> = {
  performance: "performance",
  broll: "b_roll",
  generated: "vfx",
};

function joinNonEmpty(parts: Array<string | null | undefined>, sep = " · "): string {
  return parts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(sep);
}

/**
 * ShotSpec → partial `shots` row (Update/Insert shape). Only the columns this
 * contract can populate are returned; callers merge with project_id/user_id/
 * shot_number. Creative fields with no column are folded into `camera_direction`
 * and `notes` so nothing silently vanishes on export.
 */
export function shotSpecToShotRow(spec: ShotSpec): Partial<Shot> {
  const duration =
    spec.timeline.end > spec.timeline.start
      ? Math.round((spec.timeline.end - spec.timeline.start) * 100) / 100
      : null;

  // Fold camera framing/angle/lens (no columns) into the free-text direction.
  const cameraDirection = joinNonEmpty([
    spec.cameraMotion.type !== "static" ? spec.cameraMotion.type : "",
    spec.cameraMotion.description,
    spec.framing ? `framing:${spec.framing}` : "",
    spec.cameraAngle ? `angle:${spec.cameraAngle}` : "",
    spec.lens.description,
  ]);

  const engine = spec.generation.engine;
  const recommendedTool: Shot["recommended_tool"] =
    spec.generation.required && engine ? engine : null;

  return {
    scene_description: spec.purpose || null,
    shot_type: spec.shotType ?? KIND_TO_SHOT_TYPE[spec.kind],
    priority: spec.priority,
    status: SPEC_STATUS_TO_ROW[spec.status],
    timestamp_start: spec.timeline.start,
    timestamp_end: spec.timeline.end,
    duration_seconds: duration,
    trim_in_seconds: spec.source.range?.start ?? null,
    trim_out_seconds: spec.source.range?.end ?? null,
    wardrobe: joinNonEmpty([spec.wardrobe.name, spec.wardrobe.description], " — ") || null,
    environment:
      joinNonEmpty([
        spec.environment.description,
        spec.environment.location,
        spec.environment.timeOfDay,
      ]) || null,
    lighting: joinNonEmpty([spec.lighting.style, spec.lighting.description], " — ") || null,
    camera_direction: cameraDirection || null,
    recommended_tool: recommendedTool,
    locked_look_id: spec.wardrobe.lookId ?? null,
    notes: joinNonEmpty([spec.performanceDirection, spec.title], "\n") || null,
    transition_in_type: spec.transitionIn.type,
    transition_out_type: spec.transitionOut.type,
    transition_duration:
      spec.transitionOut.durationSeconds ?? spec.transitionIn.durationSeconds ?? null,
  };
}

/**
 * `shots` row → ShotSpec. Best-effort: columns absent from the contract map to
 * defaults; the row cannot carry fx/refs/generation/etc., so those come back
 * empty. `id` uses the row id, `purpose` uses scene_description (or a placeholder
 * so the result still validates).
 */
export function shotRowToShotSpec(row: Partial<Shot> & { id: string }): ShotSpec {
  const start = row.timestamp_start ?? 0;
  const end =
    row.timestamp_end ?? (row.duration_seconds != null ? start + row.duration_seconds : start);

  const shotType: ShotTypeLiteral = SHOT_TYPES.includes(row.shot_type as ShotTypeLiteral)
    ? (row.shot_type as ShotTypeLiteral)
    : "performance";

  const kind: ShotKind =
    shotType === "performance" ? "performance" : shotType === "b_roll" ? "broll" : "generated";

  const input: ShotSpecInput = {
    id: row.id,
    title: "",
    purpose: (row.scene_description ?? "").trim() || "(imported shot — no description)",
    kind,
    shotType,
    priority: SHOT_PRIORITIES.includes(row.priority as ShotPriorityLiteral)
      ? (row.priority as ShotPriorityLiteral)
      : "normal",
    timeline: { start, end: Math.max(start, end) },
    source: {
      kind: "captured",
      range:
        row.trim_in_seconds != null || row.trim_out_seconds != null
          ? { start: row.trim_in_seconds ?? 0, end: row.trim_out_seconds ?? Math.max(start, end) }
          : null,
    },
    wardrobe: { description: row.wardrobe ?? "", lookId: row.locked_look_id ?? null },
    environment: { description: row.environment ?? "" },
    lighting: { description: row.lighting ?? "" },
    cameraMotion: { description: row.camera_direction ?? "" },
    performanceDirection: row.notes ?? "",
    transitionIn: {
      type: TRANSITION_TYPES.includes(row.transition_in_type as TransitionType)
        ? (row.transition_in_type as TransitionType)
        : "cut",
    },
    transitionOut: {
      type: TRANSITION_TYPES.includes(row.transition_out_type as TransitionType)
        ? (row.transition_out_type as TransitionType)
        : "cut",
      durationSeconds: row.transition_duration ?? null,
    },
    generation: {
      required: !!row.recommended_tool && row.recommended_tool !== "manual",
      engine: RENDER_ENGINES.includes(row.recommended_tool as RenderEngine)
        ? (row.recommended_tool as RenderEngine)
        : null,
    },
    status: ROW_STATUS_TO_SPEC[row.status ?? "planned"] ?? "planned",
    provenance: {
      source: "import",
      createdAt: row.created_at ?? "",
      updatedAt: row.updated_at ?? null,
    },
  };

  return parseShotSpec(input);
}
