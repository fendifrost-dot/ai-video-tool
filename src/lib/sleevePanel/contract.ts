/**
 * Mask / geometry contract for Lane B sleeve-panel repair.
 *
 * This is the only interface later stages use to feed chest output into
 * sleeve repair. Lane B does not import or call Architecture C chest code.
 */

import {
  CROSSED_ARMS_VISIBILITY,
  SLEEVE_PANEL_CLAIM,
  SLEEVE_PANEL_CONTRACT_VERSION,
  type BinaryMask,
  type NormBbox,
  type QuadNorm,
  type RgbaImage,
  type SleeveSide,
  type VisibilityManifest,
} from "./types";
import { isNormBbox, isQuadNorm } from "./raster";

export { SLEEVE_PANEL_CONTRACT_VERSION, SLEEVE_PANEL_CLAIM };

export const CHEST_OUTPUT_SLOT_KIND = "chest_output_ref" as const;

/**
 * Reserved consumption slot for a later chest-repair artifact.
 * Lane B treats this as optional geometry/mask input only:
 *   - never requires chest merge
 *   - never paints chest pixels
 *   - never validates hidden shoulder→cuff
 */
export type ChestOutputConsumptionSlot = {
  kind: typeof CHEST_OUTPUT_SLOT_KIND;
  contractVersion: typeof SLEEVE_PANEL_CONTRACT_VERSION;
  stage: "logo_chest";
  sourceStillId?: string;
  chestOutputAssetId?: string;
  repairMethodVersion?: string;
  /** Pixels already owned by chest — sleeve must not overwrite. */
  reservedMask?: BinaryMask | null;
  /** Optional chest-band quad for armhole adjacency (not painted by this stage). */
  chestBandQuadNorm?: QuadNorm | null;
};

export type VisibleSleevePanelSpec = {
  side: SleeveSide;
  /** Target on the still. Must lie in the visible-upper-arm mask. */
  targetQuadNorm: QuadNorm;
  /** Navy panel crop on the flat ref [x, y, w, h] norm. */
  sourceBboxNorm: NormBbox;
};

export type SleevePanelStageInput = {
  contractVersion: typeof SLEEVE_PANEL_CONTRACT_VERSION;
  still: RgbaImage;
  flatRef: RgbaImage;
  /** Paint-eligible visible upper-arm pixels only. */
  visibleMask: BinaryMask;
  /** Hidden / occluded / cuff pixels — never claimed, never painted. */
  hiddenMask: BinaryMask;
  panels: VisibleSleevePanelSpec[];
  visibility: VisibilityManifest;
  chestOutput?: ChestOutputConsumptionSlot | null;
};

export type SleevePanelSideResult = {
  side: SleeveSide;
  paintedPixelCount: number;
  rejectedHiddenPixelCount: number;
  rejectedChestReservedPixelCount: number;
  targetQuadNorm: QuadNorm;
};

export type SleevePanelStageOutput = {
  contractVersion: typeof SLEEVE_PANEL_CONTRACT_VERSION;
  still: RgbaImage;
  paintedMask: BinaryMask;
  sides: SleevePanelSideResult[];
  visibility: VisibilityManifest;
  claims: {
    visibleGeometryRepaired: boolean;
    /** Always false — this clip cannot validate hidden shoulder→cuff. */
    hiddenShoulderToCuffValidated: false;
  };
  consumedChestOutput: boolean;
};

export function defaultVisibilityManifest(): VisibilityManifest {
  return {
    ...CROSSED_ARMS_VISIBILITY,
    validated: [...CROSSED_ARMS_VISIBILITY.validated],
    unvalidated: [...CROSSED_ARMS_VISIBILITY.unvalidated],
  };
}

export function isSleeveSide(v: unknown): v is SleeveSide {
  return v === "left" || v === "right";
}

export function parseChestOutputSlot(raw: unknown): ChestOutputConsumptionSlot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.kind !== CHEST_OUTPUT_SLOT_KIND) return null;
  if (o.contractVersion !== SLEEVE_PANEL_CONTRACT_VERSION) return null;
  if (o.stage !== "logo_chest") return null;
  const slot: ChestOutputConsumptionSlot = {
    kind: CHEST_OUTPUT_SLOT_KIND,
    contractVersion: SLEEVE_PANEL_CONTRACT_VERSION,
    stage: "logo_chest",
  };
  if (typeof o.sourceStillId === "string") slot.sourceStillId = o.sourceStillId;
  if (typeof o.chestOutputAssetId === "string") slot.chestOutputAssetId = o.chestOutputAssetId;
  if (typeof o.repairMethodVersion === "string") slot.repairMethodVersion = o.repairMethodVersion;
  if (o.reservedMask && typeof o.reservedMask === "object") {
    const m = o.reservedMask as Record<string, unknown>;
    if (
      typeof m.width === "number" &&
      typeof m.height === "number" &&
      m.data instanceof Uint8Array
    ) {
      slot.reservedMask = { width: m.width, height: m.height, data: m.data };
    }
  }
  if (isQuadNorm(o.chestBandQuadNorm)) slot.chestBandQuadNorm = o.chestBandQuadNorm;
  return slot;
}

export function assertSleevePanelContract(input: SleevePanelStageInput): void {
  if (input.contractVersion !== SLEEVE_PANEL_CONTRACT_VERSION) {
    throw new Error(`sleeve_contract_version:${input.contractVersion}`);
  }
  if (input.visibility.claim !== SLEEVE_PANEL_CLAIM) {
    throw new Error("sleeve_contract_claim_must_be_visible_geometry_only");
  }
  if (input.visibility.pose !== "crossed_arms") {
    throw new Error("sleeve_contract_pose_must_be_crossed_arms");
  }
  if (!input.visibility.validated.includes("visible_upper_arm")) {
    throw new Error("sleeve_contract_missing_visible_upper_arm");
  }
  if (!input.visibility.unvalidated.includes("hidden_shoulder_to_cuff")) {
    throw new Error("sleeve_contract_must_declare_hidden_shoulder_to_cuff_unvalidated");
  }
  if (input.panels.length === 0) throw new Error("sleeve_panels_required");
  for (const panel of input.panels) {
    if (!isSleeveSide(panel.side)) throw new Error("invalid_sleeve_side");
    if (!isQuadNorm(panel.targetQuadNorm)) throw new Error(`invalid_sleeve_quad:${panel.side}`);
    if (!isNormBbox(panel.sourceBboxNorm))
      throw new Error(`invalid_sleeve_source_bbox:${panel.side}`);
  }
  const { still, visibleMask, hiddenMask } = input;
  if (visibleMask.width !== still.width || visibleMask.height !== still.height) {
    throw new Error("visible_mask_size_mismatch");
  }
  if (hiddenMask.width !== still.width || hiddenMask.height !== still.height) {
    throw new Error("hidden_mask_size_mismatch");
  }
  if (input.chestOutput) {
    const slot = parseChestOutputSlot(input.chestOutput);
    if (!slot) throw new Error("invalid_chest_output_slot");
    if (slot.reservedMask) {
      if (slot.reservedMask.width !== still.width || slot.reservedMask.height !== still.height) {
        throw new Error("chest_reserved_mask_size_mismatch");
      }
    }
  }
}

export function sleevePanelClaimsNeverValidateHidden(): {
  hiddenShoulderToCuffValidated: false;
} {
  return { hiddenShoulderToCuffValidated: false };
}
