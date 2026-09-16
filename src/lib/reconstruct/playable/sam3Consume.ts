/**
 * Production SAM-3 consume for the playable reconstruct path.
 *
 * $0: does not call sam3-segment-proxy / Control Center.
 * Intended mask = Stage 1h evidence alphas on the 720×1280 still raster
 * (VERIFIED crease/wedge/hand profile). Caller-supplied masks are accepted
 * only at the working size. Size mismatch fails closed — no silent fixture.
 */

import {
  buildStage1hSam3EvidenceAlphas,
  STAGE1H_SAM3_EVIDENCE,
} from "@/lib/garment/fixtures/architectureCStill1hSam3Evidence";
import type { ConsumedSam3Mask } from "../adapters";
import type { Sam3FailureBehavior, Sam3Provenance } from "./contract";
import { PLAYABLE_WORKING_HEIGHT, PLAYABLE_WORKING_WIDTH } from "./contract";

export const INTENDED_SAM3_EVIDENCE_ID = "architecture_c_still_1h_sam3" as const;

export type Sam3ConsumeOk = {
  ok: true;
  mask: ConsumedSam3Mask;
  provenance: Sam3Provenance;
};

export type Sam3ConsumeFail = {
  ok: false;
  provenance: Sam3Provenance;
  code: string;
  message: string;
};

export type Sam3ConsumeResult = Sam3ConsumeOk | Sam3ConsumeFail;

export type ConsumeSam3Input = {
  width: number;
  height: number;
  /** When omitted, the intended Stage 1h evidence is used. */
  caller?: ConsumedSam3Mask;
  required?: boolean;
};

function coverage(alpha: Float32Array): number {
  let n = 0;
  for (let i = 0; i < alpha.length; i++) {
    if ((alpha[i] ?? 0) > 0.5) n++;
  }
  return alpha.length === 0 ? 0 : n / alpha.length;
}

function fail(
  width: number,
  height: number,
  code: string,
  message: string,
  behavior: Sam3FailureBehavior,
): Sam3ConsumeFail {
  return {
    ok: false,
    code,
    message,
    provenance: {
      source: "missing",
      evidenceId: null,
      sourceCommit: null,
      repairMethodVersion: null,
      liveFetch: false,
      fallbackStatus: "rejected_not_used",
      failureBehavior: behavior,
      failure: { code, message },
      width,
      height,
      outfitCoverage: 0,
      repairCoverage: 0,
    },
  };
}

function intendedMask(width: number, height: number): ConsumedSam3Mask {
  const alphas = buildStage1hSam3EvidenceAlphas(width, height);
  const repair = new Float32Array(width * height);
  for (let i = 0; i < repair.length; i++) {
    const hands = alphas.handsAlpha[i] ?? 0;
    const face = alphas.faceAlpha[i] ?? 0;
    repair[i] = hands > face ? hands : face;
  }
  return {
    width,
    height,
    outfitAlpha: alphas.outfitBasedAlpha,
    repairAlpha: repair,
    source: "caller_supplied",
    liveFetch: false,
  };
}

/**
 * Consume the intended SAM-3 segmentation / occlusion for a playable clip.
 * Fail-closed on missing (when required) or size mismatch. Never live-fetches.
 */
export function consumeIntendedSam3(input: ConsumeSam3Input): Sam3ConsumeResult {
  const required = input.required !== false;
  const { width, height } = input;

  if (input.caller) {
    if (input.caller.width !== width || input.caller.height !== height) {
      return fail(
        width,
        height,
        "sam3_size_mismatch",
        `SAM-3 ${input.caller.width}×${input.caller.height} does not match working raster ${width}×${height}`,
        "fail_closed_size_mismatch",
      );
    }
    if (input.caller.outfitAlpha.length !== width * height) {
      return fail(
        width,
        height,
        "sam3_size_mismatch",
        "SAM-3 outfitAlpha length is not width×height",
        "fail_closed_size_mismatch",
      );
    }
    return {
      ok: true,
      mask: { ...input.caller, liveFetch: false },
      provenance: {
        source: "caller_supplied",
        evidenceId: null,
        sourceCommit: null,
        repairMethodVersion: null,
        liveFetch: false,
        fallbackStatus: "none",
        failureBehavior: "fail_closed_size_mismatch",
        failure: null,
        width,
        height,
        outfitCoverage: coverage(input.caller.outfitAlpha),
        repairCoverage: input.caller.repairAlpha ? coverage(input.caller.repairAlpha) : 0,
      },
    };
  }

  if (!required) {
    return fail(width, height, "sam3_missing", "SAM-3 omitted and not required", "none");
  }

  if (width !== PLAYABLE_WORKING_WIDTH || height !== PLAYABLE_WORKING_HEIGHT) {
    return fail(
      width,
      height,
      "sam3_intended_size_mismatch",
      `Intended Stage 1h SAM-3 is ${PLAYABLE_WORKING_WIDTH}×${PLAYABLE_WORKING_HEIGHT}; got ${width}×${height}`,
      "fail_closed_size_mismatch",
    );
  }

  const mask = intendedMask(width, height);
  return {
    ok: true,
    mask,
    provenance: {
      source: "intended_stage1h_evidence",
      evidenceId: INTENDED_SAM3_EVIDENCE_ID,
      sourceCommit: STAGE1H_SAM3_EVIDENCE.sourceCommit,
      repairMethodVersion: STAGE1H_SAM3_EVIDENCE.repairMethodVersion,
      liveFetch: false,
      fallbackStatus: "none",
      failureBehavior: "fail_closed_size_mismatch",
      failure: null,
      width,
      height,
      outfitCoverage: coverage(mask.outfitAlpha),
      repairCoverage: mask.repairAlpha ? coverage(mask.repairAlpha) : 0,
    },
  };
}
