/**
 * Project/clip catalogs for Product OS.
 *
 * The orchestrator never switches on clip id. Binding a catalog produces a
 * `CreatePipelineRunInput`. A second existing clip uses the same graph.
 *
 * Canonical: YSL Ice On original master `76fe7438` + CLEARED chest/sleeve.
 * Second existing clip: V2 edited_clip `f31bd0f2` (same project, different asset).
 */

import { CLEARED_CHEST_STILL, clearedChestSeedArtifacts } from "./chest";
import { createPipelineRun } from "./orchestrator";
import { CLEARED_SLEEVE_STILL, clearedSleeveSeedArtifact } from "./sleeve";
import type { PipelineClock, PipelineRun, SeedArtifact } from "./types";

export type ClipCatalogId = "canonical-ysl-ice-on" | "ysl-ice-on-v2-edited-clip";

export type ClipCatalog = {
  id: ClipCatalogId;
  label: string;
  existing: true;
  paidCalls: false;
  projectId: string;
  clipId: string;
  reviews: Record<string, boolean>;
  seedArtifacts: () => SeedArtifact[];
};

/** Canonical Architecture C lineage — original master + CLEARED 1m/1c stills. */
export const CANONICAL_YSL_ICE_ON: ClipCatalog = {
  id: "canonical-ysl-ice-on",
  label: "YSL (Ice On) original master + CLEARED chest 1m / sleeve 1c",
  existing: true,
  paidCalls: false,
  projectId: CLEARED_CHEST_STILL.projectId,
  clipId: CLEARED_CHEST_STILL.clipId,
  reviews: {
    chestStillCleared: true,
    sleeveStillCleared: true,
    stillRepairApproved: false,
    masterCompositeAuthorized: false,
    exportApproved: false,
  },
  seedArtifacts: () => [...clearedChestSeedArtifacts(), clearedSleeveSeedArtifact()],
};

/**
 * Second existing clip in the same project: frozen Prompt V2 edited_clip
 * `f31bd0f2` (parent master `76fe7438`). No clip-specific orchestrator branch.
 */
export const SECOND_EXISTING_V2_EDITED_CLIP: ClipCatalog = {
  id: "ysl-ice-on-v2-edited-clip",
  label: "YSL (Ice On) V2 edited clip f31bd0f2 (existing generation_clip)",
  existing: true,
  paidCalls: false,
  projectId: "764a63d2-93cd-44f3-905f-292f14ab2f51",
  clipId: "f31bd0f2-884f-42e1-8b08-aa645597b7a6",
  reviews: {
    chestStillCleared: false,
    sleeveStillCleared: false,
    stillRepairApproved: false,
    masterCompositeAuthorized: false,
    exportApproved: false,
  },
  seedArtifacts: () => [
    {
      id: "seed-source_master-v2-parent",
      kind: "source_master",
      assetId: CLEARED_CHEST_STILL.clipId,
      producedByStage: "seed",
      producedAt: "2026-09-03T00:00:00.000Z",
      lanePayload: { role: "parent_original_master" },
    },
    {
      id: "seed-generation_clip-v2",
      kind: "generation_clip",
      assetId: "f31bd0f2-884f-42e1-8b08-aa645597b7a6",
      producedByStage: "generation",
      producedAt: "2026-09-03T00:00:00.000Z",
      lanePayload: {
        grokRequestId: "9d47bd2f-c220-98a4-a281-f1499b8ae7f4",
        promptVersion: "v2",
        parentAssetId: CLEARED_CHEST_STILL.clipId,
        paidCalls: false,
        note: "Existing edited_clip. Lane G2 imports only — no new generation.",
      },
    },
  ],
};

export const CLIP_CATALOGS: Record<ClipCatalogId, ClipCatalog> = {
  "canonical-ysl-ice-on": CANONICAL_YSL_ICE_ON,
  "ysl-ice-on-v2-edited-clip": SECOND_EXISTING_V2_EDITED_CLIP,
};

export type BindCatalogInput = {
  catalog: ClipCatalog;
  reviews?: Record<string, boolean>;
  extraSeedArtifacts?: SeedArtifact[];
};

/** Catalog → run input. Orchestrator stays clip-agnostic. */
export function bindCatalog(input: BindCatalogInput): {
  projectId: string;
  seedArtifacts: SeedArtifact[];
  reviews: Record<string, boolean>;
  catalogId: ClipCatalogId;
  paidCalls: false;
} {
  return {
    projectId: input.catalog.projectId,
    catalogId: input.catalog.id,
    paidCalls: false,
    reviews: { ...input.catalog.reviews, ...input.reviews },
    seedArtifacts: [...input.catalog.seedArtifacts(), ...(input.extraSeedArtifacts ?? [])],
  };
}

export function catalogById(id: ClipCatalogId): ClipCatalog {
  return CLIP_CATALOGS[id];
}

export function createBoundPipelineRun(
  input: BindCatalogInput,
  clock?: PipelineClock,
): PipelineRun {
  const bound = bindCatalog(input);
  return createPipelineRun(
    {
      projectId: bound.projectId,
      seedArtifacts: bound.seedArtifacts,
      reviews: bound.reviews,
      catalogId: bound.catalogId,
    },
    clock,
  );
}

/** Portable binding for any existing project/clip — no new graph. */
export function portableBinding(opts: {
  projectId: string;
  clipId: string;
  seedArtifacts: SeedArtifact[];
  reviews?: Record<string, boolean>;
}): {
  projectId: string;
  seedArtifacts: SeedArtifact[];
  reviews: Record<string, boolean>;
  catalogId: undefined;
  paidCalls: false;
  clipId: string;
} {
  return {
    projectId: opts.projectId,
    clipId: opts.clipId,
    seedArtifacts: opts.seedArtifacts,
    reviews: opts.reviews ?? {},
    catalogId: undefined,
    paidCalls: false,
  };
}

export function secondClipPortabilityDesign(): {
  rule: string;
  idAwareModules: string[];
  sharedModules: string[];
  catalogs: ClipCatalogId[];
  paidCalls: false;
} {
  return {
    rule: "Graph, lifecycle, handoff, and adapters key on ArtifactKind + stage id. Clip/project ids live only in catalog/seed modules.",
    idAwareModules: [
      "src/lib/pipeline/catalog.ts",
      "src/lib/pipeline/chest.ts",
      "src/lib/pipeline/sleeve.ts",
    ],
    sharedModules: [
      "src/lib/pipeline/orchestrator.ts",
      "src/lib/pipeline/unattended.ts",
      "src/lib/pipeline/handoff.ts",
      "src/lib/pipeline/lifecycle.ts",
      "src/lib/pipeline/graph.ts",
      "src/lib/pipeline/contract.ts",
    ],
    catalogs: ["canonical-ysl-ice-on", "ysl-ice-on-v2-edited-clip"],
    paidCalls: false,
  };
}

export { CLEARED_SLEEVE_STILL };
