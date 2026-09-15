/**
 * Canonical CLEARED chest still identity for Product OS.
 *
 * Evidence lives in Lane E (`src/lib/eval/stage1mEvidence.ts`, PR #73).
 * This module copies the IDs so pipeline orchestration does not own eval
 * internals or Architecture C paint.
 *
 * [VERIFIED] Stage 1m live 11/11 on asset 9ed83c01, architecture_c_still_repair_1m.
 */

import type { ArtifactRef } from "./types";

export const CHEST_STILL_REVIEW_KEY = "chestStillCleared" as const;

export const CLEARED_CHEST_STILL = {
  evidence: "VERIFIED" as const,
  gate: "CLEARED" as const,
  score: "11/11" as const,
  stage: "logo_chest" as const,
  repairMethodVersion: "architecture_c_still_repair_1m",
  assetId: "9ed83c01-8c7d-4d1b-918f-87b0fc743c50",
  projectId: "764a63d2-93cd-44f3-905f-292f14ab2f51",
  wardrobeFeatureId: "0feb028f-dc4d-45dc-82ac-e4bbd16054b0",
  clipId: "76fe7438-671d-4428-a7f6-17a45e98c16f",
  cleanStillAssetId: "2aa1a44c-b24a-46bf-890f-13a6fc65b1cc",
  keyframeId: "v2-still-0.785",
  createdAtUtc: "2026-09-15T05:08:18.043315Z",
  storedBucket: "project-references",
  storedPath:
    "3ca10935-8c3d-4479-9a0c-8bfe8050840c/764a63d2-93cd-44f3-905f-292f14ab2f51/architecture-c-repair/logo_chest_2aa1a44c-b24a-46bf-890f-13a6fc65b1cc_1789448897690.png",
  mimeType: "image/png",
  temporalTrackingEnabled: false as const,
  requestedBandQuadNorm: [
    [0.3, 0.53],
    [0.87, 0.533],
    [0.87, 0.585],
    [0.3, 0.582],
  ] as const,
  source: {
    pr: 73,
    issue: 71,
    resultDoc:
      "docs/research/results/2026-09-04-still-repair/ARCHITECTURE_C_STILL_REPAIR_STAGE1M_RESULT_2026-09-15.md",
  },
} as const;

export type ClearedChestSeed = Omit<ArtifactRef, "id" | "producedAt"> & {
  id?: string;
  producedAt?: string;
};

export function isClearedChestAssetId(assetId: string | undefined): boolean {
  return assetId === CLEARED_CHEST_STILL.assetId;
}

export function isClearedChestArtifact(artifact: ArtifactRef): boolean {
  if (artifact.kind !== "repaired_still_logo_chest") return false;
  if (!isClearedChestAssetId(artifact.assetId)) return false;
  const version = artifact.lanePayload?.repairMethodVersion;
  if (typeof version === "string" && version !== CLEARED_CHEST_STILL.repairMethodVersion) {
    return false;
  }
  return true;
}

export function clearedChestLanePayload(): Record<string, unknown> {
  return {
    stage: CLEARED_CHEST_STILL.stage,
    repairMethodVersion: CLEARED_CHEST_STILL.repairMethodVersion,
    gate: CLEARED_CHEST_STILL.gate,
    score: CLEARED_CHEST_STILL.score,
    temporalTrackingEnabled: CLEARED_CHEST_STILL.temporalTrackingEnabled,
    keyframeId: CLEARED_CHEST_STILL.keyframeId,
    wardrobeFeatureId: CLEARED_CHEST_STILL.wardrobeFeatureId,
    evidence: CLEARED_CHEST_STILL.evidence,
    sourcePr: CLEARED_CHEST_STILL.source.pr,
  };
}

/** Seed artifacts for a Product OS run that already has the CLEARED 1m chest. */
export function clearedChestSeedArtifacts(): ClearedChestSeed[] {
  const producedAt = CLEARED_CHEST_STILL.createdAtUtc;
  return [
    {
      id: "seed-source_master",
      kind: "source_master",
      assetId: CLEARED_CHEST_STILL.clipId,
      producedByStage: "seed",
      producedAt,
    },
    {
      id: "seed-source_still",
      kind: "source_still",
      assetId: CLEARED_CHEST_STILL.cleanStillAssetId,
      producedByStage: "seed",
      producedAt,
      lanePayload: {
        wardrobeFeatureId: CLEARED_CHEST_STILL.wardrobeFeatureId,
        logoZoneQuad: CLEARED_CHEST_STILL.requestedBandQuadNorm,
        keyframeId: CLEARED_CHEST_STILL.keyframeId,
      },
    },
    {
      id: "seed-repaired_still_logo_chest",
      kind: "repaired_still_logo_chest",
      assetId: CLEARED_CHEST_STILL.assetId,
      bucket: CLEARED_CHEST_STILL.storedBucket,
      path: CLEARED_CHEST_STILL.storedPath,
      mimeType: CLEARED_CHEST_STILL.mimeType,
      producedByStage: "keyframe_repair",
      producedAt,
      lanePayload: clearedChestLanePayload(),
    },
  ];
}

export function chestClearedProvenanceMetadata(): Record<string, unknown> {
  return {
    source: "imported_from_lane",
    gate: CLEARED_CHEST_STILL.gate,
    repairMethodVersion: CLEARED_CHEST_STILL.repairMethodVersion,
    assetId: CLEARED_CHEST_STILL.assetId,
    score: CLEARED_CHEST_STILL.score,
    evidence: CLEARED_CHEST_STILL.evidence,
  };
}
