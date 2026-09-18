/**
 * Lane F — Treatment → Product OS bridge.
 *
 * Translates an APPROVED Shot Specification (`src/lib/treatment/shotSpec.ts`)
 * into Product OS job-graph inputs and, on request, a live `PipelineRun`.
 *
 * This module is a *translation layer*. It mirrors the `catalog.ts` pattern
 * (`bindCatalog` → `CreatePipelineRunInput` → `createBoundPipelineRun`): the
 * orchestrator stays clip-agnostic; a shot binds to the graph purely by
 * ArtifactKind + reproducibility metadata.
 *
 * Hard boundaries (see CLAUDE.md / MASTER):
 *   • CALLS Product OS (`createPipelineRun`, which wires `createProductOsAdapters`).
 *     Never rewrites Architecture C chest/sleeve/temporal/reconstruction engines.
 *   • NEVER runs paid generation. A shot that requires generation but has no
 *     existing asset is dispatched as-is and flagged `awaitingGeneration`; the
 *     import-only generation stage pauses until another lane supplies the clip.
 *   • NEVER auto-sets RED/YELLOW review gates
 *     (`masterCompositeAuthorized`, `exportApproved`, unqualified
 *     `stillRepairApproved`). Only product-safe auto-reviews from
 *     `autoReviews.ts` fire automatically; human decisions arrive via
 *     `opts.reviews`.
 *
 * Granularity: one Shot = one clip = one `PipelineRun`. A treatment (many
 * approved shots) therefore maps to many run inputs — the "job graph".
 */

import type { ShotSpec, ShotStatusLiteral } from "@/lib/treatment/shotSpec";
import { productSafeAutoReviews } from "./autoReviews";
import { createPipelineRun, type CreatePipelineRunInput } from "./orchestrator";
import type { ArtifactKind, PipelineClock, PipelineRun, SeedArtifact } from "./types";

export const TREATMENT_BRIDGE_VERSION = "1.0.0" as const;

/**
 * Shot statuses that make a shot eligible to dispatch to Product OS. Default is
 * strictly `approved` — the sprint contract is "APPROVED Treatment / Shot Specs".
 * Overridable per call for previz / dry-run flows.
 */
export const PRODUCTION_ELIGIBLE_STATUSES = ["approved"] as const satisfies readonly ShotStatusLiteral[];

/** Why a shot was skipped or flagged. */
export type ShotBridgeReason =
  | "not_eligible_status"
  | "missing_source"
  | "awaiting_generation";

export type SkippedShot = {
  shotId: string;
  status: ShotStatusLiteral;
  reason: ShotBridgeReason;
  message: string;
};

export type ShotBridgeWarning = {
  shotId: string;
  code: ShotBridgeReason;
  message: string;
};

/** A shot successfully translated into seed artifacts + a run input. */
export type BridgedShot = {
  shotId: string;
  title: string;
  order: number | null;
  seedArtifacts: SeedArtifact[];
  reproducibility: Record<string, unknown>;
  /** Generation is required but no existing generation asset was referenced. */
  awaitingGeneration: boolean;
  runInput: CreatePipelineRunInput;
};

export type TreatmentBridgeOptions = {
  /** Which shot statuses count as production-ready. Defaults to `["approved"]`. */
  eligibleStatuses?: readonly ShotStatusLiteral[];
  /**
   * Explicit human review decisions to merge into every run input. The bridge
   * itself never sets RED/YELLOW gates — those only arrive here.
   */
  reviews?: Record<string, boolean>;
  /** Optional catalog id to stamp on the run inputs (provenance only). */
  catalogId?: string;
};

export type TreatmentBridgeResult = {
  version: typeof TREATMENT_BRIDGE_VERSION;
  projectId: string;
  /** One input per eligible shot, ordered by `order` then timeline start. */
  runInputs: CreatePipelineRunInput[];
  bridged: BridgedShot[];
  skipped: SkippedShot[];
  warnings: ShotBridgeWarning[];
  paidCalls: false;
};

// ============================================================================
// Eligibility
// ============================================================================

/** True when a shot's status qualifies it for Product OS dispatch. */
export function isProductionEligible(
  spec: ShotSpec,
  eligibleStatuses: readonly ShotStatusLiteral[] = PRODUCTION_ELIGIBLE_STATUSES,
): boolean {
  return eligibleStatuses.includes(spec.status);
}

// ============================================================================
// Reproducibility metadata
//
// Maps the ShotSpec generation + reconstruction blocks onto the reproducibility
// fields the locked video-swap architecture requires (model / version / prompt /
// reference-asset hash / mask version / seed / transfer mode). Product OS records
// this opaquely as provenance; it does not interpret or execute it.
// ============================================================================

export function shotReproducibility(spec: ShotSpec): Record<string, unknown> {
  const g = spec.generation;
  const r = spec.reconstruction;
  return {
    shotSpecVersion: spec.version,
    shotId: spec.id,
    // generation requirement (import-only — never executed by this lane)
    generationRequired: g.required,
    engine: g.engine,
    model: g.model || null,
    prompt: g.prompt || null,
    negativePrompt: g.negativePrompt || null,
    seed: g.seed,
    generationParameters: g.parameters,
    // reconstruction / preservation (Architecture C keyframe+propagation lane)
    reconstructionRequired: r.required,
    transferMode: r.mode || null,
    maskVersion: r.maskVersion,
    referenceAssetHash: r.referenceAssetHash,
    preserve: r.preserve,
  };
}

/** Compact, human-facing creative snapshot so intent is legible on the run. */
function shotCreativeSummary(spec: ShotSpec): Record<string, unknown> {
  return {
    purpose: spec.purpose,
    title: spec.title || null,
    shotType: spec.shotType,
    kind: spec.kind,
    priority: spec.priority,
    timeline: spec.timeline,
    wardrobe: { name: spec.wardrobe.name || null, lookId: spec.wardrobe.lookId },
    environment: spec.environment.description || null,
    framing: spec.framing,
    cameraMotion: spec.cameraMotion.type,
  };
}

function shotLanePayload(spec: ShotSpec, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    paidCalls: false,
    shotId: spec.id,
    treatment: shotCreativeSummary(spec),
    reproducibility: shotReproducibility(spec),
    ...extra,
  };
}

// ============================================================================
// Seed artifact translation
// ============================================================================

function seed(
  spec: ShotSpec,
  kind: ArtifactKind,
  producedByStage: SeedArtifact["producedByStage"],
  extra: Record<string, unknown>,
): SeedArtifact {
  const src = spec.source;
  return {
    id: `shot-${spec.id}-${kind}`,
    kind,
    assetId: src.mediaId ?? undefined,
    path: src.uri ?? undefined,
    lookId: spec.wardrobe.lookId ?? undefined,
    producedByStage,
    lanePayload: shotLanePayload(spec, extra),
  };
}

/**
 * Translate a shot's source/generation into Product OS seed artifacts.
 *
 *   • captured / stock source with a concrete asset → `source_master`
 *   • generated source with an existing asset       → `generation_clip`
 *     (import-only; the bridge never authors a new generation)
 *
 * A shot whose only "source" is a generation *requirement* with no existing
 * asset yields no seed (the caller flags it `awaitingGeneration`).
 */
export function shotSpecToSeedArtifacts(spec: ShotSpec): SeedArtifact[] {
  const src = spec.source;
  const hasAsset = Boolean(src.mediaId || src.uri);

  if ((src.kind === "captured" || src.kind === "stock") && hasAsset) {
    return [
      seed(spec, "source_master", "seed", {
        role: "shot_source_master",
        sourceKind: src.kind,
      }),
    ];
  }

  if (src.kind === "generated" && hasAsset) {
    return [
      seed(spec, "generation_clip", "generation", {
        role: "shot_generation_clip",
        note: "Existing generation asset — import only, no paid generation.",
      }),
    ];
  }

  return [];
}

/** Generation is required but the shot references no importable generation asset. */
function isAwaitingGeneration(spec: ShotSpec, seeds: SeedArtifact[]): boolean {
  const hasGeneration = seeds.some((s) => s.kind === "generation_clip" || s.kind === "generation_still");
  return spec.generation.required && !hasGeneration;
}

// ============================================================================
// One shot → one run input
// ============================================================================

/**
 * Translate a single ShotSpec into a `CreatePipelineRunInput`. Does NOT check
 * eligibility (call {@link isProductionEligible} first) — this is the pure map.
 *
 * Reviews layer, lowest → highest precedence:
 *   1. product-safe auto-reviews (only fires for CLEARED chest+sleeve seeds)
 *   2. explicit human decisions from `opts.reviews`
 */
export function shotSpecToRunInput(
  projectId: string,
  spec: ShotSpec,
  opts: TreatmentBridgeOptions = {},
): CreatePipelineRunInput {
  const seedArtifacts = shotSpecToSeedArtifacts(spec);
  return {
    projectId,
    seedArtifacts,
    reviews: {
      ...productSafeAutoReviews(seedArtifacts),
      ...opts.reviews,
    },
    catalogId: opts.catalogId,
  };
}

// ============================================================================
// Treatment (many shots) → many run inputs
// ============================================================================

function orderKey(spec: ShotSpec): [number, number] {
  return [spec.order ?? Number.MAX_SAFE_INTEGER, spec.timeline.start];
}

/**
 * Translate a treatment's shots into Product OS run inputs. Ineligible shots
 * (wrong status) are reported in `skipped`; eligible shots that require
 * generation but reference no asset are dispatched and reported in `warnings`.
 *
 * Pure: builds inputs only. Use {@link createPipelineRunsFromTreatment} to
 * actually instantiate runs via Product OS.
 */
export function treatmentToRunInputs(
  projectId: string,
  specs: readonly ShotSpec[],
  opts: TreatmentBridgeOptions = {},
): TreatmentBridgeResult {
  const eligibleStatuses = opts.eligibleStatuses ?? PRODUCTION_ELIGIBLE_STATUSES;
  const bridged: BridgedShot[] = [];
  const skipped: SkippedShot[] = [];
  const warnings: ShotBridgeWarning[] = [];

  const ordered = [...specs].sort((a, b) => {
    const [ao, at] = orderKey(a);
    const [bo, bt] = orderKey(b);
    return ao - bo || at - bt;
  });

  for (const spec of ordered) {
    if (!isProductionEligible(spec, eligibleStatuses)) {
      skipped.push({
        shotId: spec.id,
        status: spec.status,
        reason: "not_eligible_status",
        message: `Shot ${spec.id} status "${spec.status}" is not production-eligible (${eligibleStatuses.join(", ")}).`,
      });
      continue;
    }

    const seedArtifacts = shotSpecToSeedArtifacts(spec);
    const awaitingGeneration = isAwaitingGeneration(spec, seedArtifacts);

    if (seedArtifacts.length === 0 && !awaitingGeneration) {
      // Eligible but references no importable media and needs no generation.
      skipped.push({
        shotId: spec.id,
        status: spec.status,
        reason: "missing_source",
        message: `Shot ${spec.id} is eligible but references no source or generation asset.`,
      });
      continue;
    }

    if (awaitingGeneration) {
      warnings.push({
        shotId: spec.id,
        code: "awaiting_generation",
        message: `Shot ${spec.id} requires generation; import a generation_clip/still before the run can pass the generation stage.`,
      });
    }

    const runInput = shotSpecToRunInput(projectId, spec, opts);
    bridged.push({
      shotId: spec.id,
      title: spec.title,
      order: spec.order,
      seedArtifacts,
      reproducibility: shotReproducibility(spec),
      awaitingGeneration,
      runInput,
    });
  }

  return {
    version: TREATMENT_BRIDGE_VERSION,
    projectId,
    runInputs: bridged.map((b) => b.runInput),
    bridged,
    skipped,
    warnings,
    paidCalls: false,
  };
}

// ============================================================================
// Thin wrappers that CALL Product OS (never reimplement the graph)
// ============================================================================

/**
 * Instantiate a live `PipelineRun` for one shot. Assumes eligibility has been
 * checked; use {@link createPipelineRunsFromTreatment} for a whole treatment.
 * Delegates to `createPipelineRun`, which wires `createProductOsAdapters`.
 */
export function createPipelineRunFromShotSpec(
  projectId: string,
  spec: ShotSpec,
  opts: TreatmentBridgeOptions = {},
  clock?: PipelineClock,
): PipelineRun {
  return createPipelineRun(shotSpecToRunInput(projectId, spec, opts), clock);
}

export type TreatmentRunSet = {
  version: typeof TREATMENT_BRIDGE_VERSION;
  projectId: string;
  runs: PipelineRun[];
  skipped: SkippedShot[];
  warnings: ShotBridgeWarning[];
  paidCalls: false;
};

/**
 * Translate a treatment AND instantiate the Product OS runs for every eligible
 * shot. This is the one entry point that actually calls the orchestrator.
 */
export function createPipelineRunsFromTreatment(
  projectId: string,
  specs: readonly ShotSpec[],
  opts: TreatmentBridgeOptions = {},
  clock?: PipelineClock,
): TreatmentRunSet {
  const result = treatmentToRunInputs(projectId, specs, opts);
  return {
    version: TREATMENT_BRIDGE_VERSION,
    projectId,
    runs: result.runInputs.map((input) => createPipelineRun(input, clock)),
    skipped: result.skipped,
    warnings: result.warnings,
    paidCalls: false,
  };
}
