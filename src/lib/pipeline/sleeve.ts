/**
 * Canonical CLEARED sleeve still identity for Product OS.
 *
 * IDs copied from Lane B / Lane E evidence so orchestration does not import
 * sleevePanel paint or eval internals. Chest 1m / sleeve 1c paint stays locked.
 *
 * [VERIFIED] Stage 1c live 6/6 on asset fdb86b18, architecture_c_sleeve_still_1c.
 */

import type { ArtifactRef } from "./types";

export const SLEEVE_STILL_REVIEW_KEY = "sleeveStillCleared" as const;

export const CLEARED_SLEEVE_STILL = {
  evidence: "VERIFIED" as const,
  gate: "CLEARED" as const,
  score: "6/6" as const,
  stage: "sleeve_panel" as const,
  repairMethodVersion: "architecture_c_sleeve_still_1c",
  assetId: "fdb86b18-d4aa-465e-b73f-1d252709739c",
  projectId: "764a63d2-93cd-44f3-905f-292f14ab2f51",
  wardrobeFeatureId: "0feb028f-dc4d-45dc-82ac-e4bbd16054b0",
  clipId: "76fe7438-671d-4428-a7f6-17a45e98c16f",
  cleanStillAssetId: "2aa1a44c-b24a-46bf-890f-13a6fc65b1cc",
  preferredChestOutputAssetId: "9ed83c01-8c7d-4d1b-918f-87b0fc743c50",
  keyframeId: "v2-still-0.785",
  createdAtUtc: "2026-09-15T23:54:54.956805Z",
  storedBucket: "project-references",
  storedPath:
    "3ca10935-8c3d-4479-9a0c-8bfe8050840c/764a63d2-93cd-44f3-905f-292f14ab2f51/architecture-c-repair/sleeve_panel_2aa1a44c-b24a-46bf-890f-13a6fc65b1cc_1789516494410.png",
  mimeType: "image/png",
  temporalTrackingEnabled: false as const,
  claim: "visible_geometry_only" as const,
  source: {
    pr: 86,
    issue: 84,
    resultDoc: "docs/sleeve-panel/LANE_B_SLEEVE_STILL_1C_LIVE_RESULT_2026-09-16.md",
  },
} as const;

export function isClearedSleeveAssetId(assetId: string | undefined): boolean {
  return assetId === CLEARED_SLEEVE_STILL.assetId;
}

export function isClearedSleeveArtifact(artifact: ArtifactRef): boolean {
  if (artifact.kind !== "repaired_still_sleeve_panel") return false;
  if (!isClearedSleeveAssetId(artifact.assetId)) return false;
  const version = artifact.lanePayload?.repairMethodVersion;
  if (typeof version === "string" && version !== CLEARED_SLEEVE_STILL.repairMethodVersion) {
    return false;
  }
  return true;
}

export function clearedSleeveLanePayload(): Record<string, unknown> {
  return {
    stage: CLEARED_SLEEVE_STILL.stage,
    repairMethodVersion: CLEARED_SLEEVE_STILL.repairMethodVersion,
    gate: CLEARED_SLEEVE_STILL.gate,
    score: CLEARED_SLEEVE_STILL.score,
    temporalTrackingEnabled: CLEARED_SLEEVE_STILL.temporalTrackingEnabled,
    keyframeId: CLEARED_SLEEVE_STILL.keyframeId,
    wardrobeFeatureId: CLEARED_SLEEVE_STILL.wardrobeFeatureId,
    evidence: CLEARED_SLEEVE_STILL.evidence,
    claim: CLEARED_SLEEVE_STILL.claim,
    sourcePr: CLEARED_SLEEVE_STILL.source.pr,
  };
}

export function clearedSleeveSeedArtifact(): Omit<ArtifactRef, "id" | "producedAt"> & {
  id?: string;
  producedAt?: string;
} {
  return {
    id: "seed-repaired_still_sleeve_panel",
    kind: "repaired_still_sleeve_panel",
    assetId: CLEARED_SLEEVE_STILL.assetId,
    bucket: CLEARED_SLEEVE_STILL.storedBucket,
    path: CLEARED_SLEEVE_STILL.storedPath,
    mimeType: CLEARED_SLEEVE_STILL.mimeType,
    producedByStage: "sleeve_garment_repair",
    producedAt: CLEARED_SLEEVE_STILL.createdAtUtc,
    lanePayload: clearedSleeveLanePayload(),
  };
}

export function sleeveClearedProvenanceMetadata(): Record<string, unknown> {
  return {
    source: "imported_from_lane",
    gate: CLEARED_SLEEVE_STILL.gate,
    repairMethodVersion: CLEARED_SLEEVE_STILL.repairMethodVersion,
    assetId: CLEARED_SLEEVE_STILL.assetId,
    score: CLEARED_SLEEVE_STILL.score,
    evidence: CLEARED_SLEEVE_STILL.evidence,
    claim: CLEARED_SLEEVE_STILL.claim,
  };
}
