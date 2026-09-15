/** Edge mirror of src/lib/sleevePanel/liveStill.ts — keep in sync. */
/**
 * Production adapter: Lane B visible-geometry contract → Architecture C sleeve still.
 *
 * Does not import logoComposite / chest paint. Chest output is an optional
 * reserved-mask slot (do-not-paint).
 */

import {
  CHEST_OUTPUT_SLOT_KIND,
  defaultVisibilityManifest,
  parseChestOutputSlot,
  type ChestOutputConsumptionSlot,
  type SleeveNavyFillMode,
  type SleevePanelStageOutput,
  type VisibleSleevePanelSpec,
} from "./contract.ts";
import { repairVisibleSleevePanels } from "./repair.ts";
import {
  createMask,
  fillMaskRect,
  isNormBbox,
  isQuadNorm,
  rasterizeQuadMask,
  quadNormToPts,
} from "./raster.ts";
import {
  SLEEVE_PANEL_CLAIM,
  SLEEVE_PANEL_CONTRACT_VERSION,
  type BinaryMask,
  type NormBbox,
  type QuadNorm,
  type RgbaImage,
  type SleeveSide,
} from "./types.ts";
import { assessVisibleSleeveQuad } from "./visibleGeometry.ts";

/** Sleeve-stage method version. Independent of chest `architecture_c_still_repair_1m`. */
export const SLEEVE_STILL_REPAIR_METHOD_VERSION = "architecture_c_sleeve_still_1c" as const;

/**
 * Live 1m / Lane E measured chest-band quad on still `2aa1a44c` (720×1280).
 * Default reserved region so sleeve cannot overwrite the cleared chest gate.
 */
export const LIVE_CHEST_RESERVED_QUAD_NORM: QuadNorm = [
  [0.3, 0.53],
  [0.87, 0.533],
  [0.87, 0.585],
  [0.3, 0.582],
];

/**
 * Requested flat-ref crop (existing 1a default). On the SL front flat this
 * window is cream/white — Stage 1c resolves navy-ward via `resolveNavyPanelSource`
 * (prefer product navy over cream stripe) rather than warping the cream crop.
 */
export const DEFAULT_FLAT_SLEEVE_SOURCE_BBOX: NormBbox = [0.05, 0.35, 0.12, 0.35];

/**
 * Visible upper-arm corridors on the crossed-arms V2 still.
 * Y stays inside the C11 gap (y 600–799 on 1280) so chest outside-region
 * windows are not claimed. X is lateral of the chest band.
 */
export const CANONICAL_VISIBLE_UPPER_ARM_BOXES = {
  left: { x0: 0.0, y0: 0.47, x1: 0.3, y1: 0.624 },
  right: { x0: 0.7, y0: 0.47, x1: 1.0, y1: 0.624 },
} as const;

/** Hidden / unvalidated: face, distal forearm/cuff, crossed-forearm C5 pocket. */
export const CANONICAL_HIDDEN_BOXES = {
  face: { x0: 0.18, y0: 0.06, x1: 0.82, y1: 0.46 },
  leftDistal: { x0: 0.0, y0: 0.625, x1: 0.34, y1: 0.96 },
  rightDistal: { x0: 0.66, y0: 0.625, x1: 1.0, y1: 0.96 },
  /** C5 zip-corner / crossed-forearm — not a sleeve_panel claim. */
  crossedForearm: { x0: 0.42, y0: 0.575, x1: 0.58, y1: 0.6 },
} as const;

/** Seeded visible-upper-arm quads for Hero Frame (numeric entry / live verify). */
export const SEEDED_VISIBLE_SLEEVE_QUADS: Record<SleeveSide, QuadNorm> = {
  left: [
    [0.03, 0.5],
    [0.26, 0.505],
    [0.25, 0.615],
    [0.03, 0.61],
  ],
  right: [
    [0.88, 0.505],
    [0.99, 0.5],
    [0.99, 0.615],
    [0.88, 0.61],
  ],
};

export type NormBox = { x0: number; y0: number; x1: number; y1: number };

export type SleevePanelLiveInput = {
  still: RgbaImage;
  flatRef: RgbaImage;
  panels: Array<{
    side: SleeveSide;
    targetQuad: QuadNorm;
    sourceBboxNorm?: NormBbox | null;
  }>;
  chestBandQuadNorm?: QuadNorm | null;
  chestOutputAssetId?: string | null;
  sourceStillId?: string | null;
  chestRepairMethodVersion?: string | null;
  /** Override masks (fixtures). When omitted, canonical crossed-arms live masks are used. */
  visibleMask?: BinaryMask;
  hiddenMask?: BinaryMask;
};

export type SleevePanelLiveMeta = {
  repair_method_version: typeof SLEEVE_STILL_REPAIR_METHOD_VERSION;
  contract_version: typeof SLEEVE_PANEL_CONTRACT_VERSION;
  claim: typeof SLEEVE_PANEL_CLAIM;
  geometry_note: "visible_upper_arm_only";
  hidden_shoulder_to_cuff_validated: false;
  consumed_chest_output: boolean;
  chest_output_asset_id: string | null;
  source_still_id: string | null;
  chest_repair_method_version: string | null;
  navy_fill_mode: SleeveNavyFillMode | "mixed";
};

export type SleevePanelLiveResult = {
  still: RgbaImage;
  output: SleevePanelStageOutput;
  meta: SleevePanelLiveMeta;
};

function fillNormBox(mask: BinaryMask, box: NormBox, value: 0 | 1): void {
  fillMaskRect(
    mask,
    box.x0 * mask.width,
    box.y0 * mask.height,
    box.x1 * mask.width,
    box.y1 * mask.height,
    value,
  );
}

export function buildCanonicalVisibleMask(width: number, height: number): BinaryMask {
  const mask = createMask(width, height);
  fillNormBox(mask, CANONICAL_VISIBLE_UPPER_ARM_BOXES.left, 1);
  fillNormBox(mask, CANONICAL_VISIBLE_UPPER_ARM_BOXES.right, 1);
  return mask;
}

export function buildCanonicalHiddenMask(width: number, height: number): BinaryMask {
  const mask = createMask(width, height);
  fillNormBox(mask, CANONICAL_HIDDEN_BOXES.face, 1);
  fillNormBox(mask, CANONICAL_HIDDEN_BOXES.leftDistal, 1);
  fillNormBox(mask, CANONICAL_HIDDEN_BOXES.rightDistal, 1);
  fillNormBox(mask, CANONICAL_HIDDEN_BOXES.crossedForearm, 1);
  return mask;
}

export function rasterizeReservedChestMask(
  width: number,
  height: number,
  chestBandQuadNorm: QuadNorm = LIVE_CHEST_RESERVED_QUAD_NORM,
): BinaryMask {
  return rasterizeQuadMask(width, height, quadNormToPts(chestBandQuadNorm, width, height));
}

export function buildChestOutputSlotFromLive(input: {
  width: number;
  height: number;
  sourceStillId?: string | null;
  chestOutputAssetId?: string | null;
  chestRepairMethodVersion?: string | null;
  chestBandQuadNorm?: QuadNorm | null;
}): ChestOutputConsumptionSlot {
  const quad =
    input.chestBandQuadNorm && isQuadNorm(input.chestBandQuadNorm)
      ? input.chestBandQuadNorm
      : LIVE_CHEST_RESERVED_QUAD_NORM;
  return {
    kind: CHEST_OUTPUT_SLOT_KIND,
    contractVersion: SLEEVE_PANEL_CONTRACT_VERSION,
    stage: "logo_chest",
    sourceStillId: input.sourceStillId ?? undefined,
    chestOutputAssetId: input.chestOutputAssetId ?? undefined,
    repairMethodVersion: input.chestRepairMethodVersion ?? undefined,
    reservedMask: rasterizeReservedChestMask(input.width, input.height, quad),
    chestBandQuadNorm: quad,
  };
}

export type SleeveQuadPlacementAssessment = {
  ok: boolean;
  warnings: string[];
  centerY: number;
  height: number;
};

/**
 * Warn when a sleeve quad is likely claiming hidden shoulder→cuff or face.
 * Pure heuristic — the live mask / contract is the hard gate.
 */
export function assessSleevePanelQuadPlacement(quad: QuadNorm): SleeveQuadPlacementAssessment {
  const xs = quad.map(([x]) => x);
  const ys = quad.map(([, y]) => y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const centerY = (minY + maxY) / 2;
  const height = maxY - minY;
  const warnings: string[] = [];

  if (height > 0.22) {
    warnings.push(
      `Quad height ${height.toFixed(3)} claims more than a visible upper-arm segment (likely armhole→cuff).`,
    );
  }
  if (centerY < 0.47 || centerY > 0.62) {
    warnings.push(
      `Quad center y=${centerY.toFixed(3)} is outside the visible upper-arm corridor (≈ 0.47–0.62).`,
    );
  }
  if (minY < 0.4) {
    warnings.push("Quad reaches into the face / shoulder region.");
  }
  if (maxY > 0.7) {
    warnings.push("Quad reaches distal forearm / cuff — unvalidated on this crossed-arms clip.");
  }
  if (maxX - minX > 0.45) {
    warnings.push("Quad is wider than a single visible upper-arm panel.");
  }

  return { ok: warnings.length === 0, warnings, centerY, height };
}

export function repairVisibleSleevePanelsOnStill(
  input: SleevePanelLiveInput,
): SleevePanelLiveResult {
  if (input.panels.length === 0) throw new Error("sleeve_panels_required");

  const specs: VisibleSleevePanelSpec[] = input.panels.map((panel) => {
    if (panel.side !== "left" && panel.side !== "right") {
      throw new Error("invalid_sleeve_side");
    }
    if (!isQuadNorm(panel.targetQuad)) {
      throw new Error(`invalid_sleeve_quad:${panel.side}`);
    }
    const source = panel.sourceBboxNorm ?? DEFAULT_FLAT_SLEEVE_SOURCE_BBOX;
    if (!isNormBbox(source)) {
      throw new Error(`invalid_sleeve_source_bbox:${panel.side}`);
    }
    return {
      side: panel.side,
      targetQuadNorm: panel.targetQuad,
      sourceBboxNorm: source,
    };
  });

  const visibleMask =
    input.visibleMask ?? buildCanonicalVisibleMask(input.still.width, input.still.height);
  const hiddenMask =
    input.hiddenMask ?? buildCanonicalHiddenMask(input.still.width, input.still.height);
  const chestOutput = buildChestOutputSlotFromLive({
    width: input.still.width,
    height: input.still.height,
    sourceStillId: input.sourceStillId,
    chestOutputAssetId: input.chestOutputAssetId,
    chestRepairMethodVersion: input.chestRepairMethodVersion,
    chestBandQuadNorm: input.chestBandQuadNorm,
  });

  for (const spec of specs) {
    const assessment = assessVisibleSleeveQuad({
      side: spec.side,
      targetQuadNorm: spec.targetQuadNorm,
      width: input.still.width,
      height: input.still.height,
      visibleMask,
      hiddenMask,
      chestReservedMask: chestOutput.reservedMask,
    });
    if (!assessment.ok) {
      throw new Error(`sleeve_panel_geometry_rejected:${spec.side}:${assessment.reason}`);
    }
  }

  const output = repairVisibleSleevePanels({
    contractVersion: SLEEVE_PANEL_CONTRACT_VERSION,
    still: input.still,
    flatRef: input.flatRef,
    visibleMask,
    hiddenMask,
    panels: specs,
    visibility: defaultVisibilityManifest(),
    chestOutput,
  });

  const slot = parseChestOutputSlot(chestOutput);
  const fillModes = new Set(output.sides.map((s) => s.navyFillMode));
  const navyFillMode: SleeveNavyFillMode | "mixed" =
    fillModes.size === 1 ? (output.sides[0]?.navyFillMode ?? "warp") : "mixed";

  return {
    still: output.still,
    output,
    meta: {
      repair_method_version: SLEEVE_STILL_REPAIR_METHOD_VERSION,
      contract_version: SLEEVE_PANEL_CONTRACT_VERSION,
      claim: SLEEVE_PANEL_CLAIM,
      geometry_note: "visible_upper_arm_only",
      hidden_shoulder_to_cuff_validated: false,
      consumed_chest_output: slot != null,
      chest_output_asset_id: input.chestOutputAssetId ?? null,
      source_still_id: input.sourceStillId ?? null,
      chest_repair_method_version: input.chestRepairMethodVersion ?? null,
      navy_fill_mode: navyFillMode,
    },
  };
}
