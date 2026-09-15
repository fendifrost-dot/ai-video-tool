/**
 * Lane B — isolated sleeve-panel types.
 * Do not import Architecture C / chest repair modules from here.
 */

export const SLEEVE_PANEL_CONTRACT_VERSION = "1.0.0" as const;

export type SleeveSide = "left" | "right";

/** Normalized still quad, TL → TR → BR → BL, each axis in [0, 1]. */
export type QuadNorm = [[number, number], [number, number], [number, number], [number, number]];

export type Point = { x: number; y: number };
export type QuadPts = [Point, Point, Point, Point];

export type RgbaImage = {
  width: number;
  height: number;
  data: Uint8Array;
};

/** 0 = not eligible, 1 = eligible. One byte per pixel. */
export type BinaryMask = {
  width: number;
  height: number;
  data: Uint8Array;
};

/** Normalized crop on the flat ref: [x, y, w, h], each in [0, 1]. */
export type NormBbox = [number, number, number, number];

export const SLEEVE_PANEL_CLAIM = "visible_geometry_only" as const;
export const CROSSED_ARMS_POSE = "crossed_arms" as const;

export type ValidatedSleeveRegion = "visible_upper_arm";
export type UnvalidatedSleeveRegion =
  | "hidden_shoulder_to_cuff"
  | "forearm_occluded"
  | "cuff_unseen";

export type VisibilityManifest = {
  pose: typeof CROSSED_ARMS_POSE;
  claim: typeof SLEEVE_PANEL_CLAIM;
  validated: readonly ValidatedSleeveRegion[];
  unvalidated: readonly UnvalidatedSleeveRegion[];
  notes: string;
};

export const CROSSED_ARMS_VISIBILITY: VisibilityManifest = {
  pose: CROSSED_ARMS_POSE,
  claim: SLEEVE_PANEL_CLAIM,
  validated: ["visible_upper_arm"],
  unvalidated: ["hidden_shoulder_to_cuff", "forearm_occluded", "cuff_unseen"],
  notes:
    "Canonical frame has crossed arms for the entire clip. Only the visible upper-arm navy segment is in scope. Hidden shoulder→cuff / forearm / cuff geometry is unvalidated and must not be claimed.",
};
