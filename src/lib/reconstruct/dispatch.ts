/**
 * Isolated original-master reconstruct wire protocol.
 * evaluateReconstructLiveWiring → reconstructMasterClip.
 * No Grok / Fal / CC / SAM-3 fetch / proxy auth.
 */

import { reconstructMasterClip, type ConsumedSam3Mask, type ConsumedTemporalJob } from "./adapters";
import { CLEARED_CHEST_ASSET_ID, CLEARED_SLEEVE_ASSET_ID } from "./canonicalLineage";
import {
  DEFAULT_CHEST_STILL_GATE,
  DEFAULT_SLEEVE_STILL_GATE,
  RECONSTRUCT_LIVE_WIRING_CONTRACT_VERSION,
  evaluateReconstructLiveWiring,
  type ReconstructLiveWiringDecision,
  type StillGate,
} from "./liveWiring";
import type { RgbaImage } from "./types";

export const RECONSTRUCT_DISPATCH_VERSION = "1.0.0";

export const RECONSTRUCT_DISPATCH_LIMITS = {
  maxFrames: 8,
  maxWidth: 64,
  maxHeight: 64,
} as const;

export interface ReconstructWireFrame {
  index: number;
  width: number;
  height: number;
  rgba: number[];
}

export interface ReconstructWireStill {
  assetId?: string;
  width: number;
  height: number;
  rgba: number[];
}

export interface ReconstructWireSam3 {
  width: number;
  height: number;
  outfitAlpha: number[];
  repairAlpha?: number[];
  source?: "fixture" | "caller_supplied";
}

export interface ReconstructWireTemporalFrame {
  index: number;
  width: number;
  height: number;
  mask: number[];
  confidence: number;
  reanchorRecommended?: boolean;
}

export interface ReconstructWireTemporalJob {
  kind: string;
  sourceAssetId: string;
  frames: ReconstructWireTemporalFrame[];
}

export interface ReconstructWireBody {
  clipId?: string;
  projectId?: string;
  masterClipAssetId?: string;
  originalFrames?: ReconstructWireFrame[];
  generatedFrames?: ReconstructWireFrame[];
  chestStill?: ReconstructWireStill;
  sleeveStill?: ReconstructWireStill;
  sam3?: ReconstructWireSam3;
  temporalJobs?: ReconstructWireTemporalJob[];
  chestGate?: StillGate;
  sleeveGate?: StillGate;
  temporalArmed?: boolean;
  explicitArm?: boolean;
}

export type ReconstructDispatchResult =
  | {
      ok: true;
      status: 200;
      body: {
        ok: true;
        dispatchVersion: typeof RECONSTRUCT_DISPATCH_VERSION;
        contractVersion: typeof RECONSTRUCT_LIVE_WIRING_CONTRACT_VERSION;
        paidCalls: false;
        grokPerFrame: false;
        sam3LiveFetch: false;
        provider: "none";
        edgeFunction: null;
        clip: ReturnType<typeof reconstructMasterClip>;
      };
    }
  | {
      ok: false;
      status: 400 | 403;
      body: {
        ok: false;
        error: string;
        code: string;
        message: string;
        decision?: ReconstructLiveWiringDecision;
      };
    };

function isFiniteInt(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && Number.isInteger(n);
}

function parseRgbaFrame(
  raw: ReconstructWireFrame,
  label: string,
): { index: number; image: RgbaImage } | string {
  if (!isFiniteInt(raw.index) || raw.index < 0) return `${label}.index invalid`;
  if (
    !isFiniteInt(raw.width) ||
    raw.width < 1 ||
    raw.width > RECONSTRUCT_DISPATCH_LIMITS.maxWidth
  ) {
    return `${label}.width out of range`;
  }
  if (
    !isFiniteInt(raw.height) ||
    raw.height < 1 ||
    raw.height > RECONSTRUCT_DISPATCH_LIMITS.maxHeight
  ) {
    return `${label}.height out of range`;
  }
  if (!Array.isArray(raw.rgba)) return `${label}.rgba must be a number array`;
  if (raw.rgba.length !== raw.width * raw.height * 4) {
    return `${label}.rgba length must be width*height*4`;
  }
  const data = new Uint8Array(raw.rgba.length);
  for (let i = 0; i < raw.rgba.length; i++) {
    const v = raw.rgba[i];
    if (typeof v !== "number" || !Number.isFinite(v)) return `${label}.rgba[${i}] invalid`;
    data[i] = Math.max(0, Math.min(255, Math.round(v)));
  }
  return { index: raw.index, image: { width: raw.width, height: raw.height, data } };
}

function parseStill(raw: ReconstructWireStill | undefined, label: string, fallbackId: string) {
  if (!raw) return { ok: false as const, message: `${label} is required` };
  const parsed = parseRgbaFrame(
    { index: 0, width: raw.width, height: raw.height, rgba: raw.rgba },
    label,
  );
  if (typeof parsed === "string") return { ok: false as const, message: parsed };
  return {
    ok: true as const,
    still: {
      assetId: typeof raw.assetId === "string" && raw.assetId.length > 0 ? raw.assetId : fallbackId,
      image: parsed.image,
    },
  };
}

function parseSam3(raw: ReconstructWireSam3 | undefined): ConsumedSam3Mask | string {
  if (!raw) return "sam3 is required";
  if (
    !isFiniteInt(raw.width) ||
    raw.width < 1 ||
    raw.width > RECONSTRUCT_DISPATCH_LIMITS.maxWidth
  ) {
    return "sam3.width out of range";
  }
  if (
    !isFiniteInt(raw.height) ||
    raw.height < 1 ||
    raw.height > RECONSTRUCT_DISPATCH_LIMITS.maxHeight
  ) {
    return "sam3.height out of range";
  }
  const n = raw.width * raw.height;
  if (!Array.isArray(raw.outfitAlpha) || raw.outfitAlpha.length !== n) {
    return "sam3.outfitAlpha length must be width*height";
  }
  const outfitAlpha = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = raw.outfitAlpha[i];
    if (typeof v !== "number" || !Number.isFinite(v)) return `sam3.outfitAlpha[${i}] invalid`;
    outfitAlpha[i] = v;
  }
  let repairAlpha: Float32Array | undefined;
  if (raw.repairAlpha) {
    if (!Array.isArray(raw.repairAlpha) || raw.repairAlpha.length !== n) {
      return "sam3.repairAlpha length must be width*height";
    }
    repairAlpha = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = raw.repairAlpha[i];
      if (typeof v !== "number" || !Number.isFinite(v)) return `sam3.repairAlpha[${i}] invalid`;
      repairAlpha[i] = v;
    }
  }
  return {
    width: raw.width,
    height: raw.height,
    outfitAlpha,
    repairAlpha,
    source: raw.source === "caller_supplied" ? "caller_supplied" : "fixture",
    liveFetch: false,
  };
}

function parseTemporalJobs(
  raw: ReconstructWireTemporalJob[] | undefined,
): ConsumedTemporalJob[] | string {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return "temporalJobs must be an array";
  const jobs: ConsumedTemporalJob[] = [];
  for (let j = 0; j < raw.length; j++) {
    const job = raw[j]!;
    if (!job || typeof job.kind !== "string" || typeof job.sourceAssetId !== "string") {
      return `temporalJobs[${j}] kind/sourceAssetId required`;
    }
    if (!Array.isArray(job.frames)) return `temporalJobs[${j}].frames must be an array`;
    const frames = [];
    for (let i = 0; i < job.frames.length; i++) {
      const fr = job.frames[i]!;
      if (!isFiniteInt(fr.index) || fr.index < 0)
        return `temporalJobs[${j}].frames[${i}].index invalid`;
      if (!isFiniteInt(fr.width) || fr.width < 1)
        return `temporalJobs[${j}].frames[${i}].width invalid`;
      if (!isFiniteInt(fr.height) || fr.height < 1) {
        return `temporalJobs[${j}].frames[${i}].height invalid`;
      }
      if (!Array.isArray(fr.mask) || fr.mask.length !== fr.width * fr.height) {
        return `temporalJobs[${j}].frames[${i}].mask length must be width*height`;
      }
      if (typeof fr.confidence !== "number" || !Number.isFinite(fr.confidence)) {
        return `temporalJobs[${j}].frames[${i}].confidence invalid`;
      }
      frames.push({
        index: fr.index,
        width: fr.width,
        height: fr.height,
        mask: Float32Array.from(fr.mask),
        confidence: fr.confidence,
        reanchorRecommended: fr.reanchorRecommended === true,
      });
    }
    jobs.push({ kind: job.kind, sourceAssetId: job.sourceAssetId, frames });
  }
  return jobs;
}

export function dispatchOriginalMasterReconstruct(raw: unknown): ReconstructDispatchResult {
  if (raw == null || typeof raw !== "object") {
    return {
      ok: false,
      status: 400,
      body: {
        ok: false,
        error: "invalid_json",
        code: "invalid_request",
        message: "body must be an object",
      },
    };
  }

  const input = raw as ReconstructWireBody;
  if (!Array.isArray(input.originalFrames) || input.originalFrames.length === 0) {
    return {
      ok: false,
      status: 400,
      body: {
        ok: false,
        error: "invalid_clip",
        code: "invalid_request",
        message: "originalFrames must be a non-empty array",
      },
    };
  }
  if (input.originalFrames.length > RECONSTRUCT_DISPATCH_LIMITS.maxFrames) {
    return {
      ok: false,
      status: 400,
      body: {
        ok: false,
        error: "invalid_clip",
        code: "invalid_request",
        message: `originalFrames exceeds max ${RECONSTRUCT_DISPATCH_LIMITS.maxFrames}`,
      },
    };
  }

  const originalFrames = [];
  for (let i = 0; i < input.originalFrames.length; i++) {
    const parsed = parseRgbaFrame(input.originalFrames[i]!, `originalFrames[${i}]`);
    if (typeof parsed === "string") {
      return {
        ok: false,
        status: 400,
        body: { ok: false, error: "invalid_clip", code: "invalid_request", message: parsed },
      };
    }
    originalFrames.push(parsed);
  }

  let generatedFrames: { index: number; image: RgbaImage }[] | undefined;
  if (input.generatedFrames) {
    generatedFrames = [];
    for (let i = 0; i < input.generatedFrames.length; i++) {
      const parsed = parseRgbaFrame(input.generatedFrames[i]!, `generatedFrames[${i}]`);
      if (typeof parsed === "string") {
        return {
          ok: false,
          status: 400,
          body: { ok: false, error: "invalid_clip", code: "invalid_request", message: parsed },
        };
      }
      generatedFrames.push(parsed);
    }
  }

  const chest = parseStill(input.chestStill, "chestStill", CLEARED_CHEST_ASSET_ID);
  if (!chest.ok) {
    return {
      ok: false,
      status: 400,
      body: { ok: false, error: "invalid_still", code: "invalid_request", message: chest.message },
    };
  }
  const sleeve = parseStill(input.sleeveStill, "sleeveStill", CLEARED_SLEEVE_ASSET_ID);
  if (!sleeve.ok) {
    return {
      ok: false,
      status: 400,
      body: { ok: false, error: "invalid_still", code: "invalid_request", message: sleeve.message },
    };
  }

  const sam3 = parseSam3(input.sam3);
  if (typeof sam3 === "string") {
    return {
      ok: false,
      status: 400,
      body: { ok: false, error: "invalid_sam3", code: "invalid_request", message: sam3 },
    };
  }

  const temporalJobs = parseTemporalJobs(input.temporalJobs);
  if (typeof temporalJobs === "string") {
    return {
      ok: false,
      status: 400,
      body: {
        ok: false,
        error: "invalid_temporal",
        code: "invalid_request",
        message: temporalJobs,
      },
    };
  }

  const decision = evaluateReconstructLiveWiring({
    chestGate: input.chestGate ?? DEFAULT_CHEST_STILL_GATE,
    sleeveGate: input.sleeveGate ?? DEFAULT_SLEEVE_STILL_GATE,
    temporalArmed: input.temporalArmed,
    explicitArm: input.explicitArm === true,
  });

  if (!decision.allowed) {
    const code = decision.waitingFor[0] ?? "live_wiring_not_armed";
    return {
      ok: false,
      status: code === "invalid_request" ? 400 : 403,
      body: {
        ok: false,
        error: "not_authorized",
        code,
        message: decision.reasons[0] ?? "original-master reconstruct is not authorized",
        decision,
      },
    };
  }

  try {
    const clip = reconstructMasterClip({
      originalFrames,
      generatedFrames,
      chestStill: chest.still,
      sleeveStill: sleeve.still,
      sam3,
      temporalJobs,
      projectId: input.projectId,
      masterClipAssetId: input.masterClipAssetId,
      clipId: input.clipId,
    });
    return {
      ok: true,
      status: 200,
      body: {
        ok: true,
        dispatchVersion: RECONSTRUCT_DISPATCH_VERSION,
        contractVersion: RECONSTRUCT_LIVE_WIRING_CONTRACT_VERSION,
        paidCalls: false,
        grokPerFrame: false,
        sam3LiveFetch: false,
        provider: "none",
        edgeFunction: null,
        clip,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "reconstruct_failed";
    return {
      ok: false,
      status: 400,
      body: {
        ok: false,
        error: "reconstruct_failed",
        code: "invalid_request",
        message,
      },
    };
  }
}
