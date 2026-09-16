/**
 * Lane R freeze of Architecture C CLEARED identities.
 *
 * Copied here on purpose so a later lane-local ID edit fails this harness
 * instead of silently drifting temporal vs reconstruct vs sleeve vs goldens.
 * Do not import chest/sleeve paint or temporal authorize implementations.
 */

export const LOCKED_PAID_CALLS = false;
export const LOCKED_GROK_PER_FRAME = false;

export const LOCKED_PROJECT_ID = "764a63d2-93cd-44f3-905f-292f14ab2f51";
export const LOCKED_MASTER_CLIP_ID = "76fe7438-671d-4428-a7f6-17a45e98c16f";
export const LOCKED_STILL_ASSET_ID = "2aa1a44c-b24a-46bf-890f-13a6fc65b1cc";
export const LOCKED_KEYFRAME_ID = "v2-still-0.785";

export const LOCKED_CHEST_ASSET_ID = "9ed83c01-8c7d-4d1b-918f-87b0fc743c50";
export const LOCKED_CHEST_REPAIR_METHOD_VERSION = "architecture_c_still_repair_1m";
export const LOCKED_CHEST_GATE = "CLEARED";
export const LOCKED_CHEST_GATE_SCORE = "11/11";

export const LOCKED_CHEST_QUAD_TUPLE = [
  [0.3, 0.53],
  [0.87, 0.533],
  [0.87, 0.585],
  [0.3, 0.582],
] as const;

export const LOCKED_SLEEVE_ASSET_ID = "fdb86b18-d4aa-465e-b73f-1d252709739c";
export const LOCKED_SLEEVE_REPAIR_METHOD_VERSION = "architecture_c_sleeve_still_1c";
export const LOCKED_SLEEVE_GATE = "CLEARED";
export const LOCKED_SLEEVE_GATE_SCORE = "6/6";
export const LOCKED_SLEEVE_CLAIM = "visible_geometry_only";

export const LOCKED_SLEEVE_LEFT_QUAD_TUPLE = [
  [0.03, 0.5],
  [0.26, 0.505],
  [0.25, 0.615],
  [0.03, 0.61],
] as const;

export const LOCKED_SLEEVE_RIGHT_QUAD_TUPLE = [
  [0.88, 0.505],
  [0.99, 0.5],
  [0.99, 0.615],
  [0.88, 0.61],
] as const;

export const LOCKED_TEMPORAL_ARMED = true;
export const LOCKED_RECONSTRUCT_ARMED = true;
export const LOCKED_PRODUCT_TEMPORAL_TRACKING = true;

/**
 * Still-repair *edge mirror* of temporalTrackingEnabled must stay false so
 * architecture-c-still-repair-proxy does not 500 tracking_flag_misconfigured.
 * Product Hero Frame flag is independently true.
 */
export const LOCKED_STILL_REPAIR_EDGE_TRACKING = false;
