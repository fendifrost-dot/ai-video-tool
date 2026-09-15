/**
 * Lane B live sleeve-still scorecard (visible geometry only).
 *
 * Evidence-only. Does not import logoComposite / chest paint.
 * Decoder for live JPEGs must be ImageScript 1.3.0 (same as Lane E chest).
 */

import {
  BRIGHT_SKIN_LUMA,
  CHEST_CRITERION_DEFS,
  OUTSIDE_Y_BOTTOM,
  OUTSIDE_Y_TOP,
} from "../eval/chestCriteria";
import { lumaAt, pixelsMatch } from "../eval/pixelMath";
import type { PixelBox, RgbaImage as EvalRgba } from "../eval/types";
import {
  CANONICAL_HIDDEN_BOXES,
  LIVE_CHEST_RESERVED_QUAD_NORM,
  SEEDED_VISIBLE_SLEEVE_QUADS,
  SLEEVE_STILL_REPAIR_METHOD_VERSION,
} from "./liveStill";
import { countMask, fillMaskRect, quadNormToPts, rasterizeQuadMask } from "./raster";
import {
  SLEEVE_PANEL_CLAIM,
  SLEEVE_PANEL_CONTRACT_VERSION,
  type BinaryMask,
  type QuadNorm,
  type RgbaImage,
} from "./types";

export const SLEEVE_LIVE_SCORECARD_VERSION = "lane-b-sleeve-live-v1" as const;
export const SLEEVE_LIVE_EXPECTED_METHOD = SLEEVE_STILL_REPAIR_METHOD_VERSION;
export const PREFERRED_CHEST_OUTPUT_ASSET_ID = "9ed83c01-8c7d-4d1b-918f-87b0fc743c50";
export const CANONICAL_CLEAN_STILL_ASSET_ID = "2aa1a44c-b24a-46bf-890f-13a6fc65b1cc";

export type SleeveGate = "CLEARED" | "NOT_CLEARED" | "UNSCORED";
export type SleeveVerdict = "PASS" | "FAIL";

export type SleeveCriterionId = 1 | 2 | 3 | 4 | 5 | 6;

export type SleeveCriterionResult = {
  id: SleeveCriterionId;
  key: string;
  name: string;
  verdict: SleeveVerdict;
  metrics: Record<string, number>;
  note: string;
  failureReason: string | null;
};

export type SleeveLiveIdentityInput = {
  repairMethodVersion?: string | null;
  claim?: string | null;
  contractVersion?: string | null;
  geometryNote?: string | null;
  hiddenShoulderToCuffValidated?: boolean | null;
  repairStage?: string | null;
  sourceStillAssetId?: string | null;
  chestOutputAssetId?: string | null;
  consumedChestOutput?: boolean | null;
  temporalTrackingEnabled?: boolean | null;
  keyframeId?: string | null;
  leftQuad?: QuadNorm | null;
  rightQuad?: QuadNorm | null;
  leftPainted?: number | null;
  rightPainted?: number | null;
  leftRejectedHidden?: number | null;
  rightRejectedHidden?: number | null;
  leftRejectedChest?: number | null;
  rightRejectedChest?: number | null;
  geometryRejectedHttp400?: boolean | null;
};

export type SleevePixelProbe = {
  checked: number;
  changed: number;
  darkened: number;
  meanSrcLuma: number;
  meanOutLuma: number;
  navyLikeOut: number;
};

export type SleeveLiveScore = {
  schemaVersion: typeof SLEEVE_LIVE_SCORECARD_VERSION;
  gate: SleeveGate;
  passCount: number;
  failCount: number;
  criteria: SleeveCriterionResult[];
  identity: SleeveLiveIdentityInput;
  inputLineage: {
    sourceStillAssetId: string | null;
    preferredChestOutputUsed: boolean;
    chestOutputAssetId: string | null;
    note: string;
  };
  temporal: {
    TEMPORAL_LIVE_ACTIVATION_ARMED: false;
    temporalTrackingEnabled: boolean;
    activationMayProceedAfterCleared: boolean;
  };
};

const C5_WINDOWS = CHEST_CRITERION_DEFS.find((d) => d.id === 5)!.windows;
const QUAD_EPS = 0.012;

function asEval(img: RgbaImage): EvalRgba {
  return img;
}

function almostEqualQuad(a: QuadNorm, b: QuadNorm, eps = QUAD_EPS): boolean {
  for (let i = 0; i < 4; i++) {
    if (Math.abs(a[i]![0] - b[i]![0]) > eps) return false;
    if (Math.abs(a[i]![1] - b[i]![1]) > eps) return false;
  }
  return true;
}

function pixelQuadToNorm(quad: number[][], width: number, height: number): QuadNorm {
  return quad.map(([x, y]) => [x / width, y / height]) as QuadNorm;
}

export function pixelTargetQuadToNorm(
  target: unknown,
  width = 720,
  height = 1280,
): QuadNorm | null {
  if (!Array.isArray(target) || target.length !== 4) return null;
  const pts = target.map((p) => {
    if (!Array.isArray(p) || p.length < 2) return null;
    const x = Number(p[0]);
    const y = Number(p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return [x, y] as [number, number];
  });
  if (pts.some((p) => p == null)) return null;
  const nums = pts as [number, number][];
  const max = Math.max(...nums.flat());
  if (max > 1.5) return pixelQuadToNorm(nums, width, height);
  return nums as QuadNorm;
}

function probeMask(source: RgbaImage, output: RgbaImage, mask: BinaryMask): SleevePixelProbe {
  let checked = 0;
  let changed = 0;
  let darkened = 0;
  let srcSum = 0;
  let outSum = 0;
  let navyLikeOut = 0;
  for (let i = 0; i < mask.data.length; i++) {
    if (!mask.data[i]) continue;
    checked++;
    const x = i % source.width;
    const y = Math.floor(i / source.width);
    const srcL = lumaAt(asEval(source), x, y);
    const outL = lumaAt(asEval(output), x, y);
    srcSum += srcL;
    outSum += outL;
    const o = i * 4;
    const r = output.data[o]!;
    const g = output.data[o + 1]!;
    const b = output.data[o + 2]!;
    if (b > r + 10 && b > g && r < 110 && outL < 110) navyLikeOut++;
    if (!pixelsMatch(asEval(source), asEval(output), x, y)) {
      changed++;
      if (outL + 4 < srcL) darkened++;
    }
  }
  return {
    checked,
    changed,
    darkened,
    meanSrcLuma: checked ? srcSum / checked : 0,
    meanOutLuma: checked ? outSum / checked : 0,
    navyLikeOut,
  };
}

function fillNormBoxMask(
  width: number,
  height: number,
  box: { x0: number; y0: number; x1: number; y1: number },
): BinaryMask {
  const mask: BinaryMask = { width, height, data: new Uint8Array(width * height) };
  fillMaskRect(mask, box.x0 * width, box.y0 * height, box.x1 * width, box.y1 * height, 1);
  return mask;
}

function result(
  id: SleeveCriterionId,
  key: string,
  name: string,
  pass: boolean,
  metrics: Record<string, number>,
  note: string,
  failureReason: string | null,
): SleeveCriterionResult {
  return {
    id,
    key,
    name,
    verdict: pass ? "PASS" : "FAIL",
    metrics,
    note,
    failureReason: pass ? null : failureReason,
  };
}

export function scoreSleeveIdentity(input: SleeveLiveIdentityInput): SleeveCriterionResult {
  const methodOk = input.repairMethodVersion === SLEEVE_LIVE_EXPECTED_METHOD;
  const claimOk = input.claim === SLEEVE_PANEL_CLAIM;
  const hiddenOk = input.hiddenShoulderToCuffValidated === false;
  const stageOk = input.repairStage === "sleeve_panel" || input.repairStage == null;
  const contractOk =
    input.contractVersion == null || input.contractVersion === SLEEVE_PANEL_CONTRACT_VERSION;
  const geoNoteOk = input.geometryNote == null || input.geometryNote === "visible_upper_arm_only";
  const trackingOff = input.temporalTrackingEnabled !== true;
  const pass = methodOk && claimOk && hiddenOk && stageOk && contractOk && geoNoteOk && trackingOff;
  return result(
    1,
    "identity_visible_geometry_only",
    "Identity: current sleeve method + visible_geometry_only",
    pass,
    {
      methodOk: methodOk ? 1 : 0,
      claimOk: claimOk ? 1 : 0,
      hiddenUnvalidated: hiddenOk ? 1 : 0,
      stageOk: stageOk ? 1 : 0,
      trackingOff: trackingOff ? 1 : 0,
    },
    `Must persist repair_method_version ${SLEEVE_LIVE_EXPECTED_METHOD}, claim visible_geometry_only, hidden_shoulder_to_cuff_validated false, temporal off.`,
    pass
      ? null
      : `identity mismatch method=${input.repairMethodVersion} claim=${input.claim} hidden=${String(input.hiddenShoulderToCuffValidated)}`,
  );
}

export function scoreSleeveGeometry(input: SleeveLiveIdentityInput): SleeveCriterionResult {
  const left = input.leftQuad;
  const right = input.rightQuad;
  const leftOk = !!left && almostEqualQuad(left, SEEDED_VISIBLE_SLEEVE_QUADS.left);
  const rightOk = !!right && almostEqualQuad(right, SEEDED_VISIBLE_SLEEVE_QUADS.right);
  const no400 = input.geometryRejectedHttp400 !== true;
  const hiddenRejects = (input.leftRejectedHidden ?? 0) + (input.rightRejectedHidden ?? 0);
  const chestRejects = (input.leftRejectedChest ?? 0) + (input.rightRejectedChest ?? 0);
  const leftPaint = input.leftPainted ?? 0;
  const rightPaint = input.rightPainted ?? 0;
  const pass = leftOk && rightOk && no400 && leftPaint > 0 && rightPaint > 0;
  return result(
    2,
    "geometry_seeded_visible_upper_arm",
    "Geometry: seeded visible-upper-arm quads accepted (no HTTP 400)",
    pass,
    {
      leftOk: leftOk ? 1 : 0,
      rightOk: rightOk ? 1 : 0,
      no400: no400 ? 1 : 0,
      leftPainted: leftPaint,
      rightPainted: rightPaint,
      rejectedHidden: hiddenRejects,
      rejectedChestReserved: chestRejects,
    },
    "Seeded quads must match SEEDED_VISIBLE_SLEEVE_QUADS. A shoulder→cuff / face-high quad must 400, not save.",
    pass ? null : "quads, HTTP 400, or zero painted pixels",
  );
}

export function scoreC5Forearm(source: RgbaImage, output: RgbaImage): SleeveCriterionResult {
  const sleeve = C5_WINDOWS[0]!;
  const patch = C5_WINDOWS[1] ?? sleeve;
  let brightChecked = 0;
  let brightChanged = 0;
  for (let y = sleeve.y0; y <= sleeve.y1; y++) {
    for (let x = sleeve.x0; x <= sleeve.x1; x++) {
      if (lumaAt(asEval(source), x, y) < BRIGHT_SKIN_LUMA) continue;
      brightChecked++;
      if (!pixelsMatch(asEval(source), asEval(output), x, y)) brightChanged++;
    }
  }
  let patchDarkened = 0;
  for (let y = patch.y0; y <= patch.y1; y++) {
    for (let x = patch.x0; x <= patch.x1; x++) {
      const srcL = lumaAt(asEval(source), x, y);
      if (srcL <= 100) continue;
      if (srcL - lumaAt(asEval(output), x, y) >= 40) patchDarkened++;
    }
  }
  const pass = brightChanged === 0 && patchDarkened === 0;
  return result(
    3,
    "c5_forearm_preserved",
    "C5 sleeve/forearm + 4×3 zip-corner must not be wrecked",
    pass,
    { brightChecked, brightChanged, patchDarkened },
    "Same Lane E C5 windows as chest 1m (x330–380/y738–755 bright skin; x389–392/y746–748 cream).",
    pass
      ? null
      : `${brightChanged} bright sleeve bytes changed, ${patchDarkened} corner cream darkened`,
  );
}

export function scoreC11Outside(source: RgbaImage, output: RgbaImage): SleeveCriterionResult {
  const w = source.width;
  const h = source.height;
  let above = 0;
  let below = 0;
  for (let y = 0; y < OUTSIDE_Y_TOP; y++) {
    for (let x = 0; x < w; x++) {
      if (!pixelsMatch(asEval(source), asEval(output), x, y)) above++;
    }
  }
  for (let y = OUTSIDE_Y_BOTTOM; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!pixelsMatch(asEval(source), asEval(output), x, y)) below++;
    }
  }
  const pass = above === 0 && below === 0;
  return result(
    4,
    "c11_outside_region",
    "C11 outside-region: no paint above y600 or below y800",
    pass,
    { changedAboveY600: above, changedBelowY800: below, height: h, width: w },
    "Visible-upper-arm paint stays in the C11 gap (y 600–799). Face belt and distal cuff stay source.",
    pass ? null : `${above} px above y600, ${below} px below y800`,
  );
}

export function scoreChestReserved(source: RgbaImage, output: RgbaImage): SleeveCriterionResult {
  const reserved = rasterizeQuadMask(
    source.width,
    source.height,
    quadNormToPts(LIVE_CHEST_RESERVED_QUAD_NORM, source.width, source.height),
  );
  const probe = probeMask(source, output, reserved);
  const pass = probe.changed === 0;
  return result(
    5,
    "chest_reserved_untouched",
    "Chest reserved band (LIVE_CHEST_RESERVED_QUAD_NORM) byte-identical to input",
    pass,
    {
      reservedPixels: probe.checked,
      changed: probe.changed,
      consumedSlotDefault: 1,
    },
    "Lane B subtracts the 1m measured chest quad. It must not paint reserved pixels even when the input is the clean still rather than 9ed83c01.",
    pass ? null : `${probe.changed} reserved chest pixels changed`,
  );
}

export function scoreVisibleRepair(
  source: RgbaImage,
  output: RgbaImage,
  leftQuad: QuadNorm,
  rightQuad: QuadNorm,
): SleeveCriterionResult {
  const leftMask = rasterizeQuadMask(
    source.width,
    source.height,
    quadNormToPts(leftQuad, source.width, source.height),
  );
  const rightMask = rasterizeQuadMask(
    source.width,
    source.height,
    quadNormToPts(rightQuad, source.width, source.height),
  );
  const left = probeMask(source, output, leftMask);
  const right = probeMask(source, output, rightMask);
  const hiddenFace = probeMask(
    source,
    output,
    fillNormBoxMask(source.width, source.height, CANONICAL_HIDDEN_BOXES.face),
  );
  const crossed = probeMask(
    source,
    output,
    fillNormBoxMask(source.width, source.height, CANONICAL_HIDDEN_BOXES.crossedForearm),
  );

  const leftPass =
    left.changed > 0 && left.meanOutLuma + 8 < left.meanSrcLuma && left.navyLikeOut > 0;
  const rightPass =
    right.changed > 0 && right.meanOutLuma + 8 < right.meanSrcLuma && right.navyLikeOut > 0;
  const hiddenPass = hiddenFace.changed === 0 && crossed.changed === 0;
  const pass = leftPass && rightPass && hiddenPass;
  const failBits: string[] = [];
  if (!leftPass) {
    failBits.push(
      `left luma ${left.meanSrcLuma.toFixed(1)}→${left.meanOutLuma.toFixed(1)} (need navy-ward drop) navyLike=${left.navyLikeOut}/${left.checked}`,
    );
  }
  if (!rightPass) {
    failBits.push(
      `right luma ${right.meanSrcLuma.toFixed(1)}→${right.meanOutLuma.toFixed(1)} (need navy-ward drop) navyLike=${right.navyLikeOut}/${right.checked}`,
    );
  }
  if (!hiddenPass) {
    failBits.push(`hidden paint face=${hiddenFace.changed} crossedForearm=${crossed.changed}`);
  }

  return result(
    6,
    "visible_upper_arm_repaired",
    "Visible upper-arm quads painted navy-ward; hidden face / C5 pocket untouched",
    pass,
    {
      leftChanged: left.changed,
      leftChecked: left.checked,
      leftNavyLike: left.navyLikeOut,
      leftMeanSrcLuma: Number(left.meanSrcLuma.toFixed(2)),
      leftMeanOutLuma: Number(left.meanOutLuma.toFixed(2)),
      rightChanged: right.changed,
      rightChecked: right.checked,
      rightNavyLike: right.navyLikeOut,
      rightMeanSrcLuma: Number(right.meanSrcLuma.toFixed(2)),
      rightMeanOutLuma: Number(right.meanOutLuma.toFixed(2)),
      hiddenFaceChanged: hiddenFace.changed,
      crossedForearmChanged: crossed.changed,
      leftMaskPixels: countMask(leftMask),
      rightMaskPixels: countMask(rightMask),
    },
    "Contract: visible quads receive the flat-ref navy panel. Hidden shoulder→cuff is unvalidated and must not be claimed. Face + crossed-forearm C5 pocket stay source.",
    pass ? null : failBits.join("; "),
  );
}

export function evaluateSleeveStillLive(input: {
  source: RgbaImage;
  output: RgbaImage;
  identity: SleeveLiveIdentityInput;
}): SleeveLiveScore {
  const leftQuad = input.identity.leftQuad ?? SEEDED_VISIBLE_SLEEVE_QUADS.left;
  const rightQuad = input.identity.rightQuad ?? SEEDED_VISIBLE_SLEEVE_QUADS.right;
  const criteria: SleeveCriterionResult[] = [
    scoreSleeveIdentity(input.identity),
    scoreSleeveGeometry(input.identity),
    scoreC5Forearm(input.source, input.output),
    scoreC11Outside(input.source, input.output),
    scoreChestReserved(input.source, input.output),
    scoreVisibleRepair(input.source, input.output, leftQuad, rightQuad),
  ];
  const passCount = criteria.filter((c) => c.verdict === "PASS").length;
  const failCount = criteria.length - passCount;
  const preferredUsed = input.identity.chestOutputAssetId === PREFERRED_CHEST_OUTPUT_ASSET_ID;
  const gate: SleeveGate = failCount === 0 ? "CLEARED" : "NOT_CLEARED";
  return {
    schemaVersion: SLEEVE_LIVE_SCORECARD_VERSION,
    gate,
    passCount,
    failCount,
    criteria,
    identity: input.identity,
    inputLineage: {
      sourceStillAssetId: input.identity.sourceStillAssetId ?? null,
      preferredChestOutputUsed: preferredUsed,
      chestOutputAssetId: input.identity.chestOutputAssetId ?? null,
      note: preferredUsed
        ? "Sleeve input is the CLEARED 1m chest still 9ed83c01."
        : "Sleeve input is not 9ed83c01. Reserved chest quad still applied from LIVE_CHEST_RESERVED_QUAD_NORM. Chest still picker must stay on the clean capture (logo_chest chaining lock).",
    },
    temporal: {
      TEMPORAL_LIVE_ACTIVATION_ARMED: false,
      temporalTrackingEnabled: input.identity.temporalTrackingEnabled === true,
      activationMayProceedAfterCleared: gate === "CLEARED",
    },
  };
}

export function formatSleeveLiveSummary(score: SleeveLiveScore): string {
  const rows = score.criteria
    .map((c) => `  ${c.verdict} ${c.id} ${c.key}${c.failureReason ? ` — ${c.failureReason}` : ""}`)
    .join("\n");
  return `Lane B sleeve live ${score.schemaVersion}: ${score.gate} ${score.passCount}/6\n${rows}`;
}

export function sleeveLiveEvidenceCrops(): Array<{ id: string; box: PixelBox }> {
  return [
    { id: "left_upper_arm", box: { x0: 0, x1: 250, y0: 620, y1: 810 } },
    { id: "right_upper_arm", box: { x0: 470, x1: 719, y0: 620, y1: 810 } },
    { id: "chest_reserved", box: { x0: 200, x1: 630, y0: 660, y1: 770 } },
    { id: "c5_forearm", box: { x0: 320, x1: 420, y0: 730, y1: 760 } },
    { id: "c11_face_belt", box: { x0: 80, x1: 640, y0: 40, y1: 420 } },
  ];
}
