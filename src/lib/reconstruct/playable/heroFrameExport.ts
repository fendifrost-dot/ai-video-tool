/**
 * Hero Frame §7 playable reconstruct export — gating + copy.
 * Runs the same 720×1280 compose path (short window in-browser).
 * Full-clip MP4 encode stays on the ffmpeg artifact script.
 */

import { ARCHITECTURE_C_V2_REPAIR } from "@/lib/heroFrame/architectureCStillRepair";
import { formatVideoQaSummary, type VideoQaJson } from "@/lib/eval";
import {
  RECONSTRUCT_LIVE_WIRING_ARMED,
  TEMPORAL_ARMED_AFTER_PR_88,
  evaluateReconstructLiveWiring,
  type ReconstructLiveWiringDecision,
} from "../liveWiring";
import { heroFrameReconstructExplicitArm } from "../heroFrameRun";
import { CANONICAL_CLIP_FRAME_COUNT, PLAYABLE_RECONSTRUCT_VERSION } from "./contract";
import { runPlayableCompose, type PlayableComposeResult } from "./compose";
import { heroFramePlayableSpec } from "./spec";
import { playableE2HookToJson, buildPlayableArtifactClaims, buildPlayableE2Hook } from "./e2Hook";
import type { PlayableMp4Claims } from "./contract";
import { CANONICAL_PLAYABLE_ARTIFACT_LAYOUT } from "./catalogBind";
import type { RgbaImage } from "../types";
import {
  PLAYABLE_MP4_BYTE_LENGTH,
  PLAYABLE_MP4_SHA256,
  committedPlayableMp4Ref,
  evaluatePlayableVideoQa,
  type PlayableDecodedRgba,
} from "./videoQaPlug";
import {
  decodeCommittedPlayableMp4ForLive,
  formatPlayableBrowserDecodeNote,
  type DecodePlayableMp4BrowserResult,
} from "./decodeMp4Browser";

export const HERO_FRAME_PLAYABLE_EXPORT_VERSION = "1.0.0";

export type HeroFramePlayableExportIntent = {
  contractVersion: typeof HERO_FRAME_PLAYABLE_EXPORT_VERSION;
  playableVersion: typeof PLAYABLE_RECONSTRUCT_VERSION;
  temporalTrackingEnabled: boolean;
  reconstructArmed: boolean;
  temporalArmed: boolean;
  explicitArm: boolean;
  canExport: boolean;
  decision: ReconstructLiveWiringDecision;
  spec: ReturnType<typeof heroFramePlayableSpec>;
};

export function prepareHeroFramePlayableExport(): HeroFramePlayableExportIntent {
  const temporalTrackingEnabled = ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled;
  const reconstructArmed = RECONSTRUCT_LIVE_WIRING_ARMED;
  const temporalArmed = TEMPORAL_ARMED_AFTER_PR_88;
  const explicitArm = heroFrameReconstructExplicitArm({
    temporalTrackingEnabled,
    reconstructArmed,
    temporalArmed,
  });
  const decision = evaluateReconstructLiveWiring({ explicitArm });
  const spec = heroFramePlayableSpec();
  return {
    contractVersion: HERO_FRAME_PLAYABLE_EXPORT_VERSION,
    playableVersion: PLAYABLE_RECONSTRUCT_VERSION,
    temporalTrackingEnabled,
    reconstructArmed,
    temporalArmed,
    explicitArm,
    canExport: explicitArm === true && decision.allowed,
    decision,
    spec,
  };
}

export function heroFramePlayableExportEnabled(input: {
  canExport: boolean;
  reconstructArmed: boolean;
  temporalTrackingEnabled: boolean;
}): boolean {
  return (
    input.canExport === true &&
    input.reconstructArmed === true &&
    input.temporalTrackingEnabled === true
  );
}

export function formatHeroFramePlayableExportCopy(input: {
  temporalTrackingEnabled: boolean;
  reconstructArmed: boolean;
  explicitArm: boolean;
  canExport: boolean;
}): string {
  const flags = `temporalTrackingEnabled=${input.temporalTrackingEnabled}, reconstructArmed=${input.reconstructArmed}, explicitArm=${input.explicitArm}, canExport=${input.canExport}`;
  if (heroFramePlayableExportEnabled(input)) {
    return `PLAYABLE reconstruct export is on (${flags}). Exports a 720×1280 window of the same $0 compose path (intended SAM-3 + in-lib temporal + original-master). Full-clip MP4 is the ffmpeg artifact. No Grok.`;
  }
  return `PLAYABLE reconstruct export is off (${flags}).`;
}

export function summarizePlayableCompose(result: PlayableComposeResult): string {
  if (!result.ok) {
    return `PLAYABLE FAIL ${result.code} paidCalls=false grokPerFrame=false.`;
  }
  return `PLAYABLE compose ${result.width}×${result.height} frames=${result.frameCount} fps=${result.fps} preserved=${String(result.clip.originalPixelsPreservedWhereUnauthorized)} sam3=${result.sam3.source} paidCalls=false.`;
}

export type HeroFramePlayableExportOpts = {
  /**
   * Optional H-owned decode of the committed gate MP4 (ffmpeg/node,
   * WebCodecs, or injected fixture). Default click without rasters stays
   * encode-first INCOMPLETE awaiting decoded_frames. Do not pass the
   * 8-frame compose buffer here (false FAIL 6/9).
   */
  decodedFrames?: PlayableDecodedRgba[];
};

export function runHeroFramePlayableExport(opts: HeroFramePlayableExportOpts = {}): {
  compose: PlayableComposeResult;
  summary: string;
  hookJson: Record<string, unknown> | null;
  videoQaJson: VideoQaJson | null;
} {
  const compose = runPlayableCompose({
    explicitArm: true,
    spec: heroFramePlayableSpec(),
  });
  if (!compose.ok) {
    return {
      compose,
      summary: summarizePlayableCompose(compose),
      hookJson: null,
      videoQaJson: null,
    };
  }
  const decodedFrames = opts.decodedFrames ?? [];
  const placeholderMp4: PlayableMp4Claims = {
    width: compose.width,
    height: compose.height,
    frameCount: compose.frameCount,
    fps: compose.fps,
    durationSec: compose.durationSec,
    codec: "pending_ffmpeg_artifact",
    container: "pending_ffmpeg_artifact",
    pixelFormat: "rgba_in_memory",
    audio: {
      present: false,
      preserved: null,
      sync: null,
      note:
        decodedFrames.length > 0
          ? `Hero Frame window is in-memory compose (${compose.frameCount} frames). E2 scores ${decodedFrames.length} decoded rasters from the committed MP4 (sha256=${PLAYABLE_MP4_SHA256.slice(0, 8)}…). The 8-frame compose is not paired onto the 72-frame gate.`
          : `Hero Frame window is in-memory compose (${compose.frameCount} frames). E2 scores the committed full-clip MP4 encode-first (sha256=${PLAYABLE_MP4_SHA256.slice(0, 8)}…, ${PLAYABLE_MP4_BYTE_LENGTH} bytes) until decoded rasters are attached.`,
    },
  };
  const claims = buildPlayableArtifactClaims(compose, placeholderMp4);
  const hook = buildPlayableE2Hook(claims, {
    mp4RelativePath: CANONICAL_PLAYABLE_ARTIFACT_LAYOUT.mp4RelativePath,
    claimsRelativePath: CANONICAL_PLAYABLE_ARTIFACT_LAYOUT.claimsRelativePath,
    hookRelativePath: CANONICAL_PLAYABLE_ARTIFACT_LAYOUT.hookRelativePath,
  });
  const { json: videoQaJson, report } = evaluatePlayableVideoQa({
    compose,
    mp4: committedPlayableMp4Ref(),
    // 8-frame UI window is not decoded 72-frame MP4 rasters.
    includeDecodedFrames: false,
    decodedFrames,
    pairCompose: false,
  });
  return {
    compose,
    summary: `${summarizePlayableCompose(compose)} ${formatVideoQaSummary(report)}`,
    hookJson: playableE2HookToJson(hook),
    videoQaJson,
  };
}

/** Structural helper so callers can wrap decoder output without importing ffmpeg. */
export function heroFrameDecodedFromRgba(
  frames: Array<{ index: number; image: RgbaImage }>,
): PlayableDecodedRgba[] {
  return frames.map((f) => ({ index: f.index, image: f.image }));
}

export type HeroFramePlayableExportLiveOpts = HeroFramePlayableExportOpts & {
  /** Injected gate MP4 bytes (tests / callers that already fetched). */
  mp4Bytes?: Uint8Array;
  /** Override fetch URL for the committed artifact. */
  mp4Url?: string;
  /** Live decode cap. Default LIVE_PLAYABLE_DECODE_MAX_FRAMES (72). */
  maxFrames?: number;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
  /** Default true: 72 → 24 → 8 when a larger attempt yields 0 frames. */
  progressiveFallback?: boolean;
};

/**
 * After the 8-frame compose, attach a WebCodecs decode of the committed
 * 72-frame gate MP4 (default all 72). Abort / OOM / timeout keep a partial
 * sample or INCOMPLETE — never a false FAIL, never the 8-frame UI compose.
 */
export async function runHeroFramePlayableExportLive(
  opts: HeroFramePlayableExportLiveOpts = {},
): Promise<{
  compose: PlayableComposeResult;
  summary: string;
  hookJson: Record<string, unknown> | null;
  videoQaJson: VideoQaJson | null;
  decode: DecodePlayableMp4BrowserResult;
}> {
  if (opts.decodedFrames && opts.decodedFrames.length > 0) {
    const run = runHeroFramePlayableExport({ decodedFrames: opts.decodedFrames });
    return {
      ...run,
      decode: {
        ok: true,
        decoder: "webcodecs",
        width: opts.decodedFrames[0]!.image.width,
        height: opts.decodedFrames[0]!.image.height,
        fps: 24,
        sourceFrameCount: opts.decodedFrames.length,
        frameCount: opts.decodedFrames.length,
        truncated: opts.decodedFrames.length < CANONICAL_CLIP_FRAME_COUNT,
        liveSample: opts.decodedFrames.length < CANONICAL_CLIP_FRAME_COUNT,
        requestedMaxFrames: opts.decodedFrames.length,
        fallbackReason: "none",
        frames: opts.decodedFrames,
      },
    };
  }

  const decode = await decodeCommittedPlayableMp4ForLive({
    mp4Bytes: opts.mp4Bytes,
    mp4Url: opts.mp4Url,
    maxFrames: opts.maxFrames,
    timeoutMs: opts.timeoutMs,
    abortSignal: opts.abortSignal,
    progressiveFallback: opts.progressiveFallback,
  });
  const run = runHeroFramePlayableExport({
    decodedFrames: decode.ok ? decode.frames : [],
  });
  return {
    ...run,
    decode,
    summary: `${run.summary} ${formatPlayableBrowserDecodeNote(decode)}`,
  };
}
