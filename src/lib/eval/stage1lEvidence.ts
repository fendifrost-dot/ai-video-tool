/**
 * GitHub-verified Stage 1l chest still identity (live asset, not yet scored).
 * Evidence: docs/research/results/2026-09-04-still-repair/ARCHITECTURE_C_STILL_REPAIR_STAGE1L_LIVE_ASSET_2026-09-15.md
 *
 * Produced on the canonical still `2aa1a44c` with the measured live quad after
 * PR #68 merged and `architecture-c-still-repair-proxy` was redeployed for 1l.
 * Lane E 11-point scoring is a follow-up — this table is identity only.
 */

export const STAGE1L_LIVE_VERIFIED = {
  repairMethodVersion: "architecture_c_still_repair_1l",
  assetId: "9eaf0c55-5fdd-44ac-ac5c-9a9a86414c75",
  projectId: "764a63d2-93cd-44f3-905f-292f14ab2f51",
  wardrobeFeatureId: "0feb028f-dc4d-45dc-82ac-e4bbd16054b0",
  cleanStillAssetId: "2aa1a44c-b24a-46bf-890f-13a6fc65b1cc",
  keyframeId: "v2-still-0.785",
  stage: "logo_chest",
  createdAtUtc: "2026-09-15T04:32:47.992701Z",
  storedPath:
    "3ca10935-8c3d-4479-9a0c-8bfe8050840c/764a63d2-93cd-44f3-905f-292f14ab2f51/architecture-c-repair/logo_chest_2aa1a44c-b24a-46bf-890f-13a6fc65b1cc_1789446767711.png",
  occlusionSource: "sam3",
  sam3Ok: true,
  allowSkinHeuristicFallback: false,
  temporalTrackingEnabled: false,
  requestedBandQuadNorm: [
    [0.3, 0.53],
    [0.87, 0.533],
    [0.87, 0.585],
    [0.3, 0.582],
  ] as const,
  effectiveBandBboxPixelCount: 27390,
  gate: "NOT_SCORED" as const,
} as const;
