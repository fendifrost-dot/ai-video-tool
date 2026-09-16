/**
 * Lane H → Lane E2 plug-in. Consume evaluateVideoQa only — do not
 * implement scoring, and do not edit src/lib/eval/** or D2 videoQa.ts.
 *
 * Encode-first with frames:[] is allowed (INCOMPLETE awaiting
 * decoded_frames). blockingArtifactProducer is always false.
 *
 * Decoded MP4 rasters are supplied by H (ffmpeg in node/tests, WebCodecs
 * in the browser, or an injected frame pack). This module does not import
 * ffmpeg / child_process so Hero Frame UI can call it. Pairing 8-frame UI
 * compose onto the 72-frame gate MP4 is refused — that was the false FAIL 6/9.
 */

import {
  evaluateVideoQa,
  videoQaInputFromFrames,
  videoQaInputFromReconstructE2e,
  videoQaReportToJson,
} from "@/lib/eval";
import type { StructuralReconstructFrame } from "@/lib/eval/videoQaAdapter";
import type { VideoQaJson, VideoQaMp4Ref, VideoQaReport } from "@/lib/eval/videoQaTypes";
import { RECONSTRUCT_E2E_VERSION, type ReconstructE2eOk } from "../e2e";
import type { RgbaImage } from "../types";
import type { Sam3MaskSource } from "@/lib/reconstruct/adapters";
import {
  SAM3_CONSUME_VERSION,
  SAM3_LIVE_FETCH_ATTEMPTED,
  type Sam3ConsumeProvenance,
  type Sam3FallbackStatus,
} from "@/lib/reconstruct/sam3Consume";
import type { PlayableComposeOk } from "./compose";
import {
  CANONICAL_PLAYABLE_ARTIFACT_LAYOUT,
  SECOND_CLIP_PLAYABLE_ARTIFACT_LAYOUT,
  type PlayableArtifactLayout,
} from "./catalogBind";

export const PLAYABLE_VIDEO_QA_ARTIFACT_ID = CANONICAL_PLAYABLE_ARTIFACT_LAYOUT.artifactId;
export const PLAYABLE_MP4_RELATIVE_PATH = CANONICAL_PLAYABLE_ARTIFACT_LAYOUT.mp4RelativePath;
export const PLAYABLE_VIDEO_QA_RELATIVE_PATH =
  CANONICAL_PLAYABLE_ARTIFACT_LAYOUT.videoQaRelativePath;
/** Committed full-clip H.264 gate artifact (72 @ 720×1280). Do not reopen still goldens. */
export const PLAYABLE_MP4_SHA256 =
  "71f54599be288a7359b125f8f3acec14f3ec4d7b444bc79500712fec99d6029b";
export const PLAYABLE_MP4_BYTE_LENGTH = 486769;

export type PlayableVideoQaResult = {
  report: VideoQaReport;
  json: VideoQaJson;
};

/** Reconstructed RGBA from an MP4 decode (no α until compose is paired). */
export type PlayableDecodedRgba = {
  index: number;
  image: RgbaImage;
};

function isStructuralFrame(
  frame: PlayableDecodedRgba | StructuralReconstructFrame,
): frame is StructuralReconstructFrame {
  return "reconstructed" in frame && "original" in frame;
}

/**
 * Turn decoded MP4 rasters into E2 frames.
 *
 * Compose original + authorizedAlpha attach only when frame counts AND
 * raster size match (full-clip compose ↔ full-clip decode). The 8-frame
 * Hero window must not overlay the 72-frame gate MP4.
 *
 * Default (no pair): original = reconstructed, no α → visual probes SKIP,
 * `mp4_artifact_scored` can PASS. H.264 is lossy; pairing unique-RGB
 * originals onto decoded yuv420p would false-FAIL preservation.
 */
export function playableDecodedToVideoQaFrames(input: {
  decoded: Array<PlayableDecodedRgba | StructuralReconstructFrame>;
  compose?: PlayableComposeOk;
  pairCompose?: boolean;
}): StructuralReconstructFrame[] {
  if (input.decoded.length === 0) return [];
  if (isStructuralFrame(input.decoded[0]!)) {
    return input.decoded.filter(isStructuralFrame);
  }

  const decoded = input.decoded.filter((f): f is PlayableDecodedRgba => !isStructuralFrame(f));
  const first = decoded[0]!.image;
  const compose = input.compose;
  const canPair =
    input.pairCompose === true &&
    compose !== undefined &&
    compose.frameCount === decoded.length &&
    compose.width === first.width &&
    compose.height === first.height;

  const originals =
    canPair && compose ? new Map(compose.originalFrames.map((f) => [f.index, f.image])) : null;
  const clipByIndex =
    canPair && compose ? new Map(compose.clip.frames.map((f) => [f.index, f])) : null;

  return decoded.map((d) => {
    const original = originals?.get(d.index);
    const clipFr = clipByIndex?.get(d.index);
    return {
      index: d.index,
      original: original ?? d.image,
      reconstructed: d.image,
      authorizedAlpha: clipFr?.result.authorizedAlpha,
    };
  });
}

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
    sam3Provenance: {
      consumeVersion: SAM3_CONSUME_VERSION,
      source: compose.sam3.source as Sam3MaskSource,
      liveFetchAttempted: SAM3_LIVE_FETCH_ATTEMPTED,
      paidCalls: false,
      grokPerFrame: false,
      fallbackStatus: compose.sam3.fallbackStatus as unknown as Sam3FallbackStatus,
      mask: null,
      failure: null,
    } as Sam3ConsumeProvenance,
    fps: compose.fps,
    durationSec: compose.durationSec,
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

/** Gate MP4 for Hero Frame §7 / E2 — encode-first, do not treat the 8-frame UI window as decoded rasters. */
export function committedPlayableMp4Ref(): VideoQaMp4Ref {
  return playableMp4Ref({
    produced: true,
    artifactId: PLAYABLE_VIDEO_QA_ARTIFACT_ID,
    path: PLAYABLE_MP4_RELATIVE_PATH,
    sha256: PLAYABLE_MP4_SHA256,
    byteLength: PLAYABLE_MP4_BYTE_LENGTH,
  });
}

/** Catalog-driven MP4 ref. Canonical SHA pins stay on `committedPlayableMp4Ref()`. */
export function playableMp4RefForLayout(
  layout: PlayableArtifactLayout,
  input: { produced: boolean; sha256?: string; byteLength?: number },
): VideoQaMp4Ref {
  return playableMp4Ref({
    produced: input.produced,
    artifactId: layout.artifactId,
    path: layout.mp4RelativePath,
    sha256: input.sha256,
    byteLength: input.byteLength,
  });
}

/**
 * Committed 8-frame 2nd-clip fixture MP4 (`f31bd0f2`).
 * Distinct from the canonical 72-frame Hero Frame gate artifact.
 * Live Export on this clip is NOT CLEARED.
 */
export const SECOND_CLIP_PLAYABLE_MP4_SHA256 =
  "2b5dde758780ddddcd74530225f4c6d600db29be5f7fe2a8847d7191265760fa";
export const SECOND_CLIP_PLAYABLE_MP4_BYTE_LENGTH = 387277;

export function committedSecondClipPlayableMp4Ref(): VideoQaMp4Ref {
  return playableMp4RefForLayout(SECOND_CLIP_PLAYABLE_ARTIFACT_LAYOUT, {
    produced: true,
    sha256: SECOND_CLIP_PLAYABLE_MP4_SHA256,
    byteLength: SECOND_CLIP_PLAYABLE_MP4_BYTE_LENGTH,
  });
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
   * Ignored when `decodedFrames` is non-empty (MP4 rasters win).
   */
  includeDecodedFrames?: boolean;
  /**
   * RGBA from H-owned decode (ffmpeg / WebCodecs / fixture / injected).
   * When length>0, E2 scores these instead of compose buffers or frames:[].
   */
  decodedFrames?: Array<PlayableDecodedRgba | StructuralReconstructFrame>;
  /** Attach compose original+α only when counts/size match. Default false. */
  pairCompose?: boolean;
}): PlayableVideoQaResult {
  const e2e =
    input.e2e ?? (input.compose ? playableComposeToReconstructE2e(input.compose) : undefined);
  const decoded = input.decodedFrames ?? [];

  if (decoded.length > 0) {
    const frames = playableDecodedToVideoQaFrames({
      decoded,
      compose: input.compose,
      pairCompose: input.pairCompose,
    });
    const first = frames[0]!;
    const report = evaluateVideoQa(
      videoQaInputFromFrames({
        frames,
        mp4: input.mp4,
        width: first.reconstructed.width,
        height: first.reconstructed.height,
        fps: input.compose?.fps ?? e2e?.fps,
        provenance: {
          projectId: e2e?.projectId ?? input.compose?.spec.projectId,
          masterClipAssetId: e2e?.masterClipAssetId ?? input.compose?.spec.masterClipAssetId,
          reconstructionVersion: e2e?.e2eVersion ?? input.compose?.playableVersion,
          temporalJobCount: e2e?.temporalJobCount ?? input.compose?.temporalJobCount,
          source: "playable_mp4_decode",
        },
      }),
    );
    return { report, json: videoQaReportToJson(report) };
  }

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
