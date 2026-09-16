/**
 * Shared JSON contract for Lane E2 to score a playable reconstructed MP4.
 * Lane H owns emission only — do not add scoring modules here.
 */

import type { PlayableArtifactClaims, PlayableE2Hook } from "./contract";
import { PLAYABLE_E2_HOOK_SCHEMA } from "./contract";
import type { PlayableComposeOk } from "./compose";

export type PlayableHookPaths = {
  mp4RelativePath: string;
  claimsRelativePath: string;
  hookRelativePath: string;
};

export function buildPlayableArtifactClaims(
  compose: PlayableComposeOk,
  mp4: PlayableArtifactClaims["mp4"],
): PlayableArtifactClaims {
  return {
    playableVersion: compose.playableVersion,
    mediaKind: compose.mediaKind,
    lineage: compose.spec,
    sam3: compose.sam3,
    mp4,
    masterClipAssetId: compose.spec.masterClipAssetId,
    originalPixelsPreservedWhereUnauthorized: compose.clip.originalPixelsPreservedWhereUnauthorized,
    temporalJobCount: compose.temporalJobCount,
    temporalFramesUsed: compose.temporalFramesUsed,
    paidCalls: false,
    grokPerFrame: false,
    sam3LiveFetch: false,
    provider: "none",
    edgeFunction: null,
  };
}

export function buildPlayableE2Hook(
  claims: PlayableArtifactClaims,
  paths: PlayableHookPaths,
): PlayableE2Hook {
  return {
    schemaVersion: PLAYABLE_E2_HOOK_SCHEMA,
    scoringOwner: "lane_e2",
    scoringModules: "src/lib/eval/**",
    note: "Lane H emits this hook. Lane E2 owns scoring implementations.",
    artifact: claims,
    composeSelfCheck: {
      originalPixelsPreservedWhereUnauthorized: claims.originalPixelsPreservedWhereUnauthorized,
      frameCount: claims.mp4.frameCount,
      temporalJobsConsumed: claims.temporalJobCount,
      sam3Consumed: claims.sam3.failure === null && claims.sam3.source !== "missing",
      paidCalls: false,
      grokPerFrame: false,
    },
    evaluatorInput: {
      mp4RelativePath: paths.mp4RelativePath,
      claimsRelativePath: paths.claimsRelativePath,
      hookRelativePath: paths.hookRelativePath,
      masterClipAssetId: claims.masterClipAssetId,
      width: claims.mp4.width,
      height: claims.mp4.height,
      frameCount: claims.mp4.frameCount,
      fps: claims.mp4.fps,
    },
  };
}

export function playableE2HookToJson(hook: PlayableE2Hook): Record<string, unknown> {
  return {
    schemaVersion: hook.schemaVersion,
    scoringOwner: hook.scoringOwner,
    scoringModules: hook.scoringModules,
    note: hook.note,
    artifact: hook.artifact,
    composeSelfCheck: hook.composeSelfCheck,
    evaluatorInput: hook.evaluatorInput,
  };
}
