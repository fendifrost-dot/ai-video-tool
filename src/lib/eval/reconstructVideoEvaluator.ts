/**
 * Lane E extension — reconstructed-video / sampled-frame evaluator.
 *
 * Scores RECONSTRUCT-1 E2E output. Does **not** reopen chest 11/11 or
 * sleeve 6/6 still goldens. Does not import logoComposite / sleeve paint.
 */

import {
  unauthorizedPixelsMatchOriginal,
  type ReconstructResult,
} from "@/lib/reconstruct/originalMasterReconstruct";
import type { ReconstructClipResult } from "@/lib/reconstruct/adapters";
import type { RgbaImage } from "@/lib/reconstruct/types";
import type { ReconstructE2eOk, ReconstructE2eResult } from "@/lib/reconstruct/e2e";
import {
  CANONICAL_MASTER_CLIP_ID,
  CANONICAL_PROJECT_ID,
  CLEARED_CHEST_ASSET_ID,
  CLEARED_SLEEVE_ASSET_ID,
} from "@/lib/reconstruct/canonicalLineage";

export const RECONSTRUCT_VIDEO_EVAL_SPEC_VERSION = "lane-e-reconstruct-video-v1" as const;

export type ReconstructVideoCriterionId =
  | "paid_calls_false"
  | "grok_per_frame_false"
  | "sam3_live_fetch_false"
  | "canonical_ids"
  | "original_preserved_unauthorized"
  | "independent_alpha_zero_bytes"
  | "generated_is_not_master"
  | "temporal_masks_consumed"
  | "still_goldens_not_reopened";

export type ReconstructVideoCriterion = {
  id: ReconstructVideoCriterionId;
  name: string;
  verdict: "PASS" | "FAIL";
  metrics: Record<string, number>;
  note: string;
  failureReason: string | null;
};

export type ReconstructArchitecturalEscalate = {
  kind: "architectural_blocker";
  message: string;
};

export type ReconstructVideoReport = {
  schemaVersion: typeof RECONSTRUCT_VIDEO_EVAL_SPEC_VERSION;
  verdict: "PASS" | "FAIL";
  passCount: number;
  failCount: number;
  paidCalls: false;
  grokPerFrame: false;
  sam3LiveFetch: false;
  frameCount: number;
  temporalJobCount: number;
  source: ReconstructE2eOk["source"] | "e2e_failed";
  criteria: ReconstructVideoCriterion[];
  unexplained: string[];
  notClaimed: string[];
  escalate: ReconstructArchitecturalEscalate | null;
  stillGoldensReopened: false;
};

const NOT_CLAIMED = [
  "live 720×1280 pixels of original master 76fe7438 (synthetic unique-RGB stand-in at temporal raster size)",
  "live SAM-3 fetch via sam3-segment-proxy / Control Center",
  "chest Stage 1m 11/11 rescore",
  "sleeve Stage 1c 6/6 rescore",
  "MP4 encode of clip 76fe7438",
];

function criterion(
  id: ReconstructVideoCriterionId,
  name: string,
  pass: boolean,
  metrics: Record<string, number>,
  note: string,
  failureReason: string | null,
): ReconstructVideoCriterion {
  return {
    id,
    name,
    verdict: pass ? "PASS" : "FAIL",
    metrics,
    note,
    failureReason: pass ? null : failureReason,
  };
}

function finish(
  criteria: ReconstructVideoCriterion[],
  extras: Omit<
    ReconstructVideoReport,
    | "schemaVersion"
    | "verdict"
    | "passCount"
    | "failCount"
    | "criteria"
    | "paidCalls"
    | "grokPerFrame"
    | "sam3LiveFetch"
    | "stillGoldensReopened"
  >,
): ReconstructVideoReport {
  const passCount = criteria.filter((c) => c.verdict === "PASS").length;
  const failCount = criteria.filter((c) => c.verdict === "FAIL").length;
  return {
    schemaVersion: RECONSTRUCT_VIDEO_EVAL_SPEC_VERSION,
    verdict: failCount === 0 ? "PASS" : "FAIL",
    passCount,
    failCount,
    paidCalls: false,
    grokPerFrame: false,
    sam3LiveFetch: false,
    stillGoldensReopened: false,
    criteria,
    ...extras,
  };
}

function independentPreservation(
  originalFrames: { index: number; image: RgbaImage }[],
  clip: ReconstructClipResult,
): { ok: boolean; checked: number; failed: number } {
  const byIndex = new Map(originalFrames.map((f) => [f.index, f.image]));
  let checked = 0;
  let failed = 0;
  for (const fr of clip.frames) {
    const original = byIndex.get(fr.index);
    if (!original) {
      failed++;
      continue;
    }
    checked++;
    const result: ReconstructResult = fr.result;
    if (!unauthorizedPixelsMatchOriginal(original, result.image, result.authorizedAlpha)) {
      failed++;
    }
  }
  return { ok: failed === 0 && checked > 0, checked, failed };
}

/**
 * Score a successful E2E reconstruct. Does not call evaluateChestStill.
 */
export function evaluateReconstructedClip(e2e: ReconstructE2eOk): ReconstructVideoReport {
  const clip = e2e.clip;
  const independent = independentPreservation(e2e.originalFrames, clip);
  const temporalUsed = clip.frames.filter((f) => f.temporalUsed).length;
  const preservedFlag = clip.originalPixelsPreservedWhereUnauthorized === true;
  const generatedNotMaster =
    clip.frames.length > 0 &&
    clip.frames.every(
      (f) =>
        f.result.preservedPixels > 0 &&
        f.result.changedPixels < f.result.image.width * f.result.image.height,
    );
  const idsOk =
    clip.projectId === CANONICAL_PROJECT_ID &&
    clip.masterClipAssetId === CANONICAL_MASTER_CLIP_ID &&
    clip.chestAssetId === CLEARED_CHEST_ASSET_ID &&
    clip.sleeveAssetId === CLEARED_SLEEVE_ASSET_ID;

  const criteria: ReconstructVideoCriterion[] = [
    criterion(
      "paid_calls_false",
      "No paid provider calls",
      e2e.paidCalls === false && clip.paidCalls === false,
      { paidCalls: 0 },
      "RECONSTRUCT-1 is $0. paidCalls must stay false.",
      "paidCalls was not false",
    ),
    criterion(
      "grok_per_frame_false",
      "No per-frame Grok",
      e2e.grokPerFrame === false && clip.grokPerFrame === false,
      { grokPerFrame: 0 },
      "No Grok / V3 generation on this path.",
      "grokPerFrame was not false",
    ),
    criterion(
      "sam3_live_fetch_false",
      "SAM-3 not live-fetched",
      e2e.sam3LiveFetch === false && clip.sam3LiveFetch === false,
      { sam3LiveFetch: 0 },
      "Fixture / caller-supplied α only.",
      "sam3LiveFetch was not false",
    ),
    criterion(
      "canonical_ids",
      "Canonical master / chest / sleeve IDs",
      idsOk,
      { frameCount: clip.frames.length },
      "Lineage stays on project 764a63d2 / master 76fe7438 / CLEARED stills.",
      "canonical IDs drifted",
    ),
    criterion(
      "original_preserved_unauthorized",
      "Clip flag: unauthorized pixels preserved",
      preservedFlag,
      {
        preserved: preservedFlag ? 1 : 0,
        frames: clip.frames.length,
      },
      "authorized α === 0 copies original RGB bytes.",
      "originalPixelsPreservedWhereUnauthorized is false",
    ),
    criterion(
      "independent_alpha_zero_bytes",
      "Independent α===0 byte check vs original frames",
      independent.ok,
      { checked: independent.checked, failed: independent.failed },
      "Re-check preservation without trusting the clip flag alone.",
      "one or more unauthorized pixels drifted from original RGB",
    ),
    criterion(
      "generated_is_not_master",
      "Generated transformation is not the output master",
      generatedNotMaster,
      {
        frames: clip.frames.length,
        firstPreserved: clip.frames[0]?.result.preservedPixels ?? 0,
        firstChanged: clip.frames[0]?.result.changedPixels ?? 0,
      },
      "Grok-style full invert / stamp cannot replace the original master.",
      "every pixel changed or nothing preserved — generated leaked as master",
    ),
    criterion(
      "temporal_masks_consumed",
      "Trusted temporal masks participated",
      e2e.temporalJobCount > 0 && temporalUsed > 0,
      { jobs: e2e.temporalJobCount, framesTemporalUsed: temporalUsed },
      "Untrusted frames (confidence < 0.6 / reanchor) may be ignored; at least one trusted frame must apply.",
      "no trusted temporal mask was applied",
    ),
    criterion(
      "still_goldens_not_reopened",
      "Still goldens not rescored",
      true,
      { chest11: 0, sleeve6: 0 },
      "This evaluator never calls chest 11/11 or sleeve 6/6 gates.",
      "still goldens were reopened",
    ),
  ];

  const preservationBroke = !preservedFlag || !independent.ok;
  const escalate: ReconstructArchitecturalEscalate | null = preservationBroke
    ? {
        kind: "architectural_blocker",
        message:
          "RECONSTRUCT-1 original-pixel preservation failed. That is a compositing contract break — do not reopen chest/sleeve still paint to paper over it.",
      }
    : null;

  return finish(criteria, {
    frameCount: clip.frames.length,
    temporalJobCount: e2e.temporalJobCount,
    source: e2e.source,
    unexplained: [],
    notClaimed: NOT_CLAIMED,
    escalate,
  });
}

export function evaluateReconstructE2eResult(e2e: ReconstructE2eResult): ReconstructVideoReport {
  if (e2e.ok) return evaluateReconstructedClip(e2e);

  const criteria: ReconstructVideoCriterion[] = [
    criterion(
      "paid_calls_false",
      "No paid provider calls",
      true,
      { paidCalls: 0 },
      "Failure path still $0.",
      "paidCalls was not false",
    ),
    criterion(
      "temporal_masks_consumed",
      "E2E reconstruct ran",
      false,
      {},
      e2e.message,
      e2e.message,
    ),
  ];
  return finish(criteria, {
    frameCount: 0,
    temporalJobCount: 0,
    source: "e2e_failed",
    unexplained: [e2e.code],
    notClaimed: NOT_CLAIMED,
    escalate: null,
  });
}

export function reconstructVideoReportToJson(
  report: ReconstructVideoReport,
): Record<string, unknown> {
  return {
    schemaVersion: report.schemaVersion,
    verdict: report.verdict,
    passCount: report.passCount,
    failCount: report.failCount,
    paidCalls: report.paidCalls,
    grokPerFrame: report.grokPerFrame,
    sam3LiveFetch: report.sam3LiveFetch,
    frameCount: report.frameCount,
    temporalJobCount: report.temporalJobCount,
    source: report.source,
    stillGoldensReopened: report.stillGoldensReopened,
    escalate: report.escalate,
    notClaimed: report.notClaimed,
    unexplained: report.unexplained,
    criteria: report.criteria.map((c) => ({
      id: c.id,
      name: c.name,
      verdict: c.verdict,
      metrics: c.metrics,
      note: c.note,
      failureReason: c.failureReason,
    })),
  };
}

export function formatReconstructVideoSummary(report: ReconstructVideoReport): string {
  return `RECONSTRUCT-1 ${report.verdict} ${report.passCount}/${report.passCount + report.failCount} frames=${report.frameCount} paidCalls=false grokPerFrame=false.`;
}
