/**
 * RECONSTRUCT-1 E2E — compose temporal jobs + CLEARED stills onto
 * original-master frames. $0 / no Grok / no SAM-3 fetch / no new edge.
 *
 * Isolated. Does not import temporal authorize constants, logoComposite,
 * sleevePanel paint, or still-repair goldens.
 */

import {
  reconstructMasterClip,
  type ConsumedTemporalJob,
  type ReconstructClipResult,
} from "./adapters";
import {
  CANONICAL_MASTER_CLIP_ID,
  CANONICAL_PROJECT_ID,
  CANONICAL_STILL_ASSET_ID,
  CLEARED_CHEST_ASSET_ID,
  CLEARED_SLEEVE_ASSET_ID,
} from "./canonicalLineage";
import {
  CHEST_STILL_RGB,
  SLEEVE_STILL_RGB,
  fixtureSam3Mask,
  flatStill,
  reconstructQaFixturePack,
  uniqueOriginalFrame,
} from "./fixtures/liveWiringFixture";
import {
  DEFAULT_CHEST_STILL_GATE,
  DEFAULT_SLEEVE_STILL_GATE,
  evaluateReconstructLiveWiring,
  type ReconstructLiveWiringDecision,
} from "./liveWiring";
import { consumeSam3ForReconstruct, type Sam3ConsumeProvenance } from "./sam3Consume";
import type { RgbaImage } from "./types";

export const RECONSTRUCT_E2E_VERSION = "1.0.0";

export type ReconstructE2eSource = "live_temporal_jobs" | "fixture_temporal_jobs";

export type ReconstructE2eOk = {
  ok: true;
  e2eVersion: typeof RECONSTRUCT_E2E_VERSION;
  source: ReconstructE2eSource;
  paidCalls: false;
  grokPerFrame: false;
  sam3LiveFetch: false;
  provider: "none";
  edgeFunction: null;
  explicitArm: true;
  projectId: string;
  masterClipAssetId: string;
  stillAssetId: string;
  chestAssetId: string;
  sleeveAssetId: string;
  width: number;
  height: number;
  frameCount: number;
  temporalJobCount: number;
  originalFrames: { index: number; image: RgbaImage }[];
  clip: ReconstructClipResult;
  decision: ReconstructLiveWiringDecision;
  sam3Provenance: Sam3ConsumeProvenance;
  fps: number;
  durationSec: number;
};

export type ReconstructE2eFail = {
  ok: false;
  e2eVersion: typeof RECONSTRUCT_E2E_VERSION;
  paidCalls: false;
  grokPerFrame: false;
  sam3LiveFetch: false;
  provider: "none";
  edgeFunction: null;
  error: string;
  code: string;
  message: string;
  decision?: ReconstructLiveWiringDecision;
};

export type ReconstructE2eResult = ReconstructE2eOk | ReconstructE2eFail;

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function isFiniteInt(n: unknown): n is number {
  return isFiniteNumber(n) && Number.isInteger(n);
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/**
 * Structural consume of temporal-propagate-proxy job JSON.
 * Does not import Lane C authorize / livePrep.
 */
export function consumeTemporalJobsFromPropagateResult(
  raw: unknown,
): { ok: true; jobs: ConsumedTemporalJob[] } | { ok: false; message: string } {
  const root = asRecord(raw);
  const list = Array.isArray(raw) ? raw : root && Array.isArray(root.jobs) ? root.jobs : null;
  if (!list || list.length === 0) {
    return { ok: false, message: "temporal jobs missing or empty" };
  }

  const jobs: ConsumedTemporalJob[] = [];
  for (let j = 0; j < list.length; j++) {
    const job = asRecord(list[j]);
    if (!job) return { ok: false, message: `jobs[${j}] must be an object` };
    const kind = typeof job.kind === "string" ? job.kind : "";
    const sourceAssetId = typeof job.sourceAssetId === "string" ? job.sourceAssetId : "";
    if (!kind) return { ok: false, message: `jobs[${j}].kind required` };
    if (!sourceAssetId) return { ok: false, message: `jobs[${j}].sourceAssetId required` };
    if (!Array.isArray(job.frames) || job.frames.length === 0) {
      return { ok: false, message: `jobs[${j}].frames must be a non-empty array` };
    }
    const frames: ConsumedTemporalJob["frames"] = [];
    for (let i = 0; i < job.frames.length; i++) {
      const fr = asRecord(job.frames[i]);
      if (!fr) return { ok: false, message: `jobs[${j}].frames[${i}] must be an object` };
      if (!isFiniteInt(fr.index) || fr.index < 0) {
        return { ok: false, message: `jobs[${j}].frames[${i}].index invalid` };
      }
      if (!isFiniteInt(fr.width) || fr.width < 1) {
        return { ok: false, message: `jobs[${j}].frames[${i}].width invalid` };
      }
      if (!isFiniteInt(fr.height) || fr.height < 1) {
        return { ok: false, message: `jobs[${j}].frames[${i}].height invalid` };
      }
      if (!Array.isArray(fr.mask) || fr.mask.length !== fr.width * fr.height) {
        return { ok: false, message: `jobs[${j}].frames[${i}].mask length must be width*height` };
      }
      const mask = new Float32Array(fr.mask.length);
      for (let k = 0; k < fr.mask.length; k++) {
        const v = fr.mask[k];
        if (!isFiniteNumber(v)) {
          return { ok: false, message: `jobs[${j}].frames[${i}].mask[${k}] invalid` };
        }
        mask[k] = v;
      }
      const confidence = isFiniteNumber(fr.confidence) ? fr.confidence : 0;
      frames.push({
        index: fr.index,
        width: fr.width,
        height: fr.height,
        mask,
        confidence,
        reanchorRecommended: fr.reanchorRecommended === true,
      });
    }
    jobs.push({ kind, sourceAssetId, frames });
  }
  return { ok: true, jobs };
}

export function packFromTemporalJobs(
  jobs: ConsumedTemporalJob[],
  options?: { originalFrames?: { index: number; image: RgbaImage }[] },
) {
  const first = jobs[0]?.frames[0];
  if (!first) {
    throw new Error("reconstruct_e2e_empty_temporal");
  }
  const { width, height } = first;
  const indices = new Set<number>();
  for (const job of jobs) {
    for (const fr of job.frames) {
      if (fr.width !== width || fr.height !== height) {
        throw new Error("reconstruct_e2e_temporal_size_mismatch");
      }
      indices.add(fr.index);
    }
  }
  const supplied = options?.originalFrames;
  let originalFrames: { index: number; image: RgbaImage }[];
  if (supplied && supplied.length > 0) {
    const ow = supplied[0]!.image.width;
    const oh = supplied[0]!.image.height;
    for (const fr of supplied) {
      if (fr.image.width !== ow || fr.image.height !== oh) {
        throw new Error("reconstruct_e2e_original_size_mismatch");
      }
    }
    originalFrames = supplied;
  } else {
    originalFrames = [...indices]
      .sort((a, b) => a - b)
      .map((index) => ({ index, image: uniqueOriginalFrame(index, width, height) }));
  }
  const ow = originalFrames[0]!.image.width;
  const oh = originalFrames[0]!.image.height;
  return {
    width: ow,
    height: oh,
    temporalWidth: width,
    temporalHeight: height,
    originalFrames,
    chestStill: {
      assetId: CLEARED_CHEST_ASSET_ID,
      image: flatStill(CHEST_STILL_RGB, ow, oh),
    },
    sleeveStill: {
      assetId: CLEARED_SLEEVE_ASSET_ID,
      image: flatStill(SLEEVE_STILL_RGB, ow, oh),
    },
    sam3: fixtureSam3Mask(ow, oh),
    temporalJobs: jobs,
  };
}

export type RunReconstructE2eInput = {
  /** UI click is the product arm. Default false (same as dispatch). */
  explicitArm?: boolean;
  /** Live temporal-propagate-proxy JSON (or `{ jobs }`). */
  temporalPropagateResult?: unknown;
  /**
   * Unit/offline path. Ignored when temporalPropagateResult is provided.
   * Live UI must pass temporal jobs; it does not silently substitute fixtures.
   */
  allowFixtureTemporal?: boolean;
  /**
   * Original-master frames (any raster). When omitted, unique-RGB stand-ins
   * are sized to the temporal raster. Lane D2 passes 720×1280 unique-RGB here.
   */
  originalFrames?: { index: number; image: RgbaImage }[];
  /** Alternate master clip — no clip-specific reconstruct branch. */
  masterClipAssetId?: string;
  projectId?: string;
  clipId?: string;
  fps?: number;
  /** SAM-3 JSON. Live path/maskPath → fixture fallback. Never fetched. */
  sam3?: unknown;
  allowFixtureSam3?: boolean;
};

function fail(
  code: string,
  message: string,
  decision?: ReconstructLiveWiringDecision,
): ReconstructE2eFail {
  return {
    ok: false,
    e2eVersion: RECONSTRUCT_E2E_VERSION,
    paidCalls: false,
    grokPerFrame: false,
    sam3LiveFetch: false,
    provider: "none",
    edgeFunction: null,
    error: code,
    code,
    message,
    decision,
  };
}

/**
 * Authorize → stamp CLEARED stills → reconstruct onto original-master
 * stand-in frames. Never calls Grok / Fal / SAM-3 / a new edge.
 */
export function runReconstructE2e(input: RunReconstructE2eInput = {}): ReconstructE2eResult {
  const explicitArm = input.explicitArm === true;
  const decision = evaluateReconstructLiveWiring({
    chestGate: DEFAULT_CHEST_STILL_GATE,
    sleeveGate: DEFAULT_SLEEVE_STILL_GATE,
    explicitArm,
  });
  if (!decision.allowed) {
    const code = decision.waitingFor[0] ?? "live_wiring_not_armed";
    return fail(
      code,
      decision.reasons[0] ?? "original-master reconstruct is not authorized",
      decision,
    );
  }

  let source: ReconstructE2eSource;
  let pack: ReturnType<typeof packFromTemporalJobs> | ReturnType<typeof reconstructQaFixturePack>;

  if (input.temporalPropagateResult !== undefined) {
    const consumed = consumeTemporalJobsFromPropagateResult(input.temporalPropagateResult);
    if (!consumed.ok) return fail("invalid_temporal", consumed.message, decision);
    try {
      pack = packFromTemporalJobs(consumed.jobs, {
        originalFrames: input.originalFrames,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "reconstruct_e2e_pack_failed";
      return fail("invalid_temporal", message, decision);
    }
    source = "live_temporal_jobs";
  } else if (input.allowFixtureTemporal === true) {
    pack = reconstructQaFixturePack({
      masterClipAssetId: input.masterClipAssetId,
      projectId: input.projectId,
      clipId: input.clipId,
      fps: input.fps,
    });
    source = "fixture_temporal_jobs";
  } else {
    return fail(
      "temporal_jobs_required",
      "Live RECONSTRUCT-1 E2E requires temporal-propagate jobs; fixture fallback is test-only.",
      decision,
    );
  }

  try {
    const fps =
      input.fps ??
      ("fps" in pack && typeof pack.fps === "number" && pack.fps > 0 ? pack.fps : 24);
    const masterClipAssetId =
      input.masterClipAssetId ??
      ("masterClipAssetId" in pack && typeof pack.masterClipAssetId === "string"
        ? pack.masterClipAssetId
        : CANONICAL_MASTER_CLIP_ID);
    const projectId =
      input.projectId ??
      ("projectId" in pack && typeof pack.projectId === "string"
        ? pack.projectId
        : CANONICAL_PROJECT_ID);
    const clipId = input.clipId ?? masterClipAssetId;

    const sam3Consumed = consumeSam3ForReconstruct({
      raw: input.sam3 !== undefined ? input.sam3 : pack.sam3,
      expectedWidth: pack.width,
      expectedHeight: pack.height,
      allowFixtureFallback: input.allowFixtureSam3 !== false,
    });
    if (!sam3Consumed.ok) {
      return fail(sam3Consumed.code, sam3Consumed.message, decision);
    }

    const clip = reconstructMasterClip({
      originalFrames: pack.originalFrames,
      chestStill: pack.chestStill,
      sleeveStill: pack.sleeveStill,
      sam3: sam3Consumed.sam3,
      temporalJobs: pack.temporalJobs,
      projectId,
      masterClipAssetId,
      clipId,
      fps,
    });
    return {
      ok: true,
      e2eVersion: RECONSTRUCT_E2E_VERSION,
      source,
      paidCalls: false,
      grokPerFrame: false,
      sam3LiveFetch: false,
      provider: "none",
      edgeFunction: null,
      explicitArm: true,
      projectId,
      masterClipAssetId,
      stillAssetId: CANONICAL_STILL_ASSET_ID,
      chestAssetId: clip.chestAssetId,
      sleeveAssetId: clip.sleeveAssetId,
      width: pack.width,
      height: pack.height,
      frameCount: clip.frames.length,
      temporalJobCount: pack.temporalJobs.length,
      originalFrames: pack.originalFrames,
      clip,
      decision,
      sam3Provenance: sam3Consumed.provenance,
      fps,
      durationSec: clip.frames.length / fps,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "reconstruct_failed";
    return fail("reconstruct_failed", message, decision);
  }
}
