/**
 * Lane H plug-in adapters — structural consume of reconstruct outputs.
 *
 * Does not import paint / temporal / pipeline. Reconstruct types are
 * structural (RGBA + α) so H can call this after E2E or after MP4 decode.
 */

import type { ReconstructE2eOk } from "@/lib/reconstruct/e2e";
import type { ReconstructClipResult } from "@/lib/reconstruct/adapters";
import type { RgbaImage } from "./types";
import type { VideoQaFrame, VideoQaInput, VideoQaMp4Ref, VideoQaProvenance } from "./videoQaTypes";

export type StructuralReconstructFrame = {
  index: number;
  original: RgbaImage;
  reconstructed: RgbaImage;
  authorizedAlpha?: Float32Array;
  repairAlpha?: Float32Array;
  segmentationAlpha?: Float32Array;
};

export function videoQaFramesFromStructural(frames: StructuralReconstructFrame[]): VideoQaFrame[] {
  return frames.map((f) => ({
    index: f.index,
    original: f.original,
    reconstructed: f.reconstructed,
    authorizedAlpha: f.authorizedAlpha,
    repairAlpha: f.repairAlpha,
    segmentationAlpha: f.segmentationAlpha,
  }));
}

/**
 * Attach Lane H MP4 provenance without requiring in-process decode.
 * Missing frames → evaluateVideoQa returns INCOMPLETE, blockingArtifactProducer=false.
 */
export function videoQaInputFromFrames(input: {
  frames: StructuralReconstructFrame[];
  mp4?: VideoQaMp4Ref;
  provenance?: VideoQaProvenance;
  width?: number;
  height?: number;
  fps?: number;
}): VideoQaInput {
  const kind = input.mp4 ? "reconstructed_mp4" : "reconstructed_frames";
  return {
    paidCalls: false,
    artifact: {
      kind,
      mp4: input.mp4,
      frames: videoQaFramesFromStructural(input.frames),
      width: input.width,
      height: input.height,
      fps: input.fps,
    },
    provenance: input.provenance,
  };
}

export function videoQaInputFromReconstructClip(
  clip: ReconstructClipResult,
  originalFrames: Array<{ index: number; image: RgbaImage }>,
  mp4?: VideoQaMp4Ref,
): VideoQaInput {
  const byIndex = new Map(originalFrames.map((f) => [f.index, f.image]));
  const frames: StructuralReconstructFrame[] = clip.frames.map((fr) => ({
    index: fr.index,
    original: byIndex.get(fr.index) ?? fr.result.image,
    reconstructed: fr.result.image,
    authorizedAlpha: fr.result.authorizedAlpha,
  }));
  const first = clip.frames[0]?.result.image;
  return videoQaInputFromFrames({
    frames,
    mp4,
    width: first?.width,
    height: first?.height,
    provenance: {
      projectId: clip.projectId,
      masterClipAssetId: clip.masterClipAssetId,
      reconstructionVersion: clip.adapterVersion,
      source: "reconstruct_clip",
    },
  });
}

/** H: after runReconstructE2e + optional MP4 encode, call this then evaluateVideoQa. */
export function videoQaInputFromReconstructE2e(
  e2e: ReconstructE2eOk,
  mp4?: VideoQaMp4Ref,
): VideoQaInput {
  const input = videoQaInputFromReconstructClip(e2e.clip, e2e.originalFrames, mp4);
  return {
    ...input,
    provenance: {
      ...input.provenance,
      projectId: e2e.projectId,
      masterClipAssetId: e2e.masterClipAssetId,
      reconstructionVersion: e2e.e2eVersion,
      temporalJobCount: e2e.temporalJobCount,
      source: e2e.source,
    },
  };
}
