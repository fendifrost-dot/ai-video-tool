/**
 * Lane H → Lane E2 plug-in. Consume evaluateVideoQa only — do not
 * implement scoring, and do not edit src/lib/eval/** or D2 videoQa.ts.
 *
 * Encode-first with frames:[] is allowed (INCOMPLETE awaiting
 * decoded_frames). blockingArtifactProducer is always false.
 */

import {
  evaluateVideoQa,
  videoQaInputFromFrames,
  videoQaInputFromReconstructE2e,
  videoQaReportToJson,
} from "@/lib/eval";
import type { VideoQaJson, VideoQaMp4Ref, VideoQaReport } from "@/lib/eval/videoQaTypes";
import { RECONSTRUCT_E2E_VERSION, type ReconstructE2eOk } from "../e2e";
import type { PlayableComposeOk } from "./compose";

export const PLAYABLE_VIDEO_QA_ARTIFACT_ID = "playable-76fe7438";
export const PLAYABLE_MP4_RELATIVE_PATH =
  "docs/reconstruct/artifacts/playable-76fe7438/reconstructed.mp4";
export const PLAYABLE_VIDEO_QA_RELATIVE_PATH =
  "docs/reconstruct/artifacts/playable-76fe7438/video-qa.json";

export type PlayableVideoQaResult = {
  report: VideoQaReport;
  json: VideoQaJson;
};

/**
 * Structural view of a playable compose so H can call the E2 contract
 * `videoQaInputFromReconstructE2e` without re-running reconstruct E2E.
 * In-lib temporal (not temporal-propagate-proxy) → fixture_temporal_jobs.
 */
export function playableComposeToReconstructE2e(compose: PlayableComposeOk): ReconstructE2eOk {
  return {
    ok: true,
    e2eVersion: RECONSTRUCT_E2E_VERSION,
    source: "fixture_temporal_jobs",
    paidCalls: false,
    grokPerFrame: false,
    sam3LiveFetch: false,
    provider: "none",
    edgeFunction: null,
    explicitArm: true,
    projectId: compose.spec.projectId,
    masterClipAssetId: compose.spec.masterClipAssetId,
    stillAssetId: compose.spec.stillAssetId,
    chestAssetId: compose.clip.chestAssetId,
    sleeveAssetId: compose.clip.sleeveAssetId,
    width: compose.width,
    height: compose.height,
    frameCount: compose.frameCount,
    temporalJobCount: compose.temporalJobCount,
    originalFrames: compose.originalFrames,
    clip: compose.clip,
    decision: compose.decision,
  };
}

export function playableMp4Ref(input: {
  produced: boolean;
  artifactId?: string;
  path?: string;
  sha256?: string;
  byteLength?: number;
}): VideoQaMp4Ref {
  return {
    produced: input.produced,
    artifactId: input.artifactId,
    path: input.path,
    sha256: input.sha256,
    byteLength: input.byteLength,
    mimeType: input.produced ? "video/mp4" : undefined,
  };
}

/**
 * Exact E2 contract after reconstruct E2E + optional MP4:
 * evaluateVideoQa(videoQaInputFromReconstructE2e(e2e, mp4))
 */
export function evaluatePlayableVideoQaFromE2e(
  e2e: ReconstructE2eOk,
  mp4: VideoQaMp4Ref,
): PlayableVideoQaResult {
  const report = evaluateVideoQa(videoQaInputFromReconstructE2e(e2e, mp4));
  return { report, json: videoQaReportToJson(report) };
}

export function evaluatePlayableVideoQa(input: {
  e2e?: ReconstructE2eOk;
  compose?: PlayableComposeOk;
  mp4: VideoQaMp4Ref;
  /**
   * false = encode-first: frames:[] → INCOMPLETE awaiting decoded_frames.
   * Default true when e2e/compose is present.
   */
  includeDecodedFrames?: boolean;
}): PlayableVideoQaResult {
  const e2e = input.e2e ?? (input.compose ? playableComposeToReconstructE2e(input.compose) : undefined);
  const includeFrames = input.includeDecodedFrames !== false && e2e !== undefined;

  if (includeFrames && e2e) {
    return evaluatePlayableVideoQaFromE2e(e2e, input.mp4);
  }

  const report = evaluateVideoQa(
    videoQaInputFromFrames({
      frames: [],
      mp4: input.mp4,
      width: e2e?.width ?? input.compose?.width,
      height: e2e?.height ?? input.compose?.height,
      fps: input.compose?.fps,
      provenance: e2e
        ? {
            projectId: e2e.projectId,
            masterClipAssetId: e2e.masterClipAssetId,
            reconstructionVersion: e2e.e2eVersion,
            temporalJobCount: e2e.temporalJobCount,
            source: e2e.source,
          }
        : {
            masterClipAssetId: input.compose?.spec.masterClipAssetId,
            reconstructionVersion: input.compose?.playableVersion,
            temporalJobCount: input.compose?.temporalJobCount,
            source: "playable_encode_first",
          },
    }),
  );
  return { report, json: videoQaReportToJson(report) };
}

export function persistPlayableVideoQaJson(
  json: VideoQaJson,
  write: (relativePath: string, body: string) => void,
  relativePath: string = PLAYABLE_VIDEO_QA_RELATIVE_PATH,
): void {
  write(relativePath, `${JSON.stringify(json, null, 2)}\n`);
}
