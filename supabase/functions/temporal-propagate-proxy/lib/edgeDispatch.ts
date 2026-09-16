/**
 * Isolated temporal-propagate wire protocol.
 * authorizeTemporalEdgeRequest → propagateRepair. No Grok / Fal / CC / fetch.
 */

import type { ApprovedQuadSet } from "./approvedQuad.ts";
import { clearedChestAndSleeveQuadSet } from "./approvedQuad.ts";
import type { SourceClip, SourceClipFrame } from "./contract.ts";
import {
  authorizeTemporalEdgeRequest,
  buildTemporalEdgeRequest,
  type TemporalEdgeAuthorization,
} from "./edgeAdapter.ts";
import {
  DEFAULT_SLEEVE_STILL_GATE,
  type SleeveStillGate,
} from "./livePrep.ts";
import { propagateRepair } from "./propagate.ts";
import { buildPropagationJobsFromApprovedSet, type PropagationJobSpec } from "./quadAdapter.ts";

export const TEMPORAL_EDGE_DISPATCH_VERSION = "1.0.0";

export const TEMPORAL_PROPAGATE_LIMITS = {
  maxFrames: 24,
  maxWidth: 720,
  maxHeight: 1280,
} as const;

export interface TemporalPropagateWireFrame {
  index: number;
  width: number;
  height: number;
  luma: number[];
}

export interface TemporalPropagateWireClip {
  id?: string;
  fps?: number;
  frames?: TemporalPropagateWireFrame[];
}

export interface TemporalPropagateWireBody {
  clip?: TemporalPropagateWireClip;
  approved?: ApprovedQuadSet;
  sleeveGate?: SleeveStillGate;
  explicitArm?: boolean;
}

export interface TemporalPropagateSerializedFrame {
  index: number;
  matrix: readonly [number, number, number, number, number, number];
  mask: number[];
  width: number;
  height: number;
  quadNorm?: { x: number; y: number }[];
  confidence: number;
  source: string;
  reanchorRecommended: boolean;
  reanchorReasons: string[];
}

export interface TemporalPropagateJobResult {
  kind: PropagationJobSpec["kind"];
  keyframeId: string;
  sourceAssetId: string;
  repairMethodVersion: string;
  provider: "none";
  grokPerFrame: false;
  paidCalls: false;
  clipId: string;
  canonicalIndex: number;
  frames: TemporalPropagateSerializedFrame[];
}

export type TemporalPropagateDispatchResult =
  | {
      ok: true;
      status: 200;
      body: {
        ok: true;
        dispatchVersion: typeof TEMPORAL_EDGE_DISPATCH_VERSION;
        paidCalls: false;
        grokPerFrame: false;
        provider: "none";
        jobs: TemporalPropagateJobResult[];
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
        decision?: TemporalEdgeAuthorization extends { decision: infer D } ? D : never;
      };
    };

function isFiniteInt(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && Number.isInteger(n);
}

function parseLumaFrame(raw: TemporalPropagateWireFrame, idx: number): SourceClipFrame | string {
  if (!isFiniteInt(raw.index) || raw.index < 0) return `frames[${idx}].index invalid`;
  if (!isFiniteInt(raw.width) || raw.width < 1 || raw.width > TEMPORAL_PROPAGATE_LIMITS.maxWidth) {
    return `frames[${idx}].width out of range`;
  }
  if (!isFiniteInt(raw.height) || raw.height < 1 || raw.height > TEMPORAL_PROPAGATE_LIMITS.maxHeight) {
    return `frames[${idx}].height out of range`;
  }
  if (!Array.isArray(raw.luma)) return `frames[${idx}].luma must be a number array`;
  if (raw.luma.length !== raw.width * raw.height) {
    return `frames[${idx}].luma length must be width*height`;
  }
  const luma = new Uint8Array(raw.width * raw.height);
  for (let i = 0; i < raw.luma.length; i++) {
    const v = raw.luma[i];
    if (typeof v !== "number" || !Number.isFinite(v)) return `frames[${idx}].luma[${i}] invalid`;
    luma[i] = Math.max(0, Math.min(255, Math.round(v)));
  }
  return { index: raw.index, width: raw.width, height: raw.height, luma };
}

export function parseTemporalPropagateClip(
  clip: TemporalPropagateWireClip | undefined,
): { ok: true; clip: SourceClip } | { ok: false; message: string } {
  if (!clip || !Array.isArray(clip.frames) || clip.frames.length === 0) {
    return { ok: false, message: "clip.frames must be a non-empty array" };
  }
  if (clip.frames.length > TEMPORAL_PROPAGATE_LIMITS.maxFrames) {
    return { ok: false, message: `clip.frames exceeds max ${TEMPORAL_PROPAGATE_LIMITS.maxFrames}` };
  }
  const frames: SourceClipFrame[] = [];
  for (let i = 0; i < clip.frames.length; i++) {
    const parsed = parseLumaFrame(clip.frames[i]!, i);
    if (typeof parsed === "string") return { ok: false, message: parsed };
    frames.push(parsed);
  }
  return {
    ok: true,
    clip: {
      id: typeof clip.id === "string" && clip.id.length > 0 ? clip.id : "temporal-propagate",
      fps: typeof clip.fps === "number" && Number.isFinite(clip.fps) && clip.fps > 0 ? clip.fps : 24,
      frames,
    },
  };
}

function clipToWire(clip: SourceClip): TemporalPropagateWireClip {
  return {
    id: clip.id,
    fps: clip.fps,
    frames: clip.frames.map((fr) => ({
      index: fr.index,
      width: fr.width,
      height: fr.height,
      luma: Array.from(fr.luma),
    })),
  };
}

export function sourceClipToWire(clip: SourceClip): TemporalPropagateWireClip {
  return clipToWire(clip);
}

export function dispatchTemporalPropagate(raw: unknown): TemporalPropagateDispatchResult {
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

  const input = raw as TemporalPropagateWireBody;
  const parsed = parseTemporalPropagateClip(input.clip);
  if (!parsed.ok) {
    return {
      ok: false,
      status: 400,
      body: {
        ok: false,
        error: "invalid_clip",
        code: "invalid_request",
        message: parsed.message,
      },
    };
  }

  const request = buildTemporalEdgeRequest({
    clip: parsed.clip,
    approved: input.approved ?? clearedChestAndSleeveQuadSet(),
    sleeveGate: input.sleeveGate ?? DEFAULT_SLEEVE_STILL_GATE,
    explicitArm: input.explicitArm === true,
  });

  const auth = authorizeTemporalEdgeRequest(request);
  if (!auth.ok) {
    return {
      ok: false,
      status: auth.code === "invalid_request" ? 400 : 403,
      body: {
        ok: false,
        error: "not_authorized",
        code: auth.code,
        message: auth.message,
        decision: auth.decision,
      },
    };
  }

  const jobs = buildPropagationJobsFromApprovedSet({
    clip: parsed.clip,
    approved: request.approved,
  });

  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      dispatchVersion: TEMPORAL_EDGE_DISPATCH_VERSION,
      paidCalls: false,
      grokPerFrame: false,
      provider: "none",
      jobs: jobs.map((job) => {
        const out = propagateRepair(job.input);
        return {
          kind: job.kind,
          keyframeId: job.keyframeId,
          sourceAssetId: job.sourceAssetId,
          repairMethodVersion: job.repairMethodVersion,
          provider: "none" as const,
          grokPerFrame: false as const,
          paidCalls: false as const,
          clipId: out.clipId,
          canonicalIndex: out.canonicalIndex,
          frames: out.frames.map((frame) => ({
            index: frame.index,
            matrix: frame.transform.matrix,
            mask: Array.from(frame.mask.data),
            width: frame.mask.width,
            height: frame.mask.height,
            quadNorm: frame.quadNorm?.map((p) => ({ x: p.x, y: p.y })),
            confidence: frame.confidence,
            source: frame.source,
            reanchorRecommended: frame.reanchorRecommended,
            reanchorReasons: frame.reanchorReasons,
          })),
        };
      }),
    },
  };
}
