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
import { PLAYABLE_RECONSTRUCT_VERSION } from "./contract";
import { runPlayableCompose, type PlayableComposeResult } from "./compose";
import { heroFramePlayableSpec } from "./spec";
import { playableE2HookToJson, buildPlayableArtifactClaims, buildPlayableE2Hook } from "./e2Hook";
import type { PlayableMp4Claims } from "./contract";
import { CANONICAL_PLAYABLE_ARTIFACT_LAYOUT } from "./catalogBind";
import {
  PLAYABLE_MP4_BYTE_LENGTH,
  PLAYABLE_MP4_SHA256,
  committedPlayableMp4Ref,
  evaluatePlayableVideoQa,
} from "./videoQaPlug";

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

export function runHeroFramePlayableExport(): {
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
      note: `Hero Frame window is in-memory compose (${compose.frameCount} frames). E2 scores the committed full-clip MP4 encode-first (sha256=${PLAYABLE_MP4_SHA256.slice(0, 8)}…, ${PLAYABLE_MP4_BYTE_LENGTH} bytes).`,
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
  });
  return {
    compose,
    summary: `${summarizePlayableCompose(compose)} ${formatVideoQaSummary(report)}`,
    hookJson: playableE2HookToJson(hook),
    videoQaJson,
  };
}
