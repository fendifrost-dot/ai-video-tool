/**
 * Playable reconstruct compose — media + intended SAM-3 + full-clip temporal
 * + original-master reconstruct. $0 / no Grok / no SAM-3 fetch / no new edge.
 */

import { reconstructMasterClip, type ConsumedSam3Mask, type ReconstructClipResult } from "../adapters";
import {
  DEFAULT_CHEST_STILL_GATE,
  DEFAULT_SLEEVE_STILL_GATE,
  evaluateReconstructLiveWiring,
  type ReconstructLiveWiringDecision,
} from "../liveWiring";
import type { MasterClipFrame } from "../adapters";
import type { PlayableClipSpec, PlayableMediaKind, Sam3Provenance } from "./contract";
import { PLAYABLE_RECONSTRUCT_VERSION } from "./contract";
import { buildPlayableMediaPack, type PlayableMediaPack } from "./mediaPack";
import { consumeIntendedSam3 } from "./sam3Consume";
import { lumaFramesToSourceClip, propagatePlayableClip } from "./temporalFullClip";
import { canonicalPlayableSpec } from "./spec";

export type PlayableComposeOk = {
  ok: true;
  playableVersion: typeof PLAYABLE_RECONSTRUCT_VERSION;
  spec: PlayableClipSpec;
  mediaKind: PlayableMediaKind;
  paidCalls: false;
  grokPerFrame: false;
  sam3LiveFetch: false;
  provider: "none";
  edgeFunction: null;
  explicitArm: true;
  width: number;
  height: number;
  frameCount: number;
  fps: number;
  durationSec: number;
  temporalJobCount: number;
  temporalFramesUsed: number;
  originalFrames: MasterClipFrame[];
  clip: ReconstructClipResult;
  sam3: Sam3Provenance;
  sam3Mask: ConsumedSam3Mask;
  decision: ReconstructLiveWiringDecision;
};

export type PlayableComposeFail = {
  ok: false;
  playableVersion: typeof PLAYABLE_RECONSTRUCT_VERSION;
  paidCalls: false;
  grokPerFrame: false;
  sam3LiveFetch: false;
  provider: "none";
  edgeFunction: null;
  error: string;
  code: string;
  message: string;
  decision?: ReconstructLiveWiringDecision;
  sam3?: Sam3Provenance;
};

export type PlayableComposeResult = PlayableComposeOk | PlayableComposeFail;

export type RunPlayableComposeInput = {
  explicitArm?: boolean;
  spec?: PlayableClipSpec;
  media?: PlayableMediaPack;
  mediaKind?: PlayableMediaKind;
};

function fail(
  code: string,
  message: string,
  extra?: { decision?: ReconstructLiveWiringDecision; sam3?: Sam3Provenance },
): PlayableComposeFail {
  return {
    ok: false,
    playableVersion: PLAYABLE_RECONSTRUCT_VERSION,
    paidCalls: false,
    grokPerFrame: false,
    sam3LiveFetch: false,
    provider: "none",
    edgeFunction: null,
    error: code,
    code,
    message,
    decision: extra?.decision,
    sam3: extra?.sam3,
  };
}

/**
 * Authorize → ingest 720×1280 pack → intended SAM-3 → in-lib temporal →
 * reconstruct onto original-master frames. Never calls Grok / Fal / SAM-3 / a new edge.
 */
export function runPlayableCompose(input: RunPlayableComposeInput = {}): PlayableComposeResult {
  const explicitArm = input.explicitArm === true;
  const decision = evaluateReconstructLiveWiring({
    chestGate: DEFAULT_CHEST_STILL_GATE,
    sleeveGate: DEFAULT_SLEEVE_STILL_GATE,
    explicitArm,
  });
  if (!decision.allowed) {
    const code = decision.waitingFor[0] ?? "live_wiring_not_armed";
    return fail(code, decision.reasons[0] ?? "playable reconstruct is not authorized", {
      decision,
    });
  }

  const spec = input.spec ?? canonicalPlayableSpec();
  const pack = input.media ?? buildPlayableMediaPack(spec, input.mediaKind);
  if (pack.spec.width !== spec.width || pack.spec.height !== spec.height) {
    return fail("playable_size_mismatch", "media pack size does not match spec", { decision });
  }
  if (pack.originalFrames.length !== spec.frameCount) {
    return fail("playable_frame_count_mismatch", "media pack frameCount does not match spec", {
      decision,
    });
  }

  const sam3 = consumeIntendedSam3({
    width: spec.width,
    height: spec.height,
    required: true,
  });
  if (!sam3.ok) {
    return fail(sam3.code, sam3.message, { decision, sam3: sam3.provenance });
  }

  let temporalJobs;
  try {
    const clip = lumaFramesToSourceClip(spec.masterClipAssetId, spec.fps, pack.lumaFrames);
    temporalJobs = propagatePlayableClip({
      clip,
      canonicalIndex: spec.keyframeIndex,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "playable_temporal_failed";
    return fail("playable_temporal_failed", message, { decision, sam3: sam3.provenance });
  }

  try {
    const reconstructed = reconstructMasterClip({
      originalFrames: pack.originalFrames,
      chestStill: pack.chestStill,
      sleeveStill: pack.sleeveStill,
      sam3: sam3.mask,
      temporalJobs,
      projectId: spec.projectId,
      masterClipAssetId: spec.masterClipAssetId,
      clipId: spec.masterClipAssetId,
    });
    const temporalFramesUsed = reconstructed.frames.filter((f) => f.temporalUsed).length;
    return {
      ok: true,
      playableVersion: PLAYABLE_RECONSTRUCT_VERSION,
      spec,
      mediaKind: pack.mediaKind,
      paidCalls: false,
      grokPerFrame: false,
      sam3LiveFetch: false,
      provider: "none",
      edgeFunction: null,
      explicitArm: true,
      width: spec.width,
      height: spec.height,
      frameCount: reconstructed.frames.length,
      fps: spec.fps,
      durationSec: spec.durationSec,
      temporalJobCount: temporalJobs.length,
      temporalFramesUsed,
      originalFrames: pack.originalFrames,
      clip: reconstructed,
      sam3: sam3.provenance,
      sam3Mask: sam3.mask,
      decision,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "reconstruct_failed";
    return fail("reconstruct_failed", message, { decision, sam3: sam3.provenance });
  }
}
